(() => {
  const PIN_KEY = 'vitalveg-local-pin-v1';
  const SESSION_KEY = 'vitalveg-session-v1';
  let deferredPrompt = null;

  const qs = (s, r=document) => r.querySelector(s);
  const body = document.body;
  const gate = qs('#authGate');
  const title = qs('#authTitle');
  const subtitle = qs('#authSubtitle');
  const pin = qs('#authPin');
  const confirmWrap = qs('#authConfirmWrap');
  const confirmPin = qs('#authConfirmPin');
  const submit = qs('#authSubmit');
  const reset = qs('#authReset');
  const error = qs('#authError');
  const installBtn = qs('#installAppBtn');

  async function hashPin(value){
    const bytes = new TextEncoder().encode(`vitalveg-local-v1:${value}`);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2,'0')).join('');
  }

  function unlock(){
    sessionStorage.setItem(SESSION_KEY,'1');
    gate?.classList.remove('show');
    body.classList.remove('auth-pending');
  }

  function showGate(){
    gate?.classList.add('show');
    body.classList.add('auth-pending');
    setTimeout(() => pin?.focus(), 100);
  }

  function setMode(){
    const exists = !!localStorage.getItem(PIN_KEY);
    if(exists){
      title.textContent = 'Entrar na Central VitalVeg';
      subtitle.textContent = 'Introduz o PIN deste dispositivo.';
      confirmWrap.hidden = true;
      submit.textContent = 'Entrar';
      reset.hidden = false;
    }else{
      title.textContent = 'Criar acesso';
      subtitle.textContent = 'Cria um PIN de 4 dígitos para proteger esta versão no teu telemóvel.';
      confirmWrap.hidden = false;
      submit.textContent = 'Criar acesso e entrar';
      reset.hidden = true;
    }
  }

  async function handleSubmit(){
    error.textContent = '';
    const value = (pin.value || '').trim();
    if(!/^\d{4}$/.test(value)){
      error.textContent = 'O PIN deve ter exatamente 4 dígitos.';
      return;
    }

    const stored = localStorage.getItem(PIN_KEY);
    if(!stored){
      const confirmation = (confirmPin.value || '').trim();
      if(value !== confirmation){
        error.textContent = 'Os dois PIN não coincidem.';
        return;
      }
      localStorage.setItem(PIN_KEY, await hashPin(value));
      unlock();
      return;
    }

    const candidate = await hashPin(value);
    if(candidate !== stored){
      error.textContent = 'PIN incorreto.';
      pin.select();
      return;
    }
    unlock();
  }

  submit?.addEventListener('click', handleSubmit);
  [pin, confirmPin].forEach(el => el?.addEventListener('keydown', e => {
    if(e.key === 'Enter') handleSubmit();
  }));

  reset?.addEventListener('click', () => {
    if(confirm('Repor o acesso local deste dispositivo? Isto não apaga encomendas; apenas remove o PIN de teste.')){
      localStorage.removeItem(PIN_KEY);
      sessionStorage.removeItem(SESSION_KEY);
      pin.value = '';
      confirmPin.value = '';
      setMode();
    }
  });

  function installHelp(){
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const chrome = /chrome/i.test(navigator.userAgent) && /android/i.test(navigator.userAgent);
    const wrapper = document.createElement('div');
    wrapper.className = 'install-help';
    wrapper.innerHTML = `<div class="install-help-card"><h2>Instalar a Central VitalVeg</h2>${ios ? '<p>No iPhone/iPad:</p><ol><li>Toca em Partilhar.</li><li>Escolhe “Adicionar ao ecrã principal”.</li><li>Confirma em Adicionar.</li></ol>' : chrome ? '<p>No Android/Chrome:</p><ol><li>Toca no menu ⋮ do Chrome.</li><li>Escolhe “Instalar aplicação” ou “Adicionar ao ecrã principal”.</li><li>Confirma a instalação.</li></ol>' : '<p>Abre o menu do navegador e procura “Instalar aplicação” ou “Adicionar ao ecrã principal”.</p>'}<button>Fechar</button></div>`;
    wrapper.querySelector('button').addEventListener('click', () => wrapper.remove());
    wrapper.addEventListener('click', e => { if(e.target === wrapper) wrapper.remove(); });
    document.body.appendChild(wrapper);
  }

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    installBtn?.setAttribute('hidden','');
  });

  installBtn?.addEventListener('click', async () => {
    if(window.matchMedia('(display-mode: standalone)').matches){
      alert('A Central VitalVeg já está instalada neste dispositivo.');
      return;
    }
    if(deferredPrompt){
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
    }else{
      installHelp();
    }
  });

  function loadV8Layer(){
    if(!document.querySelector('link[data-v8-css]')){
      const link=document.createElement('link');
      link.rel='stylesheet';
      link.href='v8.css?v=8';
      link.dataset.v8Css='1';
      document.head.appendChild(link);
    }
    if(!document.querySelector('script[data-v8-js]')){
      const script=document.createElement('script');
      script.src='v8.js?v=8';
      script.async=false;
      script.dataset.v8Js='1';
      document.body.appendChild(script);
    }
  }

  window.addEventListener('load', loadV8Layer, { once:true });

  setMode();
  if(sessionStorage.getItem(SESSION_KEY) === '1') unlock(); else showGate();
})();
