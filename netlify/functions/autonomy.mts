import type { Config, Context } from "@netlify/functions";
import { verifyAppSession } from "./app-auth-core.mts";
import { DEFAULT_AUTONOMY_POLICY, type AutonomyPolicy } from "./autonomy-core.mts";
import { appendActivity, getAutonomyPolicy, saveAutonomyPolicy } from "./ai-store.mts";

function json(body:any,status=200){return Response.json(body,{status,headers:{"Cache-Control":"no-store"}});}

export default async (req:Request, context:Context)=>{
  if(!verifyAppSession(req))return json({error:"Sessão VitalVeg não autorizada"},401);
  if(req.method==="GET")return json({ok:true,policy:await getAutonomyPolicy(),defaults:DEFAULT_AUTONOMY_POLICY});
  if(req.method!=="POST")return json({error:"Método não permitido"},405);
  let body:any={};try{body=await req.json();}catch{return json({error:"Pedido inválido"},400);}
  const current=await getAutonomyPolicy();
  const level=Number(body?.level??current.level);
  if(![0,1,2,3].includes(level))return json({error:"Nível de autonomia inválido"},400);
  if(level>=2 && body?.confirmAutonomy!==true)return json({error:"A ativação de envio autónomo exige confirmação explícita"},400);
  if(level===3 && String(body?.confirmationText||"")!=="ATIVAR AUTONOMIA ALARGADA")return json({error:"A autonomia alargada exige confirmação reforçada"},400);
  const min=Number(body?.minAutoConfidence??current.minAutoConfidence);
  if(!Number.isFinite(min)||min<0.90||min>1)return json({error:"A confiança mínima autónoma tem de ficar entre 0,90 e 1,00"},400);

  const policy:AutonomyPolicy={
    level:level as 0|1|2|3,
    minAutoConfidence:min,
    autoMessageTypes:Array.isArray(body?.autoMessageTypes)?body.autoMessageTypes.map(String):current.autoMessageTypes,
    autoOrderReceiptConfirmation:body?.autoOrderReceiptConfirmation===undefined?current.autoOrderReceiptConfirmation:body.autoOrderReceiptConfirmation===true,
    blockCommercialRisk:Array.isArray(body?.blockCommercialRisk)?body.blockCommercialRisk.map(String):current.blockCommercialRisk,
    requireApprovalForUnknownItems:body?.requireApprovalForUnknownItems===undefined?current.requireApprovalForUnknownItems:body.requireApprovalForUnknownItems!==false
  };
  if(!policy.blockCommercialRisk.includes("high"))return json({error:"Risco comercial alto não pode ser libertado para envio autónomo nesta versão"},400);
  if(!policy.requireApprovalForUnknownItems)return json({error:"Artigos ou linhas incertas continuam obrigatoriamente sujeitos a revisão"},400);
  await saveAutonomyPolicy(policy);
  await appendActivity("autonomy_policy_changed",{before:current,after:policy});
  return json({ok:true,policy});
};

export const config:Config={path:"/api/autonomy"};
