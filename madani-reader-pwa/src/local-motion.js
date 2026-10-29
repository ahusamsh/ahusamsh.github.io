// Align short-lived OCR text boxes to a moving handheld camera via local image
// evidence, NOT via the book's page coordinates. Refuse uncertain motion.
const WIDTH=144;
function snapshot(video){
 if(!video?.videoWidth)return null;
 const c=document.createElement("canvas"),w=WIDTH,h=Math.max(80,Math.round(video.videoHeight*w/video.videoWidth));
 c.width=w;c.height=h;const ctx=c.getContext("2d",{willReadFrequently:true});ctx.drawImage(video,0,0,w,h);
 const pixels=ctx.getImageData(0,0,w,h).data;
 const values=new Uint8Array(w*h);
 for(let i=0;i<values.length;i++)values[i]=(.299*pixels[4*i]+.587*pixels[4*i+1]+.114*pixels[4*i+2])|0;
 return {w,h,values};
}
function edges(frame){
 const {w,h,values:a}=frame,points=[];
 for(let y=5;y<h-5;y+=2)for(let x=5;x<w-5;x+=2){
  const i=y*w+x;
  const gradient=Math.abs(a[i]-a[i+1])+Math.abs(a[i]-a[i+w]);
  if(gradient>30&&a[i]<205)points.push({x,y,v:a[i]});
 }
 if(points.length>420){
  const step=Math.ceil(points.length/420);
  return points.filter((_,i)=>i%step===0).slice(0,420);
 }
 return points;
}
function testShift(current,points,dx,dy){
 let loss=0,count=0,good=0;
 for(const p of points){
  const x=p.x+dx,y=p.y+dy;
  if(x<0||y<0||x>=current.w||y>=current.h)continue;
  // Antialiasing changes individual dark pixels even for an otherwise
  // identical printed glyph. Compare a tiny 3x3 neighborhood instead.
  let difference=255;
  for(let yy=Math.max(0,y-1);yy<=Math.min(current.h-1,y+1);yy++){
   for(let xx=Math.max(0,x-1);xx<=Math.min(current.w-1,x+1);xx++)
    difference=Math.min(difference,Math.abs(p.v-current.values[yy*current.w+xx]));
  }
  loss+=Math.min(120,difference);if(difference<37)good++;
  count++;
 }
 return {loss:count?loss/count:Infinity,score:count?good/count:0};
}
export class OCRFrameMotion{
 constructor(){this.original=null;this.points=[];this.last=null}
 capture(video){
  this.original=snapshot(video);
  this.points=this.original?edges(this.original):[];
  this.last=null;
  return this.points.length;
 }
 track(video,boxes){
  if(!this.original||this.points.length<35||!boxes?.length)return null;
  const current=snapshot(video);
  if(!current||current.w!==this.original.w||current.h!==this.original.h)return null;
  let best={loss:Infinity,dx:0,dy:0,score:0};
  for(let dy=-8;dy<=8;dy+=2)for(let dx=-8;dx<=8;dx+=2){
   const c=testShift(current,this.points,dx,dy);
   if(c.loss<best.loss)best={...c,dx,dy};
  }
  const coarse=best;
  for(let dy=Math.max(-8,coarse.dy-2);dy<=Math.min(8,coarse.dy+2);dy++){
   for(let dx=Math.max(-8,coarse.dx-2);dx<=Math.min(8,coarse.dx+2);dx++){
    const c=testShift(current,this.points,dx,dy);
    if(c.loss<best.loss)best={...c,dx,dy};
   }
  }
  this.last=best;
  // Severe rotation/zoom/camera motion => do not use stale OCR boxes.
  if(best.score<.36||best.loss>48||Math.abs(best.dx)>=8||Math.abs(best.dy)>=8)return null;
  return boxes.map(b=>({...b,box:[b.box[0]+best.dx/current.w,b.box[1]+best.dy/current.h,b.box[2],b.box[3]]}));
 }
 reset(){this.original=null;this.points=[];this.last=null}
}
