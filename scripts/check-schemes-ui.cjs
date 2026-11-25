const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.RATE_STATUS_PLAYWRIGHT||'playwright');
(async()=>{
 if(process.env.SCHEMES_LIVE==='1'){process.env.MONTHLY_LIVE='1';require('./check-monthly-rates-ui.cjs');return;}
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const root=path.resolve(__dirname,'..'),live=process.env.SCHEMES_LIVE==='1';
  const out=path.join(root,'outputs','scheme-qa',live?'live':'local');fs.mkdirSync(out,{recursive:true});
  const context=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true});
  const page=await context.newPage(),errors=[],bad=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&/\.(?:js|css|woff2|png|json)(?:\?|$)/.test(r.url()))bad.push(r.url());});
  const base=live?'https://kangdasom.github.io/kw.pension.consulting/':'http://rates.test/kw.pension.consulting/';
  if(!live){
   await context.route('http://rates.test/**',route=>{const name=new URL(route.request().url()).pathname.replace(/^\/kw\.pension\.consulting\//,'')||'index.html';const fixture={'rates-data.js':'scripts/fixtures/rates-november.js','scheme-rates-data.js':'scripts/fixtures/scheme-rates-november.js'};return route.fulfill({path:path.join(root,fixture[name]||name),contentType:name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.woff2')?'font/woff2':name.endsWith('.png')?'image/png':name.endsWith('.json')?'application/json':'text/html'});});
   await context.route(/https:\/\/kangdasom\.github\.io\/kw\.pension\.consulting\/notice(?:-dc|-irp)?\.json(?:\?|$)/,route=>route.fulfill({path:path.join(root,path.basename(new URL(route.request().url()).pathname)),contentType:'application/json'}));
  }
  const go=async(plan='')=>{await page.goto(base+(plan?'index.html?plan='+plan:''));await page.evaluate(()=>document.fonts.ready);};
  const goAdmin=async()=>{await page.goto(base+'admin.html');await page.evaluate(()=>document.fonts.ready);};
  const fit=async()=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'document overflow');
  const summary=[];
  for(const width of [320,390,768,1366]){
   await page.setViewportSize({width,height:900});await go();
   assert.ok(await page.locator('#schemeEntry').isVisible());assert.ok(!await page.locator('.app-shell').isVisible());
   assert.deepEqual(await page.locator('.entry-plans a').allTextContents(),['DB','DC','개인IRP']);
   assert.equal(await page.locator('.entry-plans').innerText(),'DB\nDC\n개인IRP');await fit();
   const adminLink=page.locator('.entry-admin-link');assert.ok(await adminLink.isVisible());
   const linkStyle=await adminLink.evaluate(el=>{const s=getComputedStyle(el);return {border:s.borderTopWidth,background:s.backgroundColor,font:s.fontSize};});
   assert.equal(linkStyle.border,'0px');assert.equal(linkStyle.background,'rgba(0, 0, 0, 0)');assert.equal(linkStyle.font,'14px');
   const order=await page.evaluate(()=>({period:document.querySelector('.entry-period').getBoundingClientRect().bottom,plans:document.querySelector('.entry-plans').getBoundingClientRect().top}));assert.ok(order.period<order.plans);
   assert.ok(!await page.locator('.floating-rate-scroll').first().isVisible());
   if(width===390)await page.screenshot({path:path.join(out,'entry-390.png')});
   for(const plan of ['db','dc','irp']){
    await page.locator('.entry-plans a').nth(['db','dc','irp'].indexOf(plan)).click();
    await page.waitForURL('**/index.html?plan='+plan);await page.locator('.app-shell').waitFor({state:'visible'});await page.evaluate(()=>document.fonts.ready);assert.ok(await page.locator('.app-shell').isVisible());assert.ok(!await page.locator('#schemeEntry').isVisible());await fit();
    const result=await page.evaluate(()=>({scheme:RateScheme.id,title:document.querySelector('.page-heading h1').textContent,rows:filteredRows().map(r=>({id:r.id,lineup:r.lineup})),sources:rates.map(r=>({id:r.id,terms:r.terms})),filter:els.lineupFilter.value,all:RateExport.snapshot('all'),storage:JSON.stringify({...localStorage})}));
    assert.equal(result.scheme,plan.toUpperCase());assert.equal(result.filter,'Y');assert.ok(result.rows.length>0);assert.ok(result.rows.every(r=>r.lineup==='Y'));
    // The proposal control used to reappear when details were opened: label display overrode hidden.
    await page.locator('#moreFilterButton').click();
    assert.equal(await page.locator('#proposalFilter').isVisible(),plan==='db');
    assert.deepEqual(await page.locator('#secondaryFilters label:visible > span').allTextContents(),plan==='db'?['사업자여부','라인업','제안가능여부']:['사업자여부','라인업']);
    if(plan!=='db'){
     const filtering=await page.evaluate(()=>{
      const expected=filteredRows().map(r=>r.id);
      els.proposalFilter.value='N';render();
      const actual=filteredRows().map(r=>r.id);els.proposalFilter.value='all';render();
      return {expected,actual,states:rates.flatMap(r=>Object.values(r.proposals))};
     });
     assert.deepEqual(filtering.actual,filtering.expected);assert.ok(filtering.states.every(s=>s==='확인'));
    }
    if(width===390)await page.screenshot({path:path.join(out,plan+'-details-390.png')});
    await page.locator('#moreFilterButton').click();
    assert.equal(result.title,'2026년 11월 원리금보장상품 공시금리 ('+(plan==='irp'?'개인IRP':plan.toUpperCase())+')');
    assert.equal(result.all.title,result.title);
    const expectedGroups=plan==='db'?[0,1,2,3]:[2,3,1,0];
    assert.equal(await page.locator('#sortFilter').inputValue(),plan==='db'?'rate':'default','initial sort mode');
    if(plan!=='db'){
     const initial=await page.evaluate(()=>({groups:[...new Set(filteredRows().map(groupRank))],first:document.querySelector('#rateTableBody .product-name').textContent,current:RateExport.snapshot('current').rows.map(r=>r.id),ids:filteredRows().map(r=>r.id)}));
     assert.deepEqual(initial.groups,expectedGroups,'initial customer table must start with deposits');
     assert.equal(initial.first,'은행예금');assert.deepEqual(initial.current,initial.ids);
     assert.equal(await page.locator('#maturitySortWrap').isVisible(),false);
    }
    assert.deepEqual([...new Set(result.all.rows.map(r=>r.group))],expectedGroups,'all export group order');
    const groupLabel=plan==='db'?'ELB/DLB → GIC → 은행예금 → 저축은행예금':'은행예금 → 저축은행예금 → GIC → ELB/DLB';
    await page.locator('#infoButton').click();
    assert.ok((await page.locator('#infoModal .guide-list').innerText()).includes(groupLabel));
    await page.locator('[data-close="infoModal"]').click();
    const ordering=await page.evaluate(()=>{
     const before=JSON.stringify({...localStorage});
     document.querySelectorAll('#categoryMenu input').forEach(input=>input.checked=true);
     showAllSource();
     const ids=filteredRows().map(r=>r.id),groups=[...new Set(filteredRows().map(groupRank))];
     const current=RateExport.snapshot('current').rows.map(r=>r.id);
     els.sortFilter.value='rate';document.getElementById('maturitySort').value=String(maturities.indexOf(12));
     const rateOrder=filteredRows().map(r=>effectiveRate(r,maturities.indexOf(12))).filter(v=>v!==null);
     const sample=(category,type)=>({id:type,category,type,grade:'AA',institution:'기관',terms:{12:{rate:4}},note:''});
     const tied=[sample('파생결합사채','ELB'),sample('보험','GIC'),sample('예금','은행예금'),sample('예금','저축은행예금')].sort((a,b)=>compareRate(a,b,maturities.indexOf(12))||defaultOrder(a,b)).map(groupRank);
     return {ids,groups,current,rateOrder,tied,unchanged:before===JSON.stringify({...localStorage})};
    });
    assert.deepEqual(ordering.groups,expectedGroups);assert.deepEqual(ordering.current,ordering.ids);
    assert.deepEqual(ordering.tied,expectedGroups);assert.equal(ordering.unchanged,true);
    assert.deepEqual(ordering.rateOrder,[...ordering.rateOrder].sort((a,b)=>b-a));
    await page.locator('#resetButton').click();
    assert.equal(await page.locator('#sortFilter').inputValue(),plan==='db'?'rate':'default','reset sort mode');
    if(plan!=='db')assert.deepEqual(await page.evaluate(()=>[...new Set(filteredRows().map(groupRank))]),expectedGroups,'reset customer group order');
    assert.equal(await page.locator('.main-tabs,#panel-monthly,#panel-basic,#panel-users').count(),0);
    assert.equal(await page.locator('#noticeText,#uploadFile,#userForm').count(),0);
    if(plan!=='db'){
     assert.equal(await page.locator('#panel-sales .rate-status-trigger').count(),0);
     assert.ok(!await page.locator('#proposalFilter').isVisible());assert.ok(result.all.rows.every(r=>result.rows.some(p=>p.id===r.id)));
     assert.ok(!result.all.title.includes('DB'));assert.ok(result.all.filename.includes(plan==='irp'?'개인IRP':plan.toUpperCase()));
     assert.equal(result.sources.length,90);
    }else assert.equal(result.sources.length,98);
    const expectedTerms=plan==='db'?['1년','1.5년','3년','5년']:['3개월','6개월','1년','2년','3년','5년'];
    assert.deepEqual(await page.locator('#panel-sales .sales-rate-table th.rate-head .rate-sort-button > span:first-child').allTextContents(),expectedTerms);
    assert.deepEqual(await page.locator('#periodMenu label').allTextContents().then(a=>a.map(s=>s.trim())),expectedTerms);
    assert.equal(await page.locator('#maturitySort').inputValue(),plan==='db'?'0':'2');
    assert.equal(result.all.indices.length,expectedTerms.length);
    if(plan==='db'){const fifth=await page.locator('.sales-rate-table th.rate-head').last().boundingBox();assert.ok(fifth.x+fifth.width<=width+1,'5y column beyond initial viewport');}
    else{
     const scroll=page.locator('#sales-view-full .table-scroll');await scroll.evaluate(el=>el.scrollLeft=el.scrollWidth);
     const fifth=await page.locator('.sales-rate-table th.rate-head').last().boundingBox();assert.ok(fifth.x+fifth.width<=width+1,'5y inaccessible after horizontal scroll');await scroll.evaluate(el=>el.scrollLeft=0);
    }
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
      // Real source rates map to the six displayed terms, with fractional-year GIC conversion.
      const auditTerms=await page.evaluate(()=>{
       const terms=[3,6,12,24,36,60],snapshot=RateExport.snapshot('current');
       const issues=[];
       for(const exported of snapshot.rows){const row=rates.find(r=>r.id===exported.id);terms.forEach((term,i)=>{
        const value=row.terms[term]?.rate,years=term/12;
        const converted=value===undefined?null:Math.floor((((1+value/100)**years-1)/years*100+1e-10)*100)/100;
        const expected=value===undefined?'—':row.category==='보험'?value.toFixed(2)+' ('+(years===1?value:converted).toFixed(2)+')':value.toFixed(2);
        if(exported.cells[i]!==expected)issues.push([row.id,term,exported.cells[i],expected]);
       });}
       return issues;
      });assert.deepEqual(auditTerms,[]);
      await page.locator('#periodTrigger').click();
      for(const index of [0,1,2,4,5])await page.locator('#periodMenu input').nth(index).uncheck();
      await page.locator('#periodTrigger').click();
      const onlyTwo=await page.evaluate(()=>({indices:RateExport.snapshot('current').indices,ids:filteredRows().map(r=>r.id),expected:rates.filter(r=>r.lineup==='Y'&&r.terms[24]).map(r=>r.id)}));
      assert.deepEqual(onlyTwo.indices,[3]);assert.deepEqual([...onlyTwo.ids].sort(),[...onlyTwo.expected].sort());
      await page.locator('#resetButton').click();assert.equal(await page.locator('#maturitySort').inputValue(),'2');assert.equal(await page.locator('#periodMenu input:checked').count(),6);assert.ok((await page.locator('#periodTrigger').innerText()).includes('전체 만기'));
      await page.locator('#sales-view-tab-ranking').click();
      assert.equal(await page.locator('#rankingProposal').isVisible(),false);
      assert.equal(await page.locator('.ranking-filters label:visible').count(),3);
      assert.deepEqual(await page.locator('[data-ranking-index]').allTextContents(),expectedTerms);
      for(let group=0;group<4;group++){
       await page.locator('[data-ranking-group="'+group+'"]').click();
       for(let index=0;index<6;index++){
        await page.locator('[data-ranking-index="'+index+'"]').click();
        const data=await page.evaluate(({group,index})=>{
         const term=[3,6,12,24,36,60][index],calc=r=>{const a=r.terms[term].rate,n=term/12;return r.category==='보험'&&n!==1?Math.floor((((1+a/100)**n-1)/n*100+1e-10)*100)/100:a;};
         const expected=rates.filter(r=>groupRank(r)===group&&r.lineup==='Y'&&r.terms[term]).map(calc).sort((a,b)=>b-a).slice(0,10);
         const section=SalesRanking.current().sections[0];return {expected,actual:section.rows.map(calc),label:section.label,exported:section.rows.length?RateExport.snapshot('current').indices:[]};
        },{group,index});assert.deepEqual(data.actual,data.expected);assert.ok(data.label.endsWith(expectedTerms[index]));
        if(data.expected.length)assert.deepEqual(data.exported,[index]);
        await page.locator('[data-ranking-index="'+index+'"]').click();
       }
      }
      await page.locator('[data-ranking-group="0"]').click();await page.locator('[data-ranking-index="2"]').click();
      const independent=await page.evaluate(()=>{
       const expected=SalesRanking.current().sections.map(s=>s.rows.map(r=>r.id));
       document.getElementById('rankingProposal').value='N';render();
       const actual=SalesRanking.current().sections.map(s=>s.rows.map(r=>r.id));
       document.getElementById('rankingProposal').value='all';render();return {expected,actual};
      });assert.deepEqual(independent.actual,independent.expected);
      assert.equal(await page.locator('.ranking-grid .rate-status-trigger').count(),0);assert.ok(!await page.locator('#rankingProposal').isVisible());
      assert.ok(await page.locator('.ranking-grid tbody tr').count());await page.locator('#sales-view-tab-full').click();
      await page.locator('#infoButton').click();const guide=await page.locator('#infoModal .guide-list').innerText();assert.ok(!guide.includes('제안가능'),JSON.stringify({guide,errors}));await page.locator('[data-close="infoModal"]').click();
     }
    }
    await page.locator('.scheme-home').click();await page.locator('#schemeEntry').waitFor({state:'visible'});assert.ok(await page.locator('#schemeEntry').isVisible());
   }
   await page.locator('.entry-admin-link').click();await page.locator('#panel-monthly').waitFor({state:'visible'});await fit();
   assert.ok((await page.locator('#managementPeriodHelp').innerText()).includes('DB법인'));
   assert.deepEqual(await page.locator('.main-tabs button').allTextContents(),['금리·한도관리','기관정보','사용자관리']);
   assert.ok(!await page.locator('#panel-sales').isVisible());assert.equal(await page.locator('#tab-sales').count(),0);
   assert.equal(await page.locator('.floating-rate-head:visible,.floating-rate-scroll:visible').count(),0);
   await page.locator('#tab-basic').click();assert.ok(await page.locator('#panel-basic').isVisible());
   await page.locator('#tab-users').click();assert.ok(await page.locator('#panel-users').isVisible());
   await page.locator('#tab-monthly').click();
   if(width===390)await page.screenshot({path:path.join(out,'admin-390.png')});
   if(width===1366)await page.screenshot({path:path.join(out,'admin-1366.png')});
   await page.locator('.scheme-home').click();await page.locator('#schemeEntry').waitFor({state:'visible'});
  }
  // Manual DB and shared DCIRP lineups remain independent and survive navigation.
  await go('db');
  const id=await page.evaluate(()=>rates.find(r=>r.lineup==='Y'&&SCHEME_RATE_DATA.lineupSeed.products[r.id]?.dcirpLineup==='Y').id);
  await goAdmin();
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
   await goAdmin();
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
