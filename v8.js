/* Central VitalVeg V8 — camada operacional sobre a interface PC existente. */
(() => {
  const V8_VERSION = '8.0-production';
  const V8_MIGRATION_KEY = 'vitalveg-v8-settings-migrated';

  window.VITALVEG_VERSION = V8_VERSION;

  const extraProducts = [
    'coração de boi','coracao de boi','rúcula','rucula','espinafre','espinafres',
    'hortelã','hortela','couve portuguesa','couve coração','couve coracao',
    'salada gourmet','salada ibérica','salada iberica','salada aromática','salada aromatica',
    'canónigos','canonigos','nabiça','nabica','alho francês','alho frances'
  ];
  if (typeof PRODUCTS !== 'undefined') {
    extraProducts.forEach(p => { if (!PRODUCTS.includes(p)) PRODUCTS.push(p); });
  }

  function migrateDeliveryDefaults() {
    try {
      if (localStorage.getItem(V8_MIGRATION_KEY)) return;
      const saved = JSON.parse(localStorage.getItem('vitalveg-settings') || 'null');
      const looksLikeOldDemoDefault = saved && Array.isArray(saved.deliveryDays) &&
        saved.deliveryDays.join(',') === '2,4,6' && (saved.cutoff || '14:00') === '14:00';
      if (!saved || looksLikeOldDemoDefault) {
        state.settings = { deliveryDays: [2,5], cutoff: '14:00' };
        localStorage.setItem('vitalveg-settings', JSON.stringify(state.settings));
      }
      localStorage.setItem(V8_MIGRATION_KEY, '1');
    } catch {}
  }

  const baseClassifyMessage = classifyMessage;
  classifyMessage = function classifyMessageV8(m) {
    const base = baseClassifyMessage(m);
    if (m?.direction === 'out') return 'ENVIADO POR NÓS';
    if (base === 'CONVERSA / REVER') return 'RESPOSTA HUMANA';
    return base;
  };

  const baseBuildThreads = buildThreads;
  buildThreads = function buildThreadsV8(messages) {
    const threads = baseBuildThreads(messages);
    threads.forEach(t => {
      const latest = t.latestInbound;
      if (!latest) return;
      if (latest.type === 'RESPOSTA HUMANA') {
        t.status = 'review';
        t.statusLabel = 'Resposta humana · rever';
      }
    });
    return threads;
  };

  function canonicalProduct(text='') {
    const s = text.toLowerCase();
    const aliases = [
      ['tomate coração de boi','tomate coração de boi'],['tomate coracao de boi','tomate coração de boi'],
      ['tomate cherry','tomate cherry'],['cherry','tomate cherry'],['alface','alface frisada'],
      ['courgette','courgette'],['corgete','courgette'],['pimento verde','pimento verde'],
      ['pimento vermelho','pimento vermelho'],['couve coração','couve coração'],['couve coracao','couve coração'],
      ['couve portuguesa','couve portuguesa'],['espinafre','espinafres'],['salsa','salsa'],
      ['coentros','coentros'],['hortelã','hortelã'],['hortela','hortelã'],['cebola','cebola'],
      ['fava','fava'],['rúcula','rúcula'],['rucula','rúcula'],['canónigos','canónigos'],['canonigos','canónigos']
    ];
    const found = aliases.find(([needle]) => s.includes(needle));
    return found?.[1] || '';
  }

  function parseQtyUnit(text='') {
    const m = text.match(/\b(\d+(?:[.,]\d+)?)\s*(?:x\s*)?(cx|cxs|caixa|caixas|kg|kgs|quilo|quilos|covete|covetes|un|unid|unidade|unidades|molho|molhos|tabuleiro|tabuleiros|saco|sacos)\b/i);
    if (!m) return null;
    const value = Number(m[1].replace(',', '.'));
    const unitRaw = m[2].toLowerCase();
    const unitMap = {
      cx:'cx',cxs:'cx',caixa:'cx',caixas:'cx',kg:'kg',kgs:'kg',quilo:'kg',quilos:'kg',
      covete:'covete',covetes:'covete',un:'un',unid:'un',unidade:'un',unidades:'un',
      molho:'molho',molhos:'molho',tabuleiro:'tabuleiro',tabuleiros:'tabuleiro',saco:'saco',sacos:'saco'
    };
    return { value, unit: unitMap[unitRaw] || unitRaw };
  }

  function itemLines(m) {
    const txt = (m?.current || currentText(m?.text || '')).replace(/\r/g,'');
    return txt.split(/\n+/).map(x => x.trim()).filter(Boolean)
      .filter(line => canonicalProduct(line) && parseQtyUnit(line));
  }

  function finalOrderSummary(thread) {
    const orderMessages = thread.messages
      .filter(m => m.direction === 'in' && ['ENCOMENDA','ALTERAÇÃO À ENCOMENDA'].includes(m.type))
      .sort((a,b) => new Date(a.date) - new Date(b.date));
    if (!orderMessages.length) return '';

    const current = new Map();
    const unresolved = [];
    let hadParsedBase = false;

    for (const m of orderMessages) {
      const lines = itemLines(m);
      const isAlteration = m.type === 'ALTERAÇÃO À ENCOMENDA';
      if (!isAlteration && lines.length) {
        if (lines.length >= 2 || !hadParsedBase) current.clear();
        for (const line of lines) {
          const product = canonicalProduct(line);
          const qty = parseQtyUnit(line);
          if (product && qty) current.set(product, { product, ...qty, source: line });
        }
        hadParsedBase = true;
        continue;
      }

      if (isAlteration) {
        if (!lines.length) {
          const note = (m.current || currentText(m.text || '')).replace(/\s+/g,' ').trim();
          if (note) unresolved.push(note.slice(0,180));
          continue;
        }
        for (const line of lines) {
          const low = line.toLowerCase();
          const product = canonicalProduct(line);
          const qty = parseQtyUnit(line);
          if (!product || !qty) continue;
          const old = current.get(product);
          if (/\b(retirar|retira|anular|anula|sem)\b/.test(low) && qty.value === 0) {
            current.delete(product);
          } else if (/\bmais\b|acrescent|adicion/.test(low) && old && old.unit === qty.unit) {
            current.set(product, { product, value: old.value + qty.value, unit: qty.unit, source: line });
          } else {
            current.set(product, { product, value: qty.value, unit: qty.unit, source: line });
          }
        }
      }
    }

    const formatNumber = n => Number.isInteger(n) ? String(n) : String(n).replace('.', ',');
    const parsed = [...current.values()].map(i => `${formatNumber(i.value)} ${i.unit} ${i.product}`);
    if (parsed.length) {
      const suffix = unresolved.length ? ` · A rever: ${unresolved.join(' · ')}` : '';
      return parsed.join(' · ') + suffix;
    }

    const latest = orderMessages[orderMessages.length - 1];
    return orderSummary(latest);
  }

  const baseDeliveryDecision = deliveryDecision;
  deliveryDecision = function deliveryDecisionV8(m) {
    return baseDeliveryDecision(m);
  };

  realOrders = function realOrdersV8() {
    return state.threads.filter(t => t.latestOrder).map(t => {
      const d = deliveryDecision(t.latestOrder);
      return {
        thread: t,
        client: t.name,
        order: finalOrderSummary(t),
        delivery: d.label,
        deliveryDate: d.date || null,
        state: t.statusLabel,
        classification: t.latestInbound?.type || t.latestOrder?.type || 'ENCOMENDA',
        stateClass: t.status === 'review' ? 'review' : 'confirmed'
      };
    }).sort((a,b) => {
      const da = a.deliveryDate ? new Date(a.deliveryDate).getTime() : Number.MAX_SAFE_INTEGER;
      const db = b.deliveryDate ? new Date(b.deliveryDate).getTime() : Number.MAX_SAFE_INTEGER;
      return da - db || a.client.localeCompare(b.client, 'pt');
    });
  };

  function classificationBadge(type='') {
    const safe = escapeHtml(type);
    return `<span class="v8-classification">${safe}</span>`;
  }

  renderOrders = function renderOrdersV8() {
    const orders = realOrders();
    q('#ordersBody').innerHTML = orders.length ? orders.map(o => `
      <tr>
        <td class="order-customer"><strong>${escapeHtml(o.client)}</strong><small>${escapeHtml(o.thread.counterpart)}</small></td>
        <td><strong class="v8-final-order">${escapeHtml(o.order || 'Pedido por rever')}</strong><small class="v8-order-meta">${classificationBadge(o.classification)}</small></td>
        <td>${escapeHtml(o.delivery)}</td>
        <td><span class="state-chip state-${o.stateClass}">${escapeHtml(o.state)}</span></td>
        <td><button class="row-action" data-thread="${escapeHtml(o.thread.key)}" aria-label="Abrir conversa">›</button></td>
      </tr>`).join('') : '<tr><td colspan="5"><div class="empty-real"><strong>Ainda não há encomendas reais.</strong><span>Quando começarem a chegar, aparecem aqui.</span></div></td></tr>';
    updateV8Toolbar();
  };

  const baseRenderConversationDetail = renderConversationDetail;
  renderConversationDetail = function renderConversationDetailV8() {
    baseRenderConversationDetail();
    const t = state.threads.find(x => x.key === state.selectedThread);
    const detail = q('#conversationDetail');
    if (!t || !detail) return;
    const head = detail.querySelector('.detail-head');
    if (head && !head.querySelector('.v8-type-badge')) {
      const badge = document.createElement('span');
      badge.className = 'v8-type-badge';
      badge.textContent = t.latestInbound?.type || '—';
      head.appendChild(badge);
    }
    if (t.latestOrder) {
      const summary = detail.querySelector('.ai-summary ul');
      if (summary) {
        const existing = [...summary.querySelectorAll('li')].find(li => li.textContent.startsWith('Pedido atual:'));
        if (existing) existing.textContent = `Pedido final: ${finalOrderSummary(t)}`;
      }
    }
    const send = detail.querySelector('#sendReplyBtn');
    if (send) {
      send.textContent = 'Rever e enviar resposta';
      send.title = 'Nunca é enviado automaticamente. Requer confirmação humana.';
    }
  };

  function deliveryKey(order) {
    if (!order.deliveryDate) return 'Sem data';
    const d = new Date(order.deliveryDate);
    return d.toISOString().slice(0,10);
  }

  function buildPrintSheet() {
    let sheet = q('#v8PrintSheet');
    if (!sheet) {
      sheet = document.createElement('section');
      sheet.id = 'v8PrintSheet';
      document.body.appendChild(sheet);
    }
    const orders = realOrders();
    const groups = new Map();
    orders.forEach(o => {
      const key = deliveryKey(o);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(o);
    });
    const generated = new Intl.DateTimeFormat('pt-PT',{dateStyle:'short',timeStyle:'short'}).format(new Date());
    const body = [...groups.entries()].map(([key, rows]) => {
      const d = key === 'Sem data' ? null : new Date(`${key}T12:00:00`);
      const title = d ? `${weekdayLabels[jsWeekday(d)-1]} · ${d.toLocaleDateString('pt-PT')}` : 'Sem data de entrega';
      return `<section class="v8-print-group"><h2>${escapeHtml(title)}</h2><table><thead><tr><th>Cliente</th><th>Pedido final</th><th>Estado</th><th>Conferido</th></tr></thead><tbody>${rows.map(o => `<tr><td><strong>${escapeHtml(o.client)}</strong><br><small>${escapeHtml(o.thread.counterpart)}</small></td><td>${escapeHtml(o.order || 'POR REVER')}</td><td>${escapeHtml(o.state)}</td><td class="check-cell">☐</td></tr>`).join('')}</tbody></table></section>`;
    }).join('');
    sheet.innerHTML = `<header><div><h1>VitalVeg · Central de Encomendas</h1><p>Preparação e distribuição · pedido final consolidado</p></div><div class="v8-print-meta">Gerado em ${escapeHtml(generated)}<br>${orders.length} encomenda${orders.length===1?'':'s'}</div></header>${body || '<p>Sem encomendas para imprimir.</p>'}<footer>Central VitalVeg V8 · Documento operacional</footer>`;
  }

  function printOrders() {
    buildPrintSheet();
    window.print();
  }

  async function syncNow() {
    const btn = q('#v8SyncBtn');
    if (!state.credentials) {
      openConnectGate('');
      return;
    }
    if (btn) { btn.disabled = true; btn.textContent = 'A sincronizar…'; }
    try {
      await fetchRealMail(false);
      showToast('Recebidos e Enviados sincronizados.');
    } catch (e) {
      showToast(e?.message || 'Falha na sincronização.');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '↻ Sincronizar'; }
    }
  }

  function updateV8Toolbar() {
    const pageHead = q('#view-orders .page-head');
    if (!pageHead || q('#v8OrdersActions')) return;
    const oldNew = q('#newOrderBtn');
    if (oldNew) oldNew.hidden = true;
    const actions = document.createElement('div');
    actions.id = 'v8OrdersActions';
    actions.className = 'v8-orders-actions';
    actions.innerHTML = `<button class="btn-soft" id="v8SyncBtn" type="button">↻ Sincronizar</button><button class="primary-action" id="v8PrintBtn" type="button">▣ Imprimir encomendas</button>`;
    pageHead.appendChild(actions);
    q('#v8SyncBtn')?.addEventListener('click', syncNow);
    q('#v8PrintBtn')?.addEventListener('click', printOrders);
  }

  function installV8Status() {
    const top = q('.topbar');
    if (!top || q('#v8BuildBadge')) return;
    const badge = document.createElement('span');
    badge.id = 'v8BuildBadge';
    badge.className = 'v8-build-badge';
    badge.textContent = 'V8 · REAL';
    top.insertBefore(badge, q('#installAppBtn') || top.lastChild);
  }

  function hardenSettingsCopy() {
    const section = q('#view-settings');
    if (!section) return;
    const headings = [...section.querySelectorAll('h2')];
    const authority = headings.find(h => /Autoridade da automação/i.test(h.textContent || ''));
    if (authority) authority.textContent = 'Regras de tratamento e aprovação';
    const p = authority?.parentElement?.querySelector('p');
    if (p) p.textContent = 'A Central pode classificar e sugerir; o envio de emails exige sempre aprovação humana.';
    const labels = section.querySelectorAll('.switch-row strong');
    labels.forEach(el => {
      el.textContent = el.textContent
        .replace(/^Confirmar encomenda normal$/,'Sugerir confirmação de encomenda normal')
        .replace(/^Responder a pedido de confirmação$/,'Sugerir resposta a pedido de confirmação');
    });
    if (!q('#v8ManualApproval')) {
      const note = document.createElement('div');
      note.id = 'v8ManualApproval';
      note.className = 'v8-safety-note';
      note.innerHTML = '<strong>Envio automático bloqueado</strong><span>Nenhuma resposta é enviada sem carregares explicitamente em “Rever e enviar resposta” e confirmares o envio.</span>';
      section.querySelector('.settings-grid')?.prepend(note);
    }
  }

  const baseRenderAllReal = renderAllReal;
  renderAllReal = function renderAllRealV8() {
    baseRenderAllReal();
    installV8Status();
    updateV8Toolbar();
    hardenSettingsCopy();
  };

  function exposeDiagnostics() {
    window.VitalVegV8 = {
      version: V8_VERSION,
      getState: () => ({
        messages: state.messages.length,
        threads: state.threads.length,
        orders: realOrders().length,
        fetchedAt: state.lastFetchedAt,
        deliveryDays: [...state.settings.deliveryDays],
        cutoff: state.settings.cutoff
      }),
      sync: syncNow,
      print: printOrders
    };
  }

  migrateDeliveryDefaults();
  exposeDiagnostics();

  function bootV8Ui() {
    installV8Status();
    updateV8Toolbar();
    hardenSettingsCopy();
    setTimeout(() => { try { renderAllReal(); } catch {} }, 250);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootV8Ui);
  else bootV8Ui();
})();
