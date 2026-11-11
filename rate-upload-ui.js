/* File -> validation -> explicit confirmation -> commit. Selection never publishes rates. */
(() => {
  'use strict';
  const api=window.RateUpload,$=id=>document.getElementById(id),esc=escapeHtml;
  const host=$('managementImport');
  host.innerHTML=`<section class="rate-upload" aria-labelledby="uploadTitle"><h2 id="uploadTitle">월별 금리 업로드</h2>
    <p id="uploadActive"></p><div class="upload-inputs"><label>엑셀 파일 <input id="uploadFile" type="file" accept=".xlsx"></label>
    <label id="uploadSheetLabel" hidden>시트 <select id="uploadSheet"></select></label><label id="uploadPeriodLabel" hidden>적용기간 <select id="uploadPeriod"></select></label>
    <button id="uploadValidate" type="button" disabled>검증하기</button></div>
    <p class="management-help">파일 선택·검증 중에는 현재 금리표가 바뀌지 않습니다. 반영한 자료는 이 브라우저에만 저장됩니다.</p>
    <p id="uploadMessage" role="status" aria-live="polite"></p><div id="uploadResult" hidden></div>
    <div class="upload-actions"><button id="uploadApply" type="button" class="management-primary" hidden>금리표 반영</button></div>
    <div id="uploadComplete" hidden><p id="uploadCompleteText" role="status"></p><button id="uploadViewSales" type="button">금리표 확인</button> <button id="uploadViewBasic" type="button">라인업 설정</button> <button id="uploadViewMonthly" type="button">제안가능·한도 관리</button></div></section>`;
  const backdrop=document.createElement('div');backdrop.className='modal-backdrop';backdrop.id='uploadModal';backdrop.hidden=true;
  backdrop.innerHTML=`<section class="modal upload-dialog" role="dialog" aria-modal="true" aria-labelledby="uploadConfirmTitle"><h2 id="uploadConfirmTitle">금리표 반영 확인</h2><div id="uploadConfirmBody"></div><p id="uploadConfirmError" role="status"></p><div class="modal-actions"><button id="uploadCancel" type="button">돌아가기</button><button id="uploadConfirm" type="button" class="management-primary">확인 후 반영</button></div></section>`;
  document.body.append(backdrop);
  let workbook=null,rows=null,result=null,generation=0,busy=false,previousOverflow='';
  const active=()=>{$('uploadActive').textContent=`현재 반영: ${importData.month} · ${importData.start} ~ ${importData.end} · ${importData.source}`;};active();
  if(api.storeWarning)$('uploadMessage').textContent=api.storeWarning;
  $('manageImport').textContent='엑셀 업로드·검증';
  $('manageImport').onclick=()=>{host.hidden=!host.hidden;if(!host.hidden)$('uploadFile').focus();};
  function invalidate(){result=null;$('uploadResult').hidden=true;$('uploadApply').hidden=true;$('uploadComplete').hidden=true;$('uploadMessage').textContent='';}
  function buttons(){ $('uploadValidate').disabled=busy||!workbook||!rows;$('uploadFile').disabled=busy;$('uploadSheet').disabled=busy;$('uploadPeriod').disabled=busy; }
  function failure(e){invalidate();$('uploadMessage').textContent='검증 불가 · '+e.message;}
  async function loadSheet(token){
    rows=await workbook.rows(Number($('uploadSheet').value));if(token!==generation)return;
    const periods=api.periods(rows,workbook.date1904);
    $('uploadPeriod').innerHTML=periods.map(p=>`<option value="${esc(p.key)}">${esc(p.start+' ~ '+p.end)} (${p.count}행)</option>`).join('');
    $('uploadPeriodLabel').hidden=periods.length<2;
    $('uploadMessage').textContent=periods.length>1?'적용기간이 여러 개입니다. 반영할 기간을 선택하세요. 다른 기간의 행은 제외 내역으로 안내합니다.':'파일을 읽었습니다. 검증하기를 눌러 결과를 확인하세요.';
  }
  $('uploadFile').onchange=async()=>{
    const token=++generation;invalidate();workbook=null;rows=null;$('uploadSheetLabel').hidden=true;$('uploadPeriodLabel').hidden=true;
    const file=$('uploadFile').files[0];if(!file){buttons();return;}
    busy=true;buttons();$('uploadMessage').textContent='엑셀을 읽는 중입니다…';
    try{const opened=await window.RateXlsx.open(file);if(token!==generation)return;workbook=opened;
      $('uploadSheet').innerHTML=opened.sheets.map((s,i)=>`<option value="${i}">${esc(s.name)}</option>`).join('');$('uploadSheet').value='0';$('uploadSheetLabel').hidden=opened.sheets.length<2;
      await loadSheet(token);
    }catch(e){rows=null;failure(e);}finally{busy=false;buttons();}
  };
  $('uploadSheet').onchange=async()=>{invalidate();rows=null;busy=true;buttons();try{await loadSheet(++generation);}catch(e){rows=null;failure(e);}finally{busy=false;buttons();}};
  $('uploadPeriod').onchange=invalidate;
  const issueTable=(items)=>`<div class="upload-table-scroll"><table><thead><tr><th>Excel 행</th><th>확인 내용</th></tr></thead><tbody>${items.map(i=>`<tr><td>${i.row}</td><td>${esc(i.message)}</td></tr>`).join('')}</tbody></table></div>`;
  const section=(title,body,open=false)=>`<details ${open?'open':''}><summary>${esc(title)}</summary>${body}</details>`;
  const trendGroups=['ELB/DLB','GIC','예금'],primaryTerms=[12,18,36,60];
  const termLabel=term=>({12:'1년',18:'1.5년',36:'3년',60:'5년'})[term]||term+'개월';
  const bp=value=>{const n=Number(value.toFixed(2));return (n>0?'+':n<0?'−':'')+Math.abs(n)+'bp';};
  let trendGroup='ELB/DLB',trendTerm=12;
  function renderTrend(){
    const groups=result.comparisons,available=groups.filter(g=>g.group===trendGroup).sort((a,b)=>a.term-b.term);
    if(!available.some(g=>g.term===trendTerm))trendTerm=available.find(g=>g.term===12)?.term??available[0]?.term??12;
    const current=available.find(g=>g.term===trendTerm);
    document.querySelectorAll('[data-trend-group]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.trendGroup===trendGroup));b.disabled=!groups.some(g=>g.group===b.dataset.trendGroup);});
    document.querySelectorAll('[data-trend-term]').forEach(b=>{b.setAttribute('aria-pressed',String(Number(b.dataset.trendTerm)===trendTerm));b.disabled=!available.some(g=>g.term===Number(b.dataset.trendTerm));});
    const other=available.filter(g=>!primaryTerms.includes(g.term));
    $('trendOther').innerHTML='<option value="">기타 만기</option>'+other.map(g=>`<option value="${g.term}">${termLabel(g.term)}</option>`).join('');
    $('trendOther').value=primaryTerms.includes(trendTerm)?'':String(trendTerm);$('trendOtherLabel').hidden=!other.length;
    $('trendSummary').textContent=current?`${trendGroup} · ${termLabel(trendTerm)} — 평균 ${current.average.toFixed(4)}% · ${current.rows.length}개 상품`:'해당 유형에 금리가 없습니다.';
    $('trendRows').innerHTML=current?current.rows.map(r=>`<tr><td>${r.rank}</td><td>${esc(r.institution)}</td><td>${esc(r.type)}</td><td>${r.rate.toFixed(2)}%</td><td class="${r.spreadBp>1e-10?'trend-above':''}">${bp(r.spreadBp)}</td></tr>`).join(''):'<tr><td colspan="5">비교할 금리가 없습니다.</td></tr>';
    $('trendScroll').scrollTop=0;
  }
  function connectTrend(){
    trendGroup=trendGroups.find(name=>result.comparisons.some(g=>g.group===name))||trendGroups[0];trendTerm=12;
    $('uploadTrend').onclick=e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.trendGroup)trendGroup=b.dataset.trendGroup;else if(b.dataset.trendTerm)trendTerm=Number(b.dataset.trendTerm);else return;renderTrend();};
    $('trendOther').onchange=e=>{if(e.target.value){trendTerm=Number(e.target.value);renderTrend();}};
    renderTrend();
  }
  function display(r){
    $('uploadResult').hidden=false;
    const s=r.snapshot;
    $('uploadResult').innerHTML=`${s?`<p class="upload-summary"><strong>${esc(s.month)} · ${s.products.length}개 상품 / ${s.acceptedTerms}개 금리 반영 예정</strong><br>${esc(s.start)} ~ ${esc(s.end)} · ${esc(s.sheet)}</p>`:''}
      ${r.fatal.length?`<p class="upload-error">${r.fatal.map(esc).join('<br>')}</p>`:''}
      ${r.comparisons.length?`<section id="uploadTrend" aria-labelledby="trendTitle"><h3 id="trendTitle">금리 동향 · 금리 비교표</h3>
        <div class="trend-controls" role="group" aria-label="비교 상품유형"><span>상품유형</span>${trendGroups.map(g=>`<button type="button" data-trend-group="${g}" aria-pressed="false">${g}</button>`).join('')}</div>
        <div class="trend-controls" role="group" aria-label="비교 만기"><span>만기</span>${primaryTerms.map(t=>`<button type="button" data-trend-term="${t}" aria-pressed="false">${termLabel(t)}</button>`).join('')}<label id="trendOtherLabel"><span class="trend-sr-only">기타 만기</span><select id="trendOther" aria-label="기타 만기"></select></label></div>
        <p id="trendSummary" aria-live="polite"></p><div class="upload-table-scroll" id="trendScroll" tabindex="0" role="region" aria-label="금리순 비교표"><table class="upload-trend-table"><colgroup><col class="trend-rank-col"><col class="trend-institution-col"><col class="trend-product-col"><col class="trend-rate-col"><col class="trend-spread-col"></colgroup><thead><tr><th scope="col">순위</th><th scope="col">제공기관</th><th scope="col">상품</th><th scope="col">공시금리</th><th scope="col">평균 대비</th></tr></thead><tbody id="trendRows"></tbody></table></div>
        <p class="management-help">업로드의 유효 금리 전체를 라인업과 관계없이 비교합니다. GIC 번호·구분은 합치고, 예금은 은행·저축은행을 합칩니다. 평균은 같은 유형·같은 만기의 전체 상품을 포함한 공통 기준입니다. 공시금리 높은 순이며 같은 금리는 같은 순위입니다.</p>
        <p class="management-help">1bp = 0.01%p · 차이는 소수 둘째 자리까지 반올림합니다. 담당자 참고용이며 금리·제안가능 상태를 자동 변경하지 않습니다.</p></section>`:''}
      ${section(`기관 매칭 제외 ${r.matching.length}건`,r.matching.length?issueTable(r.matching):'<p>해당 항목이 없습니다.</p>',r.matching.length>0)}
      ${r.issues.length?section(`데이터 확인 ${r.issues.length}건`,issueTable(r.issues),true):''}
      ${section(`신규 상품 ${r.newProducts.length}개 · 이번 파일에 없는 상품 ${r.missingProducts.length}개`,`<p class="management-help">${esc(r.snapshot?.month||'')} 자료와 비교합니다. 해당 월 자료가 없으면 전월 또는 현재 반영 자료와 비교합니다. 신규 상품 라인업은 미설정이며 기존 상품의 관리 기록은 삭제하지 않습니다.</p><ul>${r.newProducts.map(p=>`<li>신규 · ${esc(p.institution+' / '+p.type)}</li>`).join('')}${r.missingProducts.map(p=>`<li>파일에 없음 · ${esc(p.institution+' / '+p.type)}</li>`).join('')}</ul>`)}
      <p class="management-help">기관정보·라인업·기존 월별 관리정보는 유지합니다. 새 월의 제안가능 상태는 확인부터 시작합니다.</p>`;
    if(r.comparisons.length)connectTrend();
    $('uploadApply').hidden=!s||!!r.fatal.length;
    $('uploadMessage').textContent=r.fatal.length?'반영할 수 없습니다. 파일을 수정한 뒤 다시 검증하세요.':'검증 완료 · 확인사항이 있어도 최종 확인 후 반영할 수 있습니다.';
  }
  $('uploadValidate').onclick=()=>{
    invalidate();if(!rows)return;try{
    const s=api.sources();result=api.validate(rows,{source:$('uploadFile').files[0].name,sheet:workbook.sheets[Number($('uploadSheet').value)].name,date1904:workbook.date1904,period:$('uploadPeriod').value,history:s});display(result);
    }catch(e){failure(e);}
  };
  function close(){backdrop.hidden=true;document.body.style.overflow=previousOverflow;$('uploadApply').focus();}
  $('uploadCancel').onclick=close;
  backdrop.addEventListener('click',e=>{if(e.target===backdrop)close();});
  backdrop.addEventListener('keydown',e=>{
    if(e.key==='Escape'){e.preventDefault();close();}
    if(e.key==='Tab'){const list=[...backdrop.querySelectorAll('button:not(:disabled)')],first=list[0],last=list.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
  });
  $('uploadApply').onclick=()=>{
    if(!result?.snapshot)return;
    const r=result,s=r.snapshot,replacing=!!api.sources()[s.month];
    const warnings=[...r.matching,...r.issues].map(i=>`${i.row}행 · ${i.message}`);
    $('uploadConfirmBody').innerHTML=`<p><strong>${esc(s.month)} 금리 ${s.acceptedTerms}건을 ${replacing?'교체':'반영'}할까요?</strong></p><p>${esc(s.start)} ~ ${esc(s.end)} · ${s.products.length}개 상품</p>
      <p>기관 매칭 제외 ${r.matching.length}건 · 데이터 확인 ${r.issues.length}건</p>
      ${warnings.length?'<p class="upload-error">아래 확인사항이 있습니다. 제외된 행은 반영되지 않습니다. 이 내용대로 반영하시겠습니까?</p>':''}
      ${warnings.length?`<ul>${warnings.map(w=>`<li>${esc(w)}</li>`).join('')}</ul>`:''}
      <p>${r.newProducts.length}개 신규 상품의 라인업은 미설정입니다.</p>
      <p>기관정보·라인업·기존 월별 관리 기록은 유지하며 새 월의 제안가능은 확인부터 시작합니다. 이 브라우저에만 반영됩니다.</p>
      ${window.RateManagement.hasUnsaved()?'<p>저장하지 않은 관리 편집값은 유지됩니다. 영업 조회에는 마지막 저장값만 적용됩니다.</p>':''}`;
    $('uploadConfirmError').textContent='';previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';backdrop.hidden=false;$('uploadCancel').focus();
  };
  $('uploadConfirm').onclick=()=>{
    if(!result?.snapshot)return;
    const button=$('uploadConfirm');button.disabled=true;
    try{
      const snapshot=JSON.parse(JSON.stringify(result.snapshot));
      api.commit(snapshot);window.RateManagement.applySource(snapshot);active();
      close();$('uploadComplete').hidden=false;$('uploadCompleteText').textContent=`${snapshot.month} 금리 반영 완료 · ${snapshot.products.length}개 상품 / ${snapshot.acceptedTerms}개 금리. 제안가능·한도 확인은 별도로 진행하세요.`;
      $('uploadApply').hidden=true;$('uploadResult').hidden=true;$('uploadMessage').textContent='';result=null;
      $('uploadViewSales').focus();
    }catch(e){$('uploadConfirmError').textContent='저장하지 못했습니다. 기존 금리표는 유지됩니다. 브라우저 저장 공간·권한을 확인하세요. '+e.message;}
    finally{button.disabled=false;}
  };
  $('uploadViewSales').onclick=()=>window.RateManagement.switchTab('sales');
  $('uploadViewBasic').onclick=()=>{$('showLineups').click();window.RateManagement.switchTab('basic');};
  $('uploadViewMonthly').onclick=()=>{host.hidden=true;window.RateManagement.switchTab('monthly');};
})();
