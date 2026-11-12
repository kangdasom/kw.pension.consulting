(() => {
  'use strict';
  const api=window.NoticePublisher,$=id=>document.getElementById(id);
  const text=$('noticeText'),message=$('noticeMessage');
  const draftKey='db-rate-notice-draft-v2';
  let baseline=null,published=null,pending=null,busy=false,timer=null,attempts=0,checkId=0,legacy='',draft=null;
  try{legacy=localStorage.getItem('db-rate-notice-v1')||'';draft=JSON.parse(sessionStorage.getItem(draftKey)||'null');}catch{}
  $('noticeLegacy').hidden=!legacy;
  const dirty=()=>baseline ? text.value!==baseline.text : Boolean(text.value);
  function keepDraft(){try{if(dirty()||pending)sessionStorage.setItem(draftKey,JSON.stringify({text:text.value,pending}));else sessionStorage.removeItem(draftKey);}catch{}}
  function update(){
    $('noticeDirty').textContent=pending?'GitHub 제출·배포 확인 중':dirty()?'미저장 변경사항 있음':'변경사항 없음';
    $('noticeSave').disabled=busy||!baseline||Boolean(pending);
    $('noticeCancel').disabled=busy||!dirty()||Boolean(pending);
    $('noticeLatest').disabled=busy||Boolean(pending);
    $('noticeLegacy').disabled=busy||Boolean(pending)||!baseline;
    text.disabled=busy||!baseline||Boolean(pending);
  }
  async function refresh(){
    try{
      const notice=await api.deployed();published=notice;
      $('noticeBannerText').textContent=notice.text;$('noticeBanner').hidden=!notice.text.trim();
      if(!baseline||(!dirty()&&!pending&&!busy)){baseline=notice;text.value=notice.text;}
      return notice;
    }catch{return null;}finally{update();}
  }
  function showRequest(){
    $('noticeRequest').hidden=!pending;
    if(!pending)return;
    $('noticeSubmit').href=pending.url;
    $('noticeCopyRequest').hidden=!pending.needsPaste;
    $('noticeRequestBody').hidden=!pending.needsPaste;
    $('noticeRequestBody').value=pending.body;
    $('noticeRequestHelp').textContent=pending.needsPaste?'긴 공지입니다. 게시 요청을 복사한 뒤 GitHub 본문에 붙여넣고 제출해주세요. 제목과 요청 내용은 그대로 사용하세요.':'열린 GitHub 화면에서 kangdasom 계정으로 로그인하고 제목·본문을 그대로 제출해주세요. 제출 전에는 게시되지 않습니다.';
  }
  async function checkDeployment(){
    clearTimeout(timer);if(!pending)return;
    const id=++checkId,target=pending,notice=await refresh();if(id!==checkId||pending!==target)return;
    if(notice&&notice.revision===target.notice.revision){
      baseline=notice;text.value=notice.text;pending=null;showRequest();keepDraft();
      message.textContent='배포가 완료되었습니다. 다른 기기에서도 접속하거나 새로고침하면 같은 공지가 표시됩니다.';update();return;
    }
    if(++attempts>=120){
      message.textContent='아직 배포 완료를 확인하지 못했습니다. GitHub 요청 제출 여부와 게시·배포 내역을 확인해주세요. 초안은 유지됩니다.';update();return;
    }
    timer=setTimeout(checkDeployment,5000);
  }
  text.addEventListener('input',()=>{keepDraft();update();});
  $('noticeCancel').onclick=()=>{text.value=baseline?.text||'';keepDraft();update();};
  $('noticeLegacy').onclick=()=>{text.value=legacy.slice(0,3000);keepDraft();message.textContent='이전 공지를 불러왔습니다. GitHub에서 게시 요청을 제출해야 전체 방문자에게 반영됩니다.';update();};
  $('noticeLatest').onclick=async()=>{
    if(dirty()&&!confirm('작성 중인 내용을 최신 게시본으로 바꿀까요?'))return;
    busy=true;update();try{baseline=(await api.latest()).notice;text.value=baseline.text;keepDraft();message.textContent='최신 GitHub 저장 내용을 불러왔습니다.';}catch(error){message.textContent=error.message;}finally{busy=false;update();}
  };
  $('noticeSave').onclick=()=>{
    if(busy||pending||!baseline)return;
    if(location.origin!==new URL(api.site).origin||!location.pathname.startsWith('/kw.pension.consulting/')){message.textContent='공식 HTTPS 사이트에서 게시해주세요: '+api.site;return;}
    if(published&&text.value.trim()===published.text){message.textContent='이미 같은 공지가 배포되어 있습니다.';return;}
    try{
      pending=api.prepare(text.value,baseline);attempts=0;showRequest();keepDraft();update();
      message.textContent='GitHub 게시 요청을 준비했습니다. 열린 화면에서 제출하면 자동 배포됩니다. kangdasom 계정의 요청만 반영됩니다.';
      if(!pending.needsPaste)$('noticeSubmit').click();
      checkDeployment();
    }catch(error){message.textContent=error.message;}
  };
  $('noticeCopyRequest').onclick=async()=>{
    if(!pending)return;
    try{await navigator.clipboard.writeText(pending.body);message.textContent='게시 요청을 복사했습니다. GitHub 게시 요청 열기를 눌러 본문에 붙여넣고 제출해주세요.';}catch{$('noticeRequestBody').focus();$('noticeRequestBody').select();message.textContent='자동 복사가 제한되었습니다. 선택한 게시 요청을 직접 복사해주세요.';}
  };
  $('noticeStop').onclick=()=>{clearTimeout(timer);pending=null;showRequest();keepDraft();update();message.textContent='배포 확인을 중단했습니다. 이미 GitHub에 제출한 요청은 계속 처리됩니다. 작성 내용은 유지됩니다.';};
  window.addEventListener('beforeunload',event=>{if(dirty()||busy){event.preventDefault();event.returnValue='';}});
  window.addEventListener('pagehide',()=>{keepDraft();clearTimeout(timer);});
  window.addEventListener('pageshow',()=>{if(pending)checkDeployment();});
  window.addEventListener('focus',()=>{if(pending){attempts=0;checkDeployment();}else if(!busy)refresh();});
  $('infoButton').addEventListener('click',()=>{if(!busy&&!pending)refresh();});
  window.RateNotice={hasUnsaved:()=>dirty()||busy};
  update();refresh().then(notice=>{
    if(!notice){message.textContent='게시된 공지를 읽지 못했습니다. 새로고침하거나 통신 상태를 확인해주세요.';return;}
    if(draft&&typeof draft.text==='string'&&draft.text.length<=3000){
      text.value=draft.text;
      // Restore only public drafts. Never navigate to a URL read from browser storage.
      if(draft.pending?.body){try{const payload=JSON.parse(draft.pending.body);const restored=api.prepare(payload.notice.text,{text:'',revision:payload.baseRevision});restored.notice=api.validate(payload.notice);restored.body=draft.pending.body;const url=new URL(restored.url);if(!restored.needsPaste)url.searchParams.set('body',restored.body);restored.url=url.href;pending=restored;showRequest();checkDeployment();}catch{}}
      message.textContent='이 탭의 작성 중인 공지를 복원했습니다.';
    }
    keepDraft();update();
  });
})();
