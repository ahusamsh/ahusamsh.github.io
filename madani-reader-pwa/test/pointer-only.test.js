import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {PointerVision} from "../src/pointer-vision.js";

const source=readFileSync(new URL("../src/reader-module.js",import.meta.url),"utf8");
test("pointing may start without MediaPipe hand landmarks",()=>{
 assert.match(source,/\(!s\.tracker&&!s\.pointerVision\)/);
 assert.match(source,/s\.pointerVision\.detect\(video,s\.lockedH,zones\)/);
 assert.match(source,/const pointer=new PointerVision\(\)/);
});
test("pointer selection needs two independent observations and never plays sound during a stale gap",()=>{
 assert.match(source,/t-s\.lastPointerScan>260/);
 assert.match(source,/t-s\.lastPointerSeenAt<530\)return/);
 assert.match(source,/if\(t-s\.seenAt<175\|\|s\.lastZone===zone\.id/);
});
test("no pointing is invented when the page pose or zones are absent",()=>{
 const vision=new PointerVision();
 assert.equal(vision.detect(null,null,[]),null);
 vision.dispose();
});
test("the previous proven handwriting/pen recognition remains optional, not a second QR scan",()=>{
 assert.match(source,/s\.phase==="scan"&&t-s\.lastScan>420/);
 assert.match(source,/s\.temporal\.update\(frame\)/);
 assert.doesNotMatch(source,/decideHybrid\(/);
});
