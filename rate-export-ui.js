(() => {
  const $=id=>document.getElementById(id);
  const modal=$('exportModal'),image=$('exportImage'),stage=$('exportStage');
  let generation=0,result=null,busy=false,lastFocus=null;
  const memoToggle=$('exportMemoEnabled'),memoInput=$('exportMemo');
  const selectedScope=()=>document.querySelector('.save-option.selected')?.dataset.saveScope||'current';
  function updateMemo(){
    const current=selectedScope()==='current',enabled=current&&memoToggle.checked;
    $('exportMemoOption').hidden=!current;memoToggle.disabled=!current;
    $('exportMemoFields').hidden=!enabled;$('exportMemoHint').hidden=enabled;
    memoToggle.setAttribute('aria-expanded',String(enabled));memoInput.disabled=!enabled;
    $('exportMemoCount').textContent=`${Array.from(memoInput.value).length} / 100자`;
  }
  function limitMemo(){
    const limited=Array.from(memoInput.value.replace(/\r\n?/g,'\n')).slice(0,100).join('');
    if(memoInput.value!==limited)memoInput.value=limited;
    updateMemo();
  }
  memoToggle.addEventListener('change',()=>{updateMemo();if(memoToggle.checked)memoInput.focus();});
  memoInput.addEventListener('input',event=>{if(!event.isComposing)limitMemo();});
  memoInput.addEventListener('compositionend',limitMemo);
  function message(text){$('exportMessage').textContent=text;}
  function dispose(){
    if(result) URL.revokeObjectURL(result.url);
    result=null;image.removeAttribute('src');
  }
  function exit(back=false){
    generation++;dispose();busy=false;modal.hidden=true;
    document.body.style.overflow=back?'hidden':'';
    if(back){els.saveModal.hidden=false;els.previewButton.focus();}
    else (lastFocus||els.saveButton).focus();
  }
  function zoom(actual){
    stage.classList.toggle('actual-size',actual);
    $('exportFit').setAttribute('aria-pressed',String(!actual));
    $('exportActual').setAttribute('aria-pressed',String(actual));
  }
  async function open(){
    if(busy)return;
    $('saveMessage').textContent='';
    const scope=selectedScope();
    let data;
    try{data=window.RateExport.snapshot(scope,undefined,scope==='current'&&memoToggle.checked?memoInput.value:'');}catch(error){$('saveMessage').textContent=error.message;return;}
    lastFocus=els.saveButton;dispose();const token=++generation;busy=true;
    els.saveModal.hidden=true;modal.hidden=false;document.body.style.overflow='hidden';
    $('exportSummary').textContent=`${scope==='all'?'전체 금리표':'현재 조회 결과'} · ${data.rows.length}개 상품`;
    $('exportDownload').disabled=true;$('exportShare').disabled=false;$('exportShare').hidden=true;$('exportOpenImage').hidden=true;
    image.hidden=true;zoom(false);stage.scrollTop=0;stage.scrollLeft=0;
    message('이미지를 만들고 있습니다…');$('exportClose').focus();
    try{
      await document.fonts?.ready;
      if(window.RateExport.loadBrand)await window.RateExport.loadBrand();
      // Let the loading state paint before drawing a long table.
      await new Promise(resolve=>window.requestAnimationFrame(resolve));
      if(token!==generation)return;
      const canvas=document.createElement('canvas');
      const dimensions=window.RateExport.draw(canvas,data);
      const blob=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(Error('이미지 생성에 실패했습니다. 다시 시도해 주세요.')),'image/png'));
      canvas.width=1;canvas.height=1;
      if(token!==generation)return;
      const url=URL.createObjectURL(blob);
      const file=typeof File==='function'?new File([blob],data.filename,{type:'image/png'}):null;
      result={url,blob,file,filename:data.filename};
      image.src=url;image.style.setProperty('--document-width',dimensions.width+'px');image.hidden=false;
      image.alt=`${data.title}, ${data.rows.length}개 상품, ${data.scope==='all'?'전체 금리표':'현재 조회 결과'}`;
      $('exportDownload').disabled=false;
      const share=!!file && !!navigator.canShare && navigator.canShare({files:[file]});
      $('exportShare').hidden=!share;
      $('exportOpenImage').href=url;$('exportOpenImage').hidden=false;
      message('미리보기와 같은 PNG가 저장됩니다. 확대해서 금리를 확인하세요.');
    }catch(error){if(token===generation)message(error.message||'이미지를 만들지 못했습니다. 뒤로 이동해 다시 시도해 주세요.');}
    finally{if(token===generation)busy=false;}
  }
  $('exportClose').addEventListener('click',()=>exit());
  $('exportBack').addEventListener('click',()=>exit(true));
  $('exportFit').addEventListener('click',()=>zoom(false));
  $('exportActual').addEventListener('click',()=>zoom(true));
  $('exportDownload').addEventListener('click',()=>{
    if(!result||busy)return;
    const a=document.createElement('a');a.href=result.url;a.download=result.filename;
    document.body.append(a);a.click();a.remove();
    message('저장을 요청했습니다. 다운로드 목록을 확인하세요. 저장되지 않으면 이미지 열기에서 길게 눌러 저장할 수 있습니다.');
  });
  $('exportShare').addEventListener('click',async()=>{
    if(!result?.file||busy)return;
    busy=true;$('exportShare').disabled=true;$('exportDownload').disabled=true;
    const token=generation;
    try{await navigator.share({files:[result.file]});if(token===generation)message('공유 창에서 저장 또는 공유를 완료할 수 있습니다.');}
    catch(error){if(token===generation)message(error.name==='AbortError'?'공유를 취소했습니다. 다시 저장하거나 공유할 수 있습니다.':'공유하지 못했습니다. PNG 저장 또는 이미지 열기를 이용해 주세요.');}
    finally{if(token===generation){busy=false;$('exportShare').disabled=false;$('exportDownload').disabled=false;}}
  });
  modal.addEventListener('click',event=>{if(event.target===modal)exit();});
  document.addEventListener('keydown',event=>{
    if(modal.hidden)return;
    if(event.key==='Escape'){event.preventDefault();exit();}
    if(event.key==='Tab'){
      const focusable=[...modal.querySelectorAll('button:not(:disabled),a[href]')].filter(el=>!el.hidden);
      const first=focusable[0],last=focusable[focusable.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    }
  });
  window.addEventListener('pagehide',()=>{
    generation++;dispose();busy=false;modal.hidden=true;document.body.style.overflow='';
  });
  // Preserve the existing range-selection behavior and expose its state accessibly.
  document.querySelectorAll('.save-option').forEach(option=>{
    option.setAttribute('aria-pressed',String(option.classList.contains('selected')));
    option.addEventListener('click',()=>{
      $('saveMessage').textContent='';
      document.querySelectorAll('.save-option').forEach(item=>item.setAttribute('aria-pressed',String(item===option)));
      updateMemo();
    });
  });
  els.saveButton.addEventListener('click',()=>{$('saveMessage').textContent='';memoToggle.checked=false;memoInput.value='';updateMemo();});
  updateMemo();
  window.RateExportUI={open};
})();
