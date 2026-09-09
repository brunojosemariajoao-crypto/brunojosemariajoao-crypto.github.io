import { createHash, randomUUID } from "node:crypto";
import { getStore } from "@netlify/blobs";
import type { OrderRecord } from "./order-engine.mts";
import { DEFAULT_AUTONOMY_POLICY, type AutonomyPolicy } from "./autonomy-core.mts";

const STORE_NAME="vitalveg-v9";
function store(){return getStore(STORE_NAME,{consistency:"strong"});}
function threadId(threadKey:string){return createHash("sha256").update(threadKey).digest("hex").slice(0,24);}

export type QueueItem={
  id:string;
  threadKey:string;
  orderId:string|null;
  kind:"approval"|"review";
  title:string;
  summary:string;
  reasons:string[];
  suggestedReply:string|null;
  analysisFingerprint:string;
  to:string|null;
  subject:string|null;
  inReplyTo:string|null;
  references:string[];
  sourceMessageId:string|null;
  status:"open"|"approved"|"rejected"|"resolved";
  createdAt:string;
  updatedAt:string;
};

export async function getJson<T=any>(key:string):Promise<T|null>{
  return await store().get(key,{type:"json"}) as T|null;
}
export async function setJson(key:string,value:any){await store().setJSON(key,value);}
export async function remove(key:string){await store().delete(key);}

export async function saveAnalysis(fingerprint:string,value:any){
  await setJson(`analysis/${fingerprint}.json`,{...value,savedAt:new Date().toISOString()});
}
export async function getAnalysis(fingerprint:string){return getJson(`analysis/${fingerprint}.json`);}

export async function saveOrder(order:OrderRecord){await setJson(`orders/${order.id}.json`,order);}
export async function getOrder(id:string){return getJson<OrderRecord>(`orders/${id}.json`);}
export async function listOrders(limit=250){
  const result:any=await store().list({prefix:"orders/"});
  const keys=(result?.blobs||[]).map((x:any)=>x.key).slice(0,limit);
  const orders=(await Promise.all(keys.map((key:string)=>getJson<OrderRecord>(key)))).filter(Boolean) as OrderRecord[];
  return orders.sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)));
}
export async function findOpenOrderForCustomer(email:string|null){
  const e=String(email||"").toLowerCase(); if(!e)return null;
  const orders=await listOrders();
  return orders.find(o=>String(o.customerEmail||"").toLowerCase()===e && !["cancelled","historical"].includes(o.status))||null;
}
export async function getThreadOrderId(threadKey:string){
  const link:any=await getJson(`threads/${threadId(threadKey)}.json`); return link?.orderId||null;
}
export async function saveThreadOrderId(threadKey:string,orderId:string){
  await setJson(`threads/${threadId(threadKey)}.json`,{threadKey,orderId,updatedAt:new Date().toISOString()});
}

export async function upsertQueueItem(input:Omit<QueueItem,"id"|"status"|"createdAt"|"updatedAt"> & {id?:string}){
  const now=new Date().toISOString();
  const id=input.id||`q_${randomUUID()}`;
  const existing=await getJson<QueueItem>(`queue/${id}.json`);
  const item:QueueItem={...input,id,status:existing?.status||"open",createdAt:existing?.createdAt||now,updatedAt:now};
  await setJson(`queue/${id}.json`,item);
  return item;
}
export async function getQueueItem(id:string){return getJson<QueueItem>(`queue/${id}.json`);}
export async function setQueueStatus(id:string,status:QueueItem["status"]){
  const item=await getQueueItem(id); if(!item)return null;
  const next={...item,status,updatedAt:new Date().toISOString()}; await setJson(`queue/${id}.json`,next); return next;
}
export async function listQueue(status="open",limit=200){
  const result:any=await store().list({prefix:"queue/"});
  const keys=(result?.blobs||[]).map((x:any)=>x.key).slice(0,limit);
  const items=(await Promise.all(keys.map((key:string)=>getJson<QueueItem>(key)))).filter(Boolean) as QueueItem[];
  return items.filter(x=>!status||x.status===status).sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export async function appendActivity(type:string,data:any){
  const at=new Date().toISOString();
  const id=`${at.replace(/[:.]/g,"-")}_${randomUUID()}`;
  await setJson(`activity/${id}.json`,{id,type,at,data});
}
export async function listActivity(limit=80){
  const result:any=await store().list({prefix:"activity/"});
  const keys=(result?.blobs||[]).map((x:any)=>x.key).sort().reverse().slice(0,limit);
  return (await Promise.all(keys.map((key:string)=>getJson(key)))).filter(Boolean);
}

export async function getAutonomyPolicy():Promise<AutonomyPolicy>{
  return (await getJson<AutonomyPolicy>("config/autonomy.json"))||DEFAULT_AUTONOMY_POLICY;
}
export async function saveAutonomyPolicy(policy:AutonomyPolicy){await setJson("config/autonomy.json",policy);}
