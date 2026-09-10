(()=>{
  let latest=null,busy=false;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function numberValue(v){
    if(typeof v==='number'&&Number.isFinite(v))return v;
    const s=String(v??'').trim().replace(',','.');
    return /^-?\d+(?:\.\d+)?$/.test(s)?Number(s):null;
  }
  function cleanQty(n){return Number.isInteger(n)?String(n):String(Math.round(n*1000)/1000).replace('.',',');}
  function keyFor(i){return `${String(i.normalizedProduct||i.product||i.rawLine||'Artigo').trim().toLowerCase()}|${String(i.unit||'').trim().toLowerCase()}`;}
  function aggregate(orders){
    const map=new Map();
    for(const order of orders||[]){
      for(const item of order.items||[]){
        const key=keyFor(item);const q=numberValue(item.quantity);
        if(!map.has(key))map.set(key,{product:item.normalizedProduct||item.product||item.rawLine||'Artigo',unit:item.unit||'',numericTotal:0,numericCount:0,raw:[],uncertain:false,orders:0});
        const a=map.get(key);a.orders++;
        if(q!==null){a.numericTotal+=q;a.numericCount++;}else a.raw.push(String(item.quantity??'').trim());
        if(item.uncertain)a.uncertain=true;
      }
    }
    return [...map.values()].sort((a,b)=>String(a.product).localeCompare(String(b.product),'pt'));
  }
  function deliveryLabel(key){
    if(!key)return 'Sem próxima entrega';
    const d=new Date(`${key}T12:00:00Z`);
    return new Intl.DateTimeFormat('pt-PT',{weekday:'long',day:'2-digit',month:'long',timeZone:'UTC'}).format(d).replace(/^./,x=>x.toUpperCase());
  }
  function render(){
    const content=document.querySelector('#content');if(!content)return;
    const h=[...content.querySelectorAll('h2')].find(x=>(x.textContent||'').trim()==='O que precisa da tua atenção');
    if(!h){document.querySelector('#aiPreparationSummary')?.remove();return;}
    if(document.querySelector('#aiPreparationSummary'))return;
    const orders=latest?.nextOrders||[];const date=latest?.summary?.nextDelivery||null;
    const rows=aggregate(orders);
    const uncertain=rows.filter(x=>x.uncertain).length;
    const html=`<section id="aiPreparationSummary" class="panel prep-summary-panel">
      <div class="panel-head"><div><h3>Resumo de preparação</h3><p>${esc(deliveryLabel(date))} · somado a partir das encomendas consolidadas</p></div><div class="page-actions">${date?`<button class="btn ghost" id="prepPrintBtn">Imprimir preparação</button>`:''}<button class="section-link" id="prepOrdersBtn">Ver encomendas</button></div></div>
      <div class="panel-body">
        ${rows.length?`<div class="prep-grid">${rows.map(a=>{
          const qty=a.numericCount?cleanQty(a.numericTotal):a.raw.filter(Boolean).join(' + ')||'—';
          return `<div class="prep-item ${a.uncertain?'uncertain':''}"><div><strong>${esc(a.product)}</strong><small>${esc(a.orders)} linha${a.orders===1?'':'s'} de cliente</small></div><div class="prep-qty"><b>${esc(qty)}</b><span>${esc(a.unit||'')}</span>${a.uncertain?'<em>⚠ confirmar</em>':''}</div></div>`;
        }).join('')}</div>${uncertain?`<div class="prep-warning">⚠ ${uncertain} artigo${uncertain===1?' contém':'s contêm'} pelo menos uma linha incerta. A Central mostra-o, mas não o considera silenciosamente confirmado.</div>`:''}`:'<div class="mini-empty">Ainda não existem artigos para preparar na próxima entrega.</div>'}
      </div></section>`;
    const metrics=content.querySelector('.metric-grid');
    if(metrics)metrics.insertAdjacentHTML('afterend',html);else h.closest('.page-head')?.insertAdjacentHTML('afterend',html);
    document.querySelector('#prepOrdersBtn')?.addEventListener('click',()=>document.querySelector('#mainNav [data-view="deliveries"]')?.click());
    document.querySelector('#prepPrintBtn')?.addEventListener('click',()=>window.open(`./print.html?date=${encodeURIComponent(date)}`,'_blank'));
  }
  async function load(){
    if(busy)return;busy=true;
    try{const r=await fetch('/api/ai/state',{credentials:'include'});if(r.ok)latest=await r.json();}catch{}finally{busy=false;}
    document.querySelector('#aiPreparationSummary')?.remove();render();
  }
  window.addEventListener('load',()=>{
    load();setInterval(load,60000);
    const content=document.querySelector('#content');if(content)new MutationObserver(()=>render()).observe(content,{childList:true,subtree:false});
  });
})();
