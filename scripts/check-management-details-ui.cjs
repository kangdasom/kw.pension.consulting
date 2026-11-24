const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.RATE_STATUS_PLAYWRIGHT||'playwright');
(async()=>{
 const root=path.resolve(__dirname,'..'),live=process.env.MANAGEMENT_DETAILS_LIVE==='1',out=path.join(root,'outputs','management-details-qa',live?'live':'local');
 fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const context=await browser.newContext(),page=await context.newPage({viewport:{width:1366,height:900}}),errors=[],bad=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  page.on('response',r=>{if(r.status()>=400)bad.push(r.status()+':'+r.url());});
  if(!live)await context.route('http://rates.test/**',route=>{
   const name=new URL(route.request().url()).pathname.slice(1)||'index.html';
   return route.fulfill({path:path.join(root,name),contentType:name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.woff2')?'font/woff2':name.endsWith('.png')?'image/png':name.endsWith('.json')?'application/json':'text/html'});
  });
  await page.goto(live?'https://kangdasom.github.io/kw.pension.consulting/admin.html':'http://rates.test/admin.html');
  await page.locator('#manageSearch').waitFor({state:'visible'});
  assert(await page.locator('script[src="management.js?v=20261124-shared"]').count());
  assert(await page.locator('link[href="management.css?v=20261124-shared"]').count());
  const id=await page.evaluate(()=>rates.find(r=>r.institution==='다올저축은행' && r.terms[12] && r.terms[36]).id);
  const key=term=>JSON.stringify([id,String(term)]),storageKey='db-rate-management-v1';
  const legacy={institutions:{},products:{[id]:{lineup:'Y'}},months:{'2026-11':{
   [key(12)]:{status:'Y',amount:'10억원',checkedAt:'2026-11-10',note:'기존 1년 비고',reason:'기존 사유'},
   [key(36)]:{status:'N',amount:'20억원',checkedAt:'2026-11-20',note:'기존 3년 비고',reason:''}
  },'2026-10':{history:{note:'이전 월 보존'}}}};
  await page.evaluate(({storageKey,legacy})=>localStorage.setItem(storageKey,JSON.stringify(legacy)),{storageKey,legacy});
  await page.reload();await page.evaluate(()=>document.fonts.ready);
  await page.waitForFunction(()=>!document.getElementById('saveMonthly').disabled);
  const open=async()=>{await page.locator('#manageSearch').fill('다올저축은행');await page.locator('#manageRows button[data-detail]').click();};
  await open();const details=page.locator('#termDetails'),note=details.locator('[data-common-field=note]'),date=details.locator('[data-common-field=checkedAt]');
  assert.equal(await date.count(),1);assert.equal(await note.count(),1);
  assert.equal(await date.inputValue(),'2026-11-20');
  assert.equal(await note.inputValue(),'1년: 기존 1년 비고\n3년: 기존 3년 비고');
  assert(!/불가 사유|내부 비고|내부 관리용/.test(await details.innerText()));
  assert.equal(await details.locator('select').count(),0);
  assert.equal(await details.locator('[data-field=amount]').count(),2);
  for(const width of [320,390,768,1366]){
   await page.setViewportSize({width,height:900});await details.scrollIntoViewIfNeeded();
   const metrics=await details.evaluate(e=>({overflow:document.documentElement.scrollWidth>innerWidth+1,controls:[...e.querySelectorAll('input,textarea,button')].map(n=>{const b=n.getBoundingClientRect();return {left:b.left,right:b.right,width:b.width}})}));
   assert(!metrics.overflow,JSON.stringify({width,metrics}));
   assert(metrics.controls.every(b=>b.left>=0 && b.right<=width+1 && b.width>0),JSON.stringify({width,metrics}));
   await details.screenshot({path:path.join(out,`details-${width}.png`)});
  }
  assert.deepEqual(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),storageKey),legacy);
  await note.fill('상품 공통 비고\n두 번째 줄');await date.fill('2026-11-24');
  await details.locator('tr[data-term="12"] [data-field=amount]').fill('30억원');
  await details.locator('tr[data-term="36"] button[data-status=Y]').click();
  assert.equal(await note.inputValue(),'상품 공통 비고\n두 번째 줄');
  assert.equal(await details.locator('tr[data-term="12"] [data-field=amount]').inputValue(),'30억원');
  assert.deepEqual(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),storageKey),legacy);
  await page.locator('#tab-basic').click();await page.locator('#tab-monthly').click();
  assert.equal(await note.inputValue(),'상품 공통 비고\n두 번째 줄');
  await page.locator('#closeTermDetails').click();await open();
  assert.equal(await date.inputValue(),'2026-11-24');
  await page.locator('#cancelMonthly').click();await open();
  assert.equal(await note.inputValue(),'1년: 기존 1년 비고\n3년: 기존 3년 비고');
  assert.equal(await date.inputValue(),'2026-11-20');
  assert.deepEqual(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),storageKey),legacy);
  const fourTerm=await page.evaluate(()=>{const r=rates.find(r=>r.lineup==='Y' && [12,18,36,60].every(t=>r.terms[t]));return {id:r.id,institution:r.institution};});
  await page.locator('#manageSearch').fill(fourTerm.institution);
  await page.locator(`#manageRows button[data-detail="${fourTerm.id}"]`).click();
  assert.equal(await details.locator('[data-field=amount]').count(),4);
  assert.equal(await note.count(),1);assert.equal(await date.count(),1);
  await page.setViewportSize({width:320,height:900});
  assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1));
  assert.deepEqual(errors,[]);assert.deepEqual(bad,[]);
  console.log('PASS: isolated Edge 320/390/768/1366px details layout, removed copy/reasons, common legacy fallback, independent limits/status, draft/tab/reopen/cancel, unchanged browser storage, no overflow or JS errors.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
