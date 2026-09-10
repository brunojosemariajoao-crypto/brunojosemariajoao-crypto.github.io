import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_AI_OPERATION_MODE, enforceOperationModeDecision, requiredModeConfirmation, validAiOperationMode } from "../netlify/functions/ai-mode.mts";
import { summarizeShadow } from "../netlify/functions/ai-shadow-core.mts";

test("o funcionário digital nasce em modo Sombra",()=>{
  assert.equal(DEFAULT_AI_OPERATION_MODE,"shadow");
  assert.equal(validAiOperationMode("shadow"),true);
  assert.equal(validAiOperationMode("assist"),true);
  assert.equal(validAiOperationMode("autonomous"),true);
  assert.equal(validAiOperationMode("live"),false);
});

test("a passagem a Assistente e Autónomo exige frases diferentes",()=>{
  assert.equal(requiredModeConfirmation("shadow"),"");
  assert.equal(requiredModeConfirmation("assist"),"ATIVAR ASSISTENTE");
  assert.equal(requiredModeConfirmation("autonomous"),"ATIVAR FUNCIONARIO AUTONOMO");
});

test("modo Assistente rebaixa qualquer tentativa de autoexecução para aprovação",()=>{
  const d=enforceOperationModeDecision("assist",{mode:"auto_execute",canSend:true,reasons:["Política permitiria"]});
  assert.equal(d.mode,"await_approval");
  assert.equal(d.canSend,true);
  assert.ok(d.reasons.some((x:string)=>/aprovação humana/i.test(x)));
});

test("modo Sombra bloqueia todas as ações operacionais",()=>{
  const d=enforceOperationModeDecision("shadow",{mode:"auto_execute",canSend:true,reasons:[]});
  assert.equal(d.mode,"ignore");
  assert.equal(d.canSend,false);
  assert.ok(d.reasons.some((x:string)=>/Modo Sombra/i.test(x)));
});

test("modo Autónomo não altera uma decisão que a política autorizou",()=>{
  const original={mode:"auto_execute",canSend:true,reasons:["Autorizado"]};
  assert.equal(enforceOperationModeDecision("autonomous",original),original);
});

test("a qualidade sombra penaliza parcialmente os casos parciais",()=>{
  const rows:any[]=[
    {verdict:"correct"},{verdict:"correct"},{verdict:"partial"},{verdict:"incorrect"},{verdict:"unreviewed"}
  ];
  const s=summarizeShadow(rows as any);
  assert.equal(s.total,5);
  assert.equal(s.reviewed,4);
  assert.equal(s.unreviewed,1);
  assert.equal(s.correct,2);
  assert.equal(s.partial,1);
  assert.equal(s.incorrect,1);
  assert.equal(s.safeScore,63);
});
