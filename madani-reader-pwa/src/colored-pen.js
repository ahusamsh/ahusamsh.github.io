// Detect an elongated saturated-yellow pen/pencil by its shaft, not by the
// skin-colored eraser at its tip. No page geometry or preassigned cell map.
const gray=(r,g,b)=>.299*r+.587*g+.114*b;
const yellow=(r,g,b)=>r>125&&g>75&&b<165&&r>b*1.45&&g>b*1.80&&r+g-2*b>120&&r>g*.90&&g>r*.60;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function distanceToText(p,r){
 const [x,y,w,h]=r.box;
 return Math.hypot(Math.max(0,x-p.x,p.x-x-w),Math.max(0,y-p.y,p.y-y-h));
}
export function pencilEndWithEraser(image,origin,yellowEnd,shaftLength){
 const {width:w,height:h,data}=image;
 const dx=yellowEnd.x-origin.x,dy=yellowEnd.y-origin.y;
 const length=Math.hypot(dx,dy);
 if(length<20)return yellowEnd;
 const ux=dx/length,uy=dy/length;
 let tip=yellowEnd,gaps=0,evidence=0;
 const maxExtension=Math.min(48,shaftLength*.16);
 // A pink rubber/metal ferrule continues past the yellow shaft. Follow that
 // real visible material only; do not just snap the shaft to a nearby glyph.
 for(let step=2;step<=maxExtension;step+=2){
  const x=Math.round(yellowEnd.x+ux*step),y=Math.round(yellowEnd.y+uy*step);
  if(x<1||x>=w-1||y<1||y>=h-1)break;
  let opaque=0;
  for(const offset of [-10,-7,-4,0,4,7,10]){
   const xx=Math.round(x-uy*offset),yy=Math.round(y+ux*offset);
   if(xx<0||yy<0||xx>=w||yy>=h)continue;
   const i=4*(yy*w+xx),r=data[i],g=data[i+1],b=data[i+2];
   const lum=gray(r,g,b);
   const saturatedRubber=r>g*1.12&&r>b*1.14&&r>75;
   const metallic=lum<165&&Math.max(r,g,b)-Math.min(r,g,b)<70;
   if(saturatedRubber||metallic)opaque++;
  }
  if(opaque){tip={x,y};gaps=0;evidence++}
  else gaps++;
  if(gaps>=6)break;
 }
 return evidence>=4?tip:yellowEnd;
}
export function connectedYellow(img){
 const {width:w,height:h,data}=img,n=w*h;
 const mask=new Uint8Array(n),seen=new Uint8Array(n),found=[];
 for(let i=0;i<n;i++){
  const j=i*4;mask[i]=yellow(data[j],data[j+1],data[j+2])?1:0;
 }
 for(let y=0;y<h;y+=1)for(let x=0;x<w;x+=1){
  const id=y*w+x;if(!mask[id]||seen[id])continue;
  const q=[id],edge=[];
  seen[id]=1;let loX=x,hiX=x,loY=y,hiY=y,sx=0,sy=0;
  for(let k=0;k<q.length;k++){
   const i=q[k],px=i%w,py=Math.floor(i/w);
   loX=Math.min(loX,px);hiX=Math.max(hiX,px);
   loY=Math.min(loY,py);hiY=Math.max(hiY,py);
   sx+=px;sy+=py;
   if(px<5||py<5||px>w-6||py>h-6)edge.push({x:px,y:py});
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    if(!dx&&!dy)continue;
    const xx=px+dx,yy=py+dy;
    if(xx<0||xx>=w||yy<0||yy>=h)continue;
    const j=yy*w+xx;
    if(mask[j]&&!seen[j]){seen[j]=1;q.push(j)}
   }
  }
  if(q.length<Math.max(65,n*.00035))continue;
  const len=Math.hypot(hiX-loX,hiY-loY);
  if(len<Math.min(w,h)*.20)continue;
  const center={x:sx/q.length,y:sy/q.length};
  let cxx=0,cyy=0,cxy=0;
  for(let k=0;k<q.length;k++){
   const i=q[k],dx=i%w-center.x,dy=Math.floor(i/w)-center.y;
   cxx+=dx*dx;cyy+=dy*dy;cxy+=dx*dy;
  }
  cxx/=q.length;cyy/=q.length;cxy/=q.length;
  const trace=cxx+cyy,disc=Math.sqrt((cxx-cyy)**2+4*cxy*cxy);
  const major=(trace+disc)/2,minor=(trace-disc)/2;
  if(major/Math.max(.1,minor)<10)continue; // not a colored block or page highlight
  // Prefer the distal endpoint opposite to where the pencil enters camera.
  let root=edge.length>=3?
    {x:edge.reduce((s,p)=>s+p.x,0)/edge.length,y:edge.reduce((s,p)=>s+p.y,0)/edge.length}
    :null;
  let start=null,end=null;
  if(root){
   let max=-1;
   for(let k=0;k<q.length;k++){
    const i=q[k],p={x:i%w,y:Math.floor(i/w)},dist=distance(root,p);
    if(dist>max){max=dist;end=p}
   }
  }else{
   // When the pencil is entirely within the camera frame, use the two ends
   // of its principal axis. The OCR context must decide which end points at ink.
   const a=Math.atan2(2*cxy,cxx-cyy)/2,ux=Math.cos(a),uy=Math.sin(a);
   let lo=Infinity,hi=-Infinity;
   for(let k=0;k<q.length;k++){
    const i=q[k],p={x:i%w,y:Math.floor(i/w)},dot=(p.x-center.x)*ux+(p.y-center.y)*uy;
    if(dot<lo){lo=dot;start=p}
    if(dot>hi){hi=dot;end=p}
   }
  }
  if(end)found.push({root,start,end,len,major,minor,count:q.length});
 }
 return found;
}
export function findColoredPen(img,targets){
 if(!img||!targets?.length)return null;
 const {width:w,height:h}=img,candidates=[];
 for(const component of connectedYellow(img)){
  const endpoints=component.root?[component.end]:[component.start,component.end];
  for(const end of endpoints){
   if(!end)continue;
   const actualEnd=component.root?
    pencilEndWithEraser(img,component.root,end,component.len):end;
   const tip={x:actualEnd.x/w,y:actualEnd.y/h};
   const near=targets.map(t=>({t,dist:distanceToText(tip,t)})).sort((a,b)=>a.dist-b.dist);
   if(!near.length||near[0].dist>Math.max(.048,near[0].t.box[3]*1.3))continue;
   // If the visible yellow stripe ends before its ferrule/eraser is found,
   // it cannot select a nearby unrelated letter merely because the shaft
   // happens to pass through the same teaching row.
   if(component.root&&actualEnd===end&&near[0].dist>.025)continue;
   // Even a real pencil must not silently select between neighboring glyphs.
   if(near.length>1&&near[1].dist-near[0].dist<.022)continue;
   const score=component.len/Math.hypot(w,h)-near[0].dist;
   candidates.push({tip,kind:"pen",text:near[0].t.text,ocr:near[0].t,
    confidence:near[0].t.confidence,score,color:"yellow-shaft",distance:near[0].dist});
  }
 }
 // OCR proximity beats shaft length: a visible stripe passing near ص must
 // not defeat the eraser end that actually reaches ش.
 candidates.sort((a,b)=>a.distance-b.distance||b.score-a.score);
 if(!candidates.length)return null;
 if(candidates.length>1&&candidates[1].text!==candidates[0].text&&candidates[1].distance-candidates[0].distance<.018)return null;
 return candidates[0];
}
