const $=(s,r=document)=>r.querySelector(s);
const esc=(v='')=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let data={mode:'shadow',summary:{},evaluations:[]};

const actionLabels={ignore:'Não faria nada',request_review:'Pediria revisão',prepare_reply:'Prepararia resposta',would_auto_send:'Enviaria se autorizado'};
const verdictLabels={unreviewed:'Por validar',correct:'Correta',partial:'Parcial',incorrect:'Errada'};
const typeLabels={ENCOMENDA:'Encomenda',ALTERACAO_ENCOMENDA:'Alteração de encomenda',PEDIDO_CONFIRMACAO:'Pedido de confirmação',PROBLEMA_RECLAMACAO:'Problema / reclamação',DOCUMENTO_FATURA:'Documento / fatura',PEDIDO_INFORMACAO:'Pedido de informação',PUBLICIDADE_MARKETING:'Publicidade / marketing',AUTOMATICO_SISTEMA:'Automático / sistema',SEM_ACAO:'Sem ação',CONVERSA_REVER:'Conversa a rever',OUTRO_REVER:'Outro / rever'};

async function api(url,options={}){
  const res=await fetch(url,{credentials:'include',...options,headers:{...(options.body?{'Content-Type':'application/json'}:{}),...(options.headers||{})}});
  const body=await res.json().catch(()=>({}));
  if(res.status===401){location.href='./';throw new Error('Sessão terminada.');}
  if(!res.ok)throw new Error(body.error||`Erro ${res.status}`);
  return body;
}
function toast(message){const el=$('#shadowToast');el.textContent=message;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),2600);}
function fmt(value){if(!value)return '—';const d=new Date(value);return Number.isNaN(d.getTime())?'—':new Intl.DateTimeFormat('pt-PT',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Lisbon'}).format(d);}
function pct(value){const n=Number(value);return Number.isFinite(n)?`${Math.round(n*100)}%`:'—';}
function itemText(i){return `${i?.quantity??''}${i?.unit?` ${i.unit}`:''} ${i?.product||i?.rawLine||''}`.trim();}
function modeLabel(mode){return mode==='shadow'?'Modo Sombra · zero envios':mode==='assist'?'Modo Assistente · aprovação humana':'Funcionário Autónomo';}

function renderMetrics(){
  const s=data.summary||{};
  $('#shadowMetrics').innerHTML=[
    ['Análises',s.total??0,'decisões guardadas'],['Por validar',s.unreviewed??0,'ainda sem avaliação humana'],
    ['Corretas',s.correct??0,'validadas como certas'],['Parciais / erradas',(s.partial??0)+(s.incorrect??0),`${s.incorrect??0} erradas`],
    ['Qualidade validada',s.safeScore==null?'—':`${s.safeScore}%`,s.reviewed?`${s.reviewed} casos avaliados`:'ainda sem amostra']
  ].map(([label,value,note])=>`<div class="shadow-metric"><small>${esc(label)}</small><strong>${esc(value)}</strong><span>${esc(note)}</span></div>`).join('');
}
function renderMode(){
  const banner=$('#modeBanner');
  const dot=data.mode==='shadow'?'warn':data.mode==='assist'?'ok':'error';
  banner.innerHTML=`<div><span class="status-dot ${dot}"></span><strong>${esc(modeLabel(data.mode))}</strong></div><p>${data.mode==='shadow'?'A IA pode ler, interpretar e preparar decisões, mas não altera a operação nem envia mensagens.':'Consulta de validação; este ecrã nunca envia mensagens.'}</p>`;
}
function renderList(){
  const list=data.evaluations||[];
  $('#shadowList').innerHTML=list.length?`<div class="shadow-evaluations">${list.map(e=>`<article class="shadow-row"><div class="who"><strong>${esc(e.analysis?.storeName||e.analysis?.customerName||e.customerEmail||'Cliente')}</strong><small>${esc(fmt(e.sourceDate))}</small></div><div class="summary"><strong>${esc(typeLabels[e.analysis?.messageType]||e.analysis?.messageType||'—')} · ${esc(pct(e.analysis?.confidence))}</strong><p>${esc(e.analysis?.threadSummary||e.subject||'')}</p></div><div><div class="shadow-action ${esc(e.wouldDo)}">${esc(actionLabels[e.wouldDo]||e.wouldDo)}</div><div class="shadow-verdict ${esc(e.verdict)}" style="margin-top:6px">${esc(verdictLabels[e.verdict]||e.verdict)}</div></div><button class="btn ghost preview-btn" data-fp="${esc(e.fingerprint)}">Abrir</button></article>`).join('')}</div>`:'<div class="mini-empty">Ainda não existem decisões do modo Sombra. Quando a IA começar a observar mensagens reais, aparecem aqui.</div>';
  document.querySelectorAll('[data-fp]').forEach(b=>b.onclick=()=>openDetail(b.dataset.fp));
}
async function load(){
  $('#refreshShadow').disabled=true;
  try{data=await api('/api/ai/shadow?limit=100');renderMode();renderMetrics();renderList();}
  catch(e){$('#shadowList').innerHTML=`<div class="warning-box">${esc(e.message)}</div>`;}
  finally{$('#refreshShadow').disabled=false;}
}
function closeDetail(){$('#shadowDetail').classList.remove('open');$('#shadowDetail').setAttribute('aria-hidden','true');setTimeout(()=>$('#shadowDetailBackdrop').hidden=true,180);}
function openDetail(fp){
  const e=(data.evaluations||[]).find(x=>x.fingerprint===fp);if(!e)return;
  $('#shadowDetailTitle').textContent=e.subject||'Decisão da IA';
  const a=e.analysis||{};const o=e.orderPreview;
  const reasons=(a.reviewReasons||[]).length?`<ul class="reason-list">${a.reviewReasons.map(r=>`<li>${esc(r)}</li>`).join('')}</ul>`:'<p class="shadow-safe-note">A IA não assinalou alertas adicionais.</p>';
  const items=o?.items?.length?`<div class="shadow-order-lines">${o.items.map(i=>`<div class="shadow-order-line">${esc(itemText(i))}${i.uncertain?' · ⚠ linha incerta':''}</div>`).join('')}</div>`:'<div class="mini-empty">Esta análise não produziria uma encomenda.</div>';
  $('#shadowDetailBody').innerHTML=`
    <section class="detail-section"><h3>Email original</h3><div class="shadow-email"><div class="analysis-grid"><div class="analysis-cell"><small>De</small><strong>${esc(e.sourceFrom||e.customerEmail||'—')}</strong></div><div class="analysis-cell"><small>Data</small><strong>${esc(fmt(e.sourceDate))}</strong></div></div><strong style="display:block;margin-top:10px">${esc(e.subject||'(sem assunto)')}</strong><pre>${esc(e.sourceText||'')}</pre></div></section>
    <section class="detail-section"><h3>Leitura da IA</h3><div class="analysis-grid"><div class="analysis-cell"><small>Tipo</small><strong>${esc(typeLabels[a.messageType]||a.messageType||'—')}</strong></div><div class="analysis-cell"><small>Confiança</small><strong>${esc(pct(a.confidence))}</strong></div><div class="analysis-cell"><small>Ação na encomenda</small><strong>${esc(a.orderAction||'—')}</strong></div><div class="analysis-cell"><small>Se estivesse ativa</small><strong>${esc(actionLabels[e.wouldDo]||e.wouldDo)}</strong></div></div><p class="shadow-safe-note">${esc(a.threadSummary||'')}</p></section>
    <section class="detail-section"><h3>Resultado operacional previsto</h3>${items}</section>
    <section class="detail-section"><h3>Alertas / motivo</h3>${reasons}</section>
    <section class="detail-section"><h3>Resposta que prepararia</h3><div class="shadow-reply">${esc(a.suggestedReply||'A IA não prepararia resposta para esta mensagem.')}</div><div class="shadow-safe-note">Modo Sombra: esta resposta não pode ser enviada daqui.</div></section>
    <section class="detail-section"><h3>Avaliação humana</h3><div class="verdict-buttons"><button class="btn ghost ${e.verdict==='correct'?'active':''}" data-verdict="correct">✓ Correta</button><button class="btn ghost ${e.verdict==='partial'?'active':''}" data-verdict="partial">≈ Parcial</button><button class="btn danger ${e.verdict==='incorrect'?'active':''}" data-verdict="incorrect">✕ Errada</button></div><textarea id="shadowFeedback" class="shadow-feedback" placeholder="Opcional: o que deveria ter percebido ou respondido?">${esc(e.feedback||'')}</textarea><p id="shadowReviewError" class="form-error"></p></section>`;
  document.querySelectorAll('[data-verdict]').forEach(b=>b.onclick=()=>saveVerdict(e.fingerprint,b.dataset.verdict));
  $('#shadowDetailBackdrop').hidden=false;$('#shadowDetail').classList.add('open');$('#shadowDetail').setAttribute('aria-hidden','false');
}
async function saveVerdict(fp,verdict){
  const feedback=$('#shadowFeedback')?.value||'';document.querySelectorAll('[data-verdict]').forEach(b=>b.disabled=true);$('#shadowReviewError').textContent='';
  try{const r=await api('/api/ai/shadow',{method:'POST',body:JSON.stringify({fingerprint:fp,verdict,feedback})});const i=data.evaluations.findIndex(x=>x.fingerprint===fp);if(i>=0)data.evaluations[i]=r.evaluation;data.summary=r.summary;renderMetrics();renderList();toast('Avaliação guardada.');openDetail(fp);}
  catch(e){$('#shadowReviewError').textContent=e.message;document.querySelectorAll('[data-verdict]').forEach(b=>b.disabled=false);}
}

$('#refreshShadow').onclick=load;$('#closeShadowDetail').onclick=closeDetail;$('#shadowDetailBackdrop').onclick=closeDetail;document.addEventListener('keydown',e=>{if(e.key==='Escape')closeDetail();});load();
