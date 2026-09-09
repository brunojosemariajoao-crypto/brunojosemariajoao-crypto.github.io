/* Central VitalVeg V8.5 — impressão autónoma e compatível com mobile */
(() => {
  const MANUAL_KEY='vitalveg-manual-orders-v1';
  const NUMBERS_KEY='vitalveg-order-numbers-v1';
  const COUNTER_KEY='vitalveg-order-counter-v1';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pad=n=>String(n).padStart(2,'0');
  const isoDate=value=>{const d=value instanceof Date?value:new Date(value);return Number.isNaN(d.getTime())?'':`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;};
  const prettyDay=s=>{const d=s?new Date(`${s}T12:00:00`):null;return d&&!Number.isNaN(d.getTime())?new Intl.DateTimeFormat('pt-PT',{weekday:'long',day:'2-digit',month:'2-digit',year:'numeric'}).format(d):'Sem data';};
  const load=(k,f)=>{try{return JSON.parse(localStorage.getItem(k)||'null')??f;}catch{return f;}};
  function nextNumber(){let n=Number(localStorage.getItem(COUNTER_KEY)||0)+1;localStorage.setItem(COUNTER_KEY,String(n));return String(n).padStart(5,'0');}
  function numberFor(key){const map=load(NUMBERS_KEY,{});if(!map[key]){map[key]=nextNumber();localStorage.setItem(NUMBERS_KEY,JSON.stringify(map));}return map[key];}

  function allOrders(){
    const emails=(typeof realOrders==='function'?realOrders():[]).map(o=>{
      const day=isoDate(o.deliveryDate || (o.thread?.latestOrder&&typeof deliveryDecision==='function'?deliveryDecision(o.thread.latestOrder).date:null));
      const id=`email:${o.thread?.key||Math.random()}`;
      return {...o,id,orderNo:numberFor(id),deliveryISO:day,manual:false};
    });
    const manual=load(MANUAL_KEY,[]).map(m=>{
      const id=`manual:${m.id}`;
      return {id,manual:true,orderNo:m.orderNo||numberFor(id),client:m.client,order:m.order,deliveryISO:m.deliveryDate,state:'Manual'};
    });
    return [...emails,...manual];
  }

  function lines(text=''){
    return String(text).split(/\n|·/).map(x=>x.trim()).filter(Boolean);
  }

  function printHtml(orders,title){
    const sheets=orders.map(o=>{
      const rows=lines(o.order||'Pedido por rever');
      return `<article class="sheet"><header><div><div class="brand">VitalVeg</div><h1>ORDEM DE ENCOMENDA N.º ${esc(o.orderNo)}</h1></div><div class="date"><span>DATA PARA ENTREGA</span><strong>${esc(prettyDay(o.deliveryISO))}</strong></div></header><section class="client"><span>CLIENTE</span><strong>${esc(o.client||'Cliente')}</strong></section><table><thead><tr><th>QUANTIDADE / PRODUTO</th><th>CONFERIDO</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r)}</td><td class="check">☐</td></tr>`).join('')||'<tr><td>Pedido por rever</td><td class="check">☐</td></tr>'}</tbody></table><footer><span>Origem: ${o.manual?'Encomenda manual':'Email VitalVeg'}</span><span>Preparação: ☐ &nbsp;&nbsp; Carga: ☐ &nbsp;&nbsp; Entregue: ☐</span></footer></article>`;
    }).join('');
    return `<!doctype html><html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>@page{size:A4 portrait;margin:10mm}*{box-sizing:border-box}body{margin:0;background:#fff;color:#111;font-family:Arial,Helvetica,sans-serif}.pack-title{font-size:11px;color:#555;margin:0 0 7mm}.sheet{page-break-after:always}.sheet:last-child{page-break-after:auto}header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:9px;margin-bottom:12px}.brand{font-size:18px;font-weight:900;color:#0b6b3a;margin-bottom:3px}h1{font-size:17px;margin:0}.date{text-align:right}.date span,.client span{display:block;font-size:9px;font-weight:700;color:#666;letter-spacing:.06em}.date strong{display:block;font-size:13px;margin-top:4px}.client{border:1px solid #aaa;padding:9px 10px;margin-bottom:10px}.client strong{display:block;font-size:15px;margin-top:3px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #999;padding:8px;text-align:left;vertical-align:top}th{background:#f1f1f1;font-size:10px}.check{width:70px;text-align:center;font-size:20px}footer{display:flex;justify-content:space-between;border-top:1px solid #aaa;margin-top:12px;padding-top:7px;font-size:9px;color:#555}@media screen{body{padding:16px}.sheet{max-width:800px;margin:0 auto 20px;box-shadow:0 2px 16px #ddd;padding:10mm}}</style></head><body><div class="pack-title">${esc(title)}</div>${sheets}<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),180));<\/script></body></html>`;
  }

  function openPrint(orders,title){
    if(!orders.length){ if(typeof showToast==='function')showToast('Não há encomendas para imprimir.'); return; }
    // Abrir a janela no próprio gesto do utilizador evita bloqueio de pop-ups no Android.
    const w=window.open('','_blank');
    if(w){
      w.document.open();w.document.write(printHtml(orders,title));w.document.close();return;
    }
    // Fallback para navegadores que bloqueiem janela nova.
    const frame=document.createElement('iframe');
    frame.setAttribute('aria-hidden','true');
    frame.style.position='fixed';frame.style.right='0';frame.style.bottom='0';frame.style.width='2px';frame.style.height='2px';frame.style.border='0';frame.style.opacity='0.01';
    document.body.appendChild(frame);
    frame.contentDocument.open();frame.contentDocument.write(printHtml(orders,title));frame.contentDocument.close();
    setTimeout(()=>{try{frame.contentWindow.focus();frame.contentWindow.print();}catch{} setTimeout(()=>frame.remove(),30000);},300);
  }

  document.addEventListener('click',e=>{
    const dayBtn=e.target.closest('[data-print-day]');
    const orderBtn=e.target.closest('[data-print-order]');
    if(!dayBtn&&!orderBtn)return;
    e.preventDefault();e.stopImmediatePropagation();
    const orders=allOrders();
    if(dayBtn){const day=dayBtn.getAttribute('data-print-day');const selected=orders.filter(o=>o.deliveryISO===day);openPrint(selected,`Encomendas para ${prettyDay(day)}`);return;}
    const id=orderBtn.getAttribute('data-print-order');const one=orders.find(o=>o.id===id);if(one)openPrint([one],`Ordem de encomenda N.º ${one.orderNo}`);
  },true);

  window.VitalVegPrint={allOrders,openPrint};
})();
