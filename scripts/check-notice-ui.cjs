const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.RATE_STATUS_PLAYWRIGHT||'playwright');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const root=path.resolve(__dirname,'..'),out=path.join(root,'outputs','notice-login-qa');fs.mkdirSync(out,{recursive:true});
 let live={text:'',revision:'initial',updatedAt:null},source={...live};const errors=[],writes=[];
 async function context(){
  const ctx=await browser.newContext();
  await ctx.route('https://kangdasom.github.io/kw.pension.consulting/**',route=>{
   const file=new URL(route.request().url()).pathname.replace('/kw.pension.consulting/','')||'index.html';
   if(file==='notice.json')return route.fulfill({json:live});return route.fulfill({path:path.join(root,file)});
  });
  await ctx.route('https://api.github.com/**',route=>{
   if(route.request().method()!=='GET')writes.push(route.request().method());
   return route.fulfill({json:{content:Buffer.from(JSON.stringify(source)).toString('base64')}});
  });
  await ctx.route('https://github.com/**',route=>route.fulfill({body:'GitHub login and submission handoff'}));
  return ctx;
 }
 try{
  const ctx=await context(),page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.addInitScript(()=>localStorage.setItem('db-rate-notice-v1','이전 공지'));
  await page.goto('https://kangdasom.github.io/kw.pension.consulting/');await page.waitForFunction(()=>!document.getElementById('noticeSave').disabled);
  assert.equal(await page.locator('#noticeCredential').count(),0);
  await page.locator('#tab-monthly').click();await page.locator('#noticeLegacy').click();assert.equal(await page.locator('#noticeText').inputValue(),'이전 공지');
  const text='모든 방문자 공지\n<em>문자 그대로</em> 😀';await page.locator('#noticeText').fill(text);
  const popupPromise=page.waitForEvent('popup');await page.locator('#noticeSave').click();const popup=await popupPromise;
  await popup.waitForLoadState();const url=new URL(popup.url());assert.equal(url.hostname,'github.com');
  const payload=JSON.parse(url.searchParams.get('body'));assert.equal(payload.notice.text,text);assert.equal(payload.baseRevision,'initial');
  assert.equal(await page.locator('#noticeBannerText').textContent(),'');assert(await page.locator('#noticeSave').isDisabled());
  // Simulate the owner-authorized server result. No real issue is submitted.
  live={...payload.notice,updatedAt:new Date().toISOString()};source={...live};
  await page.waitForFunction(()=>document.getElementById('noticeMessage').textContent.includes('배포가 완료'),{},{timeout:12000});
  assert.equal(await page.locator('#noticeBannerText').textContent(),text);assert.equal(await page.locator('#noticeBannerText em').count(),0);
  const other=await context(),visitor=await other.newPage();await visitor.goto('https://kangdasom.github.io/kw.pension.consulting/');
  await visitor.waitForFunction(()=>document.getElementById('noticeBannerText').textContent.includes('모든'));assert.equal(await visitor.locator('#noticeBannerText').textContent(),text);
  await page.locator('#noticeText').fill('가'.repeat(3000));await page.locator('#noticeSave').click();assert(await page.locator('#noticeCopyRequest').isVisible());
  assert.equal(JSON.parse(await page.locator('#noticeRequestBody').inputValue()).notice.text.length,3000);
  await page.reload();await page.waitForFunction(()=>document.getElementById('noticeRequest').hidden===false);await page.locator('#tab-monthly').click();assert.equal((await page.locator('#noticeText').inputValue()).length,3000);
  await page.locator('#noticeStop').click();assert(await page.locator('#noticeSave').isEnabled());assert.equal((await page.locator('#noticeText').inputValue()).length,3000);
  await page.locator('#noticeCancel').click();assert.equal(await page.locator('#noticeText').inputValue(),text);
  await page.locator('#noticeText').fill('');await page.locator('#noticeSave').click();const empty=JSON.parse(new URL(await page.locator('#noticeSubmit').getAttribute('href')).searchParams.get('body'));live={...empty.notice};
  await page.waitForFunction(()=>document.getElementById('noticeMessage').textContent.includes('배포가 완료'),{},{timeout:12000});assert(await page.locator('#noticeBanner').isHidden());
  for(const width of [320,390,768,1366]){await page.setViewportSize({width,height:900});assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth));if(width===390||width===768)await page.screenshot({path:path.join(out,`${width}.png`),fullPage:true});}
  assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
  console.log('PASS: Edge GitHub handoff without key, no browser API writes, isolated visitors, pending/live distinction, long-content fallback, draft/reload, cancellation, empty notice and 320/390/768/1366px. Submission simulated.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
