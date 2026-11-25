const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const copy=x=>JSON.parse(JSON.stringify(x));
const catalog={window:{}};
for(const file of ['rates-data.js','scheme-rates-data.js','basic-settings-data.js','rate-history-data.js'])vm.runInNewContext(fs.readFileSync(file,'utf8'),catalog);
const {RATE_IMPORT:db,SCHEME_RATE_DATA:data,BASIC_SETTINGS_SEED:basic,RATE_HISTORY:history}=catalog.window;
const old={window:{}};for(const file of ['scripts/fixtures/rates-november.js','scripts/fixtures/scheme-rates-november.js'])vm.runInNewContext(fs.readFileSync(file,'utf8'),old);
assert.deepEqual(copy(data.lineupSeed),copy(old.window.SCHEME_RATE_DATA.lineupSeed));
const snapshots={DB:db,...data.snapshots},previous={DB:old.window.RATE_IMPORT,...old.window.SCHEME_RATE_DATA.snapshots};
for(const [plan,s] of Object.entries(snapshots)){
 assert.equal(s.month,'2026-12');assert.equal(s.start,'2026-12-01');assert.equal(s.end,'2026-12-31');
 assert.equal(s.sha256,'a95fbed29c5977e99fb6f925c890eea475b99d9f200c5c3a042da57126e93bca');
 assert.equal(s.products.length,plan==='DB'?115:101);assert.equal(s.acceptedTerms,plan==='DB'?458:403);
 assert.equal(s.totalRows,509);assert.equal(s.defaultOptionExcluded,6);
 assert.equal(s.acceptedTerms,s.products.reduce((n,p)=>n+Object.keys(p.terms).length,0));
 assert.equal(s.rateColumn,{DB:'J',DC:'K',IRP:'M'}[plan]);
 assert.equal(new Set(s.products.map(p=>p.id)).size,s.products.length);
 for(const p of s.products){assert.equal(p.lineup,null);assert.deepEqual(copy(p.proposals),{});assert.ok(Object.values(p.terms).every(t=>t.rate>0&&Number.isFinite(t.rate)));}
 const saved={activeMonth:'2026-11',months:{'2026-11':previous[plan]}};
 const state=plan==='DB'?saved:{activeMonth:null,months:{},customerPlans:{[plan]:saved}};
 const storage={'db-rate-sources-v1':JSON.stringify(state),'db-rate-management-v1':'preserved'};
 const before=JSON.stringify(storage);
 function boot(){const c=vm.createContext({window:{RATE_IMPORT:copy(s),RateScheme:{id:plan,bundled:copy(snapshots)}},localStorage:{getItem:k=>storage[k]||null,setItem(){throw Error('Startup must not write');}},Date,Set,Map});vm.runInContext(fs.readFileSync('rate-upload-core.js','utf8'),c);return c;}
 assert.equal(boot().window.RATE_IMPORT.month,'2026-12','November cache must not override December');
 assert.equal(JSON.stringify(storage),before);
 const future={...copy(s),month:'2027-01',start:'2027-01-01',end:'2027-01-31'};
 saved.activeMonth='2027-01';saved.months['2027-01']=future;
 storage['db-rate-sources-v1']=JSON.stringify(state);assert.equal(boot().window.RATE_IMPORT.month,'2027-01','Preserve newer uploads');
 saved.activeMonth='2026-12';saved.months['2026-12']=copy(s);saved.months['2026-12'].products[0].terms[12]={rate:9.87,sourceRow:2};
 storage['db-rate-sources-v1']=JSON.stringify(state);assert.equal(boot().window.RATE_IMPORT.products[0].terms[12].rate,9.87,'Preserve explicit same-month upload');
}
const archive=history.months.find(m=>m.month==='2026-11');assert.ok(archive);
assert.equal(history.months.filter(m=>m.month==='2026-11').length,1);
const approved=JSON.parse(fs.readFileSync('scripts/fixtures/approved-november-order.json','utf8'));
for(const [plan,document] of Object.entries(archive.plans)){
 assert.equal(document.start,'2026-11-01');assert.equal(document.end,'2026-11-30');assert.equal(document.sortLabel,'상품군별 기본순');
 const terms=plan==='DB'?[12,18,36,60]:[3,6,12,24,36,60];assert.deepEqual(copy(document.maturities),terms);
 const source=new Map(previous[plan].products.map(p=>[p.id,p]));
 const expected=previous[plan].products.filter(p=>terms.some(t=>p.terms[t])&&(plan==='DB'||data.lineupSeed.products[p.id]?.dcirpLineup==='Y')).map(p=>p.id);
 assert.deepEqual(copy(document.rows.map(r=>r.id).slice().sort()),copy(expected.slice().sort()));
 if(plan==='DB')assert.deepEqual(copy(document.rows.map(r=>r.id)),approved);
 for(const row of document.rows){
  assert.deepEqual(Object.keys(row).sort(),['id','group','product','institution','grade','isGic','cells'].sort());
  const p=source.get(row.id);assert.equal(row.institution,p.institution);assert.equal(row.product,p.type);
  assert.equal(row.grade,data.lineupSeed.institutions?.[p.institutionCode]?.grade||basic.institutions[p.institutionCode]?.grade||'—');
  assert.deepEqual(copy(row.cells),terms.map(t=>{if(!p.terms[t])return '—';const a=p.terms[t].rate,y=t/12;const rate=y===1?a:Math.floor((((1+a/100)**y-1)/y*100+1e-10)*100)/100;return row.isGic?`${a.toFixed(2)} (${rate.toFixed(2)})`:a.toFixed(2);}));
 }
}
console.log('PASS: approved December three-plan source metadata/counts, positive unique rates, unchanged lineup seed, November/future/same-month upload restoration, no startup writes, exact frozen November inclusion/order/grades/formatted rates and public fields only.');
