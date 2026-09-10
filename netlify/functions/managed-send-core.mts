import { decideAutonomy } from "./autonomy-core.mts";
import { getAiOperationMode } from "./ai-mode.mts";
import { sendVitalVegMail } from "./mail-send-core.mts";
import { saveEditedReplyLearning } from "./ai-learning.mts";
import {
  appendActivity, getAnalysis, getAutonomyPolicy, getOrder, getQueueItem,
  saveOrder, setQueueStatus
} from "./ai-store.mts";

export type SendActor="human"|"autonomy";

export async function executeManagedSend(queueId:string,text:string,actor:SendActor){
  const item=await getQueueItem(queueId);
  if(!item)throw new Error("Pedido de aprovação não encontrado");
  if(item.status!=="open")throw new Error("Este pedido já foi tratado");
  if(!item.to||!item.subject)throw new Error("Faltam destinatário ou assunto no pedido");

  const draft=String(text||item.suggestedReply||"").trim();
  if(!draft)throw new Error("A resposta está vazia");

  const stored:any=await getAnalysis(item.analysisFingerprint);
  const analysis=stored?.analysis||null;
  const order=item.orderId?await getOrder(item.orderId):null;

  if(actor==="autonomy"){
    const operationMode=await getAiOperationMode();
    if(operationMode!=="autonomous")throw new Error("Envio autónomo bloqueado: o Funcionário Digital não está em modo Autónomo");
    if(!analysis)throw new Error("Não existe análise IA auditável para esta ação");
    const policy=await getAutonomyPolicy();
    const decision=decideAutonomy(analysis,order,policy);
    if(decision.mode!=="auto_execute")throw new Error(`A política atual não permite envio autónomo: ${decision.reasons.join(" ")}`);
    if(draft!==String(item.suggestedReply||"").trim())throw new Error("O modo autónomo não pode alterar silenciosamente a resposta aprovada pela IA");
  }

  const sent=await sendVitalVegMail({
    to:item.to,
    subject:item.subject,
    text:draft,
    inReplyTo:item.inReplyTo||undefined,
    references:item.references||[],
    actor
  });

  await setQueueStatus(queueId,"resolved");
  if(order && item.kind==="approval" && order.status==="awaiting_approval"){
    order.status="confirmed";
    order.updatedAt=new Date().toISOString();
    await saveOrder(order);
  }

  const aiDraft=String(item.suggestedReply||"").trim();
  const editedByHuman=actor==="human" && !!aiDraft && draft!==aiDraft;
  let learningExampleId:string|null=null;
  if(editedByHuman){
    try{
      const latestInbound=[...(item.sourceMessages||[])].reverse().find((m:any)=>m?.direction!=="out")||null;
      const learned=await saveEditedReplyLearning({
        queueId,
        customerEmail:item.to,
        subject:item.subject,
        sourceText:String(latestInbound?.text||""),
        messageType:analysis?.messageType||null,
        aiDraft,
        finalText:draft
      });
      learningExampleId=learned?.id||null;
    }catch(error:any){
      console.error("VitalVeg learning save failed:",String(error?.message||error));
    }
  }

  await appendActivity("message_sent",{
    actor,
    queueId,
    threadKey:item.threadKey,
    orderId:item.orderId,
    analysisFingerprint:item.analysisFingerprint,
    sourceMessageId:item.sourceMessageId,
    to:item.to,
    subject:item.subject,
    aiDraft,
    finalText:sent.finalText,
    editedByHuman,
    learningExampleId,
    messageId:sent.messageId,
    accepted:sent.accepted,
    rejected:sent.rejected,
    savedToSent:sent.savedToSent,
    sentFolder:sent.sentFolder,
    sentWarning:sent.sentWarning,
    aiManaged:true
  });

  return {...sent,queueId,actor,order,editedByHuman,learningExampleId};
}
