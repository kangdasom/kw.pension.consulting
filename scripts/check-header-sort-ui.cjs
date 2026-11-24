const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.RATE_STATUS_PLAYWRIGHT||'playwright');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const root=path.resolve(__dirname,'..'),live=process.env.HEADER_SORT_LIVE==='1';
  const out=path.join(root,'outputs','header-sort-qa',live?'live':'local');
  fs.mkdirSync(out,{recursive:true});
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,acceptDownloads:true});
  const page=await context.newPage(),errors=[],bad=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',response=>{if(response.status()>=400)bad.push(response.url()+':'+response.status());});
  if(!live){await context.route('http://rates.test/**',route=>{
   const name=new URL(route.request().url()).pathname.slice(1)||'index.html';
   return route.fulfill({path:path.join(root,name),contentType:name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.woff2')?'font/woff2':name.endsWith('.png')?'image/png':name.endsWith('.json')?'application/json':'text/html'});
  });
  await context.route(/https:\/\/kangdasom\.github\.io\/kw\.pension\.consulting\/notice(?:-dc|-irp)?\.json(?:\?|$)/,route=>route.fulfill({path:path.join(root,path.basename(new URL(route.request().url()).pathname)),contentType:'application/json'}));
  }
  const base=live?'https://kangdasom.github.io/kw.pension.consulting/':'http://rates.test/';
  const source='#panel-sales .sales-rate-table',head=i=>page.locator(`${source} [data-rate-sort="${i}"]`);
  const state=()=>page.evaluate(()=>({
   ids:filteredRows().map(r=>r.id),data:JSON.stringify(rates),storage:JSON.stringify({...localStorage}),
   filters:[els.ratingFilter.value,els.pensionFilter.value,els.lineupFilter.value,els.proposalFilter.value,checked(),selectedMaturities()],
   all:RateExport.snapshot('all',new Date('2026-11-24T00:00:00Z')),
  }));
  async function checkSort(index,label){
   assert.equal(await page.locator('#sortFilter').inputValue(),'rate');
   assert.equal(await page.locator('#maturitySort').inputValue(),String(index));
   assert.ok(await page.locator('#maturitySortWrap').isVisible());
   assert.equal(await head(index).innerText(),label+'▼');
   assert.equal(await page.locator(`${source} th[aria-sort="descending"]`).count(),1);
   assert.equal(await head(index).locator('..').getAttribute('aria-sort'),'descending');
   const values=await page.locator('#rateTableBody tr').evaluateAll((rows,index)=>rows.map(row=>{
    const text=row.cells[index+3].textContent,match=text.match(/\(([\d.]+)\)/);
    return match?Number(match[1]):/\d/.test(text)?parseFloat(text):null;
   }),index);
   let previous=Infinity;
   for(const value of values){const current=value??-Infinity;assert.ok(current<=previous,'displayed effective rates descend, missing rates last');previous=current;}
   const snapshot=await page.evaluate(()=>RateExport.snapshot('current'));
   assert.equal(snapshot.sortLabel,label+' 금리 높은 순');
  }
  for(const width of [320,390,768,1366]){
   await page.setViewportSize({width,height:900});
   for(const plan of ['db','dc','irp']){
    await page.goto(base+'?plan='+plan);await page.evaluate(()=>document.fonts.ready);
    if(width===1366&&!await page.locator('body').evaluate(el=>el.classList.contains('desktop-view')))await page.locator('#viewModeButton').click();
    const height=await page.locator(`${source} th.rate-head`).first().evaluate(th=>({actual:th.getBoundingClientRect().height,expected:parseFloat(getComputedStyle(th).getPropertyValue('--sales-head-height'))}));
    assert.equal(height.actual,height.expected,'existing header height retained');
    const labels=plan==='db'?['1년','1.5년','3년','5년']:['3개월','6개월','1년','2년','3년','5년'];
    assert.equal(await page.locator(`${source} th[aria-sort="descending"]`).count(),plan==='db'?1:0);
    // Include all product groups and use real filters to detect accidental resets.
    await page.evaluate(()=>{
     document.querySelectorAll('#categoryMenu input').forEach(input=>input.checked=true);
     els.ratingFilter.value='AA-';els.lineupFilter.value='all';updateCategoryLabel();updateFilterSummary();render();
    });
    const before=await state();
    for(let index=0;index<labels.length;index++){
     await head(index).click();await checkSort(index,labels[index]);
     assert.ok(await head(index).evaluate(button=>button.scrollWidth<=button.clientWidth),'header label and arrow fit');
     const once=await state();
     await head(index).click();await checkSort(index,labels[index]);
     assert.deepEqual((await state()).ids,once.ids,'repeat click never reverses order');
     assert.deepEqual([...once.ids].sort(),[...before.ids].sort(),'same products');
     assert.deepEqual(once.filters,before.filters,'filters and visible maturities unchanged');
     assert.deepEqual(once.all,before.all,'all export retains default order');
     assert.equal(once.data,before.data);assert.equal(once.storage,before.storage);
    }
    if(width===390){
     const year=labels.indexOf('1년');await head(year).tap();await checkSort(year,'1년');
     await page.screenshot({path:path.join(out,plan+'-390.png')});
     // Native keyboard activation uses the same descending-only action.
     await head(year).focus();await page.keyboard.press('Enter');await checkSort(year,'1년');
     await page.keyboard.press('Space');await checkSort(year,'1년');
    }
    // Menu changes, group-default and reset must update the header too.
    await page.locator('#maturitySort').selectOption('0');await checkSort(0,labels[0]);
    await page.locator('#sortFilter').selectOption('rating');
    assert.equal(await page.locator(`${source} th[aria-sort]`).count(),0);
    await page.locator('#viewAllButton').click();
    assert.equal(await page.locator('#sortFilter').inputValue(),'default');
    assert.equal(await page.locator(`${source} th[aria-sort]`).count(),0);
    await page.locator('#resetButton').click();
    assert.equal(await page.locator('#sortFilter').inputValue(),plan==='db'?'rate':'default');
    // Sort while only a subset of maturity columns is visible, then remove it.
    await page.evaluate(()=>{
     document.querySelectorAll('#periodMenu input').forEach(input=>input.checked=[0,maturities.length-1].includes(Number(input.value)));
     render();
    });
    const last=labels.length-1;await head(last).click();await checkSort(last,'5년');
    await page.evaluate(()=>{document.querySelectorAll('#periodMenu input').forEach(input=>input.checked=Number(input.value)===0);render();});
    await checkSort(0,labels[0]);
    // Scroll into the body and sort via the independently cloned viewport header.
    await page.locator('#resetButton').click();
    await page.evaluate(()=>{const t=document.querySelector('#panel-sales .sales-rate-table');window.scrollTo(0,t.getBoundingClientRect().top+scrollY+180);});
    const floating=page.locator('.floating-rate-head:visible .sales-rate-table');
    await floating.waitFor({state:'visible'});
    await floating.locator('[data-rate-sort="0"]').click();await checkSort(0,labels[0]);
    await page.waitForFunction(()=>document.querySelector('.floating-rate-head:not([hidden]) th[aria-sort="descending"] .rate-sort-button')?.textContent.endsWith('▼'));
    const alignment=await page.evaluate(()=>{
     const body=[...document.querySelectorAll('#panel-sales .sales-rate-table th')].filter(c=>!c.hidden);
     const copy=[...document.querySelectorAll('.floating-rate-head:not([hidden]) .sales-rate-table th')];
     return body.map((c,i)=>Math.abs(c.getBoundingClientRect().width-copy[i].getBoundingClientRect().width));
    });
    assert.ok(alignment.every(diff=>diff<1),'floating widths match after sorting');
    if(width===390){
     await page.screenshot({path:path.join(out,plan+'-floating-390.png')});
     await page.evaluate(()=>scrollTo(0,0));
     await page.locator('#saveButton').click();await page.locator('#previewButton').click();
     await page.waitForFunction(()=>!document.getElementById('exportDownload').disabled);
     const preview=await page.locator('#exportImage').evaluate(async img=>Array.from(new Uint8Array(await(await fetch(img.src)).arrayBuffer())));
     const download=page.waitForEvent('download');await page.locator('#exportDownload').click();
     const file=await(await download).path();assert.deepEqual([...fs.readFileSync(file)],preview);
     await page.locator('#exportClose').click();
    }
    // Ranking view keeps its independent selections and sorting.
    await page.evaluate(()=>scrollTo(0,0));await page.locator('#sales-view-tab-ranking').click();
    await page.locator('[data-ranking-index="0"]').click();
    assert.equal(await page.locator('#rankingSelectionCount').innerText(),'1 / 3');
    assert.equal(await page.locator('#sales-view-ranking .rate-sort-button').count(),0);
    await page.locator('#sales-view-tab-full').click();await checkSort(0,labels[0]);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no document overflow');
   }
  }
  assert.deepEqual(errors,[]);
  assert.deepEqual(bad,[]);
  console.log('PASS: DB/DC/IRP headers, descending-only repeated/touch/keyboard clicks, menu/arrow sync, preserved filters/data/storage, current/all export and identical PNG download, hidden maturities, default/reset, cloned headers/column widths, ranking isolation, 320/390/768/1366px.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
