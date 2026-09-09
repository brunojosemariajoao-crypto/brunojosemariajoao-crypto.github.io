import test from "node:test";
import assert from "node:assert/strict";
import { consolidateOrder, resolveDeliveryDate } from "../netlify/functions/order-engine.mts";

const baseAnalysis:any={
  messageType:"ENCOMENDA",confidence:0.99,needsHumanReview:false,reviewReasons:[],
  customerName:"Cliente Teste",customerEmail:"cliente@example.com",storeName:"Loja Teste",
  threadIntent:"Nova encomenda",orderAction:"create",changeMode:"full_snapshot",
  deliveryDateExplicit:null,deliveryRequestText:null,items:[],availabilityMentions:[],
  commercialRisk:"low",complaintSummary:null,requestedAnswer:null,suggestedReply:"Confirmamos a receção.",
  threadSummary:"Nova encomenda clara.",sourceMessageIds:[]
};

const item=(quantity:any,unit:string,product:string,operation:any="set",confidence=.99)=>({
  quantity,unit,product,normalizedProduct:product.toLowerCase(),notes:null,confidence,
  rawLine:`${quantity} ${unit} ${product}`,operation
});

function event(date:string,analysis:any,id="m1"){return {receivedAt:date,sourceMessageId:id,analysis};}

test("segunda-feira resolve para terça-feira",()=>{
  const r=resolveDeliveryDate("2026-09-07T10:00:00Z",null);
  assert.equal(r.date,"2026-09-08"); assert.equal(r.needsReview,false);
});

test("quarta-feira resolve para quinta-feira",()=>{
  const r=resolveDeliveryDate("2026-09-09T10:00:00Z",null);
  assert.equal(r.date,"2026-09-10");
});

test("sexta-feira resolve para sábado",()=>{
  const r=resolveDeliveryDate("2026-09-11T10:00:00Z",null);
  assert.equal(r.date,"2026-09-12");
});

test("próprio dia antes das 14h fica para revisão",()=>{
  const r=resolveDeliveryDate("2026-09-10T12:00:00Z",null); // 13:00 em Lisboa
  assert.equal(r.date,"2026-09-10"); assert.equal(r.needsReview,true);
});

test("próprio dia depois das 14h passa para a próxima entrega",()=>{
  const r=resolveDeliveryDate("2026-09-10T14:00:00Z",null); // 15:00 em Lisboa
  assert.equal(r.date,"2026-09-12"); assert.equal(r.needsReview,false);
});

test("data explícita tem prioridade",()=>{
  const r=resolveDeliveryDate("2026-09-09T10:00:00Z","2026-09-19");
  assert.equal(r.date,"2026-09-19"); assert.equal(r.source,"explicit");
});

test("produto desconhecido é preservado sem whitelist",()=>{
  const a={...baseAnalysis,items:[item(2,"cx","Agrião exótico novo")]};
  const o=consolidateOrder([event("2026-09-09T10:00:00Z",a)],null,new Date("2026-09-09T12:00:00Z"));
  assert.ok(o); assert.equal(o!.items.length,1); assert.equal(o!.items[0].product,"Agrião exótico novo");
});

test("linha de nabiças não desaparece da encomenda",()=>{
  const a={...baseAnalysis,items:[item(1,"cx","Alface"),item(6,"molhos","Nabiças"),item(4,"covetes","Tomate cherry"),item(1,"cx","Couve coração")]};
  const o=consolidateOrder([event("2026-09-09T10:00:00Z",a)],null,new Date("2026-09-09T12:00:00Z"));
  assert.equal(o!.items.length,4);
  assert.equal(o!.items.find(x=>x.product==="Nabiças")?.quantity,6);
});

test("alteração delta soma em vez de substituir",()=>{
  const create={...baseAnalysis,items:[item(4,"covetes","Tomate cherry")]};
  const first=consolidateOrder([event("2026-09-09T09:00:00Z",create,"m1")],null,new Date("2026-09-09T10:00:00Z"))!;
  const amend={...baseAnalysis,messageType:"ALTERACAO_ENCOMENDA",orderAction:"amend",changeMode:"delta",items:[item(2,"covetes","Tomate cherry","add")]};
  const final=consolidateOrder([event("2026-09-09T11:00:00Z",amend,"m2")],first,new Date("2026-09-09T12:00:00Z"))!;
  assert.equal(final.items[0].quantity,6);
});

test("alteração 'passa para' usa set",()=>{
  const create={...baseAnalysis,items:[item(4,"cx","Alface")]};
  const first=consolidateOrder([event("2026-09-09T09:00:00Z",create,"m1")],null,new Date("2026-09-09T10:00:00Z"))!;
  const amend={...baseAnalysis,messageType:"ALTERACAO_ENCOMENDA",orderAction:"amend",changeMode:"delta",items:[item(1,"cx","Alface","set")]};
  const final=consolidateOrder([event("2026-09-09T11:00:00Z",amend,"m2")],first,new Date("2026-09-09T12:00:00Z"))!;
  assert.equal(final.items[0].quantity,1);
});

test("remoção de artigo retira apenas essa linha",()=>{
  const create={...baseAnalysis,items:[item(1,"cx","Alface"),item(6,"molhos","Nabiças")]};
  const first=consolidateOrder([event("2026-09-09T09:00:00Z",create,"m1")],null,new Date("2026-09-09T10:00:00Z"))!;
  const amend={...baseAnalysis,messageType:"ALTERACAO_ENCOMENDA",orderAction:"amend",changeMode:"delta",items:[item(6,"molhos","Nabiças","remove")]};
  const final=consolidateOrder([event("2026-09-09T11:00:00Z",amend,"m2")],first,new Date("2026-09-09T12:00:00Z"))!;
  assert.equal(final.items.length,1); assert.equal(final.items[0].product,"Alface");
});

test("linha ambígua é preservada e força revisão",()=>{
  const weird=item(4,"olhos","Nabiças","unknown",0.55);
  weird.rawLine="4 olhos de nabiças";
  const a={...baseAnalysis,needsHumanReview:true,reviewReasons:["Unidade invulgar"],items:[weird]};
  const o=consolidateOrder([event("2026-09-09T10:00:00Z",a)],null,new Date("2026-09-09T12:00:00Z"))!;
  assert.equal(o.items[0].rawLine,"4 olhos de nabiças"); assert.equal(o.items[0].uncertain,true); assert.equal(o.status,"review");
});

test("encomenda cuja entrega já passou fica histórica e não é reciclada",()=>{
  const a={...baseAnalysis,deliveryDateExplicit:"2026-09-08",items:[item(1,"cx","Alface")]};
  const o=consolidateOrder([event("2026-09-07T10:00:00Z",a)],null,new Date("2026-09-10T10:00:00Z"))!;
  assert.equal(o.deliveryDate,"2026-09-08"); assert.equal(o.status,"historical");
});
