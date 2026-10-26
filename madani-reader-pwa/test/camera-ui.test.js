import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const css=readFileSync(new URL("../src/style.css",import.meta.url),"utf8");
const main=readFileSync(new URL("../src/main.js",import.meta.url),"utf8");
test("camera placeholder is truly hidden despite the ID display:grid rule",()=>{
  assert.match(css,/#camera-placeholder\[hidden\]\s*\{\s*display:\s*none\s*!important\s*\}/);
});
test("camera opens on user-initiated tab selection and retains retry button",()=>{
  assert.match(main,/if\(b\.dataset\.tab==="camera"\)startCamera\(\)/);
  assert.match(main,/\$\("camera-on"\)\.onclick=startCamera/);
});
test("camera permissions and browser errors show an actionable message",()=>{
  assert.match(main,/NotAllowedError/);
  assert.match(main,/NotReadableError/);
  assert.match(main,/placeholder\.textContent=msg/);
});
