/* Approved landing page and customer-facing plan presentation. */
(() => {
  const scheme=window.RateScheme;
  const entry=document.getElementById('schemeEntry');
  const month=importData.month.replace(/^(\d{4})-0?(\d+)$/, '$1년 $2월');
  if(entry){
    entry.querySelector('.entry-month').textContent=month;
    entry.querySelector('.entry-period').textContent='적용기간 : '+importData.start.replaceAll('-','.')+' ~ '+importData.end.replaceAll('-','.');
  }
  if(scheme.entry){
    document.title='퇴직연금 원리금보장상품 금리표 · 제도 선택';
    document.querySelector('.app-shell').setAttribute('inert','');
  }else entry?.setAttribute('inert','');
  const view=document.getElementById('viewModeButton');
  const utilities=document.createElement('div');utilities.className='scheme-utilities';
  const link=document.createElement('a');link.href='index.html';link.className='scheme-home';link.textContent=scheme.admin?'← 메인':'← 제도 선택';
  link.setAttribute('aria-label',scheme.admin?'메인 진입페이지로 이동':'제도 선택 화면으로 이동');
  view.before(utilities);utilities.append(link,view);
  if(scheme.admin){
    document.body.classList.add('admin-mode');document.title='퇴직연금 관리자페이지';
    const heading=document.createElement('header');heading.className='admin-route-title';heading.innerHTML='<h1>관리자페이지</h1>';
    document.querySelector('.main-tabs').before(heading);
  }
  if(scheme.customer){
    document.body.classList.add('customer-mode');
    document.querySelectorAll('#proposalFilter,#rankingProposal').forEach(control=>{control.value='all';control.closest('label').hidden=true;});
    const guide=document.querySelector('#infoModal .guide-list');
    guide.innerHTML=`<div><b>금리 기준 및 GIC 안내</b><ul><li>본 금리표는 퇴직연금 <strong>${scheme.label} 제도</strong>에 적용되는 금리입니다.</li><li>최초 조회는 당사 라인업 Y 상품을 표시하며, 디폴트옵션 전용 상품은 제외합니다.</li><li>GIC는 공시금리와 단리연환산금리를 괄호 안에 함께 표시합니다. 환산금리는 동일 산식으로 계산한 참고 수치입니다.</li><li>상품 매수 전 제공기관의 공시금리와 매수가능여부를 확인해주세요.</li></ul></div><div><b>조회 및 저장</b><ul><li>상품군·만기·등급으로 조회하고 금리순으로 정렬할 수 있습니다.</li><li>현재 조회 결과는 선택한 상품·만기·정렬을 저장합니다. 전체 라인업 금리표는 해당 제도의 라인업 Y 상품과 3개월·6개월·1년·2년·3년·5년를 저장합니다.</li></ul></div>`;
    const all=document.querySelector('[data-save-scope="all"]');
    all.querySelector('b').textContent='전체 라인업 금리표';
    all.querySelector('small').textContent=scheme.label+' 라인업 Y · 3개월·6개월·1년·2년·3년·5년 저장';
    const updateSummary=()=>{document.getElementById('filterSummary').innerHTML='라인업 <b>'+({Y:'Y',N:'N',all:'전체'}[els.lineupFilter.value]||'미설정')+'</b>';};
    ['lineupFilter','resetButton','viewAllButton','showSource'].forEach(id=>document.getElementById(id)?.addEventListener(id==='lineupFilter'?'change':'click',updateSummary));
    updateSummary();
  }
})();
