/* Local planning UI only. These records never authorize access or create accounts. */
(() => {
  'use strict';
  const panel = document.getElementById('panel-users');
  if (!panel) return;
  const key = 'db-rate-user-drafts-v1';
  const roles = {sales:'영업담당자', product:'상품담당자'};
  let records = [], editing = null, loadFailed = false;
  try {
    const data = JSON.parse(localStorage.getItem(key) || '[]');
    if (!Array.isArray(data) || data.some(r => !r || typeof r.id !== 'string' ||
      typeof r.name !== 'string' || typeof r.email !== 'string' ||
      !Object.hasOwn(roles,r.role) || !['pending','suspended'].includes(r.state)) ||
      new Set(data.map(r=>r.email.toLowerCase())).size !== data.length ||
      new Set(data.map(r=>r.id)).size !== data.length) throw new Error('Invalid drafts');
    records = data;
  } catch { loadFailed = true; }
  panel.innerHTML = `
    <div class="management-heading"><h1>사용자관리</h1></div>
    <p class="management-notice">현재 등록 정보는 이 브라우저에만 저장되며 실제 로그인과 연결되지 않습니다. 초대 링크 발급과 접근 제한은 연결 후 사용할 수 있습니다.</p>
    <div class="user-tools"><input id="userSearch" type="search" aria-label="이름·이메일 검색" placeholder="이름·이메일 검색">
      <select id="userRoleFilter" aria-label="권한 필터"><option value="">전체 권한</option><option value="sales">영업담당자</option><option value="product">상품담당자</option></select>
      <select id="userStateFilter" aria-label="상태 필터"><option value="">전체 상태</option><option value="pending">초대대기</option><option value="active">이용중</option><option value="suspended">이용중지</option></select>
      <button type="button" id="userAdd" class="management-primary">사용자 등록</button></div>
    <form id="userForm" class="user-form" hidden>
      <h2 id="userFormTitle">사용자 등록</h2>
      <div class="user-fields"><label>이름<input id="userName" required maxlength="50" autocomplete="off"></label>
      <label>아이디 · 회사 이메일<input id="userEmail" type="email" required maxlength="254" autocomplete="off" aria-describedby="userEmailHelp"></label>
      <label>권한<select id="userRole"><option value="sales">영업담당자</option><option value="product">상품담당자</option></select></label></div>
      <p id="userEmailHelp" class="management-help">회사 이메일을 아이디로 사용합니다. 초대 링크는 본인을 확인한 연락처로 개별 전달해주세요.</p>
      <p id="userRoleHelp" class="management-help"></p>
      <div class="user-form-actions"><button type="button" id="userCancel">취소</button><button type="submit" id="userSubmit" class="management-primary">등록</button></div>
    </form>
    <p id="userMessage" class="management-message" role="status" aria-live="polite"></p>
    <div class="user-table-meta"><span id="userCount"></span></div>
    <div class="management-scroll"><table class="management-table user-table"><thead><tr><th>이름</th><th>아이디 · 회사 이메일</th><th>권한</th><th>상태</th><th>최근 로그인</th><th>관리</th></tr></thead><tbody id="userRows"></tbody></table></div>`;
  const $ = id => document.getElementById(id);
  const form = $('userForm');
  function message(value) { $('userMessage').textContent=value; }
  function save(next) {
    if (loadFailed) { message('기존 등록 정보를 읽지 못해 저장을 중단했습니다. 브라우저 저장소를 확인한 뒤 새로고침해주세요.'); return false; }
    try { localStorage.setItem(key,JSON.stringify(next)); }
    catch { message('등록 정보를 저장하지 못했습니다. 입력 내용은 유지됩니다. 저장 공간·권한을 확인하고 다시 시도해주세요.'); return false; }
    records=next; render(); return true;
  }
  function roleHelp() {
    $('userRoleHelp').textContent=$('userRole').value==='product'
      ? '상품담당자: 금리 조회·저장, 금리·한도·기관정보 관리, 사용자 관리'
      : '영업담당자: 금리 조회·필터·정렬·이미지 저장';
  }
  function closeForm() { form.hidden=true; editing=null; form.reset(); $('userAdd').focus(); }
  function openForm(record) {
    if (!form.hidden && !window.confirm('작성 중인 내용을 닫고 선택한 내용을 열까요?')) return;
    editing=record?.id || null; form.reset();
    $('userFormTitle').textContent=record ? '사용자 정보 수정' : '사용자 등록';
    $('userSubmit').textContent=record ? '저장' : '등록';
    $('userName').value=record?.name || ''; $('userEmail').value=record?.email || '';
    $('userRole').value=record?.role || 'sales'; roleHelp();
    form.hidden=false; message(''); $('userName').focus();
  }
  function render() {
    const query=$('userSearch').value.trim().toLowerCase();
    const visible=records.filter(r=>(r.name+' '+r.email).toLowerCase().includes(query) &&
      (!$('userRoleFilter').value || r.role===$('userRoleFilter').value) &&
      (!$('userStateFilter').value || r.state===$('userStateFilter').value));
    $('userCount').textContent=`전체 ${records.length}명 · 조회 ${visible.length}명`;
    const body=$('userRows'); body.replaceChildren();
    if (!visible.length) {
      const tr=document.createElement('tr'), td=document.createElement('td'); td.colSpan=6;
      td.textContent=records.length ? '조건에 맞는 사용자가 없습니다.' : '등록된 사용자가 없습니다. 사용자 등록 버튼으로 추가해주세요.';
      tr.append(td); body.append(tr);
    }
    for (const record of visible) {
      const tr=document.createElement('tr');
      for (const value of [record.name,record.email,roles[record.role],record.state==='pending'?'초대대기':'이용중지','—']) {
        const td=document.createElement('td'); td.textContent=value; tr.append(td);
      }
      const actions=document.createElement('td'); actions.className='user-actions';
      const button=(label,action)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=action;actions.append(b);return b;};
      button('수정',()=>openForm(record));
      button(record.state==='pending'?'이용 중지':'이용 재개',()=>{
        if (!form.hidden) { message('작성 중인 내용을 먼저 저장하거나 취소해주세요.'); return; }
        if (!window.confirm(`${record.name}님의 상태를 ${record.state==='pending'?'이용중지':'초대대기'}로 변경할까요?`)) return;
        if (save(records.map(r=>r.id===record.id?{...r,state:r.state==='pending'?'suspended':'pending'}:r))) message('상태를 저장했습니다.');
      });
      const invite=button('초대 링크 발급',()=>{}); invite.disabled=true; invite.title='인증 서비스 연결 후 사용할 수 있습니다.';
      button('삭제',()=>{
        if (!form.hidden) { message('작성 중인 내용을 먼저 저장하거나 취소해주세요.'); return; }
        if (window.confirm(`${record.name}님의 등록 정보를 삭제할까요?`) && save(records.filter(r=>r.id!==record.id))) message('등록 정보를 삭제했습니다.');
      });
      tr.append(actions);body.append(tr);
    }
  }
  $('userAdd').onclick=()=>openForm();
  $('userCancel').onclick=()=>{closeForm();message('편집을 취소했습니다.');};
  $('userRole').onchange=roleHelp;
  for (const id of ['userSearch','userRoleFilter','userStateFilter']) $(id).addEventListener('input',render);
  form.addEventListener('submit',event=>{
    event.preventDefault(); if (!form.reportValidity()) return;
    const name=$('userName').value.trim(), email=$('userEmail').value.trim().toLowerCase(), role=$('userRole').value;
    if (!name) { message('이름을 입력해주세요.'); $('userName').focus(); return; }
    if (records.some(r=>r.id!==editing && r.email.toLowerCase()===email)) { message('이미 등록된 이메일입니다.'); $('userEmail').focus(); return; }
    const existing=records.find(r=>r.id===editing);
    // Draft identifier only; never an invitation code or authentication token.
    const record={id:existing?.id || `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`,name,email,role,state:existing?.state || 'pending'};
    const next=existing?records.map(r=>r.id===editing?record:r):[...records,record];
    if (save(next)) { closeForm(); message('등록 정보를 저장했습니다.'); }
  });
  window.addEventListener('beforeunload',event=>{
    if (!form.hidden) { event.preventDefault();event.returnValue=''; }
  });
  render();
  if (loadFailed) message('기존 사용자 정보를 읽을 수 없습니다. 원본을 보존하기 위해 저장을 중단했습니다.');
})();
