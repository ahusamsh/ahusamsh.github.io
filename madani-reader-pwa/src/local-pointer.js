import {findColoredPen} from "./colored-pen.js";
// Local-only pointer detection. Does NOT use page geometry or page zone boxes.
// All targets are first detected/recognized by local OCR from live camera pixels.
const gray=(r,g,b)=>.299*r+.587*g+.114*b;
function distToRect(p,r){
 const [x,y,w,h]=r.box;
 const dx=Math.max(x-p.x,p.x-x-w,0),dy=Math.max(y-p.y,p.y-y-h,0);
 return Math.hypot(dx,dy);
}
function skin(r,g,b){
 const y=gray(r,g,b),cr=128+.713*(r-y),cb=128+.564*(b-y);
 return r>=44&&r<245&&g>25&&cr>=130&&cr<=190&&cb>=65&&cb<=143&&
   r>g*1.065&&r>b*1.12;
}
function foregroundSkin(img,targets){
 const {width:w,height:h,data}=img;
 const pixelCount=w*h,mask=new Uint8Array(pixelCount),visited=new Uint8Array(pixelCount);
 for(let i=0;i<pixelCount;i++){
  const j=i*4;
  if(skin(data[j],data[j+1],data[j+2]))mask[i]=1;
 }
 let best=null;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const start=y*w+x;if(!mask[start]||visited[start])continue;
  const queue=[start];visited[start]=1;
  let minX=w,minY=h,maxX=0,maxY=0,touches=0,points=[],entry=[];
  const rowLeft=new Int32Array(h).fill(w),rowRight=new Int32Array(h).fill(-1);
  const colTop=new Int32Array(w).fill(h),colBottom=new Int32Array(w).fill(-1);
  for(let k=0;k<queue.length;k++){
   const i=queue[k],ix=i%w,iy=Math.floor(i/w);
   if(ix<minX)minX=ix;if(ix>maxX)maxX=ix;if(iy<minY)minY=iy;if(iy>maxY)maxY=iy;
   rowLeft[iy]=Math.min(rowLeft[iy],ix);rowRight[iy]=Math.max(rowRight[iy],ix);
   colTop[ix]=Math.min(colTop[ix],iy);colBottom[ix]=Math.max(colBottom[ix],iy);
   if(ix<w*.035||ix>w*.965||iy>h*.965){touches++;entry.push({x:ix,y:iy})}
   if(k%2===0)points.push({x:ix,y:iy});
   for(const j of [i-1,i+1,i-w,i+w]){
    if(j<0||j>=mask.length||visited[j]||!mask[j])continue;
    const jx=j%w,jy=Math.floor(j/w);
    if(Math.abs(jx-ix)+Math.abs(jy-iy)!==1)continue;
    mask[j]=mask[j];visited[j]=1;queue.push(j);
   }
  }
  if(queue.length<Math.max(70,w*h*.00085)||touches<3)continue;
  // The finger must be a connected protrusion entering from outside
  // the frame. A small skin-colored eraser cannot be classified as a finger.
  const anchor={x:entry.reduce((a,p)=>a+p.x,0)/entry.length,y:entry.reduce((a,p)=>a+p.y,0)/entry.length};
  const maxDepth=Math.max(...points.map(p=>Math.hypot(p.x-anchor.x,p.y-anchor.y)));
  if(maxDepth<Math.min(w,h)*.14)continue;
  // Only inspect the farthest fingertip, not the side of a palm or a finger
  // that passes near an unrelated letter along its shaft.
  for(const p of points){
   const depth=Math.hypot(p.x-anchor.x,p.y-anchor.y);
   if(depth<maxDepth*.82)continue;
   const horizontalWidth=rowRight[p.y]-rowLeft[p.y]+1;
   const verticalHeight=colBottom[p.x]-colTop[p.x]+1;
   // The broad palm is not a fingertip. Prefer slender protrusions.
   if(horizontalWidth>w*.17&&verticalHeight>h*.17)continue;
   const normalized={x:p.x/w,y:p.y/h};
   const matches=targets.map(t=>({t,d:distToRect(normalized,t)})).sort((a,b)=>a.d-b.d);
   if(!matches.length||matches[0].d>Math.max(.026,matches[0].t.box[3]*.7))continue;
   // Refuse an in-between fingertip: never guess the neighboring glyph.
   if(matches.length>1&&Math.abs(matches[0].d-matches[1].d)<.012)continue;
   const progress=depth/Math.hypot(w,h);
   const score=progress-matches[0].d*2.2;
   if(!best||score>best.score)best={tip:normalized,score,kind:"finger",text:matches[0].t.text,ocr:matches[0].t,confidence:matches[0].t.confidence};
  }
 }
 if(!best||best.score<.1)return null;
 return best;
}
function darkNear(img,x,y){
 const {width:w,height:h,data}=img;
 let sum=0,samples=0;
 for(let ox=-1;ox<=1;ox++)for(let oy=-1;oy<=1;oy++){
  const ix=Math.round(x)+ox,iy=Math.round(y)+oy;
  if(ix<0||iy<0||ix>=w||iy>=h)continue;
  const j=(iy*w+ix)*4;
  const lum=gray(data[j],data[j+1],data[j+2]);
  const diff=Math.max(data[j],data[j+1],data[j+2])-Math.min(data[j],data[j+1],data[j+2]);
  if(lum<102&&diff<77)sum++;
  samples++;
 }
 return samples&&sum>=1;
}
function penStrokes(img,targets){
 // A pen is an elongated DARK component entering the camera and ending near
 // a detected printed glyph. This rejects printed letters: none of them
 // independently connect to the frame edge and extend into the teaching area.
 const {width:w,height:h,data}=img,n=w*h;
 const mask=new Uint8Array(n),visited=new Uint8Array(n);
 for(let i=0;i<n;i++){
  const j=4*i,r=data[j],g=data[j+1],b=data[j+2],lum=gray(r,g,b);
  mask[i]=lum<108&&Math.max(r,g,b)-Math.min(r,g,b)<78?1:0;
 }
 const candidates=[];
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const first=y*w+x;
  if(!mask[first]||visited[first])continue;
  const stack=[first],edge=[],points=[];visited[first]=1;
  let minX=x,maxX=x,minY=y,maxY=y;
  for(let idx=0;idx<stack.length;idx++){
   const k=stack[idx],cx=k%w,cy=Math.floor(k/w);
   minX=Math.min(minX,cx);maxX=Math.max(maxX,cx);
   minY=Math.min(minY,cy);maxY=Math.max(maxY,cy);
   if(cx<3||cx>w-4||cy<3||cy>h-4)edge.push({x:cx,y:cy});
   if(idx%2===0)points.push({x:cx,y:cy});
   for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++){
    if(ox===0&&oy===0)continue;
    const xx=cx+ox,yy=cy+oy;
    if(xx<0||yy<0||xx>=w||yy>=h)continue;
    const next=yy*w+xx;
    if(mask[next]&&!visited[next]){visited[next]=1;stack.push(next)}
   }
  }
  const extent=Math.hypot(maxX-minX,maxY-minY);
  if(edge.length<3||stack.length<Math.max(38,n*.00016)||extent<Math.min(w,h)*.12)continue;
  // Avoid keyboard, book spine or large dark objects touching the frame.
  // A pen shaft stays narrow even when its length spans much of the image.
  if(stack.length/extent>Math.max(8,Math.min(w,h)*.06))continue;
  const origin={x:edge.reduce((a,p)=>a+p.x,0)/edge.length,y:edge.reduce((a,p)=>a+p.y,0)/edge.length};
  const minDepth=extent*.7;
  const tips=points.map(p=>({...p,distance:Math.hypot(p.x-origin.x,p.y-origin.y)}))
   .filter(p=>p.distance>=minDepth).sort((a,b)=>b.distance-a.distance);
  // Check the far end of the shaft only; its middle may overlap several
  // printed letters and must not be interpreted as the pointed target.
  for(const tip of tips.slice(0,Math.min(60,tips.length))){
   const normalized={x:tip.x/w,y:tip.y/h};
   const next=targets.map(t=>({t,d:distToRect(normalized,t)})).sort((a,b)=>a.d-b.d);
   if(!next.length||next[0].d>Math.max(.018,next[0].t.box[3]*.45))continue;
   if(next.length>1&&Math.abs(next[0].d-next[1].d)<.009)continue;
   const density=stack.length/Math.max(1,(maxX-minX+1)*(maxY-minY+1));
   if(density>.50&&extent<Math.max(w,h)*.55)continue;
   const score=tip.distance/Math.hypot(w,h)-next[0].d;
   candidates.push({tip:normalized,score,kind:"pen",text:next[0].t.text,ocr:next[0].t,confidence:next[0].t.confidence});
   break;
  }
 }
 candidates.sort((a,b)=>b.score-a.score);
 if(!candidates.length)return null;
 if(candidates.length>1&&candidates[1].score>.82*candidates[0].score)return null;
 return candidates[0];
}
export function findPointer(image,detected,allowed,{pen=true,hand=true}={}){
 if(!image||!detected?.length)return null;
 const targets=detected.filter(t=>t.confidence>=.83&&allowed.has(t.text));
 if(!targets.length)return null;
 // First detect the body of a colored pencil/pen: a pink eraser must not
 // get classified as a human fingertip and snap to the previous glyph.
 const colored=pen?findColoredPen(image,targets):null;
 if(colored)return colored;
 const finger=hand?foregroundSkin(image,targets):null;
 if(finger)return finger;
 return pen?penStrokes(image,targets):null;
}
export class VisualPointerReader{
 constructor(){this.canvas=document.createElement("canvas");this.last=null}
 scan(video,boxes,allowed){
  if(!video?.videoWidth)return null;
  const c=this.canvas;c.width=Math.min(420,video.videoWidth);
  c.height=Math.round(video.videoHeight*c.width/video.videoWidth);
  const ctx=c.getContext("2d",{willReadFrequently:true});ctx.drawImage(video,0,0,c.width,c.height);
  this.last=findPointer(ctx.getImageData(0,0,c.width,c.height),boxes,allowed);
  return this.last;
 }
}
