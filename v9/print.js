const esc=(v='')=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const root=document.querySelector('#printRoot');
const params=new URLSearchParams(location.search);const deliveryDate=params.get('date')||'';
const ptDate=new Intl.DateTimeFormat('pt-PT',{weekday:'long',day:'2-digit',month:'long',year:'numeric',timeZone:'UTC'});
const ptStamp=new Intl.DateTimeFormat('pt-PT',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Lisbon'});
function dateLabel(key){if(!key)return 'Sem data';return ptDate.format(new Date(`${key}T12:00:00Z`)).replace(/^./,c=>c.toUpperCase());}
function qty(v){if(v===null||v===undefined)return '—';const n=Number(v);if(!Number.isFinite(n))return String(v);return Number.isInteger(n)?String(n):String(Math.round(n*1000)/1000).replace('.',',');}
function itemRow(i){return `<tr><td class="qty">${esc(i.quantity??'—')}</td><td class="unit">${esc(i.unit||'—')}</td><td><strong>${esc(i.product||i.rawLine||'—')}</strong>${i.uncertain?'<div class="warning">Linha a confirmar</div>':''}</td><td class="notes">${esc(i.notes||'')}</td></tr>`;}
function orderSheet(o){return `<section class="order-sheet"><div class="order-head"><div><h2>${esc(o.storeName||o.customerName||o.customerEmail||'Cliente')}</h2><p>${esc(o.customerEmail||'')}</p></div><div class="number">ORDEM DE ENCOMENDA<strong>${esc(o.number||'—')}</strong></div></div><table class="items"><thead><tr><th>Qtd.</th><th>Unidade</th><th>Produto</th><th>Observações</th></tr></thead><tbody>${(o.items||[]).map(itemRow).join('')||'<tr><td colspan="4">Sem linhas de produto.</td></tr>'}</tbody></table>${(o.reviewReasons||[]).length?`<div class="warning">ATENÇÃO: ${esc(o.reviewReasons.join(' · '))}</div>`:''}<div class="checks"><span><i class="box"></i>Preparado</span><span><i class="box"></i>Conferido</span><span><i class="box"></i>Carregado</span><span><i class="box"></i>Entregue</span></div></section>`;}
function preparationTable(summary){
  const rows=Array.isArray(summary?.rows)?summary.rows:[];
  if(!rows.length)return '<section class="prep-sheet"><h2>RESUMO DE PREPARAÇÃO</h2><div class="empty compact">Sem artigos agregados.</div></section>';
  return `<section class="prep-sheet"><div class="prep-title"><div><h2>RESUMO DE PREPARAÇÃO</h2><p>Totais calculados no servidor. Linhas duvidosas não entram silenciosamente na soma.</p></div><div class="prep-review ${summary.reviewRowCount?'has-review':''}"><strong>${esc(summary.reviewRowCount||0)}</strong><span>a confirmar</span></div></div><table class="prep-table"><thead><tr><th>Produto</th><th>Qtd. confirmada</th><th>Unidade</th><th>Clientes</th><th>Revisão</th></tr></thead><tbody>${rows.map(r=>{
    const notes=[];
    if(r.uncertainLineCount)notes.push(`${r.uncertainLineCount} linha(s) incerta(s): ${(r.uncertainLines||[]).join(' · ')}`);
    if(r.nonNumericLineCount)notes.push(`${r.nonNumericLineCount} quantidade(s) não somável(eis): ${(r.nonNumericLines||[]).join(' · ')}`);
    return `<tr class="${r.requiresReview?'review-row':''}"><td><strong>${esc(r.product||'Artigo')}</strong></td><td class="prep-total">${esc(qty(r.confirmedQuantity))}</td><td>${esc(r.unit||'—')}</td><td>${esc(r.customerCount||0)}</td><td>${r.requiresReview?`<span class="warning-inline">⚠ CONFIRMAR</span><small>${esc(notes.join(' | '))}</small>`:'<span class="ok-inline">✓ OK</span>'}</td></tr>`;
  }).join('')}</tbody></table>${summary.reviewRowCount?'<div class="prep-alert">ATENÇÃO: existem linhas que não foram incluídas nos totais confirmados. Rever antes de fechar a preparação.</div>':'<div class="prep-ok">Todos os totais foram calculados apenas com linhas consideradas seguras.</div>'}</section>`;
}
async function loadLogo(){const img=document.querySelector('#originalLogo');if(!img)return;img.onload=()=>{img.hidden=false;document.querySelector('#brandFallback').hidden=true;};img.onerror=()=>{img.hidden=true;document.querySelector('#brandFallback').hidden=false;};img.src='../assets/vitalveg-logo-original.png';}
async function load(){
  if(!deliveryDate){root.innerHTML='<div class="error">Falta a data de entrega.</div>';return;}
  try{
    const res=await fetch(`/api/orders?deliveryDate=${encodeURIComponent(deliveryDate)}`,{credentials:'include',headers:{'Cache-Control':'no-cache'}});
    const data=await res.json().catch(()=>({}));
    if(res.status===401){root.innerHTML='<div class="error">Sessão terminada. Volta à Central, entra com o PIN e abre novamente a impressão.</div>';return;}
    if(!res.ok)throw new Error(data.error||'Não foi possível obter as encomendas.');
    const orders=(data.orders||[]).filter(o=>!['cancelled','historical'].includes(o.status));
    const prep=data.preparationSummary||{deliveryDate,orderCount:orders.length,rowCount:0,reviewRowCount:0,rows:[]};
    const lineCount=orders.reduce((n,o)=>n+(o.items?.length||0),0);
    root.innerHTML=`<header class="document-head"><div class="brand"><img id="originalLogo" alt="VitalVeg" hidden><div id="brandFallback" class="brand-fallback"><strong>VitalVeg</strong><span>Central Inteligente de Operações</span></div></div><div class="doc-meta"><h1>FOLHA DE PREPARAÇÃO E DISTRIBUIÇÃO</h1><p>Entrega: <strong>${esc(dateLabel(deliveryDate))}</strong></p></div></header><div class="summary-line"><span><strong>${orders.length}</strong> encomendas</span><span><strong>${lineCount}</strong> linhas de produto</span><span><strong>${esc(prep.rowCount||0)}</strong> totais de preparação</span><span>Gerado em ${esc(ptStamp.format(new Date()))}</span></div>${preparationTable(prep)}${orders.length?orders.map(orderSheet).join(''):'<div class="empty">Não existem encomendas para esta data.</div>'}<div class="footer"><span>VitalVeg · Central Inteligente</span><span>Data de entrega ${esc(deliveryDate)}</span></div><div class="ai-note">Documento operacional gerado a partir das encomendas consolidadas pela Central. Linhas sinalizadas devem ser confirmadas antes da preparação.</div>`;
    loadLogo();
  }catch(e){root.innerHTML=`<div class="error">${esc(e.message)}</div>`;}
}
document.querySelector('#backBtn').onclick=()=>history.length>1?history.back():location.assign('/');
document.querySelector('#printBtn').onclick=()=>window.print();
load();
