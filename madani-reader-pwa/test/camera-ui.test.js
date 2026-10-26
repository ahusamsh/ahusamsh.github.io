import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const main=readFileSync(new URL("../src/main.js",import.meta.url),"utf8");
const moduleSource=readFileSync(new URL("../src/reader-module.js",import.meta.url),"utf8");
test("student screen is camera only, no PDF or timeline editor",()=>{
  assert.match(html,/reader-root/);
  assert.doesNotMatch(html,/<select|book-file|audio-file|page-selector|data-tab/);
});
test("module has standalone mount, cleanup and QR-first phase",()=>{
  assert.match(moduleSource,/export function mountMadaniReader/);
  assert.match(moduleSource,/phase="scan"/);
  assert.match(moduleSource,/function stop\(/);
  assert.match(moduleSource,/async function destroy\(/);
  assert.match(moduleSource,/lockFromQR/);
});
test("student can begin with one camera click",()=>{
  assert.match(moduleSource,/startButton\.addEventListener\("click",start\)/);
  assert.match(main,/mountMadaniReader/);
});
