/* One site, explicit plan URLs. Existing DB storage keys remain authoritative. */
(() => {
  'use strict';
  const value=new URLSearchParams(location.search).get('plan')?.toUpperCase();
  const admin=document.documentElement.dataset.page==='admin';
  const valid=['DB','DC','IRP'].includes(value);
  const id=!admin&&valid?value:'DB',label=id==='IRP'?'개인IRP':id;
  document.documentElement.dataset.plan=admin?'ADMIN':valid?id:'ENTRY';
  const bundled={DB:JSON.parse(JSON.stringify(window.RATE_IMPORT)),...window.SCHEME_RATE_DATA.snapshots};
  window.RateScheme={id,label,customer:id!=='DB',entry:!valid&&!admin,admin,bundled};
  if(id!=='DB')window.RATE_IMPORT=JSON.parse(JSON.stringify(bundled[id]));
  if(id!=='DB')document.querySelectorAll('#categoryMenu input').forEach(input=>input.checked=true);
})();
