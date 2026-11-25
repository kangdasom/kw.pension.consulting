const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.RATE_STATUS_PLAYWRIGHT||'playwright');
(async()=>{
  if(process.env.HISTORY_LIVE==='1'){process.env.MONTHLY_LIVE='1';require('./check-monthly-rates-ui.cjs');return;}
  const root=path.resolve(__dirname,'..'),live=process.env.HISTORY_LIVE==='1';
  const base=live?'https://kangdasom.github.io/kw.pension.consulting/':'http://rates.test/kw.pension.consulting/';
  const out=path.join(root,'outputs','rate-history-qa',live?'live':'local');fs.mkdirSync(out,{recursive:true});
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    const context=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true});
    let fixture={version:1,months:[]};
    if(!live){
      await context.route('http://rates.test/**',async route=>{
        const name=new URL(route.request().url()).pathname.replace(/^\/kw\.pension\.consulting\//,'')||'index.html';
        if(name==='rate-history-data.js'&&fixture)return route.fulfill({body:'window.RATE_HISTORY='+JSON.stringify(fixture),contentType:'text/javascript'});
        return route.fulfill({path:path.join(root,name),contentType:name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.woff2')?'font/woff2':name.endsWith('.png')?'image/png':name.endsWith('.json')?'application/json':'text/html'});
      });
      await context.route(/https:\/\/kangdasom\.github\.io\/kw\.pension\.consulting\/notice(?:-dc|-irp)?\.json(?:\?|$)/,route=>route.fulfill({path:path.join(root,path.basename(new URL(route.request().url()).pathname)),contentType:'application/json'}));
    }
    const page=await context.newPage(),errors=[],bad=[];
    page.on('pageerror',error=>errors.push(error.message));page.on('response',response=>{if(response.status()>=400)bad.push(response.url()+':'+response.status());});
    const go=async url=>{await page.goto(base+url);await page.evaluate(()=>document.fonts.ready);};
    const fit=async()=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'page overflow');
    const storage=()=>page.evaluate(()=>JSON.stringify({...localStorage}));
    for(const width of [320,360,390,768,1366]){
      await page.setViewportSize({width,height:900});await go('');
      const links=page.locator('.entry-admin a');
      assert.deepEqual((await links.allTextContents()).map(x=>x.replace(/\s+/g,' ').trim()),['과거 금리표 조회 →','관리자페이지 →']);
      const style=await links.evaluateAll(items=>items.map(item=>{const s=getComputedStyle(item),r=item.getBoundingClientRect();return {size:s.fontSize,weight:s.fontWeight,color:s.color,border:s.borderTopWidth,bg:s.backgroundColor,top:r.top,bottom:r.bottom,height:r.height};}));
      assert.equal(style[0].size,'14px');assert.equal(style[0].weight,style[1].weight);assert.equal(style[0].color,style[1].color);
      assert.ok(Math.abs(style[0].top-style[1].top)<1);assert.ok(style.every(s=>s.height>=44&&s.border==='0px'&&s.bg==='rgba(0, 0, 0, 0)'));
      assert.equal(await page.locator('.entry-admin').evaluate(el=>getComputedStyle(el).borderTopWidth),'0px');await fit();
      if(width===390)await page.screenshot({path:path.join(out,'entry-390.png')});
      const before=await storage();await links.first().click();await page.waitForURL('**/history.html');
      await page.evaluate(()=>document.fonts.ready);
      assert.equal(await page.locator('#historyTitle').innerText(),'과거 금리표');
      assert.ok(await page.locator('#historyMonth').isDisabled());assert.equal(await page.locator('#historyMonth option').count(),1);
      assert.equal(await page.locator('#historyMonth').inputValue(),'');assert.equal(await page.locator('#historyCount').innerText(),'0');
      assert.ok(await page.locator('#historySave').isDisabled());assert.ok(!await page.locator('#historyTable').isVisible());
      assert.equal(await page.locator('#emptyState').innerText(),'보관된 과거 금리표가 없습니다.');
      assert.equal(await page.locator('.filter-panel,.main-tabs,.sort-control,.rate-sort-button').count(),0);
      for(const plan of ['DB','DC','IRP']){await page.selectOption('#historyPlan',plan);assert.ok(await page.locator('#historySave').isDisabled());await fit();}
      assert.equal(await storage(),before,'archive page changed live storage');
      assert.ok(!await page.locator('.floating-rate-head').isVisible());assert.ok(!await page.locator('.floating-rate-scroll').isVisible());
      if(width===390)await page.screenshot({path:path.join(out,'history-empty-390.png')});
      await page.locator('#viewModeButton').click();await fit();assert.equal(await storage(),before);
      await page.locator('.scheme-home').click();await page.waitForURL('**/index.html');
      await page.locator('.entry-admin a[href="admin.html"]').click();await page.waitForURL('**/admin.html');assert.ok(await page.locator('.admin-route-title').isVisible());await fit();
    }
    if(!live){
      // Synthetic archives are injected only in this isolated test browser, never published.
      const documentFor=(month,terms)=>({start:month+'-01',end:month+'-28',maturities:terms,sortLabel:'상품군별 기본순',rows:Array.from({length:35},(_,i)=>({id:'test-'+i,group:1,product:i%2?'GIC I':'은행예금',institution:'검증기관 '+i,grade:'AA',isGic:!!(i%2),cells:terms.map(()=>i%2?'3.00 (3.09)':'2.95'),amount:'PRIVATE_AMOUNT',note:'PRIVATE_NOTE'}))});
      fixture={version:1,months:[{month:'2026-09',plans:{DB:documentFor('2026-09',[12,18,36,60])}},{month:'2026-10',plans:{DB:documentFor('2026-10',[12,18,36,60]),DC:documentFor('2026-10',[3,6,12,24,36,60]),IRP:documentFor('2026-10',[3,6,12,24,36,60])}}]};
      await go('history.html?plan=irp&month=2026-10');
      await page.evaluate(()=>{localStorage.setItem('db-rate-sources-v1','{"sentinel":"current-month"}');localStorage.setItem('db-rate-management-v1','{"sentinel":"management"}');});
      const before=await storage();
      assert.equal(await page.locator('#historyPlan').inputValue(),'IRP');
      for(const width of [320,390,768,1366]){
        await page.setViewportSize({width,height:900});
        for(const plan of ['DB','DC','IRP']){
          await page.selectOption('#historyPlan',plan);await page.selectOption('#historyMonth','2026-10');await fit();
          assert.deepEqual(await page.locator('#historyHead th').allTextContents(),['상품','제공기관','등급',...(plan==='DB'?['1년','1.5년','3년','5년']:['3개월','6개월','1년','2년','3년','5년'])]);
          assert.equal(await page.locator('#rateTableBody tr').count(),35);assert.ok(!await page.locator('#historySave').isDisabled());
          const data=await page.evaluate(()=>RateHistory.snapshot());assert.ok(!JSON.stringify(data).includes('PRIVATE_'));
          assert.equal(data.title,`2026년 10월 원리금보장상품 공시금리 (${plan==='IRP'?'개인IRP':plan})`);
          await page.locator('#historySave').click();await page.waitForFunction(()=>!document.getElementById('exportDownload').disabled);
          const previewBytes=await page.evaluate(async()=>Array.from(new Uint8Array(await(await fetch(document.getElementById('exportImage').src)).arrayBuffer())));
          const downloadEvent=page.waitForEvent('download');await page.locator('#exportDownload').click();const download=await downloadEvent;
          assert.ok(download.suggestedFilename().includes('2026-10'));assert.deepEqual(fs.readFileSync(await download.path()),Buffer.from(previewBytes));
          assert.ok(!await page.locator('.floating-rate-head').isVisible());
          if(width===390&&plan==='DB')await page.screenshot({path:path.join(out,'history-fixture-preview-390.png')});
          await page.keyboard.press('Escape');assert.ok(!await page.locator('#exportModal').isVisible());assert.ok(await page.locator('#historySave').evaluate(el=>document.activeElement===el));
          assert.equal(await storage(),before);
        }
      }
      await page.selectOption('#historyPlan','DB');await page.selectOption('#historyMonth','2026-09');assert.ok((await page.locator('#historyTitle').innerText()).startsWith('2026년 9월'));
      await page.locator('#viewModeButton').click();await fit();
      await page.evaluate(()=>{window.scrollTo(0,400);});await page.waitForTimeout(150);
      assert.ok(await page.locator('.floating-rate-head').isVisible());
      await page.screenshot({path:path.join(out,'history-fixture-1366.png')});
      // An unavailable plan or malformed archive must not display current rates or stale rows.
      fixture.months[1].plans.IRP=null;await go('history.html?plan=irp');assert.ok(await page.locator('#historySave').isDisabled());
      fixture.months[1].plans.IRP={...documentFor('2026-10',[12]),start:'2026-02-31'};await go('history.html?plan=irp');assert.ok(await page.locator('#historySave').isDisabled());
      assert.equal(await storage(),before);
    }
    assert.deepEqual(errors,[]);assert.deepEqual(bad,[]);
    console.log('PASS: history navigation, peer links/no separator, mobile/tablet/PC empty state, disabled save, plan selection, return/admin routes, no storage mutations or JS/HTTP errors'+(live?' on live HTTPS.':'; injected month/plan archives, frozen public fields, shared PNG preview/download byte identity and pinned table header.'));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
