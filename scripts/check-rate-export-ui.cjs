const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
function node(){return {hidden:false,disabled:false,value:'',checked:false,style:{setProperty(k,v){this[k]=v}},attributes:{},dataset:{},events:{},children:[],
 classList:{toggle() {},contains(){return false}},focus(){this.focused=true},setAttribute(k,v){this.attributes[k]=v},removeAttribute(k){delete this[k]},
 addEventListener(k,fn){this.events[k]=fn},append(...items){this.children.push(...items)},remove(){this.removed=true},click(){this.clicked=true},querySelectorAll(){return []}};}
function boot(){
 const nodes=new Map();const $=id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id)};
 const current=node(),all=node();current.dataset.saveScope='current';all.dataset.saveScope='all';
 const body=node(),window=node(),document=node();let selected=current,error='',failBlob=false,blobCallback;
 let defer=false,shares=0,draws=0;const created=[],revoked=[],anchors=[],snapshots=[];
 const canvas={toBlob(cb){if(defer)blobCallback=cb;else cb(failBlob?null:{type:'image/png'})}};
 Object.assign(document,{body,fonts:{ready:Promise.resolve()},activeElement:current,getElementById:$,
  querySelector:()=>selected,querySelectorAll:()=>[current,all],createElement:tag=>{if(tag==='canvas')return canvas;const a=node();anchors.push(a);return a}});
 const context={document,window,navigator:{canShare:()=>true,async share(){shares++}},URL:{createObjectURL(blob){created.push(blob);return 'blob:test-'+created.length},revokeObjectURL(url){revoked.push(url)}},File:class{constructor(blobs,name,options){this.blobs=blobs;this.name=name;this.type=options.type}},
  els:{saveModal:$('saveModal'),saveButton:$('saveButton'),previewButton:$('previewButton')}};
 window.requestAnimationFrame=fn=>fn();window.RateExport={snapshot(scope,now,memo){if(error)throw Error(error);snapshots.push({scope,memo});return {scope,memo,rows:[{}],title:'2026년 11월 금리표',filename:'rates.png'}},draw(){draws++;return {width:1080}}};
 $('exportModal').hidden=true;
 vm.runInNewContext(fs.readFileSync('rate-export-ui.js','utf8'),context);
 return {$,context,canvas,created,revoked,anchors,snapshots,open:()=>window.RateExportUI.open(),draws:()=>draws,shares:()=>shares,
  error:v=>error=v,failBlob:()=>failBlob=true,deferBlob:()=>defer=true,finishBlob:()=>blobCallback({type:'image/png'}),scope:v=>{selected=v==='all'?all:current;selected.events.click();}};
}
(async()=>{
 const app=boot();await app.open();
 assert.equal(app.$('exportModal').hidden,false);assert.equal(app.$('saveModal').hidden,true);
 assert.equal(app.$('exportDownload').disabled,false);assert.equal(app.$('exportShare').hidden,false);
 assert.equal(app.$('exportImage').src,app.$('exportOpenImage').href);
 app.$('exportDownload').events.click();assert.equal(app.anchors[0].href,app.$('exportImage').src);assert.equal(app.anchors[0].download,'rates.png');assert(app.anchors[0].clicked);
 await app.$('exportShare').events.click();assert.equal(app.shares(),1);assert.equal(app.$('exportDownload').disabled,false);
 app.$('exportBack').events.click();assert.equal(app.$('exportModal').hidden,true);assert.equal(app.$('saveModal').hidden,false);assert.equal(app.revoked.length,1);
 app.scope('all');await app.open();assert.match(app.$('exportSummary').textContent,/전체 금리표/);
 app.$('exportClose').events.click();assert(app.$('saveButton').focused);assert.equal(app.context.document.body.style.overflow,'');
 const empty=boot();empty.error('저장할 상품이 없습니다');await empty.open();assert.match(empty.$('saveMessage').textContent,/저장할 상품/);assert.equal(empty.draws(),0);assert.equal(empty.$('exportModal').hidden,true);
 const failed=boot();failed.failBlob();await failed.open();assert.match(failed.$('exportMessage').textContent,/실패/);assert.equal(failed.$('exportDownload').disabled,true);
 const slow=boot();slow.deferBlob();const pending=slow.open();await Promise.resolve();await Promise.resolve();await slow.open();
 assert.equal(slow.draws(),1);slow.$('exportClose').events.click();slow.finishBlob();await pending;
 assert.equal(slow.$('exportModal').hidden,true);assert.equal(slow.created.length,0);
 const memo=boot();assert(memo.$('exportMemoFields').hidden);assert(memo.$('exportMemo').disabled);
 memo.$('exportMemoEnabled').checked=true;memo.$('exportMemoEnabled').events.change();
 assert(!memo.$('exportMemoFields').hidden);assert(memo.$('exportMemo').focused);
 memo.$('exportMemo').value='😀'.repeat(101);memo.$('exportMemo').events.input({isComposing:false});
 assert.equal(Array.from(memo.$('exportMemo').value).length,100);assert.equal(memo.$('exportMemoCount').textContent,'100 / 100자');
 await memo.open();assert.equal(Array.from(memo.snapshots.at(-1).memo).length,100);
 memo.$('exportBack').events.click();assert(memo.$('exportMemoEnabled').checked);
 memo.scope('all');assert(memo.$('exportMemoOption').hidden);await memo.open();assert.equal(memo.snapshots.at(-1).memo,'');
 memo.$('exportClose').events.click();memo.$('saveButton').events.click();assert.equal(memo.$('exportMemo').value,'');assert(!memo.$('exportMemoEnabled').checked);
 console.log('PASS: opt-in memo, Unicode paste limit, current/all scope isolation, preserved back-navigation draft and reset on new save.');
 console.log('PASS: preview/download use identical PNG, prepared-file sharing, back/reopen/close focus, URL cleanup, empty/blob errors, duplicate-click guard and close-during-generation.');
})().catch(error=>{console.error(error);process.exitCode=1});
