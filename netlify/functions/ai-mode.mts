import { appendActivity, getAutonomyPolicy, getJson, saveAutonomyPolicy, setJson } from "./ai-store.mts";

export type AiOperationMode="shadow"|"assist"|"autonomous";
const KEY="config/ai-operation-mode.json";
export const DEFAULT_AI_OPERATION_MODE:AiOperationMode="shadow";

export function validAiOperationMode(value:any):value is AiOperationMode{
  return ["shadow","assist","autonomous"].includes(String(value||""));
}

export async function getAiOperationMode():Promise<AiOperationMode>{
  const stored:any=await getJson(KEY);
  return validAiOperationMode(stored?.mode)?stored.mode:DEFAULT_AI_OPERATION_MODE;
}

export function requiredModeConfirmation(mode:AiOperationMode){
  if(mode==="assist")return "ATIVAR ASSISTENTE";
  if(mode==="autonomous")return "ATIVAR FUNCIONARIO AUTONOMO";
  return "";
}

export async function setAiOperationMode(mode:AiOperationMode,confirmationText=""){
  if(!validAiOperationMode(mode))throw new Error("Modo operacional de IA inválido");
  const before=await getAiOperationMode();
  if(mode===before)return {mode,before,changed:false};

  const required=requiredModeConfirmation(mode);
  if(required && String(confirmationText||"").trim()!==required){
    const error:any=new Error(`Confirmação necessária: ${required}`);
    error.code="AI_MODE_CONFIRMATION_REQUIRED";
    throw error;
  }

  if(mode==="autonomous"){
    const policy=await getAutonomyPolicy();
    if(Number(policy.level||0)<2){
      const error:any=new Error("Antes de ativar o Funcionário Autónomo, configura uma política de autonomia de nível 2 ou 3.");
      error.code="AUTONOMY_POLICY_REQUIRED";
      throw error;
    }
  }

  // Assistente significa sempre aprovação humana. Mesmo que exista uma política
  // antiga de nível 2/3, voltar a Assistente fecha imediatamente o envio autónomo.
  if(mode==="assist"){
    const policy=await getAutonomyPolicy();
    if(policy.level!==1)await saveAutonomyPolicy({...policy,level:1});
  }

  const value={mode,previousMode:before,updatedAt:new Date().toISOString()};
  await setJson(KEY,value);
  await appendActivity("ai_operation_mode_changed",{before,after:mode});
  return {mode,before,changed:true};
}
