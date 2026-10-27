import jsQR from "jsqr";
import {FilesetResolver,HandLandmarker} from "@mediapipe/tasks-vision";
import {markerFromUrl,markerGeometry} from "./page-vision.js";
import {VisualPageMatcher} from "./visual-matcher.js";
import {closestZone,project} from "./core.js";
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
 const s={stream:null,run:0,phase:"idle",page:null,manifest:null,matcher:null,tracker:null,lockedH:null,lastAligned:0,qrReader:null,qrCanvas:document.createElement("canvas"),scanning:false,matching:false,lastScan:0,lastMatch:0,lastFinger:0,seen:null,seenAt:0,lastZone:null,coolUntil:0,audioContext:null,audioCache:new Map(),audioSource:null,loopId:0,lastStatus:"",lastScannedQr:"",isDestroyed:false};
 const announce=(text)=>{if(s.lastStatus!==text){s.lastStatus=text;message.textContent=text;onStatus(text)}};
 function showPhase(next){s.phase=next;focusGuide.hidden=next!=="scan";ui.dataset.phase=next;}
 function confirmQR(page){try{navigator.vibrate?.(110)}catch{}announce("تم مسح الرمز! الصفحة "+page+". أبعد الهاتف حتى تظهر الصفحة كاملة ثم أشر إلى الحرف.");}
 function clearAudio(){try{s.audioSource?.stop()}catch{}s.audioSource=null}
 function resetPage(){s.page=null;s.lockedH=null;s.lastAligned=0;s.matcher?.dispose();s.matcher=null;s.seen=null;s.lastZone=null;}
 async function unlockAudio(){
  const A=window.AudioContext||window.webkitAudioContext;
  if(A){s.audioContext??=new A();await s.audioContext.resume()}
 }
 async function say(zone){
  const a=s.manifest?.segments?.[zone.id];
  if(!a?.clip){announce("لا يوجد صوت لهذا الحرف بعد.");return}
  const sourceUrl=url(a.clip);
  try{
   let buffer=s.audioCache.get(sourceUrl);
   if(!buffer){
    const response=await fetch(sourceUrl);
    if(!response.ok)throw Error("HTTP "+response.status);
    buffer=await s.audioContext.decodeAudioData(await response.arrayBuffer());
    s.audioCache.set(sourceUrl,buffer);
   }
   if(s.phase!=="point"||s.lastZone!==zone.id)return;
   clearAudio();
   const node=s.audioContext.createBufferSource();
   node.buffer=buffer;node.connect(s.audioContext.destination);node.start();s.audioSource=node;
   onWord({page:s.page.pdfPage,printedPage:s.page.printedPage,zoneId:zone.id,text:zone.spokenText||zone.text});
   announce("الصفحة "+s.page.printedPage+" — "+(zone.spokenText||zone.text));
  }catch(e){announce("تعذر تشغيل الصوت: "+e.message)}
 }
 function resize(){if(!video.videoWidth)return;canvas.width=video.videoWidth;canvas.height=video.videoHeight;}
 function screenshot(width=1000){
  const c=s.qrCanvas;c.width=Math.min(width,video.videoWidth);c.height=Math.round(video.videoHeight*c.width/video.videoWidth);
  c.getContext("2d",{willReadFrequently:true}).drawImage(video,0,0,c.width,c.height);
  return c;
 }
 async function qrCode(){
  const c=screenshot(1152);
  if(s.qrReader){
   try{
    const codes=await s.qrReader.detect(c);
    for(const code of codes){
      if(markerFromUrl(code.rawValue))return {raw:code.rawValue,points:code.cornerPoints,width:c.width,height:c.height};
      if(code.rawValue?.trim())s.lastScannedQr=code.rawValue.trim();
    }
   }catch{ /* fall back to jsQR */ }
  }
  const context=c.getContext("2d",{willReadFrequently:true});
  const crops=[[0,0,1,1],[.18,.12,.64,.72],[0,0,.5,.5],[.5,0,.5,.5],[0,.5,.5,.5],[.5,.5,.5,.5]];
  // Camera QR can be small. Upscale focused crops with nearest-neighbour
  // contrast-preserving pixels; never send a camera frame to a server.
  for(const [rx,ry,rw,rh] of crops){
   const x=Math.round(c.width*rx),y=Math.round(c.height*ry),w=Math.floor(c.width*rw),h=Math.floor(c.height*rh);
   const data=context.getImageData(x,y,w,h);
   const samples=[{pixels:data.data,w,h,scale:1}];
   if(rw<1){
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
  s.lastAligned=0;
  const currentRun=s.run;
  confirmQR(page.printedPage);
  onPage({page:marker.page,printedPage:page.printedPage});
  s.matcher=new VisualPageMatcher();
  try{await s.matcher.init([[marker.page,url(page.image)]])}
  catch(e){announce("تم تحديد الصفحة؛ تعذر تهيئة التتبع البصري: "+e.message)}
  if(currentRun!==s.run)return;
  // A QR scanned close-up identifies the page but does NOT locate all its
  // letters. Wait for a wide view and a new geometric alignment.
  s.lockedH=null;s.lastAligned=0;
  initializeHand(currentRun);
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
  if(s.scanning||s.phase==="idle")return;
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
 async function align(){
  if(s.phase!=="point"||s.matching||!s.matcher)return;
  s.matching=true;
  try{
   const result=s.matcher.detect(screenshot(1100));
   if(result&&result.page===s.page.pdfPage&&result.visual>=.52&&result.inliers>=22){
    // VisualPageMatcher maps normalized frame -> normalized printed page.
    s.lockedH=result.H;
    s.lastAligned=performance.now();
    announce("الصفحة "+s.page.printedPage+" جاهزة. أشر إلى الحرف.");
   }
  }catch(e){}finally{s.matching=false}
 }
 function detectFinger(t){
  if(!s.tracker||!s.lockedH||t-s.lastAligned>2300)return;
  const results=s.tracker.detectForVideo(video,t);
  const tip=results.landmarks?.[0]?.[8];
  if(!tip){s.seen=null;s.lastZone=null;return}
  const x=tip.x*canvas.width,y=tip.y*canvas.height;
  ctx.beginPath();ctx.arc(x,y,12,0,Math.PI*2);ctx.fillStyle="#36dd91";ctx.fill();ctx.lineWidth=3;ctx.strokeStyle="#fff";ctx.stroke();
  const p=project(s.lockedH,{x:tip.x,y:tip.y});
  const page=s.manifest?.pages?.[s.page.pdfPage];
  const zone=p&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1&&closestZone(p,page?.zones||[]);
  if(!zone){s.seen=null;s.lastZone=null;return}
  if(s.seen!==zone.id){s.seen=zone.id;s.seenAt=t;return}
  if(t-s.seenAt<460||s.lastZone===zone.id||t<s.coolUntil)return;
  s.lastZone=zone.id;s.coolUntil=t+500;say(zone);
 }
 function loop(t){
  if(s.phase==="idle")return;
  if(canvas.width!==video.videoWidth&&video.videoWidth)resize();
  ctx.clearRect(0,0,canvas.width,canvas.height);
  if(video.readyState>=2&&video.videoWidth){
   if((s.phase==="scan"||s.phase==="point")&&t-s.lastScan>420){s.lastScan=t;scan()}
   if(s.phase==="point"&&t-s.lastMatch>720){s.lastMatch=t;align()}
   if(s.phase==="point"&&s.lastAligned&&t-s.lastAligned>2300){
    announce("ثبّت الهاتف حتى تظهر الصفحة كاملة ويستطيع التطبيق تحديد الحروف بدقة.");
   }
   if(s.phase==="point"&&s.tracker&&t-s.lastFinger>110){s.lastFinger=t;try{detectFinger(t)}catch(e){}}
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
 return {start,stop,destroy,selectFromQr:async raw=>{if(!s.stream)await start();if(s.phase==="scan")await lockFromQR({raw})},element:ui,getStatus:()=>({phase:s.phase,page:s.page,aligned:!!s.lockedH&&performance.now()-s.lastAligned<2300,handReady:!!s.tracker})};
}
