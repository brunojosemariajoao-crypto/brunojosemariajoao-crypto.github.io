import type { Config } from "@netlify/functions";
import { fetchMailbox, getStoredCredentials, mailboxConfigured } from "./mail-core.mts";

export default async () => {
  try{
    if(!(await mailboxConfigured())) return;
    const {email,password}=await getStoredCredentials();
    await fetchMailbox(email,password);
  }catch(error:any){
    console.error("VitalVeg background mail sync failed:",String(error?.message||error));
  }
};

export const config:Config={schedule:"*/5 * * * *"};
