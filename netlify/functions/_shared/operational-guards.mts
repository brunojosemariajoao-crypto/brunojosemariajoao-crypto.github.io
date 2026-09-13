export function emailAddress(value:any){const s=String(value||'');return (s.match(/<([^>]+)>/)?.[1]||s.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i)?.[0]||'').trim().toLowerCase();}
export function noticeContext(all:any[],messages:any[]){
 const inbound=[...messages].filter(m=>m.direction!=='out').sort((a,b)=>Date.parse(a.date)-Date.parse(b.date)).at(-1);
 if(!inbound)return [];
 const at=Date.parse(inbound.date),customer=emailAddress(inbound.from),ids=new Set(messages.map(m=>m.messageId||m.id));
 return all.filter(m=>m.direction==='out'&&!ids.has(m.messageId||m.id)&&(String(m.to||'').toLowerCase().match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/g)||[]).includes(customer)&&customer&&Date.parse(m.date)<=at&&Date.parse(m.date)>=at-8*86400000&&/indispon|n[aã]o.{0,40}(h[aá]|temos|dispon[ií]ve|entrega)|primeira apanha/i.test(m.text||'')).sort((a,b)=>Date.parse(a.date)-Date.parse(b.date)).slice(-8);
}
export function replyBlockReason(messages:any[],activatedAt:string|null,now=Date.now()){
 const incoming=[...messages].filter(m=>m.direction!=='out').sort((a,b)=>Date.parse(a.date)-Date.parse(b.date)).at(-1);
 if(!incoming)return 'Sem mensagem recebida.';
 const at=Date.parse(incoming.date);
 if(!activatedAt||!Number.isFinite(at)||at<Date.parse(activatedAt)||now-at>48*3600000)return 'Histórico importado: não enviar uma nova confirmação automática.';
 if(messages.some(m=>m.direction==='out'&&Date.parse(m.date)>=at))return 'Já existe uma resposta enviada depois deste pedido.';
 return '';
}
export function operationalReceipt(order:any){
 const fmt=(i:any)=>`${i.quantity??''} ${i.unit||''} ${i.product||''}`.replace(/\s+/g,' ').trim();
 const available=(order.items||[]).filter((i:any)=>i.fulfillment!=='unavailable');
 const unavailable=(order.items||[]).filter((i:any)=>i.fulfillment==='unavailable');
 const date=String(order.deliveryDate||'').split('-').reverse().join('/');
 return `Bom dia,\n\nConfirmamos a receção da sua encomenda para ${date}:\n${available.map((i:any)=>'- '+fmt(i)).join('\n')||'Sem artigos disponíveis confirmados.'}${unavailable.length?'\n\nNão estão disponíveis para esta entrega e não ficam confirmados:\n'+unavailable.map((i:any)=>'- '+fmt(i)).join('\n'):''}\n\nObrigado.\nVitalVeg`;
}
