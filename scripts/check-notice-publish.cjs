const assert=require('node:assert/strict');
const api=require('../notice-publish.js');
const initial={text:'기존 공지',revision:'old',updatedAt:null};
const bytes=value=>Buffer.from(JSON.stringify(value)).toString('base64');
let state={...initial}, status=200, calls=[];
global.fetch=async(url,options)=>{
  calls.push({url:String(url),options});
  if(options.method==='PUT') {
    if(status!==200)return {ok:false,status};
    const body=JSON.parse(options.body);
    assert.equal(body.branch,'main');assert.equal(body.sha,'file-sha');
    state=JSON.parse(Buffer.from(body.content,'base64').toString('utf8'));
    return {ok:true,status:200};
  }
  return {ok:true,json:async()=>({sha:'file-sha',content:bytes(state)})};
};
(async()=>{
  await assert.rejects(api.publish('새 공지',initial,''),/인증키/);
  assert.equal(calls.length,0);
  const next=await api.publish('한글 공지\n<em>문자 그대로</em> 😀',initial,'test-credential');
  assert.equal(next.text,state.text);assert.notEqual(next.revision,initial.revision);
  assert.equal(calls[1].options.headers.Authorization,'Bearer test-credential');
  assert(!calls[1].options.body.includes('test-credential'));
  calls=[];await api.publish(state.text,initial,'test-credential');assert.equal(calls.length,1);
  await assert.rejects(api.publish('다른 수정',initial,'test-credential'),/다른 게시/);
  status=409;await assert.rejects(api.publish('다른 수정',state,'test-credential'),/충돌/);
  status=403;await assert.rejects(api.publish('다른 수정',state,'test-credential'),/권한/);
  status=401;await assert.rejects(api.publish('다른 수정',state,'test-credential'),/만료/);
  status=200;const empty=await api.publish('',state,'test-credential');assert.equal(empty.text,'');
  await assert.rejects(api.publish('가'.repeat(3001),state,'test-credential'),/3000/);
  assert.throws(()=>api.validate({text:12,revision:'bad'}),/형식/);
  global.fetch=async()=>{throw Error('test-credential');};
  await assert.rejects(api.publish('새 공지',state,'test-credential'),error=>!error.message.includes('test-credential')&&/통신/.test(error.message));
  console.log('PASS: UTF-8 notice publication, SHA conflict guard, empty notice, unchanged retry, permissions, input limit and credential-safe errors.');
})().catch(error=>{console.error(error);process.exitCode=1;});
