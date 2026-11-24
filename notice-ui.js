(() => {
  'use strict';
  const api=window.NoticePublisher,$=id=>document.getElementById(id);
  const text=$('noticeText'),message=$('noticeMessage');
  const labels={DB:'DB',DC:'DC',IRP:'개인IRP'};
  function showBanner(notice,plan){
    $('noticeBannerText').textContent=notice.text;
    $('noticeBanner').hidden=!notice.text.trim();
    $('noticeBanner').querySelector('strong').textContent='관리자 공지사항';
  }
  if(!text){
    const plan=window.RateScheme?.id||'DB';
    const refreshPublic=async()=>{try{showBanner(await api.deployed(plan),plan);}catch{}};
    $('infoButton').addEventListener('click',refreshPublic);
    window.addEventListener('focus',refreshPublic);
    window.RateNotice={hasUnsaved:()=>false};refreshPublic();return;
  }
  const states={};
  let plan='DB',timer=null,checkId=0,legacy='';
  const draftKey=id=>id==='DB'?'db-rate-notice-draft-v2':'db-rate-notice-draft-v2-'+id.toLowerCase();
  try{legacy=localStorage.getItem('db-rate-notice-v1')||'';}catch{}
  for(const id of Object.keys(labels)){
    let draft=null;
    try{draft=JSON.parse(sessionStorage.getItem(draftKey(id))||'null');}catch{}
    const state=states[id]={baseline:null,published:null,pending:null,busy:false,attempts:0,value:'',restored:false,note:''};
    if(draft&&typeof draft.text==='string'&&draft.text.length<=3000){
      state.value=draft.text;state.restored=true;state.note='이 탭의 작성 중인 공지를 복원했습니다.';
      // Rebuild the trusted GitHub URL; never navigate to a stored URL.
      if(draft.pending?.body){try{
        const payload=JSON.parse(draft.pending.body);
        if(api.requestPlan({issue:{body:draft.pending.body}})!==id)throw Error('제도 불일치');
        const restored=api.prepare(payload.notice.text,{text:'',revision:payload.baseRevision},id);
        restored.notice=api.validate(payload.notice);restored.body=draft.pending.body;
        const url=new URL(restored.url);if(!restored.needsPaste)url.searchParams.set('body',restored.body);
        restored.url=url.href;state.pending=restored;
      }catch{}}
    }
  }
  const active=()=>states[plan];
  const dirty=s=>s.baseline?s.value!==s.baseline.text:s.restored||Boolean(s.value);
  function keepDraft(id=plan){
    const s=states[id];
    try{if(dirty(s)||s.pending)sessionStorage.setItem(draftKey(id),JSON.stringify({text:s.value,pending:s.pending}));else sessionStorage.removeItem(draftKey(id));}catch{}
  }
  function update(){
    const s=active();
    $('noticeDirty').textContent=s.pending?'GitHub 제출·배포 확인 중':dirty(s)?'미저장 변경사항 있음':'변경사항 없음';
    $('noticeSave').disabled=s.busy||!s.baseline||Boolean(s.pending);
    $('noticeCancel').disabled=s.busy||!dirty(s)||Boolean(s.pending);
    $('noticeLatest').disabled=s.busy||Boolean(s.pending);
    $('noticeLegacy').hidden=plan!=='DB'||!legacy;
    $('noticeLegacy').disabled=s.busy||Boolean(s.pending)||!s.baseline;
    text.disabled=s.busy||!s.baseline||Boolean(s.pending);
    $('noticePlan').disabled=s.busy;
    message.textContent=s.note;
  }
  function showRequest(){
    const pending=active().pending;
    $('noticeRequest').hidden=!pending;
    if(!pending)return;
    $('noticeSubmit').href=pending.url;
    $('noticeCopyRequest').hidden=!pending.needsPaste;
    $('noticeRequestBody').hidden=!pending.needsPaste;
    $('noticeRequestBody').value=pending.body;
    $('noticeRequestHelp').textContent=labels[plan]+' 공지 · '+(pending.needsPaste?'긴 공지입니다. 게시 요청을 복사한 뒤 GitHub 본문에 붙여넣고 제출해주세요. 제목과 요청 내용은 그대로 사용하세요.':'열린 GitHub 화면에서 kangdasom 계정으로 로그인하고 제목·본문을 그대로 제출해주세요. 제출 전에는 게시되지 않습니다.');
  }
  async function refresh(id=plan){
    const s=states[id];
    try{
      const notice=await api.deployed(id);s.published=notice;
      if(!s.baseline||(!dirty(s)&&!s.pending&&!s.busy)){
        s.baseline=notice;
        if(!s.restored)s.value=notice.text;
        s.restored=false;
      }
      if(plan===id){text.value=s.value;showBanner(notice,id);update();}
      return notice;
    }catch{
      if(!s.baseline)s.note='게시된 공지를 읽지 못했습니다. 최신 게시본을 불러오거나 통신 상태를 확인해주세요.';
      if(plan===id)update();return null;
    }
  }
  async function checkDeployment(){
    clearTimeout(timer);
    const currentPlan=plan,s=active(),target=s.pending;
    if(!target)return;
    const id=++checkId,notice=await refresh(currentPlan);
    if(id!==checkId||currentPlan!==plan||s.pending!==target)return;
    if(notice&&notice.revision===target.notice.revision){
      s.baseline=notice;s.value=notice.text;text.value=s.value;s.pending=null;
      s.note=labels[plan]+' 공지 배포가 완료되었습니다. 다른 기기에서도 접속하거나 새로고침하면 같은 공지가 표시됩니다.';
      showRequest();keepDraft();update();return;
    }
    if(++s.attempts>=120){s.note='아직 배포 완료를 확인하지 못했습니다. GitHub 요청 제출 여부와 게시·배포 내역을 확인해주세요. 초안은 유지됩니다.';update();return;}
    timer=setTimeout(checkDeployment,5000);
  }
  $('noticePlan').addEventListener('change',()=>{
    keepDraft();clearTimeout(timer);++checkId;
    plan=$('noticePlan').value;text.value=active().value;
    showBanner(active().published||{text:''},plan);showRequest();update();
    if(active().pending){active().attempts=0;checkDeployment();}else refresh();
  });
  text.addEventListener('input',()=>{active().value=text.value;keepDraft();update();});
  $('noticeCancel').onclick=()=>{const s=active();s.value=s.baseline?.text||'';text.value=s.value;keepDraft();update();};
  $('noticeLegacy').onclick=()=>{const s=active();s.value=legacy.slice(0,3000);text.value=s.value;keepDraft();s.note='이전 DB 공지를 불러왔습니다. GitHub에서 게시 요청을 제출해야 전체 방문자에게 반영됩니다.';update();};
  $('noticeLatest').onclick=async()=>{
    const s=active(),id=plan;
    if(dirty(s)&&!confirm('작성 중인 내용을 최신 게시본으로 바꿀까요?'))return;
    s.busy=true;update();
    try{s.baseline=(await api.latest(id)).notice;s.value=s.baseline.text;s.restored=false;text.value=s.value;keepDraft(id);s.note='최신 '+labels[id]+' GitHub 저장 내용을 불러왔습니다.';}
    catch(error){s.note=error.message;}finally{s.busy=false;update();}
  };
  $('noticeSave').onclick=()=>{
    const s=active();
    if(s.busy||s.pending||!s.baseline)return;
    if(location.origin!==new URL(api.site).origin||!location.pathname.startsWith('/kw.pension.consulting/')){s.note='공식 HTTPS 사이트에서 게시해주세요: '+api.site;update();return;}
    if(s.published&&s.value.trim()===s.published.text){s.note='이미 같은 공지가 배포되어 있습니다.';update();return;}
    try{
      s.pending=api.prepare(s.value,s.baseline,plan);s.attempts=0;showRequest();keepDraft();
      s.note=labels[plan]+' GitHub 게시 요청을 준비했습니다. 열린 화면에서 제출하면 자동 배포됩니다. kangdasom 계정의 요청만 반영됩니다.';update();
      if(!s.pending.needsPaste)$('noticeSubmit').click();
      checkDeployment();
    }catch(error){s.note=error.message;update();}
  };
  $('noticeCopyRequest').onclick=async()=>{
    const s=active();if(!s.pending)return;
    try{await navigator.clipboard.writeText(s.pending.body);s.note='게시 요청을 복사했습니다. GitHub 게시 요청 열기를 눌러 본문에 붙여넣고 제출해주세요.';}
    catch{$('noticeRequestBody').focus();$('noticeRequestBody').select();s.note='자동 복사가 제한되었습니다. 선택한 게시 요청을 직접 복사해주세요.';}
    if(s===active())update();
  };
  $('noticeStop').onclick=()=>{
    clearTimeout(timer);++checkId;active().pending=null;showRequest();keepDraft();
    active().note='배포 확인을 중단했습니다. 이미 GitHub에 제출한 요청은 계속 처리됩니다. 작성 내용은 유지됩니다.';update();
  };
  const hasUnsaved=()=>Object.values(states).some(s=>dirty(s)||s.busy);
  window.addEventListener('beforeunload',event=>{if(hasUnsaved()){event.preventDefault();event.returnValue='';}});
  window.addEventListener('pagehide',()=>{for(const id of Object.keys(states))keepDraft(id);clearTimeout(timer);++checkId;});
  window.addEventListener('pageshow',()=>{if(active().pending)checkDeployment();});
  window.addEventListener('focus',()=>{if(active().pending){active().attempts=0;checkDeployment();}else if(!active().busy)refresh();});
  $('infoButton').addEventListener('click',()=>{if(!active().busy&&!active().pending)refresh();});
  window.RateNotice={hasUnsaved};
  text.value=active().value;showRequest();update();
  if(active().pending)checkDeployment();else refresh();
})();
