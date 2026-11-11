const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const elements=new Map();
function el(id){if(!elements.has(id))elements.set(id,{value:'all',textContent:'',hidden:false,innerHTML:'',querySelector:()=>el('heading-child'),after(){},options:[0,1,2,3].map(value=>({value:String(value)}))});return elements.get(id);}
el('sortFilter').value='rate';el('maturitySort').value='0';
const periods=[0,1,2,3].map(value=>({value:String(value),checked:true}));
const categories=['파생결합사채','보험','은행예금','저축은행예금'].map(value=>({value,checked:true}));
const context=vm.createContext({window:{},localStorage:{getItem(){return null},setItem(){}},document:{getElementById:el,createElement:()=>el('validation'),querySelector:el,querySelectorAll(selector){if(selector.includes('periodMenu'))return periods.filter(x=>x.checked);if(selector.includes('categoryMenu'))return categories.filter(x=>x.checked);return [];}}});
for(const name of ['rates-data.js','rate-model.js'])vm.runInContext(fs.readFileSync(name,'utf8'),context);
vm.runInContext(`
if(rates.length!==98 || importData.acceptedTerms!==407 || importData.totalRows!==450 || importData.month!=='2026-11') throw Error('Source reconciliation');
if(els.lineupFilter.value!=='Y' || els.proposalFilter.value!=='all') throw Error('Default filters');
if(els.sortFilter.value!=='rate' || document.getElementById('maturitySort').value!=='0') throw Error('Initial 1y rate sorting');
showAllSource();
if(filteredRows().length!==98) throw Error('Initial source view');
if(rates.some(r=>Object.values(r.terms).some(t=>t.rate<=0))) throw Error('Zero rate imported');
if(rates.some(r=>!['보험','예금','파생결합사채'].includes(r.category))) throw Error('Unsupported category');
if(effectiveRate({category:'보험',terms:{12:{rate:3.2}}},0)!==3.2) throw Error('One year precision');
if(effectiveRate({category:'보험',terms:{36:{rate:4.1}}},2)!==4.27) throw Error('Compound conversion');
if(effectiveRate({category:'예금',terms:{}},0)!==null) throw Error('Missing term invented');
els.lineupFilter.value='Y'; if(filteredRows().length) throw Error('Unknown lineup treated as Y');
els.lineupFilter.value='all'; els.proposalFilter.value='Y'; if(filteredRows().length || termProposalState(rates[0],12)!=='확인') throw Error('Confirm is not Y');
els.proposalFilter.value='all'; els.ratingFilter.value='AA-'; if(filteredRows().length) throw Error('Unknown grade included');
els.ratingFilter.value='all';
els.sortFilter.value='rate';
for(let i=0;i<4;i++){ document.getElementById('maturitySort').value=String(i); const rows=filteredRows(); const known=rows.map(r=>effectiveRate(r,i)).filter(v=>v!==null); if(known.some((v,j)=>j>0 && known[j-1]<v)) throw Error('Rate sort'); }
render();
`,context);
assert.match(el('rateTableBody').innerHTML,/확인/);
assert.match(el('rateTableBody').innerHTML,/원본 Sheet1/);
assert.equal(context.document.title,'2026년 11월 원리금보장상품 금리');
assert.match(el('heading-child').textContent,/2026\.11\.01 ~ 2026\.11\.30/);
assert.match(el('importState').textContent,/2026년 11월 금리 반영 완료/);
console.log('PASS: November reconciliation, 98 products, 407 terms, exclusions, GIC truncation, filters, sorting, approved source and title.');

// Compare all 98 IDs with the actual workbook the user reviewed, independently
// of the live comparator. Settings remain isolated from the user's browser.
vm.runInContext(fs.readFileSync('basic-settings-data.js','utf8'),context);
vm.runInContext(`
rates.forEach(row=>{
 row.grade=window.BASIC_SETTINGS_SEED.institutions[row.institutionCode]?.grade || null;
 row.lineup=window.BASIC_SETTINGS_SEED.products[row.id]?.lineup || null;
});
els.sortFilter.value='rating'; showAllSource();
`,context);
const approved=JSON.parse(fs.readFileSync('scripts/fixtures/approved-november-order.json','utf8'));
const ids=()=>Array.from(vm.runInContext('filteredRows().map(r=>r.id)',context));
assert.deepEqual(ids(),approved);
assert.equal(el('sortFilter').value,'default');
assert.equal(el('maturitySortWrap').hidden,true);
vm.runInContext("els.lineupFilter.value='Y'; els.proposalFilter.value='all'; els.sortFilter.value='rate'; document.getElementById('maturitySort').value='0'; render();",context);
const lineupIds=new Set(Array.from(vm.runInContext("rates.filter(r=>r.lineup==='Y').map(r=>r.id)",context)));
const yearRates=new Map(Array.from(vm.runInContext('rates.map(r=>[r.id,r.terms[12]?.rate ?? -Infinity])',context)));
// Stable-sort the approved group-first workbook by 1y rate: group priority is
// retained only when the leading rates are equal, followed by the old tie rules.
const initialOrder=approved.filter(id=>lineupIds.has(id)).sort((a,b)=>(yearRates.get(b)-yearRates.get(a))||0);
assert.deepEqual(ids(),initialOrder);
assert.equal(ids().length,52);
assert.equal(el('maturitySortWrap').hidden,false);
assert.notDeepEqual(initialOrder,approved.filter(id=>lineupIds.has(id)));
vm.runInContext('showAllSource();',context);
assert.deepEqual(ids(),approved);
assert.equal(el('sortFilter').value,'default');
assert.equal(el('maturitySortWrap').hidden,true);
// Deliberate ties/missing terms exercise precedence not guaranteed by live data.
vm.runInContext(`
function sample(overrides={}){return {id:'sample',category:'파생결합사채',type:'ELB',note:'',institution:'기관',grade:'AA',terms:{12:{rate:4},36:{rate:4},60:{rate:4}},...overrides};}
if(defaultOrder(sample({grade:'A',terms:{12:{rate:5}}}),sample({grade:'AAA'}))>=0) throw Error('1y before grade');
if(defaultOrder(sample({grade:'AAA',terms:{12:{rate:4},36:{rate:3}}}),sample({grade:'AA',terms:{12:{rate:4},36:{rate:5}}}))>=0) throw Error('Grade before 3y');
if(defaultOrder(sample({terms:{12:{rate:4},36:{rate:5},60:{rate:3}}}),sample({terms:{12:{rate:4},36:{rate:4},60:{rate:5}}}))>=0) throw Error('3y before 5y');
if(defaultOrder(sample({type:'DLB',terms:{12:{rate:5}}}),sample())>=0) throw Error('Rate before product variant');
if(defaultOrder(sample(),sample({type:'DLB'}))>=0) throw Error('ELB before DLB tie');
if(defaultOrder(sample(),sample({terms:{36:{rate:5}}}))>=0) throw Error('Missing 1y behind known');
if(defaultOrder(sample({grade:null}),sample({grade:'unknown'}))!==0) throw Error('Both missing grade deterministic');
if(defaultOrder(sample({category:'예금',type:'은행예금',terms:{12:{rate:1}}}),sample({category:'예금',type:'저축은행예금',terms:{12:{rate:9}}}))>=0) throw Error('Bank before savings bank');
for(const [first,second] of [['','II'],['II','III'],['III','보너스']]){
 if(defaultOrder(sample({category:'보험',type:'GIC '+first,note:first}),sample({category:'보험',type:'GIC '+second,note:second}))>=0) throw Error('GIC variant order');
}
els.sortFilter.value='rate'; render();
`,context);
assert.equal(el('maturitySortWrap').hidden,false);
console.log('PASS: initial rate-first 52 lineup products, full-view group-first 98 products matching approved Excel, financial tie priorities, missing values and GIC variant ordering.');

for(const [selected,count] of [[['은행예금'],16],[['저축은행예금'],26],[['은행예금','저축은행예금'],42],[[],0]]){
  categories.forEach(option=>option.checked=selected.includes(option.value));
  const result=Array.from(vm.runInContext('filteredRows()',context));
  assert.equal(result.length,count);
  assert(result.every(row=>row.category==='예금' && selected.includes(row.type)));
}
categories.forEach(option=>option.checked=true);
assert.equal(ids().length,98);
console.log('PASS: independent bank/savings-bank filters, combined selection, empty selection and all-four restoration.');

// Per-maturity status presentation and selection must not conflate confirm with N.
vm.runInContext(`
const savedRows=rates.slice();
const fixture={id:'fixture',category:'파생결합사채',type:'ELB',note:'',institution:'기관',grade:'AAA',lineup:'Y',terms:{12:{rate:4,sourceRow:1},36:{rate:3.9,sourceRow:2},60:{rate:3.8,sourceRow:3}},proposals:{12:'Y',36:'N',60:'확인'}};
rates.splice(0,rates.length,fixture);els.lineupFilter.value='all';
els.proposalFilter.value='all';
if(/rate-needs-confirm|rate-status-dim/.test(salesRateCell(fixture,3)))throw Error('All view must stay clean');
els.proposalFilter.value='Y';
if(filteredRows().length!==1 || !salesRateCell(fixture,2).includes('rate-status-dim'))throw Error('Mixed Y/N row');
if(!salesRateCell(fixture,3).includes('rate-needs-confirm')||salesRateCell(fixture,3).includes('rate-status-dim'))throw Error('Confirm remains vivid with a dot in a mixed Y row');
fixture.proposals[12]='N';fixture.proposals[60]='N';if(filteredRows().length)throw Error('All N excluded from Y/confirm');
fixture.proposals[60]='확인';if(filteredRows().length)throw Error('Confirm-only must not match Y');
els.proposalFilter.value='N';if(filteredRows().length!==1)throw Error('Any N maturity included');
els.proposalFilter.value='확인';if(filteredRows().length!==1)throw Error('Confirm filter');
if(salesRateCell(fixture,1).includes('button'))throw Error('Missing rates are not interactive');
rates.splice(0,rates.length,...savedRows);els.proposalFilter.value='all';
`,context);
console.log('PASS: term-specific filter matching, confirm eligibility, clean all view, conditional dots/dimming and missing-rate behavior.');
