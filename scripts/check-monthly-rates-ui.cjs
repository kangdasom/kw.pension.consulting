const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {chromium}=require(process.env.RATE_STATUS_PLAYWRIGHT||'playwright');
(async()=>{
 const root=path.resolve(__dirname,'..'),live=process.env.MONTHLY_LIVE==='1';
 const base=live?'https://kangdasom.github.io/kw.pension.consulting/':'http://rates.test/kw.pension.consulting/';
 const out=path.join(root,'outputs','monthly-rates-qa',live?'live':'local');fs.mkdirSync(out,{recursive:true});
 const catalog={window:{}};for(const file of ['rates-data.js','scheme-rates-data.js','rate-history-data.js','scripts/fixtures/rates-november.js'])vm.runInNewContext(fs.readFileSync(path.join(root,file),'utf8'),catalog);
 const oldDB=catalog.window.RATE_IMPORT;
 vm.runInNewContext(fs.readFileSync(path.join(root,'rates-data.js'),'utf8'),catalog);
 const expected={DB:catalog.window.RATE_IMPORT,...catalog.window.SCHEME_RATE_DATA.snapshots};
 const oldCustomer={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'scripts/fixtures/scheme-rates-november.js'),'utf8'),oldCustomer);
 const saved={activeMonth:'2026-11',months:{'2026-11':oldDB},customerPlans:Object.fromEntries(['DC','IRP'].map(p=>[p,{activeMonth:'2026-11',months:{'2026-11':oldCustomer.window.SCHEME_RATE_DATA.snapshots[p]}}]))};
 const oldManagement={institutions:{IL05:{grade:'AAA',pension:'N'}},products:{'IL05|1001|':{lineup:'Y',dcirpLineup:'Y'}},months:{'2026-11':{'["IL05|1001|","18"]':{status:'N',amount:'보존 한도',note:'보존 비고'}}}};
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:390,height:900},acceptDownloads:true});
  await context.addInitScript(({saved,management})=>{if(!sessionStorage.getItem('monthly-qa-seeded')){localStorage.setItem('db-rate-sources-v1',JSON.stringify(saved));localStorage.setItem('db-rate-management-v1',JSON.stringify(management));sessionStorage.setItem('monthly-qa-seeded','1');}},{saved,management:oldManagement});
  if(!live)await context.route('**/*',route=>{
   const url=new URL(route.request().url());if(!['rates.test','kangdasom.github.io'].includes(url.hostname))return route.abort();
   const name=url.pathname.replace(/^\/kw\.pension\.consulting\//,'')||'index.html';
   return route.fulfill({path:path.join(root,name),contentType:name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.woff2')?'font/woff2':name.endsWith('.png')?'image/png':name.endsWith('.json')?'application/json':'text/html'});
  });
  const page=await context.newPage(),errors=[],bad=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)bad.push(r.url()+':'+r.status());});
  const go=async url=>{await page.goto(base+url);await page.evaluate(()=>document.fonts.ready);};
  const fit=async()=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'document overflow');
  const storage=()=>page.evaluate(()=>JSON.stringify({...localStorage}));
  const preview=async()=>{
   await page.waitForFunction(()=>!document.getElementById('exportDownload').disabled);
   const bytes=await page.evaluate(async()=>Array.from(new Uint8Array(await(await fetch(document.getElementById('exportImage').src)).arrayBuffer())));
   const wait=page.waitForEvent('download');await page.locator('#exportDownload').click();const download=await wait;
   assert.deepEqual(fs.readFileSync(await download.path()),Buffer.from(bytes));return Buffer.from(bytes);
  };
  await go('');const before=await storage();
  for(const width of [320,390,768,1366]){
   await page.setViewportSize({width,height:900});await go('');
   assert.equal(await page.locator('.entry-month').innerText(),'2026년 12월');assert.match(await page.locator('.entry-period').innerText(),/2026\.12\.01 ~ 2026\.12\.31/);await fit();
   for(const plan of ['DB','DC','IRP']){
    await go('index.html?plan='+plan.toLowerCase());await fit();
    const data=await page.evaluate(()=>({source:window.RATE_IMPORT,title:document.querySelector('.page-heading h1').textContent,period:document.querySelector('.page-heading p').textContent,rows:rates.map(p=>({id:p.id,terms:p.terms})),current:RateExport.snapshot('current'),all:RateExport.snapshot('all'),proposal:termProposalState(rates.find(r=>r.id==='IL05|1001|'),18),grade:rates.find(r=>r.id==='IL05|1001|').grade,pension:rates.find(r=>r.id==='IL05|1001|').pension,heads:[...document.querySelectorAll('.sales-rate-table th.rate-head')].map(x=>x.textContent.replace('▼','').trim())}));
    assert.equal(data.source.month,'2026-12');assert.equal(data.source.sha256,expected[plan].sha256);
    assert.equal(data.rows.length,plan==='DB'?115:101);
    assert.deepEqual(data.rows,JSON.parse(JSON.stringify(expected[plan].products.map(p=>({id:p.id,terms:p.terms})))));
    assert.equal(data.title,`2026년 12월 원리금보장상품 공시금리 (${plan==='IRP'?'개인IRP':plan})`);assert.match(data.period,/2026\.12\.01 ~ 2026\.12\.31/);
    assert.equal(data.current.title,data.title);assert.equal(data.all.period,'2026-12-01 ~ 2026-12-31');
    assert.equal(data.grade,'AAA');assert.equal(data.pension,'N');assert.equal(data.proposal,'확인');
    assert.deepEqual(data.heads,plan==='DB'?['1년','1.5년','3년','5년']:['3개월','6개월','1년','2년','3년','5년']);
    if(width===390){
     await page.screenshot({path:path.join(out,plan.toLowerCase()+'-390.png')});
     await page.locator('#saveButton').click();await page.locator('#previewButton').click();
     fs.writeFileSync(path.join(out,plan.toLowerCase()+'-current.png'),await preview());await page.locator('#exportClose').click();
     if(plan==='DB'){
      await page.locator('#saveButton').click();await page.locator('[data-save-scope="all"]').click();await page.locator('#previewButton').click();
      fs.writeFileSync(path.join(out,'db-all.png'),await preview());await page.locator('#exportClose').click();
     }
    }
    assert.equal(await storage(),before,'Current page changed existing source or management storage');
   }
   await go('history.html');assert.equal(await page.locator('#historyMonth').inputValue(),'2026-11');assert.ok(!await page.locator('#historySave').isDisabled());await fit();
   for(const plan of ['DB','DC','IRP']){
    await page.selectOption('#historyPlan',plan);await fit();
    const document=catalog.window.RATE_HISTORY.months.find(m=>m.month==='2026-11').plans[plan];
    assert.equal(await page.locator('#historyCount').innerText(),String(document.rows.length));
    assert.equal(await page.locator('#historyTitle').innerText(),`2026년 11월 원리금보장상품 공시금리 (${plan==='IRP'?'개인IRP':plan})`);
    const archive=await page.evaluate(()=>RateHistory.snapshot());assert.deepEqual(archive.rows,JSON.parse(JSON.stringify(document.rows)));
    assert.equal(archive.period,'2026-11-01 ~ 2026-11-30');assert.equal(await page.locator('.filter-panel,.main-tabs,.rate-sort-button').count(),0);
    if(width===390){await page.screenshot({path:path.join(out,'history-'+plan.toLowerCase()+'-390.png')});await page.locator('#historySave').click();fs.writeFileSync(path.join(out,'history-'+plan.toLowerCase()+'.png'),await preview());await page.locator('#exportClose').click();}
    assert.equal(await storage(),before,'Archive changed existing storage');
   }
  }
  await go('admin.html');await page.locator('#panel-monthly').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>window.RATE_IMPORT.month),'2026-12');
  if(!live&&process.env.MONTHLY_XLSX){
   const bytes=Array.from(fs.readFileSync(process.env.MONTHLY_XLSX));
   const audit=await page.evaluate(async bytes=>{const book=await RateXlsx.open(new File([new Uint8Array(bytes)],'rates.xlsx'));const rows=await book.rows(0),result=RateUpload.validateAll(rows,{date1904:book.date1904});return {rows:rows.length,fatal:result.fatal,plans:Object.fromEntries(Object.entries(result.plans).map(([plan,r])=>[plan,{issues:r.issues,matching:r.matching,products:r.snapshot.products}]))};},bytes);
   assert.equal(audit.rows,509);assert.deepEqual(audit.fatal,[]);
   for(const [plan,r] of Object.entries(audit.plans)){assert.deepEqual(r.issues,[]);assert.deepEqual(r.matching,[]);assert.deepEqual(r.products.map(p=>[p.id,p.terms]),JSON.parse(JSON.stringify(expected[plan].products.map(p=>[p.id,p.terms]))));}
  }
  assert.equal(await storage(),before);assert.deepEqual(errors,[]);assert.deepEqual(bad,[]);
  console.log('PASS: '+(live?'LIVE HTTPS':'local Edge')+' December DB/DC/IRP exact source/title/period/terms, November archive 98/49/49 rows/cells, current/all/archive actual PNG preview-download identity, old source cache superseded without writes, previous management preserved, 320/390/768/1366px without overflow/JS/HTTP errors.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
