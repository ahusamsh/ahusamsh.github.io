import {VisualTracker} from './visual-tracker.js';
import {PointerIntent} from './pointer-intent.js';
import {closestZone,project} from './core.js';
export function createCamera({getPages,onPage,onTarget,onLost,unlockAudio,warmPage}){
 const $=id=>document.getElementById(id),video=$('video'),overlay=$('camera-overlay'),ctx=overlay.getContext('2d'),intent=new PointerIntent();
 let run=0,stream=null,vision=null,hand=null,frame=0,match=null,lastScan=0,lastSeen=0,candidate=null,count=0,lastHand=0,lastVideoTime=-1,handInterval=65,tip=null,zone=null,starting=false,torch=false;
 const say=(text,error=false)=>{$('camera-hint').textContent=text;$('camera-hint').dataset.error=String(error)};
 const lose=()=>{if(match)onLost();match=null;zone=null;tip=null;intent.reset();$('camera-stage').dataset.page=''};
 function stop(){run++;starting=false;cancelAnimationFrame(frame);vision?.dispose();vision=null;hand?.close();hand=null;stream?.getTracks().forEach(t=>t.stop());stream=null;video.pause();video.srcObject=null;lose();onLost();candidate=null;count=0;lastVideoTime=-1;$('camera-stage').dataset.cameraState='idle';$('camera-placeholder').hidden=false;$('camera-placeholder').textContent='اضغط تشغيل الكاميرا ليبدأ التعرّف والقراءة.';$('camera-on').disabled=false;$('camera-off').disabled=true;$('camera-torch').hidden=true;torch=false;ctx.clearRect(0,0,overlay.width,overlay.height);say('الكاميرا متوقفة.')}
 function accept(result,captured){
  if(!result||performance.now()-captured>900){candidate=null;count=0;lose();const q=vision?.quality;say(q?.dark?'الإضاءة منخفضة؛ أضئ الصفحة أو استخدم زر الإضاءة إن ظهر.':q?.lowContrast?'الصورة منخفضة التباين؛ قرّب الصفحة قليلًا وأبعد الانعكاس عنها.':'أظهر صفحة واحدة بوضوح وثبّت الجوال لحظة. الصفحات المجهزة للكاميرا 15–17.');return}
  if(candidate!==result.page){candidate=result.page;count=1;lose();return}count++;
  if(count<2)return;
  const changed=match?.page!==result.page,moved=match&&Math.max(...result.corners.map((p,i)=>Math.hypot(p.x-match.corners[i].x,p.y-match.corners[i].y)))>.035;
  if(changed||moved){intent.reset();onLost();zone=null}
  match=result;lastSeen=captured;onPage(Number(result.page));$('camera-stage').dataset.page=result.page;
  if(changed){warmPage(result.page);say('تعرّفت على الصفحة '+getPages()[result.page].printedPage+'. أشر إلى الحرف للاستماع.')}
 }
 function loop(now){
  if(!stream)return;
  if(video.readyState>=2){
   if(overlay.width!==video.videoWidth||overlay.height!==video.videoHeight){overlay.width=video.videoWidth;overlay.height=video.videoHeight;lose();candidate=null;count=0}
   if(vision?.ready&&!vision.pending&&now-lastScan>Math.max(170,Math.min(350,vision.averageMs*1.1))){const session=run,captured=performance.now(),currentVision=vision;lastScan=now;currentVision.detect(video).then(result=>{if(session===run&&vision===currentVision)accept(result,captured)}).catch(()=>{if(session===run){lose();say('تعذّر تحليل الصورة. أعد تشغيل الكاميرا.',true)}})}
   if(match&&now-lastSeen>900){lose();candidate=null;count=0}
   if(hand&&now-lastHand>handInterval&&video.currentTime!==lastVideoTime){lastHand=now;lastVideoTime=video.currentTime;const begin=performance.now();try{
    const result=hand.detectForVideo(video,now);tip=result.landmarks?.[0]?.[8]||null;
    const point=match&&tip&&vision.pointInPage(match,tip);zone=point&&closestZone(point,getPages()[match.page]?.zones||[]);
    const target=intent.update(zone,point,now);if(target){onTarget(target);say('صفحة '+getPages()[match.page].printedPage+' — '+(target.spokenText||target.text))}
   }catch{tip=null;zone=null;intent.update(null,null,now)}handInterval=Math.max(65,Math.min(130,(performance.now()-begin)*1.5))}
  }
  ctx.clearRect(0,0,overlay.width,overlay.height);
  if(match){ctx.beginPath();match.corners.forEach((p,i)=>i?ctx.lineTo(p.x*overlay.width,p.y*overlay.height):ctx.moveTo(p.x*overlay.width,p.y*overlay.height));ctx.closePath();ctx.lineWidth=3;ctx.strokeStyle='#1de2a0';ctx.stroke();if(zone){const[x,y,w,h]=zone.box;ctx.beginPath();[[x,y],[x+w,y],[x+w,y+h],[x,y+h]].forEach(([x,y],i)=>{const p=project(match.inverse,{x,y});i?ctx.lineTo(p.x*overlay.width,p.y*overlay.height):ctx.moveTo(p.x*overlay.width,p.y*overlay.height)});ctx.closePath();ctx.fillStyle='#ffd05977';ctx.fill()}}
  if(tip){ctx.beginPath();ctx.arc(tip.x*overlay.width,tip.y*overlay.height,9,0,Math.PI*2);ctx.fillStyle='#ffd059';ctx.fill()}
  frame=requestAnimationFrame(loop);
 }
 async function start(){
  if(starting||stream)return;starting=true;const session=++run;unlockAudio();$('camera-on').disabled=true;$('camera-off').disabled=false;$('camera-stage').dataset.cameraState='loading';$('camera-placeholder').hidden=false;$('camera-placeholder').textContent='اسمح باستخدام الكاميرا لبدء القراءة.';
  if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia){starting=false;$('camera-on').disabled=false;$('camera-stage').dataset.cameraState='error';$('camera-placeholder').textContent='افتح الرابط الآمن مباشرة في Chrome أو متصفح يدعم الكاميرا.';return}
  try{
   const result=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:960},frameRate:{ideal:30,max:30}},audio:false});
   if(session!==run){result.getTracks().forEach(t=>t.stop());return}stream=result;video.srcObject=stream;await video.play();if(session!==run)return;starting=false;$('camera-placeholder').hidden=true;$('camera-stage').dataset.cameraState='ready';lastScan=0;lastHand=0;frame=requestAnimationFrame(loop);
   const track=stream.getVideoTracks()[0],cap=track.getCapabilities?.()||{};track.addEventListener('ended',()=>{if(session===run)stop()});$('camera-torch').hidden=!cap.torch;
   // Request continuous focus/exposure only where the camera advertises support.
   const advanced={};if(cap.focusMode?.includes('continuous'))advanced.focusMode='continuous';if(cap.exposureMode?.includes('continuous'))advanced.exposureMode='continuous';if(Object.keys(advanced).length)track.applyConstraints({advanced:[advanced]}).catch(()=>{});
   say('جارٍ تجهيز القراءة. تُحفظ أدوات الرؤية على الجهاز لتسريع الاستخدام التالي.');vision=new VisualTracker();const recognition=vision.init(getPages());
   const hands=(async()=>{const{FilesetResolver,HandLandmarker}=await import('@mediapipe/tasks-vision');const resolver=await FilesetResolver.forVisionTasks(new URL('./vision/wasm',document.baseURI).href);if(session!==run)return;let task;const options={baseOptions:{modelAssetPath:new URL('./vision/hand_landmarker.task',document.baseURI).href,delegate:'GPU'},runningMode:'VIDEO',numHands:1,minHandDetectionConfidence:.55,minHandPresenceConfidence:.55,minTrackingConfidence:.55};try{task=await HandLandmarker.createFromOptions(resolver,options)}catch{if(session!==run)return;options.baseOptions.delegate='CPU';task=await HandLandmarker.createFromOptions(resolver,options)}if(session!==run){task.close();return}hand=task})();
   const settled=await Promise.allSettled([recognition,hands]);if(session!==run)return;if(settled.some(r=>r.status==='rejected'))say('تعذّر تجهيز القراءة التلقائية. تحقق من الإنترنت ثم أعد تشغيل الكاميرا.',true);else{warmPage(match?.page||17);if(!match)say('جاهز؛ وجّه الكاميرا إلى الصفحة ثم أشر إلى الحرف.')}
  }catch(e){if(session!==run)return;stop();$('camera-stage').dataset.cameraState='error';const msg=({NotAllowedError:'الكاميرا مرفوضة. اسمح لهذا الموقع وللمتصفح باستخدام الكاميرا في إعدادات الجوال.',NotFoundError:'لم يعثر المتصفح على كاميرا متاحة.',NotReadableError:'الكاميرا مشغولة؛ أغلق أي تطبيق آخر يستخدمها ثم أعد المحاولة.'})[e.name]||'تعذّر تشغيل الكاميرا. افتح الرابط في المتصفح وأعد المحاولة.';$('camera-placeholder').textContent=msg;say(msg,true)}
 }
 $('camera-torch').onclick=async()=>{const track=stream?.getVideoTracks()[0];if(!track)return;try{await track.applyConstraints({advanced:[{torch:!torch}]});torch=!torch;$('camera-torch').textContent=torch?'إطفاء الإضاءة':'إضاءة الصفحة'}catch{say('تعذّر تغيير إضاءة الكاميرا؛ استخدم إضاءة الغرفة.',true)}};
 $('camera-on').onclick=start;$('camera-off').onclick=stop;window.addEventListener('pagehide',stop);document.addEventListener('visibilitychange',()=>{if(document.hidden)stop()});
 return{start,stop};
}
