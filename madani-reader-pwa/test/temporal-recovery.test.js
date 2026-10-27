import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {TemporalPageTracker} from "../src/temporal-tracker.js";
const src=readFileSync(new URL("../src/reader-module.js",import.meta.url),"utf8");
test("temporal tracker resets and can safely be asked to update without a page",()=>{
 const tracker=new TemporalPageTracker();
 assert.equal(tracker.update({width:100,height:100}),null);
 tracker.reset();assert.equal(tracker.previous,null);assert.deepEqual(tracker.anchors,[]);
});
test("lost page geometry reacquires without resetting the QR page",()=>{
 const start=src.indexOf("function align()");
 const end=src.indexOf("function detectFinger(t)",start);
 const flow=src.slice(start,end);
 assert.match(flow,/s\.temporal\.update\(frame\)/);
 assert.match(flow,/s\.matcher\.detect\(frame\)/);
 assert.doesNotMatch(flow,/showPhase\("scan"\)/);
 assert.doesNotMatch(flow,/resetPage\(\)/);
});
test("camera mode prioritizes low-cost optical flow and retains QR state",()=>{
 assert.match(src,/now-s\.lastFullMatch<4500/);
 assert.match(src,/s\.temporal\.seed\(frame,result\)/);
 assert.match(src,/s\.phase==="scan"&&t-s\.lastScan>420/);
});
test("finger can select the same letter again after being lifted",()=>{
 assert.match(src,/t-s\.lastFingerSeen>330\)s\.lastZone=null/);
 assert.match(src,/t-s\.lastZoneLostAt>340\)s\.lastZone=null/);
});
test("no audio triggering when page pose has been stale",()=>{
 assert.match(src,/t-s\.lastAligned>1450\)return/);
});
