import { createHash } from "node:crypto";

export type ThreadMessage={
  id?:string; messageId?:string; inReplyTo?:string; references?:string[];
  date?:string; direction?:"in"|"out"; from?:string; to?:string; subject?:string; text?:string;
};
export type MailThread={key:string;counterpart:string;subject:string;messages:ThreadMessage[];latestInbound:ThreadMessage|null;latest:ThreadMessage|null;};

const FALLBACK_THREAD_WINDOW_MS=96*60*60*1000;

function addr(value:any){
  const s=String(value||""); const a=s.match(/<([^>]+)>/); if(a)return a[1].trim().toLowerCase();
  const b=s.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i); return b?b[0].toLowerCase():s.trim().toLowerCase();
}
function subject(value:any){
  let s=String(value||"").trim(); let prev="";
  while(s!==prev){prev=s;s=s.replace(/^\s*(re|fw|fwd|enc|res)\s*:\s*/i,"").trim();}
  return s.toLowerCase();
}
function fallbackKey(m:ThreadMessage){
  const cp=m.direction==="out"?addr(m.to):addr(m.from);
  return `${cp}|${subject(m.subject)}`;
}
function canonicalKey(seed:string){return `thr_${createHash("sha256").update(seed).digest("hex").slice(0,20)}`;}
function timeOf(m:ThreadMessage){const n=new Date(m.date||0).getTime();return Number.isFinite(n)?n:0;}

export function buildMailThreads(messages:ThreadMessage[]):MailThread[]{
  const sorted=[...(messages||[])].sort((a,b)=>timeOf(a)-timeOf(b));
  const byMessageId=new Map<string,string>();
  const recentFallback=new Map<string,{key:string,lastAt:number}>();
  const groups=new Map<string,ThreadMessage[]>();

  for(const m of sorted){
    const refs=[m.inReplyTo,...(Array.isArray(m.references)?m.references:[])].filter(Boolean).map(String);
    const linked=refs.map(r=>byMessageId.get(r)).find(Boolean);
    const fallback=fallbackKey(m);
    const at=timeOf(m);
    const recent=recentFallback.get(fallback);
    const withinWindow=!!recent && at>=recent.lastAt && (at-recent.lastAt)<=FALLBACK_THREAD_WINDOW_MS;
    const seed=`${fallback}|${m.messageId||m.id||m.date||at}|${groups.size}`;
    const key=linked || (withinWindow?recent!.key:canonicalKey(seed));

    if(!groups.has(key))groups.set(key,[]);
    groups.get(key)!.push(m);
    if(m.messageId)byMessageId.set(String(m.messageId),key);
    recentFallback.set(fallback,{key,lastAt:at});
  }

  return [...groups.entries()].map(([key,list])=>{
    list.sort((a,b)=>timeOf(a)-timeOf(b));
    const latest=list.at(-1)||null;
    const latestInbound=[...list].reverse().find(m=>m.direction!=="out")||null;
    const cp=latestInbound?addr(latestInbound.from):(latest?addr(latest.direction==="out"?latest.to:latest.from):"");
    return {key,counterpart:cp,subject:String(latestInbound?.subject||latest?.subject||"(sem assunto)"),messages:list,latestInbound,latest};
  }).sort((a,b)=>timeOf(b.latest||{})-timeOf(a.latest||{}));
}
