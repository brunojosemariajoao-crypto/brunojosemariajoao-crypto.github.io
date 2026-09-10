import test from "node:test";
import assert from "node:assert/strict";
import { cleanCurrentMailText } from "../netlify/functions/mail-text.mts";
import { AI_SIGNATURE_COPY, AI_SIGNATURE_TITLE, formatManagedEmail, managedText } from "../netlify/functions/ai-email-format.mts";

test("remove encomenda antiga citada num RE em português",()=>{
  const body=`Afinal acrescentem 2 molhos de salsa\n\nEm segunda-feira, 7 de setembro, Loja escreveu:\n1 cx alface\n6 molhos nabiças`;
  const clean=cleanCurrentMailText(body);
  assert.equal(clean,"Afinal acrescentem 2 molhos de salsa");
  assert.equal(clean.includes("6 molhos nabiças"),false);
});

test("remove histórico Outlook De/Enviado/Para/Assunto",()=>{
  const body=`Boa tarde, passa para 1 cx de alface.\n\nDe: Loja 4 <loja4@example.com>\nEnviado: segunda-feira, 7 de setembro de 2026 15:20\nPara: geral@vitalveg.pt\nAssunto: Encomenda\n\n4 cx alface\n6 molhos nabiças`;
  const clean=cleanCurrentMailText(body);
  assert.equal(clean,"Boa tarde, passa para 1 cx de alface.");
  assert.equal(clean.includes("4 cx alface"),false);
});

test("remove linhas citadas com > sem apagar a mensagem atual",()=>{
  const body=`Bom dia, fica só 1 cx de alface.\n> 4 cx alface\n> 6 molhos nabiças`;
  const clean=cleanCurrentMailText(body);
  assert.equal(clean,"Bom dia, fica só 1 cx de alface.");
});

test("assinatura de IA é sempre acrescentada ao texto",()=>{
  const text=managedText("Confirmamos a receção da encomenda.");
  assert.match(text,/Confirmamos a receção/);
  assert.match(text,new RegExp(AI_SIGNATURE_TITLE.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
  assert.match(text,new RegExp(AI_SIGNATURE_COPY.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
});

test("assinatura não é duplicada se o rascunho já a tiver",()=>{
  const once=managedText("Bom dia.\n\n—\n"+AI_SIGNATURE_TITLE+"\n"+AI_SIGNATURE_COPY);
  assert.equal(once.split(AI_SIGNATURE_TITLE).length-1,1);
});

test("versão HTML escapa conteúdo e mostra identificação IA",()=>{
  const result=formatManagedEmail("Produto <especial> & confirmação");
  assert.match(result.html,/Produto &lt;especial&gt; &amp; confirmação/);
  assert.match(result.html,/Central Inteligente de Comunicações/);
  assert.equal(result.html.includes("<especial>"),false);
});
