const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const elements=new Map();
function el(id){if(!elements.has(id))elements.set(id,{value:'all',textContent:'',hidden:false,innerHTML:'',querySelector:()=>el('heading-child'),after(){},options:[0,1,2,3].map(value=>({value:String(value)}))});return elements.get(id);}
const periods=[0,1,2,3].map(value=>({value:String(value),checked:true}));
const categories=['파생결합사채','보험','은행예금','저축은행예금'].map(value=>({value,checked:true}));
const context=vm.createContext({window:{},localStorage:{getItem(){return null}},document:{getElementById:el,createElement:()=>el('validation'),querySelector:el,querySelectorAll(selector){return selector.includes('periodMenu')?periods.filter(x=>x.checked):selector.includes('categoryMenu')?categories.filter(x=>x.checked):[];}}});
for(const f of ['rates-data.js','rate-model.js','basic-settings-data.js','rate-export.js'])vm.runInContext(fs.readFileSync(f,'utf8'),context);
const run=s=>vm.runInContext(s,context),copy=x=>JSON.parse(JSON.stringify(x));
run(`rates.forEach(r=>{r.grade=window.BASIC_SETTINGS_SEED.institutions[r.institutionCode]?.grade||null;r.lineup=window.BASIC_SETTINGS_SEED.products[r.id]?.lineup||null;});`);
const api=context.window.RateExport;
const before=run('JSON.stringify(rates)');
const initial=api.snapshot('current',new Date('2026-11-10T06:00:00Z'));
assert.equal(initial.rows.length,52);
assert.equal(initial.title,'2026년 11월 원리금보장상품 금리');
assert.deepEqual(copy(initial.rows.map(r=>r.id)),copy(run('filteredRows().map(r=>r.id)')));
const filtersBefore=[el('lineupFilter').value,el('proposalFilter').value,el('sortFilter').value,el('maturitySort').value];
const all=api.snapshot('all',new Date('2026-11-10T06:00:00Z'));
const approved=JSON.parse(fs.readFileSync('scripts/fixtures/approved-november-order.json','utf8'));
assert.deepEqual(copy(all.rows.map(r=>r.id)),approved);
assert.equal(all.rows.length,98);assert.deepEqual(copy(all.indices),[0,1,2,3]);
assert.deepEqual(filtersBefore,[el('lineupFilter').value,el('proposalFilter').value,el('sortFilter').value,el('maturitySort').value]);
assert.equal(run('JSON.stringify(rates)'),before);
assert.match(all.filename,/2026년11월/);assert.match(all.created,/15(?::00:00|시 0분 0초)/);
assert(all.rows.every(r=>!('proposals'in r)&&!('note'in r)&&!('amount'in r)));
const gic=all.rows.find(r=>r.id==='IL03|1001|');
if(gic)assert(gic.cells.some(c=>c.includes('(')));
assert(all.rows.some(r=>r.cells.includes('—')));
// Only 3y shown; status is scoped to that term, not other hidden maturities.
periods.forEach((p,i)=>p.checked=i===2);
run("els.lineupFilter.value='all'; els.sortFilter.value='rate';document.getElementById('maturitySort').value='2';rates[0].proposals={12:'N',36:'Y'};");
const selected=api.snapshot('current');assert.deepEqual(copy(selected.indices),[2]);
assert(selected.rows.every(r=>r.cells.length===1));
const first=run('rates[0].id');assert.equal(selected.rows.find(r=>r.id===first).status,'Y');
assert.equal(api.snapshot('all').rows.find(r=>r.id===first).status,'일부');
const savedCell=selected.rows.find(r=>r.id===first).cells[0];
run('rates[0].terms[36].rate=99;');assert.equal(selected.rows.find(r=>r.id===first).cells[0],savedCell);
categories.forEach(c=>c.checked=false);assert.throws(()=>api.snapshot('current'),/저장할 상품/);
assert.equal(api.snapshot('all').rows.length,98);
periods.forEach(p=>p.checked=false);assert.throws(()=>api.snapshot('current'),/저장할 상품/);
// Renderer contract: all cells, final row, and long labels survive wrapping.
const painted=[],positions=[];const ctx={font:'',fillStyle:'',textAlign:'',textBaseline:'',scale(){},fillRect(){},measureText:t=>({width:[...String(t)].length*10}),fillText(t,x,y){painted.push(String(t));positions.push({text:String(t),x,y,align:this.textAlign});}};
const canvas={getContext:()=>ctx};const dims=api.draw(canvas,all);
assert(canvas.height>5000 && canvas.width>1000);assert(dims.pixelWidth*dims.pixelHeight<=12010000);
assert(painted.includes(all.rows.at(-1).institution));
const tableHeader=positions.find(p=>p.text==='상품');
assert(positions.find(p=>p.text==='(연, %)').y<tableHeader.y);
assert.equal(positions.find(p=>p.text==='(연, %)').align,'right');
assert(painted.includes('· 적용기간 : 2026.11.01 ~ 2026.11.30'));
assert(painted.includes('· 정렬기준 : 상품군별 기본순'));
assert(!painted.some(t=>/조회조건|저장범위|생성일시|선택한 만기를 기준|DB금리 0/.test(t)));
for(const text of ['* GIC 금리는 공시금리 (단리연환산금리) 입니다.','* 상품 매수 전 매수가능여부를 확인해주세요.']){
 const note=positions.find(p=>p.text===text);assert(note);assert(note.y>positions.find(p=>p.text===all.rows.at(-1).institution).y);assert(note.y<dims.height);
}
assert(positions.filter(p=>p.text.startsWith('· ')).every(p=>p.y<tableHeader.y));
assert(!painted.includes('사업자')&&!painted.includes('라인업')&&!painted.includes('제안가능'));
assert(painted.includes('상품')&&painted.includes('제공기관')&&painted.includes('등급'));
assert(all.rows.every(r=>!('lineup' in r)&&!('pension' in r)));
painted.length=0;api.draw(canvas,selected);
assert(painted.includes('· 정렬기준 : 3년 금리 높은 순'));
painted.length=0;api.draw(canvas,initial);
assert(painted.includes('· 정렬기준 : 1년 금리 높은 순'));
painted.length=0;api.draw(canvas,selected);
assert(!painted.includes('사업자')&&!painted.includes('라인업')&&!painted.includes('제안가능'));
assert(painted.includes('상품')&&painted.includes('제공기관')&&painted.includes('등급'));
assert(painted.includes(selected.rows.at(-1).institution));
assert.throws(()=>api.draw({getContext:()=>null},all),/브라우저/);
console.log('PASS: current filters/order, all 98 approved IDs, four/all vs selected maturities, status scope, immutable snapshot, no internal data, empty/error handling, filename, Korea time and complete canvas.');
// Optional native Canvas QA: generate the same production document and PNG.
if(process.env.RATE_EXPORT_CANVAS_MODULE){
 const {createCanvas,GlobalFonts}=require(process.env.RATE_EXPORT_CANVAS_MODULE);
 GlobalFonts.registerFromPath('C:/Windows/Fonts/malgun.ttf','Malgun Gothic');
 const out='outputs/export-qa';fs.mkdirSync(out,{recursive:true});
 for(const [name,data] of [['all',all],['current',initial],['selected',selected]]){
  const canvas=createCanvas(1,1);api.draw(canvas,data);const png=canvas.toBuffer('image/png');
  assert(png.length>10000);fs.writeFileSync(`${out}/${name}.png`,png);
  console.log(`PNG ${name}: ${canvas.width}x${canvas.height}, ${data.rows.length} products`);
 }
}
