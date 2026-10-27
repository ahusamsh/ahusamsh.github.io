import jsfeat from "jsfeat";
import {project} from "./core.js";

const CORNERS=14000, FEATURES=720;
const U_MAX=[15,15,15,15,14,14,14,13,13,12,11,10,9,8,6,3,0];
function popcount(v){v=v-((v>>>1)&0x55555555);v=(v&0x33333333)+((v>>>2)&0x33333333);return (((v+(v>>>4))&0x0f0f0f0f)*0x01010101)>>>24;}
function angle(gray,px,py){
 let m01=0,m10=0;const data=gray.data,step=gray.cols,at=py*step+px;
 for(let u=-15;u<=15;u++)m10+=u*data[at+u];
 for(let v=1;v<=15;v++){const d=U_MAX[v];let sum=0;for(let u=-d;u<=d;u++){
  const plus=data[at+u+v*step],minus=data[at+u-v*step];
  sum+=plus-minus;m10+=u*(plus+minus);
 }m01+=v*sum;}return Math.atan2(m01,m10);
}
function features(canvas,width){
 const h=Math.round(canvas.height*width/canvas.width);
 const off=document.createElement("canvas");off.width=width;off.height=h;
 const ctx=off.getContext("2d",{willReadFrequently:true});ctx.drawImage(canvas,0,0,width,h);
 const rgba=ctx.getImageData(0,0,width,h);
 const gray=new jsfeat.matrix_t(width,h,jsfeat.U8C1_t);
 const blurred=new jsfeat.matrix_t(width,h,jsfeat.U8C1_t);
 jsfeat.imgproc.grayscale(rgba.data,width,h,gray);
 jsfeat.imgproc.gaussian_blur(gray,blurred,3);
 jsfeat.yape06.laplacian_threshold=23;jsfeat.yape06.min_eigen_value_threshold=16;
 const points=Array.from({length:CORNERS},()=>new jsfeat.keypoint_t(0,0,0,0));
 let count=jsfeat.yape06.detect(blurred,points,17);
 // Balance ORB features across the entire page. Taking only the strongest
 // corners concentrated matches around the heading, keyboard or fingertip.
 const candidates=points.slice(0,count).sort((a,b)=>b.score-a.score);
 const COLS=5, ROWS=8, PER_TILE=24, tiles=new Uint8Array(COLS*ROWS);
 const selected=[];
 for(const pt of candidates){
  const x=Math.max(0,Math.min(COLS-1,Math.floor(pt.x*COLS/width)));
  const y=Math.max(0,Math.min(ROWS-1,Math.floor(pt.y*ROWS/h)));
  const idx=y*COLS+x;
  if(tiles[idx]>=PER_TILE)continue;
  if(pt.x<16||pt.y<16||pt.x>=width-16||pt.y>=h-16)continue;
  tiles[idx]++;
  selected.push(pt);
  if(selected.length>=FEATURES)break;
 }
 count=selected.length;
 for(let i=0;i<count;i++)selected[i].angle=angle(blurred,selected[i].x,selected[i].y);
 const descriptors=new jsfeat.matrix_t(32,count,jsfeat.U8C1_t);
 jsfeat.orb.describe(blurred,selected,count,descriptors);
 return {width,height:h,points:selected.map(p=>({x:p.x,y:p.y})),data:new Uint32Array(descriptors.buffer.i32.slice(0,count*8)),pixels:new Uint8Array(blurred.data.slice(0,width*h)),count};
}
function match(current,template){
 if(current.count<20||template.count<20)return null;
 const candidates=[];
 for(let i=0;i<current.count;i++){
  let best=256,second=256,bestIdx=-1;
  const a=i*8;
  for(let j=0;j<template.count;j++){
   const b=j*8;let diff=0;
   for(let k=0;k<8;k++)diff+=popcount(current.data[a+k]^template.data[b+k]);
   if(diff<best){second=best;best=diff;bestIdx=j}
   else if(diff<second)second=diff;
  }
  if(best<90&&best<.86*second)candidates.push({s:current.points[i],t:template.points[bestIdx],distance:best});
 }
 if(candidates.length<12)return null;
 // Estimate frame -> printed-page transform with RANSAC; never guess the
 // page solely from raw descriptor similarity.
 const source=candidates.map(c=>c.s),target=candidates.map(c=>c.t);
 const mask=new jsfeat.matrix_t(candidates.length,1,jsfeat.U8C1_t);
 const H=new jsfeat.matrix_t(3,3,jsfeat.F32C1_t);
 const params=new jsfeat.ransac_params_t(4,4.3,.5,.99);
 const ok=jsfeat.motion_estimator.ransac(params,new jsfeat.motion_model.homography2d(),source,target,candidates.length,H,mask,400);
 if(!ok)return null;
 const inlierPairs=candidates.filter((c,i)=>mask.data[i]>0);
 const n=inlierPairs.length,ratio=n/candidates.length;
 if(n<12||ratio<.28)return null;
 const pminx=Math.min(...inlierPairs.map(c=>c.t.x)),pmaxx=Math.max(...inlierPairs.map(c=>c.t.x));
 const pminy=Math.min(...inlierPairs.map(c=>c.t.y)),pmaxy=Math.max(...inlierPairs.map(c=>c.t.y));
 if((pmaxx-pminx)/template.width<.25||(pmaxy-pminy)/template.height<.20)return null;
 const values=Array.from(H.data).slice(0,9);
 const out=[values[0]*current.width/template.width,values[1]*current.height/template.width,values[2]/template.width,
 values[3]*current.width/template.height,values[4]*current.height/template.height,values[5]/template.height,
 values[6]*current.width,values[7]*current.height,values[8]];
 if(out.some(v=>!Number.isFinite(v)))return null;
 const middle=project(out,{x:.5,y:.5});
 if(!middle||Math.abs(middle.x)>8||Math.abs(middle.y)>8)return null;
 return {H:out,inliers:n,ratio,score:n*ratio+Math.min((pmaxy-pminy)/template.height,1)*10,confidence:"visual"};
}
function invert3(h){
 const [a,b,c,d,e,f,g,j,k]=h;
 const out=[e*k-f*j,c*j-b*k,b*f-c*e, f*g-d*k,a*k-c*g,c*d-a*f,d*j-e*g,b*g-a*j,a*e-b*d];
 const det=a*out[0]+b*out[3]+c*out[6];
 return Math.abs(det)<1e-9?null:out.map(x=>x/det);
}
function inkSimilarity(current,template,H){
 const inv=invert3(H);if(!inv)return 0;
 let both=0,onlyA=0,onlyB=0,valid=0;
 for(let py=.16;py<.86;py+=.006){
  for(let px=.16;px<.91;px+=.006){
   const mapped=project(inv,{x:px,y:py});
   if(!mapped||mapped.x<0||mapped.x>1||mapped.y<0||mapped.y>1)continue;
   const x=Math.floor(px*(template.width-1)),y=Math.floor(py*(template.height-1));
   const sx=Math.floor(mapped.x*(current.width-1)),sy=Math.floor(mapped.y*(current.height-1));
   const at=template.pixels[y*template.width+x]<150;
   const bt=current.pixels[sy*current.width+sx]<150;
   if(at&&bt)both++;else if(at)onlyA++;else if(bt)onlyB++;
   valid++;
  }
 }
 if(valid<500||both+onlyA+onlyB<100)return 0;
 return 2*both/(2*both+onlyA+onlyB);
}
export class VisualPageMatcher{
 constructor(){this.templates=[];this.lastDetection=null}
 async init(pageEntries){
  for(const [page,url] of pageEntries){
   const img=new Image();img.src=url;await img.decode();
   const masked=document.createElement('canvas');masked.width=img.naturalWidth;masked.height=img.naturalHeight;
   const mctx=masked.getContext('2d');mctx.drawImage(img,0,0);
   // Never use the often blurred, unreadable QR as a feature fingerprint.
   mctx.fillStyle='#ffffff';
   if(Number(page)===18)mctx.fillRect(masked.width*.82,0,masked.width*.18,masked.height*.13);
   else mctx.fillRect(0,0,masked.width*.18,masked.height*.13);
   for(const width of [500,740]){
    const f=features(masked,width);
    if(f.count>30)this.templates.push({...f,page:Number(page)});
   }
  }
  if(!this.templates.length)throw new Error("تعذر إنشاء بصمة الصفحات");
  return this.templates.length;
 }
 detect(canvas){
  const current=features(canvas,760);
  let best=null,second=null;this.debug=[];
  for(const t of this.templates){
   const result=match(current,t);
   if(!result)continue;
   const visual=inkSimilarity(current,t,result.H);
   const item={...result,page:t.page,frameWidth:canvas.width,frameHeight:canvas.height,visual,score:result.score*visual*visual};
   this.debug.push({page:t.page,width:t.width,score:Math.round(item.score*10)/10,n:item.inliers,ratio:item.ratio,visual:Math.round(visual*100)/100,H:item.H.map(v=>Math.round(v*100)/100)});
   if(!best||item.score>best.score){second=best;best=item}
   else if(!second||item.score>second.score)second=item;
  }
  if(!best)return null;
  if(second&&second.page!==best.page&&second.score>best.score*.86)return null;
  return best;
 }
 dispose(){this.templates=[]}
}
