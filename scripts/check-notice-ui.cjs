const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.RATE_STATUS_PLAYWRIGHT||'playwright');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const root=path.resolve(__dirname,'..'),out=path.join(root,'outputs','notice-publish-qa');fs.mkdirSync(out,{recursive:true});
 let live={text:'',revision:'initial',updatedAt:null},source={...live},fail=0,puts=0;
 const errors=[];
 async function context(){
  const ctx=await browser.newContext();
  await ctx.route('https://kangdasom.github.io/kw.pension.consulting/**',route=>{
   const file=new URL(route.request().url()).pathname.replace('/kw.pension.consulting/','')||'index.html';
   if(file==='notice.json')return route.fulfill({json:live});
   if(/\.(html|css|js)$/.test(file) && process.env.NOTICE_QA_STAGED)return route.fulfill({contentType:file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':'text/javascript',body:require('node:child_process').execFileSync('git',['show',':'+file],{cwd:root,encoding:'utf8'})});
   return route.fulfill({path:path.join(root,file)});
  });
  await ctx.route('https://api.github.com/**',async route=>{
   const request=route.request();
   if(request.method()==='PUT'){
    puts++;assert.equal(request.headers().authorization,'Bearer test-credential');
    if(fail)return route.fulfill({status:fail,json:{}});
    const body=request.postDataJSON();assert.equal(body.sha,'sha');
    source=JSON.parse(Buffer.from(body.content,'base64').toString('utf8'));
    return route.fulfill({json:{}});
   }
   return route.fulfill({json:{sha:'sha',content:Buffer.from(JSON.stringify(source)).toString('base64')}});
  });
  return ctx;
 }
 try{
  const ctx=await context(),page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.addInitScript(()=>localStorage.setItem('db-rate-notice-v1','이전 브라우저 공지'));
  await page.goto('https://kangdasom.github.io/kw.pension.consulting/');
  await page.waitForFunction(()=>!document.getElementById('noticeSave').disabled);
  await page.locator('#tab-monthly').click();await page.locator('#noticeLegacy').click();
  assert.equal(await page.locator('#noticeText').inputValue(),'이전 브라우저 공지');
  await page.locator('#noticeSave').click();assert.equal(puts,0);
  await page.locator('#noticeCredential').fill('test-credential');
  const content='전체 방문자 공지\n<em>문자 그대로</em> 😀';
  await page.locator('#noticeText').fill(content);await page.locator('#noticeSave').click();
  await page.waitForFunction(()=>document.getElementById('noticeMessage').textContent.includes('자동 배포'));
  assert.equal(await page.locator('#noticeCredential').inputValue(),'');assert.equal(puts,1);
  assert.equal(await page.locator('#noticeBannerText').textContent(),'');
  await page.evaluate(()=>document.getElementById('noticeSave').click());assert.equal(puts,1);
  live={...source};
  await page.waitForFunction(()=>document.getElementById('noticeMessage').textContent.includes('배포가 완료'),{},{timeout:12000});
  assert.equal(await page.locator('#noticeBannerText').textContent(),content);
  assert.equal(await page.locator('#noticeBannerText em').count(),0);
  assert(!await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}).includes('test-credential')));
  const other=await context(),visitor=await other.newPage();
  await visitor.goto('https://kangdasom.github.io/kw.pension.consulting/');await visitor.waitForFunction(()=>document.getElementById('noticeBannerText').textContent.includes('全')||document.getElementById('noticeBannerText').textContent.includes('전체'));
  assert.equal(await visitor.locator('#noticeBannerText').textContent(),content);
  source={text:'다른 담당자가 수정',revision:'newer',updatedAt:null};
  await page.locator('#noticeText').fill('충돌한 초안');await page.locator('#noticeCredential').fill('test-credential');await page.locator('#noticeSave').click();
  await page.waitForFunction(()=>document.getElementById('noticeMessage').textContent.includes('다른 게시'));
  assert.equal(puts,1);assert.equal(await page.locator('#noticeText').inputValue(),'충돌한 초안');
  await page.locator('#noticeLatest').click();await page.waitForFunction(()=>document.getElementById('noticeText').value==='다른 담당자가 수정');
  fail=403;await page.locator('#noticeText').fill('권한 실패 초안');await page.locator('#noticeCredential').fill('test-credential');await page.locator('#noticeSave').click();
  await page.waitForFunction(()=>document.getElementById('noticeMessage').textContent.includes('권한이 없습니다'));
  assert.equal(await page.locator('#noticeText').inputValue(),'권한 실패 초안');
  fail=0;await page.locator('#noticeText').fill('');await page.locator('#noticeCredential').fill('test-credential');await page.locator('#noticeSave').click();
  await page.waitForFunction(()=>document.getElementById('noticeMessage').textContent.includes('자동 배포'));live={...source};
  await page.waitForFunction(()=>document.getElementById('noticeMessage').textContent.includes('배포가 완료'),{},{timeout:12000});
  assert(await page.locator('#noticeBanner').isHidden());
  for(const width of [320,390,768,1366]){
   await page.setViewportSize({width,height:900});
   assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth));
   if(width===390||width===768)await page.screenshot({path:path.join(out,`${width}.png`),fullPage:true});
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: isolated Edge, separate visitors, legacy import, credentials, pending/live distinction, duplicate guard, conflict, permission failure, empty publication, 320/390/768/1366px. GitHub writes simulated.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
