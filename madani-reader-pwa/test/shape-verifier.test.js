import test from "node:test";
import assert from "node:assert/strict";
import {verifyPrintedShape,ShapeVerifier,invertHomography} from "../src/shape-verifier.js";
import {decideHybrid} from "../src/hybrid-decision.js";
const H=[1,0,0,0,1,0,0,0,1];
function raster({invert=false,cover=false}={}){
 const width=140,height=150,data=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const glyph=((x*17+y*7)%37<12)||((x-70)**2+(y-75)**2<400);
  let v=glyph?25:225;
  if(invert)v=255-v;
  if(cover&&(x-70)**2+(y-75)**2<440)v=85;
  const i=(y*width+x)*4;data[i]=data[i+1]=data[i+2]=v;data[i+3]=255;
 }
 return {width,height,data};
}
const zone={id:"w",box:[.22,.22,.56,.55]};
const tip={x:.5,y:.5};
test("shape cross-check confirms same printed glyph and nearby marks",()=>{
 const img=raster();const shape=verifyPrintedShape(img,img,H,zone,tip);
 assert.equal(shape.status,"match");assert.ok(shape.score>.95);
});
test("shape contradiction blocks playback even with strong page geometry",()=>{
 const actual=verifyPrintedShape(raster(),raster({invert:true}),H,zone,tip);
 assert.equal(actual.status,"mismatch");
 assert.equal(decideHybrid({geometryStrong:true,stableFrames:2,appearance:actual}).allow,false);
});
test("fingertip occlusion does not force OCR or reset page recognition",()=>{
 const shape=verifyPrintedShape(raster(),raster({cover:true}),H,zone,tip);
 assert.notEqual(shape.status,"mismatch");
 const decision=decideHybrid({geometryStrong:true,stableFrames:2,appearance:shape});
 assert.equal(decision.allow,true);
});
test("degenerate projection yields no verified shape",()=>{
 assert.equal(invertHomography(Array(9).fill(0)),null);
 assert.equal(verifyPrintedShape(raster(),raster(),Array(9).fill(0),zone,tip).status,"inconclusive");
});
test("shape verification remains local and can be initialized before a camera event",()=>{
 const verifier=new ShapeVerifier(raster());
 const result=verifier.verify(raster(),H,zone,tip);
 assert.equal(result.status,"match");
 verifier.dispose();assert.equal(verifier.reference,null);
});
