/* One site, explicit plan URLs. Existing DB storage keys remain authoritative. */
(() => {
  'use strict';
  const value=new URLSearchParams(location.search).get('plan')?.toUpperCase();
  const valid=['DB','DC','IRP'].includes(value);
  const id=valid?value:'DB',label=id==='IRP'?'개인IRP':id;
  document.documentElement.dataset.plan=valid?id:'ENTRY';
  const bundled={DB:JSON.parse(JSON.stringify(window.RATE_IMPORT)),...window.SCHEME_RATE_DATA.snapshots};
  window.RateScheme={id,label,customer:id!=='DB',entry:!valid,bundled};
  if(id!=='DB')window.RATE_IMPORT=JSON.parse(JSON.stringify(bundled[id]));
  if(id!=='DB')document.querySelectorAll('#categoryMenu input').forEach(input=>input.checked=true);
})();
