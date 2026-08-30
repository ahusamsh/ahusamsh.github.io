const state={data:null,filter:'all',deferredInstall:null};

const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];

const PRIORITY_ORDER={Critical:0,High:1,Medium:2,Low:3};
const priorityAr={Critical:'حرج',High:'مرتفع',Medium:'متوسط',Low:'منخفض'};
const statusAr={Open:'مفتوح',Waiting:'بانتظار',Done:'مكتمل',Active:'نشط'};
const projectArFallback={
  'Bitumen':'البيتومين','Sulfur':'الكبريت','Electric Buses':'الحافلات الكهربائية',
  'Solar Irrigation':'الري الشمسي','Soda Ash':'كربونات الصوديوم','Dates Export':'التمور'
};

function b64ToBytes(s){return Uint8Array.from(atob(s),c=>c.charCodeAt(0))}
async function deriveKey(pass,salt,iterations){
  const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(pass),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['decrypt']);
}
async function decryptSnapshot(pass){
  const enc=await fetch('./data/snapshot.enc.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('snapshot');return r.json()});
  const key=await deriveKey(pass,b64ToBytes(enc.salt),enc.iterations);
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:b64ToBytes(enc.iv)},key,b64ToBytes(enc.ciphertext));
  return JSON.parse(new TextDecoder().decode(plain));
}

async function liveFetch(){
  const url=localStorage.getItem('ihq_api_url')||state.data?.liveApi?.url;
  const token=localStorage.getItem('ihq_api_token')||state.data?.liveApi?.token;
  if(!url||!token) return null;
  const u=new URL(url);u.searchParams.set('token',token);u.searchParams.set('_',Date.now());
  const res=await fetch(u.toString(),{cache:'no-store',redirect:'follow'});
  if(!res.ok) throw new Error(`API ${res.status}`);
  const data=await res.json();
  if(!data||data.ok===false||!Array.isArray(data.projects)) throw new Error(data?.error||'Invalid API response');
  return data;
}

function normalize(data){
  data.projects=(data.projects||[]).map(p=>({
    ...p,
    nameAr:p.nameAr||projectArFallback[p.name]||p.projectAr||p.name,
    status:p.status||'Active',priority:p.priority||'Medium',
    nextAction:p.nextAction||'',deadline:p.deadline||'',lastUpdate:p.lastUpdate||''
  }));
  data.actions=data.actions||[];data.communications=data.communications||[];data.money=data.money||[];
  return data;
}

function daysUntil(dateStr){
  if(!dateStr) return null;
  const t=new Date(dateStr+'T23:59:59');
  if(Number.isNaN(t.getTime())) return null;
  return Math.ceil((t-Date.now())/86400000);
}

function getMetrics(){
  const d=state.data;
  const active=d.projects.filter(p=>p.status==='Active').length;
  const urgentProjects=d.projects.filter(p=>['Critical','High'].includes(p.priority)).length;
  const pending=d.actions.filter(a=>!['Done','Closed','Cancelled'].includes(a.status)).length;
  const nearDeadlines=d.projects.filter(p=>{const x=daysUntil(p.deadline);return x!==null&&x>=0&&x<=14}).length;
  return [
    {icon:'◫',value:active,label:'مشاريع نشطة'},
    {icon:'⚡',value:urgentProjects,label:'أولوية مرتفعة'},
    {icon:'◎',value:pending,label:'إجراءات معلّقة'},
    {icon:'⌛',value:nearDeadlines,label:'موعد خلال 14 يوم'}
  ];
}

function renderMetrics(){
  const grid=$('#metricsGrid');grid.textContent='';
  for(const m of getMetrics()){
    const card=document.createElement('article');card.className='metric-card';
    const icon=document.createElement('span');icon.className='metric-icon';icon.textContent=m.icon;
    const value=document.createElement('div');value.className='metric-value';value.textContent=m.value;
    const label=document.createElement('div');label.className='metric-label';label.textContent=m.label;
    card.append(icon,value,label);grid.append(card);
  }
}

function attentionItems(){
  const projects=new Map(state.data.projects.map(p=>[p.id,p]));
  const items=state.data.actions.filter(a=>!['Done','Closed','Cancelled'].includes(a.status)).map(a=>({
    ...a,project:projects.get(a.projectId)
  }));
  items.sort((a,b)=>(PRIORITY_ORDER[a.priority]??9)-(PRIORITY_ORDER[b.priority]??9) || ((a.dueDate||'9999').localeCompare(b.dueDate||'9999')));
  return items;
}

function priorityColor(p){return p==='Critical'?'var(--critical)':p==='High'?'var(--high)':p==='Medium'?'var(--medium)':'var(--muted)'}

function renderAttention(){
  const list=$('#attentionList');list.textContent='';
  const items=attentionItems();
  $('#attentionCount').textContent=items.length;
  if(!items.length){const p=document.createElement('p');p.className='muted';p.textContent='لا توجد إجراءات معلّقة.';list.append(p);return}
  for(const a of items){
    const row=document.createElement('article');row.className='attention-item';
    const dot=document.createElement('span');dot.className='attention-dot';dot.style.background=priorityColor(a.priority);
    const body=document.createElement('div');
    const strong=document.createElement('strong');strong.textContent=a.project?.nameAr||a.projectId;
    const p=document.createElement('p');p.textContent=a.action;body.append(strong,p);
    const status=document.createElement('span');status.className='attention-status';
    const d=daysUntil(a.dueDate);status.textContent=d!==null?(d<0?`متأخر ${Math.abs(d)} يوم`:d===0?'اليوم':`بعد ${d} يوم`):(statusAr[a.status]||a.status||'');
    row.append(dot,body,status);list.append(row);
  }
}

function projectCard(p){
  const node=$('#projectTemplate').content.firstElementChild.cloneNode(true);
  node.dataset.priority=p.priority;
  node.querySelector('.project-id').textContent=p.id;
  node.querySelector('.project-title').textContent=p.nameAr||p.name;
  node.querySelector('.project-sub').textContent=`${p.name} · ${p.category||''}`;
  const badge=node.querySelector('.priority-badge');badge.textContent=priorityAr[p.priority]||p.priority;badge.classList.add(`priority-${p.priority}`);
  node.querySelector('.stage').textContent=p.stage||'—';
  node.querySelector('.market').textContent=`السوق: ${p.market||'—'}`;
  const deadline=node.querySelector('.deadline');
  if(p.deadline){
    const d=daysUntil(p.deadline);
    deadline.textContent=d!==null&&d>=0?`الموعد: ${p.deadline} · ${d} يوم`:`الموعد: ${p.deadline}`;
  }else deadline.textContent='بدون موعد نهائي';
  node.querySelector('.next-action').textContent=p.nextAction?`التالي: ${p.nextAction}`:'لا يوجد إجراء تالٍ مسجل';
  const sl=node.querySelector('.sheet-link'),fl=node.querySelector('.folder-link');
  if(p.sheet){sl.href=p.sheet}else{sl.removeAttribute('href');sl.style.opacity=.45}
  if(p.folder){fl.href=p.folder}else{fl.removeAttribute('href');fl.style.opacity=.45}
  return node;
}

function renderProjects(){
  const grid=$('#projectsGrid');grid.textContent='';
  const projects=[...state.data.projects].sort((a,b)=>(PRIORITY_ORDER[a.priority]??9)-(PRIORITY_ORDER[b.priority]??9));
  const filtered=state.filter==='all'?projects:projects.filter(p=>p.priority===state.filter);
  if(!filtered.length){const p=document.createElement('p');p.className='muted';p.textContent='لا توجد مشاريع في هذا التصنيف.';grid.append(p);return}
  filtered.forEach(p=>grid.append(projectCard(p)));
}

function render(){
  renderMetrics();renderAttention();renderProjects();
  const dt=state.data.generatedAt||state.data.updatedAt||state.data.lastUpdated||'—';
  $('#lastUpdatedLabel').textContent=dt==='—'?dt:new Date(dt).toLocaleString('ar-SA',{dateStyle:'medium',timeStyle:'short'});
}

async function refreshData({silent=false}={}){
  try{
    const live=await liveFetch();
    if(live){
      state.data=normalize(live);render();
      $('#syncBadge').textContent='Live';$('#syncBadge').className='sync-badge live';
      if(!silent) toastSettings('تم تحديث البيانات من Google Sheets.');
      return true;
    }
  }catch(e){
    console.warn(e);
    $('#syncBadge').textContent='Snapshot';$('#syncBadge').className='sync-badge snapshot';
    if(!silent) toastSettings('تعذر الاتصال الحي؛ تم الإبقاء على آخر Snapshot.');
  }
  return false;
}

async function unlock(pass,remember){
  $('#lockError').textContent='';
  try{
    state.data=normalize(await decryptSnapshot(pass));
    if(remember)localStorage.setItem('ihq_device_key',pass);else localStorage.removeItem('ihq_device_key');
    $('#lockScreen').classList.add('hidden');$('#app').classList.remove('hidden');
    render();await refreshData({silent:true});
  }catch(e){
    $('#lockError').textContent='مفتاح الوصول غير صحيح أو تعذر فك البيانات.';
    throw e;
  }
}

function lock(){
  state.data=null;localStorage.removeItem('ihq_device_key');
  $('#accessKey').value='';$('#app').classList.add('hidden');$('#lockScreen').classList.remove('hidden');
}

function toastSettings(msg){$('#settingsMessage').textContent=msg}

document.addEventListener('DOMContentLoaded',async()=>{
  $('#unlockForm').addEventListener('submit',async e=>{
    e.preventDefault();const btn=e.submitter;btn.disabled=true;
    try{await unlock($('#accessKey').value.trim(),$('#rememberKey').checked)}catch{}finally{btn.disabled=false}
  });

  $$('.filter').forEach(btn=>btn.addEventListener('click',()=>{
    $$('.filter').forEach(x=>x.classList.remove('active'));btn.classList.add('active');state.filter=btn.dataset.filter;renderProjects();
  }));

  $('#refreshBtn').addEventListener('click',async()=>{const b=$('#refreshBtn');b.disabled=true;await refreshData();b.disabled=false});
  $('#settingsBtn').addEventListener('click',()=>{
    $('#apiUrl').value=localStorage.getItem('ihq_api_url')||'';
    $('#apiToken').value=localStorage.getItem('ihq_api_token')||'';
    $('#settingsMessage').textContent='';$('#settingsDialog').showModal();
  });
  $('#saveSettingsBtn').addEventListener('click',async e=>{
    e.preventDefault();
    const url=$('#apiUrl').value.trim(),token=$('#apiToken').value.trim();
    if(!url||!token){toastSettings('أدخل رابط الـ API والرمز.');return}
    localStorage.setItem('ihq_api_url',url);localStorage.setItem('ihq_api_token',token);
    toastSettings('جاري اختبار الاتصال…');
    const ok=await refreshData({silent:true});
    toastSettings(ok?'تم الربط بنجاح.':'حُفظت الإعدادات، لكن الاتصال لم ينجح بعد.');
  });
  $('#clearSettingsBtn').addEventListener('click',()=>{
    localStorage.removeItem('ihq_api_url');localStorage.removeItem('ihq_api_token');
    $('#apiUrl').value='';$('#apiToken').value='';$('#syncBadge').textContent='Snapshot';$('#syncBadge').className='sync-badge snapshot';toastSettings('تم إلغاء الربط الحي.');
  });
  $('#lockBtn').addEventListener('click',lock);
  $$('[data-scroll]').forEach(b=>b.addEventListener('click',()=>b.dataset.scroll==='top'?scrollTo({top:0,behavior:'smooth'}):$('#projectsGrid').scrollIntoView({behavior:'smooth',block:'start'})));

  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();state.deferredInstall=e;$('#installBtn').style.display='grid'});
  $('#installBtn').addEventListener('click',async()=>{
    if(state.deferredInstall){state.deferredInstall.prompt();await state.deferredInstall.userChoice;state.deferredInstall=null}
    else alert('من قائمة المتصفح اختر: تثبيت التطبيق / إضافة إلى الشاشة الرئيسية.');
  });

  if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(console.warn);

  const saved=localStorage.getItem('ihq_device_key');
  if(saved){$('#accessKey').value=saved;try{await unlock(saved,true)}catch{localStorage.removeItem('ihq_device_key')}}
});
