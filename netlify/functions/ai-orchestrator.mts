import { createHash } from "node:crypto";
import { analyzeConversation, requestFingerprint } from "./ai-core.mts";
import { consolidateOrder, resolveDeliveryDate, type AiAnalysis, type OrderEvent, type OrderRecord } from "./order-engine.mts";
import { decideAutonomy } from "./autonomy-core.mts";
import {
  appendActivity, findOpenOrderForCustomer, getAnalysis, getAutonomyPolicy,
  getOrder, getProcessedResult, getThreadOrderId, saveAnalysis, saveOrder,
  saveProcessedResult, saveThreadOrderId, upsertQueueItem
} from "./ai-store.mts";

export type ProcessConversationInput={
  threadKey:string;
  messages:any[];
  knownCustomer?:any;
  force?:boolean;
};

function cleanAddress(value:string){
  const s=String(value||"");
  const angled=s.match(/<([^>]+)>/); if(angled)return angled[1].trim().toLowerCase();
  const plain=s.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i); return plain?plain[0].toLowerCase():"";
}
function threadHash(threadKey:string){return createHash("sha256").update(threadKey).digest("hex").slice(0,18);}
function latestInbound(messages:any[]){
  return [...messages]
    .filter(m=>m?.direction!=="out")
    .sort((a,b)=>new Date(a.date||0).getTime()-new Date(b.date||0).getTime()).at(-1) || null;
}
function queueId(threadKey:string,fingerprint:string){return `q_${threadHash(threadKey)}_${fingerprint.slice(0,12)}`;}
function replySubject(value:string){const s=String(value||"(sem assunto)").trim();return /^re\s*:/i.test(s)?s:`Re: ${s}`;}

export async function processConversation(input:ProcessConversationInput){
  const threadKey=String(input?.threadKey||"").trim();
  const messages=Array.isArray(input?.messages)?input.messages:[];
  if(!threadKey||!messages.length)throw new Error("Faltam threadKey ou mensagens");

  const analysisInput={messages,knownCustomer:input.knownCustomer||null,deliveryDays:[2,4,6],cutoff:"14:00"};
  const fingerprint=requestFingerprint(analysisInput);
  if(!input.force){
    const done:any=await getProcessedResult(fingerprint);
    if(done?.result)return {...done.result,alreadyProcessed:true};
  }

  const cached:any=await getAnalysis(fingerprint);
  const aiResult:any=cached?.analysis?cached:await analyzeConversation(analysisInput);
  if(!cached)await saveAnalysis(fingerprint,aiResult);

  const analysis:AiAnalysis=aiResult.analysis;
  const latest=latestInbound(messages);
  if(!latest)throw new Error("A conversa não contém mensagem recebida para processar");
  const receivedAt=String(latest?.date||new Date().toISOString());
  const sourceMessageId=String(latest?.messageId||latest?.id||analysis.sourceMessageIds?.at(-1)||threadKey);
  if(!analysis.customerEmail)analysis.customerEmail=cleanAddress(String(latest?.from||""))||null;

  let order:OrderRecord|null=null;
  if(analysis.orderAction!=="none"){
    let existing:OrderRecord|null=null;
    const linkedOrderId=await getThreadOrderId(threadKey);
    if(linkedOrderId)existing=await getOrder(linkedOrderId);
    if(!existing && analysis.orderAction!=="create")existing=await findOpenOrderForCustomer(analysis.customerEmail);

    const event:OrderEvent={receivedAt,sourceMessageId,analysis};
    order=consolidateOrder([event],existing,new Date());
    if(order){
      await saveOrder(order);
      await saveThreadOrderId(threadKey,order.id);
    }
  }

  const policy=await getAutonomyPolicy();
  const autonomy=decideAutonomy(analysis,order,policy);
  let queueItem:any=null;
  if(autonomy.mode==="review"||autonomy.mode==="await_approval"){
    const to=analysis.customerEmail||cleanAddress(String(latest?.from||""))||null;
    const references=[...(Array.isArray(latest?.references)?latest.references:[]),latest?.messageId].filter(Boolean).map(String);
    queueItem=await upsertQueueItem({
      id:queueId(threadKey,fingerprint),
      threadKey,
      orderId:order?.id||null,
      kind:autonomy.mode==="review"?"review":"approval",
      title:analysis.storeName||analysis.customerName||analysis.customerEmail||"Mensagem recebida",
      summary:analysis.threadSummary||analysis.threadIntent||analysis.messageType,
      reasons:[...new Set([...(analysis.reviewReasons||[]),...(autonomy.reasons||[])])],
      suggestedReply:analysis.suggestedReply||null,
      analysisFingerprint:fingerprint,
      to,
      subject:replySubject(String(latest?.subject||"")),
      inReplyTo:String(latest?.messageId||"")||null,
      references,
      sourceMessageId
    });
  }

  const deliveryPreview=analysis.orderAction==="create"?resolveDeliveryDate(receivedAt,analysis.deliveryDateExplicit):null;
  const result={
    ok:true,
    analysis,
    order,
    autonomy,
    queueItem,
    deliveryPreview,
    fingerprint,
    model:aiResult.model||null,
    sourceMessageId
  };

  await appendActivity("ai_processed",{
    threadKey,
    fingerprint,
    sourceMessageId,
    messageType:analysis.messageType,
    confidence:analysis.confidence,
    orderId:order?.id||null,
    orderNumber:order?.number||null,
    autonomyMode:autonomy.mode,
    queueItemId:queueItem?.id||null
  });
  await saveProcessedResult(fingerprint,{result});
  return result;
}
