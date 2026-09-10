import test from "node:test";
import assert from "node:assert/strict";
import { ensureSuggestedReply, fallbackSuggestedReply } from "../netlify/functions/ai-reply-policy.mts";

test("pedido de informação nunca fica sem resposta sugerida",()=>{
  const analysis:any={messageType:"PEDIDO_INFORMACAO",suggestedReply:null};
  ensureSuggestedReply(analysis);
  assert.match(analysis.suggestedReply,/pedido de informação/i);
  assert.match(analysis.suggestedReply,/Voltaremos a contactá-lo/i);
});

test("resposta específica da IA tem prioridade sobre fallback",()=>{
  const analysis:any={messageType:"PEDIDO_INFORMACAO",suggestedReply:"Resposta específica ao cliente."};
  ensureSuggestedReply(analysis);
  assert.equal(analysis.suggestedReply,"Resposta específica ao cliente.");
});

test("marketing e sistema não recebem resposta automática de cortesia",()=>{
  assert.equal(fallbackSuggestedReply("PUBLICIDADE_MARKETING"),null);
  assert.equal(fallbackSuggestedReply("AUTOMATICO_SISTEMA"),null);
  assert.equal(fallbackSuggestedReply("SEM_ACAO"),null);
});

test("reclamação sem texto recebe apenas confirmação segura de receção",()=>{
  const analysis:any={messageType:"PROBLEMA_RECLAMACAO",suggestedReply:""};
  ensureSuggestedReply(analysis);
  assert.match(analysis.suggestedReply,/vamos analisar o assunto/i);
  assert.doesNotMatch(analysis.suggestedReply,/resolvido|garantimos|aceitamos/i);
});
