import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {OCRFrameMotion} from "../src/local-motion.js";

const reader=readFileSync(new URL("../src/reader-module.js",import.meta.url),"utf8");
test("slow mobile OCR uses completion time not inference start for freshness",()=>{
 assert.match(reader,/s\.ocrStartedAt=stamp/);
 assert.match(reader,/s\.ocrAt=performance\.now\(\)/);
 assert.match(reader,/t-s\.ocrAt>Math\.max\(3800,2\*s\.localOCR\.lastDuration\+1200\)/);
});
test("do not scan pointer while OCR is replacing frame context",()=>{
 assert.match(reader,/if\(!s\.localReady\|\|s\.ocrBusy\|\|!s\.ocrBoxes\.length/);
});
test("OCR scans remain separate from page geometry and do not churn during a candidate",()=>{
 assert.match(reader,/!s\.localCandidate&&t>s\.coolUntil/);
 assert.match(reader,/recognitionMode="geometry"/);
 assert.match(reader,/const matches=page\.zones\.filter\(z=>s\.localNormalize\(z\.text\)===pointer\.text\)/);
});
test("motion tracking accumulates small handset translations instead of comparing indefinitely to first frame",()=>{
 const tracker=new OCRFrameMotion();
 assert.equal(tracker.track({videoWidth:0},[]),null);
 assert.equal(tracker.shiftedBoxes,null);
 tracker.reset();
 assert.equal(tracker.original,null);
 const motion=readFileSync(new URL("../src/local-motion.js",import.meta.url),"utf8");
 assert.match(motion,/this\.original=current/);
 assert.match(motion,/this\.shiftedBoxes=shifted/);
});
test("diagnostics are opt-in and never upload camera images",()=>{
 assert.match(reader,/debugMode=localMode&&new URLSearchParams\(window\.location\.search\)\.has\("diagnostics"\)/);
 assert.match(reader,/localPointerMisses/);
 assert.doesNotMatch(reader,/fetch\(.*frame|uploadCamera|sendImageToServer/);
});
