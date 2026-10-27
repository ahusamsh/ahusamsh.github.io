import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const s=readFileSync(new URL("../src/reader-module.js",import.meta.url),"utf8");
const say=s.slice(s.indexOf("async function say(zone)"),s.indexOf("function resize()"));
const loop=s.slice(s.indexOf("function loop(t)"),s.indexOf("async function start()"));
test("selected audio continues even if moving finger leaves zone during file fetch",()=>{
 assert.doesNotMatch(say,/s\.lastZone\s*!==\s*zone\.id/);
 assert.match(say,/s\.audioRequest\s*!==\s*request/);
 assert.match(say,/node\.start\(\)/);
});
test("QR scanner stops after scan phase so CPU is available for hand tracking",()=>{
 assert.match(loop,/s\.phase==="scan"&&t-s\.lastScan>420/);
 assert.doesNotMatch(loop,/s\.phase==="scan"\|\|s\.phase==="point"/);
});
test("visible finger and target states are reported; audio warmed after QR",()=>{
 assert.match(s,/s\.fingerVisible=true/);
 assert.match(s,/s\.fingerZone=zone\.id/);
 assert.match(s,/prefetchPageAudio\(currentRun,marker\.page\)/);
});
