import {project} from "./core.js";

/**
 * Verify expected printed glyph and neighboring ink at a geometrically
 * projected touch zone, without OCR or sending camera data to a server.
 * This provides independent visual evidence beyond the zone coordinates.
 * The fingertip area is excluded, since it may occlude the printed glyph.
 */
export function invertHomography(H){
 if(!H||H.length!==9)return null;
 const [a,b,c,d,e,f,g,h,i]=H;
 const cof=[e*i-f*h,c*h-b*i,b*f-c*e,f*g-d*i,a*i-c*g,c*d-a*f,d*h-e*g,b*g-a*h,a*e-b*d];
 const det=a*cof[0]+b*cof[3]+c*cof[6];
 return Number.isFinite(det)&&Math.abs(det)>1e-10?cof.map(v=>v/det):null;
}
function gray(buffer,width,x,y){
 const ix=Math.floor(x),iy=Math.floor(y);
 if(ix<0||iy<0||ix>=width||iy>=buffer.height)return null;
 const offset=(iy*width+ix)*4;
 return .299*buffer.data[offset]+.587*buffer.data[offset+1]+.114*buffer.data[offset+2];
}
/** Returns match/mismatch/inconclusive, never a standalone letter identity. */
export function verifyPrintedShape(reference,frame,H,zone,tip,{cols=21,rows=17}={}){
 if(!reference||!frame||!H||!zone?.box)return {status:"inconclusive",reason:"missing"};
 const inverse=invertHomography(H);
 if(!inverse)return {status:"inconclusive",reason:"projection"};
 const [x,y,w,h]=zone.box;
 if(![x,y,w,h].every(Number.isFinite)||w<=0||h<=0)return {status:"inconclusive",reason:"zone"};
 // Include immediate surrounding print; the finger itself often covers
 // the central letter, so recognition must not require seeing that ink.
 const patchW=Math.min(.45,Math.max(.095,w*1.58));
 const patchH=Math.min(.29,Math.max(.085,h*1.7));
 const cx=x+w/2,cy=y+h/2;
 const refPixels=[],livePixels=[];
 let samples=0,visible=0;
 const tipRadius=.048*Math.min(frame.width,frame.height);
 for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
  const rx=cx+((col+.5)/cols-.5)*patchW;
  const ry=cy+((row+.5)/rows-.5)*patchH;
  if(rx<0||ry<0||rx>=1||ry>=1)continue;
  const camera=project(inverse,{x:rx,y:ry});
  if(!camera||camera.x<0||camera.y<0||camera.x>=1||camera.y>=1)continue;
  samples++;
  if(tip&&Math.hypot((camera.x-tip.x)*frame.width,(camera.y-tip.y)*frame.height)<tipRadius)continue;
  const a=gray(reference,reference.width,rx*reference.width,ry*reference.height);
  const b=gray(frame,frame.width,camera.x*frame.width,camera.y*frame.height);
  if(a===null||b===null)continue;
  refPixels.push(a);livePixels.push(b);visible++;
 }
 if(visible<95||visible<samples*.48)return {status:"inconclusive",reason:"occluded",visible,samples};
 let ar=0,al=0;
 for(let i=0;i<visible;i++){ar+=refPixels[i];al+=livePixels[i]}
 ar/=visible;al/=visible;
 let cr=0,vr=0,vl=0;
 for(let i=0;i<visible;i++){
  const r=refPixels[i]-ar,l=livePixels[i]-al;
  cr+=r*l;vr+=r*r;vl+=l*l;
 }
 if(vr/visible<90||vl/visible<90)return {status:"inconclusive",reason:"weak-texture",visible,samples};
 const score=cr/Math.sqrt(vr*vl);
 // A hard rejection needs abundant unoccluded visual context. Anything
 // uncertain remains a geometric-only selection rather than a false denial.
 const status=score>=.37?"match":score<0&&visible>samples*.80?"mismatch":"inconclusive";
 return {status,score:Number(score.toFixed(3)),visible,samples};
}
/**
 * Compatibility with the camera-only SDK: initialize after the page QR is
 * known; inspect the real camera image only when a finger chooses a zone.
 */
export class ShapeVerifier{
 constructor(reference=null){this.reference=reference;this.canvas=null}
 async init(url,width=700){
  const loaded=await ShapeVerifier.fromImage(url,width);
  this.reference=loaded.reference;
  return this;
 }
 static async fromImage(url,width=700){
  const image=new Image();image.src=url;await image.decode();
  const canvas=document.createElement("canvas");
  canvas.width=width;canvas.height=Math.round(width*image.naturalHeight/image.naturalWidth);
  const ctx=canvas.getContext("2d",{willReadFrequently:true});
  ctx.drawImage(image,0,0,canvas.width,canvas.height);
  return new ShapeVerifier(ctx.getImageData(0,0,canvas.width,canvas.height));
 }
 verify(frame,H,zone,tip){
  if(!this.reference)return {status:"inconclusive",reason:"loading"};
  let imageData=frame;
  if(!frame?.data||!frame?.width||!frame?.height){
   const width=Math.min(760,frame?.videoWidth||frame?.naturalWidth||frame?.width||0);
   const height=frame?.videoHeight||frame?.naturalHeight||frame?.height||0;
   if(!width||!height)return {status:"inconclusive",reason:"no-camera"};
   this.canvas??=document.createElement("canvas");
   this.canvas.width=width;this.canvas.height=Math.round(width*height/(frame.videoWidth||frame.naturalWidth||frame.width));
   const ctx=this.canvas.getContext("2d",{willReadFrequently:true});
   ctx.drawImage(frame,0,0,this.canvas.width,this.canvas.height);
   imageData=ctx.getImageData(0,0,this.canvas.width,this.canvas.height);
  }
  return verifyPrintedShape(this.reference,imageData,H,zone,tip);
 }
 dispose(){this.reference=null;this.canvas=null}
}
/**
 * The position is still authoritative for identity; shape/context is an
 * independent cross-check. An occluding fingertip is inconclusive, not a
 * mismatch. Never require online OCR or another hand-scanning gesture.
 */
export function decideHybrid({geometryStrong=false,stableFrames=0,appearance=null}={}){
 if(appearance?.status==="mismatch")return {allow:false,reason:"clear-shape-mismatch"};
 if(appearance?.status==="match")return {allow:true,reason:"geometry-and-appearance"};
 if(geometryStrong&&stableFrames>=2)return {allow:true,reason:"strong-geometry-occluded-appearance"};
 return {allow:false,reason:"insufficient-evidence"};
}
