import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { getStore } from "@netlify/blobs";
import webpush from "web-push";

declare const Netlify:any;
const STORE_NAME="vitalveg-v9";
const CONFIG_KEY="push/vapid-v1.json";
const SUBJECT="mailto:geral@vitalveg.pt";
function store(){return getStore(STORE_NAME,{consistency:"strong"});}
function key(){
  const secret=String(Netlify.env.get("SESSION_SECRET")||"");
  if(secret.length<24)throw new Error("SESSION_SECRET não configurado corretamente");
  return createHash("sha256").update(`vitalveg-push-v1:${secret}`).digest();
}
function encrypt(value:string){
  const iv=randomBytes(12);const cipher=createCipheriv("aes-256-gcm",key(),iv);
  const data=Buffer.concat([cipher.update(value,"utf8"),cipher.final()]);
  return {iv:iv.toString("base64"),tag:cipher.getAuthTag().toString("base64"),data:data.toString("base64")};
}
function decrypt(secret:any){
  const decipher=createDecipheriv("aes-256-gcm",key(),Buffer.from(secret.iv,"base64"));
  decipher.setAuthTag(Buffer.from(secret.tag,"base64"));
  return Buffer.concat([decipher.update(Buffer.from(secret.data,"base64")),decipher.final()]).toString("utf8");
}
function subKey(endpoint:string){return `push/subscriptions/${createHash("sha256").update(endpoint).digest("hex")}.json`;}

export async function ensureVapid(){
  let cfg:any=await store().get(CONFIG_KEY,{type:"json"});
  if(!cfg?.publicKey||!cfg?.privateKey){
    const pair=webpush.generateVAPIDKeys();
    cfg={publicKey:pair.publicKey,privateKey:encrypt(pair.privateKey),createdAt:new Date().toISOString()};
    await store().setJSON(CONFIG_KEY,cfg);
  }
  const privateKey=decrypt(cfg.privateKey);
  webpush.setVapidDetails(SUBJECT,String(cfg.publicKey),privateKey);
  return {publicKey:String(cfg.publicKey),privateKey};
}

export async function savePushSubscription(subscription:any){
  const endpoint=String(subscription?.endpoint||"").trim();
  const p256dh=String(subscription?.keys?.p256dh||"").trim();
  const auth=String(subscription?.keys?.auth||"").trim();
  if(!endpoint.startsWith("https://")||!p256dh||!auth)throw new Error("Subscrição push inválida");
  const value={subscription:{endpoint,expirationTime:subscription?.expirationTime??null,keys:{p256dh,auth}},updatedAt:new Date().toISOString()};
  await store().setJSON(subKey(endpoint),value);
  return value;
}
export async function removePushSubscription(endpoint:string){
  if(endpoint)await store().delete(subKey(endpoint));
}
export async function listPushSubscriptions(){
  const result:any=await store().list({prefix:"push/subscriptions/"});
  const values=await Promise.all((result?.blobs||[]).map((b:any)=>store().get(b.key,{type:"json"})));
  return values.filter(Boolean) as any[];
}

export async function sendPushToOperators(payload:{title:string;body:string;url?:string;tag?:string}){
  const {publicKey}=await ensureVapid();
  const entries=await listPushSubscriptions();
  if(!entries.length)return {sent:0,failed:0,publicKey};
  let sent=0,failed=0;
  const data=JSON.stringify({title:payload.title,body:payload.body,url:payload.url||"/v9/",tag:payload.tag||"vitalveg"});
  for(const entry of entries){
    try{
      await webpush.sendNotification(entry.subscription,data,{TTL:300,urgency:"high"} as any);
      sent++;
    }catch(error:any){
      failed++;
      const code=Number(error?.statusCode||0);
      if(code===404||code===410)await removePushSubscription(String(entry?.subscription?.endpoint||""));
      else console.error("VitalVeg push failed:",String(error?.message||error));
    }
  }
  return {sent,failed,publicKey};
}
