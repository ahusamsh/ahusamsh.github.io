const state={data:null,filter:'all',deferredInstall:null,lastLiveAt:null};
const $=s=>document.querySelector(s);const $$=s=>[...document.querySelectorAll(s)];
const PRIORITY_ORDER={Critical:0,High:1,Medium:2,Low:3,'حرج':0,'مرتفع':1,'متوسط':2,'منخفض':3};
const priorityAr={Critical:'حرج',High:'مرتفع',Medium:'متوسط',Low:'منخفض','حرج':'حرج','مرتفع':'مرتفع','متوسط':'متوسط','منخفض':'منخفض'};
const statusAr={Open:'مفتوح',Waiting:'بانتظار',Done:'مكتمل',Active:'نشط',Closed:'مغلق',Cancelled:'ملغي','مفتوح':'مفتوح','بانتظار':'بانتظار','مكتمل':'مكتمل','نشط':'نشط'};
const projectAr={
  'Bitumen':'البيتومين','Sulfur':'الكبريت','Electric Buses':'الحافلات الكهربائية','Solar Irrigation':'الري الشمسي','Soda Ash':'كربونات الصوديوم','Dates Export':'تصدير التمور',
  'WaterAid Nigeria Bwari Brokerage':'وساطة مشروع ووترإيد نيجيريا — بواري','Ghana Tablets 2500':'توريد 2500 جهاز لوحي — غانا','UK Packing Cubes':'مكعبات تنظيم الأمتعة — بريطانيا',
  'US FIBC Brokerage':'وساطة أكياس FIBC — الولايات المتحدة','UK Filters':'فلاتر صناعية — بريطانيا','Canada Dairy':'معدات ألبان — كندا','Belgium Cold Chain':'سلسلة تبريد — بلجيكا'
};
const categoryAr={
  'Commodities':'سلع أساسية','E-Mobility':'تنقل كهربائي','AgriTech':'تقنيات زراعية','Chemicals':'كيماويات','Food':'أغذية','Water / Solar':'مياه / طاقة شمسية',
  'ICT / Devices':'تقنية معلومات / أجهزة','Consumer Goods':'سلع استهلاكية','Packaging / B2B':'تغليف / أعمال','Industrial Components':'مكونات صناعية',
  'Food Processing Equipment':'معدات تصنيع غذائي','Cold Chain / Logistics':'سلسلة تبريد / لوجستيات'
};
const marketAr={
  'Global':'عالمي','Rwanda':'رواندا','Ghana':'غانا','Philippines / Turkey':'الفلبين / تركيا','International':'دولي','Nigeria':'نيجيريا','United Kingdom':'المملكة المتحدة',
  'United States':'الولايات المتحدة','Canada':'كندا','Belgium':'بلجيكا'
};
const stageAr={
  'Buyer targeting / follow-up':'استهداف المشترين والمتابعة','Buyer/supplier matching':'مطابقة المشترين بالموردين','Manufacturer engaged / tender qualification':'تواصل مع المصنع / تأهيل للمناقصة',
  'EPC outreach / manufacturer engaged':'تواصل مع مقاول EPC / المصنع متفاعل','Supplier pricing pending / buyer requirement active':'تسعير المورد قيد الانتظار / طلب المشتري نشط',
  'Buyer price negotiation / multi-market outreach':'تفاوض سعر المشتري / تواصل متعدد الأسواق','EPC interested / supplier engaged / BOQ pending':'مقاول مهتم / المورد متفاعل / جدول الكميات قيد الانتظار',
  'OEM qualification / tender matching':'تأهيل مصنع OEM / مطابقة المناقصة','Supplier qualified / retailer outreach':'المورد مؤهل / تواصل مع تجار التجزئة',
  'Supplier outreach / qualification':'تواصل مع الموردين / التأهيل','Supplier outreach / protected introduction qualification':'تواصل مع الموردين / تأهيل الإحالة المحمية',
  'Supplier qualification / owner-CM outreach':'تأهيل المورد / تواصل مع المالك ومدير الإنشاء','Developer / supplier qualification':'تأهيل المطور / المورد'
};
const textAr={
  'Expand targeted bitumen outreach':'توسيع التواصل المستهدف لمشتري البيتومين',
  'Continue qualified sulfur outreach':'مواصلة التواصل المؤهل لمشروع الكبريت',
  'Get RTDA specs and advance Yutong protected technical offer':'الحصول على مواصفات RTDA وتطوير العرض الفني المحمي من Yutong',
  'Secure DIFFUL protection and an engaged Ghana EPC/BOQ':'تأمين حماية DIFFUL والحصول على مقاول EPC غاني متفاعل وجدول الكميات',
  'Obtain firm CIF Manila Soda Ash quote':'الحصول على عرض CIF مانيلا مؤكد لكربونات الصوديوم',
  'Get NFI target price and prepare buyer-ready date stock pack':'الحصول على السعر المستهدف من NFI وتجهيز ملف تمور جاهز للمشتري',
  'Get Green Focus lot/BOQ and DIFFUL protection before Sep 3':'الحصول على الحزمة وجدول الكميات من Green Focus وحماية DIFFUL قبل 3 سبتمبر',
  'Obtain Section VII and secure Pretech commission agreement':'الحصول على القسم السابع وتأمين اتفاق عمولة مع Pretech',
  'Obtain Szoneier baseline FOB/DDP UK quote and pitch retailers':'الحصول على عرض أساسي FOB/DDP لبريطانيا من Szoneier والتواصل مع تجار التجزئة',
  'Follow FlexSack quote and continue US sourcing-gap scouting':'متابعة عرض FlexSack ومواصلة تنقيب فجوات التوريد في السوق الأمريكي',
  'Obtain UK filter manufacturer pricing and protected referral acceptance':'الحصول على أسعار مصنعي الفلاتر في بريطانيا وقبول الإحالة المحمية',
  'Convert Canada dairy expansion into a specific equipment/procurement package':'تحويل توسعة مصنع الألبان في كندا إلى حزمة معدات ومشتريات محددة',
  'Get Belgium cold-chain procurement route and defined refrigeration scope':'تحديد مسار المشتريات ونطاق التبريد لمشروع بلجيكا',
  'Expand buyer targeting and follow replies':'توسيع استهداف المشترين ومتابعة الردود',
  'Continue qualified outreach':'مواصلة التواصل المؤهل',
  'Obtain complete RTDA specs/seating and secure Yutong referral protection/technical offer.':'الحصول على مواصفات RTDA الكاملة وتفاصيل المقاعد وتأمين حماية الإحالة والعرض الفني من Yutong.',
  'Secure DIFFUL protection and obtain engaged Ghanaian EPC/BOQ.':'تأمين حماية DIFFUL والحصول على مقاول EPC غاني متفاعل وجدول الكميات.',
  'Follow Defne for firm CIF Manila quote; keep WE Soda and AS Kimya parallel.':'متابعة Defne للحصول على عرض CIF مانيلا مؤكد مع إبقاء WE Soda وAS Kimya كمسارات موازية.',
  'Receive NFI target buying price; negotiate firm source price if workable; collect buyer-ready photos/packaging/grades.':'استلام سعر الشراء المستهدف من NFI ثم التفاوض على سعر مصدر مؤكد وتجهيز الصور والتغليف والدرجات للمشتري.',
  'Obtain Green Focus lot/BOQ and DIFFUL written protection, then quote immediately.':'الحصول على الحزمة وجدول الكميات من Green Focus وحماية DIFFUL مكتوبة ثم التسعير فورًا.',
  'Obtain Section VII/payment terms, send to Pretech, and secure commission agreement before bidder introduction.':'الحصول على القسم السابع وشروط الدفع وإرسالها إلى Pretech وتأمين اتفاق العمولة قبل تعريف مقدم العرض.',
  'Obtain 300/500-set 4/6-piece FOB + DDP UK baseline quote from Szoneier and pitch qualified retailers.':'الحصول من Szoneier على عرض أساسي لـ300/500 طقم من 4/6 قطع FOB وDDP لبريطانيا ثم التواصل مع تجار تجزئة مؤهلين.',
  'Follow FlexSack quote/protection and keep scouting explicit US-to-US sourcing gaps.':'متابعة عرض وحماية FlexSack والاستمرار في تنقيب فجوات التوريد الواضحة داخل السوق الأمريكي.',
  'Follow VTE/AL Group and other manufacturers for pricing and protected referral acceptance.':'متابعة VTE وAL Group ومصنعين آخرين للحصول على الأسعار وقبول الإحالة المحمية.',
  'Get a concrete equipment/procurement scope from Gay Lea/Matheson and supplier responses.':'الحصول على نطاق معدات ومشتريات محدد من Gay Lea/Matheson وردود الموردين.',
  'Get Montea/procurement response and define a package before protected supplier introduction.':'الحصول على رد Montea/المشتريات وتحديد الحزمة قبل تقديم المورد بصورة محمية.',
  'Construction planned 2027':'الإنشاء مخطط في 2027'
};

function b64ToBytes(s){return Uint8Array.from(atob(s),c=>c.charCodeAt(0))}
async function deriveKey(pass,salt,iterations){const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(pass),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['decrypt'])}
async function decryptSnapshot(pass){const enc=await fetch('./data/snapshot.enc.json?v=10',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('snapshot');return r.json()});const key=await deriveKey(pass,b64ToBytes(enc.salt),enc.iterations);const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:b64ToBytes(enc.iv)},key,b64ToBytes(enc.ciphertext));return JSON.parse(new TextDecoder().decode(plain))}

window.liveFetchBridge=window.liveFetchBridge||(()=>Promise.reject(new Error('Live API not configured')));
const arText=v=>textAr[String(v||'')]||String(v||'');
const isActiveStatus=s=>['active','نشط'].includes(String(s||'').trim().toLowerCase());
const isClosedStatus=s=>['done','closed','cancelled','مكتمل','مغلق','ملغي'].includes(String(s||'').trim().toLowerCase());

function normalize(data){
  data.projects=(data.projects||[]).map(p=>({...p,
    nameAr:p.nameAr&&p.nameAr!==p.name?p.nameAr:(projectAr[p.name]||p.name||'مشروع بدون اسم'),
    categoryAr:categoryAr[p.category]||p.category||'—',marketAr:marketAr[p.market]||p.market||'—',stageAr:stageAr[p.stage]||p.stage||'—',
    nextActionAr:arText(p.nextAction),status:p.status||'Active',priority:p.priority||'Medium',deadline:p.deadline||'',lastUpdate:p.lastUpdate||''
  }));
  data.actions=(data.actions||[]).map(a=>({...a,actionAr:arText(a.action),status:a.status||'Open',priority:a.priority||'Medium'}));
  data.communications=data.communications||[];data.money=data.money||[];return data;
}
function daysUntil(dateStr){if(!dateStr||!/\d{4}-\d{2}-\d{2}/.test(dateStr))return null;const t=new Date(dateStr.slice(0,10)+'T23:59:59');if(Number.isNaN(t.getTime()))return null;return Math.ceil((t-Date.now())/86400000)}
function dueLabel(dateStr){if(!dateStr)return'—';const mapped=arText(dateStr);if(mapped!==dateStr)return mapped;const d=daysUntil(dateStr);if(d===null)return dateStr;if(d<0)return`متأخر ${Math.abs(d)} يوم`;if(d===0)return'اليوم';return`بعد ${d} يوم`}
function getMetrics(){const d=state.data;const active=d.projects.filter(p=>isActiveStatus(p.status)).length;const urgent=d.projects.filter(p=>['Critical','High','حرج','مرتفع'].includes(p.priority)).length;const pending=d.actions.filter(a=>!isClosedStatus(a.status)).length;const near=d.projects.filter(p=>{const x=daysUntil(p.deadline);return x!==null&&x>=0&&x<=14}).length;return[{code:'[01]',value:active,label:'مشاريع نشطة'},{code:'[02]',value:pending,label:'متابعات جارية'},{code:'[03]',value:urgent,label:'أولوية مرتفعة'},{code:'[04]',value:near,label:'مواعيد خلال 14 يوم'}]}
function renderMetrics(){const grid=$('#metricsGrid');grid.textContent='';for(const m of getMetrics()){const cell=document.createElement('div');cell.className='metric-cell';cell.innerHTML=`<span class="metric-code">${m.code}</span><strong class="metric-value">${m.value}</strong><span class="metric-label">${m.label}</span>`;grid.append(cell)}}
function attentionItems(){const projects=new Map(state.data.projects.map(p=>[p.id,p]));const items=state.data.actions.filter(a=>!isClosedStatus(a.status)).map(a=>({...a,project:projects.get(a.projectId)}));items.sort((a,b)=>(PRIORITY_ORDER[a.priority]??9)-(PRIORITY_ORDER[b.priority]??9)||((a.dueDate||'9999').localeCompare(b.dueDate||'9999')));return items}
function priorityClass(p){const n=PRIORITY_ORDER[p]??9;return n===0?'priority-critical':n===1?'priority-high':'priority-normal'}
function renderAttention(){const body=$('#attentionBody');body.textContent='';const items=attentionItems();$('#attentionCount').textContent=items.length;if(!items.length){const tr=document.createElement('tr');tr.innerHTML='<td colspan="5" class="empty-row">لا توجد متابعات جارية.</td>';body.append(tr);return}items.forEach((a,i)=>{const tr=document.createElement('tr');tr.innerHTML=`<td class="sticky-col mono-id">${String(i+1).padStart(2,'0')}</td><td><strong>${a.project?.nameAr||a.projectId||'—'}</strong><small>${a.projectId||''}</small></td><td class="action-cell">${a.actionAr||a.action||'—'}</td><td><span class="priority-text ${priorityClass(a.priority)}">${priorityAr[a.priority]||a.priority||'—'}</span></td><td><span class="status-line ${isClosedStatus(a.status)?'':'active-line'}">${dueLabel(a.dueDate)} · ${statusAr[a.status]||a.status||'—'}</span></td>`;body.append(tr)})}
function filteredProjects(){const projects=[...state.data.projects].sort((a,b)=>(PRIORITY_ORDER[a.priority]??9)-(PRIORITY_ORDER[b.priority]??9)||String(a.id).localeCompare(String(b.id)));return state.filter==='all'?projects:projects.filter(p=>p.priority===state.filter)}
function renderProjects(){const body=$('#projectsBody');body.textContent='';const projects=filteredProjects();$('#projectCountLabel').textContent=`${projects.length} / ${state.data.projects.length}`;if(!projects.length){const tr=document.createElement('tr');tr.innerHTML='<td colspan="8" class="empty-row">لا توجد مشاريع في هذا التصنيف.</td>';body.append(tr);return}projects.forEach(p=>{const tr=document.createElement('tr');const sub=[p.name,p.category].filter(Boolean).join(' · ');tr.innerHTML=`<td class="sticky-col mono-id">${p.id||'—'}</td><td><strong>${p.nameAr||p.name||'—'}</strong><small>${sub}</small></td><td>${p.marketAr}</td><td>${p.stageAr}</td><td><span class="priority-text ${priorityClass(p.priority)}">${priorityAr[p.priority]||p.priority||'—'}</span></td><td>${p.deadline?`${arText(p.deadline)}${daysUntil(p.deadline)!==null?`<small>${dueLabel(p.deadline)}</small>`:''}`:'—'}</td><td class="action-cell">${p.nextActionAr||'—'}</td><td><span class="status-line ${isActiveStatus(p.status)?'active-line':''}">${isActiveStatus(p.status)?'● ':''}${statusAr[p.status]||p.status||'—'}</span></td>`;body.append(tr)})}
function renderSystem(){const dt=state.data.generatedAt||state.data.updatedAt||state.data.lastUpdated||'';$('#lastUpdatedLabel').textContent=dt?new Date(dt).toLocaleString('ar-SA',{dateStyle:'medium',timeStyle:'short'}):'—';$('#sourceLabel').textContent=state.data.source||'Investment HQ - Master Control Center';$('#totalProjectsLabel').textContent=state.data.projects.length;$('#totalActionsLabel').textContent=state.data.actions.length}
function render(){renderMetrics();renderAttention();renderProjects();renderSystem()}
function setBadge(text,kind='offline'){const badge=$('#syncBadge');badge.textContent=text;badge.className='system-status '+kind;badge.title=text}
function errorLabel(err){const m=String(err?.message||err||'');if(m.includes('Unauthorized'))return'● غير مصرح';if(m.includes('not configured'))return'● الربط غير مهيأ';if(m.includes('nonce'))return'● تعذر التحقق من جلسة التحديث';if(m.includes('gzip'))return'● المتصفح لا يدعم فك التحديث';return'● تعذر التحديث المباشر'}
async function refreshData(){setBadge('● جارٍ تحديث البيانات…','pending');try{const live=await window.liveFetchBridge();state.data=normalize({...state.data,...live,liveApi:state.data.liveApi});state.lastLiveAt=Date.now();render();setBadge('● النظام متصل — مباشر','live');return true}catch(e){console.warn('Investment HQ live sync:',e);setBadge(errorLabel(e),'offline');return false}}
async function unlock(pass,remember){$('#lockError').textContent='';try{state.data=normalize(await decryptSnapshot(pass));if(remember)localStorage.setItem('ihq_device_key',pass);else localStorage.removeItem('ihq_device_key');$('#lockScreen').classList.add('hidden');$('#app').classList.remove('hidden');render();await refreshData()}catch(e){$('#lockError').textContent='مفتاح الوصول غير صحيح أو تعذر فك البيانات.';throw e}}
function lock(){state.data=null;localStorage.removeItem('ihq_device_key');$('#accessKey').value='';$('#app').classList.add('hidden');$('#lockScreen').classList.remove('hidden')}
function setFilter(value){state.filter=value;$$('.filter').forEach(x=>x.classList.toggle('active',x.dataset.filter===value));renderProjects()}

document.addEventListener('DOMContentLoaded',async()=>{
  $('#unlockForm').addEventListener('submit',async e=>{e.preventDefault();const btn=e.submitter;btn.disabled=true;try{await unlock($('#accessKey').value.trim(),$('#rememberKey').checked)}catch{}finally{btn.disabled=false}});
  $$('.filter').forEach(btn=>btn.addEventListener('click',()=>setFilter(btn.dataset.filter)));
  $('#refreshBtn').addEventListener('click',async()=>{const b=$('#refreshBtn');b.disabled=true;await refreshData();b.disabled=false});
  $('#showAllBtn').addEventListener('click',()=>{setFilter('all');$('#projectsSection').scrollIntoView({behavior:'smooth',block:'start'})});
  $('#lockBtn').addEventListener('click',lock);
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();state.deferredInstall=e});
  $('#installBtn').addEventListener('click',async()=>{if(state.deferredInstall){state.deferredInstall.prompt();await state.deferredInstall.userChoice;state.deferredInstall=null}else alert('من قائمة المتصفح اختر تثبيت التطبيق أو إضافته إلى الشاشة الرئيسية.')});
  if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js?v=18').catch(console.warn);
  const saved=localStorage.getItem('ihq_device_key');if(saved){$('#accessKey').value=saved;try{await unlock(saved,true)}catch{localStorage.removeItem('ihq_device_key')}}
});
