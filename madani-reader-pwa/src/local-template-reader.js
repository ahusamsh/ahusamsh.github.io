// Printed Arabic letters recognized from local ink rather than page coordinates.
// Reference zone boxes are used ONLY when preparing known glyph exemplars.
// Camera runtime accepts partial pages; it never projects the page quadrilateral.
const SIDE=32;
function ink(pixels,i){
 const r=pixels[i],g=pixels[i+1],b=pixels[i+2];
 return r<165&&g<165&&b<165&&Math.abs(r-g)<29&&Math.abs(g-b)<31&&(.299*r+.587*g+.114*b)<142;
}
function normalizedMask(input,w,h){
 let left=w,top=h,right=-1,bottom=-1;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(input[y*w+x]){
  if(x<left)left=x;if(x>right)right=x;if(y<top)top=y;if(y>bottom)bottom=y;
 }
 if(right-left<1||bottom-top<3)return null;
 const tw=right-left+1,th=bottom-top+1;
 const canvas=new Uint8Array(SIDE*SIDE);
 // Preserve character aspect ratio, and avoid cropping dots/diacritics.
 const scale=Math.min((SIDE-7)/tw,(SIDE-7)/th);
 const ww=Math.max(1,Math.round(tw*scale)),hh=Math.max(1,Math.round(th*scale));
 const ox=Math.floor((SIDE-ww)/2),oy=Math.floor((SIDE-hh)/2);
 let pixels=0;
 for(let y=0;y<hh;y++)for(let x=0;x<ww;x++){
  const sx=Math.min(w-1,left+Math.floor((x+.5)/scale));
  const sy=Math.min(h-1,top+Math.floor((y+.5)/scale));
  if(input[sy*w+sx]){canvas[(oy+y)*SIDE+ox+x]=1;pixels++}
 }
 if(pixels<7)return null;
 return {data:canvas,pixels,ratio:tw/th};
}
function distanceTransform(binary){
 const d=new Float32Array(SIDE*SIDE);d.fill(99);
 for(let y=0;y<SIDE;y++)for(let x=0;x<SIDE;x++){
  const i=y*SIDE+x;
  if(binary[i]){d[i]=0;continue}
  if(x)d[i]=Math.min(d[i],d[i-1]+1);
  if(y)d[i]=Math.min(d[i],d[i-SIDE]+1);
  if(y&&x)d[i]=Math.min(d[i],d[i-SIDE-1]+1.414);
  if(y&&x+1<SIDE)d[i]=Math.min(d[i],d[i-SIDE+1]+1.414);
 }
 for(let y=SIDE-1;y>=0;y--)for(let x=SIDE-1;x>=0;x--){
  const i=y*SIDE+x;
  if(x+1<SIDE)d[i]=Math.min(d[i],d[i+1]+1);
  if(y+1<SIDE)d[i]=Math.min(d[i],d[i+SIDE]+1);
  if(y+1<SIDE&&x+1<SIDE)d[i]=Math.min(d[i],d[i+SIDE+1]+1.414);
  if(y+1<SIDE&&x)d[i]=Math.min(d[i],d[i+SIDE-1]+1.414);
 }
 return d;
}
function distance(a,b){
 if(!a||!b)return Infinity;
 const db=b.dist||distanceTransform(b.data),da=a.dist||distanceTransform(a.data);
 let aa=0,bb=0,countA=0,countB=0,intersect=0;
 for(let i=0;i<a.data.length;i++){
  if(a.data[i]){aa+=Math.min(db[i],7);countA++;if(b.data[i])intersect++}
  if(b.data[i]){bb+=Math.min(da[i],7);countB++}
 }
 if(!countA||!countB)return Infinity;
 return .5*(aa/countA+bb/countB)+1.7*Math.abs(a.pixels-b.pixels)/(Math.max(a.pixels,b.pixels)+1);
}
function getInkMask(image,rect){
 const x0=Math.max(0,Math.floor(rect.x)),y0=Math.max(0,Math.floor(rect.y));
 const x1=Math.min(image.width,Math.ceil(rect.x+rect.w)),y1=Math.min(image.height,Math.ceil(rect.y+rect.h));
 const w=x1-x0,h=y1-y0;if(w<2||h<2)return null;
 const pixels=new Uint8Array(w*h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=((y+y0)*image.width+x+x0)*4;
  pixels[y*w+x]=ink(image.data,i)?1:0;
 }
 return {data:pixels,w,h,x:x0,y:y0};
}
export function buildGlyphTemplates(image,zones){
 const byLabel=new Map();
 for(const zone of zones){
  const [zx,zy,zw,zh]=zone.box;
  // Deliberately strip the green cell frame; keep the full glyph and dots.
  const rect={x:(zx+zw*.11)*image.width,y:(zy+zh*.08)*image.height,
    w:zw*.78*image.width,h:zh*.84*image.height};
  const sub=getInkMask(image,rect);
  if(!sub)continue;
  const mask=normalizedMask(sub.data,sub.w,sub.h);
  if(!mask)continue;
  const label=String(zone.text||"").normalize("NFC");
  if(!label)continue;
  mask.dist=distanceTransform(mask.data);
  const item={label,mask,zoneId:zone.id};
  const bucket=byLabel.get(label)||[];bucket.push(item);byLabel.set(label,bucket);
 }
 return [...byLabel.values()].flat();
}
// Morphological binary dilation groups a letter's isolated dots with its body.
function components(binary,width,height,radius){
 const exp=new Uint8Array(binary.length);
 for(let y=radius;y<height-radius;y++)for(let x=radius;x<width-radius;x++){
  if(!binary[y*width+x])continue;
  for(let yy=-radius;yy<=radius;yy++)for(let xx=-radius;xx<=radius;xx++)
   if(xx*xx+yy*yy<=radius*radius)exp[(y+yy)*width+x+xx]=1;
 }
 const seen=new Uint8Array(exp.length),out=[];
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const seed=y*width+x;if(!exp[seed]||seen[seed])continue;
  const q=[seed];seen[seed]=1;
  let x0=x,y0=y,x1=x,y1=y;
  for(let k=0;k<q.length;k++){
   const j=q[k],xx=j%width,yy=(j/width)|0;
   if(xx<x0)x0=xx;if(xx>x1)x1=xx;if(yy<y0)y0=yy;if(yy>y1)y1=yy;
   for(const n of [j-1,j+1,j-width,j+width]){
    if(n<0||n>=exp.length||seen[n]||!exp[n])continue;
    if(n===j-1&&xx===0||n===j+1&&xx===width-1)continue;
    seen[n]=1;q.push(n);
   }
  }
  const w=x1-x0+1,h=y1-y0+1;
  if(w<6||h<9||w>width*.30||h>height*.24||q.length<35)continue;
  let actual=0;
  const inner=new Uint8Array(w*h);
  for(let yy=y0;yy<=y1;yy++)for(let xx=x0;xx<=x1;xx++){
   if(binary[yy*width+xx]){inner[(yy-y0)*w+xx-x0]=1;actual++}
  }
  if(actual<7)continue;
  // Cut the dilation margin and normalize just the printed ink.
  const normalized=normalizedMask(inner,w,h);
  if(normalized)out.push({box:[x0,y0,w,h],mask:normalized,area:actual});
 }
 return out;
}
export function recognizeLocalGlyphs(image,templates,{roi=null,maxCandidates=80}={}){
 if(!image?.data||!templates?.length)return [];
 const clip=roi||{x:0,y:0,w:image.width,h:image.height};
 const scale=Math.min(1,640/image.width);
 const width=Math.round(image.width*scale),height=Math.round(image.height*scale);
 const source=document.createElement("canvas");source.width=width;source.height=height;
 const ctx=source.getContext("2d",{willReadFrequently:true});
 const original=document.createElement("canvas");original.width=image.width;original.height=image.height;
 original.getContext("2d").putImageData(image,0,0);
 ctx.drawImage(original,0,0,width,height);
 const small=ctx.getImageData(0,0,width,height);
 const bin=new Uint8Array(width*height);
 const lx=Math.floor(clip.x*scale),ly=Math.floor(clip.y*scale);
 const rx=Math.ceil((clip.x+clip.w)*scale),by=Math.ceil((clip.y+clip.h)*scale);
 for(let y=Math.max(1,ly);y<Math.min(height-1,by);y++)for(let x=Math.max(1,lx);x<Math.min(width-1,rx);x++)
  bin[y*width+x]=ink(small.data,(y*width+x)*4)?1:0;
 const radius=Math.max(3,Math.round(width*.006));
 const found=components(bin,width,height,radius).slice(0,maxCandidates);
 const results=[];
 for(const comp of found){
  const list=templates.map(t=>({label:t.label,score:distance(comp.mask,t.mask)})).sort((a,b)=>a.score-b.score);
  // Collapse duplicates of the same label to prevent rejecting identical
  // printed letters that occur repeatedly on the page.
  const labels=[];for(const t of list)if(!labels.some(x=>x.label===t.label))labels.push(t);
  const best=labels[0],second=labels[1];
  if(!best)continue;
  results.push({text:best.label,candidates:labels.slice(0,3),score:best.score,
    margin:(second?.score??9)-best.score,
    bbox:comp.box.map(v=>v/scale),
    center:{x:(comp.box[0]+comp.box[2]/2)/scale,y:(comp.box[1]+comp.box[3]/2)/scale}});
 }
 return results;
}
export function selectGlyphNearPoint(glyphs,point,{maxDistance=85,minMargin=.16,maxScore=2.6}={}){
 if(!point)return null;
 const candidates=glyphs.map(g=>{
  const [x,y,w,h]=g.bbox;
  const dx=Math.max(x-point.x,0,point.x-(x+w));
  const dy=Math.max(y-point.y,0,point.y-(y+h));
  return {...g,pointDistance:Math.hypot(dx,dy)};
 }).filter(g=>g.pointDistance<=maxDistance).sort((a,b)=>a.pointDistance-b.pointDistance);
 if(!candidates.length)return null;
 const hit=candidates[0];
 if(hit.score>maxScore||hit.margin<minMargin)return null;
 if(candidates[1]&&candidates[1].pointDistance-hit.pointDistance<10)return null;
 return hit;
}
