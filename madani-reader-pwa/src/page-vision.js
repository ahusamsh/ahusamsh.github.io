/* Camera-only automatic page identification using the QR symbols already
   printed in the Madani book. No manual page number or corner calibration.
   Native BarcodeDetector on Android; jsQR fallback elsewhere.
   All processing stays on device and unknown pages never select audio. */
import jsQR from "jsqr";
import {homography,project} from "./core.js";
import {VisualPageMatcher} from "./visual-matcher.js";
const MARKERS={
 "QM015":{page:17,box:[.054673,.021840,.082844,.058599]},
 "QM016":{page:18,box:[.862319,.021840,.082845,.058599]},
 "QM017":{page:19,box:[.054673,.022673,.082844,.058599]}
};
function cornerOrder(points){
 if(points.length!==4)return null;
 const xy=points.map(p=>({x:Number(p.x),y:Number(p.y)}));
 if(xy.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))return null;
 const bySum=[...xy].sort((a,b)=>a.x+a.y-b.x-b.y);
 const byDiff=[...xy].sort((a,b)=>b.x-b.y-(a.x-a.y));
 const tl=bySum[0],br=bySum[3],tr=byDiff[0],bl=byDiff[3];
 if(new Set([tl,tr,br,bl]).size!==4)return null;
 return [tl,tr,br,bl];
}
export function markerFromUrl(value){
 // The QR actually printed on the book contains a direct audio URL, e.g.
 // https://a-alqasim.com/App/BookSound/page15.mp3. The original prototype
 // incorrectly accepted only the PDF annotation's QM015 redirect.
 let u;
 try{u=new URL(String(value||"").trim())}catch{return null}
 const host=u.hostname.toLowerCase();
 if(!["a-alqasim.com","www.a-alqasim.com","go.alqasim.com"].includes(host))return null;
 if(!["https:","http:"].includes(u.protocol))return null;
 let match=u.pathname.match(/^\/App\/BookSound\/page0*(15|16|17)\.mp3\/?$/i);
 if(!match)match=u.pathname.match(/^\/QM0(15|16|17)\/?$/i);
 return match?MARKERS["QM0"+match[1]]||null:null;
}
export function markerGeometry(rawValue,corners,frameWidth,frameHeight){
 const marker=markerFromUrl(rawValue);
 if(!marker||!frameWidth||!frameHeight)return null;
 const points=cornerOrder(corners);
 if(!points)return null;
 const from=points.map(p=>({x:p.x/frameWidth,y:p.y/frameHeight}));
 const [x,y,w,h]=marker.box;
 const to=[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}];
 const H=homography(from,to);
 if(!H)return null;
 const area=Math.abs(points.reduce((t,p,i)=>t+p.x*points[(i+1)%4].y-p.y*points[(i+1)%4].x,0))/2;
 if(area<90)return null; // QR too small for accurate hit regions
 return {page:marker.page,H,inliers:4,ratio:1,frameWidth,frameHeight,qrArea:area};
}
export class AutoPageVision{
 constructor(){this.templates=[];this.cv=null;this.busy=false;this.lastError=null;this.detector=null;this.canvas=null;this.matcher=null}
 async init(pageEntries=[]){
  // Only teach page identifiers backed by reviewed QR geometry.
  this.templates=pageEntries.map(([page])=>({page:Number(page)})).filter(x=>[17,18,19].includes(x.page));
  if(!this.templates.length)throw new Error("لم تُجهز بيانات الصفحات");
  if("BarcodeDetector" in globalThis){
   try{const formats=await BarcodeDetector.getSupportedFormats();if(formats.includes("qr_code"))this.detector=new BarcodeDetector({formats:["qr_code"]})}catch{}
  }
  this.canvas=document.createElement("canvas");
  this.canvas.width=1000;
  this.matcher=new VisualPageMatcher();
  await this.matcher.init(pageEntries);
  return this.templates.map(x=>x.page);
 }
 async detect(video){
  const w=video.videoWidth||video.naturalWidth||video.width,h=video.videoHeight||video.naturalHeight||video.height;
  if(!w||!h||this.busy||!this.canvas)return null;
  this.busy=true;
  const c=this.canvas;
  c.width=Math.min(1152,w);
  c.height=Math.round(h*c.width/w);
  const ctx=c.getContext("2d",{willReadFrequently:true});
  try{
   ctx.drawImage(video,0,0,c.width,c.height);
   if(this.detector){
    const results=await this.detector.detect(c);
    for(const qr of results){
     const result=markerGeometry(qr.rawValue,qr.cornerPoints||[],c.width,c.height);
     if(result&&this.templates.some(t=>t.page===result.page))return result;
    }
   }
   const windows=[[0,0,.48,.45],[.52,0,.48,.45],[0,0,1,1],[0,.55,.48,.45],[.52,.55,.48,.45],[.25,.24,.5,.52]];
   for(const [fx,fy,fw,fh] of windows){
    const x=Math.round(fx*c.width),y=Math.round(fy*c.height);
    const w=Math.max(16,Math.floor(fw*c.width)),h=Math.max(16,Math.floor(fh*c.height));
    const bytes=ctx.getImageData(x,y,w,h);
    const candidates=[bytes.data];
    if(fw<1){
      for(const threshold of [145,185]){
       const raw=new Uint8ClampedArray(bytes.data);
       for(let i=0;i<raw.length;i+=4){
        const v=(raw[i]+raw[i+1]+raw[i+2])/3<threshold?0:255;
        raw[i]=v;raw[i+1]=v;raw[i+2]=v;
       }
       candidates.push(raw);
      }
    }
    for(const data of candidates){
     const hit=jsQR(data,w,h,{inversionAttempts:"attemptBoth"});
     if(!hit)continue;
     const loc=hit.location||{};
     const pts=[loc.topLeftCorner,loc.topRightCorner,loc.bottomRightCorner,loc.bottomLeftCorner].filter(Boolean).map(p=>({x:p.x+x,y:p.y+y}));
     const result=markerGeometry(hit.data,pts,c.width,c.height);
     if(result&&this.templates.some(t=>t.page===result.page))return result;
    }
   }
   // QR can be unreadable in ordinary classroom light. Match printed
   // letter shapes and the whole page against the three reference pages.
   return this.matcher?.detect(c)||null;
  }catch(e){this.lastError=e;throw e}finally{this.busy=false}
 }
 pointInPage(detection,tip){
  if(!detection)return null;
  const p=project(detection.H,tip);
  if(!p||p.x<0||p.y<0||p.x>1||p.y>1)return null;
  return p;
 }
 dispose(){this.matcher?.dispose();this.matcher=null;this.templates=[];this.canvas=null;this.detector=null;this.busy=false}
}
