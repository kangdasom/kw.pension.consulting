const assert=require('node:assert/strict'),fs=require('node:fs');
const api=require('../notice-publish.js');
const current={text:'기존 공지',revision:'old',updatedAt:null};
const request=api.prepare('한글 공지\n<em>문자 그대로</em> 😀',current);
const event={action:'opened',repository:{full_name:api.repository,id:1317770573},sender:{login:'kangdasom',id:311216178},issue:{number:1,title:api.title,user:{login:'kangdasom',id:311216178},body:request.body}};
assert.equal(new URL(request.url).searchParams.get('body'),request.body);
assert.equal(api.requestPlan(event),'DB');
const next=api.parseIssue(event,current);assert.equal(next.text,request.notice.text);assert(next.updatedAt);
assert.equal(api.parseIssue(event,next),next);
for(const mutate of [e=>e.sender.login='other',e=>e.sender.id=1,e=>e.issue.user.id=1,e=>e.repository.id=1,e=>e.action='edited',e=>e.issue.pull_request={},e=>e.issue.title='other',e=>e.issue.body='invalid']){
 const invalid=structuredClone(event);mutate(invalid);assert.throws(()=>api.parseIssue(invalid,current));
}
assert.throws(()=>api.parseIssue(event,{...current,revision:'newer'}),/먼저 수정/);
assert.throws(()=>api.prepare('가'.repeat(3001),current),/3000/);
const oldPayload=JSON.parse(request.body);oldPayload.schema='site-notice-v1';delete oldPayload.plan;
assert.equal(api.requestPlan({...event,issue:{...event.issue,body:JSON.stringify(oldPayload)}}),'DB');
assert.equal(api.parseIssue({...event,issue:{...event.issue,body:JSON.stringify(oldPayload)}},current).text,request.notice.text);
for(const plan of ['DC','IRP']){
 const prepared=api.prepare(plan+' 공지',current,plan);
 const planned={...event,issue:{...event.issue,body:prepared.body}};
 assert.equal(api.requestPlan(planned),plan);
 assert.equal(api.noticePath(plan),'notice-'+plan.toLowerCase()+'.json');
 assert.equal(api.parseIssue(planned,current).text,plan+' 공지');
}
for(const plan of ['../notice.json','__proto__','db',null,undefined]){
 const payload={...JSON.parse(request.body),plan};
 assert.throws(()=>api.requestPlan({...event,issue:{...event.issue,body:JSON.stringify(payload)}}));
}
const long=api.prepare('가'.repeat(3000),current);assert(long.needsPaste);assert(long.url.length<7500);assert(!new URL(long.url).searchParams.has('body'));
const blank=api.prepare(' \n ',current);assert.equal(api.parseIssue({...event,issue:{...event.issue,body:blank.body}},current).text,'');
// Execute the exact workflow script with the GitHub API mocked, including dispatch.
const workflow=fs.readFileSync('.github/workflows/publish-notice.yml','utf8');
const script=workflow.split('script: |\n')[1].split('\n').map(line=>line.replace(/^ {12}/,'')).join('\n');
const run=new (Object.getPrototypeOf(async function(){}).constructor)('github','context','require',script);
(async()=>{
 let writes=[],dispatches=[],closed=[];
 const github={rest:{repos:{getContent:async()=>({data:{sha:'sha',content:Buffer.from(JSON.stringify(current)).toString('base64')}}),createOrUpdateFileContents:async value=>writes.push(value)},actions:{createWorkflowDispatch:async value=>dispatches.push(value)},issues:{update:async value=>closed.push(value)}}};
 const context={repo:{owner:'kangdasom',repo:'kw.pension.consulting'},payload:event,issue:{number:1}};
 await run(github,context,()=>api);
 assert.equal(writes.length,1);assert.equal(writes[0].path,'notice.json');assert.equal(writes[0].sha,'sha');
 assert.equal(JSON.parse(Buffer.from(writes[0].content,'base64').toString('utf8')).text,next.text);
 assert.equal(dispatches[0].workflow_id,'deploy-pages.yml');assert.equal(dispatches[0].ref,'main');assert.equal(closed[0].state,'closed');
 writes=[];dispatches=[];closed=[];
 const bad={...context,payload:{...event,sender:{login:'other',id:1}}};
 await assert.rejects(run(github,bad,()=>api),/権限|권한/);assert.equal(writes.length+dispatches.length+closed.length,0);
 assert.match(workflow,/github.actor == 'kangdasom'/);assert.match(workflow,/github.event.sender.id == 311216178/);
 assert(!workflow.includes('${{ github.event.issue.body }}'));
 for(const plan of ['DC','IRP']){
  writes=[];dispatches=[];closed=[];
  const prepared=api.prepare(plan+' 별도 공지',current,plan);
  const planned={...context,payload:{...event,issue:{...event.issue,body:prepared.body}}};
  let readPath;
  github.rest.repos.getContent=async value=>{readPath=value.path;return {data:{sha:plan+'-sha',content:Buffer.from(JSON.stringify(current)).toString('base64')}};};
  await run(github,planned,()=>api);
  assert.equal(readPath,api.noticePath(plan));assert.equal(writes.length,1);assert.equal(writes[0].path,readPath);assert.equal(writes[0].sha,plan+'-sha');
  assert.equal(dispatches.length,1);assert.equal(closed.length,1);
  writes=[];dispatches=[];closed=[];
  const replay=api.parseIssue(planned.payload,current);
  github.rest.repos.getContent=async()=>({data:{sha:'new-sha',content:Buffer.from(JSON.stringify(replay)).toString('base64')}});
  await run(github,planned,()=>api);assert.equal(writes.length,0);assert.equal(dispatches.length,1);
  github.rest.repos.getContent=async()=>({data:{sha:'conflict',content:Buffer.from(JSON.stringify({...current,revision:'changed'})).toString('base64')}});
  writes=[];dispatches=[];closed=[];
  await assert.rejects(run(github,planned,()=>api),/먼저 수정/);assert.equal(writes.length+dispatches.length+closed.length,0);
 }
 console.log('PASS: owner identity and repository checks, unauthorized rejection before writes, UTF-8/empty/long notices, conflict/replay, exact workflow commit and explicit Pages dispatch.');
})().catch(e=>{console.error(e);process.exitCode=1;});
