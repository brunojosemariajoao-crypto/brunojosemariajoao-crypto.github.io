/* Central VitalVeg V8.2 — operação por dias, encomendas manuais e impressão */
(() => {
  const MANUAL_KEY='vitalveg-manual-orders-v1';
  const NUMBERS_KEY='vitalveg-order-numbers-v1';
  const COUNTER_KEY='vitalveg-order-counter-v1';
  const TREATED_KEY='vitalveg-manual-treated-v1';
  const DAY_KEY='vitalveg-selected-delivery-day-v1';
  let selectedDay=localStorage.getItem(DAY_KEY)||'';
  let emailDayFilter='';

  const esc=v=>typeof escapeHtml==='function'?escapeHtml(v):String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pad=n=>String(n).padStart(2,'0');
  function isoDate(value){const d=value instanceof Date?value:new Date(value);if(Number.isNaN(d.getTime()))return'';return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;}
  function fromIso(s){return s?new Date(`${s}T12:00:00`):null;}
  function prettyDay(s){const d=fromIso(s);return d?new Intl.DateTimeFormat('pt-PT',{weekday:'long',day:'2-digit',month:'2-digit',year:'numeric'}).format(d):'Sem data';}
  function shortDay(s){const d=fromIso(s);return d?new Intl.DateTimeFormat('pt-PT',{weekday:'short',day:'2-digit',month:'2-digit'}).format(d):'Sem data';}
  function loadJson(key,fallback){try{return JSON.parse(localStorage.getItem(key)||'null')??fallback;}catch{return fallback;}}
  function saveJson(key,value){localStorage.setItem(key,JSON.stringify(value));}
  function loadManual(){return loadJson(MANUAL_KEY,[]);}
  function saveManual(v){saveJson(MANUAL_KEY,v);}
  function nextNumber(){let n=Number(localStorage.getItem(COUNTER_KEY)||0)+1;localStorage.setItem(COUNTER_KEY,String(n));return String(n).padStart(5,'0');}
  function numberFor(key){const map=loadJson(NUMBERS_KEY,{});if(!map[key]){map[key]=nextNumber();saveJson(NUMBERS_KEY,map);}return map[key];}
  function nextDeliveryDates(count=3){const out=[];const now=new Date();for(let i=0;i<21&&out.length<count;i++){const d=new Date(now);d.setDate(now.getDate()+i);const wd=d.getDay()===0?7:d.getDay();if(state.settings.deliveryDays.includes(wd))out.push(isoDate(d));}return out;}

  function realOperationalOrders(){
    const base=(typeof realOrders==='function'?realOrders():[]).map(o=>{
      const day=isoDate(o.deliveryDate||deliveryDecision(o.thread.latestOrder).date);
      const key=`email:${o.thread.key}`;
      return {...o,manual:false,id:key,orderNo:numberFor(key),deliveryISO:day};
    });
    const manual=loadManual().map(m=>({
      manual:true,id:`manual:${m.id}`,manualId:m.id,orderNo:m.orderNo||numberFor(`manual:${m.id}`),client:m.client,
      order:m.order,deliveryISO:m.deliveryDate,delivery:prettyDay(m.deliveryDate),state:'Manual',stateClass:'confirmed',classification:'ENCOMENDA MANUAL',
      thread:{key:`manual:${m.id}`,counterpart:'Introduzida manualmente'}
    }));
    return [...base,...manual].sort((a,b)=>(a.deliveryISO||'9999').localeCompare(b.deliveryISO||'9999')||a.client.localeCompare(b.client,'pt'));
  }

  function relevantDays(){
    const set=new Set(nextDeliveryDates(3));
    realOperationalOrders().forEach(o=>{if(o.deliveryISO)set.add(o.deliveryISO);});
    return [...set].sort().slice(0,6);
  }
  function defaultDay(){
    const orders=realOperationalOrders();const today=isoDate(new Date());
    return orders.find(o=>o.deliveryISO>=today)?.deliveryISO||nextDeliveryDates(1)[0]||orders[0]?.deliveryISO||'';
  }
  function setSelectedDay(day){selectedDay=day||'all';localStorage.setItem(DAY_KEY,selectedDay);}

  function installCopy(){
    document.querySelectorAll('[data-view="conversations"] span:not(.nav-icon), .mobile-nav-item[data-view="conversations"] small').forEach(el=>{if(/Conversas/i.test(el.textContent))el.textContent='Emails';});
    const hero=document.querySelector('#view-dashboard .hero-row');
    if(hero){const e=hero.querySelector('.eyebrow');const m=hero.querySelector('.muted');if(e)e.textContent='CENTRAL DE ENCOMENDAS';if(m)m.textContent='Encomendas primeiro. O email fica apenas como origem e histórico.';}
    const fab=document.querySelector('.mobile-fab');
    if(fab&&!fab.dataset.opsReady){const clone=fab.cloneNode(true);clone.removeAttribute('data-view');clone.dataset.opsReady='1';clone.setAttribute('aria-label','Adicionar encomenda manual');clone.addEventListener('click',()=>openManualOrder());fab.replaceWith(clone);}
  }

  function renderOperationalDashboard(){
    installCopy();
    const dashboard=document.querySelector('#view-dashboard');if(!dashboard)return;
    let hub=document.querySelector('#v8OpsHub');
    if(!hub){hub=document.createElement('section');hub.id='v8OpsHub';hub.className='v8-ops-hub';const grid=dashboard.querySelector('.dashboard-grid');grid?.parentNode.insertBefore(hub,grid);}
    const orders=realOperationalOrders();
    const dayCards=relevantDays().map(day=>{const items=orders.filter(o=>o.deliveryISO===day);return `<article class="v8-day-card ${day===selectedDay?'active':''}"><div><span>ENTREGA</span><h3>${esc(shortDay(day))}</h3><strong>${items.length} encomenda${items.length===1?'':'s'}</strong></div><div class="v8-day-actions"><button type="button" class="btn-primary" data-open-day="${day}">Ver encomendas do dia</button><button type="button" class="btn-soft" data-print-day="${day}">Imprimir dia</button></div></article>`;}).join('');
    const byEmailDay=new Map();
    state.messages.filter(m=>m.direction==='in').forEach(m=>{const day=isoDate(m.date);const x=byEmailDay.get(day)||{total:0,orders:0,review:0};x.total++;if(['ENCOMENDA','ALTERAÇÃO À ENCOMENDA'].includes(m.type))x.orders++;const t=state.threads.find(t=>t.messages.some(x=>x.id===m.id));if(t?.status==='review')x.review++;byEmailDay.set(day,x);});
    const emailDays=[...byEmailDay.entries()].sort((a,b)=>b[0].localeCompare(a[0])).slice(0,3).map(([day,x])=>`<button class="v8-email-day" type="button" data-email-day="${day}"><strong>${esc(shortDay(day))}</strong><span>${x.total} emails · ${x.orders} encomenda${x.orders===1?'':'s'}${x.review?` · ${x.review} a rever`:''}</span></button>`).join('');
    hub.innerHTML=`<div class="v8-ops-title"><div><p class="eyebrow">OPERAÇÃO</p><h2>Encomendas por dia de entrega</h2></div><div class="v8-primary-actions"><button class="primary-action" type="button" data-new-manual>＋ Adicionar encomenda manual</button><button class="btn-soft" type="button" data-all-orders>Ver todas as encomendas</button></div></div><div class="v8-day-grid">${dayCards||'<div class="empty-real"><strong>Sem dias de entrega calculados.</strong></div>'}</div><div class="v8-email-summary"><div><strong>Emails por dia</strong><small>O email é secundário: usa-o apenas para rever contexto ou responder.</small></div><div class="v8-email-days">${emailDays||'<span class="muted">Sem emails carregados.</span>'}</div><button class="btn-soft" type="button" data-email-full>Ver lista completa de emails</button></div>`;
    const activity=document.querySelector('.activity-panel');if(activity)activity.hidden=true;
    const delivery=document.querySelector('.delivery-panel');if(delivery)delivery.hidden=true;
  }

  function renderOrdersOperational(){
    const view=document.querySelector('#view-orders');const tbody=document.querySelector('#ordersBody');if(!view||!tbody)return;
    if(!selectedDay) setSelectedDay(defaultDay()||'all');
    let toolbar=document.querySelector('#v8DayToolbar');
    if(!toolbar){toolbar=document.createElement('section');toolbar.id='v8DayToolbar';toolbar.className='v8-day-toolbar';view.querySelector('.table-panel')?.before(toolbar);}
    const days=relevantDays();
    toolbar.innerHTML=`<div class="v8-filter-row">${days.map(d=>`<button type="button" class="v8-day-filter ${selectedDay===d?'active':''}" data-filter-day="${d}">${esc(shortDay(d))}</button>`).join('')}<button type="button" class="v8-day-filter ${selectedDay==='all'?'active':''}" data-filter-day="all">Todas</button></div><div class="v8-toolbar-actions"><button class="primary-action" type="button" data-new-manual>＋ Encomenda manual</button>${selectedDay!=='all'?`<button class="btn-soft" type="button" data-print-day="${selectedDay}">▣ Imprimir este dia</button>`:''}</div>`;
    const all=realOperationalOrders();const rows=(selectedDay==='all'?all:all.filter(o=>o.deliveryISO===selectedDay));
    const head=view.querySelector('.orders-table thead tr');if(head)head.innerHTML='<th>N.º ordem</th><th>Cliente</th><th>Quantidades / pedido final</th><th>Entrega</th><th>Estado</th><th></th>';
    tbody.innerHTML=rows.length?rows.map(o=>`<tr><td><strong class="v8-order-number">N.º ${esc(o.orderNo)}</strong></td><td class="order-customer"><strong>${esc(o.client)}</strong><small>${o.manual?'Manual':esc(o.thread.counterpart)}</small></td><td><strong>${esc(o.order||'Pedido por rever')}</strong></td><td>${esc(prettyDay(o.deliveryISO))}</td><td><span class="state-chip state-${o.stateClass||'confirmed'}">${esc(o.state||'Registada')}</span></td><td class="v8-row-actions"><button class="btn-soft" type="button" data-print-order="${esc(o.id)}">Imprimir</button>${o.manual?`<button class="btn-soft" type="button" data-edit-manual="${esc(o.manualId)}">Editar</button>`:`<button class="row-action" data-thread="${esc(o.thread.key)}">›</button>`}</td></tr>`).join(''):'<tr><td colspan="6"><div class="empty-real"><strong>Sem encomendas neste dia.</strong><span>Podes adicionar uma encomenda manual ou escolher outro dia.</span></div></td></tr>';
    const old=document.querySelector('#newOrderBtn');if(old)old.hidden=true;
    const v8old=document.querySelector('#v8OrdersActions');if(v8old)v8old.hidden=true;
  }

  function orderLines(text=''){return String(text).split(/\n|·/).map(x=>x.trim()).filter(Boolean);}
  function buildPrint(orders,title){
    let root=document.querySelector('#v8OpsPrint');if(!root){root=document.createElement('section');root.id='v8OpsPrint';document.body.appendChild(root);}
    root.innerHTML=`<div class="v8-print-pack-title">${esc(title)}</div>${orders.map(o=>`<article class="v8-order-sheet"><header><div><div class="v8-print-brand">VitalVeg</div><h1>ORDEM DE ENCOMENDA N.º ${esc(o.orderNo)}</h1></div><div class="v8-print-date"><span>DATA PARA ENTREGA</span><strong>${esc(prettyDay(o.deliveryISO))}</strong></div></header><section class="v8-print-client"><span>CLIENTE</span><strong>${esc(o.client)}</strong></section><table><thead><tr><th>QUANTIDADE / PRODUTO</th><th>CONFERIDO</th></tr></thead><tbody>${orderLines(o.order||'Pedido por rever').map(line=>`<tr><td>${esc(line)}</td><td class="v8-check">☐</td></tr>`).join('')}</tbody></table><footer><span>Origem: ${o.manual?'Encomenda manual':'Email VitalVeg'}</span><span>Preparação: ☐ &nbsp; Carga: ☐ &nbsp; Entregue: ☐</span></footer></article>`).join('')}`;
  }
  function printDay(day){const orders=realOperationalOrders().filter(o=>o.deliveryISO===day);if(!orders.length){showToast('Não há encomendas nesse dia.');return;}buildPrint(orders,`Encomendas para ${prettyDay(day)}`);window.print();}
  function printOne(id){const o=realOperationalOrders().find(x=>x.id===id);if(!o)return;buildPrint([o],`Ordem de encomenda N.º ${o.orderNo}`);window.print();}

  function ensureManualModal(){
    let modal=document.querySelector('#v8ManualModal');if(modal)return modal;
    modal=document.createElement('div');modal.id='v8ManualModal';modal.className='v8-modal';modal.innerHTML=`<div class="v8-modal-card"><button class="v8-modal-close" type="button" data-close-manual>×</button><p class="eyebrow">ENCOMENDA MANUAL</p><h2 id="v8ManualTitle">Adicionar encomenda</h2><label>Cliente<input id="v8ManualClient" type="text" placeholder="Ex.: Loja 3"></label><label>Data de entrega<input id="v8ManualDate" type="date"></label><label>Produtos e quantidades<textarea id="v8ManualOrder" rows="8" placeholder="Ex.:\n2 cx alface frisada\n5 kg tomate coração\n1 cx pimento verde"></textarea></label><div class="v8-modal-actions"><button class="primary-action" type="button" id="v8SaveManual">Guardar encomenda</button><button class="btn-soft" type="button" data-close-manual>Cancelar</button></div><input id="v8ManualId" type="hidden"></div>`;document.body.appendChild(modal);return modal;
  }
  function openManualOrder(id=''){
    const modal=ensureManualModal();const item=id?loadManual().find(x=>x.id===id):null;
    modal.querySelector('#v8ManualTitle').textContent=item?'Editar encomenda manual':'Adicionar encomenda manual';
    modal.querySelector('#v8ManualId').value=item?.id||'';modal.querySelector('#v8ManualClient').value=item?.client||'';modal.querySelector('#v8ManualOrder').value=item?.order||'';modal.querySelector('#v8ManualDate').value=item?.deliveryDate||(selectedDay&&selectedDay!=='all'?selectedDay:defaultDay());modal.classList.add('show');setTimeout(()=>modal.querySelector('#v8ManualClient').focus(),80);
  }
  function saveManualOrder(){
    const modal=ensureManualModal();const id=modal.querySelector('#v8ManualId').value;const client=modal.querySelector('#v8ManualClient').value.trim();const deliveryDate=modal.querySelector('#v8ManualDate').value;const order=modal.querySelector('#v8ManualOrder').value.trim();if(!client||!deliveryDate||!order){showToast('Preenche cliente, data e produtos/quantidades.');return;}
    const list=loadManual();if(id){const i=list.findIndex(x=>x.id===id);if(i>=0)list[i]={...list[i],client,deliveryDate,order,updatedAt:new Date().toISOString()};}else{const newId=`m${Date.now()}`;list.push({id:newId,orderNo:numberFor(`manual:${newId}`),client,deliveryDate,order,createdAt:new Date().toISOString()});}saveManual(list);setSelectedDay(deliveryDate);modal.classList.remove('show');renderAllReal();setView('orders');renderOrdersOperational();showToast('Encomenda manual guardada.');
  }

  function installTreatFix(){
    document.addEventListener('click',e=>{
      const btn=e.target.closest('#v8TreatThread,#v8ReopenThread');if(!btn)return;
      setTimeout(()=>{
        if(typeof state==='undefined'||!Array.isArray(state.messages))return;
        const treated=new Set(loadJson(TREATED_KEY,[]));const t=state.threads.find(x=>x.key===state.selectedThread);const id=t?.latestInbound?.id||t?.latest?.id;if(!id)return;
        if(btn.id==='v8TreatThread')treated.add(id);else treated.delete(id);saveJson(TREATED_KEY,[...treated]);
        state.threads=buildThreads(state.messages);renderAllReal();showToast(btn.id==='v8TreatThread'?'Conversa marcada como tratada.':'Conversa voltou a pendente.');
      },0);
    },true);
  }

  function installEmailDayFilter(){
    if(typeof filteredThreads!=='function'||typeof renderConversations!=='function')return;
    const baseFiltered=filteredThreads;filteredThreads=function(){const list=baseFiltered();return emailDayFilter?list.filter(t=>isoDate(t.latest.date)===emailDayFilter):list;};
    const baseRender=renderConversations;renderConversations=function(){baseRender();const view=document.querySelector('#view-conversations');let bar=document.querySelector('#v8EmailDayBar');if(!bar){bar=document.createElement('div');bar.id='v8EmailDayBar';bar.className='v8-email-day-bar';view.querySelector('.conversation-layout')?.before(bar);}bar.innerHTML=emailDayFilter?`<strong>Emails de ${esc(prettyDay(emailDayFilter))}</strong><button class="btn-soft" type="button" data-email-full>Ver lista completa</button>`:'<span>Lista completa de emails</span>';};
  }

  function bindOps(){
    document.addEventListener('click',e=>{
      const n=e.target.closest('[data-new-manual]');if(n){e.preventDefault();openManualOrder();return;}
      const close=e.target.closest('[data-close-manual]');if(close){ensureManualModal().classList.remove('show');return;}
      const day=e.target.closest('[data-open-day]');if(day){setSelectedDay(day.dataset.openDay);setView('orders');renderOrdersOperational();return;}
      const filter=e.target.closest('[data-filter-day]');if(filter){setSelectedDay(filter.dataset.filterDay);renderOrdersOperational();return;}
      const pd=e.target.closest('[data-print-day]');if(pd){printDay(pd.dataset.printDay);return;}
      const po=e.target.closest('[data-print-order]');if(po){printOne(po.dataset.printOrder);return;}
      const em=e.target.closest('[data-edit-manual]');if(em){openManualOrder(em.dataset.editManual);return;}
      const all=e.target.closest('[data-all-orders]');if(all){setSelectedDay('all');setView('orders');renderOrdersOperational();return;}
      const ed=e.target.closest('[data-email-day]');if(ed){emailDayFilter=ed.dataset.emailDay;state.conversationFilter='all';setView('conversations');renderConversations();return;}
      const ef=e.target.closest('[data-email-full]');if(ef){emailDayFilter='';state.conversationFilter='all';setView('conversations');renderConversations();return;}
    });
    document.addEventListener('click',e=>{if(e.target.closest('#v8SaveManual'))saveManualOrder();});
  }

  function install(){
    if(window.__VITALVEG_OPS_INSTALLED__)return;
    if(typeof renderDashboard!=='function'||typeof renderOrders!=='function'||typeof setView!=='function'||typeof realOrders!=='function'){setTimeout(install,100);return;}
    window.__VITALVEG_OPS_INSTALLED__=true;
    if(!selectedDay)setSelectedDay(defaultDay()||'all');
    const baseDashboard=renderDashboard;renderDashboard=function(){baseDashboard();renderOperationalDashboard();};
    renderOrders=function(){renderOrdersOperational();};
    installEmailDayFilter();installTreatFix();bindOps();installCopy();ensureManualModal();
    try{renderAllReal();}catch{renderOperationalDashboard();renderOrdersOperational();}
  }
  install();
})();
