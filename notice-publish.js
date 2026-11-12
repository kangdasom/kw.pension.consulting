// Public notice data only. Credentials are supplied per request, never persisted.
(function (root) {
  'use strict';
  const repository='kangdasom/kw.pension.consulting';
  const endpoint=`https://api.github.com/repos/${repository}/contents/notice.json`;
  const site='https://kangdasom.github.io/kw.pension.consulting/';
  function validate(value) {
    if (!value || typeof value.text!=='string' || value.text.length>3000 ||
        typeof value.revision!=='string' || !value.revision || value.revision.length>100) {
      throw new Error('공지 파일 형식이 올바르지 않습니다.');
    }
    return {text:value.text,revision:value.revision,updatedAt:value.updatedAt || null};
  }
  const encode=value=>btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value,null,2)+'\n')));
  const decode=value=>JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(value.replace(/\s/g,'')),c=>c.charCodeAt(0))));
  async function request(url,options={}) {
    try { return await fetch(url,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(20000),...options}); }
    catch { throw new Error('통신을 완료하지 못했습니다. 저장 요청 후라면 최신 게시본과 배포 상태를 확인한 뒤 재시도해주세요.'); }
  }
  async function deployed() {
    const response=await request(new URL(`notice.json?t=${Date.now()}`,site));
    if (!response.ok) throw new Error('게시된 공지를 불러오지 못했습니다. 잠시 후 다시 확인해주세요.');
    return validate(await response.json());
  }
  async function latest(credential) {
    const headers={Accept:'application/vnd.github+json'};
    if (credential) headers.Authorization=`Bearer ${credential}`;
    const response=await request(`${endpoint}?ref=main&t=${Date.now()}`,{headers});
    if (!response.ok) throw new Error(response.status===401?'GitHub 게시 인증키가 올바르지 않거나 만료되었습니다.':'GitHub 공지를 읽지 못했습니다. 저장소 접근 권한과 통신 상태를 확인해주세요.');
    const file=await response.json();
    return {sha:file.sha,notice:validate(decode(file.content))};
  }
  async function publish(text,baseline,credential) {
    if (!credential.trim()) throw new Error('GitHub 게시 인증키를 입력해주세요.');
    if (text.length>3000) throw new Error('공지는 3000자 이내로 작성해주세요.');
    const current=await latest(credential);
    if (current.notice.text===text) return current.notice;
    if (current.notice.revision!==baseline.revision || current.notice.text!==baseline.text) {
      throw new Error('다른 게시 내용이 있습니다. 작성 내용을 복사해 보관한 후 최신 게시본을 불러와 확인해주세요.');
    }
    const notice={text,revision:crypto.randomUUID(),updatedAt:new Date().toISOString()};
    const response=await request(endpoint,{method:'PUT',headers:{
      Accept:'application/vnd.github+json',Authorization:`Bearer ${credential}`,'Content-Type':'application/json'
    },body:JSON.stringify({message:'Publish site notice',branch:'main',sha:current.sha,content:encode(notice)})});
    if (!response.ok) {
      const messages={401:'게시 인증키가 올바르지 않거나 만료되었습니다.',403:'게시 권한이 없습니다. 해당 저장소의 Contents 쓰기 권한을 확인해주세요.',409:'다른 수정과 충돌했습니다. 최신 게시본을 확인해주세요.',422:'저장소의 브랜치 보호 규칙 또는 입력 내용을 확인해주세요.'};
      throw new Error(messages[response.status] || 'GitHub 저장에 실패했습니다. 작성 내용을 유지합니다.');
    }
    return notice;
  }
  const api={site,repository,validate,deployed,latest,publish};
  if (typeof module==='object' && module.exports) module.exports=api;
  else root.NoticePublisher=api;
})(globalThis);
