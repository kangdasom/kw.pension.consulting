(() => {
  'use strict';
  const api=window.NoticePublisher;
  const $=id=>document.getElementById(id);
  const text=$('noticeText'), message=$('noticeMessage'), key=$('noticeCredential');
  let baseline=null, published=null, pending=null, busy=false, timer=null, attempts=0;
  let legacy='';
  try { legacy=localStorage.getItem('db-rate-notice-v1') || ''; } catch { /* Optional migration only. */ }
  $('noticeLegacy').hidden=!legacy;
  const dirty=()=>baseline ? text.value!==baseline.text : Boolean(text.value);
  function update() {
    $('noticeDirty').textContent=busy?'저장 요청 중':pending?'배포 확인 중':dirty()?'미저장 변경사항 있음':'변경사항 없음';
    $('noticeSave').disabled=busy || !baseline || Boolean(pending);
    $('noticeCancel').disabled=busy || !dirty();
    $('noticeLatest').disabled=busy || Boolean(pending);
    $('noticeLegacy').disabled=busy || Boolean(pending) || !baseline;
    text.disabled=busy || !baseline;
    key.disabled=busy;
  }
  function render(notice) {
    published=notice;
    $('noticeBannerText').textContent=notice.text;
    $('noticeBanner').hidden=!notice.text.trim();
  }
  async function refresh() {
    try {
      const notice=await api.deployed();
      render(notice);
      if (!baseline || (!dirty() && !pending && !busy)) {baseline=notice;text.value=notice.text;}
      return notice;
    } catch { return null; }
    finally {update();}
  }
  async function checkDeployment() {
    if (!pending) return;
    const target=pending;
    const notice=await refresh();
    if (pending!==target) return;
    if (notice && notice.revision===target.revision) {
      pending=null;
      message.textContent='배포가 완료되었습니다. 다른 기기에서도 접속하거나 새로고침하면 같은 공지가 표시됩니다.';
      update();return;
    }
    if (++attempts>=120) {
      pending=null;
      message.textContent='GitHub 저장은 완료했으나 배포 완료를 확인하지 못했습니다. 배포 내역에서 실패·승인 대기를 확인해주세요. 같은 내용으로 다시 저장하면 배포 상태를 다시 확인합니다.';
      update();return;
    }
    timer=setTimeout(checkDeployment,5000);
  }
  text.addEventListener('input',update);
  $('noticeCancel').onclick=()=>{text.value=baseline ? baseline.text : '';update();};
  $('noticeLegacy').onclick=()=>{text.value=legacy.slice(0,3000);message.textContent='이전 브라우저 공지를 불러왔습니다. 저장·배포를 눌러야 전체 방문자에게 게시됩니다.';update();};
  $('noticeLatest').onclick=async()=>{
    if (dirty() && !confirm('작성 중인 내용을 최신 게시본으로 바꿀까요?')) return;
    busy=true;update();
    try {baseline=(await api.latest()).notice;text.value=baseline.text;message.textContent='최신 GitHub 저장 내용을 불러왔습니다. 실제 배포 내용은 공지사항에서 확인해주세요.';}
    catch(error) {message.textContent=error.message;}
    finally {busy=false;update();}
  };
  $('noticeSave').onclick=async()=>{
    if (busy || pending || !baseline) return;
    if (location.origin!==new URL(api.site).origin || !location.pathname.startsWith('/kw.pension.consulting/')) {
      message.textContent='공지 게시는 공식 HTTPS 사이트에서 실행해주세요: '+api.site;return;
    }
    if (!key.value.trim()) {
      $('noticeCredential').closest('details').open=true;
      message.textContent='게시 인증 설정에 GitHub 게시 인증키를 입력해주세요.';key.focus();return;
    }
    let credential=key.value.trim();key.value='';
    busy=true;message.textContent='GitHub에 공지를 저장하고 있습니다…';update();
    try {
      const next=await api.publish(text.value.trim(),baseline,credential);
      baseline=next;text.value=next.text;
      if (published && published.revision===next.revision) message.textContent='이미 같은 공지가 배포되어 있습니다.';
      else {pending=next;attempts=0;message.textContent='GitHub에 저장했습니다. 자동 배포가 끝나면 전체 방문자에게 반영됩니다. 배포 완료를 확인 중입니다…';checkDeployment();}
    } catch(error) {message.textContent=error.message;}
    finally {credential='';busy=false;update();}
  };
  window.addEventListener('beforeunload',event=>{if(dirty() || busy){event.preventDefault();event.returnValue='';}});
  window.addEventListener('pagehide',()=>{key.value='';clearTimeout(timer);});
  window.addEventListener('pageshow',()=>{key.value='';if(pending) checkDeployment();});
  window.addEventListener('focus',()=>{if(!busy && !pending)refresh();});
  $('infoButton').addEventListener('click',()=>{if(!busy && !pending)refresh();});
  window.RateNotice={hasUnsaved:()=>dirty() || busy};
  update();refresh().then(notice=>{if(!notice)message.textContent='게시된 공지를 불러오지 못했습니다. 새로고침하거나 통신 상태를 확인해주세요.';});
})();
