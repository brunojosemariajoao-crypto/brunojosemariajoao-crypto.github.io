import type { Config } from '@netlify/functions';
import { createHmac } from 'node:crypto';
export default async()=>{
 const secret=Netlify.env.get('SESSION_SECRET');if(!secret)return;
 const at=String(Date.now());const signature=createHmac('sha256',secret).update(at).digest('hex');
 const res=await fetch('https://vitalveg-v9-teste.netlify.app/.netlify/functions/mail-sync-background',{method:'POST',redirect:'error',headers:{'x-vv-worker':`${at}.${signature}`}});
 if(!res.ok)throw new Error(`Não foi possível iniciar a receção automática (${res.status})`);
};
export const config:Config={schedule:'* * * * *'};
