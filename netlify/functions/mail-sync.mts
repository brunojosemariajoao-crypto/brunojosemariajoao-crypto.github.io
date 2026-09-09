import type { Config } from "@netlify/functions";
import { fetchMailbox, getStoredCredentials, mailboxConfigured } from "./mail-core.mts";
import { buildMailThreads } from "./thread-engine.mts";
import { processConversation } from "./ai-orchestrator.mts";
import { appendActivity, getWorkerThreadState, saveWorkerThreadState } from "./ai-store.mts";

const MAX_AI_THREADS_PER_RUN=6;

function inboundIdentity(message:any){
  return String(message?.messageId||message?.id||`${message?.date||""}|${message?.from||""}|${message?.subject||""}`);
}

export default async () => {
  try{
    if(!(await mailboxConfigured()))return;
    const {email,password}=await getStoredCredentials();
    const mailbox=await fetchMailbox(email,password);
    const threads=buildMailThreads(Array.isArray(mailbox?.messages)?mailbox.messages:[])
      .filter(t=>!!t.latestInbound)
      .sort((a,b)=>new Date(b.latestInbound?.date||0).getTime()-new Date(a.latestInbound?.date||0).getTime());

    let processed=0;
    for(const thread of threads){
      if(processed>=MAX_AI_THREADS_PER_RUN)break;
      const latest=thread.latestInbound!;
      const latestInboundId=inboundIdentity(latest);
      const previous=await getWorkerThreadState(thread.key);
      if(previous?.latestInboundId===latestInboundId && previous?.lastResult==="processed")continue;

      try{
        const result=await processConversation({threadKey:thread.key,messages:thread.messages});
        await saveWorkerThreadState(thread.key,{
          latestInboundId,
          latestInboundDate:String(latest.date||""),
          lastFingerprint:String(result?.fingerprint||""),
          lastResult:"processed",
          lastError:null
        });
        processed++;
      }catch(error:any){
        const message=String(error?.message||error||"Erro desconhecido");
        await saveWorkerThreadState(thread.key,{
          latestInboundId,
          latestInboundDate:String(latest.date||""),
          lastFingerprint:null,
          lastResult:"error",
          lastError:message.slice(0,600)
        });
        console.error("VitalVeg AI thread processing failed:",thread.key,message);
        if(/OPENAI_API_KEY|OPENAI_MODEL/.test(message))break;
      }
    }

    await appendActivity("mail_sync",{
      fetchedAt:mailbox?.fetchedAt||new Date().toISOString(),
      messages:Array.isArray(mailbox?.messages)?mailbox.messages.length:0,
      threads:threads.length,
      aiProcessed:processed,
      sentWarning:mailbox?.sentWarning||""
    });
  }catch(error:any){
    console.error("VitalVeg background mail sync failed:",String(error?.message||error));
  }
};

export const config:Config={schedule:"*/5 * * * *"};
