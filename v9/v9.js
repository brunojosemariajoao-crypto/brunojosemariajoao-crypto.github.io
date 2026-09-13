const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=(v='')=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const state={view:'today',ops:null,orders:[],mail:null,auth:null,search:'',loading:false};
const viewNames={today:['CENTRO DE OPERAÇÕES','Hoje'],deliveries:['PLANEAMENTO','Entregas'],needs:['DECISÕES','Precisa de mim'],orders:['GESTÃO','Encomendas'],customers:['RELAÇÃO COMERCIAL','Clientes'],activity:['AUDITORIA','Atividade IA'],emails:['HISTÓRICO','Emails / Histórico'],autonomy:['CONTROLO','Regras e autonomia']};
const statusLabels={confirmed:'Confirmada',review:'A rever',awaiting_approval:'A aprovar',historical:'Histórica',cancelled:'Cancelada',draft:'Rascunho'};
const weekday=new Intl.DateTimeFormat('pt-PT',{weekday:'long',timeZone:'Europe/Lisbon'});
const fullDate=new Intl.DateTimeFormat('pt-PT',{weekday:'long',day:'2-digit',month:'long',timeZone:'Europe/Lisbon'});
const shortDateTime=new Intl.DateTimeFormat('pt-PT',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Lisbon'});

function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),2800);}
function setDot(el,status){el?.classList.remove('ok','warn','error');if(status)el?.classList.add(status);}
function formatDelivery(key){if(!key)return 'Sem data';const d=new Date(`${key}T12:00:00Z`);return fullDate.format(d).replace(/^./,c=>c.toUpperCase());}
function dateOnly(key){if(!key)return '—';const d=new Date(`${key}T12:00:00Z`);return new Intl.DateTimeFormat('pt-PT',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'UTC'}).format(d);}
function fmtWhen(value){if(!value)return '—';const d=new Date(value);return Number.isNaN(d.getTime())?'—':shortDateTime.format(d);}
function compactText(v,n=150){const s=String(v||'').replace(/\s+/g,' ').trim();return s.length>n?`${s.slice(0,n-1)}…`:s;}
function itemText(i){return `${i.quantity??''}${i.unit?` ${i.unit}`:''} ${i.product||i.rawLine||''}`.trim();}
function statusTag(status){return `<span class="status-tag ${esc(status||'')}">${esc(statusLabels[status]||status||'—')}</span>`;}

async function api(url,options={}){
  const init={credentials:'include',...options,headers:{...(options.body?{'Content-Type':'application/json'}:{}),...(options.headers||{})}};
  const res=await fetch(url,init);
  const data=await res.json().catch(()=>({}));
  if(res.status===401 && !url.startsWith('/api/auth')){await requireLogin();throw new Error('Sessão terminada.');}
  if(!res.ok)throw new Error(data.error||`Erro ${res.status}`);
  return data;
}

function tryOriginalLogo(){
  const src='../assets/vitalveg-logo-original.png';
  $$('.original-logo').forEach(img=>{
    img.onload=()=>{img.hidden=false;img.nextElementSibling?.setAttribute('hidden','');};
    img.onerror=()=>{img.hidden=true;img.nextElementSibling?.removeAttribute('hidden');};
    img.src=src;
  });
}

async function requireLogin(){
  $('#app').hidden=true;$('#authGate').hidden=false;
  try{state.auth=await api('/api/auth');}catch(e){state.auth={pinConfigured:true,sessionValid:false};}
  const configured=!!state.auth.pinConfigured;
  $('#authTitle').textContent=configured?'Entrar na Central':'Criar PIN partilhado';
  $('#authCopy').textContent=configured?'Introduz o PIN da Central VitalVeg.':'Cria uma única vez o PIN que será usado no PC e no telemóvel.';
  $('#authSubmit').textContent=configured?'Entrar':'Criar PIN e entrar';
  $('#pinInput').value='';$('#authError').textContent='';setTimeout(()=>$('#pinInput').focus(),100);
}

async function submitAuth(){
  const pin=$('#pinInput').value.trim();
  if(!/^\d{4}$/.test(pin)){ $('#authError').textContent='O PIN tem de ter 4 dígitos.'; return; }
  const action=state.auth?.pinConfigured?'login':'register';
  $('#authSubmit').disabled=true;$('#authError').textContent='';
  try{
    const result=await api('/api/auth',{method:'POST',body:JSON.stringify({action,pin})});
    state.auth={...(state.auth||{}),...result,pinConfigured:true,sessionValid:true};
    $('#authGate').hidden=true;$('#app').hidden=false;await loadAll();
  }catch(e){
    $('#authError').textContent=e.message+(action==='register'?' Se este equipamento ainda não estava autorizado, faz a criação inicial no telemóvel que já tinha acesso à Central.':'');
  }finally{$('#authSubmit').disabled=false;}
}

async function initAuth(){
  try{
    state.auth=await api('/api/auth');
    if(state.auth.sessionValid){$('#authGate').hidden=true;$('#app').hidden=false;await loadAll();}
    else await requireLogin();
  }catch{await requireLogin();}
}

async function loadAll(silent=false){
  if(state.loading)return;state.loading=true;
  if(!silent)$('#content').innerHTML='<div class="loading-state"><span class="loader"></span><p>A atualizar o centro de operações…</p></div>';
  try{
    const [ops,orders,mail]=await Promise.allSettled([api('/api/ai/state'),api('/api/orders'),api('/api/mail')]);
    if(ops.status==='fulfilled')state.ops=ops.value;
    if(orders.status==='fulfilled')state.orders=orders.value.orders||[];
    if(mail.status==='fulfilled')state.mail=mail.value;
    updateSystemStatus(ops,mail);
    render();
  }finally{state.loading=false;}
}

function updateSystemStatus(opsResult,mailResult){
  const aiOk=opsResult?.status==='fulfilled';setDot($('#aiStatusDot'),aiOk?'ok':'warn');setDot($('#miniAiDot'),aiOk?'ok':'warn');
  $('#aiStatusText').textContent=aiOk?'Operacional':'Atenção necessária';$('#miniAiStatus').textContent=aiOk?'IA operacional':'IA a verificar';
  const mailOk=mailResult?.status==='fulfilled';setDot($('#mailStatusDot'),mailOk?'ok':'error');
  $('#mailStatusText').textContent=mailOk?'Ligado':'Desligado / erro';
  const fetched=mailOk?mailResult.value?.fetchedAt:null;$('#syncStatusText').textContent=fetched?fmtWhen(fetched):'—';$('#miniSync').textContent=fetched?`Email ${fmtWhen(fetched)}`:'Sem sincronização';
  const p=state.ops?.policy;if(p)$('#autonomyStatusText').textContent=p.level<=1?`Nível ${p.level} · Aprovação humana`:`Nível ${p.level} · Autonomia controlada`;
  const n=Number(state.ops?.summary?.needsMe||0);$('#needsBadge').textContent=n;$('#needsBadge').hidden=!n;
}

function setView(view){
  state.view=view;$$('#mainNav button').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  const [eye,title]=viewNames[view]||['CENTRAL','VitalVeg'];$('#viewEyebrow').textContent=eye;$('#viewTitle').textContent=title;
  $('.sidebar').classList.remove('open');render();
}

function pageHead(title,copy,actions=''){return `<div class="page-head"><div><h2>${esc(title)}</h2><p>${esc(copy)}</p></div><div class="page-actions">${actions}</div></div>`;}
function empty(copy){return `<div class="mini-empty">${esc(copy)}</div>`;}

function orderCard(o){
  const items=(o.items||[]).map(i=>`<span class="item-chip ${i.uncertain?'uncertain':''}">${esc(itemText(i))}</span>`).join('');
  return `<article class="order-card"><div><h4>${esc(o.storeName||o.customerName||o.customerEmail||'Cliente')}</h4><small>${esc(o.customerEmail||'')}</small></div><div class="order-items">${items||'<span class="item-chip">Sem linhas</span>'}</div><div class="order-meta"><span class="order-number">${esc(o.number||'')}</span>${statusTag(o.status)}<br><button class="link-btn" data-order-id="${esc(o.id)}">Abrir</button></div></article>`;
}

function needCard(q){
  const kind=q.kind==='review'?'Requer decisão':'Pronto a aprovar';
  return `<article class="need-card"><div class="need-main"><div><div class="need-kind ${esc(q.kind)}">${kind}</div><h4>${esc(q.title||'Mensagem')}</h4><p class="need-summary">${esc(q.summary||'')}</p><small>${esc((q.reasons||[])[0]||'')}</small></div><div class="need-actions"><button class="btn ${q.kind==='review'?'ghost':'primary'}" data-queue-id="${esc(q.id)}">${q.kind==='review'?'Rever':'Ver resposta'}</button></div></div></article>`;
}

function activityLabel(a){
  const map={ai_processed:'IA analisou uma conversa',mail_sync:'Sincronização de email',message_sent:'Resposta enviada',manual_message_sent:'Mensagem manual enviada',manual_order_created:'Encomenda manual criada',order_manually_edited:'Encomenda corrigida manualmente',order_status_changed:'Estado da encomenda alterado',ai_suggestion_rejected:'Sugestão da IA rejeitada',autonomy_policy_changed:'Política de autonomia alterada',autonomy_failed:'Autonomia pediu intervenção'};
  return map[a.type]||String(a.type||'Atividade');
}
function activityCopy(a){const d=a.data||{};return d.orderNumber?`${d.orderNumber}${d.messageType?` · ${d.messageType}`:''}`:(d.subject||d.messageType||d.error||'');}

function renderToday(){
  const s=state.ops?.summary||{};const next=state.ops?.nextOrders||[];const needs=state.ops?.needsMe||[];const acts=state.ops?.recentActivity||[];
  return `${pageHead('O que precisa da tua atenção','A IA trata o fluxo; aqui aparecem decisões e entregas.',`<button class="btn ghost" data-go="needs">Ver o que precisa de mim</button>`)}
    <div class="metric-grid">
      <div class="metric good"><div class="label">Próxima entrega</div><strong>${esc(s.nextDeliveryOrders??0)}</strong><small>${esc(formatDelivery(s.nextDelivery))}</small></div>
      <div class="metric attention"><div class="label">Precisa de mim</div><strong>${esc(s.needsMe??0)}</strong><small>${esc(s.review??0)} a rever · ${esc(s.approvals??0)} para aprovar</small></div>
      <div class="metric"><div class="label">Encomendas ativas</div><strong>${esc(s.activeOrders??0)}</strong><small>Entrega atual e seguintes</small></div>
      <div class="metric"><div class="label">Autonomia</div><strong>N${esc(state.ops?.policy?.level??1)}</strong><small>${(state.ops?.policy?.level??1)<=1?'Tu confirmas antes do envio':'Execução controlada ativa'}</small></div>
    </div>
    <div class="dashboard-grid">
      <section class="panel"><div class="panel-head"><div><h3>Próxima entrega</h3><p>Encomendas consolidadas pela Central</p></div><button class="section-link" data-go="deliveries">Todas as entregas</button></div><div class="panel-body">
        ${s.nextDelivery?`<div class="delivery-hero"><small>DATA DE ENTREGA</small><h3>${esc(formatDelivery(s.nextDelivery))}</h3><p>A lista abaixo já reflete as alterações conhecidas de cada conversa.</p><div class="delivery-totals"><div><strong>${esc(next.length)}</strong><span>encomendas</span></div><div><strong>${esc(next.reduce((n,o)=>n+(o.items?.length||0),0))}</strong><span>linhas de produto</span></div></div></div>`:empty('Ainda não existem encomendas futuras consolidadas.')}
        <div class="order-list">${next.map(orderCard).join('')}</div>
      </div></section>
      <section class="panel"><div class="panel-head"><div><h3>Precisa de mim</h3><p>Só exceções, dúvidas e aprovações</p></div><button class="section-link" data-go="needs">Abrir fila</button></div><div class="panel-body"><div class="needs-list">${needs.length?needs.slice(0,6).map(needCard).join(''):empty('Neste momento a IA não está à espera de nenhuma decisão tua.')}</div></div></section>
      <section class="panel"><div class="panel-head"><div><h3>Última atividade da IA</h3><p>Registo auditável do que aconteceu</p></div><button class="section-link" data-go="activity">Ver histórico</button></div><div class="panel-body"><div class="activity-list">${acts.length?acts.slice(0,7).map(a=>`<div class="activity-row"><div class="activity-time">${esc(fmtWhen(a.at))}</div><div class="activity-copy"><strong>${esc(activityLabel(a))}</strong><p>${esc(activityCopy(a))}</p></div></div>`).join(''):empty('Ainda não existe atividade registada na V9.')}</div></div></section>
    </div>`;
}

function groupOrdersByDate(){
  const active=state.orders.filter(o=>o.deliveryDate&&!['cancelled','historical'].includes(o.status));
  return active.reduce((m,o)=>{(m[o.deliveryDate]??=[]).push(o);return m;},{});
}
function renderDeliveries(){
  const groups=groupOrdersByDate();const dates=Object.keys(groups).sort();
  return `${pageHead('Entregas','Uma visão por dia de distribuição — não por data de chegada do email.')}${dates.length?dates.map(date=>`<section class="panel" style="margin-bottom:14px"><div class="panel-head"><div><h3>${esc(formatDelivery(date))}</h3><p>${groups[date].length} encomenda${groups[date].length===1?'':'s'}</p></div><div class="page-actions"><button class="btn ghost" data-print-date="${date}">Imprimir preparação</button></div></div><div class="panel-body"><div class="order-list">${groups[date].map(orderCard).join('')}</div></div></section>`).join(''):empty('Não existem entregas futuras registadas.')}`;
}
function renderNeeds(){const items=state.ops?.needsMe||[];return `${pageHead('Precisa de mim','Aqui só fica aquilo que o funcionário digital não deve decidir sozinho.') }<div class="needs-list">${items.length?items.map(needCard).join(''):empty('Fila vazia. Não tens decisões pendentes.')}</div>`;}

function filteredOrders(){const q=state.search.trim().toLowerCase();if(!q)return state.orders;return state.orders.filter(o=>[o.number,o.customerName,o.customerEmail,o.storeName,o.deliveryDate,...(o.items||[]).flatMap(i=>[i.product,i.rawLine])].some(v=>String(v||'').toLowerCase().includes(q)));}
function renderOrders(){const rows=filteredOrders();return `${pageHead('Encomendas','O email deixou de ser a unidade de trabalho. Cada linha aqui é uma encomenda consolidada.',`<button class="btn primary" data-new-order>+ Encomenda manual</button>`)}<div class="table-wrap"><table class="data-table"><thead><tr><th>Ordem</th><th>Cliente</th><th>Entrega</th><th>Pedido final</th><th>Estado</th><th></th></tr></thead><tbody>${rows.map(o=>`<tr><td><strong>${esc(o.number)}</strong></td><td><strong>${esc(o.storeName||o.customerName||'—')}</strong><br><small>${esc(o.customerEmail||'')}</small></td><td>${esc(dateOnly(o.deliveryDate))}</td><td>${(o.items||[]).map(i=>esc(itemText(i))).join('<br>')}</td><td>${statusTag(o.status)}</td><td><button class="link-btn" data-order-id="${esc(o.id)}">Abrir</button></td></tr>`).join('')||`<tr><td colspan="6">${empty('Nenhuma encomenda encontrada.')}</td></tr>`}</tbody></table></div>`;}

function customers(){
  const m=new Map();for(const o of state.orders){const key=o.customerEmail||o.storeName||o.customerName||o.id;if(!m.has(key))m.set(key,{key,name:o.storeName||o.customerName||o.customerEmail||'Cliente',email:o.customerEmail,orders:[]});m.get(key).orders.push(o);}return [...m.values()].sort((a,b)=>a.name.localeCompare(b.name,'pt'));
}
function renderCustomers(){const list=customers();return `${pageHead('Clientes','Histórico comercial construído a partir das encomendas reais.') }<div class="customer-list">${list.length?list.map(c=>{const last=[...c.orders].sort((a,b)=>String(b.deliveryDate).localeCompare(String(a.deliveryDate)))[0];return `<article class="customer-card"><div><h4>${esc(c.name)}</h4><small>${esc(c.email||'')}</small></div><div class="stats"><div><strong>${c.orders.length}</strong><span>encomendas</span></div><div><strong>${esc(dateOnly(last?.deliveryDate))}</strong><span>última entrega</span></div></div></article>`;}).join(''):empty('Ainda não existem clientes construídos a partir das encomendas.')}</div>`;}
function renderActivity(){const a=state.ops?.recentActivity||[];return `${pageHead('Atividade IA','Tudo o que a IA processa, sugere, envia ou bloqueia fica registado.') }<div class="activity-list">${a.length?a.map(x=>`<div class="activity-row"><div class="activity-time">${esc(fmtWhen(x.at))}</div><div class="activity-copy"><strong>${esc(activityLabel(x))}</strong><p>${esc(activityCopy(x))}</p></div></div>`).join(''):empty('Ainda não existe atividade registada.')}</div>`;}
function renderEmails(){const messages=state.mail?.messages||[];return `${pageHead('Emails / Histórico','A caixa de correio é fonte e prova da conversa. Não é o teu ecrã principal.') }<div class="secondary-note"><strong>Modo histórico.</strong> As encomendas são trabalhadas na Central. Abre aqui a mensagem original apenas quando precisares de confirmar contexto.</div><div class="email-list">${messages.length?messages.map(m=>`<button class="email-row" data-mail-id="${esc(m.id)}" style="width:100%;text-align:left"><div><strong>${esc(m.direction==='out'?'VitalVeg':m.from||'')}</strong><br><small>${esc(fmtWhen(m.date))}</small></div><div class="subject">${esc(m.subject||'(sem assunto)')}</div><div class="preview">${esc(compactText(m.text,180))}</div><span class="email-direction">${m.direction==='out'?'Enviado':'Recebido'}</span></button>`).join(''):empty('Não existem mensagens disponíveis no cache do servidor.')}</div>`;}
function renderAutonomy(){const p=state.ops?.policy||{level:1,minAutoConfidence:.97,autoMessageTypes:[],autoOrderReceiptConfirmation:false,blockCommercialRisk:['medium','high'],requireApprovalForUnknownItems:true};return `${pageHead('Regras e autonomia','A V9 nasce preparada para trabalhar sozinha, mas começa com aprovação humana.')}
  <div class="warning-box">O nível ativo é alterado apenas por uma decisão explícita. Artigos incertos e risco comercial alto continuam bloqueados mesmo nos níveis autónomos.</div>
  <div class="autonomy-levels" style="margin-top:14px">
    <div class="level-card ${p.level===0?'active':''}"><strong>Nível 0 · Observação</strong><p>A IA lê e organiza, sem preparar ações de envio.</p></div>
    <div class="level-card ${p.level===1?'active':''}"><strong>Nível 1 · Assistente</strong><p>A IA lê, cria encomendas e prepara respostas. Tu aprovas antes de enviar.</p></div>
    <div class="level-card ${p.level===2?'active':''}"><strong>Nível 2 · Autónomo seguro</strong><p>Ações rotineiras de alta confiança podem ser executadas automaticamente.</p></div>
    <div class="level-card ${p.level===3?'active':''}"><strong>Nível 3 · Autónomo alargado</strong><p>Mais ações elegíveis, mantendo bloqueios de risco e auditoria total.</p></div>
  </div>
  <section class="panel" style="margin-top:14px"><div class="panel-head"><div><h3>Política atual</h3><p>Travões aplicados pelo servidor</p></div></div><div class="panel-body policy-list">
    <div class="policy-row"><strong>Confiança mínima para autonomia</strong><span>${Math.round((p.minAutoConfidence||0)*100)}%</span></div>
    <div class="policy-row"><strong>Linhas de produto incertas</strong><span>${p.requireApprovalForUnknownItems?'Obrigam a revisão humana':'—'}</span></div>
    <div class="policy-row"><strong>Risco comercial alto</strong><span>${(p.blockCommercialRisk||[]).includes('high')?'Bloqueado':'—'}</span></div>
    <div class="policy-row"><strong>Confirmação automática de encomendas</strong><span>${p.autoOrderReceiptConfirmation?'Autorizada pela política':'Desativada'}</span></div>
  </div></section>`;}

function render(){
  const renderers={today:renderToday,deliveries:renderDeliveries,needs:renderNeeds,orders:renderOrders,customers:renderCustomers,activity:renderActivity,emails:renderEmails,autonomy:renderAutonomy};
  $('#content').innerHTML=(renderers[state.view]||renderToday)();bindDynamic();
}

function bindDynamic(){
  $$('[data-go]').forEach(b=>b.onclick=()=>setView(b.dataset.go));
  $$('[data-queue-id]').forEach(b=>b.onclick=()=>openQueue(b.dataset.queueId));
  $$('[data-order-id]').forEach(b=>b.onclick=()=>openOrder(b.dataset.orderId));
  $$('[data-mail-id]').forEach(b=>b.onclick=()=>openMail(b.dataset.mailId));
  $$('[data-new-order]').forEach(b=>b.onclick=openManualOrder);
  $$('[data-print-date]').forEach(b=>b.onclick=()=>window.open(`/v9/print.html?date=${encodeURIComponent(b.dataset.printDate)}`,'_blank'));
}

function openDrawer(title,html){$('#drawerTitle').textContent=title;$('#drawerBody').innerHTML=html;$('#drawerBackdrop').hidden=false;$('#detailDrawer').classList.add('open');$('#detailDrawer').setAttribute('aria-hidden','false');}
function closeDrawer(){ $('#detailDrawer').classList.remove('open');$('#detailDrawer').setAttribute('aria-hidden','true');setTimeout(()=>$('#drawerBackdrop').hidden=true,180); }

async function openQueue(id){
  openDrawer('Análise da IA','<div class="loading-state"><span class="loader"></span></div>');
  try{
    const d=await api(`/api/ai/queue?id=${encodeURIComponent(id)}`);const q=d.item,a=d.analysis||{},o=d.order;
    const conf=Math.round(Number(a.confidence||0)*100);
    const orderHtml=o?`<div class="order-list">${orderCard(o)}</div>`:'<div class="mini-empty">Esta decisão não criou uma encomenda.</div>';
    const reasons=(q.reasons||[]).length?`<ul class="reason-list">${q.reasons.map(r=>`<li>${esc(r)}</li>`).join('')}</ul>`:'<p>Sem alertas adicionais.</p>';
    $('#drawerBody').innerHTML=`
      <section class="detail-section"><h3>Leitura do funcionário digital</h3><div class="analysis-grid"><div class="analysis-cell"><small>Tipo</small><strong>${esc(a.messageType||'—')}</strong></div><div class="analysis-cell"><small>Confiança</small><strong>${conf?`${conf}%`:'—'}</strong></div><div class="analysis-cell"><small>Risco comercial</small><strong>${esc(a.commercialRisk||'—')}</strong></div><div class="analysis-cell"><small>Ação</small><strong>${esc(a.orderAction||'—')}</strong></div></div><div class="ai-confidence ${conf<90?'low':''}"><span style="width:${Math.max(0,Math.min(100,conf))}%"></span></div></section>
      <section class="detail-section"><h3>Encomenda consolidada</h3>${orderHtml}</section>
      <section class="detail-section"><h3>Porque está aqui</h3>${reasons}</section>
      <section class="detail-section"><h3>Resposta preparada pela IA</h3><textarea id="approvalDraft" class="reply-editor" placeholder="Escreve ou corrige a resposta antes de enviar.">${esc(q.suggestedReply||'')}</textarea><div class="reply-footnote"><strong>A assinatura de Inteligência Artificial é acrescentada automaticamente pelo servidor.</strong><br>O texto que aprovares fica registado na auditoria e é guardada uma cópia na pasta Enviados.</div><div class="drawer-actions"><button id="approveSendBtn" class="btn primary">Aprovar e enviar</button><button id="rejectSuggestionBtn" class="btn danger">Rejeitar</button></div><p id="queueActionError" class="form-error"></p></section>`;
    $('#approveSendBtn').onclick=()=>approveQueue(id);
    $('#rejectSuggestionBtn').onclick=()=>rejectQueue(id);
  }catch(e){$('#drawerBody').innerHTML=`<div class="warning-box">${esc(e.message)}</div>`;}
}

async function approveQueue(id){
  const text=$('#approvalDraft').value.trim();if(!text){$('#queueActionError').textContent='A resposta está vazia.';return;}
  const btn=$('#approveSendBtn');btn.disabled=true;btn.textContent='A enviar…';$('#queueActionError').textContent='';
  try{
    const r=await api('/api/ai/send',{method:'POST',body:JSON.stringify({action:'approve_and_send',queueId:id,text})});
    toast(r.savedToSent?'Resposta enviada e guardada em Enviados.':'Resposta enviada; verificar aviso da pasta Enviados.');closeDrawer();await loadAll(true);
  }catch(e){$('#queueActionError').textContent=e.message;}
  finally{btn.disabled=false;btn.textContent='Aprovar e enviar';}
}
async function rejectQueue(id){
  const btn=$('#rejectSuggestionBtn');btn.disabled=true;
  try{await api('/api/ai/queue',{method:'POST',body:JSON.stringify({action:'reject',queueId:id})});toast('Sugestão rejeitada.');closeDrawer();await loadAll(true);}catch(e){$('#queueActionError').textContent=e.message;}finally{btn.disabled=false;}
}

function openOrder(id){const o=state.orders.find(x=>x.id===id)||(state.ops?.nextOrders||[]).find(x=>x.id===id);if(!o)return;
  openDrawer(o.number||'Encomenda',`<section class="detail-section"><h3>Cliente e entrega</h3><div class="analysis-grid"><div class="analysis-cell"><small>Cliente</small><strong>${esc(o.storeName||o.customerName||'—')}</strong></div><div class="analysis-cell"><small>Entrega</small><strong>${esc(dateOnly(o.deliveryDate))}</strong></div><div class="analysis-cell"><small>Estado</small><strong>${esc(statusLabels[o.status]||o.status)}</strong></div><div class="analysis-cell"><small>Email</small><strong>${esc(o.customerEmail||'—')}</strong></div></div></section><section class="detail-section"><h3>Pedido final</h3><div class="order-items">${(o.items||[]).map(i=>`<span class="item-chip ${i.uncertain?'uncertain':''}">${esc(itemText(i))}</span>`).join('')||'Sem linhas'}</div></section>${(o.reviewReasons||[]).length?`<section class="detail-section"><h3>Alertas</h3><ul class="reason-list">${o.reviewReasons.map(r=>`<li>${esc(r)}</li>`).join('')}</ul></section>`:''}<div class="drawer-actions"><button class="btn ghost" data-print-date="${esc(o.deliveryDate||'')}">Imprimir dia</button></div>`);bindDynamic();}
function openMail(id){const m=(state.mail?.messages||[]).find(x=>x.id===id);if(!m)return;openDrawer(m.subject||'(sem assunto)',`<section class="detail-section"><h3>${m.direction==='out'?'Mensagem enviada':'Mensagem recebida'}</h3><div class="analysis-grid"><div class="analysis-cell"><small>De</small><strong>${esc(m.from||'—')}</strong></div><div class="analysis-cell"><small>Para</small><strong>${esc(m.to||'—')}</strong></div><div class="analysis-cell"><small>Data</small><strong>${esc(fmtWhen(m.date))}</strong></div><div class="analysis-cell"><small>Pasta</small><strong>${esc(m.folder||'—')}</strong></div></div></section><section class="detail-section"><h3>Original</h3><pre style="white-space:pre-wrap;font:inherit;line-height:1.55;background:var(--soft);padding:14px;border-radius:14px">${esc(m.text||'')}</pre></section>`);}

function openManualOrder(){
  $('#modalBackdrop').hidden=false;$('#manualOrderModal').hidden=false;$('#manualLines').innerHTML='';addManualLine();addManualLine();
  const next=state.ops?.summary?.nextDelivery;if(next)$('#manualOrderForm [name="deliveryDate"]').value=next;$('#manualError').textContent='';
}
function closeModal(){ $('#manualOrderModal').hidden=true;$('#modalBackdrop').hidden=true; }
function addManualLine(){const row=document.createElement('div');row.className='manual-line';row.innerHTML=`<input name="quantity" placeholder="Qtd."><input name="unit" placeholder="Unidade"><input name="product" placeholder="Produto"><input name="notes" placeholder="Observações"><button type="button" class="remove-line" aria-label="Remover linha">×</button>`;row.querySelector('.remove-line').onclick=()=>{if($$('.manual-line',$('#manualLines')).length>1)row.remove();};$('#manualLines').appendChild(row);}
async function submitManualOrder(e){
  e.preventDefault();const form=e.currentTarget;const fd=new FormData(form);const items=$$('.manual-line',$('#manualLines')).map(r=>({quantity:$('[name="quantity"]',r).value.trim(),unit:$('[name="unit"]',r).value.trim(),product:$('[name="product"]',r).value.trim(),notes:$('[name="notes"]',r).value.trim()})).filter(x=>x.product);
  const payload={action:'create_manual',customerName:fd.get('customerName'),storeName:fd.get('storeName'),customerEmail:fd.get('customerEmail'),deliveryDate:fd.get('deliveryDate'),items};
  const submit=form.querySelector('[type="submit"]');submit.disabled=true;$('#manualError').textContent='';
  try{const r=await api('/api/orders',{method:'POST',body:JSON.stringify(payload)});toast(`Encomenda ${r.order.number} criada.`);closeModal();form.reset();await loadAll(true);setView('orders');}catch(err){$('#manualError').textContent=err.message;}finally{submit.disabled=false;}
}

async function logout(){try{await api('/api/auth',{method:'POST',body:JSON.stringify({action:'logout'})});}catch{}state.auth=null;await requireLogin();}

function wire(){
  $('#authSubmit').onclick=submitAuth;$('#pinInput').onkeydown=e=>{if(e.key==='Enter')submitAuth();};
  $('#logoutBtn').onclick=logout;$('#refreshBtn').onclick=()=>loadAll();$('#newOrderBtn').onclick=openManualOrder;
  $('#mobileMenuBtn').onclick=()=>$('.sidebar').classList.toggle('open');$('#drawerBackdrop').onclick=closeDrawer;$('#closeDrawer').onclick=closeDrawer;
  $('#modalBackdrop').onclick=closeModal;$$('[data-close-modal]').forEach(b=>b.onclick=closeModal);$('#addManualLine').onclick=addManualLine;$('#manualOrderForm').onsubmit=submitManualOrder;
  $$('#mainNav button').forEach(b=>b.onclick=()=>setView(b.dataset.view));
  $('#globalSearch').oninput=e=>{state.search=e.target.value;if(state.search&&state.view!=='orders')setView('orders');else if(state.view==='orders')render();};
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeDrawer();if(!$('#manualOrderModal').hidden)closeModal();}});
}

wire();tryOriginalLogo();initAuth();
