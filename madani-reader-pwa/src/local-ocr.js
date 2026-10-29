// Experimental local Arabic OCR; does not infer audio from printed page coordinates.
// ONNX models: PP-OCRv5 Arabic Mobile under Apache-2.0.
// Decode text boxes independently anywhere in a partially visible camera frame.
const MODEL_ROOT="https://huggingface.co/vladadu/pp-ocrv5-arabic-mobile-onnx/resolve/main/";
const WASM_ROOT="https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.2/dist/";
const DET="PP-OCRv5_mobile_det.onnx", REC="arabic_PP-OCRv5_mobile_rec.onnx",DICT="arabic_PP-OCRv5_mobile_rec_dict.txt";
const W=160,H=48;
export function canonicalArabic(t){
 return String(t||"").normalize("NFC").replace(/[\u064B-\u065F\u0670\u0640]/g,"")
  .replace(/[أإآٱ]/g,"ا").replace(/[ى]/g,"ي").replace(/[ة]/g,"ه").trim();
}
export function uniqueTextCandidates(results,minConfidence=.80){
 return results.filter(r=>r.text&&r.confidence>=minConfidence);
}
export function chooseNearbyOCR(boxes,tip,allowed,{radius=.032,margin=.35}={}){
 if(!tip)return null;
 const accepted=boxes.filter(r=>r.confidence>=.80&&allowed.has(canonicalArabic(r.text)));
 const candidates=accepted.map(r=>{
  const [x,y,w,h]=r.box;
  const dx=Math.max(x-tip.x,tip.x-(x+w),0),dy=Math.max(y-tip.y,tip.y-(y+h),0);
  const d=Math.hypot(dx,dy);
  return {...r,d};
 }).sort((a,b)=>a.d-b.d);
 if(!candidates.length||candidates[0].d>radius)return null;
 if(candidates.length>1&&candidates[1].d-candidates[0].d<margin*radius)return null;
 return candidates[0];
}
function canvasPixels(image,width,height){
 const c=document.createElement("canvas");c.width=width;c.height=height;
 const ctx=c.getContext("2d",{willReadFrequently:true});
 ctx.fillStyle="#fff";ctx.fillRect(0,0,width,height);
 ctx.drawImage(image,0,0,width,height);
 return ctx.getImageData(0,0,width,height).data;
}
function tensorize(pixels,width,height,normalize){
 const plane=width*height,values=new Float32Array(plane*3);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const p=y*width+x,i=p*4;
  for(let ch=0;ch<3;ch++){
   const z=pixels[i+ch]/255;
   values[ch*plane+p]=normalize==="rec"?z*2-1:(z-[.485,.456,.406][ch])/[.229,.224,.225][ch];
  }
 }
 return values;
}
export function detectionBoxes(prob,width,height,sourceWidth,sourceHeight,threshold=.23){
 const mask=new Uint8Array(width*height),visited=new Uint8Array(width*height);
 for(let i=0;i<prob.length;i++)mask[i]=prob[i]>threshold?1:0;
 const out=[],stack=[];
 for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
  const start=y*width+x;
  if(!mask[start]||visited[start])continue;
  let left=x,right=x,top=y,bottom=y,area=0;
  stack.push(start);visited[start]=1;
  while(stack.length){
   const i=stack.pop(),cx=i%width,cy=Math.floor(i/width);
   area++;left=Math.min(left,cx);right=Math.max(right,cx);
   top=Math.min(top,cy);bottom=Math.max(bottom,cy);
   for(const next of [i-1,i+1,i-width,i+width]){
    if(next<0||next>=mask.length||visited[next]||!mask[next])continue;
    const xx=next%width,yy=Math.floor(next/width);
    if(Math.abs(xx-cx)+Math.abs(yy-cy)!==1)continue;
    visited[next]=1;stack.push(next);
   }
  }
  if(area<8||right-left<2||bottom-top<3)continue;
  const scaleX=sourceWidth/width,scaleY=sourceHeight/height;
  const px=left*scaleX,py=top*scaleY,w=(right-left+1)*scaleX,h=(bottom-top+1)*scaleY;
  if(w<3||h<5||w>sourceWidth*.65||h>sourceHeight*.18)continue;
  out.push([px,py,w,h]);
 }
 return out;
}
function preprocessRec(img,box){
 const [x,y,w,h]=box;
 const insetX=Math.max(3,w*.18),insetY=Math.max(4,h*.22);
 const sx=Math.max(0,x-insetX),sy=Math.max(0,y-insetY);
 const sw=Math.min(img.width-sx,w+2*insetX),sh=Math.min(img.height-sy,h+2*insetY);
 const factor=Math.min(H/sh,W/sw),tw=Math.max(1,Math.floor(sw*factor)),th=Math.max(1,Math.floor(sh*factor));
 const c=document.createElement("canvas");c.width=W;c.height=H;
 const ctx=c.getContext("2d",{willReadFrequently:true});
 ctx.fillStyle="rgb(128,128,128)";ctx.fillRect(0,0,W,H);
 ctx.drawImage(img,sx,sy,sw,sh,0,0,tw,th);
 return tensorize(ctx.getImageData(0,0,W,H).data,W,H,"rec");
}
export function decodeCTC(output,names,time,classes,dictionary){
 const predictions=[];
 for(let b=0;b<names;b++){
  let prev=0,text="",score=0,count=0;
  for(let t=0;t<time;t++){
   const start=(b*time+t)*classes;
   let k=0,p=-Infinity;
   for(let j=0;j<classes;j++)if(output[start+j]>p){p=output[start+j];k=j}
   if(k!==prev&&k>0&&k<dictionary.length){
    text+=dictionary[k];score+=p;count++;
   }
   prev=k;
  }
  predictions.push({text,confidence:count?score/count:0});
 }
 return predictions;
}
export class ArabicLocalOCR{
 constructor(){this.loaded=false;this.last=null;this.lastDuration=0}
 async init(){
  if(this.loaded)return;
  const ort=await import("onnxruntime-web/wasm");
  ort.env.wasm.numThreads=1;
  ort.env.wasm.wasmPaths=WASM_ROOT;
  const dictionary=(await (await fetch(MODEL_ROOT+DICT)).text()).replace(/\r/g,"").trimEnd().split("\n");
  this.dictionary=["",...dictionary," "];
  const [det,rec]=await Promise.all([
   ort.InferenceSession.create(MODEL_ROOT+DET,{executionProviders:["wasm"]}),
   ort.InferenceSession.create(MODEL_ROOT+REC,{executionProviders:["wasm"]})
  ]);
  this.ort=ort;this.det=det;this.rec=rec;this.loaded=true;
 }
 async detect(video){
  if(!this.loaded||!video?.videoWidth)return [];
  const start=performance.now();
  const frame=document.createElement("canvas");frame.width=video.videoWidth;frame.height=video.videoHeight;
  frame.getContext("2d",{willReadFrequently:true}).drawImage(video,0,0,frame.width,frame.height);
  const downscale=Math.min(1,640/Math.max(frame.width,frame.height));
  const width=Math.max(32,Math.round(frame.width*downscale/32)*32);
  const height=Math.max(32,Math.round(frame.height*downscale/32)*32);
  const data=canvasPixels(frame,width,height);
  const input=new this.ort.Tensor("float32",tensorize(data,width,height,"det"),[1,3,height,width]);
  const out=(await this.det.run({x:input}))[this.det.outputNames[0]];
  const [, ,oh,ow]=out.dims;
  const raw=detectionBoxes(out.data,ow,oh,frame.width,frame.height);
  if(!raw.length){this.last=[];this.lastDuration=performance.now()-start;return []}
  // Bound runtime and do not use coordinates of pre-labeled page cells.
  const boxes=raw.slice(0,65);
  const batch=new Float32Array(boxes.length*3*W*H);
  for(let i=0;i<boxes.length;i++)batch.set(preprocessRec(frame,boxes[i]),i*3*W*H);
  const recOut=(await this.rec.run({x:new this.ort.Tensor("float32",batch,[boxes.length,3,H,W])}))[this.rec.outputNames[0]];
  const [n,t,c]=recOut.dims;
  const words=decodeCTC(recOut.data,n,t,c,this.dictionary);
  const normalized=boxes.map((box,i)=>({text:words[i].text,confidence:words[i].confidence,
    box:[box[0]/frame.width,box[1]/frame.height,box[2]/frame.width,box[3]/frame.height]}));
  this.last=normalized;this.lastDuration=performance.now()-start;
  return normalized;
 }
}
