const state = {
  activeView: 'dashboard',
  conversationFilter: 'all',
  selectedConversation: 1,
  settings: JSON.parse(localStorage.getItem('vitalveg-settings') || 'null') || {
    deliveryDays: [2,4,6],
    cutoff: '14:00'
  }
};

const demo = {
  activities: [
    {id:1, initials:'L3', color:'#e4f5ea', ink:'#0d7440', client:'Loja 3', text:'Alterou a encomenda: 2 cx → 1 cx de alface', time:'12:48', status:'review'},
    {id:2, initials:'L4', color:'#eef7ff', ink:'#2e8de6', client:'Loja 4', text:'Nova encomenda recebida e confirmada', time:'11:22', status:'done'},
    {id:3, initials:'RM', color:'#f3efff', ink:'#7357d8', client:'Restaurante Modelo', text:'Pedido de informação sobre disponibilidade', time:'10:05', status:'info'},
    {id:4, initials:'L3', color:'#fff6df', ink:'#a46c05', client:'Loja 3', text:'Perguntou se podia receber no próprio dia', time:'09:42', status:'review'}
  ],
  reviews: [
    {id:1, title:'Entrega no próprio dia', text:'Pedido recebido antes das 14:00. Pode ser possível, mas exige confirmação de stock e transporte.'},
    {id:2, title:'Alteração depois da confirmação', text:'Cliente reduziu a quantidade para 1 cx de alface. A última instrução deve substituir a anterior.'},
    {id:3, title:'Pedido comercial', text:'Pergunta fora das regras automáticas. Não responder sem decisão humana.'}
  ],
  deliveries: [
    {day:'Terça-feira', date:'Próxima rota', count:'7 encomendas', note:'Fluxo normal'},
    {day:'Quinta-feira', date:'Seguinte', count:'3 encomendas', note:'1 ainda a rever'},
    {day:'Sábado', date:'Fim de semana', count:'4 encomendas', note:'2 confirmadas'}
  ],
  conversations: [
    {
      id:1, client:'Loja 3', subtitle:'Marzovelos', initials:'L3', color:'#e4f5ea', status:'review', statusLabel:'A rever', time:'12:48', preview:'Afinal só precisamos de 1 cx.',
      summary:['Pedido inicial: +2 cx de alface','VitalVeg informou: possível depois das 14h','Última instrução do cliente: 1 cx','Estado final: aguarda confirmação da alteração'],
      messages:[
        {who:'client', text:'Boa tarde. Ainda é possível entregar mais 2 cx de alface hoje?', time:'10:58'},
        {who:'vitalveg', text:'Boa tarde. Sim, mas só consigo entregar depois das 14h, quando o carro regressar da distribuição.', time:'11:40'},
        {who:'client', text:'Sendo a essa hora, então entregue só 1 cx pff. Obrigado.', time:'12:48'}
      ]
    },
    {
      id:2, client:'Loja 4', subtitle:'Rio de Loba', initials:'L4', color:'#eef7ff', status:'done', statusLabel:'Confirmada', time:'11:22', preview:'1 cx alface',
      summary:['Tipo: encomenda','Quantidade: 1 cx de alface','Fluxo: normal','Resposta: receção confirmada'],
      messages:[
        {who:'client', text:'Boa tarde\n\n1 cx alface\n\nObrigado', time:'11:22'},
        {who:'vitalveg', text:'Bom dia. Confirmamos a receção da vossa encomenda. Obrigado.', time:'11:24'}
      ]
    },
    {
      id:3, client:'Loja 3', subtitle:'Marzovelos', initials:'L3', color:'#f3efff', status:'done', statusLabel:'Encerrada', time:'10:55', preview:'Recebeu a nossa encomenda?',
      summary:['Pedido: confirmação de receção','Resposta automática segura: sim','Conversa encerrada'],
      messages:[
        {who:'client', text:'Bom dia. Recebeu a nossa encomenda?', time:'10:55'},
        {who:'vitalveg', text:'Bom dia. Sim, confirmamos a receção da vossa encomenda. Obrigado.', time:'10:57'},
        {who:'client', text:'Ok obrigado', time:'11:02'}
      ]
    },
    {
      id:4, client:'Loja 4', subtitle:'Rio de Loba', initials:'L4', color:'#fff6df', status:'review', statusLabel:'A rever', time:'09:42', preview:'Podem entregar hoje?',
      summary:['Pedido no próprio dia','Recebido antes das 14:00','Regra: revisão humana antes de confirmar'],
      messages:[
        {who:'client', text:'Bom dia. Ainda conseguem entregar hoje 3 cx?', time:'09:42'}
      ]
    },
    {
      id:5, client:'Restaurante Modelo', subtitle:'Viseu', initials:'RM', color:'#eef7ff', status:'info', statusLabel:'Informação', time:'08:20', preview:'Têm tomate coração disponível?',
      summary:['Pedido de informação','Pode ser respondido se houver disponibilidade registada'],
      messages:[
        {who:'client', text:'Bom dia. Têm tomate coração disponível esta semana?', time:'08:20'}
      ]
    }
  ],
  orders: [
    {client:'Loja 4', place:'Rio de Loba', order:'1 cx alface', delivery:'Próxima entrega', state:'Confirmada', stateClass:'confirmed'},
    {client:'Loja 3', place:'Marzovelos', order:'1 cx alface (alteração final)', delivery:'Hoje · depois das 14h', state:'A rever', stateClass:'review'},
    {client:'Loja 3', place:'Marzovelos', order:'Pedido semanal', delivery:'Próxima entrega', state:'Confirmada', stateClass:'confirmed'},
    {client:'Loja 4', place:'Rio de Loba', order:'Pedido semanal', delivery:'Próxima entrega', state:'Pendente', stateClass:'pending'},
    {client:'Restaurante Modelo', place:'Viseu', order:'Informação / sem encomenda', delivery:'—', state:'A rever', stateClass:'review'}
  ],
  customers: [
    {initials:'L3', color:'#e4f5ea', ink:'#0d7440', name:'Loja 3', place:'Marzovelos', last:'Hoje, 12:48', orders:'18 este mês'},
    {initials:'L4', color:'#eef7ff', ink:'#2e8de6', name:'Loja 4', place:'Rio de Loba', last:'Hoje, 11:22', orders:'14 este mês'},
    {initials:'RM', color:'#f3efff', ink:'#7357d8', name:'Restaurante Modelo', place:'Viseu', last:'Hoje, 08:20', orders:'6 este mês'}
  ]
};

const weekdayLabels = ['Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado','Domingo'];

function q(sel, root=document){ return root.querySelector(sel); }
function qa(sel, root=document){ return [...root.querySelectorAll(sel)]; }

function showToast(text){
  const el = q('#toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(showToast.t);
  showToast.t = setTimeout(()=>el.classList.remove('show'), 2300);
}

function formatToday(){
  const d = new Date();
  return new Intl.DateTimeFormat('pt-PT',{weekday:'long',day:'numeric',month:'long'}).format(d)
    .replace(/^./, c=>c.toUpperCase());
}

function setView(view){
  state.activeView = view;
  qa('.view').forEach(v=>v.classList.toggle('active-view', v.id===`view-${view}`));
  qa('[data-view]').forEach(b=>b.classList.toggle('active', b.dataset.view===view));
  window.scrollTo({top:0,behavior:'smooth'});
  if(view==='conversations') renderConversations();
}

function renderDashboard(){
  q('#todayChip').textContent = formatToday();
  q('#activityList').innerHTML = demo.activities.map(a=>`
    <div class="activity-row">
      <div class="activity-avatar" style="background:${a.color};color:${a.ink}">${a.initials}</div>
      <div class="activity-main"><strong>${a.client}</strong><span>${a.text}</span></div>
      <time class="activity-time">${a.time}</time><span class="dot-mini"></span>
    </div>`).join('');

  q('#reviewList').innerHTML = demo.reviews.map(r=>`
    <article class="review-card" data-review-id="${r.id}">
      <div class="review-icon">!</div>
      <div><strong>${r.title}</strong><p>${r.text}</p>
        <div class="review-actions"><button class="btn-primary review-open">Ver conversa</button><button class="btn-soft review-dismiss">Marcar visto</button></div>
      </div>
    </article>`).join('');

  q('#deliveryStrip').innerHTML = demo.deliveries.map(d=>`
    <div class="delivery-card"><small>${d.date}</small><strong>${d.day}</strong><div class="delivery-count">${d.count}</div><small>${d.note}</small></div>`).join('');
}

function filteredConversations(){
  const filter = state.conversationFilter;
  if(filter==='review') return demo.conversations.filter(c=>c.status==='review');
  if(filter==='done') return demo.conversations.filter(c=>c.status==='done');
  return demo.conversations;
}

function renderConversations(){
  const list = filteredConversations();
  if(!list.find(c=>c.id===state.selectedConversation)) state.selectedConversation = list[0]?.id || null;
  q('#conversationList').innerHTML = list.map(c=>`
    <button class="conversation-item ${c.id===state.selectedConversation?'active':''}" data-conversation-id="${c.id}">
      <div class="ci-avatar" style="background:${c.color}">${c.initials}</div>
      <div class="ci-main"><div class="ci-line"><strong>${c.client}</strong><time>${c.time}</time></div><p>${c.preview}</p><span class="status-badge status-${c.status}">${c.statusLabel}</span></div>
    </button>`).join('') || '<div class="detail-empty"><div><strong>Sem conversas aqui.</strong><p>Muda o filtro para ver outras.</p></div></div>';
  renderConversationDetail();
}

function renderConversationDetail(){
  const c = demo.conversations.find(x=>x.id===state.selectedConversation);
  const detail = q('#conversationDetail');
  if(!c){ detail.innerHTML='<div class="detail-empty"><div><strong>Seleciona uma conversa.</strong><p>O contexto completo aparece aqui.</p></div></div>'; return; }
  detail.innerHTML = `
    <div class="detail-head"><div><h2>${c.client} · ${c.subtitle}</h2><p>Conversa completa · última instrução prevalece</p></div><span class="status-badge status-${c.status}">${c.statusLabel}</span></div>
    <div class="thread">${c.messages.map(m=>`<div class="bubble ${m.who}">${m.text.replaceAll('\n','<br>')}<small>${m.who==='client'?'Cliente':'VitalVeg'} · ${m.time}</small></div>`).join('')}</div>
    <div class="ai-summary"><div class="ai-title">✦ INTERPRETAÇÃO DA CENTRAL</div><ul>${c.summary.map(s=>`<li>${s}</li>`).join('')}</ul></div>
    <div class="detail-actions">${c.status==='review'?'<button class="btn-primary" data-action="approve">Aprovar resposta</button><button class="btn-soft" data-action="manual">Responder manualmente</button>':'<button class="btn-soft" data-action="reopen">Reabrir</button>'}<button class="btn-soft" data-action="treated">Marcar tratado</button></div>`;
}

function renderOrders(){
  q('#ordersBody').innerHTML = demo.orders.map(o=>`
    <tr><td class="order-customer"><strong>${o.client}</strong><small>${o.place}</small></td><td>${o.order}</td><td>${o.delivery}</td><td><span class="state-chip state-${o.stateClass}">${o.state}</span></td><td><button class="row-action">›</button></td></tr>`).join('');
}

function renderCustomers(){
  q('#customerGrid').innerHTML = demo.customers.map(c=>`
    <article class="customer-card"><div class="customer-top"><div class="customer-avatar" style="background:${c.color};color:${c.ink}">${c.initials}</div><div><h3>${c.name}</h3><p>${c.place}</p></div></div><div class="customer-meta"><div><span>Último contacto</span><strong>${c.last}</strong></div><div><span>Encomendas</span><strong>${c.orders}</strong></div></div></article>`).join('');
}

function renderSettings(){
  q('#weekdayGrid').innerHTML = weekdayLabels.map((label,i)=>`
    <label class="day-check"><input type="checkbox" data-day="${i+1}" ${state.settings.deliveryDays.includes(i+1)?'checked':''}><span>${label}</span></label>`).join('');
  q('#cutoffInput').value = state.settings.cutoff;
}

function searchEverything(term){
  const s = term.trim().toLowerCase();
  if(!s) return;
  const conversation = demo.conversations.find(c=>`${c.client} ${c.subtitle} ${c.preview} ${c.messages.map(m=>m.text).join(' ')}`.toLowerCase().includes(s));
  if(conversation){
    state.selectedConversation = conversation.id;
    state.conversationFilter = 'all';
    qa('.seg').forEach(b=>b.classList.toggle('active',b.dataset.filter==='all'));
    setView('conversations');
    showToast(`Encontrado em ${conversation.client}`);
  } else showToast('Não encontrei resultados neste protótipo.');
}

function bindEvents(){
  qa('[data-view]').forEach(btn=>btn.addEventListener('click',()=>setView(btn.dataset.view)));
  qa('[data-jump]').forEach(btn=>btn.addEventListener('click',()=>setView(btn.dataset.jump)));

  document.addEventListener('click', e=>{
    const ci = e.target.closest('[data-conversation-id]');
    if(ci){ state.selectedConversation = Number(ci.dataset.conversationId); renderConversations(); }

    const seg = e.target.closest('.seg');
    if(seg){ state.conversationFilter = seg.dataset.filter; qa('.seg').forEach(x=>x.classList.toggle('active',x===seg)); renderConversations(); }

    const reviewOpen = e.target.closest('.review-open');
    if(reviewOpen){ state.selectedConversation = Number(reviewOpen.closest('[data-review-id]').dataset.reviewId); setView('conversations'); }

    const reviewDismiss = e.target.closest('.review-dismiss');
    if(reviewDismiss){ reviewDismiss.closest('.review-card').style.display='none'; showToast('Marcado como visto.'); }

    const action = e.target.closest('[data-action]');
    if(action){
      const labels={approve:'Resposta aprovada no protótipo.',manual:'Modo de resposta manual preparado.',reopen:'Conversa reaberta.',treated:'Marcado como tratado.'};
      showToast(labels[action.dataset.action] || 'Ação registada.');
    }
  });

  q('#saveSettings').addEventListener('click',()=>{
    state.settings.deliveryDays = qa('[data-day]:checked').map(i=>Number(i.dataset.day));
    state.settings.cutoff = q('#cutoffInput').value || '14:00';
    localStorage.setItem('vitalveg-settings',JSON.stringify(state.settings));
    q('#saveHint').textContent = 'Alterações guardadas neste dispositivo.';
    showToast('Definições guardadas.');
    setTimeout(()=>q('#saveHint').textContent='',3000);
  });

  q('#newOrderBtn').addEventListener('click',()=>showToast('Criação manual de encomenda fica para a próxima ligação ao backend.'));

  const search = q('#searchInput');
  search.addEventListener('keydown',e=>{ if(e.key==='Enter') searchEverything(search.value); });
}

function initPWA(){
  if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{});
}

function init(){
  renderDashboard();
  renderConversations();
  renderOrders();
  renderCustomers();
  renderSettings();
  bindEvents();
  initPWA();
}

document.addEventListener('DOMContentLoaded',init);
