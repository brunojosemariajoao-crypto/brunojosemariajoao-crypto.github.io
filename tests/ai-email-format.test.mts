import test from "node:test";
import assert from "node:assert/strict";
import { formatManagedEmail, managedText, AI_SIGNATURE_TITLE } from "../netlify/functions/ai-email-format.mts";

test("envio aprovado identifica a central IA sem divulgar fluxo interno",()=>{
  const r=formatManagedEmail("Boa tarde.\nConfirmamos a receção.","human");
  assert.match(r.text,/plataforma de Inteligência Artificial/i);
  assert.doesNotMatch(r.text,/supervisão humana|revista|validada antes do envio/i);
  assert.doesNotMatch(r.text,/enviada automaticamente/i);
  assert.match(r.html,/plataforma de Inteligência Artificial/i);
});

test("envio autónomo declara que foi enviado automaticamente",()=>{
  const r=formatManagedEmail("Confirmamos a receção da encomenda.","autonomy");
  assert.match(r.text,/enviada automaticamente/i);
  assert.match(r.text,/regras operacionais da VitalVeg/i);
  assert.doesNotMatch(r.text,/validada antes do envio/i);
});

test("envio de sistema tem texto próprio sem fingir validação humana",()=>{
  const r=formatManagedEmail("Mensagem operacional.","system");
  assert.match(r.text,/gerida pela Central Inteligente VitalVeg/i);
  assert.doesNotMatch(r.text,/validada antes do envio/i);
});

test("reformatar uma mensagem já assinada não duplica a assinatura",()=>{
  const once=managedText("Obrigado.","human");
  const twice=managedText(once,"human");
  const matches=twice.split(AI_SIGNATURE_TITLE).length-1;
  assert.equal(matches,1);
});
