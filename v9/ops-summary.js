(()=>{
  let latest=null,busy=false;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function cleanQty(n){
    if(n===null||n===undefined)return '—';
    const value=Number(n);if(!Number.isFinite(value))return String(n);
    return Number.isInteger(value)?String(value):String(Math.round(value*1000)/1000).replace('.',',');
  }
  function deliveryLabel(key){
    if(!key)return 'Sem próxima entrega';
    const d=new Date(`${key}T12:00:00Z`);
    return new Intl.DateTimeFormat('pt-PT',{weekday:'long',day:'2-digit',month:'long',timeZone:'UTC'}).format(d).replace(/^./,x=>x.toUpperCase());
  }
  function detailLines(row){
    const warnings=[];
    if(row.uncertainLineCount){
      warnings.push(`<div class="prep-line-warning"><strong>⚠ ${esc(row.uncertainLineCount)} linha${row.uncertainLineCount===1?'':'s'} incerta${row.uncertainLineCount===1?'':'s'}</strong>${(row.uncertainLines||[]).map(x=>`<span>${esc(x)}</span>`).join('')}</div>`);
    }
    if(row.nonNumericLineCount){
      warnings.push(`<div class="prep-line-warning"><strong>⚠ ${esc(row.nonNumericLineCount)} quantidade${row.nonNumericLineCount===1?'':'s'} não somável${row.nonNumericLineCount===1?'':'eis'}</strong>${(row.nonNumericLines||[]).map(x=>`<span>${esc(x)}</span>`).join('')}</div>`);
    }
    return warnings.join('');
  }
  function rowHtml(row){
    const confirmed=row.confirmedQuantity!==null
      ?`<b>${esc(cleanQty(row.confirmedQuantity))}</b><span>${esc(row.unit||'')}</span>`
      :'<b>—</b><span>sem total seguro</span>';
    const review=row.requiresReview?'<em>⚠ confirmar</em>':'<em class="ok">✓ confirmado</em>';
    return `<article class="prep-item ${row.requiresReview?'uncertain':''}">
      <div class="prep-product"><strong>${esc(row.product||'Artigo')}</strong><small>${esc(row.customerCount||0)} cliente${row.customerCount===1?'':'s'} · ${esc(row.confirmedLineCount||0)} linha${row.confirmedLineCount===1?'':'s'} somada${row.confirmedLineCount===1?'':'s'}</small>${detailLines(row)}</div>
      <div class="prep-qty">${confirmed}${review}</div>
    </article>`;
  }
  function render(){
    const content=document.querySelector('#content');if(!content)return;
    const onToday=document.querySelector('#mainNav [data-view="today"]')?.classList.contains('active');
    if(!onToday){document.querySelector('#aiPreparationSummary')?.remove();return;}
    if(document.querySelector('#aiPreparationSummary'))return;
    const summary=latest?.preparationSummary||null;
    const date=summary?.deliveryDate||latest?.summary?.nextDelivery||null;
    const rows=Array.isArray(summary?.rows)?summary.rows:[];
    const reviewCount=Number(summary?.reviewRowCount||0);
    const html=`<section id="aiPreparationSummary" class="panel prep-summary-panel" aria-live="polite">
      <div class="panel-head"><div><div class="prep-kicker">RESULTADO OPERACIONAL</div><h3>Resumo de preparação</h3><p>${esc(deliveryLabel(date))} · totais calculados no servidor a partir das encomendas consolidadas</p></div><div class="page-actions">${date?`<button class="btn ghost" id="prepPrintBtn">Imprimir preparação</button>`:''}<button class="section-link" id="prepOrdersBtn">Ver encomendas</button></div></div>
      <div class="panel-body">
        <div class="prep-overview"><div><strong>${esc(summary?.orderCount||0)}</strong><span>encomendas</span></div><div><strong>${esc(summary?.rowCount||0)}</strong><span>artigos/unidades</span></div><div class="${reviewCount?'attention':''}"><strong>${esc(reviewCount)}</strong><span>totais a confirmar</span></div></div>
        ${rows.length?`<div class="prep-grid">${rows.map(rowHtml).join('')}</div>`:'<div class="mini-empty">Ainda não existem artigos para preparar na próxima entrega.</div>'}
        ${reviewCount?`<div class="prep-warning"><strong>⚠ Não feches a preparação ainda.</strong> Existem ${esc(reviewCount)} artigo${reviewCount===1?'':'s'} com pelo menos uma linha que a Central não somou automaticamente. Abre a encomenda correspondente e confirma.</div>`:'<div class="prep-all-good">✓ Todos os totais apresentados foram calculados apenas com linhas consideradas seguras.</div>'}
      </div>
    </section>`;
    const metrics=content.querySelector('.metric-grid');
    if(metrics)metrics.insertAdjacentHTML('afterend',html);
    else content.insertAdjacentHTML('afterbegin',html);
    document.querySelector('#prepOrdersBtn')?.addEventListener('click',()=>document.querySelector('#mainNav [data-view="deliveries"]')?.click());
    document.querySelector('#prepPrintBtn')?.addEventListener('click',()=>window.open(`./print.html?date=${encodeURIComponent(date)}`,'_blank','noopener'));
  }
  async function load(){
    if(busy)return;busy=true;
    try{
      const r=await fetch('/api/ai/state',{credentials:'include',headers:{'Cache-Control':'no-cache'}});
      if(r.ok)latest=await r.json();
    }catch{}finally{busy=false;}
    document.querySelector('#aiPreparationSummary')?.remove();render();
  }
  window.addEventListener('load',()=>{
    load();setInterval(load,60000);
    const content=document.querySelector('#content');
    if(content)new MutationObserver(()=>render()).observe(content,{childList:true,subtree:false});
    document.querySelector('#mainNav')?.addEventListener('click',()=>setTimeout(render,0));
    document.querySelector('#refreshBtn')?.addEventListener('click',()=>setTimeout(load,500));
  });
})();
