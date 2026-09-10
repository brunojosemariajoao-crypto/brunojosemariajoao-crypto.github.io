import type { Config } from "@netlify/functions";
import { mailboxConfigured } from "./mail-core.mts";
import { syncV9Mailbox } from "./mail-v9-core.mts";
import { buildMailThreads } from "./thread-engine.mts";
import { processConversation } from "./ai-orchestrator.mts";
import { evaluateShadowConversation } from "./ai-shadow-core.mts";
import { getAiOperationMode } from "./ai-mode.mts";
import { appendActivity, getJson, setJson } from "./ai-store.mts";

const MAX_AI_THREADS_PER_RUN=8;
const BOOTSTRAP_FRESH_WINDOW_MS=10*60*1000;
const ERROR_RETRY_MS=15*60*1000;
const WORKER_INDEX_KEY="worker/index-v3.json";
const WORKER_HEALTH_KEY="worker/health-v1.json";

type WorkerEntry={
  latestInboundId:string;
  latestInboundDate:string;
  lastFingerprint:string|null;
  lastResult:"baseline"|"shadow"|"processed"|"error";
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
  if(["processed","baseline","shadow"].includes(entry.lastResult))return true;
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
function safeError(error:any){return String(error?.message||error||"Erro desconhecido").replace(/\s+/g," ").trim().slice(0,600);}
function classifyHealthError(message:string){
  if(/OPENAI_API_KEY|OPENAI_MODEL/i.test(message))return "ai_not_configured";
  if(/AI_BUDGET_EXCEEDED|limite diário de IA/i.test(message))return "ai_budget_reached";
  return "processing_error";
}

export default async () => {
  const runStarted=Date.now();
  try{
    if(!(await mailboxConfigured())){
      await setJson(WORKER_HEALTH_KEY,{status:"mailbox_unconfigured",code:"mailbox_unconfigured",lastRunAt:new Date().toISOString(),operationMode:null,processingErrors:0,deferredThreads:0,lastError:null});
      return;
    }
    const operationMode=await getAiOperationMode();
    const mailbox=await syncV9Mailbox();
    const threads=buildMailThreads(Array.isArray(mailbox?.messages)?mailbox.messages:[])
      .filter(t=>!!t.latestInbound)
      .sort((a,b)=>validDateMs(b.latestInbound?.date)-validDateMs(a.latestInbound?.date));

    const worker=pruneWorkerIndex((await getJson<WorkerIndex>(WORKER_INDEX_KEY))||{},runStarted);
    let aiAttempts=0,processed=0,shadowEvaluated=0,baseline=0,errors=0,skipped=0,deferred=0;
    let lastError:string|null=null;

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
      if(aiAttempts>=MAX_AI_THREADS_PER_RUN){deferred++;continue;}
      aiAttempts++;

      try{
        if(operationMode==="shadow"){
          const result=await evaluateShadowConversation({threadKey:thread.key,messages:thread.messages});
          worker[thread.key]={
            latestInboundId,latestInboundDate:String(latest.date||""),
            lastFingerprint:String(result?.fingerprint||""),lastResult:"shadow",lastError:null,
            updatedAt:new Date().toISOString(),nextRetryAt:null
          };
          shadowEvaluated++;
        }else{
          const result=await processConversation({threadKey:thread.key,messages:thread.messages});
          worker[thread.key]={
            latestInboundId,latestInboundDate:String(latest.date||""),
            lastFingerprint:String(result?.fingerprint||""),lastResult:"processed",lastError:null,
            updatedAt:new Date().toISOString(),nextRetryAt:null
          };
          processed++;
        }
      }catch(error:any){
        const message=safeError(error);lastError=message;
        worker[thread.key]={
          latestInboundId,latestInboundDate:String(latest.date||""),lastFingerprint:null,
          lastResult:"error",lastError:message,updatedAt:new Date().toISOString(),
          nextRetryAt:new Date(Date.now()+ERROR_RETRY_MS).toISOString()
        };
        errors++;
        console.error("VitalVeg AI thread processing failed:",thread.key,message);
        if(/OPENAI_API_KEY|OPENAI_MODEL|AI_BUDGET_EXCEEDED|limite diário de IA/i.test(message))break;
      }
    }

    await setJson(WORKER_INDEX_KEY,worker);
    const healthCode=lastError?classifyHealthError(lastError):(deferred?"backlog":"ok");
    const healthStatus=errors?"degraded":(deferred?"backlog":"ok");
    await setJson(WORKER_HEALTH_KEY,{
      status:healthStatus,
      code:healthCode,
      lastRunAt:new Date().toISOString(),
      fetchedAt:mailbox?.fetchedAt||null,
      operationMode,
      recentMessages:Array.isArray(mailbox?.messages)?mailbox.messages.length:0,
      newMessages:mailbox?.newMessageIds?.length||0,
      threads:threads.length,
      aiAttempts,processed,shadowEvaluated,baselineThreads:baseline,
      processingErrors:errors,unchangedSkipped:skipped,deferredThreads:deferred,
      lastError
    });
    await appendActivity("mail_sync",{
      operationMode,
      fetchedAt:mailbox?.fetchedAt||new Date().toISOString(),
      recentMessages:Array.isArray(mailbox?.messages)?mailbox.messages.length:0,
      newMessages:mailbox?.newMessageIds?.length||0,
      inboxNew:mailbox?.sync?.inboxNew||0,
      sentNew:mailbox?.sync?.sentNew||0,
      threads:threads.length,
      aiAttempts,
      aiProcessed:processed,
      shadowEvaluated,
      baselineThreads:baseline,
      processingErrors:errors,
      deferredThreads:deferred,
      unchangedSkipped:skipped,
      bootstrap:!!mailbox.bootstrap,
      sentWarning:mailbox?.sentWarning||""
    });
  }catch(error:any){
    const message=safeError(error);
    try{await setJson(WORKER_HEALTH_KEY,{status:"degraded",code:"worker_error",lastRunAt:new Date().toISOString(),operationMode:null,processingErrors:1,deferredThreads:0,lastError:message});}catch{}
    console.error("VitalVeg background mail sync failed:",message);
  }
};

export const config:Config={schedule:"*/5 * * * *"};
