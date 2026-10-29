import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {detectImagePointer} from "../src/image-pointer.js";

function scene(mode){
 const w=360,h=500,data=new Uint8ClampedArray(w*h*4);
 for(let i=0;i<data.length;i+=4){data[i]=243;data[i+1]=236;data[i+2]=227;data[i+3]=255}
 if(mode==="skin"||mode==="pen"){
  for(let y=290;y<h;y++){
   const x=200+Math.round((y-290)*.1),radius=mode==="skin"?12:3;
   for(let xx=x-radius;xx<=x+radius;xx++){
    if(xx<0||xx>=w)continue;
    const i=(y*w+xx)*4;
    const rgb=mode==="skin"?[157,104,77]:[30,32,35];
    data[i]=rgb[0];data[i+1]=rgb[1];data[i+2]=rgb[2];
   }
  }
 }
 if(mode==="shadow")for(let y=430;y<h;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4;data[i]=120;data[i+1]=100;data[i+2]=96;
 }
 return {width:w,height:h,data};
}
test("plain paper and broad shadows never create a pointing letter",()=>{
 assert.equal(detectImagePointer(scene("clean")),null);
 assert.equal(detectImagePointer(scene("shadow")),null);
});
test("visible fingertip and pen end can be found without a hand model",()=>{
 for(const mode of ["skin","pen"]){
  const result=detectImagePointer(scene(mode));
  assert.ok(result,"expected "+mode+" to be detected");
  assert.equal(result.kind,mode==="skin"?"finger":"pen");
  assert.ok(Math.abs(result.x*360-200)<35);
  assert.ok(Math.abs(result.y*500-290)<28);
 }
});
test("local reading never refers to the stored page's target coordinates for selection",()=>{
 const src=readFileSync(new URL("../src/local-reading-session.js",import.meta.url),"utf8");
 assert.match(src,/recognizeLocalGlyphs\(/);
 assert.match(src,/detectImagePointer\(/);
 assert.match(src,/selectGlyphNearPoint\(/);
 assert.doesNotMatch(src,/project\(|lockedH|closestZone\(|homography\(/);
});
test("reader uses direct glyph mode for printed page 15, without requiring complete page",()=>{
 const src=readFileSync(new URL("../src/reader-module.js",import.meta.url),"utf8");
 assert.match(src,/if\(page\.printedPage===15\)/);
 assert.match(src,/s\.localSession\.observe\(data,t\)/);
 assert.match(src,/if\(s\.phase==="point"&&s\.localSession&&t-s\.lastLocal>320\)/);
});
