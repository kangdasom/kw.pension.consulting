const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

// Exercise management event handlers with isolated storage; never touch user settings.
function boot(storage = {}, failWrites = false, month = '2026-07', useSeed = false, source = 'scripts/fixtures/rates-july.js') {
  const elements = new Map();
  function element(id = '') {
    if (id && elements.has(id)) return elements.get(id);
    const node = {
      id, value: '', hidden: false, checked: false, dataset: {}, children: [], attributes: {},
      textContent: '', options: [],
      classList: { contains: () => false, toggle() {} },
      setAttribute(name, value) { this.attributes[name] = value; },
      append(...children) { this.children.push(...children); },
      insertAdjacentHTML() {}, addEventListener(name, handler) { this['on'+name]=handler; }, focus() {},
      querySelector() { return null; }, querySelectorAll() { return []; }
    };
    Object.defineProperty(node, 'innerHTML', {
      get() { return this.html || ''; },
      set(html) {
        this.html = html;
        for (const match of html.matchAll(/id="([^"]+)"/g)) element(match[1]);
      }
    });
    if (id) elements.set(id, node);
    return node;
  }
  const shell = element('shell');
  const context = vm.createContext({
    window: { RATE_IMPORT: null, addEventListener() {} },
    document: {
      getElementById: element,
      createElement: () => element(),
      querySelector: () => shell
    },
    localStorage: {
      getItem: key => storage[key] || null,
      setItem(key, value) { if (failWrites) throw Error('storage blocked'); storage[key] = value; }
    },
    confirm: () => true
  });
  vm.runInContext(fs.readFileSync(source, 'utf8'), context);
  if (useSeed) {
    vm.runInContext(fs.readFileSync('basic-settings-data.js', 'utf8'), context);
    vm.runInContext(fs.readFileSync('pension-providers-data.js', 'utf8'), context);
  }
  vm.runInContext(`
    const importData = window.RATE_IMPORT;
    importData.month = ${JSON.stringify(month)};
    const rates = importData.products;
    const maturities = [12,18,36,60];
    const ratingOrder = ['AAA','AA+','AA','AA-','A+','A'];
    const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    function displayRate(row,index){ return String(row.terms[maturities[index]]?.rate ?? '—'); }
    let renderCount = 0;
    function render(){ renderCount++; }
  `, context);
  vm.runInContext(fs.readFileSync('management.js','utf8'), context);
  return { context, elements, element, storage, run: source => vm.runInContext(source, context) };
}
const app = boot();
const first = app.run('rates[0].id');
const institution = app.run('rates[0].institutionCode');
const row = app.run('rates[0]');
assert.equal(row.proposals[12], '확인');
assert.match(app.element('manageRows').innerHTML, /조건에 맞는 상품이 없습니다/);
// Draft edits do not affect published source rows.
app.element('basicRows').onchange({target:{dataset:{institution,field:'grade'},value:'AA+'}});
app.element('basicRows').onchange({target:{dataset:{institution,field:'pension'},value:'Y'}});
app.element('basicRows').onchange({target:{dataset:{product:first},value:'Y'}});
assert.equal(row.grade, null);
app.element('manageRows').onchange({target:{dataset:{row:first,term:'12'},value:'Y'}});
assert.equal(row.proposals[12], '확인');
// Each save button publishes only its own settings group.
app.element('saveBasic').onclick();
assert.equal(row.grade, 'AA+');
assert.equal(row.lineup, 'Y');
assert.equal(row.proposals[12], '확인');
app.element('saveMonthly').onclick();
assert.equal(row.proposals[12], 'Y');
// Stable institution code applies to every product of the same institution.
assert.equal(app.run(`rates.filter(r=>r.institutionCode===${JSON.stringify(institution)}).every(r=>r.grade==='AA+' && r.pension==='Y')`), true);
// Bulk change only existing terms of selected products.
app.element('manageRows').onchange({target:{dataset:{select:first},checked:true}});
app.element('bulkTerm').value = 'all';
app.element('bulkStatus').value = 'N';
app.element('bulkApply').onclick();
assert.equal(row.proposals[12], 'Y');
app.element('saveMonthly').onclick();
assert.equal(row.proposals[12], 'N');
assert.equal(row.terms[18], undefined);
// Reload keeps settings; a new month preserves basics, resets monthly states.
const reload = boot(app.storage);
assert.equal(reload.run('rates[0].grade'), 'AA+');
assert.equal(reload.run('rates[0].proposals[12]'), 'N');
const nextMonth = boot(app.storage, false, '2026-08');
assert.equal(nextMonth.run('rates[0].lineup'), 'Y');
assert.equal(nextMonth.run('rates[0].proposals[12]'), '확인');
const failed = boot({}, true);
failed.element('manageRows').onchange({target:{dataset:{row:first,term:'12'},value:'Y'}});
failed.element('saveMonthly').onclick();
assert.equal(failed.run('rates[0].proposals[12]'), '확인');
assert.match(failed.element('monthlyMessage').textContent,/저장하지 못했습니다/);
console.log('PASS: draft isolation, separate saves, institution propagation, term bulk edits, storage reload, new-month reset, storage failure.');

// Real first-sheet seed: exact product matching, independent grades, no monthly changes.
const seeded = boot({}, false, '2026-07', true);
assert.equal(seeded.run('rates.filter(r=>r.grade).length'), 97);
assert.equal(seeded.run("rates.find(r=>r.id==='IL39|1001|II').grade"), 'AA+');
assert.equal(seeded.run("rates.find(r=>r.id==='S017|7001|').lineup"), 'Y');
assert.equal(seeded.run("rates.find(r=>r.id==='IL74|1001|II').lineup"), null);
assert.equal(seeded.run("rates.find(r=>r.id==='IL34|1001|보너스 이율').lineup"), null);
assert.equal(seeded.run("rates.every(r=>['Y','N'].includes(r.pension) && Object.values(r.proposals).every(v=>v==='확인'))"), true);
assert.equal(seeded.run('window.BASIC_SETTINGS_SEED.matches.length'), 86);
assert.equal(seeded.run('window.BASIC_SETTINGS_SEED.unmatched.length'), 11);
assert.equal(seeded.run("rates.filter(r=>r.lineup==='Y').length"), 52);
assert.equal(seeded.run("rates.filter(r=>r.lineup==='N').length"), 34);
assert.equal(seeded.run("rates.filter(r=>r.lineup===null).length"), 11);
const manual = {'db-rate-management-v1': JSON.stringify({institutions:{IL39:{grade:'AAA',pension:'N'}, S017:{grade:''}}, products:{'S017|7001|':{lineup:'N'}}, months:{'2026-07':{[JSON.stringify(['IL39|1001|II','12'])]:{status:'Y',amount:'10억원',note:'유지'}}}})};
const preserved = boot(manual, false, '2026-07', true);
assert.equal(preserved.run('rates[0].grade'), 'AAA');
assert.equal(preserved.run('rates[0].pension'), 'N');
assert.equal(preserved.run('rates[0].proposals[12]'), 'Y');
assert.equal(preserved.run("rates.find(r=>r.id==='S017|7001|').lineup"), 'N');
assert.equal(preserved.run("rates.find(r=>r.id==='S017|7001|').grade"), null);
preserved.element('saveBasic').onclick();
assert.equal(JSON.parse(manual['db-rate-management-v1']).months['2026-07'][JSON.stringify(['IL39|1001|II','12'])].amount, '10억원');
assert.equal(JSON.parse(manual['db-rate-management-v1']).months['2026-07'][JSON.stringify(['IL39|1001|II','12'])].note, '유지');
console.log('PASS: first-sheet seed coverage, exact GIC variants, unchanged monthly records, manual overrides and cleared values preserved.');
// Provider defaults cover every institution; aliases never match savings banks.
assert.equal(seeded.run('window.PENSION_PROVIDERS.names.length'),43);
for (const code of ['IL05','IL34','IL03','IL01','IL71','IN10','IN09','B039','B032','B004','B011','B003','B031','S017']) {
  assert.equal(seeded.run(`rates.find(r=>r.institutionCode==='${code}').pension`),'Y',code);
}
for (const code of ['IL39','IL63','IN01','IN19','B007','B090','J065','S031']) {
  assert.equal(seeded.run(`rates.find(r=>r.institutionCode==='${code}').pension`),'N',code);
}
const targetRows=seeded.run("rates.filter(r=>r.lineup==='Y').map(r=>({id:r.id,institution:r.institution}))");
assert.equal((seeded.element('manageRows').innerHTML.match(/data-select=/g)||[]).length,52);
const target=targetRows[0];
seeded.element('manageRows').onclick({target:{dataset:{detail:target.id}}});
assert.equal(seeded.element('termDetails').dataset.row,target.id);
seeded.element('manageRows').onchange({target:{dataset:{select:target.id},checked:true}});
seeded.element('basicRows').onchange({target:{dataset:{product:target.id},value:'N'}});
assert.equal(seeded.element('termDetails').innerHTML,'');
assert.equal(seeded.element('manageSelection').textContent,'0개 선택');
assert.equal((seeded.element('manageRows').innerHTML.match(/data-select=/g)||[]).length,51);
seeded.element('manageRows').onchange({target:{dataset:{row:target.id,term:'12'},value:'Y'}});
seeded.element('saveMonthly').onclick();
assert.equal(seeded.run(`rates.find(r=>r.id===${JSON.stringify(target.id)}).proposals[12]`),'확인');
seeded.element('basicRows').onchange({target:{dataset:{product:target.id},value:'Y'}});
assert.equal((seeded.element('manageRows').innerHTML.match(/data-select=/g)||[]).length,52);
seeded.element('saveBasic').onclick();
const providerReload=boot(seeded.storage,false,'2026-08',true);
assert.equal(providerReload.run("rates.find(r=>r.institutionCode==='B004').pension"),'Y');
console.log('PASS: 43 provider names, exact aliases, non-provider exclusions, lineup-only monthly list, deselection/detail cleanup, excluded edit guard, re-inclusion and new-month persistence.');

// Real November source preserves user overrides and old monthly records.
const novemberStorage = {'db-rate-management-v1': JSON.stringify({institutions:{IL34:{grade:'AAA',pension:'N'}},products:{'IL34|1001|보너스 이율':{lineup:'Y'},'S017|7001|':{lineup:'N'}},months:{'2026-07':{legacy:{status:'Y',amount:'10억원',note:'유지'}}}})};
const november = boot(novemberStorage,false,'2026-11',true,'rates-data.js');
assert.equal(november.run('rates.length'),98);
assert.equal(november.run("rates.find(r=>r.id==='IL34|1001|보너스').lineup"),'Y');
assert.equal(november.run("rates.find(r=>r.id==='IL34|1001|보너스').grade"),'AAA');
assert.equal(november.run("rates.find(r=>r.id==='IL34|1001|보너스').pension"),'N');
assert.equal(november.run("rates.find(r=>r.id==='S017|7001|').lineup"),'N');
assert.equal(november.run("rates.find(r=>r.id==='S050|7003|').lineup"),null);
assert.equal(november.run("rates.find(r=>r.id==='IL05|1001|').proposals[18]"),'N');
assert.equal(november.run("rates.find(r=>r.id==='IN01|1001|III').proposals[36]"),'Y');
assert.equal(november.run("rates.filter(r=>!['IL05|1001|','IN01|1001|III'].includes(r.id)).every(r=>Object.values(r.proposals).every(v=>v==='확인'))"),true);
november.element('saveBasic').onclick();
assert.equal(JSON.parse(novemberStorage['db-rate-management-v1']).months['2026-07'].legacy.note,'유지');
console.log('PASS: actual November source, preserved institution/lineup settings, renamed bonus, new-product unset, monthly reset and retained historical records.');

// Direct buttons and institution edits use isolated settings, including hidden products.
const direct=boot({},false,'2026-11',true,'rates-data.js');
// Set up a multi-product institution in this isolated test only.
for(const r of direct.run("rates.filter(r=>r.institutionCode==='IL34')")){
  direct.element('basicRows').onchange({target:{dataset:{product:r.id},value:'Y'}});
}
direct.element('saveBasic').onclick();
const group=direct.run("rates.filter(r=>r.lineup==='Y' && r.institutionCode==='IL34')");
assert.ok(group.length>1);
const item=group[0];
const clickStatus=(app,row,term,value)=>app.element('manageRows').onclick({target:{dataset:{row:row.id,term:String(term),status:value}}});
clickStatus(direct,item,12,'Y');
assert.equal(item.proposals[12],'확인');
assert.match(direct.element('monthlyDirty').textContent,/1건/);
assert.match(direct.element('manageRows').innerHTML,/<td class="manage-institution">미래에셋생명<\/td><td class="manage-type">/);
assert.match(direct.element('manageRows').innerHTML,/aria-pressed="true"/);
direct.element('cancelMonthly').onclick();
assert.equal(direct.element('monthlyDirty').textContent,'변경사항 없음');
direct.element('manageSearch').value=item.type;
direct.element('manageCategory').value='예금';
direct.element('manageStatus').value='Y';
direct.element('bulkInstitution').value='IL34';
direct.element('bulkReason').value='기관 전체 일시 중단';
direct.element('bulkScope').value='institution';
direct.element('bulkTerm').value='all';
direct.element('bulkStatus').value='N';
direct.element('bulkApply').onclick();
assert.match(direct.element('monthlyMessage').textContent,/조회 필터와 무관/);
direct.element('saveMonthly').onclick();
assert.ok(group.every(r=>[12,18,36,60].filter(t=>r.terms[t]).every(t=>r.proposals[t]==='N')));
const store=JSON.parse(direct.storage['db-rate-management-v1']);
for(const r of group)for(const t of [12,18,36,60]){
  const entry=store.months['2026-11'][JSON.stringify([r.id,String(t)])];
  if(r.terms[t])assert.equal(entry.reason,'기관 전체 일시 중단');
  else assert.equal(entry,undefined);
}
assert.ok(direct.run("rates.filter(r=>r.institutionCode!=='IL34'&&!['IL05|1001|','IN01|1001|III'].includes(r.id)).every(r=>Object.values(r.proposals).every(s=>s==='확인'))"));
direct.element('bulkReason').value='';
direct.element('manageRows').onclick({target:{dataset:{allRow:item.id,status:'Y'}}});
direct.element('saveMonthly').onclick();
assert.equal(item.proposals[12],'Y');
assert.ok([12,18,36,60].filter(t=>group[1].terms[t]).every(t=>group[1].proposals[t]==='N'));
assert.equal(JSON.parse(direct.storage['db-rate-management-v1']).months['2026-11'][JSON.stringify([item.id,'12'])].reason,'기관 전체 일시 중단');
direct.context.confirm=()=>false;
direct.element('manageRows').onclick({target:{dataset:{allRow:item.id,status:'N'}}});
assert.equal(direct.element('monthlyDirty').textContent,'변경사항 없음');
console.log('PASS: direct status buttons, institution-wide edits across hidden filters, row-only bulk, missing-term exclusion, shared reason preservation, cancel and rejected confirmation.');

// Product/month common details preserve the legacy maturity records and remain drafts.
const sharedId=app.run('rates.find(r=>r.terms[12] && r.terms[36]).id');
const sharedKey=term=>JSON.stringify([sharedId,String(term)]);
const legacyRecords={
  [sharedKey(12)]:{status:'Y',amount:'10억원',reason:'기존 사유',checkedAt:'2026-11-10',note:'1년 기존 비고'},
  [sharedKey(36)]:{status:'N',amount:'20억원',reason:'',checkedAt:'2026-11-20',note:'3년 기존 비고'}
};
const sharedStorage={'db-rate-management-v1':JSON.stringify({institutions:{},products:{[sharedId]:{lineup:'Y'}},months:{'2026-11':legacyRecords,'2026-10':{history:{note:'이전 월 보존'}}}})};
const shared=boot(sharedStorage,false,'2026-11');
const openShared=instance=>instance.element('manageRows').onclick({target:{dataset:{detail:sharedId}}});
const editCommon=(instance,field,value)=>instance.element('termDetails').oninput({target:{dataset:{commonField:field},value}});
const initialStorage=sharedStorage['db-rate-management-v1'];
openShared(shared);
assert.equal(sharedStorage['db-rate-management-v1'],initialStorage);
const detailHtml=shared.element('termDetails').innerHTML;
assert.doesNotMatch(detailHtml,/불가 사유|내부 비고|내부 관리용|data-field="reason"/);
assert.equal((detailHtml.match(/data-common-field="checkedAt"/g)||[]).length,1);
assert.equal((detailHtml.match(/data-common-field="note"/g)||[]).length,1);
assert.match(detailHtml,/value="2026-11-20"/);
assert.match(detailHtml,/1년: 1년 기존 비고\n3년: 3년 기존 비고/);
editCommon(shared,'note','상품 공통 비고\n두 번째 줄');
editCommon(shared,'checkedAt','2026-11-24');
shared.element('termDetails').oninput({target:{dataset:{field:'amount'},value:'30억원',closest:()=>({dataset:{term:'12'}})}});
assert.equal(sharedStorage['db-rate-management-v1'],initialStorage);
shared.element('saveBasic').onclick();
assert.equal(JSON.parse(sharedStorage['db-rate-management-v1']).months['2026-11'][sharedKey('common')],undefined);
shared.element('saveMonthly').onclick();
let storedShared=JSON.parse(sharedStorage['db-rate-management-v1']);
assert.deepEqual(storedShared.months['2026-11'][sharedKey('common')],{checkedAt:'2026-11-24',note:'상품 공통 비고\n두 번째 줄'});
assert.equal(storedShared.months['2026-11'][sharedKey(12)].amount,'30억원');
assert.deepEqual(storedShared.months['2026-11'][sharedKey(36)],legacyRecords[sharedKey(36)]);
assert.equal(storedShared.months['2026-11'][sharedKey(12)].reason,'기존 사유');
assert.equal(storedShared.months['2026-10'].history.note,'이전 월 보존');
const sharedReload=boot(sharedStorage,false,'2026-11');openShared(sharedReload);
assert.match(sharedReload.element('termDetails').innerHTML,/상품 공통 비고\n두 번째 줄/);
editCommon(sharedReload,'note','');editCommon(sharedReload,'checkedAt','');
sharedReload.element('saveMonthly').onclick();
const sharedCleared=boot(sharedStorage,false,'2026-11');openShared(sharedCleared);
assert.doesNotMatch(sharedCleared.element('termDetails').innerHTML,/1년 기존 비고|3년 기존 비고|2026-11-20/);
editCommon(sharedCleared,'note','취소 대상');sharedCleared.element('cancelMonthly').onclick();openShared(sharedCleared);
assert.doesNotMatch(sharedCleared.element('termDetails').innerHTML,/취소 대상/);
const commonNextMonth=boot(sharedStorage,false,'2026-12');openShared(commonNextMonth);
assert.doesNotMatch(commonNextMonth.element('termDetails').innerHTML,/기존 비고|2026-11-/);
const commonFailure=boot(sharedStorage,true,'2026-11');openShared(commonFailure);
editCommon(commonFailure,'note','저장 실패 후 초안');commonFailure.element('saveMonthly').onclick();openShared(commonFailure);
assert.match(commonFailure.element('termDetails').innerHTML,/저장 실패 후 초안/);
assert.match(commonFailure.element('monthlyMessage').textContent,/저장하지 못했습니다/);
console.log('PASS: monthly common date/note, legacy conflict recovery, independent limits/statuses, draft/save/cancel/reload, explicit clears, historical months and failed-save draft preservation.');

// Published monthly fields override stale browser records; unsaved edits are retained.
const sync=boot(sharedStorage,false,'2026-11');
sync.context.window.MonthlyManagementPublisher=require('../management-publish.js');
const syncBefore=sharedStorage['db-rate-management-v1'];
const sharedDoc={schema:'monthly-management-v1',revision:'shared',months:{'2026-11':{[sharedKey(12)]:{status:'N',amount:'공용 한도'},[sharedKey('common')]:{note:'공용 비고',checkedAt:'2026-11-24'}}}};
assert.equal(sync.context.window.RateManagement.receiveShared(sharedDoc).conflicted,false);
assert.equal(sharedStorage['db-rate-management-v1'],syncBefore);
assert.equal(sync.run(`rates.find(r=>r.id===${JSON.stringify(sharedId)}).proposals[12]`),'N');
openShared(sync);assert.match(sync.element('termDetails').innerHTML,/공용 비고/);
editCommon(sync,'note','미저장 비고');
assert.equal(sync.context.window.RateManagement.receiveShared({...sharedDoc,revision:'new',months:{'2026-11':{[sharedKey('common')]:{note:'다른 기기 비고'}}}}).conflicted,true);
openShared(sync);assert.match(sync.element('termDetails').innerHTML,/미저장 비고/);
sync.context.window.RateManagement.receiveShared(sharedDoc,'2026-11');openShared(sync);
assert.match(sync.element('termDetails').innerHTML,/공용 비고/);
assert.doesNotMatch(sync.element('termDetails').innerHTML,/미저장 비고/);
assert.equal(sync.context.window.RateManagement.monthlySnapshot().records[sharedKey(12)].amount,'공용 한도');
assert.equal(sharedStorage['db-rate-management-v1'],syncBefore);
console.log('PASS: published monthly settings override stale cache, unsaved edit conflict detection, explicit latest discard, shared sales status and unchanged browser storage.');
sync.context.window.RateScheme={admin:true};delete sync.context.window.MonthlyManagementPublisher;
sync.element('saveMonthly').onclick();
assert.match(sync.element('monthlyMessage').textContent,/공용 저장 기능을 준비/);
assert.equal(sharedStorage['db-rate-management-v1'],syncBefore);
console.log('PASS: official admin cannot silently fall back to browser-only save when the publication scripts fail.');
