import type { Config, Context } from "@netlify/functions";
import { randomUUID } from "node:crypto";
import { verifyAppSession } from "./app-auth-core.mts";
import { displayOrderNumber, itemKey, stableOrderId, type OrderLine, type OrderRecord } from "./order-engine.mts";
import { appendActivity, getOrder, listOrders, saveOrder } from "./ai-store.mts";

function json(body:any,status=200){return Response.json(body,{status,headers:{"Cache-Control":"no-store"}});}
function validDate(value:string){return /^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(new Date(`${value}T12:00:00Z`).getTime());}
function cleanEmail(value:any){return String(value||"").trim().toLowerCase()||null;}
function makeLines(items:any[],source:string):OrderLine[]{
  return (items||[]).map((raw:any,index:number)=>{
    const product=String(raw?.product||"").trim();
    if(!product)throw new Error(`Falta o produto na linha ${index+1}`);
    const unit=String(raw?.unit||"").trim()||null;
    const quantity=typeof raw?.quantity==="number"?raw.quantity:String(raw?.quantity??"").trim()||null;
    const seed={product,normalizedProduct:String(raw?.normalizedProduct||product).trim()||null,unit};
    return {
      key:itemKey(seed),quantity,unit,product,normalizedProduct:seed.normalizedProduct,
      notes:String(raw?.notes||"").trim()||null,
      rawLine:String(raw?.rawLine||`${quantity??""} ${unit??""} ${product}`).trim(),
      confidence:1,uncertain:false,lastSourceMessageId:source
    };
  });
}

export default async (req:Request, context:Context)=>{
  if(!verifyAppSession(req))return json({error:"Sessão VitalVeg não autorizada"},401);

  if(req.method==="GET"){
    const url=new URL(req.url);
    const id=String(url.searchParams.get("id")||"").trim();
    if(id){const order=await getOrder(id);return order?json({ok:true,order}):json({error:"Encomenda não encontrada"},404);}
    const q=String(url.searchParams.get("q")||"").trim().toLowerCase();
    const deliveryDate=String(url.searchParams.get("deliveryDate")||"").trim();
    let orders=await listOrders(500);
    if(deliveryDate)orders=orders.filter(o=>o.deliveryDate===deliveryDate);
    if(q)orders=orders.filter(o=>[
      o.number,o.customerName,o.customerEmail,o.storeName,o.deliveryDate,
      ...o.items.flatMap(i=>[i.product,i.normalizedProduct,i.rawLine])
    ].some(v=>String(v||"").toLowerCase().includes(q)));
    return json({ok:true,orders});
  }

  if(req.method!=="POST")return json({error:"Método não permitido"},405);
  let body:any={};try{body=await req.json();}catch{return json({error:"Pedido inválido"},400);}
  const action=String(body?.action||"").trim();

  if(action==="create_manual"){
    try{
      const deliveryDate=String(body?.deliveryDate||"").trim();
      if(!validDate(deliveryDate))return json({error:"Indica uma data de entrega válida"},400);
      if(!Array.isArray(body?.items)||!body.items.length)return json({error:"A encomenda precisa de pelo menos um artigo"},400);
      const source=`manual:${randomUUID()}`;
      const now=new Date().toISOString();
      const customerEmail=cleanEmail(body?.customerEmail);
      const id=stableOrderId(customerEmail,deliveryDate,source);
      const order:OrderRecord={
        id,number:displayOrderNumber(id,deliveryDate),
        customerName:String(body?.customerName||"").trim()||null,
        customerEmail,
        storeName:String(body?.storeName||"").trim()||null,
        deliveryDate,deliverySource:"explicit",status:"confirmed",
        items:makeLines(body.items,source),reviewReasons:[],sourceMessageIds:[source],
        createdAt:now,updatedAt:now
      };
      await saveOrder(order);
      await appendActivity("manual_order_created",{orderId:id,orderNumber:order.number,deliveryDate,customerEmail,items:order.items});
      return json({ok:true,order},201);
    }catch(error:any){return json({error:String(error?.message||"Não foi possível criar a encomenda")},400);}
  }

  if(action==="edit_order"){
    const id=String(body?.orderId||"").trim();
    const order=await getOrder(id);
    if(!order)return json({error:"Encomenda não encontrada"},404);
    try{
      const before=JSON.parse(JSON.stringify(order));
      if(body.deliveryDate!==undefined){
        const d=String(body.deliveryDate||"").trim(); if(!validDate(d))return json({error:"Data de entrega inválida"},400);
        order.deliveryDate=d; order.deliverySource="explicit";
      }
      if(body.customerName!==undefined)order.customerName=String(body.customerName||"").trim()||null;
      if(body.customerEmail!==undefined)order.customerEmail=cleanEmail(body.customerEmail);
      if(body.storeName!==undefined)order.storeName=String(body.storeName||"").trim()||null;
      if(Array.isArray(body.items)){
        if(!body.items.length)return json({error:"A encomenda precisa de pelo menos um artigo"},400);
        order.items=makeLines(body.items,`manual-edit:${randomUUID()}`);
      }
      order.reviewReasons=[];
      if(order.status==="review"||order.status==="awaiting_approval")order.status="confirmed";
      order.updatedAt=new Date().toISOString();
      await saveOrder(order);
      await appendActivity("order_manually_edited",{orderId:id,orderNumber:order.number,before,after:order});
      return json({ok:true,order});
    }catch(error:any){return json({error:String(error?.message||"Não foi possível alterar a encomenda")},400);}
  }

  if(action==="update_status"){
    const id=String(body?.orderId||"").trim();
    const status=String(body?.status||"") as OrderRecord["status"];
    const allowed=["draft","awaiting_approval","review","confirmed","cancelled","historical"];
    if(!allowed.includes(status))return json({error:"Estado inválido"},400);
    const order=await getOrder(id);if(!order)return json({error:"Encomenda não encontrada"},404);
    const before=order.status;order.status=status;order.updatedAt=new Date().toISOString();await saveOrder(order);
    await appendActivity("order_status_changed",{orderId:id,orderNumber:order.number,before,after:status});
    return json({ok:true,order});
  }

  return json({error:"Ação não suportada"},400);
};

export const config:Config={path:"/api/orders"};
