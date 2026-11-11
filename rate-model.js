/* Monthly source rates and internal management information have separate keys. */
const maturities = [12,18,36,60];
const ratingOrder = ['AAA','AA+','AA','AA-','A+','A','A-','BBB+','BBB','BBB-','BB+','BB','BB-','B+','B','B-','CCC','CC','C','D'];
let importData = window.RATE_IMPORT;
let rates = importData.products;
let monthLabel = importData.month.replace(/^(\d{4})-0?(\d+)$/, '$1년 $2월');
const approvedSource = importData.sha256 === 'a1655d46b7a7f9542653a62ea0a9a8ca5042fbe399cdf30b48c9220a38b81211';
const els = Object.fromEntries(['rateTableBody','resultCount','emptyState','periodFilter','ratingFilter','pensionFilter','lineupFilter','proposalFilter','sortFilter','resetButton','infoButton','infoModal','saveModal','saveButton','previewButton'].map(id => [id, document.getElementById(id)]));
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const checked = () => [...document.querySelectorAll('#categoryMenu input:checked')].map(input => input.value);
const selectedMaturities = () => [...document.querySelectorAll('#periodMenu input:checked')].map(input => Number(input.value));
function truncate(value){ return Math.floor((value + 1e-10) * 100) / 100; }
function effectiveRate(row,index=0){
  const term = row.terms[maturities[index]];
  if(!term) return null;
  const value = term.rate, years = maturities[index] / 12;
  return row.category === '보험' ? (years === 1 ? value : truncate((Math.pow(1+value/100,years)-1)/years*100)) : value;
}
function displayRate(row,index){
  const term = row.terms[maturities[index]];
  if(!term) return '<span class="missing" title="해당 만기 DB금리 없음">—</span>';
  const value = term.rate.toFixed(2);
  return row.category === '보험' ? `<span>${value} <small>(${effectiveRate(row,index).toFixed(2)})</small></span>` : value;
}
function proposalState(row){
  const states = selectedMaturities().filter(i=>row.terms[maturities[i]]).map(i=>row.proposals[maturities[i]]);
  if(!states.length || states.some(v=>v !== 'Y' && v !== 'N')) return ['확인','partial'];
  if(states.every(v=>v==='Y')) return ['Y',''];
  return states.every(v=>v==='N') ? ['N','no'] : ['일부','partial'];
}
function groupRank(row){
  return row.category==='파생결합사채' ? 0 : row.category==='보험' ? 1 : row.type==='은행예금' ? 2 : 3;
}
function gradeRank(row){
  const rank=ratingOrder.indexOf(row.grade);
  return rank<0 ? 999 : rank;
}
function compareRate(a,b,index){
  return ((effectiveRate(b,index) ?? -Infinity)-(effectiveRate(a,index) ?? -Infinity)) || 0;
}
function productRank(row){
  if(row.type==='ELB') return 0;
  if(row.type==='DLB') return 1;
  const note=row.note || '';
  return ({'':0,I:0,II:1,III:2})[note] ?? (note.includes('보너스') ? 3 : 4);
}
// Approved workbook order: group, 1y rate, grade, 3y rate, 5y rate, name, variant.
function defaultOrder(a,b){
  return groupRank(a)-groupRank(b) || compareRate(a,b,0) || gradeRank(a)-gradeRank(b) ||
    compareRate(a,b,2) || compareRate(a,b,3) || a.institution.localeCompare(b.institution,'ko') ||
    productRank(a)-productRank(b) || a.id.localeCompare(b.id,'ko');
}
function termProposalState(row,months){
  const value=row.proposals[months];
  return value==='Y'||value==='N'?value:'확인';
}
function proposalMatches(state,filter=els.proposalFilter.value){
  return filter==='all' || state===filter;
}
function salesRateCell(row,index,filter=els.proposalFilter.value){
  const months=maturities[index],term=row.terms[months];
  if(!term)return displayRate(row,index);
  const state=termProposalState(row,months),filtered=filter!=='all';
  const dim=filtered&&state!=='확인'&&!proposalMatches(state,filter);
  const dot=filtered&&state==='확인';
  const label=row.institution+' '+row.type+' '+months/12+'년, 금리 '+term.rate.toFixed(2)+'%, 제안가능 '+state;
  return '<button type="button" class="rate-status-trigger'+(dim?' rate-status-dim':'')+'" data-status="'+state+'" aria-label="'+escapeHtml(label)+'"><span class="rate-value'+(dot?' rate-needs-confirm':'')+'">'+displayRate(row,index)+'</span></button>';
}
function filteredRows(){
  const categories = checked(), visible = selectedMaturities();
  let rows = rates.filter(row=>categories.includes(row.category==='예금' ? row.type : row.category) && visible.some(i=>row.terms[maturities[i]]) &&
    (els.pensionFilter.value==='all' || row.pension===els.pensionFilter.value) &&
    (els.lineupFilter.value==='all' || row.lineup===els.lineupFilter.value) &&
    (els.proposalFilter.value==='all' || visible.some(i=>row.terms[maturities[i]] && proposalMatches(termProposalState(row,maturities[i])))));
  if(els.ratingFilter.value!=='all') rows = rows.filter(row=>row.grade && ratingOrder.includes(row.grade) && ratingOrder.indexOf(row.grade)<=ratingOrder.indexOf(els.ratingFilter.value));
  if(els.sortFilter.value==='rating') rows.sort((a,b)=>gradeRank(a)-gradeRank(b) || defaultOrder(a,b));
  else if(els.sortFilter.value==='rate') rows.sort((a,b)=>compareRate(a,b,Number(document.getElementById('maturitySort').value)) || defaultOrder(a,b));
  else rows.sort(defaultOrder);
  return rows;
}
function render(){
  window.RateStatus?.hide();
  if(window.SalesRanking?.active()){window.SalesRanking.render();return;}
  document.getElementById('maturitySortWrap').hidden=els.sortFilter.value!=='rate';
  const visible = selectedMaturities(), sort = document.getElementById('maturitySort');
  [...sort.options].forEach(option=>option.hidden=!visible.includes(Number(option.value)));
  if(visible.length && !visible.includes(Number(sort.value))) sort.value=String(visible[0]);
  const rows = filteredRows(); els.resultCount.textContent=rows.length; els.emptyState.hidden=rows.length!==0;
  document.querySelectorAll('.rate-head').forEach((h,i)=>h.hidden=!visible.includes(i));
  els.rateTableBody.innerHTML=rows.map(row=>{
    const [state,cls]=proposalState(row);
    const productName = row.type === '저축은행예금' ? '저축은행<br>예금' : escapeHtml(row.type);
    return `<tr><td class="product-col"><div class="product-name">${productName}</div></td><td class="sticky-col institution institution-col" title="${escapeHtml(row.institutionCode)}">${escapeHtml(row.institution)}</td><td class="grade grade-col">${escapeHtml(row.grade || '—')}</td>${maturities.map((months,i)=>`<td class="rate ${row.category==='보험'?'gic':''}" ${visible.includes(i)?'':'hidden'} title="${row.terms[months] ? '원본 Sheet1 '+row.terms[months].sourceRow+'행':'해당 만기 없음'}">${salesRateCell(row,i)}</td>`).join('')}<td class="yn lineup-col">${escapeHtml(row.lineup || '—')}</td><td class="yn provider-col">${escapeHtml(row.pension || '—')}</td></tr>`;
  }).join('');
}
// Missing internal statuses are never inferred from the presence of a rate.
// Start with lineup Y and all proposal statuses; explicit full view clears both.
els.lineupFilter.value='Y'; els.proposalFilter.value='all';
els.sortFilter.value='rate';
document.getElementById('maturitySort').value='0';
const heading = document.querySelector('.page-heading');
heading.querySelector('h1').textContent=`${monthLabel} 원리금보장상품 금리`;
document.title = `${monthLabel} 원리금보장상품 금리`;
heading.querySelector('p').textContent=`적용기간 : ${importData.start.replaceAll('-','.')} ~ ${importData.end.replaceAll('-','.')}`;
document.querySelector('.table-meta').textContent=`원본 엑셀 · DB금리 · ${importData.acceptedTerms}개 상품·만기 / ${rates.length}개 상품`;
const validation=document.createElement('section');
validation.className='import-validation';
validation.innerHTML=`<b id="importState">${monthLabel} 엑셀 검증 완료 · 미반영</b><p>${importData.totalRows}행 중 DB금리 0 ${importData.zeroExcluded}행·대상 외 ${importData.unsupportedExcluded}행 제외 → ${importData.acceptedTerms}개 금리. 3~9개월 ${importData.shortHidden}개는 기본 숨김.</p><p>기관 기본정보와 라인업은 기존 설정을 유지합니다. 새 월의 제안가능 상태는 확인부터 시작합니다.</p><button id="showSource" type="button">미확인 포함 전체 조회</button> <button id="applyImport" type="button">${monthLabel} 금리 반영</button><details><summary>검증 상세</summary><p>기간 단일 · 상품·만기 중복 0건 · ${rates.length}개 상품. II/Ⅱ 등 GIC 구분 통일. 보너스 이율·월지급식 별도 보존. 2년 등 다른 만기는 원본 데이터에 보존하며 기본 표는 1·1.5·3·5년을 표시합니다.</p><p>검증한 원본의 DB금리를 표시합니다. 기관 기본정보와 라인업은 금리와 별도로 유지합니다.</p></details>`;
heading.after(validation);
function showAllSource(){ els.lineupFilter.value='all'; els.proposalFilter.value='all'; els.sortFilter.value='default'; render(); }
function activateRateSource(next){
  importData=next;rates=next.products;window.RATE_IMPORT=next;
  monthLabel=next.month.replace(/^(\d{4})-0?(\d+)$/, '$1년 $2월');
  heading.querySelector('h1').textContent=`${monthLabel} 원리금보장상품 금리`;
  document.title=`${monthLabel} 원리금보장상품 금리`;
  heading.querySelector('p').textContent=`적용기간 : ${next.start.replaceAll('-','.')} ~ ${next.end.replaceAll('-','.')}`;
  document.querySelector('.table-meta').textContent=`원본 엑셀 · DB금리 · ${next.acceptedTerms}개 상품·만기 / ${rates.length}개 상품`;
}
document.getElementById('showSource').onclick=showAllSource;
document.getElementById('applyImport').onclick=()=>{
  try { localStorage.setItem('rate-import-active',importData.sha256); }
  catch { document.getElementById('importState').textContent='저장 실패 · 브라우저 저장 권한을 확인하세요'; return; }
  document.getElementById('importState').textContent=`${monthLabel} 금리 반영 완료`;
  document.getElementById('applyImport').disabled=true;
  showAllSource();
};
try { if(approvedSource || localStorage.getItem('rate-import-active')===importData.sha256){ document.getElementById('importState').textContent=`${monthLabel} 금리 반영 완료`; document.getElementById('applyImport').disabled=true; } } catch {}
render();
document.querySelector('#infoModal .guide-list').innerHTML=`<div><b>금리 기준 및 GIC 안내</b><ul><li>본 금리표의 금리는 퇴직연금 <strong>DB제도에 적용되는 금리</strong>입니다.</li>
<li>GIC는 복리상품으로, 공시금리와 함께 <strong>연환산한 단리기준 금리</strong>를 괄호 안에 표시했습니다.</li>
<li>GIC 단리환산금리는 동일한 산식으로 일괄 계산한 참고 수치입니다. 실제 제안서 작성 시에는 해당 상품제공기관 홈페이지의 공시금리를 다시 확인해주세요.</li></ul></div>
<div><b>제안가능여부</b><ul><li><strong>Y</strong>: 별도 확인 없이 물량·한도 내에서 사용 가능합니다.</li><li><strong>N</strong>: 이번 달에는 제안할 수 없습니다.</li><li><strong>확인</strong>: 제안 전 상품제공기관에 업체명, 제안금액 등을 전달하고 사전 확인을 받아야 합니다.</li>
<li>제안가능여부는 <strong>상품·만기별로 다를 수 있으며</strong>, 각 금리를 터치하면 해당 만기의 상태를 확인할 수 있습니다.</li>
<li>필터는 <strong>전체 / Y / N / 확인필요</strong>로 구분합니다. 선택한 만기 중 해당 상태가 있는 상품을 조회합니다.</li>
<li><strong>전체 조회에서는 모든 금리를 동일하게 표시</strong>합니다. 필터 적용 시 사전 확인이 필요한 금리에는 <strong>분홍색 점</strong>을, 그 외 선택 조건에 맞지 않는 금리는 연하게 표시합니다.</li>
<li>필터 상태에서 금리 위 분홍색 점은 상품제공기관에 사전 확인 후 사용할 수 있음을 의미합니다.</li>
<li>저장 이미지에는 분홍색 점·말풍선·상태별 흐림 표시가 포함되지 않습니다.</li></ul></div>
<div><b>정렬기준</b><ul><li>최초 조회 및 필터 초기화 시 다음 순서로 정렬합니다. 앞선 기준이 같으면 다음 기준을 적용합니다.</li>
<li>1년 금리 높은 순 → 상품군 → 신용등급 높은 순 → 3년 금리 높은 순 → 5년 금리 높은 순 → 기관명 가나다순 → 동일 기관 내 상품 순</li>
<li>상품군은 파생결합사채 → 보험 → 은행예금 → 저축은행예금 순이며, GIC 금리는 괄호 안 단리환산금리를 기준으로 비교합니다.</li></ul></div>`;
