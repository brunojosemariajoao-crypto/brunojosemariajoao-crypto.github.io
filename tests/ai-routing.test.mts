import test from "node:test";
import assert from "node:assert/strict";
import { criticalSignature, shouldEscalateAnalysis } from "../netlify/functions/ai-core.mts";

const clear:any={
  messageType:"ENCOMENDA",confidence:.99,needsHumanReview:false,reviewReasons:[],
  orderAction:"create",changeMode:"full_snapshot",deliveryDateExplicit:null,
  commercialRisk:"low",items:[{
    quantity:1,unit:"cx",product:"Alface",normalizedProduct:"alface",notes:null,
    confidence:.99,rawLine:"1 cx alface",operation:"set"
  }]
};

test("encomenda muito clara fica no modelo económico",()=>{
  assert.equal(shouldEscalateAnalysis(clear),false);
});

test("encomenda com confiança operacional menor sobe para segunda leitura",()=>{
  assert.equal(shouldEscalateAnalysis({...clear,confidence:.95}),true);
});

test("alteração desconhecida sobe para segunda leitura",()=>{
  assert.equal(shouldEscalateAnalysis({...clear,messageType:"ALTERACAO_ENCOMENDA",orderAction:"amend",changeMode:"unknown"}),true);
});

test("linha incerta sobe para segunda leitura",()=>{
  const uncertain={...clear,items:[{...clear.items[0],confidence:.70,operation:"unknown",rawLine:"4 olhos de nabiças"}]};
  assert.equal(shouldEscalateAnalysis(uncertain),true);
});

test("reclamação continua humana sem gastar uma segunda leitura só para a autorizar",()=>{
  const complaint={...clear,messageType:"PROBLEMA_RECLAMACAO",commercialRisk:"high",needsHumanReview:true,orderAction:"none",changeMode:"none",items:[]};
  assert.equal(shouldEscalateAnalysis(complaint),false);
});

test("assinatura crítica deteta mudança de quantidade",()=>{
  const other={...clear,items:[{...clear.items[0],quantity:2,rawLine:"2 cx alface"}]};
  assert.notEqual(criticalSignature(clear),criticalSignature(other));
});

test("assinatura crítica ignora diferenças apenas no texto explicativo",()=>{
  const other={...clear,threadSummary:"Outra explicação",suggestedReply:"Texto diferente"};
  assert.equal(criticalSignature(clear),criticalSignature(other));
});

test("assinatura crítica deteta mudança de operação numa alteração",()=>{
  const a={...clear,messageType:"ALTERACAO_ENCOMENDA",orderAction:"amend",changeMode:"delta",items:[{...clear.items[0],operation:"add"}]};
  const b={...a,items:[{...clear.items[0],operation:"set"}]};
  assert.notEqual(criticalSignature(a),criticalSignature(b));
});
