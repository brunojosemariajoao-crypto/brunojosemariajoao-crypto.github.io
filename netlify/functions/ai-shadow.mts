import type { Config, Context } from "@netlify/functions";
import { verifyAppSession } from "./app-auth-core.mts";
import { getAiOperationMode } from "./ai-mode.mts";
import { listShadowEvaluations, reviewShadowEvaluation, summarizeShadow } from "./ai-shadow-core.mts";

function json(body:any,status=200){return Response.json(body,{status,headers:{"Cache-Control":"no-store"}});}

export default async (req:Request, context:Context)=>{
  if(!verifyAppSession(req))return json({error:"Sessão VitalVeg não autorizada"},401);
  if(req.method==="GET"){
    const url=new URL(req.url);
    const limit=Math.max(1,Math.min(200,Number(url.searchParams.get("limit")||100)));
    const evaluations=await listShadowEvaluations(limit);
    return json({ok:true,mode:await getAiOperationMode(),summary:summarizeShadow(evaluations),evaluations});
  }
  if(req.method!=="POST")return json({error:"Método não permitido"},405);
  let body:any={};try{body=await req.json();}catch{return json({error:"Pedido inválido"},400);}
  const fingerprint=String(body?.fingerprint||"").trim();
  const verdict=String(body?.verdict||"") as any;
  if(!fingerprint)return json({error:"Falta a avaliação a rever"},400);
  try{
    const evaluation=await reviewShadowEvaluation(fingerprint,verdict,String(body?.feedback||""));
    const all=await listShadowEvaluations(100);
    return json({ok:true,evaluation,summary:summarizeShadow(all)});
  }catch(error:any){return json({error:String(error?.message||"Não foi possível guardar a avaliação")},400);}
};

export const config:Config={path:"/api/ai/shadow"};
