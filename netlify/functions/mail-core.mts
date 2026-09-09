import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { getStore } from "@netlify/blobs";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

declare const Netlify: any;

export const ALLOWED_ACCOUNT = "geral@vitalveg.pt";
const IMAP_HOST = "mail.securemail.pro";
const IMAP_PORT = 993;
const FETCH_LIMIT_PER_FOLDER = 20;
const FINAL_MESSAGE_LIMIT = 20;
const SECURE_STORE = "vitalveg-secure";
const CONFIG_KEY = "mailbox-config-v1";
const CACHE_KEY = "mail-cache-v1";

function store(){ return getStore(SECURE_STORE,{consistency:"strong"}); }
function hash(value:string){ return createHash("sha256").update(value).digest("hex"); }
function cryptoKey(){
  const secret = Netlify.env.get("VAULT_KEY") || Netlify.env.get("BOOTSTRAP_CODE");
  if(!secret) throw new Error("Chave segura em falta no servidor");
  return createHash("sha256").update(`vitalveg-mailbox-v1:${secret}`).digest();
}

export function encryptPassword(password:string){
  const iv=randomBytes(12); const cipher=createCipheriv("aes-256-gcm",cryptoKey(),iv);
  const encrypted=Buffer.concat([cipher.update(password,"utf8"),cipher.final()]);
  const tag=cipher.getAuthTag();
  return {iv:iv.toString("base64"),tag:tag.toString("base64"),data:encrypted.toString("base64")};
}
export function decryptPassword(secret:any){
  const decipher=createDecipheriv("aes-256-gcm",cryptoKey(),Buffer.from(secret.iv,"base64"));
  decipher.setAuthTag(Buffer.from(secret.tag,"base64"));
  return Buffer.concat([decipher.update(Buffer.from(secret.data,"base64")),decipher.final()]).toString("utf8");
}

export async function getMailboxConfig(){ return await store().get(CONFIG_KEY,{type:"json"}) as any; }
export async function mailboxConfigured(){ return !!(await getMailboxConfig()); }
export async function saveMailboxConfig(email:string,password:string,deviceToken:string){
  const existing=await getMailboxConfig();
  const tokenHash=hash(deviceToken);
  const hashes=Array.from(new Set([...(existing?.deviceTokenHashes||[]),tokenHash]));
  const value={account:email,secret:encryptPassword(password),deviceTokenHashes:hashes,updatedAt:new Date().toISOString()};
  await store().setJSON(CONFIG_KEY,value);
}
export async function verifyDeviceToken(token:string){
  if(!token) return false;
  const cfg=await getMailboxConfig();
  return !!cfg?.deviceTokenHashes?.includes(hash(token));
}
export async function getStoredCredentials(){
  const cfg=await getMailboxConfig();
  if(!cfg?.account||!cfg?.secret) throw new Error("Caixa de email ainda não configurada");
  return {email:String(cfg.account),password:decryptPassword(cfg.secret)};
}

export async function validateCredentials(email:string,password:string){
  if(email.toLowerCase()!==ALLOWED_ACCOUNT) throw new Error("Conta de email não autorizada");
  const client=new ImapFlow({host:IMAP_HOST,port:IMAP_PORT,secure:true,auth:{user:email,pass:password},logger:false,connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000});
  try{ await client.connect(); }
  finally{ try{ await client.logout(); }catch{} }
}

function cleanAddress(value:any):string{
  if(!value)return""; if(typeof value==="string")return value; if(Array.isArray(value))return value.map(cleanAddress).filter(Boolean).join(", ");
  if(value.address)return value.name?`${value.name} <${value.address}>`:value.address;
  if(value.value&&Array.isArray(value.value))return value.value.map((x:any)=>x.name?`${x.name} <${x.address}>`:x.address).join(", ");
  return String(value);
}
async function findSentFolder(client:ImapFlow):Promise<string|null>{
  const flat:any[]=await client.list() as any; const special=flat.find((x:any)=>String(x.specialUse||"").toLowerCase()==="\\sent");
  if(special?.path)return special.path; const byName=flat.find((x:any)=>/(^|\/)(sent|sent items|sent messages|enviados|enviadas)$/i.test(String(x.path||x.name||""))); return byName?.path||null;
}
async function fetchFolder(client:ImapFlow,folder:string,limit:number,direction:"in"|"out"){
  const out:any[]=[]; const lock=await client.getMailboxLock(folder);
  try{
    const total=Number(client.mailbox?.exists||0); if(!total)return out; const start=Math.max(1,total-limit+1);
    for await(const msg of client.fetch(`${start}:*`,{uid:true,envelope:true,source:true,flags:true})){
      try{
        const parsed:any=await simpleParser(msg.source as Buffer); const envelope:any=msg.envelope||{};
        out.push({id:`${folder}:${msg.uid}`,uid:msg.uid,folder,direction,date:(parsed.date||envelope.date||new Date()).toISOString(),from:cleanAddress(parsed.from||envelope.from),to:cleanAddress(parsed.to||envelope.to),subject:String(parsed.subject||envelope.subject||"(sem assunto)"),messageId:String(parsed.messageId||envelope.messageId||""),inReplyTo:String(parsed.inReplyTo||""),references:Array.isArray(parsed.references)?parsed.references:(parsed.references?[parsed.references]:[]),text:String(parsed.text||"").trim(),html:"",flags:Array.from(msg.flags||[]).map(String)});
      }catch{}
    }
  }finally{lock.release();}
  return out;
}

export async function fetchMailbox(email:string,password:string){
  const client=new ImapFlow({host:IMAP_HOST,port:IMAP_PORT,secure:true,auth:{user:email,pass:password},logger:false,connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000});
  try{
    await client.connect();
    const inbox=await fetchFolder(client,"INBOX",FETCH_LIMIT_PER_FOLDER,"in");
    let sentFolder:string|null=null,sent:any[]=[]; let sentWarning="";
    try{sentFolder=await findSentFolder(client);if(sentFolder)sent=await fetchFolder(client,sentFolder,FETCH_LIMIT_PER_FOLDER,"out");}catch(error:any){sentWarning=String(error?.message||"Não foi possível ler a pasta Enviados");}
    const messages=[...inbox,...sent].sort((a,b)=>new Date(b.date).getTime()-new Date(a.date).getTime()).slice(0,FINAL_MESSAGE_LIMIT);
    const result={ok:true,account:email,sentFolder,sentWarning,fetchedAt:new Date().toISOString(),limits:{inbox:FETCH_LIMIT_PER_FOLDER,sent:FETCH_LIMIT_PER_FOLDER,returned:FINAL_MESSAGE_LIMIT},messages};
    await store().setJSON(CACHE_KEY,result);
    return result;
  }finally{try{await client.logout();}catch{}}
}
export async function getCachedMail(){ return await store().get(CACHE_KEY,{type:"json"}) as any; }
