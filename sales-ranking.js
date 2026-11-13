/* Independent product/maturity comparisons. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id),panel=$('panel-sales');
 const labels=['ELB/DLB','GIC','은행예금','저축은행예금'],terms=['1년','1.5년','3년','5년'];
 const nav=document.createElement('div');nav.className='sales-view-tabs';nav.setAttribute('role','tablist');nav.setAttribute('aria-label','금리표 보기 방식');
 nav.innerHTML=['전체 금리표','만기별 금리순'].map((label,i)=>`<button id="sales-view-tab-${i?'ranking':'full'}" type="button" role="tab" aria-controls="sales-view-${i?'ranking':'full'}" aria-selected="${!i}" tabindex="${i?-1:0}">${label}</button>`).join('');
 const full=document.createElement('section'),ranking=document.createElement('section');
 [full,ranking].forEach((section,i)=>{const name=i?'ranking':'full';section.id='sales-view-'+name;section.setAttribute('role','tabpanel');section.setAttribute('aria-labelledby','sales-view-tab-'+name);});ranking.hidden=true;
 const shared=['.table-toolbar','.rate-unit','.table-meta'].map(s=>panel.querySelector(s));
 full.append(panel.querySelector('.filter-panel'),shared[0],shared[1],panel.querySelector('.table-frame'),shared[2]);panel.querySelector('.page-heading').after(nav,full,ranking);
 ranking.innerHTML=`<div class="ranking-controls"><div class="ranking-choices" role="group" aria-label="금리순 상품유형">${labels.map((label,i)=>`<button type="button" data-ranking-group="${i}" aria-pressed="${i===0}">${label}</button>`).join('')}</div><div class="ranking-choices" role="group" aria-label="금리순 만기">${terms.map((term,i)=>`<button type="button" data-ranking-index="${i}" aria-pressed="${i===0}">${term}</button>`).join('')}</div><div class="ranking-selection"><div id="rankingSelected" aria-label="선택한 상품·만기"></div><span id="rankingSelectionCount"></span></div><div class="ranking-filters"><label>등급<select id="rankingRating">${els.ratingFilter.innerHTML}</select></label><label>라인업<select id="rankingLineup"><option value="Y">Y</option><option value="all">전체</option><option value="N">N</option></select></label><label>제안가능<select id="rankingProposal"><option value="all">전체</option><option value="Y">Y</option><option value="N">N</option><option value="확인">확인필요</option></select></label><label>사업자<select id="rankingPension"><option value="all">전체</option><option value="Y">Y</option><option value="N">N</option></select></label></div><div class="ranking-actions"><button id="rankingViewAll" type="button">전체보기</button><button id="rankingReset" type="button">초기화</button></div></div><p id="rankingSummary" aria-live="polite"></p>`;
 const grid=document.createElement('div');grid.className='ranking-grid';ranking.append(grid);
 const toast=document.createElement('div');toast.id='rankingToast';toast.className='ranking-toast';toast.setAttribute('role','status');toast.setAttribute('aria-live','polite');toast.setAttribute('aria-atomic','true');document.body.append(toast);
 let toastTimer,mode='full',group=0,selections=[{group:0,index:0}];
 function hideToast(){clearTimeout(toastTimer);toast.textContent='';toast.classList.remove('visible');}
 function showLimit(){clearTimeout(toastTimer);toast.textContent='최대 3개까지 선택할 수 있습니다.';toast.classList.add('visible');toastTimer=setTimeout(hideToast,3000);}
 function sectionData({group,index}){
  const grade=$('rankingRating').value,lineup=$('rankingLineup').value,proposal=$('rankingProposal').value,pension=$('rankingPension').value;
  const rows=rates.filter(row=>groupRank(row)===group&&row.terms[maturities[index]]&&(grade==='all'||row.grade&&ratingOrder.includes(row.grade)&&gradeRank(row)<=ratingOrder.indexOf(grade))&&(lineup==='all'||row.lineup===lineup)&&(pension==='all'||row.pension===pension)&&(proposal==='all'||termProposalState(row,maturities[index])===proposal)).sort((a,b)=>compareRate(a,b,index)||defaultOrder(a,b));
  const average=rows.length?rows.reduce((sum,row)=>sum+effectiveRate(row,index),0)/rows.length:null;
  return {group,index,label:`${labels[group]} · ${terms[index]}`,rows:rows.slice(0,10),total:rows.length,average,indices:[index],sortLabel:`${terms[index]} 금리 높은 순${group===1?' (단리환산 기준)':''}`,condition:`${labels[group]} / ${terms[index]} / 등급 ${grade} / 라인업 ${lineup} / 제안가능 ${proposal} / 사업자 ${pension}`};
 }
 function current(){const sections=selections.map(sectionData);return {sections,rows:sections.flatMap(s=>s.rows),indices:[...new Set(sections.map(s=>s.index))],sortLabel:sections.length===1?sections[0].sortLabel:'상품·만기별 금리 높은 순 (각 상위 10개)',condition:sections.map(s=>s.condition).join(' / ')};}
 function renderRanking(){
  window.RateStatus?.hide();const data=current();els.resultCount.textContent=data.rows.length;
  $('rankingSummary').textContent=`선택 ${selections.length}개 · 각 상위 10개 · 평균은 조회 대상 전체 기준 · GIC는 단리환산 기준`;
  ranking.querySelectorAll('[data-ranking-group]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.rankingGroup)===group)));
  ranking.querySelectorAll('[data-ranking-index]').forEach(b=>{const i=Number(b.dataset.rankingIndex);b.setAttribute('aria-pressed',String(selections.some(s=>s.group===group&&s.index===i)));b.setAttribute('aria-label',`${labels[group]} ${terms[i]}`);});
  $('rankingSelected').innerHTML=selections.map((s,i)=>`<button type="button" data-ranking-remove="${i}" aria-label="${labels[s.group]} ${terms[s.index]} 선택 해제">${labels[s.group]} ${terms[s.index]} <span aria-hidden="true">×</span></button>`).join('');$('rankingSelectionCount').textContent=`${selections.length} / 3`;
  grid.style.setProperty('--ranking-columns',Math.max(1,selections.length));
  grid.innerHTML=data.sections.map(({index,rows,average,label,total})=>{
   let rank=0,prior=null;
   const body=rows.map((row,i)=>{
    const value=effectiveRate(row,index);if(prior!==value)rank=i+1;prior=value;
    const diff=Number(((value-average)*100).toFixed(2)),spread=(diff>0?'+':diff<0?'−':'')+Math.abs(diff)+'bp';
    return `<tr><td class="ranking-place">${rank}</td><td class="sticky-col ranking-institution">${escapeHtml(row.institution)}</td><td class="ranking-product">${escapeHtml(row.type)}</td><td class="ranking-grade">${escapeHtml(row.grade||'—')}</td><td class="rate ranking-rate ${row.category==='보험'?'gic':''}">${salesRateCell(row,index,$('rankingProposal').value)}</td><td class="ranking-spread ${diff>0?'ranking-above':''}">${spread}</td><td class="ranking-lineup">${escapeHtml(row.lineup||'—')}</td></tr>`;
   }).join('');
   return `<section class="ranking-section" aria-label="${label}"><h2>${label}</h2><p>상위 ${rows.length}개 / 조회 ${total}개 · 조회상품 평균 ${average===null?'—':average.toFixed(4)+'%'}</p><div class="table-frame"><div class="table-scroll"><table class="sales-ranking-table"><thead><tr><th class="ranking-place">순위</th><th class="sticky-col ranking-institution">제공기관</th><th class="ranking-product">상품</th><th class="ranking-grade">등급</th><th class="ranking-rate">${terms[index]} 금리</th><th class="ranking-spread">평균 대비</th><th class="ranking-lineup">라인업</th></tr></thead><tbody>${body}</tbody></table>${rows.length?'':'<div class="empty-state">조건에 맞는 상품이 없습니다.</div>'}</div></div></section>`;
  }).join('')||'<p class="ranking-empty" role="status">상품과 만기를 선택해주세요. 최대 3개까지 비교할 수 있습니다.</p>';
  window.RateScroll?.refresh();window.dispatchEvent(new Event('resize'));
 }
 function setView(next){
  if(next===mode)return;mode=next;const active=mode==='ranking',target=active?ranking:full;window.RateStatus?.hide();hideToast();full.hidden=active;ranking.hidden=!active;
  if(active){$('rankingSummary').after(shared[0],shared[1]);ranking.append(shared[2]);}else{full.querySelector('.filter-panel').after(shared[0],shared[1]);full.append(shared[2]);}
  shared[0].querySelectorAll('.sort-control,.maturity-sort').forEach(control=>control.hidden=active);
  ['full','ranking'].forEach(name=>{const b=$('sales-view-tab-'+name);b.setAttribute('aria-selected',String(mode===name));b.tabIndex=mode===name?0:-1;});target.querySelectorAll('.table-scroll').forEach(s=>s.scrollLeft=0);render();window.dispatchEvent(new Event('resize'));
 }
 nav.querySelectorAll('button').forEach((button,i)=>{button.onclick=()=>setView(i?'ranking':'full');button.onkeydown=e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const n=e.key==='Home'?0:e.key==='End'?1:1-i;nav.querySelectorAll('button')[n].click();nav.querySelectorAll('button')[n].focus();}};});
 ranking.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.rankingGroup!==undefined){group=Number(b.dataset.rankingGroup);hideToast();}
  else if(b.dataset.rankingIndex!==undefined){const index=Number(b.dataset.rankingIndex),existing=selections.findIndex(s=>s.group===group&&s.index===index);if(existing>=0)selections.splice(existing,1);else if(selections.length>=3){showLimit();return;}else selections.push({group,index});hideToast();}
  else if(b.dataset.rankingRemove!==undefined){selections.splice(Number(b.dataset.rankingRemove),1);hideToast();ranking.querySelector('[data-ranking-index]').focus();}else return;render();
 });
 ranking.querySelectorAll('select').forEach(select=>select.addEventListener('change',render));
 $('rankingViewAll').onclick=()=>{$('rankingLineup').value='all';$('rankingProposal').value='all';render();};
 $('rankingReset').onclick=()=>{hideToast();group=0;selections=[{group:0,index:0}];$('rankingRating').value='all';$('rankingPension').value='all';$('rankingLineup').value='Y';$('rankingProposal').value='all';render();};
 new MutationObserver(()=>{if(panel.hidden||document.querySelector('.modal-backdrop:not([hidden])'))hideToast();}).observe(document.body,{subtree:true,attributes:true,attributeFilter:['hidden']});
 window.SalesRanking={active:()=>mode==='ranking',render:renderRanking,current,setView};
})();
