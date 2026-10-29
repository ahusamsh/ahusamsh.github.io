import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {canonicalArabic,chooseNearbyOCR,detectionBoxes,decodeCTC} from "../src/local-ocr.js";
import {findPointer} from "../src/local-pointer.js";

const ALLOWED=new Set(["ش","س"]);
test("OCR chooses recognized glyph near the pointer without printed page geometry",()=>{
 assert.equal(canonicalArabic("شَـ"),"ش");
 const boxes=[
  {text:"ش",confidence:.98,box:[.40,.40,.05,.05]},
  {text:"س",confidence:.97,box:[.52,.40,.05,.05]}
 ];
 assert.equal(chooseNearbyOCR(boxes,{x:.425,y:.425},ALLOWED)?.text,"ش");
 assert.equal(chooseNearbyOCR(boxes,{x:.545,y:.425},ALLOWED)?.text,"س");
 assert.equal(chooseNearbyOCR(boxes,{x:.15,y:.425},ALLOWED),null);
 assert.equal(chooseNearbyOCR(boxes,{x:.485,y:.425},ALLOWED,{radius:.07}),null);
});
test("low OCR confidence and text outside the lesson cannot trigger audio",()=>{
 const boxes=[{text:"ن",confidence:.99,box:[.3,.3,.05,.05]},{text:"ش",confidence:.31,box:[.4,.3,.05,.05]}];
 assert.equal(chooseNearbyOCR(boxes,{x:.42,y:.33},ALLOWED),null);
});
test("detector finds glyph regions even without a complete page",()=>{
 const w=100,h=100,probs=new Float32Array(w*h);
 for(let y=7;y<15;y++)for(let x=9;x<16;x++)probs[y*w+x]=.87;
 const result=detectionBoxes(probs,w,h,250,250);
 assert.equal(result.length,1);
 assert.ok(result[0][0]>=20&&result[0][2]>10);
});
test("CTC decoding collapses repeated tokens",()=>{
 const outputs=new Float32Array([1,0,0,0,1,0,0,1,0,1,0,0,0,0,1]);
 const decoded=decodeCTC(outputs,1,5,3,["","ش","س"]);
 assert.equal(decoded[0].text,"شس");
});
test("no pointer on a blank frame means silence",()=>{
 const w=300,h=320,data=new Uint8ClampedArray(w*h*4);
 for(let i=0;i<w*h;i++){data[4*i]=data[4*i+1]=data[4*i+2]=240;data[4*i+3]=255}
 assert.equal(findPointer({width:w,height:h,data},[{text:"ش",confidence:.99,box:[.5,.5,.04,.05]}],new Set(["ش"])),null);
});
test("old reader remains the default, OCR is opt-in",()=>{
 const reader=readFileSync(new URL("../src/reader-module.js",import.meta.url),"utf8");
 const main=readFileSync(new URL("../src/main.js",import.meta.url),"utf8");
 assert.match(reader,/recognitionMode="geometry"/);
 assert.match(reader,/if\(localMode\)/);
 assert.match(reader,/s\.temporal\.update\(frame\)/);
 assert.match(main,/recognition/);
});
