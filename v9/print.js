const esc=(v='')=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const root=document.querySelector('#printRoot');
const params=new URLSearchParams(location.search);const deliveryDate=params.get('date')||'';
const ptDate=new Intl.DateTimeFormat('pt-PT',{weekday:'long',day:'2-digit',month:'long',year:'numeric',timeZone:'UTC'});
const ptStamp=new Intl.DateTimeFormat('pt-PT',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Lisbon'});
function dateLabel(key){if(!key)return 'Sem data';return ptDate.format(new Date(`${key}T12:00:00Z`)).replace(/^./,c=>c.toUpperCase());}
function itemRow(i){return `<tr><td class="qty">${esc(i.quantity??'—')}</td><td class="unit">${esc(i.unit||'—')}</td><td><strong>${esc(i.product||i.rawLine||'—')}</strong>${i.uncertain?'<div class="warning">Linha a confirmar</div>':''}</td><td class="notes">${esc(i.notes||'')}</td></tr>`;}
function orderSheet(o){return `<section class="order-sheet"><div class="order-head"><div><h2>${esc(o.storeName||o.customerName||o.customerEmail||'Cliente')}</h2><p>${esc(o.customerEmail||'')}</p></div><div class="number">ORDEM DE ENCOMENDA<strong>${esc(o.number||'—')}</strong></div></div><table class="items"><thead><tr><th>Qtd.</th><th>Unidade</th><th>Produto</th><th>Observações</th></tr></thead><tbody>${(o.items||[]).map(itemRow).join('')||'<tr><td colspan="4">Sem linhas de produto.</td></tr>'}</tbody></table>${(o.reviewReasons||[]).length?`<div class="warning">ATENÇÃO: ${esc(o.reviewReasons.join(' · '))}</div>`:''}<div class="checks"><span><i class="box"></i>Preparado</span><span><i class="box"></i>Conferido</span><span><i class="box"></i>Carregado</span><span><i class="box"></i>Entregue</span></div></section>`;}
async function loadLogo(){const img=document.querySelector('#originalLogo');if(!img)return;img.onload=()=>{img.hidden=false;document.querySelector('#brandFallback').hidden=true;};img.onerror=()=>{img.hidden=true;document.querySelector('#brandFallback').hidden=false;};img.src='../assets/vitalveg-logo-original.png';}
async function load(){
  if(!deliveryDate){root.innerHTML='<div class="error">Falta a data de entrega.</div>';return;}
  try{
    const res=await fetch(`/api/orders?deliveryDate=${encodeURIComponent(deliveryDate)}`,{credentials:'include'});
    const data=await res.json().catch(()=>({}));
    if(res.status===401){root.innerHTML='<div class="error">Sessão terminada. Volta à Central, entra com o PIN e abre novamente a impressão.</div>';return;}
    if(!res.ok)throw new Error(data.error||'Não foi possível obter as encomendas.');
    const orders=(data.orders||[]).filter(o=>!['cancelled','historical'].includes(o.status));
    const lineCount=orders.reduce((n,o)=>n+(o.items?.length||0),0);
    root.innerHTML=`<header class="document-head"><div class="brand"><img id="originalLogo" alt="VitalVeg" hidden><div id="brandFallback" class="brand-fallback"><strong>VitalVeg</strong><span>Central Inteligente de Operações</span></div></div><div class="doc-meta"><h1>FOLHA DE PREPARAÇÃO E DISTRIBUIÇÃO</h1><p>Entrega: <strong>${esc(dateLabel(deliveryDate))}</strong></p></div></header><div class="summary-line"><span><strong>${orders.length}</strong> encomendas</span><span><strong>${lineCount}</strong> linhas de produto</span><span>Gerado em ${esc(ptStamp.format(new Date()))}</span></div>${orders.length?orders.map(orderSheet).join(''):'<div class="empty">Não existem encomendas para esta data.</div>'}<div class="footer"><span>VitalVeg · Central Inteligente</span><span>Data de entrega ${esc(deliveryDate)}</span></div><div class="ai-note">Documento operacional gerado a partir das encomendas consolidadas pela Central. Linhas sinalizadas devem ser confirmadas antes da preparação.</div>`;
    loadLogo();
  }catch(e){root.innerHTML=`<div class="error">${esc(e.message)}</div>`;}
}
document.querySelector('#backBtn').onclick=()=>history.length>1?history.back():location.assign('/v9/');
document.querySelector('#printBtn').onclick=()=>window.print();
load();
