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
  if(id!=='DB'){
    const labels=['3개월','6개월','1년','2년','3년','5년'];
    document.getElementById('periodMenu').innerHTML=labels.map((label,i)=>`<label><input type="checkbox" value="${i}" checked /> ${label}</label>`).join('');
    document.getElementById('maturitySort').innerHTML=labels.map((label,i)=>`<option value="${i}"${i===2?' selected':''}>${label}</option>`).join('');
    const heads=[...document.querySelectorAll('.sales-rate-table .rate-head')];
    heads[0].insertAdjacentHTML('beforebegin',labels.map(label=>`<th class="rate-head">${label}</th>`).join(''));
    heads.forEach(head=>head.remove());
  }
})();
