const state = {
  activeView: 'dashboard',
  conversationFilter: 'all',
  selectedThread: null,
  credentials: null,
  messages: [],
  threads: [],
  lastFetchedAt: null,
  loading: false,
  settings: JSON.parse(localStorage.getItem('vitalveg-settings') || 'null') || {
    deliveryDays: [2,4,6],
    cutoff: '14:00'
  }
};

const weekdayLabels = ['Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado','Domingo'];
const PRODUCTS = ['alface','alfaces','tomate','tomates','cherry','courgette','corgete','pimento','pimentos','couve','couves','nabiça','nabiças','nabica','nabicas','salsa','coentros','cebola','cebolas','fava','favas'];
const UNIT_RE = /\b\d+(?:[.,]\d+)?\s*(?:x\s*)?(?:cx|cxs|caixa|caixas|kg|kgs|quilo|quilos|covete|covetes|un|unid|unidade|unidades|molho|molhos|tabuleiro|tabuleiros|saco|sacos)\b/i;

function q(sel, root=document){ return root.querySelector(sel); }
function qa(sel, root=document){ return [...root.querySelectorAll(sel)]; }
function escapeHtml(value=''){ return String(value).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function showToast(text){ const el=q('#toast'); if(!el) return; el.textContent=text; el.classList.add('show'); clearTimeout(showToast.t); showToast.t=setTimeout(()=>el.classList.remove('show'),2800); }
function formatToday(){ const d=new Date(); return new Intl.DateTimeFormat('pt-PT',{weekday:'long',day:'numeric',month:'long'}).format(d).replace(/^./,c=>c.toUpperCase()); }
function fmtTime(date){ return new Intl.DateTimeFormat('pt-PT',{hour:'2-digit',minute:'2-digit'}).format(new Date(date)); }
function fmtDate(date){ return new Intl.DateTimeFormat('pt-PT',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(date)); }
function sameDay(a,b=new Date()){ const x=new Date(a),y=new Date(b); return x.getFullYear()===y.getFullYear()&&x.getMonth()===y.getMonth()&&x.getDate()===y.getDate(); }
function extractAddress(value=''){ const m=String(value).match(/<([^>]+)>/); if(m) return m[1].toLowerCase(); const m2=String(value).match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i); return m2?m2[0].toLowerCase():String(value).trim().toLowerCase(); }
function displayName(value=''){ const s=String(value).trim(); const before=s.split('<')[0].replace(/^['"]|['"]$/g,'').trim(); return before||extractAddress(s)||'Sem nome'; }
function normalizeSubject(s=''){ let x=String(s).trim(); let prev=''; while(x!==prev){ prev=x; x=x.replace(/^\s*(re|fw|fwd|enc|res)\s*:\s*/i,'').trim(); } return x.toLowerCase(); }
function currentText(text=''){ let x=String(text||'').replace(/\r/g,'').trim(); const markers=[/^Às .+ escreveu:$/mi,/^Em .+ escreveu:$/mi,/^On .+ wrote:$/mi,/^De:\s.+$/mi,/^From:\s.+$/mi,/^-{2,}\s*Mensagem original\s*-{2,}$/mi,/^-{2,}\s*Original Message\s*-{2,}$/mi]; const pos=markers.map(r=>x.search(r)).filter(n=>n>=0); if(pos.length) x=x.slice(0,Math.min(...pos)); x=x.split(/Este e-mail foi analisado pelo software antivírus Avast/i)[0]; return x.trim(); }
function hasProduct(text=''){ const low=text.toLowerCase(); return PRODUCTS.some(p=>low.includes(p)); }
function isAck(text=''){ const n=text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim(); return ['ok','obrigado','obrigada','ok obrigado','ok obrigada','combinado','perfeito','está bem','esta bem','grato','grata'].some(p=>n===p||n.startsWith(p+' ')); }

function classifyMessage(m){
  if(m.direction==='out') return 'ENVIADO POR NÓS';
  const subject=(m.subject||'').toLowerCase();
  const text=currentText(m.text||'');
  const low=text.toLowerCase();
  const addr=extractAddress(m.from);
  if(/no-?reply|mailer-daemon/.test(addr)) return 'AUTOMÁTICO / SISTEMA';
  if(/recebeu a nossa encomenda|receberam a nossa encomenda|confirmam a rece[pç][cç][aã]o|chegou a encomenda/.test(low)) return 'PEDIDO DE CONFIRMAÇÃO';
  if(isAck(text) && /^re:/i.test(m.subject||'')) return 'SEM AÇÃO';
  if(/reclama|danificad|estragad|veio em falta|faltou|não veio|nao veio|devolu/.test(low)) return 'PROBLEMA / RECLAMAÇÃO';
  if(/fatura|factura|nota de cr[eé]dito|recibo|pagamento|comprovativo|extrato/.test(low)) return 'DOCUMENTO / FATURA';
  if(/^re:/i.test(m.subject||'') && UNIT_RE.test(text) && /mais\s|s[oó]\s|j[aá]\s+s[oó]|apenas|afinal|em vez|acrescent|alter|retir|entregue|podem entregar|pode entregar/i.test(low)) return 'ALTERAÇÃO À ENCOMENDA';
  if(/encomenda|pedido/.test(subject) && !isAck(text)) return 'ENCOMENDA';
  if(UNIT_RE.test(text) && (hasProduct(text)||hasProduct(subject))) return 'ENCOMENDA';
  if((UNIT_RE.test(text)||hasProduct(subject)) && /tragam|traga|mandem|mande|envie|preciso de|queria|quero|podem trazer|pode trazer/i.test(low)) return 'ENCOMENDA';
  if(/pre[cç]o|tabela de pre[cç]os|disponibilidade|informa[cç][aã]o|gostaria de saber|podem informar|conseguem fornecer/.test(low)) return 'PEDIDO DE INFORMAÇÃO';
  if(/newsletter|marketing|publicidade|unsubscribe/.test(low)) return 'PUBLICIDADE / MARKETING';
  return /^re:/i.test(m.subject||'') ? 'CONVERSA / REVER' : 'OUTRO / REVER';
}

function counterpart(m){ return m.direction==='out'?extractAddress(m.to):extractAddress(m.from); }
function buildThreads(messages){
  const groups=new Map();
  [...messages].sort((a,b)=>new Date(a.date)-new Date(b.date)).forEach(m=>{
    m.current=currentText(m.text||''); m.type=classifyMessage(m); m.counterpart=counterpart(m);
    const key=`${normalizeSubject(m.subject)}|${m.counterpart}`;
    if(!groups.has(key)) groups.set(key,{key,messages:[],counterpart:m.counterpart});
    groups.get(key).messages.push(m);
  });
  return [...groups.values()].map(t=>{
    t.messages.sort((a,b)=>new Date(a.date)-new Date(b.date));
    const inbound=t.messages.filter(m=>m.direction==='in');
    const last=t.messages[t.messages.length-1];
    const latestInbound=inbound[inbound.length-1]||last;
    const orderMsgs=inbound.filter(m=>m.type==='ENCOMENDA'||m.type==='ALTERAÇÃO À ENCOMENDA');
    const latestOrder=orderMsgs[orderMsgs.length-1];
    const sentAfterLatestOrder=latestOrder ? t.messages.some(m=>m.direction==='out'&&new Date(m.date)>new Date(latestOrder.date)) : false;
    let status='done', statusLabel='Tratada';
    if(latestInbound?.type==='SEM AÇÃO') { status='done'; statusLabel='Encerrada'; }
    else if(latestInbound?.type==='AUTOMÁTICO / SISTEMA'||latestInbound?.type==='PUBLICIDADE / MARKETING'){ status='done'; statusLabel='Sem ação'; }
    else if(latestInbound?.type==='ENCOMENDA') { status=sentAfterLatestOrder?'done':'review'; statusLabel=sentAfterLatestOrder?'Confirmada':'A confirmar'; }
    else if(latestInbound?.type==='ALTERAÇÃO À ENCOMENDA') { status=sentAfterLatestOrder?'done':'review'; statusLabel=sentAfterLatestOrder?'Alteração respondida':'Alteração pendente'; }
    else if(latestInbound?.type==='PEDIDO DE CONFIRMAÇÃO'){ const answered=t.messages.some(m=>m.direction==='out'&&new Date(m.date)>new Date(latestInbound.date)); status=answered?'done':'review'; statusLabel=answered?'Respondido':'Responder'; }
    else if(['PROBLEMA / RECLAMAÇÃO','PEDIDO DE INFORMAÇÃO','CONVERSA / REVER','OUTRO / REVER'].includes(latestInbound?.type)){ const answered=t.messages.some(m=>m.direction==='out'&&new Date(m.date)>new Date(latestInbound.date)); status=answered?'done':'review'; statusLabel=answered?'Respondido':'A rever'; }
    t.latest=last; t.latestInbound=latestInbound; t.latestOrder=latestOrder; t.status=status; t.statusLabel=statusLabel;
    t.name=displayName(latestInbound?.from||t.counterpart); t.subject=latestInbound?.subject||last?.subject||'(sem assunto)';
    return t;
  }).sort((a,b)=>new Date(b.latest.date)-new Date(a.latest.date));
}

function jsWeekday(date){ const d=new Date(date).getDay(); return d===0?7:d; }
function nextDelivery(from, includeSame=false){ const d=new Date(from); for(let i=includeSame?0:1;i<15;i++){ const x=new Date(d); x.setDate(d.getDate()+i); if(state.settings.deliveryDays.includes(jsWeekday(x))) return x; } return null; }
function deliveryDecision(m){
  const d=new Date(m.date); const day=jsWeekday(d); const ownDay=state.settings.deliveryDays.includes(day); const [h,mi]=(state.settings.cutoff||'14:00').split(':').map(Number); const after=(d.getHours()>h)||(d.getHours()===h&&d.getMinutes()>=mi);
  if(ownDay && !after) return {mode:'human',date:d,label:'Próprio dia · rever'};
  if(ownDay && after){ const n=nextDelivery(d,false); return {mode:'next',date:n,label:n?weekdayLabels[jsWeekday(n)-1]:'Próxima entrega'}; }
  const n=nextDelivery(d,false); return {mode:'normal',date:n,label:n?weekdayLabels[jsWeekday(n)-1]:'Próxima entrega'};
}
function orderSummary(m){ const text=m.current||''; const lines=text.split(/\n+/).map(x=>x.trim()).filter(Boolean); const likely=lines.filter(x=>UNIT_RE.test(x)||hasProduct(x)); return likely.slice(0,4).join(' · ')||text.slice(0,120)||m.subject; }
function suggestedReply(thread){
  const m=thread.latestInbound; if(!m) return '';
  if(m.type==='SEM AÇÃO'||m.type==='AUTOMÁTICO / SISTEMA'||m.type==='PUBLICIDADE / MARKETING') return '';
  if(m.type==='PEDIDO DE CONFIRMAÇÃO') return 'Bom dia,\n\nSim, confirmamos a receção da vossa encomenda.\n\nObrigado.\n\nVitalVeg';
  if(m.type==='ENCOMENDA'){
    const d=deliveryDecision(m);
    if(d.mode==='human') return '';
    if(d.mode==='next'&&d.date) return `Bom dia,\n\nConfirmamos a receção da vossa encomenda.\n\nComo a encomenda foi recebida após as ${state.settings.cutoff} do próprio dia de distribuição, já não é possível efetuar a entrega hoje. A encomenda ficará registada para ${weekdayLabels[jsWeekday(d.date)-1]}, dia ${String(d.date.getDate()).padStart(2,'0')}/${String(d.date.getMonth()+1).padStart(2,'0')}.\n\nObrigado.\n\nVitalVeg`;
    return 'Bom dia,\n\nConfirmamos a receção da vossa encomenda.\n\nObrigado.\n\nVitalVeg';
  }
  if(m.type==='PROBLEMA / RECLAMAÇÃO') return 'Bom dia,\n\nConfirmamos a receção da sua mensagem. O assunto será analisado com prioridade e entraremos em contacto logo que possível.\n\nObrigado.\n\nVitalVeg';
  if(m.type==='PEDIDO DE INFORMAÇÃO') return 'Bom dia,\n\nConfirmamos a receção do seu pedido de informação. O assunto será tratado com a maior brevidade possível.\n\nObrigado.\n\nVitalVeg';
  return '';
}

function injectRealStyles(){
  if(q('#realStyles')) return;
  const s=document.createElement('style'); s.id='realStyles'; s.textContent=`
  .connect-gate{position:fixed;inset:0;z-index:8000;background:rgba(5,40,24,.72);backdrop-filter:blur(12px);display:grid;place-items:center;padding:18px}.connect-card{width:min(520px,100%);background:#fff;border-radius:28px;padding:24px;box-shadow:0 30px 80px rgba(0,0,0,.22)}.connect-card h2{margin:0 0 6px}.connect-card p{color:#68766e;line-height:1.5}.connect-field{display:grid;gap:6px;margin:14px 0}.connect-field label{font-size:12px;font-weight:800;color:#405047}.connect-field input{height:48px;border:1px solid #dce5df;border-radius:15px;padding:0 14px;font-size:16px}.connect-actions{display:flex;gap:9px;align-items:center;margin-top:18px}.connect-note{font-size:11px!important;background:#f4f8f5;border-radius:14px;padding:11px;color:#69776f!important}.empty-real{padding:32px 20px;text-align:center;color:#748078}.empty-real strong{display:block;color:#304139;margin-bottom:5px}.live-badge{display:inline-flex;align-items:center;gap:7px;background:#e6f7ec;color:#0c7440;border-radius:999px;padding:8px 11px;font-size:11px;font-weight:800}.live-badge:before{content:'';width:8px;height:8px;border-radius:50%;background:#21aa5c}.reply-box{width:100%;min-height:170px;border:1px solid #dfe7e2;border-radius:16px;padding:13px;resize:vertical;font:inherit}.danger-note{background:#fff6df;border:1px solid #f0dfb7;border-radius:15px;padding:12px;color:#76520f;font-size:12px;margin-top:12px}`; document.head.appendChild(s);
}

function openConnectGate(message=''){
  injectRealStyles();
  let gate=q('#connectGate'); if(gate) gate.remove();
  gate=document.createElement('div'); gate.id='connectGate'; gate.className='connect-gate';
  const isGithub=location.hostname.includes('github.io');
  gate.innerHTML=`<div class="connect-card"><div class="live-badge">DADOS REAIS</div><h2>${isGithub?'Falta ativar o backend':'Ligar o email VitalVeg'}</h2>${isGithub?`<p>Esta versão do GitHub já não usa dados de demonstração. Para ler o email real é preciso abrir a mesma aplicação no servidor que tem acesso IMAP.</p><div class="danger-note">O backend já está preparado. Falta apenas ligar o projeto Netlify ao repositório — depois usarás <strong>vitalveg-central.netlify.app</strong>.</div>`:`<p>Introduz a palavra-passe do <strong>geral@vitalveg.pt</strong>. Fica apenas na memória desta sessão e não é guardada pelo navegador nem pelo servidor.</p><div class="connect-field"><label>Email</label><input id="realEmail" value="geral@vitalveg.pt" autocomplete="username"></div><div class="connect-field"><label>Palavra-passe</label><input id="realPassword" type="password" autocomplete="current-password"></div><div id="connectError" class="auth-error"></div><div class="connect-actions"><button id="connectNow" class="primary-action">Ligar aos emails reais</button></div><p class="connect-note">Nesta fase de teste, a central só lê e sugere. Só envia uma resposta quando carregares explicitamente em “Enviar resposta”.</p>`}</div>`;
  document.body.appendChild(gate);
  if(!isGithub){ q('#connectNow').addEventListener('click',connectRealMail); q('#realPassword').addEventListener('keydown',e=>{if(e.key==='Enter')connectRealMail();}); }
}

async function connectRealMail(){
  const email=q('#realEmail').value.trim(), password=q('#realPassword').value; const err=q('#connectError'); err.textContent='';
  if(!password){err.textContent='Escreve a palavra-passe do email.';return;}
  state.credentials={email,password}; q('#connectNow').disabled=true; q('#connectNow').textContent='A ligar…';
  try{ await fetchRealMail(true); q('#connectGate')?.remove(); startPolling(); }
  catch(e){ state.credentials=null; err.textContent=e.message||'Não foi possível ligar.'; q('#connectNow').disabled=false; q('#connectNow').textContent='Ligar aos emails reais'; }
}

async function fetchRealMail(first=false){
  if(!state.credentials||state.loading) return; state.loading=true;
  try{
    const res=await fetch('/api/mail',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...state.credentials,limit:90})});
    const data=await res.json().catch(()=>({})); if(!res.ok) throw new Error(data.error||'Erro ao ler o email');
    const oldIds=new Set(state.messages.map(m=>m.id)); state.messages=data.messages||[]; state.threads=buildThreads(state.messages); state.lastFetchedAt=data.fetchedAt;
    if(!state.selectedThread&&state.threads[0]) state.selectedThread=state.threads[0].key;
    renderAllReal(); updateStatus(true,data.sentFolder);
    const fresh=state.messages.filter(m=>m.direction==='in'&&!oldIds.has(m.id));
    if(!first&&fresh.length){ showToast(`${fresh.length} novo${fresh.length>1?'s':''} email${fresh.length>1?'s':''}.`); if(Notification.permission==='granted') new Notification('VitalVeg',{body:`${fresh.length} novo${fresh.length>1?'s':''} email${fresh.length>1?'s':''} recebido${fresh.length>1?'s':''}.`}); }
  } finally { state.loading=false; }
}
function startPolling(){ clearInterval(startPolling.timer); startPolling.timer=setInterval(()=>fetchRealMail(false).catch(()=>updateStatus(false)),60000); if('Notification'in window&&Notification.permission==='default') Notification.requestPermission().catch(()=>{}); }
function updateStatus(ok,sentFolder=''){ const box=q('.side-status'); if(!box)return; box.innerHTML=`<span class="status-dot" style="background:${ok?'#42cf72':'#f0a21b'}"></span><div><strong>${ok?'Email real ligado':'Ligação em espera'}</strong><small>${ok?`Recebidos + ${sentFolder?'Enviados':'sem pasta Enviados'} · ${state.lastFetchedAt?fmtTime(state.lastFetchedAt):''}`:'A tentar novamente'}</small></div>`; }

function setMetric(index,value,small){ const card=qa('.metric-card')[index]; if(!card)return; const strong=card.querySelector('strong'); const sm=card.querySelector('small'); if(strong)strong.textContent=value; if(sm&&small)sm.textContent=small; }
function realOrders(){ return state.threads.filter(t=>t.latestOrder).map(t=>{ const m=t.latestOrder; const d=deliveryDecision(m); return {thread:t,client:t.name,order:orderSummary(m),delivery:d.label,state:t.statusLabel,stateClass:t.status==='review'?'review':'confirmed'}; }); }
function renderDashboard(){
  q('#todayChip').textContent=formatToday();
  const incomingToday=state.messages.filter(m=>m.direction==='in'&&sameDay(m.date)); const orderToday=incomingToday.filter(m=>['ENCOMENDA','ALTERAÇÃO À ENCOMENDA'].includes(classifyMessage(m))); const reviews=state.threads.filter(t=>t.status==='review'); const doneToday=state.threads.filter(t=>t.status==='done'&&sameDay(t.latest.date));
  setMetric(0,orderToday.length,`${orderToday.filter(m=>state.threads.find(t=>t.messages.some(x=>x.id===m.id))?.status==='done').length} já tratadas`); setMetric(1,reviews.length,'Precisam de decisão humana'); setMetric(2,doneToday.length,'Conversas tratadas hoje'); setMetric(3,state.threads.length,'Conversas reais carregadas'); q('#navReviewCount').textContent=reviews.length;
  const recent=state.messages.filter(m=>m.direction==='in').sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,6);
  q('#activityList').innerHTML=recent.length?recent.map(m=>`<div class="activity-row"><div class="activity-avatar" style="background:#e7f7ed;color:#0d7440">${escapeHtml(displayName(m.from).slice(0,2).toUpperCase())}</div><div class="activity-main"><strong>${escapeHtml(displayName(m.from))}</strong><span>${escapeHtml(m.type||classifyMessage(m))} · ${escapeHtml((m.current||currentText(m.text)).replace(/\n/g,' ').slice(0,95))}</span></div><time class="activity-time">${fmtTime(m.date)}</time><span class="dot-mini"></span></div>`).join(''):'<div class="empty-real"><strong>Ainda não há emails reais carregados.</strong><span>A central atualiza automaticamente.</span></div>';
  q('#reviewList').innerHTML=reviews.length?reviews.slice(0,5).map(t=>`<article class="review-card" data-thread="${escapeHtml(t.key)}"><div class="review-icon">!</div><div><strong>${escapeHtml(t.name)} · ${escapeHtml(t.statusLabel)}</strong><p>${escapeHtml((t.latestInbound.current||'').replace(/\n/g,' ').slice(0,130))}</p><div class="review-actions"><button class="btn-primary review-open">Ver conversa</button></div></div></article>`).join(''):'<div class="empty-real"><strong>Nada pendente.</strong><span>Quando chegar algo que precise de ti aparece aqui.</span></div>';
  const orders=realOrders(); const byDay=new Map(); orders.forEach(o=>{ const d=deliveryDecision(o.thread.latestOrder).date; if(!d)return; const key=d.toISOString().slice(0,10); byDay.set(key,(byDay.get(key)||0)+1); }); const days=[...byDay.entries()].sort().slice(0,3);
  q('#deliveryStrip').innerHTML=days.length?days.map(([k,count])=>{const d=new Date(k+'T12:00:00');return `<div class="delivery-card"><small>${d.toLocaleDateString('pt-PT',{day:'2-digit',month:'2-digit'})}</small><strong>${weekdayLabels[jsWeekday(d)-1]}</strong><div class="delivery-count">${count} encomenda${count>1?'s':''}</div><small>Calculado pelos emails reais</small></div>`}).join(''):'<div class="empty-real"><strong>Sem entregas calculadas.</strong><span>Quando entrarem encomendas aparecem aqui.</span></div>';
}

function filteredThreads(){ if(state.conversationFilter==='review') return state.threads.filter(t=>t.status==='review'); if(state.conversationFilter==='done') return state.threads.filter(t=>t.status==='done'); return state.threads; }
function renderConversations(){ const list=filteredThreads(); if(!list.find(t=>t.key===state.selectedThread)) state.selectedThread=list[0]?.key||null; q('#conversationList').innerHTML=list.length?list.map(t=>`<button class="conversation-item ${t.key===state.selectedThread?'active':''}" data-thread="${escapeHtml(t.key)}"><div class="ci-avatar" style="background:#e7f7ed">${escapeHtml(t.name.slice(0,2).toUpperCase())}</div><div class="ci-main"><div class="ci-line"><strong>${escapeHtml(t.name)}</strong><time>${fmtTime(t.latest.date)}</time></div><p>${escapeHtml((t.latest.current||t.latest.text||t.subject).replace(/\n/g,' ').slice(0,90))}</p><span class="status-badge status-${t.status}">${escapeHtml(t.statusLabel)}</span></div></button>`).join(''):'<div class="empty-real"><strong>Sem conversas.</strong><span>Os emails reais vão aparecer aqui.</span></div>'; renderConversationDetail(); }
function renderConversationDetail(){ const t=state.threads.find(x=>x.key===state.selectedThread); const detail=q('#conversationDetail'); if(!t){detail.innerHTML='<div class="detail-empty"><div><strong>Seleciona uma conversa.</strong><p>O histórico real aparece aqui.</p></div></div>';return;} const suggestion=suggestedReply(t); const human= t.latestInbound?.type==='ENCOMENDA'&&deliveryDecision(t.latestInbound).mode==='human'; detail.innerHTML=`<div class="detail-head"><div><h2>${escapeHtml(t.name)}</h2><p>${escapeHtml(t.subject)}</p></div><span class="status-badge status-${t.status}">${escapeHtml(t.statusLabel)}</span></div><div class="thread">${t.messages.map(m=>`<div class="bubble ${m.direction==='out'?'vitalveg':'client'}">${escapeHtml(m.current||m.text||'(sem texto)').replace(/\n/g,'<br>')}<small>${m.direction==='out'?'VitalVeg':'Cliente'} · ${fmtDate(m.date)} · ${escapeHtml(m.type)}</small></div>`).join('')}</div><div class="ai-summary"><div class="ai-title">ESTADO ATUAL</div><ul><li>Último email: ${escapeHtml(t.latestInbound?.type||'—')}</li>${t.latestOrder?`<li>Pedido atual: ${escapeHtml(orderSummary(t.latestOrder))}</li><li>Entrega: ${escapeHtml(deliveryDecision(t.latestOrder).label)}</li>`:''}<li>Estado da conversa: ${escapeHtml(t.statusLabel)}</li></ul>${human?'<div class="danger-note">Chegou no próprio dia de entrega antes das 14:00. Não deve ser confirmada automaticamente — precisa de decisão humana.</div>':''}</div>${suggestion?`<div style="padding:0 24px 18px"><label style="font-size:12px;font-weight:800">Resposta sugerida</label><textarea id="replyDraft" class="reply-box">${escapeHtml(suggestion)}</textarea><div class="detail-actions" style="padding:12px 0 0;border:0"><button class="btn-primary" id="sendReplyBtn">Enviar resposta</button><button class="btn-soft" id="copyReplyBtn">Copiar</button></div></div>`:'<div class="detail-actions"><button class="btn-soft">Sem resposta automática sugerida</button></div>'}`; q('#sendReplyBtn')?.addEventListener('click',()=>sendReply(t)); q('#copyReplyBtn')?.addEventListener('click',()=>{navigator.clipboard?.writeText(q('#replyDraft').value);showToast('Resposta copiada.');}); }

async function sendReply(thread){ if(!state.credentials)return; const latest=thread.latestInbound; if(!latest)return; const btn=q('#sendReplyBtn'); const text=q('#replyDraft').value.trim(); if(!text)return; if(!confirm(`Enviar esta resposta para ${displayName(latest.from)}?`))return; btn.disabled=true;btn.textContent='A enviar…'; try{ const subject=/^re:/i.test(latest.subject)?latest.subject:`Re: ${latest.subject}`; const res=await fetch('/api/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...state.credentials,to:extractAddress(latest.from),subject,text,inReplyTo:latest.messageId||'',references:latest.references||[]})}); const data=await res.json().catch(()=>({})); if(!res.ok)throw new Error(data.error||'Falha no envio'); showToast('Email enviado.'); await new Promise(r=>setTimeout(r,1200)); await fetchRealMail(false); }catch(e){alert(e.message||'Não foi possível enviar.');}finally{if(btn){btn.disabled=false;btn.textContent='Enviar resposta';}} }

function renderOrders(){ const orders=realOrders(); q('#ordersBody').innerHTML=orders.length?orders.map(o=>`<tr><td class="order-customer"><strong>${escapeHtml(o.client)}</strong><small>${escapeHtml(o.thread.counterpart)}</small></td><td>${escapeHtml(o.order)}</td><td>${escapeHtml(o.delivery)}</td><td><span class="state-chip state-${o.stateClass}">${escapeHtml(o.state)}</span></td><td><button class="row-action" data-thread="${escapeHtml(o.thread.key)}">›</button></td></tr>`).join(''):'<tr><td colspan="5"><div class="empty-real"><strong>Ainda não há encomendas reais.</strong><span>Quando começarem a chegar, aparecem aqui.</span></div></td></tr>'; }
function renderCustomers(){ const map=new Map(); state.messages.filter(m=>m.direction==='in').forEach(m=>{const addr=extractAddress(m.from);if(!addr)return;const x=map.get(addr)||{name:displayName(m.from),addr,count:0,last:m.date};x.count++;if(new Date(m.date)>new Date(x.last))x.last=m.date;map.set(addr,x);}); const arr=[...map.values()].sort((a,b)=>new Date(b.last)-new Date(a.last)); q('#customerGrid').innerHTML=arr.length?arr.map(c=>`<article class="customer-card"><div class="customer-top"><div class="customer-avatar" style="background:#e7f7ed;color:#0d7440">${escapeHtml(c.name.slice(0,2).toUpperCase())}</div><div><h3>${escapeHtml(c.name)}</h3><p>${escapeHtml(c.addr)}</p></div></div><div class="customer-meta"><div><span>Último contacto</span><strong>${fmtDate(c.last)}</strong></div><div><span>Emails carregados</span><strong>${c.count}</strong></div></div></article>`).join(''):'<div class="empty-real"><strong>Sem clientes carregados.</strong></div>'; }
function renderSettings(){ q('#weekdayGrid').innerHTML=weekdayLabels.map((label,i)=>`<label class="day-check"><input type="checkbox" data-day="${i+1}" ${state.settings.deliveryDays.includes(i+1)?'checked':''}><span>${label}</span></label>`).join(''); q('#cutoffInput').value=state.settings.cutoff; }
function renderAllReal(){ renderDashboard();renderConversations();renderOrders();renderCustomers();renderSettings(); }

function setView(view){ state.activeView=view; qa('.view').forEach(v=>v.classList.toggle('active-view',v.id===`view-${view}`)); qa('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view)); window.scrollTo({top:0,behavior:'smooth'}); if(view==='conversations')renderConversations(); }
function searchEverything(term){ const s=term.trim().toLowerCase(); if(!s)return; const t=state.threads.find(t=>`${t.name} ${t.subject} ${t.messages.map(m=>m.current).join(' ')}`.toLowerCase().includes(s)); if(t){state.selectedThread=t.key;state.conversationFilter='all';setView('conversations');showToast(`Encontrado em ${t.name}`);}else showToast('Não encontrei esse termo nos emails carregados.'); }
function bindEvents(){ qa('[data-view]').forEach(btn=>btn.addEventListener('click',()=>setView(btn.dataset.view))); qa('[data-jump]').forEach(btn=>btn.addEventListener('click',()=>setView(btn.dataset.jump))); document.addEventListener('click',e=>{const thread=e.target.closest('[data-thread]');if(thread){state.selectedThread=thread.dataset.thread;setView('conversations');} const seg=e.target.closest('.seg');if(seg){state.conversationFilter=seg.dataset.filter;qa('.seg').forEach(x=>x.classList.toggle('active',x===seg));renderConversations();}}); q('#saveSettings').addEventListener('click',()=>{state.settings.deliveryDays=qa('[data-day]:checked').map(i=>Number(i.dataset.day));state.settings.cutoff=q('#cutoffInput').value||'14:00';localStorage.setItem('vitalveg-settings',JSON.stringify(state.settings));q('#saveHint').textContent='Alterações guardadas neste dispositivo.';showToast('Definições guardadas.');renderAllReal();}); q('#newOrderBtn').addEventListener('click',()=>showToast('Criação manual será acrescentada depois do teste dos emails reais.')); q('#searchInput').addEventListener('keydown',e=>{if(e.key==='Enter')searchEverything(e.target.value);}); }
function initPWA(){ if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{}); }
function init(){ injectRealStyles(); renderAllReal(); bindEvents(); initPWA(); setTimeout(()=>openConnectGate(),350); }
document.addEventListener('DOMContentLoaded',init);
