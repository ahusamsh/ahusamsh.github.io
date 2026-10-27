import test from "node:test";
import assert from "node:assert/strict";
import {reliableMatch,strongMovingMatch,geometryAgrees} from "../src/alignment-quality.js";
test("real photo scenario: 50 inliers with 10% global visual contrast is valid",()=>{
 const r={page:17,inliers:50,ratio:.42,visual:.10};
 assert.equal(strongMovingMatch(r,17),true);
 assert.equal(reliableMatch(r,17),true);
});
test("wrong page or low geometry confidence never triggers audio",()=>{
 assert.equal(reliableMatch({page:19,inliers:50,ratio:.7},17),false);
 assert.equal(reliableMatch({page:17,inliers:10,ratio:.4},17),false);
 assert.equal(reliableMatch({page:17,inliers:50,ratio:.1},17),false);
});
test("strong match is accepted despite rapid handheld camera motion",()=>{
 const r={page:17,inliers:46,ratio:.39,visual:.07};
 assert.equal(strongMovingMatch(r,17),true);
});
test("similar homographies agree while abrupt misalignment is rejected",()=>{
 const H=[1,0,0,0,1,0,0,0,1],near=[1,0,.025,0,1,.02,0,0,1],far=[1,0,.17,0,1,-.13,0,0,1];
 assert.equal(geometryAgrees({H},{H:near}),true);
 assert.equal(geometryAgrees({H},{H:far}),false);
});
