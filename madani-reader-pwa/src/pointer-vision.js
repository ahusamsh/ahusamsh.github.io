import {project,closestZone} from "./core.js";
import {invertHomography} from "./shape-verifier.js";

// Pointing implement / bare finger tip, without requiring a whole hand.
// Only considers foreground occluding the already-identified printed page.
// It intentionally abstains when the page pose or pointer endpoint is unclear.
const GRID_W=176,GRID_H=224;
function sample(data, x,y){
 const ix=Math.round(x*(data.width-1)),iy=Math.round(y*(data.height-1));
 if(ix<0||iy<0||ix>=data.width||iy>=data.height)return null;
 const i=(iy*data.width+ix)*4,d=data.data;
 return [d[i],d[i+1],d[i+2]];
}
const lum=p=>.299*p[0]+.587*p[1]+.114*p[2];
function difference(reference,live){
 const r=lum(reference),v=lum(live);
 // Leave printed green/black letters out of foreground detection wherever
 // possible: they are already part of the reference page.
 if(r<132)return false;
 const dark=r-v>49;
 const chromaRef=Math.max(...reference)-Math.min(...reference);
 const chromaLive=Math.max(...live)-Math.min(...live);
 const colored=croma=>croma>33;
 const skin=(live[0]>live[1]*1.07&&live[1]>live[2]*.97&&colored(chromaLive)&&v<215);
 const ink=v<113&&r>192;
 return dark&&(skin||ink||(r-v>88&&chromaLive>chromaRef+9));
}
function blobCandidates(mask,cols,rows,baseX,baseY,stepX,stepY,zones){
 const visited=new Uint8Array(mask.length),found=[];
 const minZoneX=Math.min(...zones.map(z=>z.box[0])),maxZoneX=Math.max(...zones.map(z=>z.box[0]+z.box[2]));
 const minZoneY=Math.min(...zones.map(z=>z.box[1])),maxZoneY=Math.max(...zones.map(z=>z.box[1]+z.box[3]));
 for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
  const seed=y*cols+x;
  if(!mask[seed]||visited[seed])continue;
  const queue=[seed],pixels=[];visited[seed]=1;
  let edges=[0,0,0,0],left=cols,top=rows,right=0,bottom=0;
  for(let k=0;k<queue.length;k++){
   const j=queue[k],cx=j%cols,cy=Math.floor(j/cols);
   pixels.push({x:cx,y:cy});
   left=Math.min(left,cx);right=Math.max(right,cx);top=Math.min(top,cy);bottom=Math.max(bottom,cy);
   if(cx<4)edges[0]++;if(cx>cols-5)edges[1]++;
   if(cy<4)edges[2]++;if(cy>rows-5)edges[3]++;
   for(let yy=Math.max(0,cy-1);yy<=Math.min(rows-1,cy+1);yy++)for(let xx=Math.max(0,cx-1);xx<=Math.min(cols-1,cx+1);xx++){
    const next=yy*cols+xx;
    if(mask[next]&&!visited[next]){visited[next]=1;queue.push(next)}
   }
  }
  if(pixels.length<19||pixels.length>cols*rows*.48)continue;
  // The pointing implement enters the educational grid from its margin.
  // It need not extend all the way to the printed page's outer edges.
  const boundary=pixels.filter(pt=>{
   const px=baseX+(pt.x+.5)*stepX,py=baseY+(pt.y+.5)*stepY;
   return px<minZoneX-.012||px>maxZoneX+.012||py<minZoneY-.015||py>maxZoneY+.015;
  });
  if(boundary.length<4)continue;
  const origin={x:boundary.reduce((n,p)=>n+p.x,0)/boundary.length,y:boundary.reduce((n,p)=>n+p.y,0)/boundary.length};
  const spread=Math.max(right-left,bottom-top);
  if(spread<16)continue;
  // The tip is the farthest visible protrusion *within the printed letter
  // grid*, not the centroid of the hand or the longest page shadow.
  let best=null;
  for(const p of pixels){
   const px=baseX+(p.x+.5)*stepX,py=baseY+(p.y+.5)*stepY;
   const zone=closestZone({x:px,y:py},zones);
   if(!zone)continue;
   const distance=Math.hypot(p.x-origin.x,p.y-origin.y);
   const score=distance-0.014*pixels.length;
   if(!best||score>best.score)best={point:{x:px,y:py},zone,score,distance};
  }
  if(!best||best.distance<17)continue;
  const bboxArea=(right-left+1)*(bottom-top+1);
  const density=pixels.length/bboxArea;
  // A shadow or lighting change covers a broad swath of the page. Skip it.
  if(density>.92&&bboxArea>1400)continue;
  found.push({...best,area:pixels.length,density,edges});
 }
 found.sort((a,b)=>b.score-a.score);
 if(found.length>1&&found[1].score>found[0].score*.90)return null;
 return found[0]||null;
}
export class PointerVision{
 constructor(){this.reference=null;this.canvas=null;this.last=null;this.count=0;this.lastScore=0}
 async init(url){
  const image=new Image();image.src=url;await image.decode();
  const c=document.createElement("canvas");c.width=480;c.height=Math.round(image.naturalHeight*480/image.naturalWidth);
  const ctx=c.getContext("2d",{willReadFrequently:true});
  ctx.drawImage(image,0,0,c.width,c.height);
  this.reference=ctx.getImageData(0,0,c.width,c.height);
  this.canvas=document.createElement("canvas");
  this.canvas.width=640;
 }
 detect(video,H,zones){
  if(!this.reference||!H||!zones?.length||!video?.videoWidth)return null;
  const inv=invertHomography(H);
  if(!inv)return null;
  const c=this.canvas;c.width=Math.min(640,video.videoWidth);
  c.height=Math.round(c.width*video.videoHeight/video.videoWidth);
  const ctx=c.getContext("2d",{willReadFrequently:true});ctx.drawImage(video,0,0,c.width,c.height);
  const frame=ctx.getImageData(0,0,c.width,c.height);
  const xs=zones.map(z=>z.box[0]),xe=zones.map(z=>z.box[0]+z.box[2]);
  const ys=zones.map(z=>z.box[1]),ye=zones.map(z=>z.box[1]+z.box[3]);
  // A margin around the teaching grid includes the arm/pencil shaft entering
  // from outside the table, but excludes most of the surroundings.
  const minX=Math.max(0,Math.min(...xs)-.11),maxX=Math.min(1,Math.max(...xe)+.09);
  const minY=Math.max(0,Math.min(...ys)-.11),maxY=Math.min(1,Math.max(...ye)+.10);
  const sx=(maxX-minX)/GRID_W,sy=(maxY-minY)/GRID_H;
  const mask=new Uint8Array(GRID_W*GRID_H);
  for(let y=0;y<GRID_H;y++)for(let x=0;x<GRID_W;x++){
   const page={x:minX+(x+.5)*sx,y:minY+(y+.5)*sy};
   const mapped=project(inv,page);
   if(!mapped||mapped.x<0||mapped.x>1||mapped.y<0||mapped.y>1)continue;
   const r=sample(this.reference,page.x,page.y),f=sample(frame,mapped.x,mapped.y);
   if(r&&f&&difference(r,f))mask[y*GRID_W+x]=1;
  }
  // Printed letters and green table rules interrupt a dark pen stroke.
  // Reconnect short straight interruptions in four axes without dilating
  // all dark regions (which would merge finger and page shadows).
  const closed=mask.slice(),vectors=[[1,0],[0,1],[1,1],[1,-1]];
  for(let y=8;y<GRID_H-8;y++)for(let x=8;x<GRID_W-8;x++){
   if(!mask[y*GRID_W+x])continue;
   for(const [dx,dy] of vectors){
    for(let step=2;step<=8;step++){
     const yy=y+dy*step,xx=x+dx*step;
     if(!mask[yy*GRID_W+xx])continue;
     let count=0;
     for(let k=1;k<step;k++)if(mask[(y+dy*k)*GRID_W+x+dx*k])count++;
     if(count===0||count===step-1){
      for(let k=1;k<step;k++)closed[(y+dy*k)*GRID_W+x+dx*k]=1;
     }
     break;
    }
   }
  }
  const result=blobCandidates(closed,GRID_W,GRID_H,minX,minY,sx,sy,zones);
  if(!result)return null;
  const normalized=project(inv,result.point);
  if(!normalized||normalized.x<0||normalized.x>1||normalized.y<0||normalized.y>1)return null;
  return {tip:normalized,pagePoint:result.point,zoneId:result.zone.id,method:"page-foreground",confidence:Math.min(.94,.45+result.distance/130),area:result.area};
 }
 dispose(){this.reference=null;this.canvas=null}
}
