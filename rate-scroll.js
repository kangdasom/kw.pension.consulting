/* Viewport controls for the sales table; source table/data remain authoritative. */
(() => {
  function createController(table){
  let disposed=false;
  const listeners=[],observers=[];
  function listen(target,type,fn,options){target.addEventListener(type,fn,options);listeners.push(()=>target.removeEventListener(type,fn,options));}
  const scroller = table.closest('.table-scroll');
  const panel = document.getElementById('panel-sales');
  const floatingHead = document.createElement('div');
  floatingHead.className = 'table-frame floating-rate-head';
  floatingHead.hidden = true;
  floatingHead.setAttribute('aria-hidden','true');
  const headScroll = document.createElement('div');
  headScroll.className = 'table-scroll';
  floatingHead.append(headScroll);
  const bar = document.createElement('div');
  bar.className = 'floating-rate-scroll';
  bar.hidden = true;
  const slider = document.createElement('input');
  slider.type = 'range'; slider.min = '0'; slider.step = '1'; slider.value = '0';
  slider.setAttribute('aria-label','금리표 가로 스크롤');
  bar.append(slider);
  document.body.append(floatingHead,bar);
  let pending = false, headerDirty = true;
  const viewport = () => ({
    top: window.visualViewport?.offsetTop || 0,
    left: window.visualViewport?.offsetLeft || 0,
    width: window.visualViewport?.width || document.documentElement.clientWidth,
    height: window.visualViewport?.height || window.innerHeight
  });
  function syncHeader() {
    const copy = document.createElement('table');
    copy.className = table.className;
    const head = table.tHead.cloneNode(true);
    const originalCells = [...table.tHead.rows[0].cells];
    [...head.rows[0].cells].forEach((cell,index) => {
      const original = originalCells[index];
      if(original.hidden){ cell.remove(); return; }
      const width = original.getBoundingClientRect().width + 'px';
      cell.style.width = width; cell.style.minWidth = width; cell.style.maxWidth = width;
      if(window.getComputedStyle){cell.style.fontSize=window.getComputedStyle(original).fontSize;cell.style.height=original.getBoundingClientRect().height+'px';}
    });
    copy.style.width = table.getBoundingClientRect().width + 'px';
    copy.append(head);
    headScroll.replaceChildren(copy);
    headerDirty = false;
  }
  function update() {
    pending = false;if(disposed)return;
    const view = viewport(), rect = scroller.getBoundingClientRect();
    const header = table.tHead.getBoundingClientRect();
    const tableBottom = table.getBoundingClientRect().bottom;
    const bodyVisible = table.tBodies[0].rows.length > 0;
    const blocked = panel.hidden || !scroller.getClientRects().length ||
      !!document.querySelector('.modal-backdrop:not([hidden])');
    const left = Math.max(view.left,rect.left);
    const width = Math.max(0,Math.min(view.left+view.width,rect.right)-left);
    const inView = !blocked && bodyVisible && width>0 &&
      tableBottom>view.top+header.height && header.bottom<view.top+view.height;
    const maximum = Math.max(0,scroller.scrollWidth-scroller.clientWidth);
    const scrollLeft = Math.max(0,Math.min(maximum,scroller.scrollLeft));
    slider.max = String(maximum);
    slider.value = String(scrollLeft);
    slider.setAttribute('aria-valuetext',maximum ? `${Math.round(scrollLeft/maximum*100)}%` : '0%');
    // At a section boundary, use the table occupying most of the viewport.
    // This also handles the last table when scrolling is clamped at page end.
    const visibleHeight=(top,bottom)=>Math.max(0,Math.min(bottom,view.top+view.height)-Math.max(top,view.top));
    const moreVisible=[...document.querySelectorAll('#sales-view-ranking .sales-ranking-table')].some(other=>{
      if(other===table||!other.tBodies[0].rows.length||!other.getClientRects().length)return false;
      const r=other.getBoundingClientRect(),h=other.tHead.getBoundingClientRect(),s=other.closest('.table-scroll').getBoundingClientRect();
      const otherHeight=visibleHeight(h.top,r.bottom),ownHeight=visibleHeight(header.top,tableBottom);
      return s.left<rect.right&&s.right>rect.left&&(otherHeight>ownHeight||(otherHeight===ownHeight&&h.top<header.top));
    });
    bar.hidden = !inView || maximum<1 || moreVisible;
    if(!bar.hidden){
      bar.style.left = left+'px'; bar.style.width = width+'px';
      // Pin to the visible viewport, including browser chrome/keyboard resizing.
      bar.style.top = Math.min(view.top+view.height-bar.offsetHeight,tableBottom)+'px';
    }
    floatingHead.hidden = !inView || header.top>=view.top;
    if(!floatingHead.hidden){
      if(headerDirty) syncHeader();
      floatingHead.style.left = left+'px'; floatingHead.style.width = width+'px';
      floatingHead.style.top = Math.min(view.top,tableBottom-header.height)+'px';
      headScroll.scrollLeft = scrollLeft;
    }
  }
  function schedule(rebuild = false) {
    headerDirty ||= rebuild;
    if(!pending){pending=true; window.requestAnimationFrame(update);}
  }
  listen(slider,'input',() => {scroller.scrollLeft=Number(slider.value);schedule();});
  listen(scroller,'scroll',() => schedule(),{passive:true});
  listen(headScroll,'scroll',() => {
    if(Math.abs(scroller.scrollLeft-headScroll.scrollLeft)>1){
      scroller.scrollLeft=headScroll.scrollLeft;schedule();
    }
  },{passive:true});
  listen(window,'scroll',() => schedule(),{passive:true});
  listen(window,'resize',() => schedule(true));
  if(window.visualViewport)listen(window.visualViewport,'resize',() => schedule(true));
  if(window.visualViewport)listen(window.visualViewport,'scroll',() => schedule());
  const changes=new MutationObserver(() => schedule(true));changes.observe(table,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden']});
  const visibility = new MutationObserver(() => schedule(true));
  visibility.observe(panel,{attributes:true,attributeFilter:['hidden']});
  document.querySelectorAll('.modal-backdrop').forEach(modal=>visibility.observe(modal,{attributes:true,attributeFilter:['hidden']}));
  observers.push(changes,visibility);
  const sizes = new ResizeObserver(() => schedule(true));
  sizes.observe(scroller);sizes.observe(table);observers.push(sizes);
  document.fonts?.ready.then(() => schedule(true));
  schedule(true);
  return ()=>{disposed=true;listeners.forEach(remove=>remove());observers.forEach(o=>o.disconnect());floatingHead.remove();bar.remove();};
  }
  const controllers=new Map();
  function refresh(){
    const tables=[document.getElementById('rateTableBody').closest('table'),...document.querySelectorAll('#sales-view-ranking .sales-ranking-table')];
    for(const [table,dispose] of controllers)if(!tables.includes(table)){dispose();controllers.delete(table);}
    for(const table of tables)if(!controllers.has(table))controllers.set(table,createController(table));
  }
  window.RateScroll={refresh};refresh();
})();
