import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { getStore } from "@netlify/blobs";

declare const Netlify:any;
const STORE_NAME="vitalveg-v9";
const PIN_KEY="auth/shared-pin-v1.json";
const COOKIE_NAME="vv_session";
const ONE_YEAR=365*24*60*60;
function store(){return getStore(STORE_NAME,{consistency:"strong"});}
function secret(){
  const value=String(Netlify.env.get("SESSION_SECRET")||"");
  if(value.length<24)throw new Error("SESSION_SECRET não configurado corretamente");
  return value;
}
function base64url(value:Buffer|string){return Buffer.from(value).toString("base64url");}
function unbase64url(value:string){return Buffer.from(value,"base64url");}
function sign(payload:string){return createHmac("sha256",secret()).update(payload).digest("base64url");}
function cookieToken(req:Request,name=COOKIE_NAME){
  const raw=req.headers.get("cookie")||"";
  const hit=raw.split(";").map(x=>x.trim()).find(x=>x.startsWith(`${name}=`));
  return hit?decodeURIComponent(hit.slice(name.length+1)):"";
}

export async function pinConfigured(){return !!(await store().get(PIN_KEY,{type:"json"}));}
export async function registerSharedPin(pin:string){
  if(!/^\d{4}$/.test(pin))throw new Error("O PIN deve ter 4 dígitos");
  const salt=randomBytes(16);
  const hash=scryptSync(pin,salt,32);
  await store().setJSON(PIN_KEY,{salt:salt.toString("base64"),hash:hash.toString("base64"),updatedAt:new Date().toISOString()});
}
export async function verifySharedPin(pin:string){
  if(!/^\d{4}$/.test(pin))return false;
  const cfg:any=await store().get(PIN_KEY,{type:"json"});
  if(!cfg?.salt||!cfg?.hash)return false;
  const expected=Buffer.from(cfg.hash,"base64");
  const actual=scryptSync(pin,Buffer.from(cfg.salt,"base64"),expected.length);
  return expected.length===actual.length && timingSafeEqual(expected,actual);
}
export function createSessionToken(){
  const now=Math.floor(Date.now()/1000);
  const payload=base64url(JSON.stringify({v:1,iat:now,exp:now+ONE_YEAR,nonce:randomBytes(16).toString("hex")}));
  return `${payload}.${sign(payload)}`;
}
export function verifySessionToken(token:string){
  const [payload,sig]=String(token||"").split(".");
  if(!payload||!sig)return false;
  const expected=sign(payload);
  const a=Buffer.from(sig); const b=Buffer.from(expected);
  if(a.length!==b.length||!timingSafeEqual(a,b))return false;
  try{
    const data=JSON.parse(unbase64url(payload).toString("utf8"));
    return data?.v===1 && Number(data.exp||0)>Math.floor(Date.now()/1000);
  }catch{return false;}
}
export function verifyAppSession(req:Request){return verifySessionToken(cookieToken(req));}
export function sessionCookie(token:string){return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=${ONE_YEAR}; HttpOnly; Secure; SameSite=Lax`;}
export function clearSessionCookie(){return `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;}
