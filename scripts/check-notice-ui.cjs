const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.RATE_STATUS_PLAYWRIGHT||'playwright');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const root=path.resolve(__dirname,'..'),out=path.join(root,'outputs','notice-login-qa');fs.mkdirSync(out,{recursive:true});
 let live={text:'',revision:'initial',updatedAt:null},source={...live};const errors=[],writes=[];
 const plans={DC:{text:'기존 DC 공지',revision:'dc-initial',updatedAt:null},IRP:{text:'기존 IRP 공지',revision:'irp-initial',updatedAt:null}};
 const planFor=file=>file==='notice-dc.json'?'DC':file==='notice-irp.json'?'IRP':'DB';
 async function context(){
  const ctx=await browser.newContext();
  await ctx.route('https://kangdasom.github.io/kw.pension.consulting/**',route=>{
   const file=new URL(route.request().url()).pathname.replace('/kw.pension.consulting/','')||'index.html';
   if(/^notice(?:-dc|-irp)?\.json$/.test(file))return route.fulfill({json:planFor(file)==='DB'?live:plans[planFor(file)]});return route.fulfill({path:path.join(root,file)});
  });
  await ctx.route('https://api.github.com/**',route=>{
   if(route.request().method()!=='GET')writes.push(route.request().method());
   const file=new URL(route.request().url()).pathname.split('/').pop();
   return route.fulfill({json:{content:Buffer.from(JSON.stringify(planFor(file)==='DB'?source:plans[planFor(file)])).toString('base64')}});
  });
  await ctx.route('https://github.com/**',route=>route.fulfill({body:'GitHub login and submission handoff'}));
  return ctx;
 }
 try{
  const ctx=await context(),page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.addInitScript(()=>localStorage.setItem('db-rate-notice-v1','이전 공지'));
  await page.goto('https://kangdasom.github.io/kw.pension.consulting/admin.html');await page.waitForFunction(()=>!document.getElementById('noticeSave').disabled);
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
  const other=await context(),visitor=await other.newPage();await visitor.goto('https://kangdasom.github.io/kw.pension.consulting/?plan=db');
  await visitor.waitForFunction(()=>document.getElementById('noticeBannerText').textContent.includes('모든'));assert.equal(await visitor.locator('#noticeBannerText').textContent(),text);
  await page.locator('#noticeText').fill('가'.repeat(3000));await page.locator('#noticeSave').click();assert(await page.locator('#noticeCopyRequest').isVisible());
  assert.equal(JSON.parse(await page.locator('#noticeRequestBody').inputValue()).notice.text.length,3000);
  await page.reload();await page.waitForFunction(()=>document.getElementById('noticeRequest').hidden===false);await page.locator('#tab-monthly').click();assert.equal((await page.locator('#noticeText').inputValue()).length,3000);
  await page.locator('#noticeStop').click();assert(await page.locator('#noticeSave').isEnabled());assert.equal((await page.locator('#noticeText').inputValue()).length,3000);
  await page.locator('#noticeCancel').click();assert.equal(await page.locator('#noticeText').inputValue(),text);
  await page.locator('#noticeText').fill('');await page.locator('#noticeSave').click();const empty=JSON.parse(new URL(await page.locator('#noticeSubmit').getAttribute('href')).searchParams.get('body'));live={...empty.notice};
  await page.waitForFunction(()=>document.getElementById('noticeMessage').textContent.includes('배포가 완료'),{},{timeout:12000});assert(await page.locator('#noticeBanner').isHidden());
  const dbPublished={...live};
  const choose=async plan=>{await page.locator('#noticePlan').selectOption(plan);await page.waitForFunction(()=>!document.getElementById('noticeText').disabled);};
  await choose('DC');assert.equal(await page.locator('#noticeText').inputValue(),'기존 DC 공지');assert(await page.locator('#noticeLegacy').isHidden());
  await page.locator('#noticeText').fill('DC 미저장 초안');
  await choose('IRP');assert.equal(await page.locator('#noticeText').inputValue(),'기존 IRP 공지');await page.locator('#noticeText').fill('IRP 미저장 초안');
  await choose('DB');assert.equal(await page.locator('#noticeText').inputValue(),'');assert(await page.evaluate(()=>RateNotice.hasUnsaved()));
  await choose('DC');assert.equal(await page.locator('#noticeText').inputValue(),'DC 미저장 초안');
  await page.reload();await page.waitForFunction(()=>!document.getElementById('noticeSave').disabled);await page.locator('#tab-monthly').click();
  await choose('IRP');assert.equal(await page.locator('#noticeText').inputValue(),'IRP 미저장 초안');
  await page.locator('#noticeText').fill('');await choose('DB');await page.reload();
  await page.waitForFunction(()=>!document.getElementById('noticeSave').disabled);await page.locator('#tab-monthly').click();
  // Preserve an intentional empty draft even before its plan is visited after reload.
  await page.reload();await page.waitForFunction(()=>!document.getElementById('noticeSave').disabled);await page.locator('#tab-monthly').click();
  await choose('IRP');assert.equal(await page.locator('#noticeText').inputValue(),'');
  await choose('DC');assert.equal(await page.locator('#noticeText').inputValue(),'DC 미저장 초안');
  for(const plan of ['DC','IRP']){
   await choose(plan);const noticeText=plan+' 전용 공지\n줄바꿈 <b>텍스트</b>';
   await page.locator('#noticeText').fill(noticeText);await page.locator('#noticeSave').click();
   const payload=JSON.parse(new URL(await page.locator('#noticeSubmit').getAttribute('href')).searchParams.get('body'));
   assert.equal(payload.plan,plan);assert.equal(payload.schema,'site-notice-v2');assert.equal(payload.baseRevision,plans[plan].revision);
   // A deployment may finish while another plan is being edited.
   const otherPlan=plan==='DC'?'IRP':'DC';await choose(otherPlan);const otherDraft=await page.locator('#noticeText').inputValue();
   plans[plan]={...payload.notice,updatedAt:new Date().toISOString()};
   assert.equal(await page.locator('#noticeText').inputValue(),otherDraft);
   await page.locator('#noticePlan').selectOption(plan);
   await page.waitForFunction(()=>document.getElementById('noticeMessage').textContent.includes('배포가 완료'),{},{timeout:12000});
   assert.equal(await page.locator('#noticeText').inputValue(),noticeText);
   const publicPage=await other.newPage();await publicPage.goto('https://kangdasom.github.io/kw.pension.consulting/?plan='+plan.toLowerCase());
   await publicPage.waitForFunction(expected=>document.getElementById('noticeBannerText').textContent===expected,noticeText);
   await publicPage.locator('#infoButton').click();
   const guides=await publicPage.locator('#infoModal .guide-list li').allTextContents();
   assert(guides.includes('저축은행 예금은 만기시 원금과 이자 합산하여 기관별 1억원까지 매수가능합니다. 한도 계산 시 DC, IRP에서 매수한 금액은 합산됩니다.'));
   assert(guides.includes('ELB는 청약 모집 후 발행하는 상품으로, 상시 가입 불가합니다.'));
   assert(!guides.includes('상품 매수 전 제공기관의 공시금리와 매수가능여부를 확인해주세요.'));
   assert.equal(await publicPage.locator('#noticeBannerText b').count(),0);
   for(const width of [320,390,768,1366]){
    await publicPage.setViewportSize({width,height:width===320?568:900});
    assert(!await publicPage.evaluate(()=>document.documentElement.scrollWidth>innerWidth));
    const bounds=await publicPage.locator('#infoModal .modal').boundingBox();assert(bounds.height<= (width===320?568:900)*0.9+1);
    if(width===390)await publicPage.screenshot({path:path.join(out,plan.toLowerCase()+'-notice-390.png')});
   }
   await publicPage.close();
  }
  assert.deepEqual(live,dbPublished);
  const irpPublished={...plans.IRP};await choose('DC');await page.locator('#noticeText').fill('');await page.locator('#noticeSave').click();
  const clear=JSON.parse(new URL(await page.locator('#noticeSubmit').getAttribute('href')).searchParams.get('body'));assert.equal(clear.plan,'DC');plans.DC={...clear.notice};
  await page.waitForFunction(()=>document.getElementById('noticeMessage').textContent.includes('배포가 완료'),{},{timeout:12000});assert(await page.locator('#noticeBanner').isHidden());assert.deepEqual(plans.IRP,irpPublished);assert.deepEqual(live,dbPublished);
  await choose('IRP');await page.locator('#noticeText').fill('취소할 IRP 초안');await page.locator('#noticeCancel').click();assert.equal(await page.locator('#noticeText').inputValue(),irpPublished.text);
  await page.locator('#noticeLatest').click();await page.waitForFunction(()=>document.getElementById('noticeMessage').textContent.includes('최신 개인IRP'));
  for(const width of [320,390,768,1366]){await page.setViewportSize({width,height:900});assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth));if(width===390||width===768)await page.screenshot({path:path.join(out,`${width}.png`),fullPage:true});}
  assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
  console.log('PASS: Edge DB/DC/IRP independent drafts, reload, pending deployment across plan switches, publish/clear isolation, exact customer guide text, GitHub handoff, no browser writes, empty/long notices, and 320/390/768/1366px. Submission simulated.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
