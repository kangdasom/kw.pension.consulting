/* Two sales views share the authoritative rate table, status tooltip and export renderer. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id),panel=$('panel-sales');
  const table=els.rateTableBody.closest('table'),fullHead=table.tHead,fullClass=table.className;
  const labels=['ELB/DLB','GIC','은행예금','저축은행예금'],terms=['1년','1.5년','3년','5년'];
  const nav=document.createElement('div');nav.className='sales-view-tabs';nav.setAttribute('role','tablist');nav.setAttribute('aria-label','금리표 보기 방식');
  nav.innerHTML='<button id="sales-view-tab-full" type="button" role="tab" aria-controls="sales-view-full" aria-selected="true">전체 금리표</button><button id="sales-view-tab-ranking" type="button" role="tab" aria-controls="sales-view-ranking" aria-selected="false" tabindex="-1">만기별 금리순</button>';
  const full=document.createElement('section');full.id='sales-view-full';full.setAttribute('role','tabpanel');full.setAttribute('aria-labelledby','sales-view-tab-full');
  const ranking=document.createElement('section');ranking.id='sales-view-ranking';ranking.hidden=true;ranking.setAttribute('role','tabpanel');ranking.setAttribute('aria-labelledby','sales-view-tab-ranking');
  const shared=['.table-toolbar','.rate-unit','.table-frame','.table-meta'].map(s=>panel.querySelector(s));
  full.append(panel.querySelector('.filter-panel'),...shared);
  panel.querySelector('.page-heading').after(nav,full,ranking);
  ranking.innerHTML=`<div class="ranking-controls"><div class="ranking-choices" role="group" aria-label="금리순 상품유형">${labels.map((label,i)=>`<button type="button" data-ranking-group="${i}" aria-pressed="${i===0}">${label}</button>`).join('')}</div><div class="ranking-choices" role="group" aria-label="금리순 만기">${terms.map((term,i)=>`<button type="button" data-ranking-index="${i}" aria-pressed="${i===0}">${term}</button>`).join('')}</div><div class="ranking-filters"><label>등급<select id="rankingRating">${els.ratingFilter.innerHTML}</select></label><label>라인업<select id="rankingLineup"><option value="Y">Y</option><option value="all">전체</option><option value="N">N</option></select></label><label>제안가능<select id="rankingProposal"><option value="all">전체</option><option value="Y">Y</option><option value="N">N</option><option value="확인">확인필요</option></select></label><label>사업자<select id="rankingPension"><option value="all">전체</option><option value="Y">Y</option><option value="N">N</option></select></label></div><div class="ranking-actions"><button id="rankingViewAll" type="button">전체보기</button><button id="rankingReset" type="button">초기화</button></div></div><p id="rankingSummary" aria-live="polite"></p>`;
  const rankHead=document.createElement('thead');
  rankHead.innerHTML='<tr><th class="ranking-place">순위</th><th class="sticky-col ranking-institution">제공기관</th><th class="ranking-product">상품</th><th class="ranking-grade">등급</th><th class="ranking-rate">금리</th><th class="ranking-spread">평균 대비</th><th class="ranking-lineup">라인업</th></tr>';
  let mode='full',group=0,index=0;
  function current(){
    const grade=$('rankingRating').value,lineup=$('rankingLineup').value,proposal=$('rankingProposal').value,pension=$('rankingPension').value;
    const rows=rates.filter(row=>groupRank(row)===group&&row.terms[maturities[index]]&&
      (grade==='all'||row.grade&&ratingOrder.includes(row.grade)&&gradeRank(row)<=ratingOrder.indexOf(grade))&&
      (lineup==='all'||row.lineup===lineup)&&(pension==='all'||row.pension===pension)&&
      (proposal==='all'||termProposalState(row,maturities[index])===proposal))
      .sort((a,b)=>compareRate(a,b,index)||defaultOrder(a,b));
    const average=rows.length?rows.reduce((sum,row)=>sum+effectiveRate(row,index),0)/rows.length:null;
    return {rows,average,indices:[index],sortLabel:`${terms[index]} 금리 높은 순${group===1?' (단리환산 기준)':''}`,condition:`${labels[group]} / ${terms[index]} / 등급 ${grade} / 라인업 ${lineup} / 제안가능 ${proposal} / 사업자 ${pension}`};
  }
  function renderRanking(){
    window.RateStatus?.hide();
    const data=current();let rank=0,prior=null;
    els.resultCount.textContent=data.rows.length;els.emptyState.hidden=!!data.rows.length;
    rankHead.rows[0].cells[4].textContent=terms[index]+' 금리';
    $('rankingSummary').textContent=`${labels[group]} · ${terms[index]} · 조회상품 평균 ${data.average===null?'—':data.average.toFixed(4)+'%'}${group===1?' · 순위·평균은 단리환산 기준':''}`;
    ranking.querySelectorAll('[data-ranking-group]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.rankingGroup)===group)));
    ranking.querySelectorAll('[data-ranking-index]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.rankingIndex)===index)));
    els.rateTableBody.innerHTML=data.rows.map((row,i)=>{
      const value=effectiveRate(row,index);if(prior!==value)rank=i+1;prior=value;
      const difference=Number(((value-data.average)*100).toFixed(2));
      const spread=(difference>0?'+':difference<0?'−':'')+Math.abs(difference)+'bp';
      return `<tr><td class="ranking-place">${rank}</td><td class="sticky-col ranking-institution" title="${escapeHtml(row.institutionCode)}">${escapeHtml(row.institution)}</td><td class="ranking-product">${escapeHtml(row.type)}</td><td class="ranking-grade">${escapeHtml(row.grade||'—')}</td><td class="rate ranking-rate ${row.category==='보험'?'gic':''}">${salesRateCell(row,index,$('rankingProposal').value)}</td><td class="ranking-spread ${difference>0?'ranking-above':''}">${spread}</td><td class="ranking-lineup">${escapeHtml(row.lineup||'—')}</td></tr>`;
    }).join('');
  }
  function setView(next){
    if(next===mode)return;
    mode=next;const active=mode==='ranking',target=active?ranking:full;
    window.RateStatus?.hide();full.hidden=active;ranking.hidden=!active;
    table.replaceChild(active?rankHead:fullHead,table.tHead);table.className=active?'sales-ranking-table':fullClass;
    target.append(...shared);
    shared[0].querySelectorAll('.sort-control,.maturity-sort').forEach(control=>control.hidden=active);
    ['full','ranking'].forEach(name=>{const button=$('sales-view-tab-'+name);button.setAttribute('aria-selected',String(mode===name));button.tabIndex=mode===name?0:-1;});
    table.closest('.table-scroll').scrollLeft=0;
    render();window.dispatchEvent(new Event('resize'));
  }
  nav.querySelectorAll('button').forEach((button,i,buttons)=>{
    button.onclick=()=>setView(i?'ranking':'full');
    button.onkeydown=e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const n=e.key==='Home'?0:e.key==='End'?1:1-i;buttons[n].click();buttons[n].focus();}};
  });
  ranking.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.rankingGroup!==undefined)group=Number(b.dataset.rankingGroup);else if(b.dataset.rankingIndex!==undefined)index=Number(b.dataset.rankingIndex);else return;render();});
  ranking.querySelectorAll('select').forEach(select=>select.addEventListener('change',render));
  $('rankingViewAll').onclick=()=>{$('rankingLineup').value='all';$('rankingProposal').value='all';render();};
  $('rankingReset').onclick=()=>{group=0;index=0;$('rankingRating').value='all';$('rankingPension').value='all';$('rankingLineup').value='Y';$('rankingProposal').value='all';render();};
  window.SalesRanking={active:()=>mode==='ranking',render:renderRanking,current,setView};
})();
