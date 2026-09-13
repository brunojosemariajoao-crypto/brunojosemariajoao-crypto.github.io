import type { AiAnalysis, OrderRecord } from "./order-engine.mts";

export type AutonomyLevel = 0|1|2|3;
export type AutonomyPolicy = {
  level:AutonomyLevel;
  minAutoConfidence:number;
  autoMessageTypes:string[];
  autoOrderReceiptConfirmation:boolean;
  blockCommercialRisk:string[];
  requireApprovalForUnknownItems:boolean;
};

export const DEFAULT_AUTONOMY_POLICY:AutonomyPolicy={
  level:1,
  minAutoConfidence:0.97,
  autoMessageTypes:["PEDIDO_CONFIRMACAO"],
  autoOrderReceiptConfirmation:false,
  blockCommercialRisk:["medium","high"],
  requireApprovalForUnknownItems:true
};

export type AutonomyDecision={
  mode:"ignore"|"review"|"await_approval"|"auto_execute";
  canSend:boolean;
  reasons:string[];
};

export function decideAutonomy(analysis:AiAnalysis,order:OrderRecord|null,policy:AutonomyPolicy=DEFAULT_AUTONOMY_POLICY):AutonomyDecision{
  const reasons:string[]=[];
  const hasReply=!!String(analysis.suggestedReply||"").trim();
  const uncertainItem=!!order?.items?.some(x=>x.uncertain || Number(x.confidence||0)<0.90);

  if(["SEM_ACAO","AUTOMATICO_SISTEMA","PUBLICIDADE_MARKETING","DOCUMENTO_FATURA"].includes(analysis.messageType) && !hasReply){
    return {mode:"ignore",canSend:false,reasons:["Não existe resposta operacional a enviar."]};
  }
  if(analysis.needsHumanReview){
    reasons.push(...(analysis.reviewReasons||[]));
    return {mode:"review",canSend:false,reasons:[...new Set(reasons)]};
  }
  if(policy.blockCommercialRisk.includes(analysis.commercialRisk)){
    reasons.push(`Risco comercial ${analysis.commercialRisk}: exige decisão humana.`);
    return {mode:"review",canSend:false,reasons};
  }
  if(policy.requireApprovalForUnknownItems && uncertainItem){
    reasons.push("A encomenda contém pelo menos uma linha incerta.");
    return {mode:"review",canSend:false,reasons};
  }
  if(!hasReply){
    return {mode:"ignore",canSend:false,reasons:["A IA não propôs resposta para esta ação."]};
  }
  if(policy.level<=1){
    return {mode:"await_approval",canSend:true,reasons:["Modo atual: a IA prepara e o operador confirma antes do envio."]};
  }

  const allowedType=policy.autoMessageTypes.includes(analysis.messageType) ||
    (policy.autoOrderReceiptConfirmation && analysis.messageType==="ENCOMENDA");
  if(!allowedType){
    return {mode:"await_approval",canSend:true,reasons:["Este tipo de mensagem não está autorizado para envio autónomo."]};
  }
  if(Number(analysis.confidence||0)<policy.minAutoConfidence){
    return {mode:"await_approval",canSend:true,reasons:[`Confiança abaixo do mínimo autónomo (${policy.minAutoConfidence}).`]};
  }
  if(order && ["review","cancelled"].includes(order.status)){
    return {mode:"review",canSend:false,reasons:["O estado da encomenda bloqueia execução autónoma."]};
  }
  return {mode:"auto_execute",canSend:true,reasons:["A ação cumpre as regras configuradas para autonomia."]};
}
