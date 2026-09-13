import {createHmac,timingSafeEqual} from 'node:crypto';
import {verifyAppSession} from './app-auth-core.mts';
import run from './_shared/mail-worker.mts';
export default async(req:Request)=>{
 if(req.method!=='POST')return new Response(null,{status:405});
 const [at,signature]=String(req.headers.get('x-vv-worker')||'').split('.');
 const secret=Netlify.env.get('SESSION_SECRET')||'';
 const expected=createHmac('sha256',secret).update(at||'').digest('hex');
 const worker=!!secret&&Math.abs(Date.now()-Number(at))<60000&&signature?.length===expected.length&&timingSafeEqual(Buffer.from(signature),Buffer.from(expected));
 if(!worker&&!verifyAppSession(req))return new Response(null,{status:401});
 await run();
};
