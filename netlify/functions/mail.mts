import type { Context, Config } from "@netlify/functions";
import { fetchMailbox, getCachedMail, getStoredCredentials, verifyDeviceToken } from "./mail-core.mts";

function bearer(req:Request){const h=req.headers.get("authorization")||"";return h.toLowerCase().startsWith("bearer ")?h.slice(7).trim():"";}

export default async (req:Request, context:Context)=>{
  if(!["GET","POST"].includes(req.method)) return Response.json({error:"Método não permitido"},{status:405});
  const token=bearer(req);
  if(!(await verifyDeviceToken(token))) return Response.json({error:"Dispositivo não autorizado"},{status:401});

  try{
    if(req.method==="GET"){
      const cached=await getCachedMail();
      if(!cached) return Response.json({ok:true,cached:true,fetchedAt:null,messages:[]});
      return Response.json({...cached,cached:true});
    }
    const {email,password}=await getStoredCredentials();
    const result=await fetchMailbox(email,password);
    return Response.json({...result,cached:false});
  }catch(error:any){
    const msg=String(error?.message||"Não foi possível ler o email");
    const authFailed=/auth|login|password|credentials/i.test(msg);
    return Response.json({error:authFailed?"Falha de autenticação no email. Atualiza a configuração da caixa.":`Erro IMAP: ${msg}`},{status:authFailed?401:502});
  }
};

export const config:Config={path:"/api/mail"};
