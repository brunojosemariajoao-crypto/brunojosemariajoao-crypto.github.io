import test from "node:test";
import assert from "node:assert/strict";
import { buildPreparationSummary } from "../netlify/functions/preparation-core.mts";

function order(id:string,items:any[],status="confirmed",deliveryDate="2026-09-12"){
  return {id,number:`VV-${id}`,customerName:id,customerEmail:`${id}@example.com`,storeName:id,deliveryDate,deliverySource:"rule",status,items,reviewReasons:[],sourceMessageIds:[],createdAt:"2026-09-11T10:00:00Z",updatedAt:"2026-09-11T10:00:00Z"};
}
function item(quantity:any,unit:string,product:string,uncertain=false){
  return {key:`${product}|${unit}`,quantity,unit,product,normalizedProduct:product,notes:null,rawLine:`${quantity} ${unit} ${product}`,confidence:uncertain?.7:.99,uncertain,lastSourceMessageId:"m1"};
}

test("soma artigos iguais apenas quando unidade e interpretação são seguras",()=>{
  const s=buildPreparationSummary([
    order("loja1",[item(3,"cx","Alface")]),
    order("loja2",[item(5,"cx","Alface")])
  ] as any,"2026-09-12");
  assert.equal(s.orderCount,2);
  assert.equal(s.rows.length,1);
  assert.equal(s.rows[0].confirmedQuantity,8);
  assert.equal(s.rows[0].customerCount,2);
  assert.equal(s.rows[0].requiresReview,false);
});

test("uma linha incerta aparece mas não entra silenciosamente na soma confirmada",()=>{
  const s=buildPreparationSummary([
    order("loja1",[item(3,"molhos","Nabiças")]),
    order("loja2",[item(6,"molhos","Nabiças",true)])
  ] as any,"2026-09-12");
  const row=s.rows[0];
  assert.equal(row.confirmedQuantity,3);
  assert.equal(row.uncertainLineCount,1);
  assert.equal(row.requiresReview,true);
  assert.match(row.uncertainLines[0],/6 molhos Nabiças/);
});

test("produto desconhecido é mantido no resumo sem whitelist",()=>{
  const s=buildPreparationSummary([
    order("loja1",[item(2,"cx","Agrião exótico novo")])
  ] as any,"2026-09-12");
  assert.equal(s.rows[0].product,"Agrião exótico novo");
  assert.equal(s.rows[0].confirmedQuantity,2);
});

test("o mesmo produto em unidades diferentes não é misturado",()=>{
  const s=buildPreparationSummary([
    order("loja1",[item(2,"cx","Alface"),item(4,"un","Alface")])
  ] as any,"2026-09-12");
  assert.equal(s.rows.length,2);
  assert.deepEqual(s.rows.map(x=>x.unit).sort(),["cx","un"]);
});

test("quantidade não numérica fica visível para revisão e não é somada",()=>{
  const s=buildPreparationSummary([
    order("loja1",[item("meia caixa","cx","Couve coração")])
  ] as any,"2026-09-12");
  assert.equal(s.rows[0].confirmedQuantity,null);
  assert.equal(s.rows[0].nonNumericLineCount,1);
  assert.equal(s.rows[0].requiresReview,true);
});

test("canceladas, históricas e outras datas não contaminam a preparação",()=>{
  const s=buildPreparationSummary([
    order("ok",[item(2,"cx","Alface")]),
    order("cancelada",[item(99,"cx","Alface")],"cancelled"),
    order("historica",[item(99,"cx","Alface")],"historical"),
    order("outraData",[item(99,"cx","Alface")],"confirmed","2026-09-15")
  ] as any,"2026-09-12");
  assert.equal(s.orderCount,1);
  assert.equal(s.rows[0].confirmedQuantity,2);
});
