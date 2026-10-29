import {buildGlyphTemplates,recognizeLocalGlyphs,selectGlyphNearPoint} from "./local-template-reader.js";
import {detectImagePointer} from "./image-pointer.js";
function median(arr){const s=[...arr].sort((a,b)=>a-b);return s.length?s[Math.floor(s.length/2)]:0;}
function translateCache(cached,current,frame){
 const pairs=[],used=new Set();
 const credible=g=>g.score<2.9&&g.margin>.12;
 for(const g of current.filter(credible)){
  const options=cached.map((c,i)=>({c,i,d:Math.hypot(c.center.x-g.center.x,c.center.y-g.center.y)}))
    .filter(o=>!used.has(o.i)&&o.c.text===g.text&&o.d<Math.max(60,frame.width*.10))
    .sort((a,b)=>a.d-b.d);
  if(!options.length)continue;
  used.add(options[0].i);pairs.push({dx:g.center.x-options[0].c.center.x,dy:g.center.y-options[0].c.center.y});
 }
 if(pairs.length<4)return null;
 const dx=median(pairs.map(p=>p.dx)),dy=median(pairs.map(p=>p.dy));
 const trusted=pairs.filter(p=>Math.hypot(p.dx-dx,p.dy-dy)<Math.max(7,frame.width*.013));
 if(trusted.length<4||trusted.length/pairs.length<.65)return null;
 return {dx,dy,matchCount:trusted.length};
}
export class LocalGlyphReadingSession{
 constructor({reference,zones}){
  this.templates=buildGlyphTemplates(reference,zones);
  this.knownZones=zones.filter(z=>this.templates.some(t=>t.label===z.text));
  this.cache=[];this.lastCacheAt=0;this.lastOcrAt=0;this.lastPointerAt=0;
  this.seen=null;this.seenCount=0;this.lastRead=null;this.lastReadAt=0;
  this.lastFrame=null;this.debug={status:"no-image",pointer:null};
 }
 reset(){this.cache=[];this.lastCacheAt=0;this.seen=null;this.seenCount=0;this.lastRead=null;this.lastPointerAt=0;}
 observe(frame,time){
  const pointer=detectImagePointer(frame);
  let current=null;
  if(time-this.lastOcrAt>440||this.lastOcrAt===0){
   this.lastOcrAt=time;
   current=recognizeLocalGlyphs(frame,this.templates);
  }
  if(!pointer){
   if(current?.length>=5){this.cache=current;this.lastCacheAt=time;}
   if(time-this.lastPointerAt>450){this.seen=null;this.seenCount=0;this.lastRead=null;}
   this.debug={status:"no-pointer",glyphs:this.cache.length,pointer:null};
   return null;
  }
  if(!this.cache.length){
   // Never guess a character from pointer + page layout; build a local
   // visual inventory first. The child may point from a later frame.
   this.debug={status:"reading-nearby-letters",pointer,glyphs:0};
   return null;
  }
  if(current?.length>=5){
   const movement=translateCache(this.cache,current,frame);
   if(movement&&Math.hypot(movement.dx,movement.dy)<Math.max(80,frame.width*.13)){
    this.cache=this.cache.map(g=>({...g,bbox:[g.bbox[0]+movement.dx,g.bbox[1]+movement.dy,...g.bbox.slice(2)],
      center:{x:g.center.x+movement.dx,y:g.center.y+movement.dy}}));
    this.lastCacheAt=time;
   }
  }
  const point={x:pointer.x*frame.width,y:pointer.y*frame.height};
  const radius=Math.max(30,frame.width*.06);
  const target=selectGlyphNearPoint(this.cache,point,{maxDistance:radius,minMargin:.08,maxScore:3.45});
  this.lastPointerAt=time;
  if(!target){
   this.seen=null;this.seenCount=0;
   this.debug={status:"ambiguous-near-pointer",pointer,glyphs:this.cache.length};
   return null;
  }
  if(this.seen?.text!==target.text||Math.hypot(this.seen.x-point.x,this.seen.y-point.y)>Math.max(24,frame.width*.04)){
   this.seen={text:target.text,x:point.x,y:point.y,since:time};this.seenCount=1;
   this.debug={status:"candidate",pointer,letter:target.text,score:target.score,margin:target.margin,observations:1};
   return null;
  }
  this.seenCount++;
  this.debug={status:"confirmed",pointer,letter:target.text,score:target.score,margin:target.margin,observations:this.seenCount};
  if(this.seenCount<2||time-this.seen.since<140)return null;
  if(this.lastRead===target.text&&time-this.lastReadAt<1400)return null;
  const zone=this.knownZones.find(z=>z.text===target.text);
  if(!zone)return null;
  this.lastRead=target.text;this.lastReadAt=time;
  return {zone,point,letter:target.text,method:"local-ocr",score:target.score,margin:target.margin};
 }
}
