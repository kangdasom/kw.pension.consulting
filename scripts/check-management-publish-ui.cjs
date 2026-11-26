const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm');
const {chromium}=require(process.env.RATE_STATUS_PLAYWRIGHT||'playwright');
const api=require('../management-publish.js');
(async()=>{
 const root=path.resolve(__dirname,'..'),out=path.join(root,'outputs','management-publish-qa');fs.mkdirSync(out,{recursive:true});
 const catalog={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'rates-data.js'),'utf8'),catalog);
 const products=catalog.window.RATE_IMPORT.products,row=products.find(r=>r.institution==='다올저축은행'),key=t=>JSON.stringify([row.id,String(t)]);
 const site=api.site;
 let deployed={schema:'monthly-management-v1',revision:'initial',updatedAt:null,months:{'2026-10':{[key(12)]:{amount:'이전 월'}}}},latest=deployed,failRead=false,submitted=[],popups=0;
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const errors=[],contexts=[];
  async function context(){
   const c=await browser.newContext();contexts.push(c);
   await c.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.hostname==='api.github.com')return route.fulfill({json:{content:Buffer.from(JSON.stringify(latest)).toString('base64')}});
    if(url.hostname==='github.com'){popups++;submitted.push(url.searchParams.get('body'));return route.fulfill({contentType:'text/html',body:'<h1>GitHub request preview</h1>'});}
    if(!url.href.startsWith(site))return route.abort();
    const name=url.pathname.slice(new URL(site).pathname.length)||'index.html';
    if(name==='management-shared.json')return route.fulfill(failRead?{status:503,body:'unavailable'}:{json:deployed});
    return route.fulfill({path:path.join(root,name),contentType:name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.woff2')?'font/woff2':name.endsWith('.png')?'image/png':name.endsWith('.json')?'application/json':'text/html'});
   });
   c.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
   return c;
  }
  const c=await context(),page=await c.newPage();page.on('dialog',d=>d.accept());
  await page.goto(site+'admin.html');await page.locator('#saveMonthly').waitFor({state:'visible'});
  await page.waitForFunction(()=>!document.getElementById('saveMonthly').disabled);
  await page.evaluate(({id})=>{const k='db-rate-management-v1',v=JSON.parse(localStorage.getItem(k)||'{"institutions":{},"products":{},"months":{}}');v.products[id]={lineup:'Y'};localStorage.setItem(k,JSON.stringify(v));},{id:row.id});
  await page.reload();await page.waitForFunction(()=>!document.getElementById('saveMonthly').disabled);
  const open=async()=>{await page.locator('#manageSearch').fill('다올저축은행');await page.locator('#manageRows button[data-detail]').click();};
  await open();
  const details=page.locator('#termDetails'),note=details.locator('[data-common-field=note]'),date=details.locator('[data-common-field=checkedAt]');
  for(const width of [320,390,768,1366]){
   await page.setViewportSize({width,height:900});await details.scrollIntoViewIfNeeded();
   assert.equal(await note.count(),1);assert.equal(await date.count(),1);
   assert.equal(await details.locator('[data-field=amount]').count(),2);
   assert(!/불가 사유|内部|내부 비고|내부 관리용/.test(await details.innerText()));
   assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1));
   await details.screenshot({path:path.join(out,`details-${width}.png`)});
  }
  const before=await page.evaluate(()=>JSON.stringify({...localStorage}));
  await note.fill('다른 기기도 보는 공통 비고\n둘째 줄');await date.fill('2026-11-24');
  await details.locator('tr[data-term="12"] [data-field=amount]').fill('50억원');
  await details.locator('tr[data-term="12"] button[data-status=Y]').click();
  assert.equal(await note.inputValue(),'다른 기기도 보는 공통 비고\n둘째 줄');
  await page.locator('#saveMonthly').click();await page.locator('#monthlySubmit').waitFor({state:'visible'});
  await page.waitForFunction(()=>document.getElementById('monthlySubmit').href.includes('issues/new'));
  assert.match(await page.locator('#monthlyMessage').innerText(),/아직 배포 전/);
  assert(await page.locator('#saveMonthly').isDisabled());
  assert.equal(await page.evaluate(()=>JSON.stringify({...localStorage})),before);
  const body=await page.locator('#monthlyRequestBody').inputValue(),request=api.restore(body);
  assert.equal(request.changes[key(12)].amount,'50억원');assert.equal(request.changes[key('common')].note,'다른 기기도 보는 공통 비고\n둘째 줄');
  const firstPopups=popups;await page.evaluate(()=>window.RateMonthlyPublishing.save());assert.equal(popups,firstPopups);
  const publish=body=>{
   const event={action:'opened',repository:{full_name:api.repository,id:1317770573},sender:{login:'kangdasom',id:311216178},issue:{title:api.title,user:{login:'kangdasom',id:311216178},body}};
   latest=api.parseIssue(event,latest,products);return latest;
  };
  publish(body); // GitHub has saved the data; Pages has not deployed it yet.
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await page.waitForFunction(()=>document.getElementById('monthlyMessage').textContent.includes('GitHub 저장이 완료'));
  assert(await page.locator('#monthlySubmit').isHidden());
  assert(!/배포가 완료/.test(await page.locator('#monthlyMessage').innerText()));
  deployed={...latest,revision:'newer-unrelated-save'};
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await page.waitForFunction(()=>document.getElementById('monthlyMessage').textContent.includes('사이트 배포가 완료'));
  assert.equal(await page.locator('#monthlyDirty').innerText(),'변경사항 없음');
  assert.equal(await page.evaluate(()=>JSON.stringify({...localStorage})),before);
  // A separate device loads the shared values; stale local values lose to the published fields.
  const other=await context(),viewer=await other.newPage();
  await viewer.addInitScript(({id,key12})=>localStorage.setItem('db-rate-management-v1',JSON.stringify({institutions:{},products:{[id]:{lineup:'Y'}},months:{'2026-11':{[key12]:{status:'N',amount:'오래된 로컬 한도'}}}})),{id:row.id,key12:key(12)});
  await viewer.goto(site+'admin.html');await viewer.waitForFunction(()=>!document.getElementById('saveMonthly').disabled);
  await viewer.locator('#manageSearch').fill('다올저축은행');await viewer.locator('#manageRows button[data-detail]').click();
  assert.equal(await viewer.locator('#termDetails [data-common-field=note]').inputValue(),'다른 기기도 보는 공통 비고\n둘째 줄');
  assert.equal(await viewer.locator('#termDetails tr[data-term="12"] [data-field=amount]').inputValue(),'50억원');
  assert.equal(await viewer.locator('#termDetails tr[data-term="12"] button[data-status=Y]').getAttribute('aria-pressed'),'true');
  const sales=await other.newPage();await sales.goto(site+'index.html?plan=db');
  await sales.waitForFunction(id=>rates.find(r=>r.id===id).proposals[12]==='Y',row.id);
  assert.equal(await sales.locator('#panel-monthly').count(),0);
  // Clear common values, preserve all prior month data, and test a pending request restored on reload.
  await note.fill('');await date.fill('');await page.locator('#saveMonthly').click();await page.locator('#monthlySubmit').waitFor({state:'visible'});
  const clearBody=await page.locator('#monthlyRequestBody').inputValue();
  await page.reload();await page.locator('#monthlySubmit').waitFor({state:'visible'});
  assert.equal(await page.locator('#monthlyRequestBody').inputValue(),clearBody);
  deployed=publish(clearBody);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await page.waitForFunction(()=>document.getElementById('monthlyMessage').textContent.includes('사이트 배포가 완료'));
  await open();assert.equal(await note.inputValue(),'');assert.equal(await date.inputValue(),'');assert.equal(deployed.months['2026-10'][key(12)].amount,'이전 월');
  // An unrelated newer repository revision is merged without discarding the draft.
  await note.fill('최신 정보와 합칠 초안');
  latest={...latest,revision:'another-save',months:structuredClone(latest.months)};
  latest.months[request.month][key(12)].amount='다른 담당자의 한도';
  await page.locator('#saveMonthly').click();await page.locator('#monthlySubmit').waitFor({state:'visible'});
  const mergedBody=await page.locator('#monthlyRequestBody').inputValue(),mergedRequest=api.restore(mergedBody);
  assert.equal(mergedRequest.baseRevision,'another-save');
  assert.equal(mergedRequest.changes[key('common')].note,'최신 정보와 합칠 초안');
  assert(!mergedRequest.changes[key(12)]?.amount);
  deployed=publish(mergedBody);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await page.waitForFunction(()=>document.getElementById('monthlyMessage').textContent.includes('사이트 배포가 완료'));
  // An identical save already in GitHub is tracked without a duplicate request.
  await note.fill('이미 저장된 내용');
  latest={...latest,revision:'already-saved',months:structuredClone(latest.months)};
  latest.months[request.month][key('common')].note='이미 저장된 내용';
  const duplicatePopups=popups;await page.locator('#saveMonthly').click();
  await page.waitForFunction(()=>document.getElementById('monthlyMessage').textContent.includes('중복 요청 없이'));
  assert.equal(popups,duplicatePopups);assert(await page.locator('#monthlySubmit').isHidden());
  await page.reload();
  await page.locator('#monthlyRequest').waitFor({state:'visible'});
  assert(await page.locator('#monthlySubmit').isHidden());
  deployed={...latest,revision:'later-deployment'};await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await page.waitForFunction(()=>document.getElementById('monthlyMessage').textContent.includes('사이트 배포가 완료'));
  await open();
  // A true same-field conflict and a read failure never publish or discard edits.
  await note.fill('충돌 시 유지할 초안');latest={...latest,revision:'conflict',months:structuredClone(latest.months)};
  latest.months[request.month][key('common')].note='먼저 저장된 다른 값';
  const popupCount=popups;await page.locator('#saveMonthly').click();
  await page.waitForFunction(()=>document.getElementById('monthlyMessage').textContent.includes('먼저 저장'));
  assert.equal(popups,popupCount);assert.equal(await note.inputValue(),'충돌 시 유지할 초안');
  deployed=latest;await page.locator('#monthlyLatest').click();
  await page.waitForFunction(()=>document.getElementById('monthlyMessage').textContent.includes('최신 사이트 배포본'));
  assert.equal(await note.inputValue(),'먼저 저장된 다른 값');
  await note.fill('요청 중단 후 유지');await page.locator('#saveMonthly').click();await page.locator('#monthlySubmit').waitFor({state:'visible'});
  await page.locator('#monthlyStop').click();assert.equal(await note.inputValue(),'요청 중단 후 유지');assert(!await page.locator('#saveMonthly').isDisabled());
  failRead=true;await page.locator('#monthlyLatest').click();await page.waitForFunction(()=>document.getElementById('monthlyMessage').textContent.includes('불러오지 못했습니다'));
  assert.equal(await note.inputValue(),'요청 중단 후 유지');failRead=false;
  await page.locator('#monthlyLatest').click();await page.waitForFunction(()=>document.getElementById('monthlyMessage').textContent.includes('최신 사이트 배포본'));
  await note.fill('가'.repeat(3000));await page.locator('#saveMonthly').click();await page.locator('#monthlyCopy').waitFor({state:'visible'});
  assert(!new URL(await page.locator('#monthlySubmit').getAttribute('href')).searchParams.has('body'));
  await page.setViewportSize({width:320,height:900});assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1));
  await page.screenshot({path:path.join(out,'pending-320.png'),fullPage:true});await page.locator('#monthlyStop').click();
  assert.deepEqual(errors,[]);
  console.log('PASS: isolated two-device monthly sharing and stale-cache precedence, sales status, GitHub request/deploy distinction, explicit clear/history, pending reload/duplicate guard/stop, conflict/read failure draft preservation, long request and 320/390/768/1366px layouts. No real GitHub request submitted.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
