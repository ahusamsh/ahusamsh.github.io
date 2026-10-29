import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const source=readFileSync(new URL("../src/reader-module.js",import.meta.url),"utf8");
const pointer=source.slice(source.indexOf("function detectFinger(t)"),source.indexOf("function loop(t)"));

test("experimental page foreground pointer is disabled after false letter announcements",()=>{
 assert.doesNotMatch(source,/import\s*\{\s*PointerVision\s*\}/);
 assert.doesNotMatch(source,/pointerVision\.detect\(/);
 assert.doesNotMatch(source,/pointerFallbackCount/);
});
test("no detected hand landmark means no reading and no cached candidate",()=>{
 assert.match(pointer,/const tip=results\.landmarks\?\.\[0\]\?\.\[8\]/);
 assert.match(pointer,/if\(!tip\)\{/);
 assert.match(pointer,/s\.seen=null/);
 const from=pointer.indexOf("if(!tip){"),to=pointer.indexOf("s.fingerVisible=true",from);
 assert.ok(from>=0&&to>from);
 assert.doesNotMatch(pointer.slice(from,to),/say\(/);
});
test("hand selection needs consistent zone evidence before audio",()=>{
 assert.match(pointer,/if\(s\.seen!==zone\.id\)/);
 assert.match(pointer,/t-s\.seenAt<175/);
 assert.match(pointer,/say\(zone\)/);
});
test("motion tracking remains but QR is only scanned in scan phase",()=>{
 assert.match(source,/s\.temporal\.update\(frame\)/);
 assert.match(source,/s\.phase==="scan"&&t-s\.lastScan>420/);
});
