import test from "node:test";
import assert from "node:assert/strict";
import { buildMailThreads } from "../netlify/functions/thread-engine.mts";

const incoming=(id:string,date:string,subject="Encomenda")=>({id,messageId:`<${id}@cliente>`,date,direction:"in" as const,from:"Loja <loja@example.com>",to:"geral@vitalveg.pt",subject,text:"1 cx alface"});

test("encomendas semanais com o mesmo assunto não são fundidas",()=>{
  const threads=buildMailThreads([
    incoming("m1","2026-09-07T09:00:00Z"),
    incoming("m2","2026-09-14T09:00:00Z")
  ]);
  assert.equal(threads.length,2);
});

test("segunda e quarta com assunto Encomenda são ciclos diferentes",()=>{
  const threads=buildMailThreads([
    incoming("seg","2026-09-07T09:00:00Z"),
    incoming("qua","2026-09-09T09:00:00Z")
  ]);
  assert.equal(threads.length,2);
});

test("duas mensagens recebidas no mesmo ciclo podem formar a mesma conversa sem referências",()=>{
  const threads=buildMailThreads([
    incoming("m1","2026-09-07T09:00:00Z"),
    {...incoming("m2","2026-09-07T12:00:00Z"),text:"Afinal mais 2 molhos de salsa"}
  ]);
  assert.equal(threads.length,1);
  assert.equal(threads[0].messages.length,2);
});

test("sexta e sábado antes do corte pertencem ao mesmo ciclo de sábado",()=>{
  const threads=buildMailThreads([
    incoming("sex","2026-09-11T14:00:00Z"), // 15:00 Lisboa sexta -> sábado
    {...incoming("sab","2026-09-12T08:00:00Z"),text:"Mais 1 cx alface"}
  ]);
  assert.equal(threads.length,1);
});

test("nova mensagem depois do corte do dia de entrega abre novo ciclo",()=>{
  const threads=buildMailThreads([
    incoming("seg","2026-09-07T09:00:00Z"),
    incoming("terdepois","2026-09-08T14:30:00Z") // 15:30 Lisboa -> quinta
  ]);
  assert.equal(threads.length,2);
});

test("In-Reply-To mantém uma conversa ligada mesmo após vários dias",()=>{
  const first=incoming("m1","2026-09-07T09:00:00Z");
  const reply={id:"m2",messageId:"<m2@cliente>",inReplyTo:"<m1@cliente>",references:["<m1@cliente>"],date:"2026-09-14T09:00:00Z",direction:"in" as const,from:"Loja <loja@example.com>",to:"geral@vitalveg.pt",subject:"Re: Encomenda",text:"Afinal acrescentem 2 molhos de salsa"};
  const threads=buildMailThreads([first,reply]);
  assert.equal(threads.length,1);assert.equal(threads[0].messages.length,2);
});

test("resposta VitalVeg próxima entra na mesma conversa",()=>{
  const first=incoming("m1","2026-09-07T09:00:00Z");
  const sent={id:"s1",messageId:"<s1@vitalveg>",date:"2026-09-07T09:10:00Z",direction:"out" as const,from:"geral@vitalveg.pt",to:"Loja <loja@example.com>",subject:"Re: Encomenda",text:"Confirmamos a receção."};
  const threads=buildMailThreads([first,sent]);
  assert.equal(threads.length,1);assert.equal(threads[0].messages.length,2);
});

test("In-Reply-To tem prioridade sobre mudança de ciclo",()=>{
  const first=incoming("m1","2026-09-07T09:00:00Z");
  const lateReply={...incoming("m2","2026-09-09T10:00:00Z","Re: Encomenda"),inReplyTo:"<m1@cliente>",references:["<m1@cliente>"],text:"Era apenas para confirmar a entrega anterior"};
  const threads=buildMailThreads([first,lateReply]);
  assert.equal(threads.length,1);
});
