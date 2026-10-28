import test from "node:test";
import assert from "node:assert/strict";
import {decideHybrid} from "../src/hybrid-decision.js";
test("matches use both page position and verified visible glyph",()=>{
 assert.deepEqual(decideHybrid({geometryStrong:false,stableFrames:1,appearance:{status:"match"}}),
  {allow:true,reason:"geometry-and-appearance"});
});
test("clear contradictory glyph prevents wrong audio even with trusted page geometry",()=>{
 assert.deepEqual(decideHybrid({geometryStrong:true,stableFrames:3,appearance:{status:"mismatch"}}),
  {allow:false,reason:"clear-shape-mismatch"});
});
test("occluded letter uses reliable stable position without requiring OCR",()=>{
 assert.deepEqual(decideHybrid({geometryStrong:true,stableFrames:2,appearance:{status:"inconclusive"}}),
  {allow:true,reason:"strong-pose-with-occluded-letter"});
});
test("uncertain shape and unstable geometry never trigger audio",()=>{
 assert.equal(decideHybrid({geometryStrong:false,stableFrames:2,appearance:{status:"inconclusive"}}).allow,false);
 assert.equal(decideHybrid({geometryStrong:true,stableFrames:1,appearance:{status:"inconclusive"}}).allow,false);
});
