import test from "node:test";
import assert from "node:assert/strict";
import { mergeRecentMessages, type V9MailMessage } from "../netlify/functions/mail-v9-core.mts";

function msg(id:string,date:string,messageId:string,folder="INBOX"):V9MailMessage{
  return {id,uid:Number(id.replace(/\D/g,""))||1,uidValidity:"1",folder,direction:folder==="INBOX"?"in":"out",date,from:"a@example.com",to:"b@example.com",subject:"Encomenda",messageId,inReplyTo:"",references:[],text:"1 cx alface",flags:[]};
}

test("deduplica duas cópias físicas com o mesmo Message-ID",()=>{
  const a=msg("uid1","2026-09-10T07:00:00Z","<same@example>","Sent");
  const b=msg("uid2","2026-09-10T07:00:01Z","<same@example>","Sent");
  const merged=mergeRecentMessages([a],[b],20);
  assert.equal(merged.length,1);
  assert.equal(merged[0].id,"uid2");
});

test("mensagens sem Message-ID continuam distintas pelo UID",()=>{
  const merged=mergeRecentMessages([], [msg("uid1","2026-09-10T07:00:00Z",""),msg("uid2","2026-09-10T07:01:00Z","")],20);
  assert.equal(merged.length,2);
});

test("mantém apenas a janela recente pedida",()=>{
  const list=Array.from({length:10},(_,i)=>msg(`uid${i+1}`,`2026-09-10T07:${String(i).padStart(2,"0")}:00Z`,`<m${i}@example>`));
  const merged=mergeRecentMessages([],list,4);
  assert.equal(merged.length,4);
  assert.equal(merged[0].messageId,"<m9@example>");
  assert.equal(merged[3].messageId,"<m6@example>");
});

test("merge é idempotente quando a mesma janela é lida outra vez",()=>{
  const list=[msg("uid1","2026-09-10T07:00:00Z","<m1@example>"),msg("uid2","2026-09-10T07:01:00Z","<m2@example>")];
  const once=mergeRecentMessages([],list,20);
  const twice=mergeRecentMessages(once,list,20);
  assert.deepEqual(twice,once);
});
