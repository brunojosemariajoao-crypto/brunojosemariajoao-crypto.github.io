import {isInAnalysisWindow} from "./_shared/analysis-window.mts";
import { noticeContext,replyBlockReason,operationalReceipt } from "./_shared/operational-guards.mts";
import { createHash } from "node:crypto";
import { analyzeConversation, requestFingerprint } from "./ai-core.mts";
import { ensureSuggestedReply } from "./ai-reply-policy.mts";
import { getAiOperationMode } from "./ai-mode.mts";
import { consolidateOrder, resolveDeliveryDate, type AiAnalysis, type OrderEvent, type OrderRecord } from "./order-engine.mts";
import { decideAutonomy } from "./autonomy-core.mts";
import { executeManagedSend } from "./managed-send-core.mts";
import { sendPushToOperators } from "./push-core.mts";
import {
  appendActivity, findOpenOrderForCustomer, getAnalysis, getAutonomyPolicy, getJson,listOrders,supersedeThreadQueue,
  getOrder, getProcessedResult, getQueueItem, getThreadOrderId, saveAnalysis, saveOrder,
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
function sourceMessages(messages:any[]){
  return [...messages]
    .sort((a,b)=>new Date(a?.date||0).getTime()-new Date(b?.date||0).getTime())
    .slice(-12)
    .map(m=>({
      id:m?.id?String(m.id):null,
      messageId:m?.messageId?String(m.messageId):null,
      date:m?.date?String(m.date):null,
      direction:m?.direction==="out"?"out" as const:"in" as const,
      from:m?.from?String(m.from):null,
      to:m?.to?String(m.to):null,
      subject:m?.subject?String(m.subject):null,
      text:String(m?.text||"").slice(0,12000)
    }));
}

export async function processConversation(input:ProcessConversationInput){
  const threadKey=String(input?.threadKey||"").trim();
  const messages=Array.isArray(input?.messages)?input.messages:[];
  if(!threadKey||!messages.length)throw new Error("Faltam threadKey ou mensagens");
  if(!isInAnalysisWindow(messages))return {ok:true,ignored:true,order:null,reason:"Histórico anterior a 13/09/2026 encerrado pelo operador."};

  // Fail-safe: o orquestrador operacional nunca pode executar durante o modo Sombra.
  // O modo Sombra tem um caminho próprio que não grava encomendas nem cria envios.
  const operationMode=await getAiOperationMode();
  if(operationMode==="shadow")throw new Error("O modo Sombra não permite processamento operacional");

  const latest=latestInbound(messages);
  if(!latest)throw new Error("Sem mensagem recebida");
  const modeConfig:any=await getJson('config/ai-operation-mode.json');
  const replyBlock=replyBlockReason(messages,modeConfig?.updatedAt||null);
  const linked=await getThreadOrderId(threadKey);
  let existing:OrderRecord|null=linked?await getOrder(linked):null;
  const sender=cleanAddress(latest.from);
  if(!existing){
    const day=resolveDeliveryDate(latest.date,null).date;
    const candidates=(await listOrders(1000)).filter(o=>o.customerEmail===sender&&o.deliveryDate===day&&o.status!=='cancelled');
    if(candidates.length===1)existing=candidates[0];
  }
  const snapshot:any=await getJson('mail/v9-snapshot.json');
  const availabilityContext=noticeContext(snapshot?.messages||[],messages);
  const analysisInput={messages,knownCustomer:input.knownCustomer||null,deliveryDays:[2,4,6],cutoff:"14:00",availabilityContext,existingOrder:existing};
  const fingerprint=requestFingerprint(analysisInput);
  if(!input.force){
    const done:any=await getProcessedResult(fingerprint);
    if(done?.result)return {...done.result,alreadyProcessed:true};
  }

  const cached:any=await getAnalysis(fingerprint) || (replyBlock?await getAnalysis(requestFingerprint({messages})):null);
  const aiResult:any=cached?.analysis?cached:await analyzeConversation(analysisInput);
  if(!cached)await saveAnalysis(fingerprint,aiResult);

  const analysis:AiAnalysis=ensureSuggestedReply(aiResult.analysis) as AiAnalysis;

  const receivedAt=String(latest?.date||new Date().toISOString());
  const sourceMessageId=String(latest?.messageId||latest?.id||analysis.sourceMessageIds?.at(-1)||threadKey);
  analysis.customerEmail=sender||null;

  let order:OrderRecord|null=null;
  if(analysis.orderAction!=="none"){
    if(existing&&analysis.orderAction==='create'&&!existing.appliedEventIds?.includes(sourceMessageId)){
      analysis.orderAction='amend';
      analysis.needsHumanReview=true;
      analysis.reviewReasons.push('Já existe uma encomenda deste cliente para a data; confirmar a substituição para não duplicar o pedido.');
    }
    if(!existing&&analysis.orderAction==='amend'){
      analysis.needsHumanReview=true;
      analysis.reviewReasons.push('Não foi localizada uma encomenda original inequívoca para esta alteração.');
    }

    const event:OrderEvent={receivedAt,sourceMessageId,analysis};
    order=consolidateOrder([event],existing,new Date());
    if(order){
      await saveOrder(order);
      await appendActivity("order_revision",{orderId:order.id,before:existing,after:order,sourceMessageId});
      await saveThreadOrderId(threadKey,order.id);
    }
  }

  if(order&&!analysis.needsHumanReview&&analysis.orderAction!=='cancel')analysis.suggestedReply=operationalReceipt(order);
  await saveAnalysis(fingerprint,{...aiResult,analysis});
  await supersedeThreadQueue(threadKey,fingerprint);
  const policy=await getAutonomyPolicy();
  let autonomy=decideAutonomy(analysis,order,policy);
  if(operationMode!=="autonomous" && autonomy.mode==="auto_execute"){
    autonomy={
      ...autonomy,
      mode:"await_approval" as const,
      reasons:[...new Set([...(autonomy.reasons||[]),"O modo operacional é Assistente; qualquer envio exige aprovação humana."])]
    };
  }
  if(replyBlock&&autonomy.mode==='auto_execute')autonomy={mode:'ignore',canSend:false,reasons:[replyBlock]};
  let queueItem:any=null;
  let queueCreated=false;
  let autoSend:any=null;
  let autoSendError:string|null=null;

  if(["review","await_approval","auto_execute"].includes(autonomy.mode)){
    const to=analysis.customerEmail||cleanAddress(String(latest?.from||""))||null;
    const references=[...(Array.isArray(latest?.references)?latest.references:[]),latest?.messageId].filter(Boolean).map(String);
    const id=queueId(threadKey,fingerprint);
    queueCreated=!(await getQueueItem(id));
    queueItem=await upsertQueueItem({
      id,
      threadKey,
      orderId:order?.id||null,
      orderVersion:order?.updatedAt||null,
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
      sourceMessageId,
      sourceMessages:sourceMessages(messages)
    });
  }

  if(operationMode==="autonomous" && !replyBlock && autonomy.mode==="auto_execute" && queueItem?.suggestedReply){
    try{
      autoSend=await executeManagedSend(queueItem.id,queueItem.suggestedReply,"autonomy");
      if(autoSend?.order)order=autoSend.order;
    }catch(error:any){
      autoSendError=String(error?.message||"Falha no envio autónomo");
      queueItem=await upsertQueueItem({
        id:queueItem.id,
        threadKey:queueItem.threadKey,
        orderId:queueItem.orderId,
        kind:"review",
        title:queueItem.title,
        summary:queueItem.summary,
        reasons:[...new Set([...(queueItem.reasons||[]),`Falha na execução autónoma: ${autoSendError}`])],
        suggestedReply:queueItem.suggestedReply,
        analysisFingerprint:queueItem.analysisFingerprint,
        to:queueItem.to,
        subject:queueItem.subject,
        inReplyTo:queueItem.inReplyTo,
        references:queueItem.references||[],
        sourceMessageId:queueItem.sourceMessageId,
        sourceMessages:queueItem.sourceMessages||sourceMessages(messages)
      });
      await appendActivity("autonomy_failed",{threadKey,queueItemId:queueItem.id,error:autoSendError});
    }
  }

  if(queueCreated && queueItem && !autoSend){
    try{
      await sendPushToOperators({
        title:queueItem.kind==="review"?"VitalVeg · Precisa de ti":"VitalVeg · Resposta pronta",
        body:`${queueItem.title}: ${queueItem.summary}`.slice(0,180),
        url:`?open=${encodeURIComponent(queueItem.id)}`,
        tag:queueItem.id
      });
    }catch(error:any){
      await appendActivity("push_failed",{queueItemId:queueItem.id,error:String(error?.message||error)});
    }
  }

  const deliveryPreview=analysis.orderAction==="create"?resolveDeliveryDate(receivedAt,analysis.deliveryDateExplicit):null;
  const result={
    ok:true,
    operationMode,
    analysis,
    order,
    autonomy,
    queueItem,
    queueCreated,
    autoSend,
    autoSendError,
    deliveryPreview,
    fingerprint,
    model:aiResult.model||null,
    escalated:!!aiResult.escalated,
    disagreement:!!aiResult.disagreement,
    learningExamplesUsed:Number(aiResult.learningExamplesUsed||0),
    calls:aiResult.calls||[],
    sourceMessageId
  };

  await appendActivity("ai_processed",{
    threadKey,
    fingerprint,
    sourceMessageId,
    operationMode,
    messageType:analysis.messageType,
    confidence:analysis.confidence,
    orderId:order?.id||null,
    orderNumber:order?.number||null,
    autonomyMode:autonomy.mode,
    queueItemId:queueItem?.id||null,
    autoSent:!!autoSend,
    model:aiResult.model||null,
    escalated:!!aiResult.escalated,
    disagreement:!!aiResult.disagreement,
    learningExamplesUsed:Number(aiResult.learningExamplesUsed||0),
    usage:aiResult.calls||[]
  });
  await saveProcessedResult(fingerprint,{result});
  return result;
}
