import test from "node:test";
import assert from "node:assert/strict";
import { learningRelevance, type LearningExample } from "../netlify/functions/ai-learning.mts";

function ex(overrides:Partial<LearningExample>={}):LearningExample{
  return {
    id:"e1",kind:"edited_reply",createdAt:"2026-09-10T10:00:00Z",customerEmail:"loja4@example.com",
    subject:"Encomenda Loja 4",sourceText:"1 cx alface e 6 molhos nabiças",messageType:"ENCOMENDA",
    aiDraft:"Confirmamos.",preferredReply:"Confirmamos a receção da encomenda.",guidance:null,sourceId:"q1",...overrides
  };
}

test("correção do mesmo cliente e assunto semelhante tem relevância alta",()=>{
  const score=learningRelevance(ex(),{customerEmail:"loja4@example.com",subject:"RE: Encomenda Loja 4",text:"acrescentar 2 molhos nabiças"});
  assert.ok(score>=10);
});

test("exemplo de outro cliente e tema diferente não é considerado relevante",()=>{
  const score=learningRelevance(ex({customerEmail:"outro@example.com",subject:"Pedido de fatura",sourceText:"Envie a fatura do mês"}),{customerEmail:"loja4@example.com",subject:"Encomenda",text:"2 cx couve coração"});
  assert.ok(score<2);
});

test("feedback de sombra semelhante pode ser recuperado mesmo sem coincidir o cliente",()=>{
  const score=learningRelevance(ex({kind:"shadow_feedback",customerEmail:"outro@example.com",subject:"Disponibilidade nabiças",sourceText:"Tem nabiças disponíveis?",guidance:"Não prometer disponibilidade sem confirmação.",preferredReply:null}),{customerEmail:"cliente2@example.com",subject:"Disponibilidade nabiças",text:"Conseguem fornecer nabiças esta semana?"});
  assert.ok(score>=2);
});
