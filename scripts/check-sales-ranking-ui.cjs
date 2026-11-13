const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.RATE_STATUS_PLAYWRIGHT||'playwright');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const live=process.env.RANKING_LIVE==='1',root=path.resolve(__dirname,'..'),out=path.join(root,'outputs','sales-ranking-qa',live?'live':'local');fs.mkdirSync(out,{recursive:true});
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  if(!live){
   await page.route('http://rates.test/**',route=>{const name=new URL(route.request().url()).pathname.slice(1)||'index.html';return route.fulfill({path:path.join(root,name),contentType:name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.png')?'image/png':name.endsWith('.woff2')?'font/woff2':name.endsWith('.json')?'application/json':'text/html'});});
   await page.route('https://kangdasom.github.io/kw.pension.consulting/notice.json*',route=>route.fulfill({path:path.join(root,'notice.json'),contentType:'application/json'}));
  }
  await page.goto(live?'https://kangdasom.github.io/kw.pension.consulting/':'http://rates.test/');await page.evaluate(()=>document.fonts.ready);
  const before=await page.evaluate(()=>({data:JSON.stringify(window.RATE_IMPORT),storage:JSON.stringify({...localStorage})}));
  await page.evaluate(()=>{els.ratingFilter.value='AA+';els.sortFilter.value='rating';render();});
  const full=await page.evaluate(()=>JSON.stringify(RateExport.snapshot('current',new Date('2026-11-13T00:00:00Z'))));
  await page.locator('#sales-view-tab-ranking').click();
  assert.equal(await page.locator('[data-ranking-group="0"]').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('[data-ranking-index][aria-pressed="true"]').count(),0);assert.equal(await page.locator('.ranking-section').count(),0);assert.equal(await page.locator('#rankingSelectionCount').innerText(),'0 / 3');
  const group=g=>page.locator(`[data-ranking-group="${g}"]`),term=i=>page.locator(`[data-ranking-index="${i}"]`);
  const sections=()=>page.evaluate(()=>SalesRanking.current().sections);
  // Independently check all types/terms, full-set mean, fixed ten-row cap and ties.
  for(let g=0;g<4;g++)for(let i=0;i<4;i++){
   await page.locator('#rankingReset').click();await group(g).click();await term(i).click();await page.locator('#rankingViewAll').click();
   const expected=await page.evaluate(({g,i})=>{
    const months=[12,18,36,60][i],years=months/12;
    return rates.filter(r=>(r.category==='파생결합사채'?0:r.category==='보험'?1:r.type==='은행예금'?2:3)===g&&r.terms[months]).map(r=>{const rate=r.terms[months].rate;return g===1?Math.floor((((1+rate/100)**years-1)/years*100+1e-10)*100)/100:rate;}).sort((a,b)=>b-a);
   },{g,i});
   const [s]=await sections(),shown=expected.slice(0,10),mean=expected.length?expected.reduce((a,b)=>a+b,0)/expected.length:null;
   assert.equal(s.total,expected.length);assert.equal(s.rows.length,shown.length);assert.equal(await page.locator('.ranking-section tbody tr').count(),shown.length);
   if(mean===null)assert.equal(s.average,null);else assert.ok(Math.abs(s.average-mean)<1e-9);
   const actual=await page.locator('.ranking-section tbody tr').evaluateAll(rows=>rows.map(r=>({rank:Number(r.cells[0].textContent),rate:r.cells[4].innerText,spread:r.cells[5].textContent})));
   actual.forEach((r,n)=>{assert.equal(g===1?Number(r.rate.match(/\(([^)]+)\)/)[1]):Number(r.rate),shown[n]);const bp=Number(((shown[n]-mean)*100).toFixed(2));assert.equal(r.spread,(bp>0?'+':bp<0?'−':'')+Math.abs(bp)+'bp');assert.equal(r.rank,n&&shown[n]===shown[n-1]?actual[n-1].rank:n+1);});
  }
  await page.locator('#rankingReset').click();await term(0).click();await group(1).click();await term(2).click();await term(3).click();
  assert.deepEqual((await sections()).map(s=>[s.group,s.index]),[[0,0],[1,2],[1,3]]);
  const selected=JSON.stringify(await sections());await term(0).click();
  assert.equal(await page.locator('#rankingToast').innerText(),'최대 3개까지 선택할 수 있습니다.');assert.equal(await term(0).getAttribute('aria-pressed'),'false');assert.equal(JSON.stringify(await sections()),selected);
  assert.equal(await page.locator('#rankingToast button').count(),0);
  const toastStyle=await page.locator('#rankingToast').evaluate(e=>({width:e.getBoundingClientRect().width,bg:getComputedStyle(e).backgroundColor}));assert.ok(toastStyle.width<350);assert.equal(toastStyle.bg,'rgb(240, 239, 245)');
  await page.screenshot({path:path.join(out,'toast-390.png')});await page.waitForTimeout(1800);await term(0).click();await page.waitForTimeout(1600);assert.ok(await page.locator('#rankingToast').evaluate(e=>e.classList.contains('visible')));await page.waitForTimeout(1600);assert.ok(!await page.locator('#rankingToast').evaluate(e=>e.classList.contains('visible')));
  // Product switching retains the chosen terms and all comparison tables.
  await group(0).click();assert.equal(await term(0).getAttribute('aria-pressed'),'true');await group(1).click();assert.equal(await term(2).getAttribute('aria-pressed'),'true');
  await term(2).click();assert.equal((await sections()).length,2);await term(2).click();
  await page.locator('[data-ranking-remove="2"]').click();assert.equal((await sections()).length,2);await term(2).click();
  await page.locator('#rankingReset').click();await term(0).click();await group(1).click();await term(2).click();await term(3).click();
  // Common filters apply independently to each maturity.
  await page.locator('#rankingRating').selectOption('AAA');assert.ok((await sections()).every(s=>s.rows.every(r=>r.grade==='AAA')));await page.locator('#rankingRating').selectOption('all');
  for(const state of ['Y','N','확인']){await page.locator('#rankingProposal').selectOption(state);assert.ok(await page.evaluate(state=>SalesRanking.current().sections.every(s=>s.rows.every(r=>termProposalState(r,maturities[s.index])===state)),state));}await page.locator('#rankingProposal').selectOption('all');
  // All ranking tables share status tooltips; row height never changes.
  for(let i=0;i<3;i++){const trigger=page.locator('.ranking-section').nth(i).locator('.rate-status-trigger').first();if(await trigger.count()){const height=await trigger.evaluate(e=>e.closest('tr').offsetHeight);await trigger.click();assert.ok(await page.locator('#rateStatusTooltip').isVisible());assert.equal(await trigger.evaluate(e=>e.closest('tr').offsetHeight),height);await page.locator('#rankingSummary').click();}}
  // Comparison snapshot preserves per-section maturity/order with no private fields.
  const saved=await page.evaluate(()=>RateExport.snapshot('current',undefined,'A업체 검토용'));
  assert.equal(saved.sections.length,3);for(let i=0;i<3;i++){assert.deepEqual(saved.sections[i].rows.map(r=>r.id),(await sections())[i].rows.map(r=>r.id));assert.equal(saved.sections[i].indices.length,1);assert.ok(saved.sections[i].rows.every(r=>r.cells.length===1&&!('amount' in r)&&!('note' in r)));}
  const all=await page.evaluate(()=>RateExport.snapshot('all'));assert.equal(all.rows.length,98);assert.ok(!all.sections);
  // Render actual PNG, verify export text and preview/download identical bytes.
  await page.evaluate(()=>{window.paint=[];const draw=RateExport.draw;RateExport.draw=(canvas,data)=>{const ctx=canvas.getContext('2d'),fill=ctx.fillText;ctx.fillText=function(text,x,y){paint.push({text,x,y});return fill.apply(this,arguments);};return draw(canvas,data);};});
  await page.locator('#saveButton').click();await page.locator('#exportMemoEnabled').check();await page.locator('#exportMemo').fill('A업체 검토용');await page.locator('#previewButton').click();await page.waitForFunction(()=>!document.getElementById('exportImage').hidden);await page.locator('#exportImage').evaluate(e=>e.decode());
  const png=await page.evaluate(async()=>({bytes:Array.from(new Uint8Array(await(await fetch(document.getElementById('exportImage').src)).arrayBuffer())),paint}));
  fs.writeFileSync(path.join(out,'comparison.png'),Buffer.from(png.bytes));
  for(const text of ['ELB/DLB · 1년','GIC · 3년','GIC · 5년','A업체 검토용','상품','제공기관','등급'])assert.ok(png.paint.some(t=>t.text===text));
  for(const text of ['라인업','사업자','평균 대비','순위'])assert.ok(!png.paint.some(t=>t.text===text));
  const downloadPromise=page.waitForEvent('download');await page.locator('#exportDownload').click();const download=await downloadPromise;assert.deepEqual(fs.readFileSync(await download.path()),Buffer.from(png.bytes));await page.locator('#exportClose').click();
  for(const width of [320,390,768,1366]){
   await page.setViewportSize({width,height:844});if(width===1366)await page.locator('#viewModeButton').click();await page.evaluate(()=>scrollTo(0,0));
   assert.ok(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth));
   const positions=await page.locator('.ranking-section').evaluateAll(nodes=>nodes.map(n=>({x:n.getBoundingClientRect().left,y:n.getBoundingClientRect().top})));
   if(width===1366)assert.ok(positions.every(p=>Math.abs(p.y-positions[0].y)<1));else assert.ok(positions[1].y>positions[0].y);
   await page.screenshot({path:path.join(out,`multi-${width}.png`),fullPage:true});
  }
  // Every stacked table has its own measured pinned controls.
  await page.setViewportSize({width:390,height:600});
  for(let i=0;i<3;i++){
   await page.locator('.ranking-section').nth(i).locator('table').evaluate(t=>scrollTo(0,t.getBoundingClientRect().top+scrollY+60));await page.waitForTimeout(100);
   assert.equal(await page.locator('.floating-rate-head:visible').count(),1);
   const original=await page.locator('.ranking-section').nth(i).locator('th').evaluateAll(c=>c.map(n=>n.getBoundingClientRect().width));const copy=await page.locator('.floating-rate-head:visible th').evaluateAll(c=>c.map(n=>n.getBoundingClientRect().width));assert.ok(original.every((v,j)=>Math.abs(v-copy[j])<1));
   const slider=page.locator('.floating-rate-scroll:visible input');if(await slider.count()){await slider.evaluate(e=>{e.value='30';e.dispatchEvent(new Event('input',{bubbles:true}));});assert.ok(await page.locator('.ranking-section').nth(i).locator('.table-scroll').evaluate(e=>e.scrollLeft>0),JSON.stringify(await page.evaluate(i=>({i,tables:[...document.querySelectorAll('.ranking-section .table-scroll')].map(e=>({top:e.getBoundingClientRect().top,bottom:e.getBoundingClientRect().bottom,left:e.scrollLeft,max:e.scrollWidth-e.clientWidth})),bars:[...document.querySelectorAll('.floating-rate-scroll')].map(e=>({hidden:e.hidden,top:e.style.top,value:e.firstChild.value,max:e.firstChild.max}))}),i)));}
  }
  await page.evaluate(()=>scrollTo(0,0));await page.locator('#sales-view-tab-full').click();assert.equal(await page.evaluate(()=>JSON.stringify(RateExport.snapshot('current',new Date('2026-11-13T00:00:00Z')))),full);
  await page.locator('#sales-view-tab-ranking').click();assert.equal((await sections()).length,3);await page.locator('#tab-monthly').click();assert.equal(await page.locator('.floating-rate-head:visible').count(),0);await page.locator('#tab-sales').click();
  while(await page.locator('[data-ranking-remove]').count())await page.locator('[data-ranking-remove]').first().click();assert.equal((await sections()).length,0);assert.ok(await page.locator('.ranking-empty').isVisible());assert.ok(await page.evaluate(()=>{try{RateExport.snapshot('current');return false;}catch{return true;}}));
  await page.locator('#rankingReset').click();assert.deepEqual((await sections()).map(s=>[s.group,s.index]),[]);assert.equal(await group(0).getAttribute('aria-pressed'),'true');assert.equal(await term(0).getAttribute('aria-pressed'),'false');assert.equal(await page.locator('#rankingLineup').inputValue(),'Y');
  assert.equal(await page.evaluate(()=>JSON.stringify(window.RATE_IMPORT)),before.data);
  const finalStorage=await page.evaluate(()=>{const s={...localStorage};delete s['db-rate-view-mode'];return JSON.stringify(s);});assert.equal(finalStorage,before.storage);assert.deepEqual(errors,[]);
  console.log('PASS: maximum-three toggles/removal/state retention, light timed toast/retrigger, all 16 independent rankings/full means/top10/ties, shared filters/tooltips, comparison PNG/download equality, current/all export isolation, zero selection, mobile/tablet/PC layouts, all pinned controls, unchanged source/storage.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
