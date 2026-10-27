import jsfeat from "jsfeat";
import {project} from "./core.js";

// Tracks already-matched printed page anchors between camera frames.
// Hand occlusion can remove several anchors without losing the remaining ones.
// Reacquire with the full visual matcher when tracking confidence is insufficient.
const WIDTH=480, LEVELS=3;
function createPyramid(canvas){
 const w=WIDTH,h=Math.round(canvas.height*w/canvas.width);
 const off=document.createElement("canvas");off.width=w;off.height=h;
 const ctx=off.getContext("2d",{willReadFrequently:true});
 ctx.drawImage(canvas,0,0,w,h);
 const data=ctx.getImageData(0,0,w,h);
 const pyr=new jsfeat.pyramid_t(LEVELS);
 pyr.allocate(w,h,jsfeat.U8C1_t);
 jsfeat.imgproc.grayscale(data.data,w,h,pyr.data[0]);
 pyr.build(pyr.data[0],true);
 return {pyr,w,h};
}
function estimate(points,w,h){
 if(points.length<10)return null;
 const src=points.map(x=>({x:x.x,y:x.y}));
 const dest=points.map(x=>({x:x.u*w,y:x.v*h}));
 const mask=new jsfeat.matrix_t(points.length,1,jsfeat.U8C1_t);
 const mat=new jsfeat.matrix_t(3,3,jsfeat.F32C1_t);
 const ok=jsfeat.motion_estimator.ransac(new jsfeat.ransac_params_t(4,3.9,.48,.99),new jsfeat.motion_model.homography2d(),src,dest,points.length,mat,mask,170);
 if(!ok)return null;
 const good=points.filter((x,i)=>mask.data[i]>0);
 if(good.length<10||good.length/points.length<.43)return null;
 const spreadX=Math.max(...good.map(x=>x.u))-Math.min(...good.map(x=>x.u));
 const spreadY=Math.max(...good.map(x=>x.v))-Math.min(...good.map(x=>x.v));
 if(spreadX<.19||spreadY<.17)return null;
 const m=mat.data,H=[m[0],m[1]*h/w,m[2]/w,m[3]*w/h,m[4],m[5]/h,m[6]*w,m[7]*h,m[8]];
 // jsfeat mat stores row-major, H maps normalized frame -> normalized page.
 const center=project(H,{x:.5,y:.5});
 if(!center||!Number.isFinite(center.x)||Math.abs(center.x)>3||Math.abs(center.y)>3)return null;
 return {H,inliers:good.length,ratio:good.length/points.length,anchors:good,confidence:"temporal"};
}
export class TemporalPageTracker{
 constructor(){this.previous=null;this.anchors=[];this.lastResult=null}
 reset(){this.previous=null;this.anchors=[];this.lastResult=null}
 seed(canvas,recognition){
  this.reset();
  if(!recognition?.H||!recognition?.anchors?.length)return false;
  const frame=createPyramid(canvas);
  const used=[];
  for(const a of recognition.anchors){
   if(used.length>=90)break;
   const x=a.x*frame.w,y=a.y*frame.h;
   if(x<18||y<18||x>frame.w-18||y>frame.h-18)continue;
   used.push({x,y,u:a.u,v:a.v});
  }
  if(used.length<10)return false;
  this.previous=frame;this.anchors=used;
  this.lastResult=recognition;
  return true;
 }
 update(canvas){
  if(!this.previous||this.anchors.length<10)return null;
  const current=createPyramid(canvas);
  if(current.w!==this.previous.w||current.h!==this.previous.h){this.reset();return null}
  const count=this.anchors.length,prevXY=new Float32Array(count*2),nextXY=new Float32Array(count*2),status=new Uint8Array(count);
  for(let i=0;i<count;i++){prevXY[i*2]=this.anchors[i].x;prevXY[i*2+1]=this.anchors[i].y}
  jsfeat.optical_flow_lk.track(this.previous.pyr,current.pyr,prevXY,nextXY,count,17,17,status,.01,.0001);
  const moved=[];
  for(let i=0;i<count;i++){
   if(!status[i])continue;
   const x=nextXY[2*i],y=nextXY[2*i+1];
   if(x<17||y<17||x>current.w-17||y>current.h-17)continue;
   moved.push({...this.anchors[i],x,y});
  }
  const aligned=estimate(moved,current.w,current.h);
  // A child's hand can briefly dominate optical flow and distort the page
  // homography even when RANSAC has a high inlier count. Compare its pose to
  // the preceding *accepted* pose at independent page coordinates.
  if(aligned&&this.lastResult?.H){
   const samples=[{x:.25,y:.25},{x:.75,y:.75},{x:.50,y:.50}];
   const jump=samples.reduce((largest,p)=>{
    const previous=project(this.lastResult.H,p),next=project(aligned.H,p);
    if(!previous||!next)return Infinity;
    return Math.max(largest,Math.hypot(previous.x-next.x,previous.y-next.y));
   },0);
   // Tracking is 5-7 Hz. Faster/larger camera motion requires full
   // reacquisition; never guess which neighboring letter a fingertip means.
   if(jump>.085){this.reset();return null}
  }
  if(!aligned){this.reset();return null}
  this.previous=current;this.anchors=aligned.anchors;
  this.lastResult=aligned;
  return aligned;
 }
}
