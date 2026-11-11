/* XLSX upload validation and atomic browser-local rate snapshots. No management values are written here. */
(() => {
  'use strict';
  const key='db-rate-sources-v1';
  const clone=x=>JSON.parse(JSON.stringify(x));
  const types={'1001':['보험','GIC'],'3001':['예금','은행예금'],'3002':['예금','저축은행예금'],'7001':['파생결합사채','ELB'],'7003':['파생결합사채','DLB']};
  const normalize=x=>String(x??'').normalize('NFKC').replace(/\s+/g,'').toUpperCase();
  function date(value,date1904=false){
    let text=String(value??'').trim();
    if(/^\d+(\.\d+)?$/.test(text)&&Number(text)>10000&&Number(text)<100000){
      const epoch=date1904?Date.UTC(1904,0,1):Date.UTC(1899,11,30);
      text=new Date(epoch+Math.floor(Number(text))*86400000).toISOString().slice(0,10);
    }
    const m=text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    if(!m)return null;
    const result=`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
    const stamp=new Date(result+'T00:00:00Z');
    return Number.isFinite(+stamp)&&stamp.toISOString().slice(0,10)===result?result:null;
  }
  function previousMonth(month){const [y,m]=month.split('-').map(Number);return `${m===1?y-1:y}-${String(m===1?12:m-1).padStart(2,'0')}`;}
  function validSnapshot(s){
    return s&&date(s.start)===s.start&&date(s.end)===s.end&&s.start<=s.end&&s.month===s.start.slice(0,7)&&
      Array.isArray(s.products)&&s.products.length>0&&s.products.every(p=>typeof p.id==='string'&&typeof p.institutionCode==='string'&&typeof p.institution==='string'&&p.terms&&Object.values(p.terms).length&&Object.values(p.terms).every(t=>Number.isFinite(t.rate)&&t.rate>0));
  }
  function read(){const raw=localStorage.getItem(key);if(!raw)return {activeMonth:null,months:{}};const s=JSON.parse(raw);if(!s||!s.months||!Object.values(s.months).every(validSnapshot)||s.activeMonth&&!s.months[s.activeMonth])throw Error('저장된 금리 자료를 읽을 수 없습니다. 기존 저장정보를 확인해 주세요.');return s;}
  const bundled=clone(window.RATE_IMPORT);
  let storeWarning='';
  try{const s=read();if(s.activeMonth)window.RATE_IMPORT=clone(s.months[s.activeMonth]);}catch(e){storeWarning=e.message;}
  function sources(){const s=read();return {...{[bundled.month]:bundled},...s.months};}
  function commit(snapshot){
    if(!validSnapshot(snapshot))throw Error('반영 가능한 금리 자료가 없습니다. 검증을 다시 실행하세요.');
    const state=read();
    state.months[bundled.month] ||= clone(bundled);
    state.months[window.RATE_IMPORT.month]=clone(window.RATE_IMPORT);
    state.months[snapshot.month]=clone(snapshot);state.activeMonth=snapshot.month;
    // One setItem: quota/security failures leave the active data and all previous months intact.
    localStorage.setItem(key,JSON.stringify(state));
  }
  function periods(rows,date1904){
    const map=new Map();
    for(const {values:v} of rows){const a=date(v.B,date1904),b=date(v.C,date1904);if(a&&b&&a<=b){const k=a+'|'+b;map.set(k,(map.get(k)||0)+1);}}
    return [...map].sort((a,b)=>b[1]-a[1]).map(([key,count])=>({key,count,start:key.split('|')[0],end:key.split('|')[1]}));
  }
  function validate(rows,{source='',sheet='',date1904=false,period=null,history=sources()}={}){
    const choices=periods(rows,date1904);
    const result={fatal:[],issues:[],matching:[],comparisons:[],newProducts:[],missingProducts:[],choices,snapshot:null};
    if(!choices.length){result.fatal.push('유효한 적용기간을 찾을 수 없습니다. B·C열의 날짜 형식을 확인하세요.');return result;}
    const chosen=choices.find(p=>p.key===period)||choices[0];
    const known=new Map();
    for(const data of [bundled,...Object.values(history)])for(const p of data.products){const item=known.get(p.institutionCode)||{name:p.institution,names:new Set()};item.names.add(normalize(p.institution));known.set(p.institutionCode,item);}
    const products=new Map(),seen=new Map();let zero=0,unsupported=0,short=0;
    const issue=(row,message)=>result.issues.push({row,message});
    for(const {number:row,values:v,formulas=[]} of rows){
      if(String(v.J??'').trim()!==''&&Number(v.J)===0){zero++;continue;}
      const productCode=String(v.F??'').split(':')[0].trim();
      if(!types[productCode]){if(/^\d{4}:/.test(String(v.F??''))){unsupported++;continue;}issue(row,'상품 상세분류를 읽을 수 없어 제외했습니다.');continue;}
      const institution=String(v.D??'').trim().match(/^([A-Za-z0-9]{4}):\s*(.+)$/);
      if(!institution){result.matching.push({row,message:'기관코드:기관명 형식이 아니어서 매칭할 수 없습니다.'});continue;}
      const code=institution[1].toUpperCase(),name=institution[2].trim(),match=known.get(code);
      if(!match||!match.names.has(normalize(name))){result.matching.push({row,message:`${code} · ${name}: ${!match?'등록된 기관이 없어 제외했습니다.':`기관명이 등록 정보(${match.name})와 달라 제외했습니다.`}`});continue;}
      const start=date(v.B,date1904),end=date(v.C,date1904);
      if(start!==chosen.start||end!==chosen.end){issue(row,'선택한 적용기간과 다르거나 날짜가 잘못되어 제외했습니다.');continue;}
      if(formulas.some(c=>['B','C','D','F','H','I','J'].includes(c))){issue(row,'수식의 계산 결과를 사용합니다. 엑셀에서 재계산·저장된 값인지 확인하세요.');}
      const months=Number(v.H),rate=Number(v.J);
      if(!Number.isInteger(months)||months<=0||months>1200){issue(row,'계약기간이 올바른 개월 수가 아니어서 제외했습니다.');continue;}
      if(String(v.J??'').trim()===''||!Number.isFinite(rate)||rate<0){issue(row,'DB금리가 숫자가 아니거나 음수여서 제외했습니다.');continue;}
      const note=String(v.I??'').normalize('NFKC').trim();
      const id=`${code}|${productCode}|${note}`,termKey=id+'|'+months;
      if(seen.has(termKey)){issue(row,`상품·만기 중복으로 제외했습니다. ${seen.get(termKey)}행의 금리를 유지합니다.`);continue;}
      seen.set(termKey,row);
      const [category,label]=types[productCode];
      const p=products.get(id)||{id,institutionCode:code,institution:match.name,category,type:label+(note?' '+note:''),note,terms:{},grade:null,pension:null,lineup:null,proposals:{}};
      p.terms[months]={rate:Math.round(rate*1e10)/1e10,sourceRow:row};products.set(id,p);
      if(months>=3&&months<=9)short++;
    }
    const list=[...products.values()],month=chosen.start.slice(0,7),same=history[month],previous=history[previousMonth(month)];
    const baseline=same||previous||window.RATE_IMPORT;
    const oldIds=new Set(baseline.products.map(p=>p.id));
    result.newProducts=list.filter(p=>!oldIds.has(p.id));
    result.missingProducts=baseline.products.filter(p=>!products.has(p.id));
    const groups=new Map();
    // A common average includes all valid products of the same group/maturity.
    // Reference data stays separate from the source snapshot and management state.
    const peerGroup=p=>p.category==='파생결합사채'?'ELB/DLB':p.category==='보험'?'GIC':'예금';
    for(const p of list)for(const [term,t] of Object.entries(p.terms)){
      const group=peerGroup(p),key=group+'|'+term,g=groups.get(key)||{group,term:Number(term),rows:[]};
      g.rows.push({id:p.id,institution:p.institution,type:p.type,rate:t.rate,sourceRow:t.sourceRow});groups.set(key,g);
    }
    result.comparisons=[...groups.values()].map(g=>{
      const average=g.rows.reduce((sum,r)=>sum+r.rate,0)/g.rows.length;
      g.rows.sort((a,b)=>b.rate-a.rate||a.institution.localeCompare(b.institution,'ko')||a.type.localeCompare(b.type,'ko',{numeric:true})||a.id.localeCompare(b.id));
      let rank=0;
      return {...g,average,rows:g.rows.map((r,i)=>{if(!i||r.rate!==g.rows[i-1].rate)rank=i+1;return {...r,rank,spreadBp:(r.rate-average)*100};})};
    });
    if(!list.length){result.fatal.push('반영 가능한 금리가 없습니다. 기관 매칭과 데이터 내용을 수정해 주세요.');return result;}
    result.snapshot={source,sheet,start:chosen.start,end:chosen.end,month,totalRows:rows.length,zeroExcluded:zero,unsupportedExcluded:unsupported,shortHidden:short,acceptedTerms:seen.size,products:list,uploadedAt:new Date().toISOString()};
    return result;
  }
  window.RateUpload={date,previousMonth,validSnapshot,read,sources,commit,periods,validate,storeWarning};
})();
