import { getStore } from "@netlify/blobs";
import { analyzeConversation, requestFingerprint } from "./ai-core.mts";
import { ensureSuggestedReply } from "./ai-reply-policy.mts";
import { saveShadowFeedbackLearning } from "./ai-learning.mts";
import { consolidateOrder, type AiAnalysis, type OrderEvent, type OrderRecord } from "./order-engine.mts";
import { decideAutonomy } from "./autonomy-core.mts";
import {
  findOpenOrderForCustomer,getAnalysis,getAutonomyPolicy,getOrder,getThreadOrderId,saveAnalysis
} from "./ai-store.mts";

const STORE_NAME="vitalveg-v9";
const PREFIX="shadow/evaluations/";
function store(){return getStore(STORE_NAME,{consistency:"strong"});}

export type ShadowVerdict="unreviewed"|"correct"|"partial"|"incorrect";
export type ShadowEvaluation={
  id:string;
  fingerprint:string;
  threadKey:string;
  evaluatedAt:string;
  sourceMessageId:string;
  sourceDate:string;
  sourceFrom:string;
  sourceTo:string;
  sourceText:string;
  subject:string;
  customerEmail:string|null;
  analysis:any;
  orderPreview:OrderRecord|null;
  autonomyPreview:any;
  wouldDo:"ignore"|"request_review"|"prepare_reply"|"would_auto_send";
  model:string|null;
  escalated:boolean;
  disagreement:boolean;
  verdict:ShadowVerdict;
  feedback:string|null;
  reviewedAt:string|null;
};

function cleanAddress(value:string){
  const s=String(value||"");
  const angled=s.match(/<([^>]+)>/);if(angled)return angled[1].trim().toLowerCase();
  const plain=s.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i);return plain?plain[0].toLowerCase():"";
}
function latestInbound(messages:any[]){
  return [...messages].filter(m=>m?.direction!=="out")
    .sort((a,b)=>new Date(a?.date||0).getTime()-new Date(b?.date||0).getTime()).at(-1)||null;
}
function keyFor(fp:string){return `${PREFIX}${fp}.json`;}
function wouldDoFor(mode:string){
  if(mode==="review")return "request_review" as const;
  if(mode==="await_approval")return "prepare_reply" as const;
  if(mode==="auto_execute")return "would_auto_send" as const;
  return "ignore" as const;
}

export async function evaluateShadowConversation(input:{threadKey:string;messages:any[];knownCustomer?:any;force?:boolean}){
  const threadKey=String(input?.threadKey||"").trim();
  const messages=Array.isArray(input?.messages)?input.messages:[];
  if(!threadKey||!messages.length)throw new Error("Faltam threadKey ou mensagens");
  const latest=latestInbound(messages);
  if(!latest)throw new Error("A conversa não contém mensagem recebida");

  const analysisInput={messages,knownCustomer:input.knownCustomer||null,deliveryDays:[2,4,6],cutoff:"14:00"};
  const fingerprint=requestFingerprint(analysisInput);
  if(!input.force){
    const existing:any=await store().get(keyFor(fingerprint),{type:"json"});
    if(existing)return {...existing,alreadyEvaluated:true};
  }

  const cached:any=await getAnalysis(fingerprint);
  const aiResult:any=cached?.analysis?cached:await analyzeConversation(analysisInput);
  if(!cached)await saveAnalysis(fingerprint,aiResult);
  const analysis:AiAnalysis=ensureSuggestedReply(aiResult.analysis) as AiAnalysis;
  if(!analysis.customerEmail)analysis.customerEmail=cleanAddress(String(latest?.from||""))||null;

  const sourceMessageId=String(latest?.messageId||latest?.id||analysis.sourceMessageIds?.at(-1)||threadKey);
  const receivedAt=String(latest?.date||new Date().toISOString());
  let orderPreview:OrderRecord|null=null;
  if(analysis.orderAction!=="none"){
    let existingOrder:OrderRecord|null=null;
    const linked=await getThreadOrderId(threadKey);
    if(linked)existingOrder=await getOrder(linked);
    if(!existingOrder && analysis.orderAction!=="create")existingOrder=await findOpenOrderForCustomer(analysis.customerEmail);
    const event:OrderEvent={receivedAt,sourceMessageId,analysis};
    orderPreview=consolidateOrder([event],existingOrder,new Date());
  }

  const policy=await getAutonomyPolicy();
  const autonomyPreview=decideAutonomy(analysis,orderPreview,policy);
  const evaluation:ShadowEvaluation={
    id:`shadow_${fingerprint.slice(0,16)}`,
    fingerprint,threadKey,evaluatedAt:new Date().toISOString(),sourceMessageId,
    sourceDate:receivedAt,sourceFrom:String(latest?.from||""),sourceTo:String(latest?.to||""),
    sourceText:String(latest?.text||"").slice(0,12000),subject:String(latest?.subject||"(sem assunto)"),
    customerEmail:analysis.customerEmail||null,analysis,orderPreview,autonomyPreview,
    wouldDo:wouldDoFor(autonomyPreview.mode),model:aiResult.model||null,
    escalated:!!aiResult.escalated,disagreement:!!aiResult.disagreement,
    verdict:"unreviewed",feedback:null,reviewedAt:null
  };
  await store().setJSON(keyFor(fingerprint),evaluation);
  return evaluation;
}

export async function listShadowEvaluations(limit=100):Promise<ShadowEvaluation[]>{
  const listed:any=await store().list({prefix:PREFIX});
  const keys=(listed?.blobs||[]).map((x:any)=>x.key).slice(0,Math.max(1,limit*3));
  const values=(await Promise.all(keys.map((k:string)=>store().get(k,{type:"json"})))).filter(Boolean) as ShadowEvaluation[];
  return values.sort((a,b)=>String(b.evaluatedAt).localeCompare(String(a.evaluatedAt))).slice(0,limit);
}

export async function getShadowEvaluation(fingerprint:string){
  return await store().get(keyFor(fingerprint),{type:"json"}) as ShadowEvaluation|null;
}

export async function reviewShadowEvaluation(fingerprint:string,verdict:ShadowVerdict,feedback=""){
  if(!["correct","partial","incorrect"].includes(verdict))throw new Error("Avaliação inválida");
  const current=await getShadowEvaluation(fingerprint);
  if(!current)throw new Error("Avaliação sombra não encontrada");
  const cleanFeedback=String(feedback||"").trim().slice(0,1200);
  const next={...current,verdict,feedback:cleanFeedback||null,reviewedAt:new Date().toISOString()};
  await store().setJSON(keyFor(fingerprint),next);

  if((verdict==="partial"||verdict==="incorrect") && cleanFeedback){
    try{
      await saveShadowFeedbackLearning({
        fingerprint,
        customerEmail:current.customerEmail,
        subject:current.subject,
        sourceText:current.sourceText,
        messageType:current.analysis?.messageType||null,
        aiDraft:current.analysis?.suggestedReply||null,
        verdict,
        feedback:cleanFeedback
      });
    }catch(error:any){
      console.error("VitalVeg shadow learning save failed:",String(error?.message||error));
    }
  }
  return next;
}

export function summarizeShadow(evaluations:ShadowEvaluation[]){
  const reviewed=evaluations.filter(x=>x.verdict!=="unreviewed");
  const correct=reviewed.filter(x=>x.verdict==="correct").length;
  const partial=reviewed.filter(x=>x.verdict==="partial").length;
  const incorrect=reviewed.filter(x=>x.verdict==="incorrect").length;
  const safeScore=reviewed.length?Math.round(((correct+partial*0.5)/reviewed.length)*100):null;
  return {total:evaluations.length,unreviewed:evaluations.length-reviewed.length,reviewed:reviewed.length,correct,partial,incorrect,safeScore};
}
