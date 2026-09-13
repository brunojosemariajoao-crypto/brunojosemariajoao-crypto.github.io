import test from "node:test";
import assert from "node:assert/strict";
import { consolidateOrder, resolveDeliveryDate } from "../netlify/functions/order-engine.mts";
import { ensureSuggestedReply, fallbackSuggestedReply } from "../netlify/functions/ai-reply-policy.mts";
import { decideAutonomy, DEFAULT_AUTONOMY_POLICY } from "../netlify/functions/autonomy-core.mts";
import { buildMailThreads } from "../netlify/functions/thread-engine.mts";

const base:any={
  messageType:"ENCOMENDA",confidence:.99,needsHumanReview:false,reviewReasons:[],
  customerName:"Cliente",customerEmail:"cliente@example.com",storeName:"Loja 4",
  threadIntent:"Nova encomenda",orderAction:"create",changeMode:"full_snapshot",
  deliveryDateExplicit:null,deliveryRequestText:null,items:[],availabilityMentions:[],
  commercialRisk:"low",complaintSummary:null,requestedAnswer:null,suggestedReply:"Confirmamos a receção.",
  threadSummary:"Encomenda clara",sourceMessageIds:[]
};
const item=(q:any,u:string,p:string,operation:any="set",confidence=.99)=>({quantity:q,unit:u,product:p,normalizedProduct:p.toLowerCase(),notes:null,confidence,rawLine:`${q} ${u} ${p}`,operation});
const ev=(receivedAt:string,analysis:any,id:string)=>({receivedAt,analysis,sourceMessageId:id});

test("data explícita fora de terça/quinta/sábado é respeitada mas exige revisão",()=>{
  const r=resolveDeliveryDate("2026-09-09T10:00:00Z","2026-09-14"); // segunda
  assert.equal(r.date,"2026-09-14");
  assert.equal(r.source,"explicit");
  assert.equal(r.needsReview,true);
  assert.match(r.reason,/fora dos dias habituais/i);
});

test("data explícita num dia normal não ganha alerta extraordinário",()=>{
  const r=resolveDeliveryDate("2026-09-09T10:00:00Z","2026-09-15"); // terça
  assert.equal(r.date,"2026-09-15");
  assert.equal(r.needsReview,false);
});

test("uma encomenda explícita para segunda fica em revisão e não é deslocada para terça",()=>{
  const a={...base,deliveryDateExplicit:"2026-09-14",items:[item(1,"cx","Alface")]};
  const o=consolidateOrder([ev("2026-09-09T10:00:00Z",a,"m1")],null,new Date("2026-09-09T12:00:00Z"))!;
  assert.equal(o.deliveryDate,"2026-09-14");
  assert.equal(o.status,"review");
  assert.ok(o.reviewReasons.some(x=>/entrega extraordinária/i.test(x)));
});

test("pedido de informação nunca fica sem resposta sugerida",()=>{
  const a=ensureSuggestedReply({...base,messageType:"PEDIDO_INFORMACAO",orderAction:"none",changeMode:"none",suggestedReply:null});
  assert.ok(a.suggestedReply);
  assert.match(String(a.suggestedReply),/pedido de informação/i);
  assert.match(String(a.suggestedReply),/voltaremos a contactá-lo/i);
});

test("reclamação sem resposta específica recebe acusação segura e continua humana",()=>{
  const a:any=ensureSuggestedReply({...base,messageType:"PROBLEMA_RECLAMACAO",orderAction:"none",changeMode:"none",commercialRisk:"high",needsHumanReview:true,reviewReasons:["Reclamação"],suggestedReply:null});
  assert.ok(a.suggestedReply);
  const d=decideAutonomy(a,null,DEFAULT_AUTONOMY_POLICY);
  assert.equal(d.mode,"review");
  assert.equal(d.canSend,false);
});

test("publicidade não recebe resposta automática por defeito",()=>{
  assert.equal(fallbackSuggestedReply("PUBLICIDADE_MARKETING"),null);
});

test("agradecimento classificado sem ação não cria resposta nem encomenda",()=>{
  const a:any=ensureSuggestedReply({...base,messageType:"SEM_ACAO",orderAction:"none",changeMode:"none",suggestedReply:null});
  assert.equal(a.suggestedReply,null);
  const d=decideAutonomy(a,null,DEFAULT_AUTONOMY_POLICY);
  assert.equal(d.mode,"ignore");
});

test("encomenda clara no modo Assistente fica pronta para aprovação, nunca auto-enviada",()=>{
  const a={...base,items:[item(1,"cx","Alface")]};
  const o=consolidateOrder([ev("2026-09-09T10:00:00Z",a,"m1")],null,new Date("2026-09-09T12:00:00Z"))!;
  const d=decideAutonomy(a,o,{...DEFAULT_AUTONOMY_POLICY,level:1});
  assert.equal(d.mode,"await_approval");
  assert.equal(d.canSend,true);
});

test("linha de artigo incerta bloqueia qualquer autonomia",()=>{
  const a:any={...base,needsHumanReview:true,reviewReasons:["Linha duvidosa"],items:[item(4,"olhos","Nabiças","unknown",.55)]};
  const o=consolidateOrder([ev("2026-09-09T10:00:00Z",a,"m1")],null,new Date("2026-09-09T12:00:00Z"))!;
  const d=decideAutonomy(a,o,{...DEFAULT_AUTONOMY_POLICY,level:3,autoOrderReceiptConfirmation:true});
  assert.equal(d.mode,"review");
  assert.equal(d.canSend,false);
});

test("dois emails 'Encomenda' do mesmo cliente em ciclos diferentes não se misturam",()=>{
  const threads=buildMailThreads([
    {id:"a",messageId:"<a>",date:"2026-09-07T10:00:00Z",direction:"in",from:"cliente@example.com",subject:"Encomenda",text:"1 cx alface"},
    {id:"b",messageId:"<b>",date:"2026-09-09T10:00:00Z",direction:"in",from:"cliente@example.com",subject:"Encomenda",text:"2 cx couve"}
  ]);
  assert.equal(threads.length,2);
});

test("um RE técnico mantém a conversa mesmo atravessando o ciclo de entrega",()=>{
  const threads=buildMailThreads([
    {id:"a",messageId:"<a>",date:"2026-09-07T10:00:00Z",direction:"in",from:"cliente@example.com",subject:"Encomenda",text:"1 cx alface"},
    {id:"b",messageId:"<b>",inReplyTo:"<a>",references:["<a>"],date:"2026-09-09T10:00:00Z",direction:"in",from:"cliente@example.com",subject:"Re: Encomenda",text:"Afinal retire a alface"}
  ]);
  assert.equal(threads.length,1);
  assert.equal(threads[0].messages.length,2);
});

test("alteração full_snapshot substitui o pedido inteiro, não soma com o anterior",()=>{
  const first=consolidateOrder([ev("2026-09-09T09:00:00Z",{...base,items:[item(1,"cx","Alface"),item(6,"molhos","Nabiças")]},"m1")],null,new Date("2026-09-09T10:00:00Z"))!;
  const amend={...base,messageType:"ALTERACAO_ENCOMENDA",orderAction:"amend",changeMode:"full_snapshot",items:[item(2,"cx","Couve coração")]};
  const final=consolidateOrder([ev("2026-09-09T11:00:00Z",amend,"m2")],first,new Date("2026-09-09T12:00:00Z"))!;
  assert.equal(final.items.length,1);
  assert.equal(final.items[0].product,"Couve coração");
  assert.equal(final.items[0].quantity,2);
});
