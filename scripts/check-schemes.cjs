const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const storage={};let fail=false;
function load(plan='DB'){
 const ctx=vm.createContext({window:{},localStorage:{getItem:k=>storage[k]||null,setItem(k,v){if(fail)throw Error('quota');storage[k]=v;}},Date,Set,Map});
 for(const file of ['scripts/fixtures/rates-november.js','scripts/fixtures/scheme-rates-november.js'])vm.runInContext(fs.readFileSync(file,'utf8'),ctx);
 const {RATE_IMPORT:db,SCHEME_RATE_DATA:data}=ctx.window;
 ctx.window.RateScheme={id:plan,customer:plan!=='DB',bundled:{DB:db,...data.snapshots}};
 if(plan!=='DB')ctx.window.RATE_IMPORT=JSON.parse(JSON.stringify(data.snapshots[plan]));
 vm.runInContext(fs.readFileSync('rate-upload-core.js','utf8'),ctx);
 return ctx;
}
const ctx=load(),{RateUpload:api,SCHEME_RATE_DATA:data}=ctx.window;
for(const [plan,s] of Object.entries(data.snapshots)){
 assert.equal(s.scheme,plan);assert.equal(s.month,'2026-11');assert.ok(s.products.length>0);assert.ok(s.products.every(p=>Object.values(p.terms).every(t=>t.rate>0)));
 assert.equal(s.acceptedTerms,s.products.reduce((sum,p)=>sum+Object.keys(p.terms).length,0));
 assert.equal(new Set(s.products.map(p=>p.id)).size,s.products.length);
 assert.notEqual(s.rateColumn,'J');
}
const seed=data.lineupSeed;
assert.equal(seed.sheet,'DCIRP');
for(const match of seed.matches){assert.equal(seed.products[match.id].dcirpLineup,match.sourceLineup);assert.equal(match.lineupCell,'F'+match.sourceRow);}
assert.ok(Object.values(seed.products).some(p=>p.dcirpLineup==='Y'));
const known=ctx.window.RATE_IMPORT.products.find(p=>p.type==='ELB');
const row=(number,more={})=>({number,values:{B:'2026-12-01',C:'2026-12-31',D:known.institutionCode+':'+known.institution,F:'7001:ELB',G:'N',H:12,I:'',J:4,K:3.5,M:3.25,...more}});
let rows=[row(2),row(3,{H:36,J:0,K:3.7,M:3.3}),row(4,{H:60,G:'Y',J:9,K:9,M:9})];rows.rateColumns={DB:'J',DC:'K',IRP:'M'};
const validated=api.validateAll(rows);
assert.equal(validated.fatal.length,0);
assert.equal(validated.snapshot.acceptedTerms,1);
assert.equal(validated.plans.DC.snapshot.acceptedTerms,2);
assert.equal(validated.plans.IRP.snapshot.acceptedTerms,2);
assert.equal(validated.plans.DC.snapshot.products[0].terms[12].rate,3.5);
assert.equal(validated.plans.IRP.snapshot.products[0].terms[12].rate,3.25);
assert.equal(validated.plans.DC.snapshot.defaultOptionExcluded,1);
assert.ok(!validated.plans.DC.snapshot.products[0].terms[60]);
const companions=Object.fromEntries(Object.entries(validated.plans).map(([plan,r])=>[plan,r.snapshot]));
storage['db-rate-management-v1']=JSON.stringify({institutions:{keep:{grade:''}},products:{keep:{lineup:'',dcirpLineup:'N'}},months:{old:{status:'N'}}});
const managementBefore=storage['db-rate-management-v1'];
fail=true;assert.throws(()=>api.commit(validated.snapshot,companions),/quota/);assert.equal(storage['db-rate-sources-v1'],undefined);
fail=false;api.commit(validated.snapshot,companions);
assert.equal(storage['db-rate-management-v1'],managementBefore);
for(const plan of ['DB','DC','IRP']){
 const next=load(plan);
 assert.equal(next.window.RATE_IMPORT.month,'2026-12');
 assert.equal(next.window.RATE_IMPORT.products[0].terms[12].rate,{DB:4,DC:3.5,IRP:3.25}[plan]);
 assert.ok(next.window.RateUpload.sources(plan)['2026-11']);
}
const old=JSON.parse(storage['db-rate-sources-v1']);delete old.customerPlans;storage['db-rate-sources-v1']=JSON.stringify(old);
assert.equal(load('DB').window.RATE_IMPORT.month,'2026-12');
assert.equal(load('DC').window.RATE_IMPORT.month,'2026-11');
const invalid=[row(2)];invalid.rateColumns={DB:'J'};assert.ok(api.validateAll(invalid).fatal.length);
console.log('PASS: per-plan sources and rates, exact DCIRP lineup provenance, independent DB-zero/DC-present handling, default-option exclusion, atomic three-plan writes, legacy DB-only storage, month reload and unchanged management.');
