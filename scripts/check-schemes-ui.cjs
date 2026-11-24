const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.RATE_STATUS_PLAYWRIGHT||'playwright');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const root=path.resolve(__dirname,'..'),live=process.env.SCHEMES_LIVE==='1';
  const out=path.join(root,'outputs','scheme-qa',live?'live':'local');fs.mkdirSync(out,{recursive:true});
  const context=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true});
  const page=await context.newPage(),errors=[],bad=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&/\.(?:js|css|woff2|png|json)(?:\?|$)/.test(r.url()))bad.push(r.url());});
  const base=live?'https://kangdasom.github.io/kw.pension.consulting/':'http://rates.test/kw.pension.consulting/';
  if(!live){
   await context.route('http://rates.test/**',route=>{const name=new URL(route.request().url()).pathname.replace(/^\/kw\.pension\.consulting\//,'')||'index.html';return route.fulfill({path:path.join(root,name),contentType:name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.woff2')?'font/woff2':name.endsWith('.png')?'image/png':name.endsWith('.json')?'application/json':'text/html'});});
   await context.route('https://kangdasom.github.io/kw.pension.consulting/notice.json*',route=>route.fulfill({path:path.join(root,'notice.json'),contentType:'application/json'}));
  }
  const go=async(plan='')=>{await page.goto(base+(plan?'index.html?plan='+plan:''));await page.evaluate(()=>document.fonts.ready);};
  const fit=async()=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'document overflow');
  const summary=[];
  for(const width of [320,390,768,1366]){
   await page.setViewportSize({width,height:900});await go();
   assert.ok(await page.locator('#schemeEntry').isVisible());assert.ok(!await page.locator('.app-shell').isVisible());
   assert.deepEqual(await page.locator('.entry-plans a').allTextContents(),['DB','DC','개인IRP']);
   assert.equal(await page.locator('.entry-plans').innerText(),'DB\nDC\n개인IRP');await fit();
   const order=await page.evaluate(()=>({period:document.querySelector('.entry-period').getBoundingClientRect().bottom,plans:document.querySelector('.entry-plans').getBoundingClientRect().top}));assert.ok(order.period<order.plans);
   assert.ok(!await page.locator('.floating-rate-scroll').first().isVisible());
   if(width===390)await page.screenshot({path:path.join(out,'entry-390.png')});
   for(const plan of ['db','dc','irp']){
    await page.locator('.entry-plans a').nth(['db','dc','irp'].indexOf(plan)).click();
    await page.evaluate(()=>document.fonts.ready);assert.ok(await page.locator('.app-shell').isVisible());assert.ok(!await page.locator('#schemeEntry').isVisible());await fit();
    const result=await page.evaluate(()=>({scheme:RateScheme.id,title:document.querySelector('.page-heading h1').textContent,rows:filteredRows().map(r=>({id:r.id,lineup:r.lineup})),sources:rates.map(r=>({id:r.id,terms:r.terms})),filter:els.lineupFilter.value,all:RateExport.snapshot('all'),storage:JSON.stringify({...localStorage})}));
    assert.equal(result.scheme,plan.toUpperCase());assert.equal(result.filter,'Y');assert.ok(result.rows.length>0);assert.ok(result.rows.every(r=>r.lineup==='Y'));
    assert.equal(result.title,'2026년 11월 원리금보장상품 공시금리 ('+(plan==='irp'?'개인IRP':plan.toUpperCase())+')');
    assert.equal(result.all.title,result.title);
    if(plan!=='db'){
     assert.equal(await page.locator('#panel-sales .rate-status-trigger').count(),0);
     assert.ok(!await page.locator('.main-tabs').isVisible());
     assert.ok(!await page.locator('#proposalFilter').isVisible());assert.ok(result.all.rows.every(r=>result.rows.some(p=>p.id===r.id)));
     assert.ok(!result.all.title.includes('DB'));assert.ok(result.all.filename.includes(plan==='irp'?'개인IRP':plan.toUpperCase()));
     assert.equal(result.sources.length,90);
    }else assert.equal(result.sources.length,98);
    const fifth=await page.locator('.sales-rate-table th.rate-head').last().boundingBox();assert.ok(fifth.x+fifth.width<=width+1,'5y column beyond initial viewport');
    if(width===390){
     summary.push({plan,rows:result.rows.length});
     await page.screenshot({path:path.join(out,plan+'-390.png')});
     await page.locator('#saveButton').click();await page.locator('#previewButton').click();await page.waitForFunction(()=>!document.getElementById('exportImage').hidden);
     const preview=await page.locator('#exportImage').getAttribute('src');
     const bytes=await page.evaluate(async url=>Array.from(new Uint8Array(await(await fetch(url)).arrayBuffer())),preview);
     const pending=page.waitForEvent('download');await page.locator('#exportDownload').click();const downloaded=await pending;const downloadedPath=await downloaded.path();assert.deepEqual(fs.readFileSync(downloadedPath),Buffer.from(bytes));
     fs.writeFileSync(path.join(out,plan+'-current.png'),Buffer.from(bytes));
     await page.locator('#exportClose').click();
     if(plan!=='db'){
      await page.locator('#sales-view-tab-ranking').click();await page.locator('[data-ranking-index="0"]').click();
      assert.equal(await page.locator('.ranking-grid .rate-status-trigger').count(),0);assert.ok(!await page.locator('#rankingProposal').isVisible());
      assert.ok(await page.locator('.ranking-grid tbody tr').count());await page.locator('#sales-view-tab-full').click();
      await page.locator('#infoButton').click();const guide=await page.locator('#infoModal .guide-list').innerText();assert.ok(!guide.includes('제안가능'),JSON.stringify({guide,errors}));await page.locator('[data-close="infoModal"]').click();
     }
    }
    await page.locator('.scheme-home').click();await page.locator('#schemeEntry').waitFor({state:'visible'});assert.ok(await page.locator('#schemeEntry').isVisible());
   }
  }
  // Manual DB and shared DCIRP lineups remain independent and survive navigation.
  await go('db');
  const id=await page.evaluate(()=>rates.find(r=>r.lineup==='Y'&&SCHEME_RATE_DATA.lineupSeed.products[r.id]?.dcirpLineup==='Y').id);
  await page.locator('#tab-basic').click();await page.locator('#showLineups').click();
  const dcControl=page.locator('select[data-product="'+id+'"][data-field="dcirpLineup"]');
  assert.equal(await dcControl.inputValue(),'Y');await dcControl.selectOption('N');await page.locator('#saveBasic').click();
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('db-rate-management-v1')));
  assert.equal(saved.products[id].lineup,'Y');assert.equal(saved.products[id].dcirpLineup,'N');
  const months=JSON.stringify(saved.months);
  for(const plan of ['dc','irp']){await go(plan);assert.ok(!await page.evaluate(id=>filteredRows().some(r=>r.id===id),id));}
  await go('db');assert.ok(await page.evaluate(id=>filteredRows().some(r=>r.id===id),id));
  assert.equal(await page.evaluate(()=>JSON.stringify(JSON.parse(localStorage.getItem('db-rate-management-v1')).months)),months);
  // Read the actual XLSX with the browser parser and reconcile every accepted rate.
  if(!live){
   const raw=fs.readFileSync(path.join(root,'outputs','scheme-qa','당사업로드양식_변환완료_2026년11월.xlsx'));
   const audit=await page.evaluate(async bytes=>{
    const book=await RateXlsx.open(new File([new Uint8Array(bytes)],'rates.xlsx'));
    const rows=await book.rows(0),result=RateUpload.validateAll(rows);
    return {columns:rows.rateColumns,fatal:result.fatal,plans:Object.fromEntries(Object.entries(result.plans).map(([plan,r])=>[plan,{count:r.snapshot.acceptedTerms,products:r.snapshot.products,excluded:r.snapshot.defaultOptionExcluded}]))};
   },Array.from(raw));
   assert.deepEqual(audit.columns,{DB:'J',DC:'K',IRP:'M'});assert.deepEqual(audit.fatal,[]);
   const bundle=await page.evaluate(()=>RateScheme.bundled);
   for(const plan of ['DB','DC','IRP']){
    assert.equal(audit.plans[plan].count,bundle[plan].acceptedTerms);assert.equal(audit.plans[plan].excluded,5);
    assert.deepEqual(audit.plans[plan].products.map(p=>[p.id,p.terms]),bundle[plan].products.map(p=>[p.id,p.terms]));
   }
   // UI validation/cancel/confirmation commits all three snapshots together.
   await page.locator('#tab-monthly').click();await page.locator('#manageImport').click();
   await page.locator('#uploadFile').setInputFiles({name:'rates.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:raw});
   await page.waitForFunction(()=>!document.getElementById('uploadValidate').disabled);await page.locator('#uploadValidate').click();
   assert.ok((await page.locator('.upload-plan-summary').innerText()).includes('개인IRP'));
   await page.locator('#uploadApply').click();await page.locator('#uploadCancel').click();
   assert.equal(await page.evaluate(()=>localStorage.getItem('db-rate-sources-v1')),null);
   await page.locator('#uploadApply').click();await page.locator('#uploadConfirm').click();
   const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('db-rate-sources-v1')));
   assert.equal(state.months['2026-11'].acceptedTerms,407);assert.equal(state.customerPlans.DC.months['2026-11'].acceptedTerms,369);assert.equal(state.customerPlans.IRP.months['2026-11'].acceptedTerms,369);
   assert.equal(await page.evaluate(()=>JSON.stringify(JSON.parse(localStorage.getItem('db-rate-management-v1')).months)),months);
  }
  assert.deepEqual(errors,[]);assert.deepEqual(bad,[]);
  console.log('PASS: entry/three plan URLs/return; 320/390/768/1366px; initial lineup Y; customer status/admin omission; independent lineups; current PNG/download equality; exact source reconciliation and atomic multi-plan upload. '+JSON.stringify(summary));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
