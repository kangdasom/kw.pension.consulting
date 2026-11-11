/* Public export snapshot and document renderer. No internal notes are copied. */
(() => {
  const names=['1년','1.5년','3년','5년'];
  const label=value=>value==='all'?'전체':value;
  function snapshot(scope, now=new Date()) {
    const all=scope==='all';
    const ranking=!all&&window.SalesRanking?.active()?window.SalesRanking.current():null;
    const indices=all?[0,1,2,3]:ranking?ranking.indices:selectedMaturities();
    const source=all ? rates.filter(row=>maturities.some(term=>row.terms[term])).slice().sort(defaultOrder) : ranking?ranking.rows:filteredRows();
    if(!indices.length || !source.length) throw Error('저장할 상품이 없습니다. 조회 조건과 만기를 확인해 주세요.');
    const sort=els.sortFilter.value;
    const sortLabel=ranking?ranking.sortLabel:all || sort==='default' ? '상품군별 기본순' :
      sort==='rating' ? '신용등급 높은 순' : `${names[Number(document.getElementById('maturitySort').value)]} 금리 높은 순`;
    const condition=ranking?ranking.condition:all ? '전체 대상 상품 · 필터 미적용 · 1·1.5·3·5년' :
      `만기 ${indices.map(i=>names[i]).join('·')} / 등급 ${els.ratingFilter.value==='all'?'전체':els.ratingFilter.value+' 이상'} / 상품군 ${checked().join('·')} / 사업자 ${label(els.pensionFilter.value)} / 라인업 ${label(els.lineupFilter.value)} / 제안가능 ${label(els.proposalFilter.value)}`;
    const rows=source.map(row=>{
      const states=indices.filter(i=>row.terms[maturities[i]]).map(i=>row.proposals[maturities[i]]);
      const status=!states.length || states.some(s=>s!=='Y'&&s!=='N')?'확인':states.every(s=>s==='Y')?'Y':states.every(s=>s==='N')?'N':'일부';
      return {id:row.id,group:groupRank(row),status,product:row.type,institution:row.institution,grade:row.grade||'—',
        cells:indices.map(i=>{
          const value=row.terms[maturities[i]]?.rate;
          return value===undefined?'—':row.category==='보험'?`${value.toFixed(2)} (${effectiveRate(row,i).toFixed(2)})`:value.toFixed(2);
        })};
    });
    const created=now.toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false});
    return {scope:all?'all':'current',title:`${monthLabel} 원리금보장상품 금리`,period:`${importData.start} ~ ${importData.end}`,
      condition,sortLabel,created,indices:indices.slice(),rows,
      filename:`${importData.month.replace('-','년')}월_금리표_${all?'전체':'현재조회'}.png`};
  }
  function wrap(ctx,text,width) {
    const lines=[];let line='';
    for(const char of String(text)){
      if(char==='\n'){lines.push(line);line='';continue;}
      if(line && ctx.measureText(line+char).width>width){lines.push(line);line=char;}else line+=char;
    }
    if(line || !lines.length) lines.push(line);
    return lines;
  }
  function draw(canvas,data) {
    const ctx=canvas.getContext('2d');
    if(!ctx)throw Error('이 브라우저에서는 이미지를 만들 수 없습니다. 다른 브라우저에서 다시 시도해 주세요.');
    const pad=28,base=[126,182,64];
    const width=Math.max(760,pad*2+base.reduce((a,b)=>a+b,0)+112*data.indices.length);
    const rateWidth=(width-pad*2-base.reduce((a,b)=>a+b,0))/data.indices.length;
    const widths=[...base,...data.indices.map(()=>rateWidth)];
    const font=(size,bold=false)=>`${bold?'600':'400'} ${size}px "Pretendard", Arial, "Malgun Gothic", sans-serif`;
    ctx.font=font(14);
    const meta=[`· 적용기간 : ${data.period.replaceAll('-','.')}`, `· 정렬기준 : ${data.sortLabel}`]
      .flatMap(text=>wrap(ctx,text,width-pad*2));
    const headHeight=38;
    ctx.font=font(15);
    const body=data.rows.map(row=>{
      const values=[row.product,row.institution,row.grade,...row.cells];
      const lines=values.map((value,i)=>{ctx.font=font(i>=3?17.25:15);return wrap(ctx,value,widths[i]-12);});
      return {row,lines,height:Math.max(42,...lines.map(part=>part.length*21+14))};
    });
    const notes=[
      '* GIC 금리는 공시금리 (단리연환산금리) 입니다.',
      '* 상품 매수 전 매수가능여부를 확인해주세요.'
    ];
    ctx.font=font(13);
    const foot=notes.flatMap(text=>wrap(ctx,text,width-pad*2));
    const tableTop=88+meta.length*22+18;
    const tableBottom=tableTop+headHeight+body.reduce((sum,r)=>sum+r.height,0);
    const noteTop=tableBottom+26;
    const height=noteTop+(foot.length-1)*21+pad;
    const scale=Math.min(1.5,Math.sqrt(12000000/(width*height)),8192/height,4096/width);
    if(scale<1)throw Error('한 장에 저장하기에는 상품이 너무 많습니다. 조회 범위를 줄여 다시 시도해 주세요.');
    canvas.width=Math.ceil(width*scale);canvas.height=Math.ceil(height*scale);
    // Resizing resets context; all drawing uses the same logical document size.
    ctx.scale(scale,scale);ctx.fillStyle='#FFFFFF';ctx.fillRect(0,0,width,height);
    ctx.textBaseline='middle';ctx.textAlign='left';ctx.fillStyle='#202052';ctx.font=font(25,true);
    ctx.fillText(data.title,pad,38);
    ctx.fillStyle='#ED2F7B';ctx.fillRect(pad,63,width-pad*2,3);
    ctx.fillStyle='#696979';ctx.font=font(14);
    meta.forEach((text,i)=>ctx.fillText(text,pad,88+i*22));
    ctx.textAlign='right';ctx.font=font(11);
    ctx.fillText('(연, %)',width-pad,tableTop-12);
    const heads=['상품','제공기관','등급',...data.indices.map(i=>names[i])];
    ctx.fillStyle='#202052';ctx.fillRect(pad,tableTop,width-pad*2,headHeight);
    let x=pad;ctx.font=font(14,true);ctx.fillStyle='#FFFFFF';ctx.textAlign='center';
    heads.forEach((text,i)=>{ctx.fillText(text,x+widths[i]/2,tableTop+headHeight/2);x+=widths[i];});
    let y=tableTop+headHeight;
    body.forEach(({row,lines,height:rh},index)=>{
      ctx.fillStyle=index%2?'#F7F7FA':'#FFFFFF';ctx.fillRect(pad,y,width-pad*2,rh);
      if(data.scope==='all' && (index===0||body[index-1].row.group!==row.group)){
        ctx.fillStyle='#ED2F7B';ctx.fillRect(pad,y,width-pad*2,2);
      }
      x=pad;ctx.font=font(15);
      lines.forEach((part,i)=>{
        ctx.font=font(i>=3?17.25:15);
        ctx.fillStyle='#252541';
        part.forEach((text,j)=>ctx.fillText(text,x+widths[i]/2,y+(rh-(part.length-1)*21)/2+j*21));x+=widths[i];
      });
      ctx.fillStyle='#E5E4EC';ctx.fillRect(pad,y+rh-1,width-pad*2,1);y+=rh;
    });
    ctx.textAlign='left';ctx.font=font(13);ctx.fillStyle='#696979';
    foot.forEach((text,i)=>ctx.fillText(text,pad,noteTop+i*21));
    return {width,height,pixelWidth:canvas.width,pixelHeight:canvas.height};
  }
  window.RateExport={snapshot,draw};
})();
