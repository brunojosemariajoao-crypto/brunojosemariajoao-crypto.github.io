import { verifyAppSession } from "./app-auth-core.mts";
import { verifyDeviceToken } from "./mail-core.mts";

function cookie(req:Request,name:string){
  const raw=req.headers.get("cookie")||"";
  const hit=raw.split(";").map(x=>x.trim()).find(x=>x.startsWith(`${name}=`));
  return hit?decodeURIComponent(hit.slice(name.length+1)):"";
}

export async function authorizedRequest(req:Request){
  if(verifyAppSession(req))return {authorized:true,mode:"session" as const};
  const legacy=cookie(req,"vv_device");
  if(legacy && await verifyDeviceToken(legacy))return {authorized:true,mode:"legacy" as const};
  return {authorized:false,mode:"none" as const};
}
