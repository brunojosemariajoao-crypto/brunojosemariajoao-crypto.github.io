import { createHash } from "node:crypto";
import { getStore } from "@netlify/blobs";

const STORE_NAME="vitalveg-v9";
const PREFIX="learning/examples/";
function store(){return getStore(STORE_NAME,{consistency:"strong"});}

export type LearningExample={
  id:string;
  kind:"edited_reply"|"shadow_feedback";
  createdAt:string;
  customerEmail:string|null;
  subject:string;
  sourceText:string;
  messageType:string|null;
  aiDraft:string|null;
  preferredReply:string|null;
  guidance:string|null;
  sourceId:string|null;
};

function norm(value:any){return String(value??"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9@. ]+/g," ").replace(/\s+/g," ").trim();}
function terms(value:any){
  const stop=new Set(["para","com","uma","uns","das","dos","que","por","esta","este","boa","bom","dia","re","fwd","enc","de","do","da","e","a","o"]);
  return new Set(norm(value).split(" ").filter(x=>x.length>=4&&!stop.has(x)));
}
function overlap(a:Set<string>,b:Set<string>){let n=0;for(const x of a)if(b.has(x))n++;return n;}
function idFor(value:string){return createHash("sha256").update(value).digest("hex").slice(0,24);}
function clip(value:any,max:number){return String(value??"").trim().slice(0,max);}

export function learningRelevance(example:LearningExample,query:{customerEmail?:string|null;subject?:string;text?:string}){
  let score=0;
  const email=norm(query.customerEmail||"");
  if(email && norm(example.customerEmail||"")===email)score+=8;
  const subjectOverlap=overlap(terms(example.subject),terms(query.subject));
  const textOverlap=overlap(terms(`${example.subject} ${example.sourceText}`),terms(`${query.subject||""} ${query.text||""}`));
  score+=Math.min(4,subjectOverlap*2)+Math.min(5,textOverlap);
  if(example.kind==="edited_reply")score+=1;
  return score;
}

export async function saveEditedReplyLearning(input:{
  queueId:string;customerEmail?:string|null;subject?:string;sourceText?:string;messageType?:string|null;aiDraft?:string;finalText?:string;
}){
  const aiDraft=clip(input.aiDraft,5000),finalText=clip(input.finalText,5000);
  if(!aiDraft||!finalText||aiDraft===finalText)return null;
  const now=new Date().toISOString();
  const id=`edit_${idFor(`${input.queueId}|${aiDraft}|${finalText}`)}`;
  const example:LearningExample={
    id,kind:"edited_reply",createdAt:now,customerEmail:clip(input.customerEmail,320).toLowerCase()||null,
    subject:clip(input.subject,500),sourceText:clip(input.sourceText,5000),messageType:clip(input.messageType,80)||null,
    aiDraft,preferredReply:finalText,guidance:null,sourceId:clip(input.queueId,300)||null
  };
  await store().setJSON(`${PREFIX}${id}.json`,example);
  return example;
}

export async function saveShadowFeedbackLearning(input:{
  fingerprint:string;customerEmail?:string|null;subject?:string;sourceText?:string;messageType?:string|null;aiDraft?:string|null;verdict:string;feedback?:string;
}){
  const verdict=String(input.verdict||"");
  const feedback=clip(input.feedback,2000);
  if(!["partial","incorrect"].includes(verdict)||!feedback)return null;
  const now=new Date().toISOString();
  const id=`shadow_${idFor(`${input.fingerprint}|${verdict}|${feedback}`)}`;
  const example:LearningExample={
    id,kind:"shadow_feedback",createdAt:now,customerEmail:clip(input.customerEmail,320).toLowerCase()||null,
    subject:clip(input.subject,500),sourceText:clip(input.sourceText,5000),messageType:clip(input.messageType,80)||null,
    aiDraft:clip(input.aiDraft,5000)||null,preferredReply:null,guidance:feedback,sourceId:clip(input.fingerprint,300)||null
  };
  await store().setJSON(`${PREFIX}${id}.json`,example);
  return example;
}

export async function listLearningExamples(limit=250):Promise<LearningExample[]>{
  const listed:any=await store().list({prefix:PREFIX});
  const keys=(listed?.blobs||[]).map((x:any)=>x.key).slice(0,Math.max(1,limit));
  const values=(await Promise.all(keys.map((k:string)=>store().get(k,{type:"json"})))).filter(Boolean) as LearningExample[];
  return values.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function getRelevantLearningExamples(query:{customerEmail?:string|null;subject?:string;text?:string},limit=3){
  const all=await listLearningExamples(250);
  return all.map(example=>({example,score:learningRelevance(example,query)}))
    .filter(x=>x.score>=2)
    .sort((a,b)=>b.score-a.score||String(b.example.createdAt).localeCompare(String(a.example.createdAt)))
    .slice(0,Math.max(0,Math.min(5,limit)))
    .map(x=>({
      kind:x.example.kind,
      messageType:x.example.messageType,
      customerMatch:!!query.customerEmail&&norm(x.example.customerEmail)===norm(query.customerEmail),
      subject:x.example.subject,
      sourceText:clip(x.example.sourceText,1800),
      aiDraft:clip(x.example.aiDraft,1600)||null,
      preferredReply:clip(x.example.preferredReply,1600)||null,
      operatorGuidance:clip(x.example.guidance,1200)||null
    }));
}
