/* Read OOXML values only. Workbook text, formulas, macros and links are never executed. */
(() => {
  'use strict';
  const limit=64*1024*1024;
  const xml=text=>{const d=new DOMParser().parseFromString(text,'application/xml');if(d.getElementsByTagName('parsererror').length)throw Error('엑셀 내부 XML 형식이 손상되었습니다.');return d;};
  const nodes=(d,name)=>[...d.getElementsByTagNameNS('*',name)];
  async function open(file){
    if(!/\.xlsx$/i.test(file.name))throw Error('XLSX 파일을 선택하세요. XLS·CSV·암호화된 파일은 지원하지 않습니다.');
    if(file.size>20*1024*1024)throw Error('파일은 20MB 이하로 선택하세요.');
    const bytes=new Uint8Array(await file.arrayBuffer()),view=new DataView(bytes.buffer);
    let end=-1;
    for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(view.getUint32(i,true)===0x06054b50&&i+22+view.getUint16(i+20,true)===bytes.length){end=i;break;}
    if(end<0)throw Error('읽을 수 없는 XLSX입니다. 암호를 해제하거나 엑셀에서 다시 저장하세요.');
    const entries=new Map(),count=view.getUint16(end+10,true);let pos=view.getUint32(end+16,true),total=0;
    for(let i=0;i<count;i++){
      if(pos+46>bytes.length||view.getUint32(pos,true)!==0x02014b50)throw Error('엑셀 압축 구조가 손상되었습니다.');
      const size=view.getUint32(pos+24,true),compressed=view.getUint32(pos+20,true),length=view.getUint16(pos+28,true);
      const name=new TextDecoder().decode(bytes.subarray(pos+46,pos+46+length));
      total+=size;if(total>limit)throw Error('압축 해제할 데이터가 너무 큽니다. 파일 범위를 줄여 주세요.');
      entries.set(name,{size,compressed,method:view.getUint16(pos+10,true),flags:view.getUint16(pos+8,true),offset:view.getUint32(pos+42,true),crc:view.getUint32(pos+16,true)});
      pos+=46+length+view.getUint16(pos+30,true)+view.getUint16(pos+32,true);
    }
    const cache=new Map();
    async function read(name){
      if(cache.has(name))return cache.get(name);
      const e=entries.get(name);if(!e)throw Error('필수 엑셀 구성요소가 없습니다: '+name);
      if(e.flags&1)throw Error('암호화된 엑셀은 지원하지 않습니다.');
      const o=e.offset;if(o+30>bytes.length||view.getUint32(o,true)!==0x04034b50)throw Error('엑셀 압축 데이터가 손상되었습니다.');
      const start=o+30+view.getUint16(o+26,true)+view.getUint16(o+28,true);
      if(start+e.compressed>bytes.length)throw Error('엑셀 파일이 잘렸습니다.');
      let data=bytes.subarray(start,start+e.compressed);
      if(e.method===8){
        if(typeof DecompressionStream==='undefined')throw Error('이 브라우저는 XLSX 읽기를 지원하지 않습니다. 최신 Edge·Chrome·Safari를 사용하세요.');
        const reader=new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
        const parts=[];let length=0;
        while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>e.size||length>limit){await reader.cancel();throw Error('엑셀 압축 크기가 올바르지 않습니다.');}parts.push(value);}
        data=new Uint8Array(length);let at=0;for(const p of parts){data.set(p,at);at+=p.length;}
      }else if(e.method!==0)throw Error('지원하지 않는 엑셀 압축 형식입니다.');
      if(data.length!==e.size)throw Error('엑셀 데이터 크기가 올바르지 않습니다.');
      let crc=0xffffffff;for(const b of data){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}if((~crc>>>0)!==e.crc)throw Error('엑셀 데이터가 손상되었습니다. 다시 저장한 파일을 선택하세요.');
      const doc=xml(new TextDecoder().decode(data));cache.set(name,doc);return doc;
    }
    const workbook=await read('xl/workbook.xml'),rels=nodes(await read('xl/_rels/workbook.xml.rels'),'Relationship');
    const sheets=nodes(workbook,'sheet').filter(s=>s.getAttribute('state')!=='veryHidden').map(s=>{
      const id=s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id');
      const rel=rels.find(r=>r.getAttribute('Id')===id);
      if(!rel||rel.getAttribute('TargetMode')==='External')throw Error('외부 시트는 읽을 수 없습니다.');
      const parts=[];for(const p of (rel.getAttribute('Target').startsWith('/')?rel.getAttribute('Target').slice(1):'xl/'+rel.getAttribute('Target')).split('/')){if(p==='..')parts.pop();else if(p!=='.')parts.push(p);}
      return {name:s.getAttribute('name'),path:parts.join('/')};
    });
    if(!sheets.length)throw Error('읽을 수 있는 시트가 없습니다.');
    const strings=entries.has('xl/sharedStrings.xml')?nodes(await read('xl/sharedStrings.xml'),'si').map(si=>nodes(si,'t').map(t=>t.textContent).join('')):[];
    const date1904=['1','true'].includes(nodes(workbook,'workbookPr')[0]?.getAttribute('date1904'));
    async function rows(index){
      const sheet=sheets[index];if(!sheet)throw Error('시트를 선택하세요.');
      const doc=await read(sheet.path),all=nodes(doc,'row');
      if(all.length>30000)throw Error('한 시트는 30,000행 이하로 선택하세요.');
      const parsed=all.map(r=>{
        const values={},formulas=[];
        for(const c of nodes(r,'c')){
          const col=(c.getAttribute('r')||'').replace(/\d/g,'');
          if(!/^[A-J]$/.test(col))continue;
          const type=c.getAttribute('t'),v=nodes(c,'v')[0]?.textContent??'';
          values[col]=type==='s'?(strings[Number(v)]??''):type==='inlineStr'?nodes(c,'t').map(t=>t.textContent).join(''):v;
          if(nodes(c,'f').length)formulas.push(col);
        }
        return {number:Number(r.getAttribute('r')),values,formulas};
      }).filter(r=>Object.values(r.values).some(v=>String(v).trim()));
      const header=parsed[0]?.values||{},norm=v=>String(v??'').replace(/\s+/g,'');
      const expected={B:/적용.*(시작|개시)|FROM/i,C:/적용.*(종료|만료)|TO/i,D:/제공기관|금융기관|기관명/,F:/상품.*(상세|중).*분류|상품.*구분/,H:/기간|개월|만기/,J:/^DB(?:금리)?$/i};
      const missing=Object.entries(expected).filter(([col,re])=>!re.test(norm(header[col]))).map(([col])=>col);
      if(missing.length)throw Error(`필수 열 형식이 다릅니다(${missing.join('·')}열). 당사 업로드 양식의 첫 행과 B·C·D·F·H·J열을 확인하세요.`);
      return parsed.slice(1);
    }
    return {sheets,date1904,rows};
  }
  window.RateXlsx={open};
})();
