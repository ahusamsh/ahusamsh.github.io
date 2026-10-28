import "./style.css";
import {closestZone,homography,project,validSegment,sanitizeImport} from "./core.js";
import {AutoPageVision} from "./page-vision.js";
import * as pdfjs from "pdfjs-dist";
import workerURL from "pdfjs-dist/build/pdf.worker.min.mjs?url";
pdfjs.GlobalWorkerOptions.workerSrc=workerURL;
const $=id=>document.getElementById(id),status=(s)=>{$("status").textContent=s};
const state={pages:{},links:{},pdf:null,page:17,pilot:null,wordLibrary:null,editions:null,editionCode:'ar',editionMap:null,selected:null,segments:{},audioFiles:{},urls:{},corners:[],H:null,calibrating:false,videoStream:null,hand:null,handTask:null,handEnabled:false,lastHand:0,seen:null,seenAt:0,lastPlayed:""};
const bookUrl="https://files.a-alqasim.com/books/AbdulMuhsin/AlQaaidahAlMadaniyahAlQiraaah.pdf";
async function load(){
 try{
  const [demo,links,pilot,library,wordLibrary,editions]=await Promise.all([
   fetch("./data/demo-pages.json").then(r=>r.json()),
   fetch("./data/page-links.json").then(r=>r.json()),
   fetch("./data/pilot-audio.json").then(r=>r.json()),
   fetch("./data/audio-library.json").then(r=>r.ok?r.json():null).catch(()=>null),
   fetch("./data/word-library.json").then(r=>r.ok?r.json():null).catch(()=>null),
   fetch("./data/editions.json").then(r=>r.ok?r.json():null).catch(()=>null)
  ]);
  state.pilot=pilot;state.wordLibrary=wordLibrary;state.editions=editions;state.links=links;
  if(!wordLibrary||!library||!editions){
   state.pages={...demo.pages,...pilot.pages};
   state.segments={...pilot.segments,...state.segments};
   const selector=$("edition-language"),opt=document.createElement("option");opt.value="ar";opt.textContent="العربية";selector.append(opt);
   for(const n of [17,18,19]){const o=document.createElement("option");o.value=n;o.textContent="PDF "+n;$("page").append(o)}
   $("page").value=state.page;syncPageAudio();drawZones();renderPilotImage();
   status("المكتبة الإضافية غير متاحة مؤقتًا؛ التجربة الأصلية للحروف ما زالت تعمل.");
   return;
  }
  state.pages={...demo.pages};
  for(const [n,p] of Object.entries(wordLibrary.pages)){
   const canonical=library.pages[n];
   if(!canonical)continue;
   const zones=p.items.map(id=>wordLibrary.wordItems[id])
    .filter(item=>item?.box&&(!p.gridAudioLink||item.type==='printed-grid-cell'))
    .map(item=>({id:item.id,text:item.arabicText,spokenText:item.spokenText,box:item.box}));
   state.pages[n]={...canonical,zones,
    localAudio:canonical.localAudio||canonical.audioSourceUrl||p.pageAudioUrl,
    image:canonical.image};
  }
  state.pages={...state.pages,...pilot.pages};
  state.segments={...wordLibrary.wordItems,...pilot.segments,...state.segments};
  const selectLang=$("edition-language");
  for(const l of Object.values(editions.locales)){
   const o=document.createElement("option");o.value=l.code;
   o.textContent=l.nameArabic+" / "+l.nameEnglish;selectLang.append(o);
  }
  $("page").replaceChildren();
  for(let n=1;n<=104;n++){
   const o=document.createElement("option");o.value=n;
   o.textContent=state.pages[n]?.printedPage?"صفحة "+state.pages[n].printedPage+" — PDF "+n:"PDF "+n;
   $("page").append(o);
  }
  $("page").value=state.page;
  syncPageAudio();drawZones();renderPilotImage();renderWordList();
  status("المكتبة الصوتية: "+Object.keys(wordLibrary.wordItems).length+
    " عنصر ومقطع توقيت. الربط الآلي غير معتمد سمعيًا.");
 }catch(e){status("تعذر تشغيل المكتبة: "+e.message);console.error(e)}
 if("serviceWorker"in navigator)navigator.serviceWorker.register("./sw.js").catch(()=>{});
}
$("edition-language").onchange=async e=>{
 const lang=e.target.value, requestId=(state.editionRequestId||0)+1;
 state.editionRequestId=requestId;
 state.editionCode=lang;state.editionMap=null;
 if(pdfObjectURL)URL.revokeObjectURL(pdfObjectURL);
 pdfObjectURL=null;state.pdf=null;
 renderPilotImage();drawZones();renderWordList();
 if(lang!=="ar"){
  try{
   const response=await fetch("./data/edition-maps/"+lang+".json");
   if(!response.ok)throw Error("تعذر فتح خريطة الطبعة");
   const map=await response.json();
   if(requestId!==state.editionRequestId)return;
   state.editionMap=map;
  }catch(err){
   if(requestId!==state.editionRequestId)return;
   status("لا توجد خريطة تحقق لهذه الترجمة: "+err.message);
  }
 }
 if(state.pdf)renderPDF();else renderPilotImage();
 drawZones();renderWordList();
 status(lang==="ar"?"طبعة عربية":"اختر ملف PDF الرسمي للترجمة من جهازك؛ الصوت عربي مشترك، وتُخفى مواضع اللمس غير المتحققة.");
};
function activeZones(){
 const zones=state.pages[state.page]?.zones||[];
 if(state.editionCode==="ar")return zones;
 if(!state.pdf)return [];
 const mapping=state.editionMap?.verifiedPages?.[String(state.page)]?.zoneBoxes;
 if(!mapping)return [];
 return zones.filter(z=>mapping[z.id]).map(z=>({...z,box:mapping[z.id]}));
}
function renderWordList(){
 const area=$("word-library-items");if(!area)return;
 area.replaceChildren();
 const wordLibrary=state.wordLibrary;
 const p=wordLibrary?.pages[String(state.page)];
 if(!p)return;
 const filter=($("word-filter").value||"").trim();
 const gridIds=(p.items||[]).filter(id=>wordLibrary.wordItems[id]?.type==='printed-grid-cell');
 const ids=[...new Set([...gridIds,...(p.items||[]),...(p.unplaced||[])])];
 $("word-count").textContent=ids.length+" عنصر صوتي للصفحة؛ المطابقة الآلية تحتاج استماعًا.";
 const fragment=document.createDocumentFragment();
 for(const id of ids){
  const w=wordLibrary.wordItems[id];
  if(!w||filter&&!w.arabicText.includes(filter))continue;
  const btn=document.createElement("button");btn.className="word-entry";
  btn.textContent=w.arabicText;
  btn.title=(w.box?"مربوط بموضع مرئي":"توقيت موجود دون موضع معتمد")+
    " • "+w.start+"–"+w.end+" ثانية";
  btn.setAttribute("aria-label","استمع "+w.arabicText);
  btn.dataset.placed=String(Boolean(w.box));
  btn.onclick=()=>select({id:w.id,text:w.arabicText,spokenText:w.spokenText,box:w.box||[]});
  fragment.append(btn);
 }
 area.append(fragment);
}
$("word-filter").oninput=renderWordList;
document.querySelectorAll("[data-tab]").forEach(b=>b.onclick=()=>{document.querySelectorAll("[data-tab]").forEach(x=>{x.classList.toggle("active",x===b);x.setAttribute("aria-selected",String(x===b))});document.querySelectorAll(".panel").forEach(x=>x.classList.toggle("active",x.id==="view-"+b.dataset.tab));if(b.dataset.tab==="camera")startCamera();else if(state.videoStream)stopCamera();});
let pdfObjectURL=null;
$("book-file").onchange=async e=>{const file=e.target.files?.[0];if(!file)return;try{if(pdfObjectURL)URL.revokeObjectURL(pdfObjectURL);pdfObjectURL=URL.createObjectURL(file);state.pdf=await pdfjs.getDocument({url:pdfObjectURL}).promise;$("page").value=state.page;status("تم فتح PDF محليًا. مواقع الكلمات تتبع طبعة اللغة المختارة.");renderPDF()}catch(err){status("تعذر عرض PDF: "+err.message)}};
function setPage(n){cancelPlayback();state.page=Math.max(1,Math.min(104,Number(n)||17));$("page").value=state.page;$("prev").disabled=state.page===1;$("next").disabled=state.page===104;state.selected=null;state.lastPlayed="";syncPageAudio();drawZones();renderWordList();if(state.pdf)renderPDF();else renderPilotImage();status("الصفحة "+state.page+" • "+activeZones().length+" مواضع قابلة للمس؛ المقاطع غير معتمدة سمعيًا");}
$("page").onchange=e=>setPage(e.target.value);$("prev").onclick=()=>setPage(state.page-1);$("next").onclick=()=>setPage(state.page+1);
async function renderPDF(){if(!state.pdf)return;const canvas=$("pdf-canvas");
 const n=state.editionCode==="ar"?state.page:
  (state.editionMap?.verifiedPages?.[String(state.page)]?.pdfPage||
   state.editionMap?.pageIndex?.[String(state.page)]?.pdfPage);
 if(!Number.isInteger(n)||n<1||n>state.pdf.numPages){
  $("pdf-placeholder").hidden=false;
  $("pdf-placeholder").textContent="لا توجد صفحة مناظرة متحققة لهذه الطبعة؛ لن نعرض صفحة مختلفة بالخطأ.";
  canvas.width=1;canvas.height=1;
  drawZones();
  status("تعذر تحديد الصفحة المقابلة لهذه الترجمة؛ لا يمكن استعمال إحداثيات العربية عليها.");
  return;
 }
 const p=await state.pdf.getPage(n);const w=Math.min(850,Math.max(300,document.documentElement.clientWidth-42));const view=p.getViewport({scale:w/p.view[2]});const dpr=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.round(view.width*dpr);canvas.height=Math.round(view.height*dpr);canvas.style.width=view.width+"px";canvas.style.height=view.height+"px";$("paper").style.width=view.width+"px";$("paper").style.height=view.height+"px";$("pdf-placeholder").hidden=true;await p.render({canvasContext:canvas.getContext("2d"),viewport:p.getViewport({scale:w*dpr/p.view[2]})}).promise;drawZones();}
function drawZones(){const layer=$("word-layer");layer.replaceChildren();for(const z of activeZones()){const b=document.createElement("button");b.className="wordzone";b.title=z.text;b.setAttribute("aria-label","نطق "+z.text);b.style.left=(z.box[0]*100)+"%";b.style.top=(z.box[1]*100)+"%";b.style.width=(z.box[2]*100)+"%";b.style.height=(z.box[3]*100)+"%";b.dataset.id=z.id;b.onclick=()=>select(z);layer.append(b)}layer.classList.toggle("hide-zones",!$("show-zones").checked)}
$("show-zones").onchange=drawZones;$("trial-mode").onchange=cancelPlayback;
function select(z){state.selected=z;$("selected-word").textContent=z.text;document.querySelectorAll(".wordzone").forEach(x=>x.classList.toggle("selected",x.dataset.id===z.id));const seg=state.segments[z.id];$("segment-state").textContent=seg?('بداية '+seg.start.toFixed(2)+' ث • نهاية '+seg.end.toFixed(2)+' ث • '+(seg.reviewed?"معتمد":"بانتظار الاعتماد")):"لم يُربط تسجيل معتمد لهذه الكلمة";if(validSegment(seg)||canPreview(z.id,seg))playSegment(z.id,seg);else status("حددت «"+z.text+"». لا يوجد مقطع صوتي معتمد لهذه الكلمة بعد.")}
let stopTimer=null,preciseTimer=null,playbackGeneration=0;
const clipPlayer=new Audio();
function cancelPlayback(){playbackGeneration++;const a=$("player");a.pause();clipPlayer.pause();if(stopTimer)a.removeEventListener("timeupdate",stopTimer);stopTimer=null;clearTimeout(preciseTimer);preciseTimer=null;}
function syncPageAudio(){cancelPlayback();const a=$("player"),src=state.urls[state.page]||state.pages[state.page]?.localAudio||state.wordLibrary?.pages[String(state.page)]?.pageAudioUrl;a.dataset.page=String(state.page);if(src)a.src=src;else a.removeAttribute("src");a.load();}
function renderPilotImage(){if(state.pdf)return;const page=state.pages[state.page],canvas=$("pdf-canvas");canvas.getContext("2d").clearRect(0,0,canvas.width,canvas.height);$("pdf-placeholder").hidden=false;if(!page||!page.image||state.editionCode!=="ar")return;const n=state.page,img=new Image();img.onload=()=>{if(state.pdf||state.page!==n)return;const w=Math.min(850,Math.max(300,document.documentElement.clientWidth-42)),h=w*img.naturalHeight/img.naturalWidth;canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;canvas.style.width=w+"px";canvas.style.height=h+"px";$("paper").style.width=w+"px";$("paper").style.height=h+"px";canvas.getContext("2d").drawImage(img,0,0);$("pdf-placeholder").hidden=true;drawZones()};img.src=page.image;}

function canPreview(id,seg){return $("trial-mode").checked&&(state.pilot?.segments[id]===seg||(!state.urls[state.page]&&state.wordLibrary?.wordItems[id]===seg))&&Number.isFinite(seg.start)&&Number.isFinite(seg.end)&&seg.start>=0&&seg.end>seg.start}
async function playSegment(id,seg){
 cancelPlayback();const generation=playbackGeneration,audio=$("player");if((!validSegment(seg)&&!canPreview(id,seg))||Number(audio.dataset.page)!==state.page)return;
 if(!seg.reviewed)status("تشغيل تجريبي — هذا المقطع لم يُعتمد سمعيًا بعد.");
 const bundled=state.pilot?.segments[id];
 const clipUrl=!state.urls[state.page]&&(bundled?.clip||seg?.clip);
 if(clipUrl&&(!bundled||bundled.start===seg.start&&bundled.end===seg.end)){
   clipPlayer.src=clipUrl;clipPlayer.onerror=()=>status("حمّل حزمة المقاطع المحلية لتشغيل هذا المقطع المقسّم بدقة.");
   try{await clipPlayer.play()}catch{status("تعذر تشغيل المقطع المحلي؛ راجع حزمة الصوتيات.")}return;
 }
 if(!audio.getAttribute("src")){status("حمّل تسجيل الصفحة أولًا");return}
 audio.currentTime=seg.start;stopTimer=()=>{if(audio.currentTime>=seg.end)cancelPlayback()};audio.addEventListener("timeupdate",stopTimer);
 try{await audio.play();if(generation!==playbackGeneration)return;preciseTimer=setTimeout(cancelPlayback,Math.max(0,(seg.end-audio.currentTime)*1000/audio.playbackRate))}catch{status("المتصفح يتطلب لمسة لتشغيل الصوت")}
}
function pageQR(){return(state.links[state.page]||[])[0]||null}
function openQR(){const u=pageQR();if(u&&/^https:\/\//.test(u))window.open(u,"_blank","noopener");else status("لا يوجد رابط QR مستخرج لهذه الصفحة")}
$("qr-link").onclick=openQR;$("open-qr").onclick=openQR;
$("read-page").onclick=()=>{cancelPlayback();const a=$("player");if(a.getAttribute("src")){a.currentTime=0;a.play().catch(()=>status("تعذر تشغيل ملف الصوت"))}else openQR()};
$("audio-file").onchange=e=>{const f=e.target.files?.[0];if(!f)return;if(state.urls[state.page])URL.revokeObjectURL(state.urls[state.page]);state.urls[state.page]=URL.createObjectURL(f);for(const z of state.pages[state.page]?.zones||[]){if(state.pilot?.segments[z.id])delete state.segments[z.id]}syncPageAudio();status("تم تحميل تسجيل محلي للصفحة "+state.page)};
for(const [btn,key] of [["start-mark","start"],["end-mark","end"]])$(btn).onclick=()=>{if(!state.selected)return status("اختر كلمة أولًا");const id=state.selected.id;state.segments[id]??={start:0,end:0,reviewed:false};state.segments[id][key]=$("player").currentTime;state.segments[id].reviewed=false;select(state.selected)};
$("save-mark").onclick=()=>{if(!state.selected)return;const s=state.segments[state.selected.id];if(!s||s.end<=s.start)return status("حدد بداية ونهاية صحيحتين");localStorage.setItem("madani_segments_pilot_v2",JSON.stringify(state.segments));status("حُفظت علامات التوقيت محليًا، وما زالت غير معتمدة")};
$("approve-mark").onclick=()=>{if(!state.selected)return;const s=state.segments[state.selected.id];if(!s||s.end<=s.start||!$("player").getAttribute("src"))return status("يلزم تشغيل مقطع وضبط بدايته ونهايته أولًا");s.reviewed=true;localStorage.setItem("madani_segments_pilot_v2",JSON.stringify(state.segments));select(state.selected);status("اعتماد تجريبي لهذا الجهاز فقط؛ لا يعني المراجعة العلمية الرسمية")};
$("export-data").onclick=()=>{const blob=new Blob([JSON.stringify({schema:1,segments:state.segments},null,2)],{type:"application/json"});const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="madani-audio-segments.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
$("import-data").onchange=async e=>{const f=e.target.files?.[0];if(!f)return;try{state.segments={...state.segments,...sanitizeImport(JSON.parse(await f.text()))};localStorage.setItem("madani_segments_pilot_v2",JSON.stringify(state.segments));status("تم استيراد التوقيتات من الملف")}catch(e){status("ملف التوقيت غير صالح")}};
try{state.segments=sanitizeImport({schema:1,segments:JSON.parse(localStorage.getItem("madani_segments_pilot_v2")||"{}")})}catch(e){}
// Camera mode: a single tap starts both automatic page identification and
// fingertip tracking. No page selector or four-corner calibration is required.
state.cameraRun=0;
state.autoVision=null;
state.activeMatch=null;
state.pageCandidate=null;
state.pageCandidateCount=0;
state.lastVision=0;
state.lastRecognized=0;
state.lastHand=0;
state.autoStatus="";
function announceAuto(message){
 if(state.autoStatus!==message){
  state.autoStatus=message;
  $("camera-hint").textContent=message;
  status(message);
 }
}
async function startCamera(){
 const placeholder=$("camera-placeholder"),stage=$("camera-stage");
 if(state.videoStream?.getVideoTracks().some(t=>t.readyState==="live"))return;
 const run=++state.cameraRun;
 stage.dataset.cameraState="loading";
 placeholder.hidden=false;
 placeholder.textContent="جارٍ تشغيل الكاميرا والتعرف على الصفحة تلقائيًا...";
 if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia){
  stage.dataset.cameraState="error";
  placeholder.textContent="افتح هذا الموقع باستخدام Chrome وعنوان HTTPS، ثم اسمح باستخدام الكاميرا.";
  announceAuto("الكاميرا غير متاحة في هذا المتصفح.");
  return;
 }
 let stream=null;
 try{
  stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"},width:{ideal:1280},height:{ideal:720}},audio:false});
  if(run!==state.cameraRun){stream.getTracks().forEach(t=>t.stop());return}
  state.videoStream=stream;
  $("video").srcObject=stream;
  await $("video").play();
  placeholder.hidden=true;stage.dataset.cameraState="ready";
  sizeCanvas();
  state.activeMatch=null;state.pageCandidate=null;state.pageCandidateCount=0;
  state.lastRecognized=0;state.lastPlayed="";state.seen=null;
  requestAnimationFrame(track);
  announceAuto("وجّه الكاميرا إلى إحدى الصفحات التعليمية 15 أو 16 أو 17؛ سيتعرف التطبيق على الصفحة تلقائيًا.");
  // Both models load automatically. Failure of one is reported separately.
  const vision=new AutoPageVision();
  state.autoVision=vision;
  const sources=Object.entries(state.pilot?.pages||{}).map(([n,p])=>[Number(n),p.image]);
  if(!sources.length)throw new Error("لم تُحمّل بيانات الصفحات التعليمية");
  const recognition=vision.init(sources).then(()=>{
   if(run!==state.cameraRun){vision.dispose();return}
   announceAuto("التعرف على الصفحات جاهز. وجّه الكاميرا إلى الصفحة، ثم ضع السبابة على أي حرف.");
  });
  const hand=(async()=>{
   const {FilesetResolver,HandLandmarker}=await import("@mediapipe/tasks-vision");
   const resolver=await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm");
   const task=await HandLandmarker.createFromOptions(resolver,{
    baseOptions:{modelAssetPath:"https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",delegate:"CPU"},
    runningMode:"VIDEO",numHands:1,minHandDetectionConfidence:.55,minTrackingConfidence:.5
   });
   if(run!==state.cameraRun){task.close();return}
   state.handTask=task;state.handEnabled=true;
  })();
  const settled=await Promise.allSettled([recognition,hand]);
  if(run!==state.cameraRun)return;
  if(settled[0].status==="rejected")announceAuto("تعذر بدء التعرف على الصفحة: "+settled[0].reason.message);
  else if(settled[1].status==="rejected")announceAuto("تعرفت على الصفحة ولكن تعذر تشغيل تتبع الإصبع: "+settled[1].reason.message);
  else announceAuto("جاهز: وجّه الكاميرا إلى الصفحة ثم أشر بإصبعك إلى الحرف لسماعه. لا يلزم ضبط أي إعدادات.");
 }catch(e){
  stream?.getTracks().forEach(t=>t.stop());
  if(run!==state.cameraRun)return;
  state.videoStream=null;$("video").srcObject=null;
  stage.dataset.cameraState="error";placeholder.hidden=false;
  const reasons={
   NotAllowedError:"الكاميرا مرفوضة. من إعدادات الموقع في Chrome اختر الكاميرا ← السماح.",
   PermissionDeniedError:"اسمح باستخدام الكاميرا في إعدادات الموقع ثم أعد المحاولة.",
   NotFoundError:"لم تُعثر على كاميرا متاحة.",
   NotReadableError:"الكاميرا مشغولة بتطبيق آخر؛ أغلقه ثم أعد المحاولة."
  };
  const msg=reasons[e.name]||("تعذر بدء الكاميرا: "+e.message);
  placeholder.textContent=msg;announceAuto(msg);
 }
}
function stopCamera(){
 ++state.cameraRun;
 state.videoStream?.getTracks().forEach(t=>t.stop());state.videoStream=null;
 state.handEnabled=false;state.handTask?.close?.();state.handTask=null;
 state.autoVision?.dispose();state.autoVision=null;state.activeMatch=null;
 state.lastPlayed="";state.seen=null;state.pageCandidate=null;
 $("video").srcObject=null;$("camera-stage").dataset.cameraState="idle";
 $("camera-placeholder").textContent="اضغط تشغيل الكاميرا ليبدأ التعرف على الصفحة والإصبع.";
 $("camera-placeholder").hidden=false;
 announceAuto("الكاميرا متوقفة.");
}
function sizeCanvas(){const c=$("camera-overlay"),v=$("video");c.width=v.videoWidth||640;c.height=v.videoHeight||480}
$("camera-on").onclick=startCamera;
$("camera-off").onclick=stopCamera;
function updateAutoPage(result,now){
 if(result){
  state.lastRecognized=now;
  if(state.pageCandidate===result.page)state.pageCandidateCount++;
  else {state.pageCandidate=result.page;state.pageCandidateCount=1}
  if(state.pageCandidateCount>=2){
   state.activeMatch=result;
   if(state.page!==result.page)setPage(result.page);
   const n=state.pilot?.pages[result.page]?.printedPage??result.page;
   if(state.autoStatus.indexOf("الصفحة "+n)===-1)announceAuto("تعرّفت على الصفحة "+n+". أشر إلى حرف بإصبعك لسماع نطقه.");
  }
 }else if(now-state.lastRecognized>3500){
  state.activeMatch=null;state.pageCandidate=null;state.pageCandidateCount=0;
  announceAuto("لم أتعرف على الصفحة؛ قرب الكتاب حتى تظهر الصفحة كاملة وثبت الكاميرا. الصفحات المجهزة حاليًا 15–17.");
 }
}
function track(now){
 if(!state.videoStream)return;
 const c=$("camera-overlay"),ctx=c.getContext("2d"),v=$("video");
 if(v.videoWidth&&c.width!==v.videoWidth)sizeCanvas();
 ctx.clearRect(0,0,c.width,c.height);
 if(state.autoVision?.templates?.length&&now-state.lastVision>1050&&v.readyState>=2){
  state.lastVision=now;
  state.autoVision.detect(v).then(found=>{if(state.videoStream)updateAutoPage(found,performance.now())}).catch(e=>{if(state.autoVision)announceAuto("تعذر تحليل صورة الصفحة: "+e.message)})
 }
 const det=state.activeMatch;
 if(det&&now-state.lastRecognized<4000){
  ctx.fillStyle="rgba(21,135,77,.9)";
  ctx.font="bold 30px sans-serif";
  ctx.fillText("صفحة "+(state.pilot?.pages[det.page]?.printedPage||det.page),18,42);
 }
 if(state.handEnabled&&state.handTask&&now-state.lastHand>115&&v.readyState>=2){
  state.lastHand=now;
  try{
   const hand=state.handTask.detectForVideo(v,now);
   const landmarks=hand.landmarks?.[0],tip=landmarks?.[8];
   if(tip){
    ctx.beginPath();ctx.arc(tip.x*c.width,tip.y*c.height,12,0,Math.PI*2);
    ctx.fillStyle="#12ca83";ctx.fill();ctx.lineWidth=3;ctx.strokeStyle="#fff";ctx.stroke();
    if(det&&now-state.lastRecognized<4000){
     const q=state.autoVision?.pointInPage(det,tip);
     const z=q&&closestZone(q,state.pilot?.pages[det.page]?.zones||[]);
     if(z){
      if(state.seen!==z.id){state.seen=z.id;state.seenAt=now}
      else if(now-state.seenAt>=300&&state.lastPlayed!==z.id){
       state.lastPlayed=z.id;select(z);announceAuto("الصفحة "+(state.pilot?.pages[det.page]?.printedPage||det.page)+" — "+(z.spokenText||z.text));
      }
     }else{state.seen=null;state.lastPlayed=""}
    }
   }else{state.seen=null;state.lastPlayed=""}
  }catch(e){if(!state.trackErrorReported){state.trackErrorReported=true;announceAuto("خطأ في تتبع الإصبع: "+e.message)}}
 }
 requestAnimationFrame(track);
}

let installPrompt;window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();installPrompt=e;$("install").hidden=false});$("install").onclick=async()=>{if(installPrompt){await installPrompt.prompt();installPrompt=null;$("install").hidden=true}};
load();
