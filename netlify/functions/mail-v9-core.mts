import { createHash } from "node:crypto";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { getStoredCredentials } from "./mail-core.mts";
import { getJson, setJson } from "./ai-store.mts";

const IMAP_HOST="mail.securemail.pro";
const IMAP_PORT=993;
const INITIAL_FOLDER_MESSAGES=70;
const RECENT_MESSAGE_LIMIT=180;
const MAX_TEXT_LENGTH=12000;
const SNAPSHOT_KEY="mail/v9-snapshot.json";

export type V9MailMessage={
  id:string;
  uid:number;
  uidValidity:string;
  folder:string;
  direction:"in"|"out";
  date:string;
  from:string;
  to:string;
  subject:string;
  messageId:string;
  inReplyTo:string;
  references:string[];
  text:string;
  flags:string[];
};

type FolderState={folder:string;uidValidity:string;lastUid:number;initializedAt:string;updatedAt:string;};
export type V9MailSnapshot={
  ok:true;
  account:string;
  fetchedAt:string;
  sentFolder:string|null;
  sentWarning:string;
  bootstrap:boolean;
  newMessageIds:string[];
  messages:V9MailMessage[];
  sync:{inboxNew:number;sentNew:number;recent:number};
};

function keyHash(value:string){return createHash("sha256").update(value).digest("hex").slice(0,20);}
function folderStateKey(folder:string){return `mail/folders/${keyHash(folder)}.json`;}
function normalizeRefs(value:any):string[]{
  if(!value)return [];
  const arr=Array.isArray(value)?value:[value];
  return [...new Set(arr.flatMap(v=>String(v||"").split(/\s+/)).map(x=>x.trim()).filter(Boolean))];
}
function cleanAddress(value:any):string{
  if(!value)return "";
  if(typeof value==="string")return value;
  if(Array.isArray(value))return value.map(cleanAddress).filter(Boolean).join(", ");
  if(value.address)return value.name?`${value.name} <${value.address}>`:String(value.address);
  if(value.value&&Array.isArray(value.value))return value.value.map((x:any)=>x.name?`${x.name} <${x.address}>`:x.address).join(", ");
  return String(value);
}
function messageKey(folder:string,uidValidity:string,uid:number){return `${folder}|${uidValidity}|${uid}`;}
function semanticMessageKey(message:V9MailMessage){
  const mid=String(message?.messageId||"").trim().toLowerCase();
  return mid?`mid:${mid}`:`uid:${message.id}`;
}
function safeDate(value:any){
  const d=value instanceof Date?value:new Date(value||0);
  return Number.isNaN(d.getTime())?new Date(0).toISOString():d.toISOString();
}
function numeric(value:any){const n=Number(value);return Number.isFinite(n)?n:0;}

export function mergeRecentMessages(existing:V9MailMessage[],incoming:V9MailMessage[],limit=RECENT_MESSAGE_LIMIT){
  const map=new Map<string,V9MailMessage>();
  for(const m of [...(existing||[]),...(incoming||[])]){
    if(!m?.id)continue;
    const key=semanticMessageKey(m);
    const prior=map.get(key);
    // Se o servidor e a Central guardarem ambos a mesma mensagem enviada,
    // o Message-ID é a identidade canónica e só uma cópia chega à IA.
    if(!prior || new Date(m.date).getTime()>=new Date(prior.date).getTime())map.set(key,m);
  }
  return [...map.values()]
    .sort((a,b)=>new Date(b.date).getTime()-new Date(a.date).getTime())
    .slice(0,Math.max(1,limit));
}

async function findSentFolder(client:ImapFlow):Promise<string|null>{
  const list:any[]=await client.list() as any;
  const special=list.find((x:any)=>String(x.specialUse||"").toLowerCase()==="\\sent");
  if(special?.path)return String(special.path);
  const named=list.find((x:any)=>/(^|\/)(sent|sent items|sent messages|enviados|enviadas)$/i.test(String(x.path||x.name||"")));
  return named?.path?String(named.path):null;
}

async function parseFetched(folder:string,direction:"in"|"out",uidValidity:string,msg:any):Promise<V9MailMessage|null>{
  try{
    const parsed:any=await simpleParser(msg.source as Buffer);
    const envelope:any=msg.envelope||{};
    const uid=numeric(msg.uid);
    if(!uid)return null;
    return {
      id:messageKey(folder,uidValidity,uid),
      uid,uidValidity,folder,direction,
      date:safeDate(parsed.date||envelope.date||new Date()),
      from:cleanAddress(parsed.from||envelope.from),
      to:cleanAddress(parsed.to||envelope.to),
      subject:String(parsed.subject||envelope.subject||"(sem assunto)"),
      messageId:String(parsed.messageId||envelope.messageId||""),
      inReplyTo:String(parsed.inReplyTo||""),
      references:normalizeRefs(parsed.references),
      text:String(parsed.text||"").trim().slice(0,MAX_TEXT_LENGTH),
      flags:Array.from(msg.flags||[]).map(String)
    };
  }catch{return null;}
}

async function syncFolder(client:ImapFlow,folder:string,direction:"in"|"out"){
  const lock=await client.getMailboxLock(folder);
  try{
    const total=numeric(client.mailbox?.exists);
    const uidValidity=String((client.mailbox as any)?.uidValidity||"unknown");
    const uidNext=numeric((client.mailbox as any)?.uidNext);
    const previous=await getJson<FolderState>(folderStateKey(folder));
    const bootstrap=!previous || previous.uidValidity!==uidValidity;
    if(!total){
      const now=new Date().toISOString();
      await setJson(folderStateKey(folder),{folder,uidValidity,lastUid:0,initializedAt:previous?.initializedAt||now,updatedAt:now});
      return {messages:[] as V9MailMessage[],bootstrap};
    }

    if(!bootstrap && uidNext>0 && previous!.lastUid>=uidNext-1){
      return {messages:[] as V9MailMessage[],bootstrap:false};
    }

    const query:any={uid:true,envelope:true,source:true,flags:true};
    const fetched:V9MailMessage[]=[];
    if(bootstrap){
      const start=Math.max(1,total-INITIAL_FOLDER_MESSAGES+1);
      for await(const msg of client.fetch(`${start}:*`,query)){
        const parsed=await parseFetched(folder,direction,uidValidity,msg);
        if(parsed)fetched.push(parsed);
      }
    }else{
      const firstUid=Math.max(1,Number(previous!.lastUid||0)+1);
      for await(const msg of client.fetch(`${firstUid}:*`,query,{uid:true} as any)){
        const parsed=await parseFetched(folder,direction,uidValidity,msg);
        if(parsed && parsed.uid>=firstUid)fetched.push(parsed);
      }
    }

    const lastUid=Math.max(previous?.uidValidity===uidValidity?Number(previous?.lastUid||0):0,...fetched.map(x=>x.uid));
    const now=new Date().toISOString();
    await setJson(folderStateKey(folder),{
      folder,uidValidity,lastUid,
      initializedAt:bootstrap?now:(previous?.initializedAt||now),
      updatedAt:now
    });
    return {messages:fetched,bootstrap};
  }finally{lock.release();}
}

async function archiveByDay(messages:V9MailMessage[]){
  const groups=new Map<string,V9MailMessage[]>();
  for(const m of messages){
    const day=String(m.date||"").slice(0,10)||"unknown";
    if(!groups.has(day))groups.set(day,[]);
    groups.get(day)!.push(m);
  }
  for(const [day,list] of groups){
    const key=`mail/archive/${day}.json`;
    const existing=await getJson<V9MailMessage[]>(key)||[];
    const merged=mergeRecentMessages(existing,list,1000).sort((a,b)=>new Date(a.date).getTime()-new Date(b.date).getTime());
    await setJson(key,merged);
  }
}

export async function getV9MailSnapshot(){return getJson<V9MailSnapshot>(SNAPSHOT_KEY);}

export async function syncV9Mailbox():Promise<V9MailSnapshot>{
  const {email,password}=await getStoredCredentials();
  const client=new ImapFlow({
    host:IMAP_HOST,port:IMAP_PORT,secure:true,auth:{user:email,pass:password},logger:false,
    connectionTimeout:10000,greetingTimeout:10000,socketTimeout:20000
  });
  try{
    await client.connect();
    const inbox=await syncFolder(client,"INBOX","in");
    let sentFolder:string|null=null;
    let sent={messages:[] as V9MailMessage[],bootstrap:false};
    let sentWarning="";
    try{
      sentFolder=await findSentFolder(client);
      if(sentFolder)sent=await syncFolder(client,sentFolder,"out");
    }catch(error:any){sentWarning=String(error?.message||"Não foi possível sincronizar Enviados");}

    const incoming=mergeRecentMessages([], [...inbox.messages,...sent.messages], Math.max(1,inbox.messages.length+sent.messages.length));
    if(incoming.length)await archiveByDay(incoming);
    const previous=await getV9MailSnapshot();
    const recent=mergeRecentMessages(previous?.messages||[],incoming,RECENT_MESSAGE_LIMIT);
    const bootstrap=!!(inbox.bootstrap||sent.bootstrap||!previous);
    const snapshot:V9MailSnapshot={
      ok:true,account:email,fetchedAt:new Date().toISOString(),sentFolder,sentWarning,bootstrap,
      newMessageIds:incoming.map(x=>x.id),messages:recent,
      sync:{inboxNew:inbox.messages.length,sentNew:sent.messages.length,recent:recent.length}
    };
    await setJson(SNAPSHOT_KEY,snapshot);
    return snapshot;
  }finally{try{await client.logout();}catch{}}
}
