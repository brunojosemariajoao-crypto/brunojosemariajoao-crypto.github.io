/* VitalVeg — regra operacional de entregas: terça, quinta e sábado */
(() => {
  function apply(){
    if(typeof state==='undefined' || !state.settings){ setTimeout(apply,80); return; }
    const expected=[2,4,6];
    const current=Array.isArray(state.settings.deliveryDays)?state.settings.deliveryDays:[];
    if(current.join(',')!==expected.join(',')){
      state.settings={...state.settings,deliveryDays:expected};
      localStorage.setItem('vitalveg-settings',JSON.stringify(state.settings));
    }
    window.VITALVEG_DELIVERY_RULE={deliveryDays:[2,4,6],cutoff:state.settings.cutoff||'14:00',usualOrderTiming:'dia anterior'};
    try{ if(typeof renderAllReal==='function') renderAllReal(); }catch{}
  }
  apply();
})();
