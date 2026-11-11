const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const storage={};let fail=false;
const ctx=vm.createContext({window:{},localStorage:{getItem:k=>storage[k]||null,setItem(k,v){if(fail)throw Error('quota');storage[k]=v;}},Date,Set,Map});
for(const file of ['rates-data.js','rate-upload-core.js'])vm.runInContext(fs.readFileSync(file,'utf8'),ctx);
const api=ctx.window.RateUpload,base=ctx.window.RATE_IMPORT;
const row=(n,rate,code='S017',name='KB증권',more={})=>({number:n,values:{B:'2026-12-01',C:'2026-12-31',D:code+':'+name,F:'7001:ELB',H:'12',I:'',J:String(rate),...more}});
const known=base.products.filter(p=>p.type==='ELB').slice(0,3);
const sample=(i,n,r,more={})=>row(n,r,known[i].institutionCode,known[i].institution,more);
const prev=JSON.parse(JSON.stringify(base));prev.products=known.map(p=>({...p,terms:{12:{rate:4,sourceRow:1}}}));
const history={'2026-11':prev};
let r=api.validate([sample(0,2,4.2),sample(1,3,4),sample(2,4,4)],{history});
assert.equal(r.fatal.length,0);assert.equal(r.comparisons.length,1);
let comparison=r.comparisons[0];
assert.equal(comparison.rows.length,3);assert.ok(Math.abs(comparison.average-(4.2+4+4)/3)<1e-10);
assert.ok(comparison.rows[0].spreadBp>0);assert.ok(comparison.rows[1].spreadBp<0);
assert.deepEqual(Array.from(comparison.rows,r=>r.rank),[1,2,2]);assert.equal(r.snapshot.acceptedTerms,3);
r=api.validate([sample(0,2,3),sample(1,3,3),sample(2,4,3)],{history});assert.equal(r.comparisons[0].rows.length,3);assert.ok(r.comparisons[0].rows.every(r=>r.spreadBp===0&&r.rank===1));
r=api.validate([sample(0,2,4.2)],{history:{'2026-07':prev}});assert.equal(r.comparisons[0].rows[0].spreadBp,0);
assert.equal(api.previousMonth('2027-01'),'2026-12');
assert.equal(api.date('2026/11/1'),'2026-11-01');assert.equal(api.date('2026-02-30'),null);
assert.equal(api.date(46327),'2026-11-01');
r=api.validate([sample(0,2,4),sample(0,3,9),row(4,5,'ZZZZ','신규기관'),sample(1,5,'abc'),sample(2,6,0),sample(1,7,4,{H:'18'}),sample(0,8,4,{B:'2026-11-01',C:'2026-11-30'})],{history});
assert.equal(r.fatal.length,0);assert.equal(r.matching.length,1);assert.equal(r.issues.length,3);assert.equal(r.snapshot.zeroExcluded,1);assert.equal(r.snapshot.acceptedTerms,2);assert.equal(r.snapshot.products[0].terms[12].rate,4);
assert.equal(r.comparisons.length,2);assert.ok(r.comparisons.every(g=>g.rows.length===1&&g.rows[0].spreadBp===0));
r=api.validate([sample(0,2,4),sample(1,3,4,{D:known[1].institutionCode+':다른기관'})],{history});assert.equal(r.matching.length,1);assert.ok(r.snapshot);
assert.equal(api.validate([row(2,4,'ZZZZ','미등록')],{history}).snapshot,null);
// Cross-variant/product comparison uses three broad groups, isolated by maturity.
const groupedRows=[
 sample(0,2,4.2),sample(1,3,4,{F:'7003:DLB'}),
 sample(0,4,5.25,{F:'1001:GIC',I:'Ⅰ'}),sample(1,5,5,{F:'1001:GIC',I:'Ⅱ'}),sample(2,6,5,{F:'1001:GIC',I:'보너스'}),
 sample(0,7,6.3,{F:'3001:은행예금'}),sample(1,8,6,{F:'3002:저축은행예금'}),
 sample(0,9,2,{F:'1001:GIC',I:'Ⅲ',H:'18'})
];
const report=api.validate(groupedRows,{history:{}});
assert.equal(report.comparisons.length,4);
for(const [group,average,count] of [['ELB/DLB',4.1,2],['GIC',15.25/3,3],['예금',6.15,2]]){
 const g=report.comparisons.find(g=>g.group===group&&g.term===12);assert.ok(g);assert.ok(Math.abs(g.average-average)<1e-10);assert.equal(g.rows.length,count);
 assert.ok(g.rows.every((r,i)=>!i||g.rows[i-1].rate>=r.rate));
 assert.ok(Math.abs(g.rows.reduce((sum,r)=>sum+r.spreadBp,0))<1e-9);
}
assert.equal(report.comparisons.find(g=>g.term===18).average,2);
assert.equal(report.snapshot.acceptedTerms,8); // High rates are never excluded or adjusted.
assert.equal(report.snapshot.products.find(p=>p.id.endsWith('|1001|I')).terms[12].rate,5.25);
assert.equal(report.snapshot.products.find(p=>p.id.endsWith('|1001|II')).type,'GIC II');
assert.equal(JSON.stringify(report.snapshot).includes('comparisons'),false);
// Commit cannot modify management keys or partially replace the active source.
storage['db-rate-management-v1']='untouched';const snapshot=r.snapshot;
fail=true;assert.throws(()=>api.commit(snapshot));assert.equal(api.read().activeMonth,null);assert.equal(ctx.window.RATE_IMPORT.month,'2026-11');
fail=false;api.commit(snapshot);assert.equal(api.read().activeMonth,'2026-12');assert.ok(api.sources()['2026-11']);assert.equal(storage['db-rate-management-v1'],'untouched');
vm.runInContext(fs.readFileSync('rates-data.js','utf8'),ctx);vm.runInContext(fs.readFileSync('rate-upload-core.js','utf8'),ctx);assert.equal(ctx.window.RATE_IMPORT.month,'2026-12');
console.log('PASS: full group/maturity rankings, inclusive common mean, positive/zero/negative bp, tied ranks, singleton, unknown/mismatched institutions, duplicate-first, invalid rows, atomic failed writes, source reload and management preservation.');
