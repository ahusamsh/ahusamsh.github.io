import test from "node:test";
import assert from "node:assert/strict";
import {project} from "../src/core.js";
import {plausiblePagePose,fromCropToFrame} from "../src/visual-matcher.js";
test("rejects degenerate and impossible page perspective from repeated glyph false matches",()=>{
 const bad=[-.1265277,-.1022165,.1824439,-.0332281,-.0268362,.0479046,-.6934367,-.5603119,1];
 assert.equal(plausiblePagePose(bad),false);
 assert.equal(plausiblePagePose([0,0,.5,0,0,.5,0,0,1]),false);
 assert.equal(plausiblePagePose([1,0,0,0,1,0,0,0,1]),true);
});
test("crop re-projection keeps the exact physical page coordinates",()=>{
 const crop={x:.08,y:.28,w:.81,h:.70};
 const candidate={H:[1,0,0,0,1,0,0,0,1],anchors:[{x:.20,y:.60,u:.20,v:.60}]};
 const result=fromCropToFrame(candidate,crop);
 const mapped=project(result.H,{x:.08+.81*.2,y:.28+.70*.6});
 assert.ok(Math.abs(mapped.x-.20)<1e-8);
 assert.ok(Math.abs(mapped.y-.60)<1e-8);
 assert.ok(Math.abs(result.anchors[0].x-(.08+.81*.2))<1e-8);
 assert.ok(Math.abs(result.anchors[0].y-(.28+.70*.6))<1e-8);
});
