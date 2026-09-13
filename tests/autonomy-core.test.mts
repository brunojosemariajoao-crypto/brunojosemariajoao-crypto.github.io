import test from "node:test";
import assert from "node:assert/strict";
import { decideAutonomy, DEFAULT_AUTONOMY_POLICY } from "../netlify/functions/autonomy-core.mts";

const analysis:any={messageType:"PEDIDO_CONFIRMACAO",confidence:.99,needsHumanReview:false,reviewReasons:[],suggestedReply:"Confirmamos a receção.",commercialRisk:"low"};
const order:any={status:"confirmed",items:[]};

test("nível 1 nunca envia sozinho",()=>{
  const d=decideAutonomy(analysis,order,{...DEFAULT_AUTONOMY_POLICY,level:1});
  assert.equal(d.mode,"await_approval");assert.equal(d.canSend,true);
});

test("nível 2 pode executar apenas tipo autorizado e alta confiança",()=>{
  const d=decideAutonomy(analysis,order,{...DEFAULT_AUTONOMY_POLICY,level:2,minAutoConfidence:.97});
  assert.equal(d.mode,"auto_execute");
});

test("baixa confiança trava autonomia",()=>{
  const d=decideAutonomy({...analysis,confidence:.91},order,{...DEFAULT_AUTONOMY_POLICY,level:2,minAutoConfidence:.97});
  assert.equal(d.mode,"await_approval");
});

test("risco comercial alto exige humano",()=>{
  const d=decideAutonomy({...analysis,commercialRisk:"high"},order,{...DEFAULT_AUTONOMY_POLICY,level:3});
  assert.equal(d.mode,"review");assert.equal(d.canSend,false);
});

test("linha incerta exige humano",()=>{
  const d=decideAutonomy(analysis,{...order,items:[{uncertain:true,confidence:.4}]},{...DEFAULT_AUTONOMY_POLICY,level:3});
  assert.equal(d.mode,"review");
});
