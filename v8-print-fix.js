/* Central VitalVeg V8.7 — impressão por página real, compatível com Android */
(() => {
  const MANUAL_KEY='vitalveg-manual-orders-v1';
  const NUMBERS_KEY='vitalveg-order-numbers-v1';
  const COUNTER_KEY='vitalveg-order-counter-v1';
  const PRINT_PREFIX='vitalveg-print-job:';
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

  function makeToken(){
    if(window.crypto?.randomUUID) return crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function openPrint(orders,title){
    if(!orders.length){
      if(typeof showToast==='function') showToast('Não há encomendas para imprimir.');
      else alert('Não há encomendas para imprimir.');
      return;
    }

    const token=makeToken();
    const key=`${PRINT_PREFIX}${token}`;
    const payload={
      version:1,
      createdAt:Date.now(),
      title,
      orders:orders.map(o=>({
        id:o.id,
        orderNo:o.orderNo,
        client:o.client||'Cliente',
        order:o.order||'Pedido por rever',
        deliveryISO:o.deliveryISO||'',
        manual:!!o.manual,
        state:o.state||''
      }))
    };

    try{
      localStorage.setItem(key,JSON.stringify(payload));
    }catch(err){
      if(typeof showToast==='function') showToast('Não foi possível preparar a impressão.');
      return;
    }

    // Uma página HTTP real evita o PDF branco que alguns Android geram ao imprimir about:blank/iframe.
    const url=`/print.html#${encodeURIComponent(token)}`;
    const w=window.open(url,'_blank');
    if(!w){
      localStorage.removeItem(key);
      if(typeof showToast==='function') showToast('O navegador bloqueou a página de impressão.');
      else alert('O navegador bloqueou a página de impressão.');
    }
  }

  document.addEventListener('click',e=>{
    const dayBtn=e.target.closest('[data-print-day]');
    const orderBtn=e.target.closest('[data-print-order]');
    if(!dayBtn&&!orderBtn)return;
    e.preventDefault();e.stopImmediatePropagation();
    const orders=allOrders();
    if(dayBtn){
      const day=dayBtn.getAttribute('data-print-day');
      const selected=orders.filter(o=>o.deliveryISO===day);
      openPrint(selected,`Encomendas para ${prettyDay(day)}`);
      return;
    }
    const id=orderBtn.getAttribute('data-print-order');
    const one=orders.find(o=>o.id===id);
    if(one)openPrint([one],`Ordem de encomenda N.º ${one.orderNo}`);
  },true);

  window.VitalVegPrint={allOrders,openPrint};
})();
