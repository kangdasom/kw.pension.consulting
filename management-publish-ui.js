(() => {
 'use strict';
 const api=window.MonthlyManagementPublisher,manager=window.RateManagement;
 if(!api||!manager)return;
 const panel=document.getElementById('panel-monthly');
 if(!panel){
  let loading=false;
  const refresh=async()=>{if(loading)return;loading=true;try{manager.receiveShared(await api.deployed());}catch{}finally{loading=false;}};
  window.addEventListener('focus',refresh);refresh();return;
 }
 const $=id=>document.getElementById(id),key='db-rate-monthly-publish-v1';
 $('monthlyMessage').insertAdjacentHTML('afterend',`<div class="monthly-publish-tools"><button type="button" id="monthlyLatest">최신 배포본 불러오기</button><a href="https://github.com/${api.repository}/actions/workflows/publish-management.yml" target="_blank" rel="noopener noreferrer">저장 처리 내역</a><a href="https://github.com/${api.repository}/actions/workflows/deploy-pages.yml" target="_blank" rel="noopener noreferrer">배포 내역</a></div><div id="monthlyRequest" class="monthly-request" hidden><p id="monthlyRequestHelp"></p><textarea id="monthlyRequestBody" rows="4" readonly aria-label="한도관리 게시 요청 복사용" hidden></textarea><div><button type="button" id="monthlyCopy" hidden>게시 요청 복사</button><a id="monthlySubmit" target="_blank" rel="noopener noreferrer">GitHub 저장 요청 열기</a><button type="button" id="monthlyStop">배포 확인 중단</button></div></div>`);
 let baseline=null,pending=null,busy=false,conflicted=false,timer=null,sequence=0,attempts=0,locked=[];
 try{const stored=JSON.parse(sessionStorage.getItem(key)||'null');if(stored?.body){pending={...api.restore(stored.body),saved:stored.saved===true};manager.restoreMonthly(pending);}}catch{}
 const message=text=>{$('monthlyMessage').textContent=text;};
 function keep(){try{if(pending)sessionStorage.setItem(key,JSON.stringify({body:pending.body,saved:pending.saved===true}));else sessionStorage.removeItem(key);}catch{}}
 function lock(value){
  if(value&&!locked.length){
   const areas=['#manageRows','#termDetails','.management-bulk','.management-filters'];
   for(const selector of areas){const node=panel.querySelector(selector);if(node){locked.push([node,node.inert]);node.inert=true;}}
   for(const id of ['manageImport','saveMonthly','cancelMonthly']){const node=$(id);locked.push([node,node.disabled]);node.disabled=true;}
  }else if(!value&&locked.length){
   for(const [node,previous] of locked)if('inert' in node && !['BUTTON','INPUT','SELECT'].includes(node.tagName))node.inert=previous;else node.disabled=previous;
   locked=[];
  }
 }
 function update(){
  lock(busy||Boolean(pending));
  if(!busy&&!pending)$('cancelMonthly').disabled=!manager.monthlyHasUnsaved();
  $('saveMonthly').disabled=busy||Boolean(pending)||!baseline||conflicted;
  $('monthlyLatest').disabled=busy||Boolean(pending);
  $('monthlyRequest').hidden=!pending;
  if(pending){
   $('monthlySubmit').href=pending.url;
   $('monthlyRequestBody').value=pending.body;
   $('monthlySubmit').hidden=pending.saved===true;
   $('monthlyCopy').hidden=pending.saved||!pending.needsPaste;$('monthlyRequestBody').hidden=pending.saved||!pending.needsPaste;
   $('monthlyRequestHelp').textContent=pending.month+' · '+(pending.saved?'GitHub 저장 완료 · 사이트 배포를 확인하고 있습니다.':pending.needsPaste?'변경 내용이 깁니다. 게시 요청을 복사하고 GitHub 본문에 붙여넣어 제출해주세요.':'GitHub에서 kangdasom 계정으로 로그인한 뒤 제목·본문을 그대로 제출해주세요. 제출하면 자동 배포됩니다.');
  }
 }
 async function checkDeployment(){
  clearTimeout(timer);if(!pending)return;
  const target=pending,id=++sequence;
  try{
   const deployed=await api.deployed();
   if(id!==sequence||pending!==target)return;
   if(api.matches(target,deployed)){
    baseline=deployed;manager.receiveShared(deployed,target.month);pending=null;conflicted=false;keep();
    message('사이트 배포가 완료되었습니다. 다른 기기에서도 같은 제안가능·한도·확인일·비고가 적용됩니다.');update();return;
   }
   if(!target.saved){
    const latest=await api.latest();
    if(id!==sequence||pending!==target)return;
    if(api.matches(target,latest)){
     target.saved=true;keep();update();
     message('GitHub 저장이 완료되었습니다. 사이트 배포를 확인하고 있습니다. 배포 완료까지 잠시 기다려주세요.');
    }
   }
  }catch{}
  if(id!==sequence||pending!==target)return;
  if(++attempts>=120){message('아직 배포 완료를 확인하지 못했습니다. GitHub 제출 여부와 저장·배포 내역을 확인해주세요. 입력 내용은 유지됩니다.');return;}
  timer=setTimeout(checkDeployment,5000);
 }
 async function refresh(discard=false){
  if(busy||pending)return;
  busy=true;update();
  try{
   const deployed=await api.deployed();
   const result=manager.receiveShared(deployed,discard?manager.monthlySnapshot().month:null);
   baseline=deployed;conflicted=result.conflicted;
   message(conflicted?'편집 중 같은 항목의 배포본이 변경되었습니다. 입력 내용은 유지됩니다. 최신 배포본을 불러온 뒤 다시 입력해주세요.':discard?'최신 사이트 배포본을 불러왔습니다.':'');
  }catch(error){message(error.message+' 입력 내용은 유지됩니다. 최신 배포본 불러오기를 눌러 재시도해주세요.');}
  finally{busy=false;update();}
 }
 async function save(){
  if(busy||pending||!baseline||conflicted)return;
  if(location.origin!==new URL(api.site).origin||!location.pathname.startsWith('/kw.pension.consulting/')){message('사이트 공용 저장은 공식 HTTPS 관리자페이지에서 사용해주세요: '+api.site+'admin.html');return;}
  const snapshot=manager.monthlySnapshot();
  let request;try{request=api.prepare(snapshot,baseline);}catch(error){message(error.message);return;}
  busy=true;update();
  try{
   const latest=await api.latest();
   const merged=api.rebase(snapshot,baseline,latest);
   if(merged.conflicts.length)throw Error('편집 중 같은 항목에 다른 값이 먼저 저장되었습니다. 입력 내용은 유지됩니다. 최신 배포본과 비교한 뒤 다시 저장해주세요.');
   pending=Object.keys(merged.records).length?api.prepare(merged,latest):{...request,saved:true};attempts=0;keep();
   message(pending.saved?'같은 내용이 이미 GitHub에 저장되어 있습니다. 중복 요청 없이 사이트 반영을 확인합니다.':'GitHub 저장 요청을 준비했습니다. 열린 화면에서 제출하면 사이트에 자동 배포됩니다. 아직 배포 전입니다.');
  }catch(error){message(error.message);}
  finally{busy=false;update();}
  if(pending){if(!pending.saved&&!pending.needsPaste)$('monthlySubmit').click();checkDeployment();}
 }
 $('monthlyLatest').onclick=()=>{
  if(manager.monthlyHasUnsaved()&&!confirm('현재 월의 미저장 편집을 취소하고 최신 사이트 배포본을 불러올까요?'))return;
  refresh(true);
 };
 $('monthlyCopy').onclick=async()=>{
  if(!pending)return;
  try{await navigator.clipboard.writeText(pending.body);message('복사했습니다. GitHub 저장 요청 본문에 붙여넣고 제출해주세요.');}
  catch{$('monthlyRequestBody').focus();$('monthlyRequestBody').select();message('자동 복사가 제한되었습니다. 선택한 내용을 직접 복사해주세요.');}
 };
 $('monthlyStop').onclick=()=>{
  clearTimeout(timer);++sequence;pending=null;keep();update();message('배포 확인을 중단했습니다. 이미 GitHub에 제출한 요청은 계속 처리됩니다. 입력 내용은 유지됩니다.');
 };
 window.addEventListener('focus',()=>{if(pending){attempts=0;checkDeployment();}else if(!manager.monthlyHasUnsaved())refresh();});
 window.addEventListener('pagehide',()=>{keep();clearTimeout(timer);++sequence;});
 window.addEventListener('pageshow',()=>{if(pending)checkDeployment();});
 window.RateMonthlyPublishing={save,hasPending:()=>Boolean(pending)};
 update();
 if(pending){message('이 탭의 GitHub 저장 요청을 복원했습니다. 배포 완료를 확인하고 있습니다.');checkDeployment();}else refresh();
})();
