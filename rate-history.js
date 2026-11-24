/* Read-only published archives. This page never reads or writes management storage. */
// Canonical column names for the shared PNG renderer; documents keep their own terms.
const maturities = [3,6,12,18,24,36,60];
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const labels={DB:'DB',DC:'DC',IRP:'개인IRP'};
  const params=new URLSearchParams(location.search);
  const plan=String(params.get('plan')||'DB').toUpperCase();
  $('historyPlan').value=labels[plan]?plan:'DB';
  const catalog=window.RATE_HISTORY;
  const months=catalog?.version===1&&Array.isArray(catalog.months)?catalog.months:[];
  const monthLabel=value=>value.replace(/^(\d{4})-0?(\d+)$/, '$1년 $2월');
  const termLabel=value=>value<12?value+'개월':value/12+'년';
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let current=null,result=null,generation=0,busy=false;
  const date=value=>{
    if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
    const stamp=new Date(value+'T00:00:00Z');
    return Number.isFinite(+stamp)&&stamp.toISOString().slice(0,10)===value;
  };
  function valid(document,month){
    return document&&date(document.start)&&date(document.end)&&document.start<=document.end&&document.start.slice(0,7)===month&&
      typeof document.sortLabel==='string'&&Array.isArray(document.maturities)&&document.maturities.length>0&&
      new Set(document.maturities).size===document.maturities.length&&document.maturities.every(value=>maturities.includes(value))&&
      Array.isArray(document.rows)&&document.rows.length>0&&document.rows.every(row=>
        row&&typeof row.id==='string'&&typeof row.product==='string'&&typeof row.institution==='string'&&
        typeof row.isGic==='boolean'&&Array.isArray(row.cells)&&row.cells.length===document.maturities.length&&
        row.cells.every(cell=>typeof cell==='string'));
  }
  const entries=()=>months.filter(entry=>entry&&/^\d{4}-(0[1-9]|1[0-2])$/.test(entry.month)&&valid(entry.plans?.[$('historyPlan').value],entry.month))
    .slice().sort((a,b)=>b.month.localeCompare(a.month));
  function dispose(){
    if(result)URL.revokeObjectURL(result.url);
    result=null;$('exportImage').removeAttribute('src');$('exportOpenImage').removeAttribute('href');
  }
  function close(){
    generation++;busy=false;dispose();$('exportModal').hidden=true;document.body.style.overflow='';$('historySave').focus();
  }
  function render(){
    const scheme=$('historyPlan').value,month=$('historyMonth').value;
    const entry=entries().find(item=>item.month===month);
    const document=entry?.plans[scheme];
    current=document?{month,scheme,document}:null;
    documentTitle(current);
    window.document.body.classList.toggle('customer-mode',scheme!=='DB');
    $('historyPeriod').hidden=!current;
    $('historyPeriod').textContent=current?`적용기간 : ${document.start.replaceAll('-','.')} ~ ${document.end.replaceAll('-','.')}`:'';
    $('historyCount').textContent=document?.rows.length||0;
    $('historySave').disabled=!current;
    $('historyTable').hidden=!current;$('historyUnit').hidden=!current;$('historyNotes').hidden=!current;
    $('emptyState').hidden=!!current;
    $('emptyState').textContent=entries().length?'조회할 기준 월을 선택해주세요.':'보관된 과거 금리표가 없습니다.';
    $('historyHead').replaceChildren();$('rateTableBody').replaceChildren();
    if(!current){window.dispatchEvent(new Event('resize'));return;}
    const headers=['상품','제공기관','등급',...document.maturities.map(termLabel)];
    $('historyHead').innerHTML='<tr>'+headers.map((name,i)=>`<th scope="col" class="${i===0?'product-col':i===1?'sticky-col institution-col':i===2?'grade-col':'rate-head'}">${escape(name)}</th>`).join('')+'</tr>';
    $('rateTableBody').innerHTML=document.rows.map(row=>'<tr>'+[
      `<td class="product-col"><div class="product-name">${escape(row.product)}</div></td>`,
      `<td class="sticky-col institution institution-col">${escape(row.institution)}</td>`,
      `<td class="grade grade-col">${escape(row.grade||'—')}</td>`,
      ...row.cells.map(cell=>`<td class="rate${row.isGic?' gic':''}">${row.isGic?escape(cell).replace(/ (\([\d.]+\))$/,' <small>$1</small>'):escape(cell)}</td>`)
    ].join('')+'</tr>').join('');
    $('historyGicNote').hidden=!document.rows.some(row=>row.isGic);
    window.dispatchEvent(new Event('resize'));
  }
  function documentTitle(value){
    const title=value?`${monthLabel(value.month)} 원리금보장상품 공시금리 (${labels[value.scheme]})`:'과거 금리표';
    $('historyTitle').textContent=title;
    document.title=title+' · 퇴직연금 금리표';
  }
  function populate(preferred){
    const available=entries();
    $('historyMonth').replaceChildren(new Option(available.length?'기준 월 선택':'보관된 금리표 없음',''));
    for(const entry of available)$('historyMonth').add(new Option(monthLabel(entry.month),entry.month));
    $('historyMonth').disabled=!available.length;
    $('historyMonth').value=available.some(item=>item.month===preferred)?preferred:available[0]?.month||'';
    render();
  }
  function snapshot(){
    if(!current)throw Error('저장할 과거 금리표가 없습니다.');
    const {month,scheme,document}=current;
    return {scope:'all',title:`${monthLabel(month)} 원리금보장상품 공시금리 (${labels[scheme]})`,
      period:document.start+' ~ '+document.end,sortLabel:document.sortLabel,indices:document.maturities.map(term=>maturities.indexOf(term)),
      // Explicit public fields only; do not copy internal data even if mistakenly supplied.
      rows:document.rows.map(row=>({id:row.id,group:row.group,product:row.product,institution:row.institution,grade:row.grade||'—',isGic:row.isGic,cells:row.cells.slice()})),
      filename:`${month}_${labels[scheme]}_과거금리표_전체.png`};
  }
  async function open(){
    if(busy||!current)return;
    const data=snapshot(),token=++generation;busy=true;dispose();
    $('exportModal').hidden=false;document.body.style.overflow='hidden';$('exportClose').focus();
    $('exportSummary').textContent=`${monthLabel(current.month)} · ${labels[current.scheme]} · ${data.rows.length}개 상품`;
    $('exportDownload').disabled=true;$('exportShare').hidden=true;$('exportOpenImage').hidden=true;$('exportImage').hidden=true;
    zoom(false);$('exportStage').scrollTop=0;$('exportStage').scrollLeft=0;
    $('exportMessage').textContent='이미지를 만들고 있습니다…';
    try{
      await document.fonts?.ready;await window.RateExport.loadBrand();
      await new Promise(resolve=>requestAnimationFrame(resolve));if(token!==generation)return;
      const canvas=document.createElement('canvas');const dimensions=window.RateExport.draw(canvas,data);
      const blob=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(Error('이미지를 만들지 못했습니다. 다시 시도해주세요.')),'image/png'));
      canvas.width=1;canvas.height=1;if(token!==generation)return;
      const url=URL.createObjectURL(blob),file=typeof File==='function'?new File([blob],data.filename,{type:'image/png'}):null;
      result={url,file,filename:data.filename};$('exportImage').src=url;$('exportImage').alt=data.title;
      $('exportImage').style.setProperty('--document-width',dimensions.width+'px');$('exportImage').hidden=false;
      $('exportDownload').disabled=false;$('exportShare').disabled=false;$('exportShare').hidden=!(file&&navigator.canShare?.({files:[file]}));
      $('exportOpenImage').href=url;$('exportOpenImage').hidden=false;
      $('exportMessage').textContent='미리보기와 같은 PNG가 저장됩니다.';
    }catch(error){if(token===generation)$('exportMessage').textContent=error.message||'이미지를 만들지 못했습니다. 다시 시도해주세요.';}
    finally{if(token===generation)busy=false;}
  }
  function zoom(actual){
    $('exportStage').classList.toggle('actual-size',actual);
    $('exportFit').setAttribute('aria-pressed',String(!actual));$('exportActual').setAttribute('aria-pressed',String(actual));
  }
  $('historyMonth').addEventListener('change',render);
  $('historyPlan').addEventListener('change',()=>populate($('historyMonth').value));
  $('historySave').addEventListener('click',open);$('exportClose').addEventListener('click',close);
  $('exportFit').addEventListener('click',()=>zoom(false));$('exportActual').addEventListener('click',()=>zoom(true));
  $('exportModal').addEventListener('click',event=>{if(event.target===$('exportModal'))close();});
  $('exportDownload').addEventListener('click',()=>{
    if(!result||busy)return;
    const link=document.createElement('a');link.href=result.url;link.download=result.filename;document.body.append(link);link.click();link.remove();
    $('exportMessage').textContent='저장을 요청했습니다. 다운로드 목록을 확인하거나 이미지 열기에서 길게 눌러 저장해주세요.';
  });
  $('exportShare').addEventListener('click',async()=>{
    if(!result?.file||busy)return;
    const token=generation;busy=true;$('exportShare').disabled=true;$('exportDownload').disabled=true;
    try{await navigator.share({files:[result.file]});if(token===generation)$('exportMessage').textContent='공유 창에서 저장 또는 공유를 완료할 수 있습니다.';}
    catch(error){if(token===generation)$('exportMessage').textContent=error.name==='AbortError'?'공유를 취소했습니다.':'공유하지 못했습니다. PNG 저장 또는 이미지 열기를 이용해주세요.';}
    finally{if(token===generation){busy=false;$('exportShare').disabled=false;$('exportDownload').disabled=false;}}
  });
  document.addEventListener('keydown',event=>{
    if($('exportModal').hidden)return;
    if(event.key==='Escape'){event.preventDefault();close();}
    if(event.key==='Tab'){
      const items=[...$('exportModal').querySelectorAll('button:not(:disabled),a[href]')].filter(el=>el.getClientRects().length);
      const first=items[0],last=items.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    }
  });
  $('viewModeButton').addEventListener('click',()=>{
    const enabled=document.body.classList.toggle('desktop-view');
    $('viewModeButton').textContent=enabled?'모바일버전 보기':'PC버전 보기';$('viewModeButton').setAttribute('aria-pressed',String(enabled));
    window.dispatchEvent(new Event('resize'));
  });
  window.addEventListener('pagehide',()=>{generation++;dispose();});
  window.RateHistory={snapshot};
  populate(params.get('month'));
})();
