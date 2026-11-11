/* Internal settings persist independently of monthly source rates. No authentication is provided here. */
(() => {
  const storageKey = 'db-rate-management-v1';
  const clone = value => JSON.parse(JSON.stringify(value));
  let saved = { institutions: {}, products: {}, months: {} };
  let storageWarning = '';
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (parsed && parsed.institutions && parsed.products && parsed.months) saved = parsed;
  } catch { storageWarning = '브라우저 저장정보를 읽을 수 없습니다. 저장 권한을 확인하세요.'; }
  // Source-derived defaults fill absent fields only. Explicit user values, including
  // deliberately cleared settings, take precedence; monthly records are untouched.
  const seed = window.BASIC_SETTINGS_SEED;
  if (seed) {
    for (const [code, values] of Object.entries(seed.institutions || {})) {
      saved.institutions[code] = {...values, ...(saved.institutions[code] || {})};
    }
    for (const [id, values] of Object.entries(seed.products || {})) {
      saved.products[id] = {...values, ...(saved.products[id] || {})};
    }
  }
  // The November source shortens this product's label. Keep its existing lineup.
  // An explicitly saved value on the new key always wins, including a cleared value.
  const previousBonus = saved.products['IL34|1001|보너스 이율'];
  if (previousBonus) saved.products['IL34|1001|보너스'] = {...previousBonus, ...(saved.products['IL34|1001|보너스'] || {})};
  const providers = window.PENSION_PROVIDERS;
  if (providers) {
    const normalize = name => name.normalize('NFKC').replace(/\s+/g,'').toUpperCase();
    // Explicit source aliases avoid broad substring matching (e.g. bank vs savings bank).
    const aliases = {'교보생명':'교보생명보험','미래에셋생명':'미래에셋생명보험','삼성생명':'삼성생명보험','한화생명':'한화생명보험','DB생명':'DB생명보험','케이비손해보험':'KB손해보험','현대해상화재':'현대해상화재보험','경남은행':'BNK경남은행','부산은행':'BNK부산은행','국민은행':'KB국민은행','농협은행':'NH농협은행','기업은행':'IBK기업은행','아이엠뱅크':'iM뱅크(구 대구은행)'};
    const names = new Set(providers.names.map(normalize));
    rates.forEach(row => {
      const item = saved.institutions[row.institutionCode] ||= {};
      if (!Object.prototype.hasOwnProperty.call(item,'pension')) {
        item.pension = names.has(normalize(aliases[row.institution] || row.institution)) ? 'Y' : 'N';
      }
    });
  }
  // Explicit November settings confirmed by the user on 2026-11-10.
  // Fill absent records only; existing saved choices and other months take priority.
  const confirmedMonth='2026-11';
  const confirmedStatuses={'IL05|1001|':{18:'N'},'IN01|1001|III':{all:'Y'}};
  for(const [id,values] of Object.entries(confirmedStatuses)){
    const row=rates.find(r=>r.id===id);if(!row)continue;
    for(const term of Object.keys(row.terms)){
      const value=values[term]||values.all;if(!value)continue;
      const records=saved.months[confirmedMonth] ||= {};
      const key=JSON.stringify([id,String(term)]);
      if(!Object.prototype.hasOwnProperty.call(records,key))records[key]={status:value,amount:'',reason:'',note:'',checkedAt:''};
    }
  }
  let draft = clone(saved);
  const selected = new Set();
  const status = value => ['Y','N','확인'].includes(value) ? value : '확인';
  const termKey = (id, term) => JSON.stringify([id, String(term)]);
  function applySettings(settings) {
    rates.forEach(row => {
      const institution = settings.institutions[row.institutionCode] || {};
      const product = settings.products[row.id] || {};
      row.grade = institution.grade || null;
      row.pension = institution.pension || null;
      row.lineup = product.lineup || null;
      row.proposals = {};
      Object.keys(row.terms).forEach(term => {
        row.proposals[term] = status(settings.months[importData.month]?.[termKey(row.id,term)]?.status);
      });
    });
  }
  applySettings(saved);
  const shell = document.querySelector('.app-shell');
  const nav = document.createElement('div');
  nav.className = 'main-tabs'; nav.setAttribute('role','tablist'); nav.setAttribute('aria-label','금리표 및 상품 관리');
  nav.innerHTML = [['sales','원리금공시금리표'],['monthly','금리및한도관리'],['basic','기관정보관리']].map(([id,label],i) => `<button type="button" role="tab" id="tab-${id}" aria-controls="panel-${id}" aria-selected="${i===0}" tabindex="${i===0?0:-1}">${label}</button>`).join('');
  const sales = document.createElement('section');
  sales.id = 'panel-sales'; sales.setAttribute('role','tabpanel'); sales.setAttribute('aria-labelledby','tab-sales');
  const children = [...shell.children].filter(child => !child.classList.contains('topbar'));
  shell.append(nav, sales); children.forEach(child => sales.append(child));
  const admin = document.createElement('section');
  admin.id='panel-monthly'; admin.className='management-panel'; admin.hidden=true;
  admin.setAttribute('role','tabpanel'); admin.setAttribute('aria-labelledby','tab-monthly');
  const basic = document.createElement('section');
  basic.id='panel-basic'; basic.className='management-panel'; basic.hidden=true;
  basic.setAttribute('role','tabpanel'); basic.setAttribute('aria-labelledby','tab-basic');
  shell.append(admin,basic);
  const options = (values, value) => values.map(v => `<option value="${escapeHtml(v)}" ${v===(value || '')?'selected':''}>${escapeHtml(v || '미설정')}</option>`).join('');
  const select = (values,value,attrs) => `<select ${attrs}>${options(values,value)}</select>`;
  const securityNote = '<p class="management-notice">관리화면 시제품 · 이 브라우저에만 저장됩니다. 상품담당자 인증은 아직 연결되지 않았습니다.</p>';
  admin.innerHTML = `${securityNote}<div class="management-heading"><h1>월별 금리·제안가능 관리</h1><span class="source-badge">실제 엑셀 데이터</span></div>
    <div class="management-period"><label>기준 월 <select aria-label="관리 기준 월"><option>${escapeHtml(importData.month)}</option></select></label><button type="button" id="manageImport">엑셀 검증·반영</button></div>
    <p class="management-help" id="managementPeriodHelp">적용기간 ${escapeHtml(importData.start)} ~ ${escapeHtml(importData.end)} · 기본정보의 라인업 Y 상품만 관리합니다. 새 월의 제안가능 상태는 확인부터 시작합니다.</p>
    <section class="notice-editor" aria-labelledby="noticeEditorTitle">
      <div class="notice-editor-heading"><h2 id="noticeEditorTitle">공지작성</h2><span id="noticeDirty">변경사항 없음</span></div>
      <label for="noticeText">공지 내용</label>
      <textarea id="noticeText" rows="3" maxlength="3000" placeholder="금리표 이용자에게 안내할 내용을 작성해주세요." aria-describedby="noticeHelp"></textarea>
      <div class="notice-editor-footer"><p id="noticeHelp">저장한 내용은 공지사항 상단에 표시됩니다. 내용을 비워 저장하면 배너가 숨겨집니다. 이 브라우저에만 저장됩니다.</p><div><button type="button" id="noticeCancel">변경 취소</button><button type="button" class="management-primary" id="noticeSave">공지 저장</button></div></div>
      <p id="noticeMessage" class="management-message" role="status"></p>
    </section>
    <div id="managementImport" hidden></div>
    <div class="management-filters"><input id="manageSearch" type="search" placeholder="기관·상품 검색" aria-label="기관·상품 검색"><select id="manageCategory" aria-label="상품군"><option value="">전체 상품군</option>${options(['파생결합사채','보험','예금'],'')}</select><select id="manageStatus" aria-label="제안가능 필터"><option value="">전체 상태</option>${options(['Y','N','확인'],'')}</select><span class="check-label">관리대상: 라인업 Y 상품</span></div>
    <div class="management-bulk"><strong class="bulk-label">일괄 변경</strong><select id="bulkScope" aria-label="일괄 변경 대상"><option value="selected">선택 상품</option><option value="institution">기관 전체</option></select><select id="bulkInstitution" aria-label="일괄 변경 기관" hidden></select><span id="manageSelection">0개 선택</span><span id="institutionScope" class="management-help" hidden></span><select id="bulkTerm" aria-label="일괄 변경 만기"><option value="all">전체 만기</option>${maturities.map((m,i)=>`<option value="${m}">${['1년','1.5년','3년','5년'][i]}</option>`).join('')}</select><select id="bulkStatus" aria-label="일괄 변경 상태">${options(['확인','Y','N'],'확인')}</select><label class="bulk-reason">사유 <input id="bulkReason" maxlength="100" placeholder="선택 입력 · 기존 사유 유지"></label><button type="button" id="bulkApply">일괄 변경</button></div>
    <div class="manage-table-meta"><p class="management-help" id="manageCount"></p><div class="rate-unit">(연, %)</div></div><div class="management-scroll"><table class="management-table monthly-table"><colgroup><col class="manage-check-col"><col class="manage-institution-col"><col class="manage-type-col">${maturities.map(()=>'<col class="manage-term-col">').join('')}<col class="manage-all-col"><col class="manage-detail-col"></colgroup><thead><tr><th><input id="selectVisible" type="checkbox" aria-label="조회 상품 전체 선택"></th><th>제공기관</th><th>상품</th>${['1년','1.5년','3년','5년'].map(v=>`<th>${v}</th>`).join('')}<th>전체 만기</th><th>상세</th></tr></thead><tbody id="manageRows"></tbody></table></div>
    <div id="termDetails"></div><div class="management-savebar"><span id="monthlyDirty">변경사항 없음</span><button type="button" id="cancelMonthly">변경 취소</button><button type="button" id="salesPreview">영업화면 확인</button><button type="button" class="management-primary" id="saveMonthly">저장·반영</button></div><p id="monthlyMessage" class="management-message" role="status"></p>`;
  basic.innerHTML = `${securityNote}<div class="management-heading"><h1>기본정보 설정</h1><span class="source-badge">월과 무관하게 유지</span></div><p class="management-help">신용등급·사업자 여부는 기관별, 라인업은 상품별로 설정합니다. 매월 다시 입력하지 않습니다.</p>
    <div class="basic-subtabs"><button type="button" id="showInstitutions" aria-pressed="true">기관정보</button><button type="button" id="showLineups" aria-pressed="false">상품 라인업</button></div><input id="basicSearch" type="search" placeholder="기관·상품 검색" aria-label="기본정보 검색">
    <div class="management-scroll"><table class="management-table" id="basicTable"><thead id="basicHead"></thead><tbody id="basicRows"></tbody></table></div>
    <div class="management-savebar"><span id="basicDirty">변경사항 없음</span><button type="button" class="management-primary" id="saveBasic">저장·반영</button></div><p id="basicMessage" class="management-message" role="status"></p>`;
  const $ = id => document.getElementById(id);
  if (seed) {
    const seedInfo = document.createElement('p');
    seedInfo.className = 'management-help';
    seedInfo.textContent = `초기 설정: ${seed.source} · ${seed.sheet} 시트 G열 라인업 / I열 신용등급. 기존 저장값 우선. 사업자 여부는 첨부 사업자 목록 기준 Y/N으로 초기 설정합니다. 원본 라인업 빈칸은 ${seed.blankLineup === 'N' ? 'N' : '미설정'}입니다. 상품 구분이 일치하지 않는 ${seed.unmatched.length}개는 라인업 미설정으로 유지합니다.`;
    basic.append(seedInfo);
  }
  // Reuse the existing source validation and explicit apply action without duplicating it.
  const importDisclosure = sales.querySelector('.import-disclosure') || sales.querySelector('.import-validation');
  if (importDisclosure) $('managementImport').append(importDisclosure);
  // The browser file-upload UI replaces this legacy disclosure after initialization.
  $('manageImport').onclick=()=>{ $('managementImport').hidden=!$('managementImport').hidden; if(importDisclosure?.tagName==='DETAILS') importDisclosure.open=true; };
  function switchTab(id) {
    ['sales','monthly','basic'].forEach(name=>{
      $(`panel-${name}`).hidden=name!==id;
      $(`tab-${name}`).setAttribute('aria-selected',String(name===id));
      $(`tab-${name}`).tabIndex=name===id?0:-1;
    });
    shell.classList.toggle('management-active',id!=='sales');
    shell.classList.toggle('monthly-active',id==='monthly');
    if(id==='sales') render();
  }
  nav.querySelectorAll('button').forEach((button,index,buttons)=>{
    button.onclick=()=>switchTab(button.id.replace('tab-',''));
    button.onkeydown=event=>{
      let next;
      if(event.key==='ArrowRight') next=(index+1)%buttons.length;
      if(event.key==='ArrowLeft') next=(index+buttons.length-1)%buttons.length;
      if(event.key==='Home') next=0;
      if(event.key==='End') next=buttons.length-1;
      if(next!==undefined){event.preventDefault();buttons[next].click();buttons[next].focus();}
    };
  });
  const monthRecords = () => draft.months[importData.month] || {};
  const isMonthlyTarget = row => draft.products[row.id]?.lineup === 'Y';
  const record = (row,term) => monthRecords()[termKey(row.id,term)] || {status:'확인',amount:'',reason:'',note:'',checkedAt:''};
  function setRecord(row,term,field,value) {
    if (!row || !isMonthlyTarget(row) || !row.terms[term] || !maturities.includes(Number(term))) return;
    const month = draft.months[importData.month] ||= {};
    const key=termKey(row.id,term);
    month[key]={...record(row,term),[field]:value};
    updateDirty();
  }
  function visibleRows(){
    const search=$('manageSearch').value.trim().toLocaleLowerCase();
    return rates.filter(row=>(row.institution+' '+row.type).toLocaleLowerCase().includes(search) &&
      (!$('manageCategory').value || row.category===$('manageCategory').value) &&
      isMonthlyTarget(row) &&
      (!$('manageStatus').value || maturities.some(term=>row.terms[term] && record(row,term).status===$('manageStatus').value)))
      .sort((a,b)=>a.institution.localeCompare(b.institution,'ko') || a.type.localeCompare(b.type,'ko',{numeric:true}));
  }
  const changedTerm = (row,term) => different(record(row,term),saved.months[importData.month]?.[termKey(row.id,term)] || {status:'확인',amount:'',reason:'',note:'',checkedAt:''});
  function statusButtons(row,term) {
    return `<div class="status-buttons" role="group" aria-label="${escapeHtml(row.institution+' '+row.type)} ${term/12}년 제안가능">${['확인','Y','N'].map(s=>`<button type="button" data-row="${escapeHtml(row.id)}" data-term="${term}" data-status="${s}" aria-pressed="${record(row,term).status===s}">${s}</button>`).join('')}</div>`;
  }
  function renderInstitutionScope(){
    const code=$('bulkInstitution').value;
    const rows=rates.filter(r=>isMonthlyTarget(r) && r.institutionCode===code);
    const count=rows.reduce((n,r)=>n+maturities.filter(t=>r.terms[t]).length,0);
    $('institutionScope').textContent=rows.length?`${rows.length}상품 · ${count}만기`:'기관 선택 필요';
    $('institutionScope').title=`${importData.month} · 검색·상품군·상태 필터와 무관한 해당 기관 전체 라인업 Y 상품. 실제 변경 범위는 선택한 만기를 따릅니다.`;
  }
  function renderInstitutions(){
    const search=$('manageSearch').value.trim().toLocaleLowerCase();
    const institutions=[...new Map(rates.filter(r=>isMonthlyTarget(r) && (r.institution+' '+r.type).toLocaleLowerCase().includes(search)).map(r=>[r.institutionCode,r])).values()].sort((a,b)=>a.institution.localeCompare(b.institution,'ko'));
    const previous=$('bulkInstitution').value;
    $('bulkInstitution').innerHTML='<option value="">기관 선택</option>'+institutions.map(r=>`<option value="${escapeHtml(r.institutionCode)}">${escapeHtml(r.institution)}</option>`).join('');
    $('bulkInstitution').value=institutions.some(r=>r.institutionCode===previous)?previous:institutions.length===1?institutions[0].institutionCode:'';
    renderInstitutionScope();
  }
  function updateSelection(){
    $('manageSelection').textContent=`${selected.size}개 선택`;
    const visible=visibleRows();
    $('selectVisible').checked=visible.length>0 && visible.every(row=>selected.has(row.id));
    $('selectVisible').indeterminate=visible.some(row=>selected.has(row.id)) && !$('selectVisible').checked;
  }
  function renderMonthly(){
    for (const id of selected) if (!rates.some(row=>row.id===id && isMonthlyTarget(row))) selected.delete(id);
    const detailRow = rates.find(row=>row.id===$('termDetails').dataset.row);
    if (detailRow && !isMonthlyTarget(detailRow)) { $('termDetails').innerHTML=''; delete $('termDetails').dataset.row; }
    const rows=visibleRows();
    $('manageCount').textContent=`${rows.length}개 상품 · 금리 아래에서 만기별 제안가능 상태를 선택하세요.`;
    $('manageRows').innerHTML=rows.length ? rows.map(row=>`<tr><td><input type="checkbox" data-select="${escapeHtml(row.id)}" aria-label="${escapeHtml(row.institution+' '+row.type)} 선택" ${selected.has(row.id)?'checked':''}></td><td class="manage-institution">${escapeHtml(row.institution)}</td><td class="manage-type">${escapeHtml(row.type)}</td>${maturities.map((term,i)=>`<td class="${row.terms[term] && changedTerm(row,term)?'term-changed':''}">${row.terms[term]?`<div class="manage-term"><div class="manage-rate">${displayRate(row,i)}</div>${statusButtons(row,term)}</div>${changedTerm(row,term)?'<span class="change-marker" title="미저장">미저장</span>':''}`:'<span class="missing">—</span>'}</td>`).join('')}<td><div class="row-actions" role="group" aria-label="${escapeHtml(row.institution+' '+row.type)} 전체 만기">${['확인','Y','N'].map(s=>`<button type="button" data-all-row="${escapeHtml(row.id)}" data-status="${s}">${s}</button>`).join('')}</div></td><td><button type="button" data-detail="${escapeHtml(row.id)}">상세</button></td></tr>`).join(''):'<tr><td colspan="9" class="management-empty">조건에 맞는 상품이 없습니다.</td></tr>';
    renderInstitutions();
    updateSelection();
  }
  $('manageRows').onchange=event=>{
    const target=event.target;
    if(target.dataset.select){ target.checked?selected.add(target.dataset.select):selected.delete(target.dataset.select); updateSelection(); }
    if(target.dataset.row){ const row=rates.find(r=>r.id===target.dataset.row); setRecord(row,target.dataset.term,'status',target.value); renderMonthly(); if($('termDetails').dataset.row===row.id) renderDetails(row); }
  };
  $('selectVisible').onchange=event=>{ visibleRows().forEach(row=>event.target.checked?selected.add(row.id):selected.delete(row.id)); renderMonthly(); };
  ['manageSearch','manageCategory','manageStatus'].forEach(id=>$(id).addEventListener(id==='manageSearch'?'input':'change',renderMonthly));
  $('bulkApply').onclick=()=>{
    const institutionMode=$('bulkScope').value==='institution';
    const rows=rates.filter(row=>isMonthlyTarget(row) && (institutionMode?row.institutionCode===$('bulkInstitution').value:selected.has(row.id)));
    const terms=$('bulkTerm').value==='all'?maturities:[Number($('bulkTerm').value)];
    bulkChange(rows,terms,$('bulkStatus').value,institutionMode?`${rows[0]?.institution || '기관'} 전체 (조회 필터와 무관)`:'선택 상품');
  };
  function bulkChange(rows,terms,value,label){
    const count=rows.reduce((sum,row)=>sum+terms.filter(t=>row.terms[t]).length,0);
    if(!count){$('monthlyMessage').textContent='변경할 상품과 만기를 선택하세요.';return;}
    const reason=$('bulkReason').value.trim();
    if(!confirm(`${importData.month} · ${label}\n${rows.length}개 상품의 ${count}개 만기를 ${value}(으)로 변경할까요?${reason?'\n공통 사유: '+reason:'\n기존 사유 유지'}\n물량·확인일·비고는 유지합니다. 저장·반영 전까지 조회 화면은 바뀌지 않습니다.`)) return;
    rows.forEach(row=>terms.forEach(term=>{if(row.terms[term]){setRecord(row,term,'status',value);if(reason)setRecord(row,term,'reason',reason);}}));
    renderMonthly();
    const detail=rates.find(r=>r.id===$('termDetails').dataset.row);
    if(detail)renderDetails(detail);
    $('monthlyMessage').textContent=`${label} · ${count}개 만기를 ${value}(으)로 변경했습니다. 저장·반영을 눌러 적용하세요.`;
  }
  $('bulkInstitution').onchange=renderInstitutionScope;
  $('bulkScope').onchange=()=>{
    const institutionMode=$('bulkScope').value==='institution';
    $('bulkInstitution').hidden=!institutionMode;
    $('institutionScope').hidden=!institutionMode;
    $('manageSelection').hidden=institutionMode;
    renderInstitutionScope();
  };
  function renderDetails(row){
    if (!row || !isMonthlyTarget(row)) return;
    const box=$('termDetails'); box.dataset.row=row.id;
    box.innerHTML=`<div class="details-title"><b>${escapeHtml(row.institution+' · '+row.type)}</b><button type="button" id="closeTermDetails">닫기</button></div><p class="management-help">물량·사유·비고는 내부 관리용이며 영업 금리표에 표시하지 않습니다.</p>${maturities.filter(t=>row.terms[t]).map(term=>{
      const info=record(row,term);
      return `<fieldset class="term-fields" data-term="${term}"><legend>${term/12}년</legend><div class="detail-status">제안가능${statusButtons(row,term)}</div><label>물량·한도 (단위 포함)<input data-field="amount" maxlength="100" value="${escapeHtml(info.amount)}" placeholder="예: 50억원"></label><label>불가 사유${select([...new Set(['','가용 물량 없음','한도 소진','일시 중단','내부 제외','기타',info.reason || ''])],info.reason,'data-field="reason"')}</label><label>마지막 확인일<input type="date" data-field="checkedAt" value="${escapeHtml(info.checkedAt)}"></label><label class="wide">내부 비고<input data-field="note" maxlength="500" value="${escapeHtml(info.note)}"></label></fieldset>`;
    }).join('')}`;
    $('closeTermDetails').onclick=()=>{box.innerHTML='';delete box.dataset.row;};
  }
  function statusClick(event){
    const target=event.target;
    const id=target.dataset.detail;if(id)renderDetails(rates.find(row=>row.id===id));
    if(target.dataset.allRow){
      const row=rates.find(r=>r.id===target.dataset.allRow && isMonthlyTarget(r));
      if(row)bulkChange([row],maturities,target.dataset.status,row.institution+' '+row.type+' 전체 만기');
    }
    if(target.dataset.row && ['확인','Y','N'].includes(target.dataset.status)){
      const row=rates.find(r=>r.id===target.dataset.row);
      setRecord(row,target.dataset.term,'status',target.dataset.status);
      renderMonthly();if(row && $('termDetails').dataset.row===row.id)renderDetails(row);
      const source=event.currentTarget || $('manageRows');
      const replacement=[...source.querySelectorAll('button[data-row]')].find(b=>b.dataset.row===target.dataset.row && b.dataset.term===target.dataset.term && b.dataset.status===target.dataset.status);
      if(replacement)replacement.focus({preventScroll:true});
    }
  }
  $('manageRows').onclick=statusClick;
  $('termDetails').onclick=statusClick;
  $('termDetails').oninput=event=>{
    const field=event.target.dataset.field;if(!field)return;
    const row=rates.find(r=>r.id===$('termDetails').dataset.row);
    setRecord(row,event.target.closest('fieldset').dataset.term,field,event.target.value);
    if(field==='status')renderMonthly();
  };
  let basicMode='institutions';
  function renderBasic(){
    const search=$('basicSearch').value.trim().toLocaleLowerCase();
    const institutions=[...new Map(rates.map(row=>[row.institutionCode,row])).values()];
    $('basicHead').innerHTML=basicMode==='institutions'?'<tr><th>기관코드</th><th>기관명</th><th>신용등급</th><th>사업자</th></tr>':'<tr><th>기관명</th><th>상품</th><th>라인업</th></tr>';
    const rows=(basicMode==='institutions'?institutions:rates).filter(row=>(row.institution+' '+(basicMode==='institutions'?'':row.type)).toLocaleLowerCase().includes(search));
    $('basicRows').innerHTML=rows.length?rows.map(row=>basicMode==='institutions'?`<tr><td>${escapeHtml(row.institutionCode)}</td><td>${escapeHtml(row.institution)}</td><td>${select(['',...ratingOrder],draft.institutions[row.institutionCode]?.grade,`data-institution="${escapeHtml(row.institutionCode)}" data-field="grade" aria-label="${escapeHtml(row.institution)} 신용등급"`)}</td><td>${select(['','Y','N'],draft.institutions[row.institutionCode]?.pension,`data-institution="${escapeHtml(row.institutionCode)}" data-field="pension" aria-label="${escapeHtml(row.institution)} 사업자"`)}</td></tr>`:`<tr><td>${escapeHtml(row.institution)}</td><td>${escapeHtml(row.type)}</td><td>${select(['','Y','N'],draft.products[row.id]?.lineup,`data-product="${escapeHtml(row.id)}" aria-label="${escapeHtml(row.institution+' '+row.type)} 라인업"`)}</td></tr>`).join(''):`<tr><td colspan="4" class="management-empty">검색 결과가 없습니다.</td></tr>`;
  }
  $('basicRows').onchange=event=>{
    const target=event.target;
    if(target.dataset.institution){const item=draft.institutions[target.dataset.institution] ||= {};item[target.dataset.field]=target.value;}
    if(target.dataset.product){draft.products[target.dataset.product]={lineup:target.value};}
    updateDirty();renderMonthly();
  };
  ['Institutions','Lineups'].forEach((name,i)=>$('show'+name).onclick=()=>{basicMode=i?'lineups':'institutions';$('showInstitutions').setAttribute('aria-pressed',String(!i));$('showLineups').setAttribute('aria-pressed',String(!!i));renderBasic();});
  $('basicSearch').oninput=renderBasic;
  function different(a,b){return JSON.stringify(a)!==JSON.stringify(b);}
  function updateDirty(){
    const keys=new Set([...Object.keys(monthRecords()),...Object.keys(saved.months[importData.month] || {})]);
    const count=[...keys].filter(key=>different(monthRecords()[key],saved.months[importData.month]?.[key])).length;
    $('monthlyDirty').textContent=count?`미저장 변경 ${count}건`:'변경사항 없음';
    $('cancelMonthly').disabled=!count;
    $('basicDirty').textContent=different(draft.institutions,saved.institutions)||different(draft.products,saved.products)?'미반영 변경사항 있음':'변경사항 없음';
  }
  function save(kind){
    const next=clone(saved);
    if(kind==='monthly')next.months=clone(draft.months);
    else {next.institutions=clone(draft.institutions);next.products=clone(draft.products);}
    next.updatedAt=new Date().toISOString();
    try{localStorage.setItem(storageKey,JSON.stringify(next));}
    catch{$(kind==='monthly'?'monthlyMessage':'basicMessage').textContent='저장하지 못했습니다. 브라우저 저장 권한이나 여유 공간을 확인하세요. 변경사항은 화면에 유지됩니다.';return;}
    saved=next;applySettings(saved);render();updateDirty();renderMonthly();
    $(kind==='monthly'?'monthlyMessage':'basicMessage').textContent='저장했습니다. 금리표 조회에 반영되었습니다. 이 브라우저에서만 유지됩니다.';
  }
  $('saveMonthly').onclick=()=>save('monthly');$('saveBasic').onclick=()=>save('basic');
  $('cancelMonthly').onclick=()=>{
    if(!confirm(`${importData.month}의 미저장 변경사항을 모두 취소할까요?`))return;
    if(saved.months[importData.month])draft.months[importData.month]=clone(saved.months[importData.month]);
    else delete draft.months[importData.month];
    $('termDetails').innerHTML='';delete $('termDetails').dataset.row;
    renderMonthly();updateDirty();$('monthlyMessage').textContent='이번 달 미저장 변경사항을 취소했습니다.';
  };
  $('salesPreview').textContent='반영된 금리표 확인';
  $('salesPreview').onclick=()=>{switchTab('sales');};
  window.addEventListener('beforeunload',event=>{if(different(draft.months,saved.months)||different(draft.institutions,saved.institutions)||different(draft.products,saved.products)){event.preventDefault();event.returnValue='';}});
  if(storageWarning)$('monthlyMessage').textContent=storageWarning;
  window.RateManagement={
    switchTab,
    hasUnsaved:()=>different(draft.months,saved.months)||different(draft.institutions,saved.institutions)||different(draft.products,saved.products),
    applySource(next){
      activateRateSource(next);applySettings(saved);selected.clear();
      $('termDetails').innerHTML='';delete $('termDetails').dataset.row;
      const monthSelect=admin.querySelector('.management-period select');
      monthSelect.innerHTML=`<option>${escapeHtml(next.month)}</option>`;
      $('managementPeriodHelp').textContent=`적용기간 ${next.start} ~ ${next.end} · 기본정보의 라인업 Y 상품만 관리합니다. 새 월의 제안가능 상태는 확인부터 시작합니다.`;
      renderMonthly();renderBasic();updateDirty();render();
    }
  };
  renderMonthly();renderBasic();updateDirty();render();
})();

// Independent notice content: never write the rate or management storage keys.
(() => {
  const key='db-rate-notice-v1';
  const text=document.getElementById('noticeText');
  const banner=document.getElementById('noticeBanner');
  const message=document.getElementById('noticeMessage');
  let saved='';
  try { saved=localStorage.getItem(key) || ''; }
  catch { message.textContent='저장된 공지를 읽지 못했습니다. 브라우저 저장 권한을 확인해주세요.'; }
  text.value=saved;
  const dirty=()=>text.value!==saved;
  function updateDirty(){
    document.getElementById('noticeDirty').textContent=dirty()?'미저장 변경사항 있음':'변경사항 없음';
    document.getElementById('noticeCancel').disabled=!dirty();
  }
  function renderNotice(){
    document.getElementById('noticeBannerText').textContent=saved;
    banner.hidden=!saved.trim();
  }
  text.addEventListener('input',()=>{message.textContent='';updateDirty();});
  document.getElementById('noticeSave').onclick=()=>{
    const next=text.value.trim();
    try { localStorage.setItem(key,next); }
    catch {message.textContent='공지를 저장하지 못했습니다. 브라우저 저장 권한이나 여유 공간을 확인한 후 다시 저장해주세요. 작성 내용은 유지됩니다.';return;}
    saved=next;text.value=saved;renderNotice();updateDirty();
    message.textContent=saved?'공지를 저장했습니다. 공지사항 배너에 반영되었습니다.':'빈 공지를 저장했습니다. 공지사항 배너를 숨겼습니다.';
  };
  document.getElementById('noticeCancel').onclick=()=>{text.value=saved;updateDirty();message.textContent='마지막 저장 내용으로 되돌렸습니다.';};
  window.addEventListener('beforeunload',event=>{if(dirty()){event.preventDefault();event.returnValue='';}});
  window.RateNotice={hasUnsaved:dirty};
  renderNotice();updateDirty();
})();
