const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.RATE_STATUS_PLAYWRIGHT || 'playwright');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const root=path.resolve(__dirname,'..'),out=path.join(root,'outputs/user-management-qa');fs.mkdirSync(out,{recursive:true});
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.route('**/*',route=>{
   const url=new URL(route.request().url());
   if(url.hostname!=='rates.test')return route.abort();
   const name=url.pathname.slice(1)||'index.html';
   if(name.includes('..'))return route.abort();
   return route.fulfill({path:path.join(root,name),contentType:name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.png')?'image/png':name.endsWith('.woff2')?'font/woff2':name.endsWith('.json')?'application/json':'text/html'});
  });
  await page.goto('http://rates.test/');await page.evaluate(()=>document.fonts.ready);
  const before=await page.evaluate(()=>JSON.stringify({storage:{...localStorage},rows:RateExport.snapshot('current').rows}));
  await page.locator('#tab-users').click();assert(await page.locator('#panel-users').isVisible());
  assert(!/초안|예정|준비중/.test(await page.locator('#panel-users').innerText()));
  assert.match(await page.locator('#panel-users .management-notice').innerText(),/실제 로그인과 연결되지 않습니다/);
  assert(await page.locator('#rateScrollBar').count()===0 || await page.locator('#rateScrollBar').isHidden());
  await page.locator('#userAdd').click();await page.locator('#userName').fill('테스트 담당자');await page.locator('#userEmail').fill('QA@example.com');
  await page.locator('#userForm button[type=submit]').click();
  assert(!/초안|예정|준비중/.test(await page.locator('#panel-users').innerText()));
  assert.match(await page.locator('#userRows').innerText(),/qa@example.com/);
  assert(await page.getByRole('button',{name:'초대 링크 발급',exact:true}).isDisabled());
  await page.locator('#userAdd').click();await page.locator('#userName').fill('중복');await page.locator('#userEmail').fill('qa@example.com');await page.locator('#userForm button[type=submit]').click();assert.match(await page.locator('#userMessage').innerText(),/이미 등록/);await page.locator('#userCancel').click();
  await page.getByRole('button',{name:'수정',exact:true}).click();await page.locator('#userRole').selectOption('product');await page.locator('#userForm button[type=submit]').click();assert.match(await page.locator('#userRows').innerText(),/상품담당자/);
  await page.getByRole('button',{name:'이용 중지',exact:true}).click();assert.match(await page.locator('#userRows').innerText(),/이용중지/);
  await page.locator('#userStateFilter').selectOption('pending');assert.match(await page.locator('#userRows').innerText(),/조건에 맞는/);await page.locator('#userStateFilter').selectOption('');
  await page.locator('#userSearch').fill('없는사람');assert.match(await page.locator('#userRows').innerText(),/조건에 맞는/);await page.locator('#userSearch').fill('');
  await page.reload();await page.locator('#tab-users').click();assert.match(await page.locator('#userRows').innerText(),/이용중지/);
  await page.locator('#userAdd').click();await page.locator('#userName').fill('<b>안전한 텍스트</b>');await page.locator('#userEmail').fill('other@example.com');
  await page.evaluate(()=>{window.originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new Error('quota');};});
  await page.locator('#userForm button[type=submit]').click();assert.match(await page.locator('#userMessage').innerText(),/저장하지 못/);assert.equal(await page.locator('#userName').inputValue(),'<b>안전한 텍스트</b>');
  await page.evaluate(()=>Storage.prototype.setItem=window.originalSetItem);await page.locator('#userForm button[type=submit]').click();assert.equal(await page.locator('#userRows b').count(),0);
  for(const [width,height] of [[320,568],[390,844],[768,1024],[1366,900]]){
   await page.setViewportSize({width,height});assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),`overflow ${width}`);
   await page.locator('#userAdd').click();assert(await page.locator('#userName').isVisible());await page.screenshot({path:path.join(out,`${width}-form.png`)});await page.locator('#userCancel').click();
   await page.screenshot({path:path.join(out,`${width}-table.png`)});
  }
  await page.locator('#tab-users').focus();await page.keyboard.press('Home');assert(await page.locator('#panel-sales').isVisible());await page.keyboard.press('End');assert(await page.locator('#panel-users').isVisible());
  const after=await page.evaluate(()=>{const storage={...localStorage};delete storage['db-rate-user-drafts-v1'];return JSON.stringify({storage,rows:RateExport.snapshot('current').rows});});assert.equal(after,before);
  await page.getByRole('button',{name:'삭제',exact:true}).first().click();assert.equal(await page.locator('#userRows tr').count(),1);
  assert.deepEqual(errors,[]);console.log('PASS: four tabs, draft-only create/edit/stop/delete, duplicates, filters, reload, safe text, failed storage retry, keyboard navigation, rate/storage isolation, 320/390/768/1366 layouts.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});


