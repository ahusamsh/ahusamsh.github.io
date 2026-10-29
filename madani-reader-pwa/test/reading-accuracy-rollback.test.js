import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const source = readFileSync(new URL("../src/reader-module.js", import.meta.url),"utf8");
const finger = source.slice(source.indexOf("function detectFinger(t)"),source.indexOf("function loop(t)"));

test("restored reading selects sound from a stable page zone without experimental shape gating",()=>{
 assert.match(finger,/const zone=p&&/);
 assert.match(finger,/closestZone\(p,page\?\.zones\|\|\[\]\)/);
 assert.match(finger,/say\(zone\)/);
 assert.doesNotMatch(finger,/decideHybrid|shapeVerifier|clear-shape-mismatch/);
});
test("QR remains single scan, and occlusion does not require rescanning",()=>{
 assert.match(source,/s\.phase==="scan"&&t-s\.lastScan>420/);
 assert.match(source,/s\.temporal\.update\(frame\)/);
 assert.match(source,/s\.matcher\.detect\(frame\)/);
});
