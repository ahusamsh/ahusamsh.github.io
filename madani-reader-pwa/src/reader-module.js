import jsQR from "jsqr";
import {FilesetResolver,HandLandmarker} from "@mediapipe/tasks-vision";
import {markerFromUrl,markerGeometry} from "./page-vision.js";
import {VisualPageMatcher} from "./visual-matcher.js";
import {TemporalPageTracker} from "./temporal-tracker.js";
import {closestZone,project} from "./core.js";
import {reliableMatch,strongMovingMatch,geometryAgrees} from "./alignment-quality.js";
import "./reader.css";

/** Standalone camera reader. No global DOM controls, database, PDFs, or cloud writes.
 * Example: const reader = mountMadaniReader(element,{assetBase:"/madani/"});
 * reader.start(); reader.stop(); reader.destroy();
 * Callbacks: onPage({page,printedPage}), onWord({page,zone,text}), onStatus(msg).
 */
export function mountMadaniReader(container,{assetBase="./",onPage=()=>{},onWord=()=>{},onStatus=()=>{}}={}){
 if(!(container instanceof HTMLElement))throw new TypeError("Container HTMLElement required");
 const origin=new URL(assetBase,document.baseURI);
 const url=p=>new URL(String(p).replace(/^\.\//,""),origin).href;
 const ui=document.createElement("section");
 ui.className="madani-camera";
 ui.dir="rtl";
 ui.innerHTML='<div class="madani-screen"><div class="madani-qr-guide" aria-hidden="true"><span></span></div><video class="madani-video" muted playsinline autoplay></video><canvas class="madani-overlay"></canvas><div class="madani-message" role="status">اضغط تشغيل الكاميرا ثم امسح رمز QR الموجود على الصفحة.</div></div><div class="madani-actions"><button type="button" class="madani-start">تشغيل الكاميرا</button><button type="button" class="madani-stop" hidden>إيقاف</button></div><p class="madani-guide">امسح QR مرة واحدة، ثم وجّه الكاميرا إلى الصفحة وأشر بإصبعك إلى الحرف.</p>';
 container.replaceChildren(ui);
 const $=q=>ui.querySelector(q),video=$(".madani-video"),canvas=$(".madani-overlay"),message=$(".madani-message"),startButton=$(".madani-start"),stopButton=$(".madani-stop");
 const ctx=canvas.getContext("2d");
 const focusGuide=$(".madani-qr-guide");
 const s={stream:null,run:0,phase:"idle",page:null,manifest:null,matcher:null,tracker:null,lockedH:null,lastAligned:0,qrReader:null,qrCanvas:document.createElement("canvas"),scanning:false,matching:false,lastScan:0,lastMatch:0,lastFinger:0,seen:null,seenAt:0,lastZone:null,coolUntil:0,lastZoneLostAt:0,audioRequest:0,audioState:"idle",fingerVisible:false,fingerZone:null,lastFingerSeen:0,lastFingerHint:0,audioContext:null,audioCache:new Map(),audioSource:null,loopId:0,lastStatus:"",lastScannedQr:"",temporal:new TemporalPageTracker(),lastFullMatch:0,lastFlow:0,flowMs:0,lastFullMs:0,isDestroyed:false,alignFails:0,alignStreak:0,lastCandidate:null,lastCandidateAt:0,alignReportAt:0};
 const announce=(text)=>{if(s.lastStatus!==text){s.lastStatus=text;message.textContent=text;onStatus(text)}};
 function showPhase(next){s.phase=next;focusGuide.hidden=next!=="scan";ui.dataset.phase=next;}
 function confirmQR(page){try{navigator.vibrate?.(110)}catch{}announce("تم مسح الرمز! الصفحة "+page+". أبعد الهاتف حتى تظهر الصفحة كاملة ثم أشر إلى الحرف.");}
 function clearAudio(){try{s.audioSource?.stop()}catch{}s.audioSource=null}
 function resetPage(){s.temporal.reset();s.lastFullMatch=0;s.lastFlow=0;s.audioRequest++;s.audioState="idle";s.fingerVisible=false;s.fingerZone=null;s.page=null;s.lockedH=null;s.lastAligned=0;s.matcher?.dispose();s.matcher=null;s.seen=null;s.lastZone=null;}
 async function unlockAudio(){
  const A=window.AudioContext||window.webkitAudioContext;
  if(A){s.audioContext??=new A();await s.audioContext.resume()}
 }
 async function say(zone){
  const segment=s.manifest?.segments?.[zone.id];
  if(!segment?.clip){announce("لم نجد تسجيلًا لهذا الحرف.");return}
  const clipUrl=url(segment.clip);
  // IMPORTANT: committing a selection must not depend on the finger remaining
  // over the word while the MP3 downloads. This previously caused silent
  // cancellation on mobile when the finger moved or a frame was dropped.
  const request=++s.audioRequest,run=s.run,pageId=s.page?.pdfPage;
  s.audioState="loading";
  try{
   let buffer=s.audioCache.get(clipUrl);
   if(!buffer){
    const response=await fetch(clipUrl);
    if(!response.ok)throw Error("HTTP "+response.status);
    const bytes=await response.arrayBuffer();
    if(!s.audioContext)throw Error("تهيئة الصوت غير مكتملة");
    buffer=await s.audioContext.decodeAudioData(bytes);
    s.audioCache.set(clipUrl,buffer);
   }
   // Reject only when page, chosen target, or reader session changes,
   // NOT when the child's finger moves after the selection.
   if(s.phase!=="point"||s.run!==run||s.page?.pdfPage!==pageId||s.audioRequest!==request)return;
   if(s.audioContext?.state!=="running")await s.audioContext.resume();
   if(s.run!==run||s.audioRequest!==request)return;
   clearAudio();
   const node=s.audioContext.createBufferSource();
   node.buffer=buffer;node.connect(s.audioContext.destination);node.start();s.audioSource=node;
   s.audioState="playing";
   onWord({page:s.page.pdfPage,printedPage:s.page.printedPage,zoneId:zone.id,text:zone.spokenText||zone.text});
   announce("🔊 "+(zone.spokenText||zone.text));
  }catch(e){s.audioState="error";announce("تعذر تشغيل صوت الحرف: "+e.message)}
 }

 function resize(){if(!video.videoWidth)return;canvas.width=video.videoWidth;canvas.height=video.videoHeight;}
 function screenshot(width=1000){
  const c=s.qrCanvas;c.width=Math.min(width,video.videoWidth);c.height=Math.round(video.videoHeight*c.width/video.videoWidth);
  c.getContext("2d",{willReadFrequently:true}).drawImage(video,0,0,c.width,c.height);
  return c;
 }
 async function qrCode(){
  // Decode the QR using Android's native detector directly on the video
  // before copying pixels. Use a smaller canvas for the JS fallback.
  let c=null;
  if(s.qrReader){
   try{
    const codes=await s.qrReader.detect(video);
    for(const code of codes){
      if(markerFromUrl(code.rawValue))return {raw:code.rawValue,points:code.cornerPoints,width:video.videoWidth,height:video.videoHeight};
      if(code.rawValue?.trim())s.lastScannedQr=code.rawValue.trim();
    }
   }catch{ /* fall back to jsQR */ }
  }
  c=screenshot(900);
  const context=c.getContext("2d",{willReadFrequently:true});
  // Fast path: the child already points the QR into the green guide.
  // Search its center first; expensive wide crops are fallback only.
  const crops=[[.21,.17,.58,.65],[0,0,1,1],[0,0,.5,.5],[.5,0,.5,.5],[0,.5,.5,.5],[.5,.5,.5,.5]];
  // Camera QR can be small. Upscale focused crops with nearest-neighbour
  // contrast-preserving pixels; never send a camera frame to a server.
  for(const [rx,ry,rw,rh] of crops){
   const x=Math.round(c.width*rx),y=Math.round(c.height*ry),w=Math.floor(c.width*rw),h=Math.floor(c.height*rh);
   const data=context.getImageData(x,y,w,h);
   const samples=[{pixels:data.data,w,h,scale:1}];
   if(rw<1&&w*h<190000){
    const scale=2;
    const big=new Uint8ClampedArray(w*h*4*scale*scale);
    for(let row=0;row<h*scale;row++)for(let col=0;col<w*scale;col++){
     const i=(Math.floor(row/scale)*w+Math.floor(col/scale))*4,j=(row*w*scale+col)*4;
     const v=(data.data[i]+data.data[i+1]+data.data[i+2])/3>170?255:0;
     big[j]=big[j+1]=big[j+2]=v;big[j+3]=255;
    }
    samples.push({pixels:big,w:w*scale,h:h*scale,scale});
   }
   for(const sample of samples){
    const decoded=jsQR(sample.pixels,sample.w,sample.h,{inversionAttempts:"attemptBoth"});
    if(!decoded)continue;
    if(!markerFromUrl(decoded.data)){s.lastScannedQr=decoded.data;continue}
    const l=decoded.location;
    return {raw:decoded.data,points:[l.topLeftCorner,l.topRightCorner,l.bottomRightCorner,l.bottomLeftCorner].map(p=>({x:p.x/sample.scale+x,y:p.y/sample.scale+y})),width:c.width,height:c.height};
   }
  }
  return null;
 }
 async function lockFromQR(q){
  const marker=markerFromUrl(q.raw);
  if(!marker)return;
  const page=s.manifest?.pages?.[marker.page];
  if(!page)return announce("تم مسح QR، لكن تسجيلات هذه الصفحة غير متاحة في النسخة التجريبية.");
  s.page={pdfPage:marker.page,printedPage:page.printedPage};
  showPhase("point");
  s.lockedH=null;
  s.lastAligned=0;s.alignFails=0;s.alignStreak=0;s.lastCandidate=null;
  const currentRun=s.run;
  confirmQR(page.printedPage);
  onPage({page:marker.page,printedPage:page.printedPage});
  s.matcher=new VisualPageMatcher();
  // Do not block finger model initialization on reference-image descriptors.
  // Both heavy modules begin after QR confirmation in parallel.
  const matcher=s.matcher;
  matcher.init([[marker.page,url(page.image)]])
   .catch(e=>{if(currentRun===s.run)announce("تعذر تجهيز صورة الصفحة: "+e.message)});
  initializeHand(currentRun);
  // Warm audio asynchronously so a selected letter does not wait on its MP3.
  prefetchPageAudio(currentRun,marker.page);
 }
 async function prefetchPageAudio(run,pageNumber){
  const zones=s.manifest?.pages?.[pageNumber]?.zones||[];
  const clips=zones.map(z=>s.manifest?.segments?.[z.id]?.clip).filter(Boolean);
  let index=0;
  async function worker(){
   while(index<clips.length&&s.run===run&&s.page?.pdfPage===pageNumber){
    const path=clips[index++],uri=url(path);
    if(s.audioCache.has(uri))continue;
    try{
     const response=await fetch(uri);
     if(!response.ok)continue;
     const data=await response.arrayBuffer();
     if(s.run!==run)return;
     s.audioCache.set(uri,await s.audioContext.decodeAudioData(data));
    }catch{/* Skip missing assets; say() handles error upon selection */}
   }
  }
  await Promise.all(Array.from({length:2},worker));
 }
 async function initializeHand(run){
  try{
   const fs=await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm");
   const task=await HandLandmarker.createFromOptions(fs,{baseOptions:{modelAssetPath:"https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",delegate:"CPU"},runningMode:"VIDEO",numHands:1,minHandDetectionConfidence:.55});
   if(run!==s.run){task.close();return}
   s.tracker=task;
   announce(s.lockedH?"الصفحة "+s.page.printedPage+" جاهزة. أشر إلى الحرف.":"تعقب الإصبع جاهز. وجّه الكاميرا إلى الصفحة كاملة حتى تُحدَّد مواقع الحروف.");
  }catch(e){if(run===s.run)announce("تم تحديد الصفحة، لكن تعذر تجهيز تتبع الإصبع: "+e.message)}
 }
 async function scan(){
  if(s.scanning||s.phase!=="scan")return;
  s.scanning=true;
  try{
   const q=await qrCode();
   if(!q){if(s.phase==="scan"&&s.lastScannedQr)announce("قُرئ رمز QR لكن لم يطابق الصفحات المجهزة. جرّب صفحة 15 أو 16 أو 17.");return;}
   if(s.phase==="scan")await lockFromQR(q);
   else if(s.phase==="point"&&markerFromUrl(q.raw)?.page===s.page.pdfPage){
    const aligned=markerGeometry(q.raw,q.points,q.width,q.height);
    if(aligned){
     const pts=q.points||[];
     const spanX=Math.max(...pts.map(p=>p.x))-Math.min(...pts.map(p=>p.x));
     if(spanX/q.width<.13){s.lockedH=aligned.H;s.lastAligned=performance.now()}
    }
   }
  }catch(e){announce("تعذر التعرف على رمز الصفحة: "+e.message)}
  finally{s.scanning=false}
 }
 function acceptPose(result,now,fromTracking=false){
  if(!result||result.page&&result.page!==s.page?.pdfPage)return false;
  const previous=s.lockedH;
  const wasReady=!!previous&&now-s.lastAligned<1450;
  const agreed=!!previous&&geometryAgrees({H:previous},result,.10);
  if(previous&&agreed){
   // Follow deliberate handheld motion: 90% new geometry, 10% jitter filter.
   s.lockedH=result.H.map((v,i)=>.90*v+.10*previous[i]);
  }else s.lockedH=result.H;
  s.lastAligned=now;
  if(!wasReady&&s.audioState!=="loading"&&s.audioState!=="playing"){
   announce(s.tracker?"الصفحة جاهزة. أشر إلى الحرف.":"تم التعرف على الصفحة، وجارٍ تجهيز قراءة الحروف.");
  }
  return true;
 }
 function align(){
  if(s.phase!=="point"||s.matching||!s.matcher||!video.videoWidth)return;
  s.matching=true;
  try{
   const now=performance.now(),frame=screenshot(800);
   // Fast optical flow is preferred over full ORB re-matching. It tracks
   // remaining page features while fingers temporarily cover other areas.
   if(s.temporal.previous){
    const t=performance.now(),tracked=s.temporal.update(frame);
    s.flowMs=performance.now()-t;
    if(tracked){
     acceptPose({...tracked,page:s.page.pdfPage},performance.now(),true);
     if(now-s.lastFullMatch<4500)return;
    }
   }
   const fullStart=performance.now();
   const result=s.matcher.detect(frame);
   s.lastFullMs=performance.now()-fullStart;
   s.lastFullMatch=performance.now();
   const valid=reliableMatch(result,s.page.pdfPage);
   const strong=strongMovingMatch(result,s.page.pdfPage);
   if(valid){
    const consistent=!!s.lastCandidate&&now-s.lastCandidateAt<2200&&geometryAgrees(result,s.lastCandidate,.1);
    s.alignStreak=consistent?s.alignStreak+1:1;
    s.lastCandidate=result;s.lastCandidateAt=now;
    if(strong||s.alignStreak>=2){
     acceptPose(result,performance.now());
     s.temporal.seed(frame,result);
     s.alignFails=0;
    }
   }else{
    // Page ID remains known after a hand occludes the QR/letters. Do not
    // return to scanning state. Optical flow / ORB reacquire automatically.
    s.alignStreak=0;
    s.alignFails++;
    if(performance.now()-s.alignReportAt>3500&&performance.now()-s.lastAligned>1800){
     s.alignReportAt=performance.now();
     announce("الصفحة محفوظة. أظهر جزءًا أكبر من الحروف حتى يستعيد التطبيق موضعها تلقائيًا، دون مسح QR مرة أخرى.");
    }
   }
  }catch(e){
   if(performance.now()-s.alignReportAt>3500){
    s.alignReportAt=performance.now();
    announce("جارٍ استعادة تتبع الصفحة: "+e.message);
   }
  }finally{s.matching=false}
 }
 function detectFinger(t){
  if(!s.tracker||!s.lockedH||t-s.lastAligned>1450)return;
  const results=s.tracker.detectForVideo(video,t);
  const tip=results.landmarks?.[0]?.[8];
  if(!tip){
   s.fingerVisible=false;s.fingerZone=null;
   s.seen=null;
   // A child may lift the finger and point at the SAME letter again.
   if(t-s.lastFingerSeen>330)s.lastZone=null;
   if(t-s.lastFingerHint>2500&&t-s.lastFingerSeen>1200){
    s.lastFingerHint=t;announce("الصفحة جاهزة، لكن الإصبع غير ظاهر للكاميرا. أظهر يدك والإصبع داخل الصورة.");
   }
   return;
  }
  s.fingerVisible=true;s.lastFingerSeen=t;
  const x=tip.x*canvas.width,y=tip.y*canvas.height;
  ctx.beginPath();ctx.arc(x,y,12,0,Math.PI*2);
  ctx.fillStyle="#36dd91";ctx.fill();ctx.lineWidth=3;ctx.strokeStyle="#fff";ctx.stroke();
  const p=project(s.lockedH,{x:tip.x,y:tip.y});
  const page=s.manifest?.pages?.[s.page.pdfPage];
  const zone=p&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1&&closestZone(p,page?.zones||[]);
  if(!zone){
   s.fingerZone=null;s.seen=null;
   if(!s.lastZoneLostAt)s.lastZoneLostAt=t;
   if(t-s.lastZoneLostAt>340)s.lastZone=null;
   if(t-s.lastFingerHint>2200){s.lastFingerHint=t;announce("رصدت الإصبع. وجّه طرفه إلى أحد مربعات الحروف.");}
   return;
  }
  s.fingerZone=zone.id;s.lastZoneLostAt=0;
  // Display visible positive feedback BEFORE audio starts.
  if(s.seen!==zone.id){s.seen=zone.id;s.seenAt=t;announce("تم تحديد: "+(zone.spokenText||zone.text));return}
  // Faster dwell for a moving child's hand. Requires 2 sampled frames, while
  // a short cooldown protects against repetitive activation.
  if(t-s.seenAt<175||s.lastZone===zone.id||t<s.coolUntil)return;
  s.lastZone=zone.id;s.coolUntil=t+450;
  announce("جارٍ نطق: "+(zone.spokenText||zone.text));
  say(zone);
 }

 function loop(t){
  if(s.phase==="idle")return;
  if(canvas.width!==video.videoWidth&&video.videoWidth)resize();
  ctx.clearRect(0,0,canvas.width,canvas.height);
  if(video.readyState>=2&&video.videoWidth){
   // Critical on low-powered Android devices: QR detection is CPU-heavy.
   // After scanning QR once, never run jsQR repeatedly while tracking a finger.
   if(s.phase==="scan"&&t-s.lastScan>420){s.lastScan=t;scan()}
   // Prioritize hand detection over expensive page feature matching.
   if(s.phase==="point"&&s.tracker&&t-s.lastFinger>125){s.lastFinger=t;try{detectFinger(t)}catch(e){if(t-s.lastFingerHint>2000){s.lastFingerHint=t;announce("تتبع الإصبع غير متاح: "+e.message)}}}
   if(s.phase==="point"&&t-s.lastMatch>(s.temporal.previous?190:650)){s.lastMatch=t;align()}
   if(s.phase==="point"&&s.lastAligned&&t-s.lastAligned>2600){
    announce("وجّه الكاميرا إلى الصفحة كاملة لتحديد الحروف بدقة.");
   }
  }
  s.loopId=requestAnimationFrame(loop);
 }
 async function start(){
  if(s.isDestroyed||s.stream)return;
  const run=++s.run;
  showPhase("scan");resetPage();s.lastScannedQr="";
  startButton.hidden=true;stopButton.hidden=false;
  announce("قرّب رمز QR داخل الإطار حتى يظهر تأكيد قراءة الرمز. جرّب الصفحة 15 أولًا.");
  try{
   if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia)throw Error("الكاميرا تحتاج HTTPS وإذن الوصول.");
   // Audio playback is unlocked while the original button gesture is active.
   await unlockAudio();
   if(!s.manifest){const m=await fetch(url("data/pilot-audio.json"));if(!m.ok)throw Error("تعذر تحميل فهرس الصفحات");s.manifest=await m.json();}
   const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"},width:{ideal:1920},height:{ideal:1080}},audio:false});
   if(run!==s.run){stream.getTracks().forEach(t=>t.stop());return}
   s.stream=stream;video.srcObject=stream;await video.play();
   try{
    const track=stream.getVideoTracks()[0];
    const capabilities=track?.getCapabilities?.();
    const advanced={};
    if(capabilities?.focusMode?.includes("continuous"))advanced.focusMode="continuous";
    if(capabilities?.zoom?.max>=1.3)advanced.zoom=Math.min(capabilities.zoom.max,1.6);
    if(Object.keys(advanced).length)await track.applyConstraints({advanced:[advanced]}).catch(()=>{});
   }catch{}
   try{
    const fmt=window.BarcodeDetector?.getSupportedFormats?await window.BarcodeDetector.getSupportedFormats():[];
    if(fmt.includes("qr_code"))s.qrReader=new window.BarcodeDetector({formats:["qr_code"]});
   }catch{}
   resize();s.loopId=requestAnimationFrame(loop);
  }catch(e){
   announce(e.name==="NotAllowedError"?"اسمح للتطبيق باستخدام الكاميرا من إعدادات الموقع ثم أعد المحاولة.":"تعذر تشغيل الكاميرا: "+e.message);
   stop(false);
  }
 }
 function stop(display=true){
  ++s.run;cancelAnimationFrame(s.loopId);s.loopId=0;
  s.stream?.getTracks().forEach(t=>t.stop());s.stream=null;video.srcObject=null;
  s.tracker?.close?.();s.tracker=null;s.qrReader=null;
  resetPage();showPhase("idle");clearAudio();
  startButton.hidden=false;stopButton.hidden=true;
  if(display)announce("الكاميرا متوقفة. اضغط تشغيل الكاميرا للبدء.");
 }
 async function destroy(){
  stop(false);s.isDestroyed=true;
  try{await s.audioContext?.close()}catch{}
  ui.remove();
 }
 startButton.addEventListener("click",start);
 stopButton.addEventListener("click",()=>stop());
 return {start,stop,destroy,selectFromQr:async raw=>{if(!s.stream)await start();if(s.phase==="scan")await lockFromQR({raw})},element:ui,getStatus:()=>({phase:s.phase,page:s.page,aligned:!!s.lockedH&&performance.now()-s.lastAligned<1450,handReady:!!s.tracker,tracking:s.temporal.previous?"optical-flow":"reacquiring",flowMs:Math.round(s.flowMs),fullMs:Math.round(s.lastFullMs),fingerVisible:s.fingerVisible,fingerZone:s.fingerZone,audioState:s.audioState,matchingFrames:s.alignStreak})};
}
