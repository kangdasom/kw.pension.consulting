const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.RATE_STATUS_PLAYWRIGHT||'playwright');
(async()=>{
 const root=path.resolve(__dirname,'..'),live=process.env.NOTES_LIVE==='1',out=path.join(root,'outputs','export-notes-qa',live?'live':'local');fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const base=live?'https://kangdasom.github.io/kw.pension.consulting/':'http://notes.test/';
  if(!live){await context.route('http://notes.test/**',r=>{const name=new URL(r.request().url()).pathname.slice(1)||'index.html';return r.fulfill({path:path.join(root,name),contentType:name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.png')?'image/png':name.endsWith('.woff2')?'font/woff2':name.endsWith('.json')?'application/json':'text/html'});});await context.route('https://kangdasom.github.io/kw.pension.consulting/notice.json*',r=>r.fulfill({path:path.join(root,'notice.json'),contentType:'application/json'}));}
  const gic='* GIC 금리는 공시금리 (단리연환산금리) 입니다.',buy='* 상품 매수 전 매수가능여부를 확인해주세요.';
  const inspect=async(scope,expected)=>{
   const result=await page.evaluate(scope=>{const data=RateExport.snapshot(scope),canvas=document.createElement('canvas'),ctx=canvas.getContext('2d'),texts=[],fill=ctx.fillText;ctx.fillText=function(text){texts.push(text);return fill.apply(this,arguments);};const dims=RateExport.draw(canvas,data);return {texts,dims,rows:data.rows.length};},scope);
   assert.equal(result.texts.includes(gic),expected);assert.ok(result.texts.includes(buy));assert.ok(result.rows);return result;
  };
  for(const plan of ['db','dc','irp']){
   await page.goto(base+'index.html?plan='+plan);await page.evaluate(()=>document.fonts.ready);
   const before=await page.evaluate(()=>JSON.stringify({...localStorage}));
   await inspect('current',true);
   await page.locator('#categoryTrigger').click();
   for(const value of ['파생결합사채','보험'])await page.locator('#categoryMenu input[value="'+value+'"]').uncheck();
   for(const value of ['은행예금','저축은행예금'])await page.locator('#categoryMenu input[value="'+value+'"]').check();
   await page.locator('#categoryTrigger').click();await inspect('current',false);await inspect('all',true);
   await page.locator('#sales-view-tab-ranking').click();
   const index=plan==='db'?0:2;
   for(const group of [2,3]){await page.locator('[data-ranking-group="'+group+'"]').click();await page.locator('[data-ranking-index="'+index+'"]').click();}
   await inspect('current',false);
   await page.evaluate(()=>{window.notePaint=[];const draw=RateExport.draw;RateExport.draw=(canvas,data)=>{const ctx=canvas.getContext('2d'),fill=ctx.fillText;ctx.fillText=function(text){notePaint.push(text);return fill.apply(this,arguments);};return draw(canvas,data);};});
   await page.locator('#saveButton').click();await page.locator('#previewButton').click();await page.waitForFunction(()=>!document.getElementById('exportImage').hidden);
   const png=await page.evaluate(async()=>({texts:notePaint,bytes:Array.from(new Uint8Array(await(await fetch(document.getElementById('exportImage').src)).arrayBuffer()))}));
   assert.ok(!png.texts.includes(gic));assert.ok(png.texts.includes(buy));
   const pending=page.waitForEvent('download');await page.locator('#exportDownload').click();const downloaded=await pending;assert.deepEqual(fs.readFileSync(await downloaded.path()),Buffer.from(png.bytes));fs.writeFileSync(path.join(out,plan+'-banks.png'),Buffer.from(png.bytes));
   await page.locator('#exportClose').click();await page.locator('[data-ranking-group="1"]').click();await page.locator('[data-ranking-index="'+index+'"]').click();await inspect('current',true);
   assert.equal(await page.evaluate(()=>JSON.stringify({...localStorage})),before);
  }
  assert.deepEqual(errors,[]);console.log('PASS: DB/DC/IRP current/all, ordinary/bank comparison/mixed GIC comparison, actual preview/download equality and unchanged storage.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
