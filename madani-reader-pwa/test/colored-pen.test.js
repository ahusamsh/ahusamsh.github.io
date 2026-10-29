import test from "node:test";
import assert from "node:assert/strict";
import {findPointer} from "../src/local-pointer.js";
import {findColoredPen} from "../src/colored-pen.js";

const W=500,H=767;
const boxes=[
 {text:"ص",confidence:.99,box:[192/W,371/H,34/W,35/H]},
 {text:"ش",confidence:.99,box:[275/W,371/H,34/W,35/H]},
 {text:"س",confidence:.99,box:[358/W,371/H,34/W,35/H]}
];
const allowed=new Set(["ص","ش","س"]);
function scene(){
 const data=new Uint8ClampedArray(W*H*4);
 for(let i=0;i<W*H;i++){data[i*4]=244;data[i*4+1]=241;data[i*4+2]=238;data[i*4+3]=255}
 return {width:W,height:H,data};
}
function line(img,start,end,rgb,width){
 const [r,g,b]=rgb,delta=Math.hypot(end[0]-start[0],end[1]-start[1]),radius=width/2;
 for(let s=0;s<=delta;s+=.65){
  const x=Math.round(start[0]+s*(end[0]-start[0])/delta),y=Math.round(start[1]+s*(end[1]-start[1])/delta);
  for(let dy=-Math.ceil(radius);dy<=Math.ceil(radius);dy++){
   const yy=y+dy;if(yy<0||yy>=H)continue;
   for(let dx=-Math.ceil(radius);dx<=Math.ceil(radius);dx++){
    const xx=x+dx;if(xx<0||xx>=W||dx*dx+dy*dy>radius*radius)continue;
    const j=(yy*W+xx)*4;img.data[j]=r;img.data[j+1]=g;img.data[j+2]=b;
   }
  }
 }
}
test("no accidental selection with no pointer or a hand unrelated to the letter",()=>{
 const empty=scene();
 assert.equal(findPointer(empty,boxes,allowed),null);
 const corner=scene();
 line(corner,[0,208],[26,262],[195,127,106],24);
 assert.equal(findPointer(corner,boxes,allowed),null);
});
test("screenshot regression: yellow-black pencil with pink eraser aims at ش and not adjacent ص",()=>{
 const img=scene();
 line(img,[0,206],[238,357],[38,37,31],16);
 line(img,[0,206],[238,357],[231,185,36],12);
 line(img,[0,206],[238,357],[44,38,32],2);
 line(img,[239,359],[259,372],[165,159,155],12);
 line(img,[258,371],[274,382],[193,116,102],14);
 const marker=findColoredPen(img,boxes);
 assert.ok(marker,"long colored pencil must be found");
 assert.equal(marker.text,"ش");
 assert.equal(marker.kind,"pen");
 const result=findPointer(img,boxes,allowed);
 assert.equal(result?.kind,"pen");
 assert.equal(result?.text,"ش");
});
test("pink rubber eraser without an attached pencil does not masquerade as a finger",()=>{
 const image=scene();
 line(image,[260,365],[274,382],[193,116,102],16);
 assert.equal(findPointer(image,boxes,allowed),null);
});
test("distinct neighboring glyphs never share an OCR identity",()=>{
 const marker=scene();
 line(marker,[0,206],[238,357],[35,34,31],16);
 line(marker,[0,206],[238,357],[232,185,32],12);
 line(marker,[0,206],[238,357],[42,35,25],2);
 line(marker,[239,359],[259,372],[164,154,150],12);
 line(marker,[258,371],[274,382],[198,118,102],14);
 assert.equal(findPointer(marker,boxes,allowed)?.ocr.text,"ش");
});
