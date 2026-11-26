const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const api=require('../management-publish.js');
const catalog={window:{}};vm.runInNewContext(fs.readFileSync('rates-data.js','utf8'),catalog);
const month=catalog.window.RATE_IMPORT.month;
const products=catalog.window.RATE_IMPORT.products,row=products.find(r=>r.terms[12]&&r.terms[36]);
const key=term=>JSON.stringify([row.id,String(term)]);
const initial={schema:'monthly-management-v1',revision:'initial',updatedAt:null,months:{'2026-10':{[key(12)]:{status:'N',amount:'이전 월'}}}};
const snapshot={month,records:{[key(12)]:{status:'Y',amount:'50억원'},[key('common')]:{checkedAt:'2026-11-24',note:'공통 비고\n두 번째 줄 😀'}}};
const request=api.prepare(snapshot,initial);
const event={action:'opened',repository:{full_name:api.repository,id:1317770573},sender:{login:'kangdasom',id:311216178},issue:{number:1,title:api.title,user:{login:'kangdasom',id:311216178},body:request.body}};
const before=JSON.stringify(initial),next=api.parseIssue(event,initial,products);
assert.equal(JSON.stringify(initial),before);assert.equal(next.revision,request.revision);
assert.equal(next.months[month][key(12)].amount,'50억원');
assert.deepEqual(next.months['2026-10'],initial.months['2026-10']);
assert.deepEqual(api.parseIssue(event,next,products),next);
assert.equal(new URL(request.url).searchParams.get('body'),request.body);
assert.deepEqual(api.delta(snapshot,next),{});assert.throws(()=>api.prepare(snapshot,next),/변경사항/);
// A stale deployment must not reject an unrelated save, or resubmit identical values.
assert.deepEqual(api.rebase(snapshot,initial,next),{month,records:{},conflicts:[]});
assert(api.matches(request,next));
assert(api.matches(request,{...next,revision:'superseded-by-unrelated-save'}));
assert(!api.matches(request,initial));
const concurrent=structuredClone(initial);concurrent.revision='another-save';
concurrent.months[month]={[key(12)]:{note:'別の項目'},[key(36)]:{amount:'20억원'}};
const merged=api.rebase(snapshot,initial,concurrent);
assert.deepEqual(merged.conflicts,[]);assert.deepEqual(merged.records,snapshot.records);
const mergedNext=api.parseIssue({...event,issue:{...event.issue,body:api.prepare(merged,concurrent).body}},concurrent,products);
assert.equal(mergedNext.months[month][key(12)].note,'別の項目');
assert.equal(mergedNext.months[month][key(36)].amount,'20억원');
concurrent.months[month][key(12)].amount='99억원';
assert.deepEqual(api.rebase(snapshot,initial,concurrent).conflicts,[{key:key(12),field:'amount'}]);
assert.equal(concurrent.months[month][key(12)].amount,'99억원');
const partial=api.prepare({month,records:{[key(12)]:{amount:''},[key('common')]:{note:''}}},next);
const cleared=api.parseIssue({...event,issue:{...event.issue,body:partial.body}},next,products);
assert.equal(cleared.months[month][key(12)].status,'Y');
assert.equal(cleared.months[month][key(12)].amount,'');
assert.equal(cleared.months[month][key('common')].checkedAt,'2026-11-24');
assert.equal(cleared.months[month][key('common')].note,'');
assert.throws(()=>api.parseIssue(event,{...initial,revision:'changed'},products),/먼저 저장/);
for(const mutate of [e=>e.sender.login='other',e=>e.sender.id=1,e=>e.issue.user.id=1,e=>e.repository.id=1,e=>e.action='edited',e=>e.issue.pull_request={},e=>e.issue.title='other',e=>e.issue.body='invalid']){
 const invalid=structuredClone(event);mutate(invalid);assert.throws(()=>api.parseIssue(invalid,initial,products));
}
for(const fields of [{status:'maybe'},{amount:2},{checkedAt:'2026-02-30'},{extra:'unwanted'},{note:'a'.repeat(10001)}])assert.throws(()=>api.records({[key(12)]:fields}));
assert.throws(()=>api.records({[JSON.stringify([row.id,'3'])]:{status:'Y'}}));
assert.throws(()=>api.prepare({month:'2026-13',records:snapshot.records},initial));
const wrong=api.prepare({month,records:{[JSON.stringify(['unknown','12'])]:{status:'Y'}}},initial);
assert.throws(()=>api.parseIssue({...event,issue:{...event.issue,body:wrong.body}},initial,products),/원본에 없는/);
const duplicate=JSON.parse(request.body);duplicate.changes[key(12)].amount='different';
assert.throws(()=>api.parseIssue({...event,issue:{...event.issue,body:JSON.stringify(duplicate)}},next,products),/중복/);
const long=api.prepare({month,records:{[key('common')]:{note:'가'.repeat(3000)}}},initial);
assert(long.needsPaste);assert(!new URL(long.url).searchParams.has('body'));
assert.throws(()=>api.restore('a'.repeat(60001)),/변경량/);
const workflow=fs.readFileSync('.github/workflows/publish-management.yml','utf8');
const script=workflow.split('script: |\n')[1].split('\n').map(line=>line.replace(/^ {12}/,'')).join('\n');
const run=new (Object.getPrototypeOf(async function(){}).constructor)('github','context','require',script);
(async()=>{
 let writes=[],dispatches=[],closed=[];
 const savedSha='a'.repeat(40),headSha='b'.repeat(40);
 const github={rest:{repos:{getContent:async()=>({data:{sha:'file-sha',content:Buffer.from(JSON.stringify(initial)).toString('base64')}}),getCommit:async()=>({data:{sha:headSha}}),createOrUpdateFileContents:async value=>{writes.push(value);return {data:{commit:{sha:savedSha}}};}},actions:{createWorkflowDispatch:async value=>dispatches.push(value)},issues:{update:async value=>closed.push(value)}}};
 const context={repo:{owner:'kangdasom',repo:'kw.pension.consulting'},payload:event,issue:{number:1}};
 const load=name=>name==='./management-publish.js'?api:require(name);
 await run(github,context,load);
 assert.equal(writes.length,1);assert.equal(writes[0].path,'management-shared.json');assert.equal(writes[0].sha,'file-sha');
 const published=JSON.parse(Buffer.from(writes[0].content,'base64').toString('utf8'));
 assert.deepEqual(published.months,next.months);assert.equal(dispatches[0].workflow_id,'deploy-pages.yml');assert.equal(closed[0].state,'closed');
 assert.equal(dispatches[0].inputs.source_sha,savedSha);
 for(const current of [published,{...initial,revision:'changed'}]){
  writes=[];dispatches=[];closed=[];
  github.rest.repos.getContent=async()=>({data:{sha:'new-sha',content:Buffer.from(JSON.stringify(current)).toString('base64')}});
  if(current===published){await run(github,context,load);assert.equal(writes.length,0);assert.equal(dispatches.length,1);assert.equal(dispatches[0].inputs.source_sha,headSha);}
  else{await assert.rejects(run(github,context,load),/먼저 저장/);assert.equal(writes.length+dispatches.length+closed.length,0);}
 }
 writes=[];dispatches=[];closed=[];
 await assert.rejects(run(github,{...context,payload:{...event,sender:{login:'other',id:1}}},load),/권한/);
 assert.equal(writes.length+dispatches.length+closed.length,0);
 assert.match(workflow,/github.actor == 'kangdasom'/);assert.match(workflow,/github.event.sender.id == 311216178/);
 assert(!workflow.includes('${{ github.event.issue.body }}'));
 const deployWorkflow=fs.readFileSync('.github/workflows/deploy-pages.yml','utf8');
 assert.match(deployWorkflow,/source_sha:/);
 assert(deployWorkflow.includes('ref: ${{ inputs.source_sha || github.sha }}'));
 console.log('PASS: owner-authorized monthly publication, validation/catalog checks, partial updates and explicit clears, other-month preservation, conflicts/replay, long-request copy, exact workflow write/dispatch/close and unauthorized rejection.');
})().catch(e=>{console.error(e);process.exitCode=1});
