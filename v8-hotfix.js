/* Central VitalVeg V8 — hotfix móvel e tratamento manual */
(() => {
  const TREATED_KEY = 'vitalveg-manual-treated-v1';

  function loadTreated(){
    try { return new Set(JSON.parse(localStorage.getItem(TREATED_KEY) || '[]')); }
    catch { return new Set(); }
  }
  function saveTreated(set){
    localStorage.setItem(TREATED_KEY, JSON.stringify([...set]));
  }
  function marker(thread){
    return thread?.latestInbound?.id || thread?.latest?.id || '';
  }
  function recalc(){
    if (!window.state || !Array.isArray(state.messages)) return;
    state.threads = buildThreads(state.messages);
  }

  function install(){
    if (window.__VITALVEG_HOTFIX_INSTALLED__) return;
    if (typeof buildThreads !== 'function' || typeof renderConversationDetail !== 'function') {
      setTimeout(install, 100);
      return;
    }
    window.__VITALVEG_HOTFIX_INSTALLED__ = true;

    const baseBuildThreads = buildThreads;
    buildThreads = function buildThreadsWithManualTreatment(messages){
      const threads = baseBuildThreads(messages);
      const treated = loadTreated();
      threads.forEach(t => {
        const id = marker(t);
        if (id && treated.has(id)) {
          t.status = 'done';
          t.statusLabel = 'Tratado manualmente';
          t.manualTreated = true;
        }
      });
      return threads;
    };

    const baseRenderConversationDetail = renderConversationDetail;
    renderConversationDetail = function renderConversationDetailWithActions(){
      baseRenderConversationDetail();
      const detail = document.querySelector('#conversationDetail');
      const t = state?.threads?.find(x => x.key === state.selectedThread);
      if (!detail || !t) return;

      let actions = detail.querySelector('.v8-manual-actions');
      if (!actions) {
        actions = document.createElement('div');
        actions.className = 'v8-manual-actions';
        detail.appendChild(actions);
      }

      const id = marker(t);
      if (!id) {
        actions.innerHTML = '';
        return;
      }

      if (t.manualTreated) {
        actions.innerHTML = '<button type="button" class="btn-soft" id="v8ReopenThread">Voltar a pendente</button><span>Marcado como tratado neste dispositivo.</span>';
        actions.querySelector('#v8ReopenThread')?.addEventListener('click', () => {
          const treated = loadTreated();
          treated.delete(id);
          saveTreated(treated);
          recalc();
          renderAllReal();
          showToast('Conversa voltou a pendente.');
        });
      } else if (t.status === 'review') {
        actions.innerHTML = '<button type="button" class="btn-soft v8-treated-btn" id="v8TreatThread">✓ Marcar como tratado</button><span>Usa isto quando já trataste o assunto fora da Central ou quando não é necessária resposta.</span>';
        actions.querySelector('#v8TreatThread')?.addEventListener('click', () => {
          const treated = loadTreated();
          treated.add(id);
          saveTreated(treated);
          recalc();
          renderAllReal();
          showToast('Conversa marcada como tratada.');
        });
      } else {
        actions.innerHTML = '';
      }
    };

    if (state?.messages?.length) {
      recalc();
      renderAllReal();
    } else {
      try { renderConversationDetail(); } catch {}
    }
  }

  install();
})();
