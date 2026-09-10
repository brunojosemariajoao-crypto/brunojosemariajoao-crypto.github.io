import { getStore } from "@netlify/blobs";

declare const Netlify:any;
const STORE_NAME="vitalveg-v9";
const DEFAULT_DAILY_BUDGET_USD=0.50;

const PRICES:Record<string,{input:number;cached:number;output:number}>={
  "gpt-5.6-luna":{input:0.20,cached:0.02,output:1.20},
  "gpt-5.6-terra":{input:2.00,cached:0.20,output:12.00},
  "gpt-5.6-sol":{input:4.00,cached:0.40,output:20.00},
  "gpt-5.6":{input:4.00,cached:0.40,output:20.00}
};

function store(){return getStore(STORE_NAME,{consistency:"strong"});}
function lisbonDay(date=new Date()){
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Lisbon",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(date);
  const get=(t:string)=>parts.find(x=>x.type===t)?.value||"";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
function key(day=lisbonDay()){return `usage/ai/${day}.json`;}
function number(value:any){const n=Number(value||0);return Number.isFinite(n)?n:0;}

export type AiUsage={
  day:string;calls:number;inputTokens:number;cachedInputTokens:number;outputTokens:number;
  estimatedCostUsd:number;models:Record<string,{calls:number;inputTokens:number;outputTokens:number;estimatedCostUsd:number}>;
  updatedAt:string;
};

export function configuredDailyBudget(){
  const raw=Number(Netlify.env.get("OPENAI_DAILY_BUDGET_USD")||DEFAULT_DAILY_BUDGET_USD);
  return Number.isFinite(raw)&&raw>0?raw:DEFAULT_DAILY_BUDGET_USD;
}

export function estimateCallCost(model:string,usage:any){
  const p=PRICES[model];
  if(!p)return {known:false,costUsd:0,inputTokens:number(usage?.input_tokens),cachedInputTokens:number(usage?.input_tokens_details?.cached_tokens),outputTokens:number(usage?.output_tokens)};
  const input=number(usage?.input_tokens);
  const cached=Math.min(input,number(usage?.input_tokens_details?.cached_tokens));
  const uncached=Math.max(0,input-cached);
  const output=number(usage?.output_tokens);
  const cost=(uncached*p.input+cached*p.cached+output*p.output)/1_000_000;
  return {known:true,costUsd:cost,inputTokens:input,cachedInputTokens:cached,outputTokens:output};
}

export async function getAiUsage(day=lisbonDay()):Promise<AiUsage>{
  const saved:any=await store().get(key(day),{type:"json"});
  return saved||{day,calls:0,inputTokens:0,cachedInputTokens:0,outputTokens:0,estimatedCostUsd:0,models:{},updatedAt:new Date().toISOString()};
}

export async function getAiBudgetStatus(){
  const usage=await getAiUsage();
  const budgetUsd=configuredDailyBudget();
  return {usage,budgetUsd,remainingUsd:Math.max(0,budgetUsd-usage.estimatedCostUsd),exhausted:usage.estimatedCostUsd>=budgetUsd};
}

export async function assertAiBudgetAvailable(){
  const status=await getAiBudgetStatus();
  if(status.exhausted){
    const error:any=new Error(`Limite diário de IA atingido (${status.budgetUsd.toFixed(2)} USD).`);
    error.code="AI_BUDGET_EXCEEDED";
    throw error;
  }
  return status;
}

export async function recordAiCall(model:string,usage:any){
  const current=await getAiUsage();
  const estimated=estimateCallCost(model,usage);
  const prior=current.models[model]||{calls:0,inputTokens:0,outputTokens:0,estimatedCostUsd:0};
  const next:AiUsage={
    ...current,
    calls:current.calls+1,
    inputTokens:current.inputTokens+estimated.inputTokens,
    cachedInputTokens:current.cachedInputTokens+estimated.cachedInputTokens,
    outputTokens:current.outputTokens+estimated.outputTokens,
    estimatedCostUsd:current.estimatedCostUsd+estimated.costUsd,
    models:{...current.models,[model]:{
      calls:prior.calls+1,
      inputTokens:prior.inputTokens+estimated.inputTokens,
      outputTokens:prior.outputTokens+estimated.outputTokens,
      estimatedCostUsd:prior.estimatedCostUsd+estimated.costUsd
    }},
    updatedAt:new Date().toISOString()
  };
  await store().setJSON(key(current.day),next);
  return {usage:next,estimate:estimated,budget:await getAiBudgetStatus()};
}
