import type { Config, Context } from "@netlify/functions";
import { verifyAppSession } from "./app-auth-core.mts";
import { getAiOperationMode, requiredModeConfirmation, setAiOperationMode, validAiOperationMode } from "./ai-mode.mts";
import { getAutonomyPolicy } from "./ai-store.mts";

function json(body:any,status=200){return Response.json(body,{status,headers:{"Cache-Control":"no-store"}});}

export default async (req:Request, context:Context)=>{
  if(!verifyAppSession(req))return json({error:"Sessão VitalVeg não autorizada"},401);
  if(req.method==="GET"){
    const [mode,policy]=await Promise.all([getAiOperationMode(),getAutonomyPolicy()]);
    return json({ok:true,mode,policy,confirmations:{assist:requiredModeConfirmation("assist"),autonomous:requiredModeConfirmation("autonomous")}});
  }
  if(req.method!=="POST")return json({error:"Método não permitido"},405);
  let body:any={};try{body=await req.json();}catch{return json({error:"Pedido inválido"},400);}
  const mode=String(body?.mode||"");
  if(!validAiOperationMode(mode))return json({error:"Modo operacional inválido"},400);
  try{
    const result=await setAiOperationMode(mode,String(body?.confirmationText||""));
    return json({ok:true,...result,policy:await getAutonomyPolicy()});
  }catch(error:any){
    const code=String(error?.code||"AI_MODE_CHANGE_FAILED");
    return json({error:String(error?.message||"Não foi possível alterar o modo"),code},400);
  }
};

export const config:Config={path:"/api/ai/mode"};
