const state={data:null,filter:'all',deferredInstall:null};
const $=s=>document.querySelector(s);const $$=s=>[...document.querySelectorAll(s)];
const PRIORITY_ORDER={Critical:0,High:1,Medium:2,Low:3};
const priorityAr={Critical:'حرج',High:'مرتفع',Medium:'متوسط',Low:'منخفض'};
const statusAr={Open:'مفتوح',Waiting:'بانتظار',Done:'مكتمل',Active:'نشط',Closed:'مغلق',Cancelled:'ملغي'};
const marketAr={Global:'عالمي',Rwanda:'رواندا',Ghana:'غانا','Philippines / Turkey':'الفلبين / تركيا',International:'دولي',Nigeria:'نيجيريا','United Kingdom':'المملكة المتحدة','United States':'الولايات المتحدة',Canada:'كندا',Belgium:'بلجيكا'};
const stageAr={
  'Buyer targeting / follow-up':'استهداف المشترين والمتابعة','Buyer/supplier matching':'مطابقة مشترين وموردين','Manufacturer engaged / tender qualification':'المصنع متفاعل / تأهيل للمناقصة',
  'EPC outreach / manufacturer engaged':'تواصل مع EPC / المصنع متفاعل','Supplier pricing pending / buyer requirement active':'تسعير المورد قيد الانتظار / طلب المشتري نشط',
  'Buyer price negotiation / multi-market outreach':'تفاوض سعري / تواصل متعدد الأسواق','EPC interested / supplier engaged / BOQ pending':'EPC مهتم / المورد متفاعل / BOQ قيد الانتظار',
  'OEM qualification / tender matching':'تأهيل OEM / مطابقة المناقصة','Supplier qualified / retailer outreach':'المورد مؤهل / تواصل مع التجزئة','Supplier outreach / qualification':'تواصل وتأهيل الموردين',
  'Supplier outreach / protected introduction qualification':'تواصل مع الموردين / تأهيل إحالة محمية','Supplier qualification / owner-CM outreach':'تأهيل المورد / تواصل مع المالك ومدير الإنشاء',
  'Developer / supplier qualification':'تأهيل المطور / المورد'
};
const actionAr={
  'Expand targeted bitumen outreach':'توسيع التواصل المستهدف لمشتري البيتومين','Continue qualified sulfur outreach':'مواصلة التواصل المؤهل لمشروع الكبريت',
  'Get RTDA specs and advance Yutong protected technical offer':'الحصول على مواصفات RTDA وتطوير عرض Yutong المحمي','Secure DIFFUL protection and an engaged Ghana EPC/BOQ':'تأمين حماية DIFFUL والحصول على EPC غاني وBOQ',
  'Obtain firm CIF Manila Soda Ash quote':'الحصول على عرض CIF مانيلا مؤكد','Get NFI target price and prepare buyer-ready date stock pack':'الحصول على سعر NFI المستهدف وتجهيز ملف التمور للمشتري',
  'Get Green Focus lot/BOQ and DIFFUL protection before Sep 3':'الحصول على الحزمة وBOQ من Green Focus وحماية DIFFUL','Obtain Section VII and secure Pretech commission agreement':'الحصول على Section VII وتأمين اتفاق عمولة Pretech',
  'Obtain Szoneier baseline FOB/DDP UK quote and pitch retailers':'الحصول على عرض Szoneier الأساسي والتواصل مع التجزئة','Follow FlexSack quote and continue US sourcing-gap scouting':'متابعة FlexSack وتنقيب فجوات التوريد الأمريكية',
  'Obtain UK filter manufacturer pricing and protected referral acceptance':'الحصول على أسعار الفلاتر وقبول الإحالة المحمية','Convert Canada dairy expansion into a specific equipment/procurement package':'تحويل توسعة الألبان في كندا إلى حزمة معدات ومشتريات محددة',
  'Get Belgium cold-chain procurement route and defined refrigeration scope':'تحديد مسار المشتريات ونطاق التبريد في بلجيكا'
};

function b64ToBytes(s){return Uint8Array.from(atob(s),c=>c.charCodeAt(0))}
async function deriveKey(pass,salt,iterations){const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(pass),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['decrypt'])}
async function decryptSnapshot(pass){const enc=await fetch('./data/snapshot.enc.json?v=10',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('snapshot');return r.json()});const key=await deriveKey(pass,b64ToBytes(enc.salt),enc.iterations);const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:b64ToBytes(enc.iv)},key,b64ToBytes(enc.ciphertext));return JSON.parse(new TextDecoder().decode(plain))}
window.liveFetchBridge=window.liveFetchBridge||(()=>Promise.reject(new Error('Live API not configured')));

const trAction=v=>actionAr[String(v||'')]||String(v||'');
function isClosed(v){return ['Done','Closed','Cancelled','مكتمل','مغلق','ملغي'].includes(String(v||''))}
function daysUntil(s){if(!s||!/\d{4}-\d{2}-\d{2}/.test(s))return null;const d=new Date(s.slice(0,10)+'T23:59:59');if(Number.isNaN(d.getTime()))return null;return Math.ceil((d-Date.now())/86400000)}
function dueText(s){const d=daysUntil(s);if(d===null)return s||'بدون موعد';if(d<0)return`متأخر ${Math.abs(d)} يوم`;if(d===0)return'اليوم';if(d===1)return'غدًا';return`بعد ${d} أيام`}
function whenText(s){if(!s)return'—';const d=new Date(s);if(Number.isNaN(d.getTime()))return s;return d.toLocaleString('ar-SA',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}

function normalize(data){
  data.projects=(data.projects||[]).map(p=>({...p,nameAr:p.nameAr||p.arabicName||p.name||'مشروع',marketAr:marketAr[p.market]||p.market||'—',stageAr:stageAr[p.stage]||p.stage||'—'}));
  data.actions=(data.actions||[]).map(a=>({...a,actionAr:trAction(a.action)}));
  data.emails=(data.emails||[]).map(e=>({...e}));
  return data;
}
function openActions(){return state.data.actions.filter(a=>!isClosed(a.status)).sort((a,b)=>{const da=a.dueDate||'9999-99-99',db=b.dueDate||'9999-99-99';return da.localeCompare(db)||(PRIORITY_ORDER[a.priority]??9)-(PRIORITY_ORDER[b.priority]??9)})}
function needsReply(){return state.data.emails.filter(e=>e.replyStatus==='NEEDS_OUR_REPLY').sort((a,b)=>String(b.lastMessageAt||'').localeCompare(String(a.lastMessageAt||'')))}
function waitingExternal(){return state.data.emails.filter(e=>e.replyStatus==='WAITING_EXTERNAL')}
function metrics(){const due=openActions().filter(a=>{const d=daysUntil(a.dueDate);return d!==null&&d<=3}).length;return[
  {value:state.data.projects.filter(p=>String(p.status||'').toLowerCase()==='active'||p.status==='نشط').length,label:'مشاريع نشطة',tone:'blue'},
  {value:needsReply().length,label:'تحتاج ردك',tone:'red'},
  {value:waitingExternal().length,label:'ننتظر ردهم',tone:'amber'},
  {value:due,label:'مستحق ≤ 3 أيام',tone:'purple'}
]}
function renderMetrics(){const el=$('#metrics');el.textContent='';metrics().forEach(m=>{const x=document.createElement('article');x.className='metric '+m.tone;x.innerHTML=`<strong>${m.value}</strong><span>${m.label}</span>`;el.append(x)})}
function projectMap(){return new Map(state.data.projects.map(p=>[p.id,p]))}
function renderNeedsReply(){const sec=$('#mailSection'),list=$('#mailList'),items=needsReply();$('#mailCount').textContent=items.length;list.textContent='';sec.classList.toggle('empty',items.length===0);if(!items.length){list.innerHTML='<div class="empty-line">لا توجد رسائل تحتاج ردًا الآن</div>';return}const map=projectMap();items.slice(0,12).forEach(e=>{const p=map.get(e.projectId);const row=document.createElement('article');row.className='mail-row';row.innerHTML=`<div class="mail-main"><div class="mail-meta"><span class="pid">${e.projectId||'—'}</span><strong>${p?.nameAr||e.project||'—'}</strong><span>${whenText(e.lastMessageAt)}</span></div><div class="mail-subject">${escapeHtml(e.subject||'(بدون عنوان)')}</div><div class="mail-from">${escapeHtml(e.lastSender||e.counterparty||'')}</div></div><a class="mail-open" href="${escapeAttr(e.threadLink||'#')}" target="_blank" rel="noreferrer">فتح البريد</a>`;list.append(row)})}
function renderActions(){const list=$('#actionsList'),items=openActions(),map=projectMap();$('#actionsCount').textContent=items.length;list.textContent='';items.slice(0,14).forEach(a=>{const p=map.get(a.projectId);const row=document.createElement('article');row.className='action-row';row.innerHTML=`<div class="action-project"><span class="pid">${a.projectId}</span><strong>${p?.nameAr||a.projectId}</strong></div><div class="action-text">${escapeHtml(a.actionAr||a.action||'—')}</div><div class="action-side"><span class="priority p-${a.priority||'Medium'}">${priorityAr[a.priority]||a.priority||'—'}</span><span class="due">${dueText(a.dueDate)}</span></div>`;list.append(row)});if(!items.length)list.innerHTML='<div class="empty-line">لا توجد متابعات مفتوحة</div>'}
function renderProjects(){const grid=$('#projectsGrid');grid.textContent='';let items=[...state.data.projects].sort((a,b)=>(PRIORITY_ORDER[a.priority]??9)-(PRIORITY_ORDER[b.priority]??9)||String(a.id).localeCompare(String(b.id)));if(state.filter!=='all')items=items.filter(p=>p.priority===state.filter);items.forEach(p=>{const card=document.createElement('article');card.className='project-card';card.innerHTML=`<div class="project-head"><div><span class="pid">${p.id}</span><h3>${escapeHtml(p.nameAr||p.name)}</h3></div><span class="priority p-${p.priority||'Medium'}">${priorityAr[p.priority]||p.priority||'—'}</span></div><div class="project-stage">${escapeHtml(p.stageAr||'—')}</div><div class="project-next">${escapeHtml(trAction(p.nextAction)||'—')}</div><div class="project-foot"><span>${escapeHtml(p.marketAr||'—')}</span><span>${p.deadline?dueText(p.deadline):'—'}</span></div>`;grid.append(card)})}
function render(){renderMetrics();renderNeedsReply();renderActions();renderProjects();const dt=state.data.generatedAt;$('#lastSync').textContent=dt?new Date(dt).toLocaleTimeString('ar-SA',{hour:'2-digit',minute:'2-digit'}):'—'}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function escapeAttr(s){return escapeHtml(s)}
function setStatus(text,kind){const b=$('#syncBadge');b.textContent=text;b.className='sync-status '+kind}
async function refreshData(){setStatus('● مزامنة…','syncing');try{const live=await liveFetchBridge();state.data=normalize({...state.data,...live,liveApi:state.data.liveApi});render();setStatus(live.emailSyncError?'● مباشر / البريد متأخر':'● مباشر','live');return true}catch(e){console.warn(e);setStatus('● نسخة محفوظة','offline');return false}}
async function unlock(pass,remember){$('#lockError').textContent='';try{state.data=normalize(await decryptSnapshot(pass));if(remember)localStorage.setItem('ihq_device_key',pass);else localStorage.removeItem('ihq_device_key');$('#lockScreen').classList.add('hidden');$('#app').classList.remove('hidden');render();await refreshData()}catch(e){$('#lockError').textContent='تعذر فتح البيانات';throw e}}
function lock(){state.data=null;localStorage.removeItem('ihq_device_key');$('#accessKey').value='';$('#app').classList.add('hidden');$('#lockScreen').classList.remove('hidden')}

document.addEventListener('DOMContentLoaded',async()=>{
  $('#unlockForm').addEventListener('submit',async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{await unlock($('#accessKey').value.trim(),$('#rememberKey').checked)}catch{}finally{b.disabled=false}});
  $('#refreshBtn').addEventListener('click',refreshData);$('#lockBtn').addEventListener('click',lock);
  $$('.filter').forEach(b=>b.addEventListener('click',()=>{$$('.filter').forEach(x=>x.classList.remove('active'));b.classList.add('active');state.filter=b.dataset.filter;renderProjects()}));
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();state.deferredInstall=e});
  $('#installBtn').addEventListener('click',async()=>{if(state.deferredInstall){state.deferredInstall.prompt();await state.deferredInstall.userChoice;state.deferredInstall=null}else alert('من قائمة المتصفح اختر تثبيت التطبيق أو إضافته إلى الشاشة الرئيسية.')});
  if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js?v=19').catch(console.warn);
  const saved=localStorage.getItem('ihq_device_key');if(saved){$('#accessKey').value=saved;try{await unlock(saved,true)}catch{localStorage.removeItem('ihq_device_key')}}
});