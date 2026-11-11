const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
// Exercise actual viewport callbacks without touching the user's browser/data.
function node(){return {hidden:false,style:{},attributes:{},children:[],events:{},scrollLeft:0,offsetHeight:40,
 setAttribute(k,v){this.attributes[k]=v},append(...items){this.children.push(...items)},
 replaceChildren(...items){this.children=items},addEventListener(k,fn){this.events[k]=fn}};}
const body=node(),panel=node(),scroller=node(),table=node(),head=node(),sliderBody=node();
let top=300,bottom=3000,modal=false,hasLayout=true;
let widths=[42,44,66,36,38,38,38,38,34,38];
const cells=widths.map((width,index)=>({...node(),getBoundingClientRect:()=>({width:widths[index]}),remove(){this.removed=true}}));
head.rows=[{cells}];head.getBoundingClientRect=()=>({top,bottom:top+32,height:32});
head.cloneNode=()=>({rows:[{cells:cells.map(cell=>({...node(),remove(){this.removed=true}}))}]});
table.tHead=head;table.tBodies=[{rows:[{},{}]}];
table.getBoundingClientRect=()=>({width:scroller.scrollWidth,bottom});
scroller.getBoundingClientRect=()=>({left:8,right:382});
scroller.getClientRects=()=>hasLayout?[{}]:[];
scroller.clientWidth=374;scroller.scrollWidth=412;
table.closest=()=>scroller;sliderBody.closest=()=>table;
const window=node(),observers=[];let frame;
window.innerHeight=800;window.requestAnimationFrame=fn=>{frame=fn};
window.visualViewport={...node(),offsetTop:0,offsetLeft:0,width:390,height:800};
const context={window,MutationObserver:class{constructor(fn){this.callback=fn;observers.push(this)}observe(){}},ResizeObserver:class{constructor(fn){this.callback=fn;observers.push(this)}observe(){}},document:{
 body,documentElement:{clientWidth:390},getElementById:id=>id==='panel-sales'?panel:sliderBody,
 createElement:node,querySelector:()=>modal?{}:null,querySelectorAll:()=>[]
}};
vm.runInNewContext(fs.readFileSync('rate-scroll.js','utf8'),context);
const floatingHead=body.children[0],bar=body.children[1],slider=bar.children[0],headScroll=floatingHead.children[0];
function flush(){const fn=frame;frame=null;assert(fn,'expected scheduled frame');fn();}
function scroll(){window.events.scroll();flush();}
flush();
assert.equal(bar.hidden,false);assert.equal(bar.style.top,'760px');assert.equal(slider.max,'38');
assert.equal(floatingHead.hidden,true);
// Header takes over only after original row exits the viewport.
top=-300;scroll();assert.equal(floatingHead.hidden,false);assert.equal(floatingHead.style.top,'0px');
assert.equal(headScroll.children[0].children[0].rows[0].cells[0].style.width,'42px');
slider.value='38';slider.events.input();flush();
assert.equal(scroller.scrollLeft,38);assert.equal(headScroll.scrollLeft,38);
scroller.scrollLeft=12;scroller.events.scroll();flush();assert.equal(slider.value,'12');
headScroll.scrollLeft=30;headScroll.events.scroll();flush();assert.equal(scroller.scrollLeft,30);
// Last row remains exposed: move bar below table instead of covering its cells.
bottom=650;scroll();assert.equal(bar.style.top,'650px');
bottom=20;scroll();assert.equal(bar.hidden,true);assert.equal(floatingHead.hidden,true);
bottom=3000;panel.hidden=true;scroll();assert.equal(bar.hidden,true);
panel.hidden=false;modal=true;scroll();assert.equal(bar.hidden,true);assert.equal(floatingHead.hidden,true);
modal=false;hasLayout=false;scroll();assert.equal(bar.hidden,true);
hasLayout=true;table.tBodies[0].rows=[];scroll();assert.equal(bar.hidden,true);
table.tBodies[0].rows=[{}];scroller.scrollWidth=374;scroll();assert.equal(bar.hidden,true);
scroller.scrollWidth=412;window.visualViewport.height=600;scroll();assert.equal(bar.style.top,'560px');
// Maturity/header mutations rebuild using measured visible columns.
cells[4].hidden=true;observers[0].callback();flush();
assert.equal(headScroll.children[0].children[0].rows[0].cells[4].removed,true);
console.log('PASS: viewport-pinned scrollbar/header, bidirectional horizontal sync, last-row visibility, tabs/modals/empty results, viewport resizing and maturity-column rebuild.');
