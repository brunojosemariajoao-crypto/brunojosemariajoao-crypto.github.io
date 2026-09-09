import type { Config, Context } from "@netlify/functions";
import { createHash } from "node:crypto";
import { analyzeConversation, requestFingerprint } from "./ai-core.mts";
import { consolidateOrder, resolveDeliveryDate, type AiAnalysis, type OrderEvent, type OrderRecord } from "./order-engine.mts";
import { decideAutonomy } from "./autonomy-core.mts";
import { appendActivity, findOpenOrderForCustomer, getAnalysis, getAutonomyPolicy, saveAnalysis, saveOrder, upsertQueueItem } from "./ai-store.mts";

function json(body:any,status=200){return Response.json(body,{status,headers:{"Cache-Control":"no-store"}});}
function cleanAddress(value:string){
  const s=String(value||"");
  const angled=s.match(/<([^>]+)>/); if(angled)return angled[1].trim().toLowerCase();
  const plain=s.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i); return plain?plain[0].toLowerCase():"";
}
function threadHash(threadKey:string){return createHash("sha256").update(threadKey).digest("hex").slice(0,18);}
function latestInbound(messages:any[]){
  return [...messages].filter(m=>m?.direction!=="out").sort((a,b)=>new Date(a.date||0).getTime()-new Date(b.date||0).getTime()).at(-1) ||
    [...messages].sort((a,b)=>new Date(a.date||0).getTime()-new Date(b.date||0).getTime()).at(-1);
}
function queueId(threadKey:string,fingerprint:string){return `q_${threadHash(threadKey)}_${fingerprint.slice(0,12)}`;}

export default async (req:Request, context:Context)=>{
  if(req.method!=="POST")return json({error:"Método não permitido"},405);
  let body:any={}; try{body=await req.json();}catch{return json({error:"Pedido inválido"},400);}
  const messages=Array.isArray(body?.messages)?body.messages:[];
  const threadKey=String(body?.threadKey||"").trim();
  if(!threadKey||!messages.length)return json({error:"Faltam threadKey ou mensagens"},400);

  try{
    const input={messages,knownCustomer:body.knownCustomer||null,deliveryDays:[2,4,6],cutoff:"14:00"};
    const fingerprint=requestFingerprint(input);
    const cached:any=await getAnalysis(fingerprint);
    const aiResult:any=cached?.analysis?cached:await analyzeConversation(input);
    if(!cached)await saveAnalysis(fingerprint,aiResult);

    const analysis:AiAnalysis=aiResult.analysis;
    const latest=latestInbound(messages);
    const receivedAt=String(latest?.date||new Date().toISOString());
    const sourceMessageId=String(latest?.messageId||latest?.id||analysis.sourceMessageIds?.at(-1)||threadKey);
    if(!analysis.customerEmail)analysis.customerEmail=cleanAddress(String(latest?.from||""))||null;

    let order:OrderRecord|null=null;
    if(analysis.orderAction!=="none"){
      let existing:OrderRecord|null=null;
      if(analysis.orderAction!=="create")existing=await findOpenOrderForCustomer(analysis.customerEmail);
      const event:OrderEvent={receivedAt,sourceMessageId,analysis};
      order=consolidateOrder([event],existing,new Date());
      if(order)await saveOrder(order);
    }

    const policy=await getAutonomyPolicy();
    const autonomy=decideAutonomy(analysis,order,policy);
    let queueItem:any=null;
    if(autonomy.mode==="review"||autonomy.mode==="await_approval"){
      queueItem=await upsertQueueItem({
        id:queueId(threadKey,fingerprint),
        threadKey,
        orderId:order?.id||null,
        kind:autonomy.mode==="review"?"review":"approval",
        title:analysis.customerName||analysis.storeName||analysis.customerEmail||"Mensagem recebida",
        summary:analysis.threadSummary||analysis.threadIntent||analysis.messageType,
        reasons:[...new Set([...(analysis.reviewReasons||[]),...(autonomy.reasons||[])])],
        suggestedReply:analysis.suggestedReply||null,
        analysisFingerprint:fingerprint
      });
    }

    await appendActivity("ai_processed",{
      threadKey,
      fingerprint,
      messageType:analysis.messageType,
      confidence:analysis.confidence,
      orderId:order?.id||null,
      orderNumber:order?.number||null,
      autonomyMode:autonomy.mode,
      queueItemId:queueItem?.id||null
    });

    const deliveryPreview=analysis.orderAction==="create"?resolveDeliveryDate(receivedAt,analysis.deliveryDateExplicit):null;
    return json({ok:true,analysis,order,autonomy,queueItem,deliveryPreview,fingerprint,model:aiResult.model||null});
  }catch(error:any){
    const message=String(error?.message||"Não foi possível processar a conversa");
    const configError=/OPENAI_API_KEY|OPENAI_MODEL/.test(message);
    return json({error:message,code:configError?"AI_NOT_CONFIGURED":"AI_PROCESS_FAILED"},configError?503:502);
  }
};

export const config:Config={path:"/api/ai/process"};
