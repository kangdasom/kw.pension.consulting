// Public data only. GitHub's signed-in issue form authenticates the publisher.
(function(root){
  'use strict';
  const repository='kangdasom/kw.pension.consulting';
  const site='https://kangdasom.github.io/kw.pension.consulting/';
  const title='사이트 공지 게시 요청';
  function validate(value){
    if(!value || typeof value.text!=='string' || value.text.length>3000 || typeof value.revision!=='string' || !value.revision || value.revision.length>100)throw Error('공지 파일 형식이 올바르지 않습니다.');
    return {text:value.text,revision:value.revision,updatedAt:value.updatedAt||null};
  }
  function prepare(text,baseline){
    if(typeof text!=='string'||text.length>3000)throw Error('공지는 3000자 이내로 작성해주세요.');
    validate(baseline);
    const notice={text:text.trim(),revision:crypto.randomUUID(),updatedAt:null};
    const body=JSON.stringify({schema:'site-notice-v1',baseRevision:baseline.revision,notice},null,2);
    const url=new URL(`https://github.com/${repository}/issues/new`);
    url.searchParams.set('title',title);url.searchParams.set('body',body);
    const needsPaste=url.href.length>7500;
    if(needsPaste)url.searchParams.delete('body');
    return {notice,body,url:url.href,needsPaste};
  }
  function parseIssue(event,current){
    validate(current);
    if(event.repository?.full_name!==repository || event.repository?.id!==1317770573 || event.sender?.login!=='kangdasom' || event.sender?.id!==311216178 || event.issue?.user?.login!=='kangdasom' || event.issue?.user?.id!==311216178 || event.issue?.pull_request || event.issue?.title!==title || event.action!=='opened')throw Error('공지 게시 권한이 없는 요청입니다.');
    const body=event.issue.body;
    if(typeof body!=='string'||body.length>20000)throw Error('게시 요청 형식이 올바르지 않습니다.');
    const value=JSON.parse(body);
    if(value.schema!=='site-notice-v1')throw Error('게시 요청 형식이 올바르지 않습니다.');
    const notice=validate(value.notice);
    if(!/^[0-9a-f-]{36}$/.test(notice.revision))throw Error('게시 요청 번호가 올바르지 않습니다.');
    if(current.revision===notice.revision){
      if(current.text!==notice.text)throw Error('게시 요청 번호가 중복되었습니다.');
      return current;
    }
    if(current.revision!==value.baseRevision)throw Error('다른 공지가 먼저 수정되었습니다. 사이트에서 최신 게시본을 불러와 다시 게시해주세요.');
    return {...notice,updatedAt:new Date().toISOString()};
  }
  async function get(url){
    let response;
    try{response=await fetch(url,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(20000)});}catch{throw Error('공지를 불러오지 못했습니다. 통신 상태를 확인해주세요.');}
    if(!response.ok)throw Error('공지를 불러오지 못했습니다. 잠시 후 다시 확인해주세요.');
    return response.json();
  }
  async function deployed(){return validate(await get(new URL(`notice.json?t=${Date.now()}`,site)));}
  async function latest(){
    const file=await get(`https://api.github.com/repos/${repository}/contents/notice.json?ref=main&t=${Date.now()}`);
    const value=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(file.content.replace(/\s/g,'')),c=>c.charCodeAt(0))));
    return {notice:validate(value)};
  }
  const api={repository,site,title,validate,prepare,parseIssue,deployed,latest};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.NoticePublisher=api;
})(globalThis);
