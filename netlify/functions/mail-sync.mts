import type { Config } from "@netlify/functions";
import { mailboxConfigured } from "./mail-core.mts";
import { syncV9Mailbox } from "./mail-v9-core.mts";
import { buildMailThreads } from "./thread-engine.mts";
import { processConversation } from "./ai-orchestrator.mts";
import { appendActivity, getJson, setJson } from "./ai-store.mts";

const MAX_AI_THREADS_PER_RUN=8;
const BOOTSTRAP_FRESH_WINDOW_MS=10*60*1000;
const ERROR_RETRY_MS=15*60*1000;
const WORKER_INDEX_KEY="worker/index-v2.json";

type WorkerEntry={
  latestInboundId:string;
  latestInboundDate:string;
  lastFingerprint:string|null;
  lastResult:"baseline"|"processed"|"error";
  lastError:string|null;
  updatedAt:string;
  nextRetryAt:string|null;
};

type WorkerIndex=Record<string,WorkerEntry>;

function inboundIdentity(message:any){
  return String(message?.messageId||message?.id||`${message?.date||""}|${message?.from||""}|${message?.subject||""}`);
}
function validDateMs(value:any){const n=new Date(value||0).getTime();return Number.isFinite(n)?n:0;}
function shouldSkip(entry:WorkerEntry|undefined,latestInboundId:string,now:number){
  if(!entry || entry.latestInboundId!==latestInboundId)return false;
  if(entry.lastResult==="processed"||entry.lastResult==="baseline")return true;
  if(entry.lastResult==="error" && entry.nextRetryAt && validDateMs(entry.nextRetryAt)>now)return true;
  return false;
}
function pruneWorkerIndex(index:WorkerIndex,now=Date.now()){
  const maxAge=70*24*60*60*1000;
  for(const [key,value] of Object.entries(index)){
    if(now-validDateMs(value.updatedAt)>maxAge)delete index[key];
  }
  return index;
}

export default async () => {
  const runStarted=Date.now();
  try{
    if(!(await mailboxConfigured()))return;
    const mailbox=await syncV9Mailbox();
    const threads=buildMailThreads(Array.isArray(mailbox?.messages)?mailbox.messages:[])
      .filter(t=>!!t.latestInbound)
      .sort((a,b)=>validDateMs(b.latestInbound?.date)-validDateMs(a.latestInbound?.date));

    const worker=pruneWorkerIndex((await getJson<WorkerIndex>(WORKER_INDEX_KEY))||{},runStarted);
    let processed=0,baseline=0,errors=0,skipped=0;

    for(const thread of threads){
      const latest=thread.latestInbound!;
      const latestInboundId=inboundIdentity(latest);
      const latestAt=validDateMs(latest.date);
      const previous=worker[thread.key];

      if(mailbox.bootstrap && latestAt<runStarted-BOOTSTRAP_FRESH_WINDOW_MS){
        worker[thread.key]={
          latestInboundId,latestInboundDate:String(latest.date||""),lastFingerprint:null,
          lastResult:"baseline",lastError:null,updatedAt:new Date().toISOString(),nextRetryAt:null
        };
        baseline++;
        continue;
      }

      if(shouldSkip(previous,latestInboundId,runStarted)){skipped++;continue;}
      if(processed>=MAX_AI_THREADS_PER_RUN)continue;

      try{
        const result=await processConversation({threadKey:thread.key,messages:thread.messages});
        worker[thread.key]={
          latestInboundId,latestInboundDate:String(latest.date||""),
          lastFingerprint:String(result?.fingerprint||""),lastResult:"processed",lastError:null,
          updatedAt:new Date().toISOString(),nextRetryAt:null
        };
        processed++;
      }catch(error:any){
        const message=String(error?.message||error||"Erro desconhecido");
        worker[thread.key]={
          latestInboundId,latestInboundDate:String(latest.date||""),lastFingerprint:null,
          lastResult:"error",lastError:message.slice(0,600),updatedAt:new Date().toISOString(),
          nextRetryAt:new Date(Date.now()+ERROR_RETRY_MS).toISOString()
        };
        errors++;
        console.error("VitalVeg AI thread processing failed:",thread.key,message);
        if(/OPENAI_API_KEY|OPENAI_MODEL/.test(message))break;
      }
    }

    await setJson(WORKER_INDEX_KEY,worker);
    await appendActivity("mail_sync",{
      fetchedAt:mailbox?.fetchedAt||new Date().toISOString(),
      recentMessages:Array.isArray(mailbox?.messages)?mailbox.messages.length:0,
      newMessages:mailbox?.newMessageIds?.length||0,
      inboxNew:mailbox?.sync?.inboxNew||0,
      sentNew:mailbox?.sync?.sentNew||0,
      threads:threads.length,
      aiProcessed:processed,
      baselineThreads:baseline,
      processingErrors:errors,
      unchangedSkipped:skipped,
      bootstrap:!!mailbox.bootstrap,
      sentWarning:mailbox?.sentWarning||""
    });
  }catch(error:any){
    console.error("VitalVeg background mail sync failed:",String(error?.message||error));
  }
};

export const config:Config={schedule:"*/5 * * * *"};
