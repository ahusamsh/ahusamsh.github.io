// Image-space detection of pointing fingertip / dark pen shaft.
// Does NOT require a visible full hand, page homography, or mapped cells.
// The result is a proposal only; OCR + multi-frame consensus must confirm it.
function skin(r,g,b){
 const y=.299*r+.587*g+.114*b;
 const cr=(r-y)*.713+128,cb=(b-y)*.564+128;
 return y>24&&y<246&&cr>=137&&cr<=187&&cb>=73&&cb<=132
  &&r-g>=13&&r-b>=26&&g-b>=4;
}
function pen(r,g,b){
 return Math.max(r,g,b)<95&&Math.max(r,g,b)-Math.min(r,g,b)<27;
}
function segment(input,width,height,mode){
 const scaledWidth=Math.min(260,width),scaledHeight=Math.round(height*scaledWidth/width);
 const mask=new Uint8Array(scaledWidth*scaledHeight);
 for(let y=0;y<scaledHeight;y++)for(let x=0;x<scaledWidth;x++){
  const sx=Math.floor((x+.5)*width/scaledWidth),sy=Math.floor((y+.5)*height/scaledHeight);
  const i=(Math.min(height-1,sy)*width+Math.min(width-1,sx))*4;
  const r=input[i],g=input[i+1],b=input[i+2];
  mask[y*scaledWidth+x]=mode==="skin"?+skin(r,g,b):+pen(r,g,b);
 }
 return {mask,w:scaledWidth,h:scaledHeight};
}
function components(mask,w,h,mode){
 const seen=new Uint8Array(mask.length),out=[];
 const minimum=mode==="skin"?Math.max(100,w*h*.0025):Math.max(50,w*h*.0008);
 const offsets=[[0,-1],[0,1],[-1,0],[1,0],[-1,-1],[-1,1],[1,-1],[1,1]];
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const seed=y*w+x;if(!mask[seed]||seen[seed])continue;
  const stack=[seed];seen[seed]=1;
  let x0=x,x1=x,y0=y,y1=y;
  const points=[];
  for(let i=0;i<stack.length;i++){
   const n=stack[i],cx=n%w,cy=(n/w)|0;
   points.push({x:cx,y:cy});
   if(cx<x0)x0=cx;if(cx>x1)x1=cx;if(cy<y0)y0=cy;if(cy>y1)y1=cy;
   for(const [dx,dy] of offsets){
    const xx=cx+dx,yy=cy+dy;
    if(xx<0||yy<0||xx>=w||yy>=h)continue;
    const j=yy*w+xx;
    if(mask[j]&&!seen[j]){seen[j]=1;stack.push(j)}
   }
  }
  if(points.length<minimum)continue;
  const bw=x1-x0+1,bh=y1-y0+1;
  const left=x0<Math.max(3,w*.025),right=x1>w-Math.max(3,w*.025),
    top=y0<Math.max(3,h*.025),bottom=y1>h-Math.max(3,h*.025);
  if(!left&&!right&&!top&&!bottom)continue;
  const big=Math.max(bw/w,bh/h);
  if(big<(mode==="skin"?.22:.18))continue;
  let source=null,direction=null;
  // Choose the dominant entry boundary, preferably the bottom where a child
  // normally enters the printed page. This is a *physical image* edge.
  const boundaries=[["bottom",bottom],["left",left],["right",right],["top",top]];
  for(const [side,active] of boundaries)if(active){source=side;break}
  if(!source)continue;
  // Select the extreme pointing tip, robust to one dark or bright pixel.
  const ordered=[...points].sort((a,b)=>{
   if(source==="bottom")return a.y-b.y;
   if(source==="top")return b.y-a.y;
   if(source==="left")return b.x-a.x;
   return a.x-b.x;
  });
  const edge=ordered[0];
  const nearby=ordered.filter(p=>Math.hypot(p.x-edge.x,p.y-edge.y)<=Math.max(3,mode==="skin"?5:3)).slice(0,60);
  const px=nearby.reduce((s,p)=>s+p.x,0)/nearby.length;
  const py=nearby.reduce((s,p)=>s+p.y,0)/nearby.length;
  // Avoid background edge strips mistaken for a vertical pen.
  const tipProgress=source==="bottom"?(h-py)/h:
   source==="top"?py/h:source==="left"?px/w:(w-px)/w;
  if(tipProgress<(mode==="skin"?.22:.18))continue;
  if(mode==="skin"){
   if(points.length>w*h*.30)continue;
   if(bw/w>.85&&bh/h<.28)continue;
  }else{
   // Thin, elongated, connected dark object. A wide black keyboard or the
   // rectangular edge of a printed border is not a pen.
   const fill=points.length/(bw*bh);
   const aspect=Math.max(bw/(bh+1),bh/(bw+1));
   if(aspect<3.1||Math.min(bw,bh)>Math.max(w,h)*.075||fill<.045)continue;
  }
  out.push({x:px/w,y:py/h,kind:mode==="skin"?"finger":"pen",
   confidence:Math.min(.93,.45+.46*tipProgress),area:points.length/(w*h),
   side:source,bbox:[x0/w,y0/h,bw/w,bh/h]});
 }
 return out.sort((a,b)=>b.confidence-a.confidence);
}
export function detectImagePointer(image,{allowPen=true}={}){
 if(!image?.data||!image.width||!image.height)return null;
 const candidates=[];
 for(const mode of allowPen?["skin","pen"]:["skin"]){
  const {mask,w,h}=segment(image.data,image.width,image.height,mode);
  candidates.push(...components(mask,w,h,mode));
 }
 const best=candidates.sort((a,b)=>b.confidence-a.confidence);
 if(!best.length)return null;
 if(best.length>1&&best[1].confidence>best[0].confidence-.04&&
    Math.hypot(best[0].x-best[1].x,best[0].y-best[1].y)>.10)return null;
 return best[0];
}
