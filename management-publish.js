// Shared monthly data is public. Only the repository owner's signed-in issue can publish it.
(function(root){
 'use strict';
 const repository='kangdasom/kw.pension.consulting',site='https://kangdasom.github.io/kw.pension.consulting/';
 const path='management-shared.json',title='월별 한도관리 저장 요청',schema='monthly-management-v1';
 const clone=value=>JSON.parse(JSON.stringify(value));
 const monthValid=value=>typeof value==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(value);
 const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
 const bad=()=>{throw Error('월별 관리정보 형식이 올바르지 않습니다.');};
 function keyParts(key){
  let value;try{value=JSON.parse(key);}catch{bad();}
  if(!Array.isArray(value)||value.length!==2||typeof value[0]!=='string'||!value[0]||value[0].length>160||!['12','18','36','60','common'].includes(value[1])||JSON.stringify(value)!==key)bad();
  return value;
 }
 function records(value){
  if(!plain(value)||Object.keys(value).length>1000)bad();
  const result={};
  for(const [key,info] of Object.entries(value)){
   const [,term]=keyParts(key);
   if(!plain(info)||!Object.keys(info).length)bad();
   const clean={};
   for(const [field,text] of Object.entries(info)){
    if(!(term==='common'?['checkedAt','note']:['status','amount','reason','checkedAt','note']).includes(field)||typeof text!=='string')bad();
    if(field==='status'&&!['Y','N','확인'].includes(text))bad();
    if(field==='checkedAt'&&text!==''&&(!/^\d{4}-\d{2}-\d{2}$/.test(text)||Number.isNaN(Date.parse(text))||new Date(text).toISOString().slice(0,10)!==text))bad();
    if(text.length>(field==='note'?10000:100))bad();
    clean[field]=text;
   }
   result[key]=clean;
  }
  return result;
 }
 function validate(value){
  if(!plain(value)||value.schema!==schema||typeof value.revision!=='string'||!value.revision||value.revision.length>100||!plain(value.months)||Object.keys(value.months).length>240)bad();
  const months={};
  for(const [month,items] of Object.entries(value.months)){if(!monthValid(month))bad();months[month]=records(items);}
  return {schema,revision:value.revision,updatedAt:typeof value.updatedAt==='string'?value.updatedAt:null,months};
 }
 function delta(snapshot,baseline){
  validate(baseline);if(!monthValid(snapshot?.month))bad();
  const current=records(snapshot.records),previous=baseline.months[snapshot.month]||{},changes={};
  for(const [key,info] of Object.entries(current)){
   const fields={};for(const [field,value] of Object.entries(info))if(previous[key]?.[field]!==value)fields[field]=value;
   if(Object.keys(fields).length)changes[key]=fields;
  }
  return changes;
 }
 function restore(body){
  if(typeof body!=='string'||body.length>60000)throw Error('변경량이 많습니다. 변경 내용을 나누어 저장해주세요.');
  let value;try{value=JSON.parse(body);}catch{bad();}
  if(value.schema!=='monthly-management-request-v1'||!monthValid(value.month)||typeof value.baseRevision!=='string'||!value.baseRevision||value.baseRevision.length>100||typeof value.revision!=='string'||!/^[0-9a-f-]{36}$/.test(value.revision))bad();
  const changes=records(value.changes);if(!Object.keys(changes).length)throw Error('배포할 변경사항이 없습니다.');
  const payload={schema:value.schema,month:value.month,baseRevision:value.baseRevision,revision:value.revision,changes};
  body=JSON.stringify(payload);
  const url=new URL(`https://github.com/${repository}/issues/new`);url.searchParams.set('title',title);url.searchParams.set('body',body);
  const needsPaste=url.href.length>7500;if(needsPaste)url.searchParams.delete('body');
  return {...payload,body,url:url.href,needsPaste};
 }
 function prepare(snapshot,baseline){
  return restore(JSON.stringify({schema:'monthly-management-request-v1',month:snapshot.month,baseRevision:baseline.revision,revision:crypto.randomUUID(),changes:delta(snapshot,baseline)}));
 }
 function parseIssue(event,current,products){
  if(event.repository?.full_name!==repository||event.repository?.id!==1317770573||event.sender?.login!=='kangdasom'||event.sender?.id!==311216178||event.issue?.user?.login!=='kangdasom'||event.issue?.user?.id!==311216178||event.issue?.pull_request||event.issue?.title!==title||event.action!=='opened')throw Error('한도관리 게시 권한이 없는 요청입니다.');
  current=validate(current);const request=restore(event.issue.body);
  const catalog=new Map(products.map(row=>[row.id,row]));
  for(const key of Object.keys(request.changes)){
   const [id,term]=keyParts(key),row=catalog.get(id);
   if(!row||(term!=='common'&&!row.terms[term]))throw Error('현재 금리 원본에 없는 상품·만기입니다. 최신 금리표에서 확인해주세요.');
  }
  const previous=current.months[request.month]||{};
  if(current.revision===request.revision){
   for(const [key,fields] of Object.entries(request.changes))for(const [field,value] of Object.entries(fields))if(previous[key]?.[field]!==value)throw Error('게시 요청 번호가 중복되었습니다.');
   return current;
  }
  if(current.revision!==request.baseRevision)throw Error('다른 관리정보가 먼저 저장되었습니다. 최신 배포본을 불러와 다시 저장해주세요.');
  const months=clone(current.months),items=months[request.month] ||= {};
  for(const [key,fields] of Object.entries(request.changes))items[key]={...items[key],...fields};
  return validate({schema,revision:request.revision,updatedAt:new Date().toISOString(),months});
 }
 async function get(url){
  let response;try{response=await fetch(url,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(20000)});}catch{throw Error('공용 관리정보를 불러오지 못했습니다. 통신 상태를 확인해주세요.');}
  if(!response.ok)throw Error('공용 관리정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
  return response.json();
 }
 async function deployed(){return validate(await get(new URL(`${path}?t=${Date.now()}`,typeof location!=='undefined'&&location.protocol!=='file:'?location.href:site)));}
 async function latest(){
  const file=await get(`https://api.github.com/repos/${repository}/contents/${path}?ref=main&t=${Date.now()}`);
  return validate(JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(file.content.replace(/\s/g,'')),c=>c.charCodeAt(0)))));
 }
 const api={repository,site,path,title,validate,records,keyParts,delta,restore,prepare,parseIssue,deployed,latest};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.MonthlyManagementPublisher=api;
})(globalThis);
