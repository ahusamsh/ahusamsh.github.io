import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const root=new URL("../public/",import.meta.url);
const get=file=>JSON.parse(fs.readFileSync(new URL(file,root),"utf8"));
const words=get("data/word-library.json");
const qa=get("data/word-library-validation.json");
const pageCover=get("data/translation-page-coverage.json");
const numericCover=get("data/numeric-translation-coverage.json");
const mapExpected={26:24,27:24,29:24,30:24,32:24,33:24,34:28,35:16,36:16};
const binaryPresent=fs.existsSync(new URL("word-clips/",root));
const allLocales=["bn","en","es","fa","ff","fr","ha","hi","id","it","ml","ms","pt","ru","sq","sw","ur","zh"];

test("all 104 canonical pages, 18 translations, no claimed human review",()=>{
 assert.equal(Object.keys(words.pages).length,104);
 assert.equal(Object.keys(pageCover).length,18);
 assert.equal(qa.totalItems,Object.keys(words.wordItems).length);
 assert.equal(qa.humanReviewed,0);
 assert.equal(words.requiresHumanListeningApproval,true);
 assert.equal(qa.status,"machine-generated-unreviewed");
 assert.equal(qa.patternAlignedPages,9);
 assert.equal(qa.patternAlignedNewClips,204);
 assert.equal(qa.asrVerifiedNewWordLinks,56);
});

test("all 204 additional phonics syllables/words match actual printed cells",()=>{
 let total=0;
 for(const [pdfText,count] of Object.entries(mapExpected)){
  const pdf=Number(pdfText);
  const rec=words.pages[pdfText];
  assert.equal(rec.gridAudioLink.cellCount,count);
  assert.equal(rec.gridAudioLink.recorded,rec.gridAudioLink.expected);
  assert.ok(rec.gridAudioLink.asrAgreement>=.63);
  const items=rec.items.map(id=>words.wordItems[id]).filter(w=>w?.method?.includes("progressive-word")||w?.method==="four-column-repeat-two");
  assert.equal(items.length,count,"PDF "+pdf);
  for(const item of items){
   assert.equal(item.reviewed,false);
   assert.equal(item.status,"pattern-aligned-requires-listening");
   assert.equal(item.pdfPage,pdf);
   assert.ok(item.end>item.start&&item.start>=0);
   assert.match(item.clip,/^\.\/word-clips\/p\d+-phonics-r\d+-c\d+\.mp3$/);
   assert.ok(item.readingUnit==="phonics-fragment"||item.readingUnit==="full-word");
   assert.equal(item.box.length,4);
   assert.ok(item.box.every(x=>Number.isFinite(x)&&x>=0&&x<=1));
   assert.ok(item.box[0]+item.box[2]<=1.001);
   if(binaryPresent){
    const audio=new URL(item.clip.replace(/^\.\//,""),root);
    assert.ok(fs.existsSync(audio));
    assert.ok(fs.statSync(audio).size>350);
   }else{
    assert.match(rec.pageAudioUrl,/^https:\/\//);
   }
   total++;
  }
 }
 assert.equal(total,204);
});

test("word-specific ASR matches are monotone and never auto-approved",()=>{
 let count=0;
 for(const [n,page] of Object.entries(words.pages)){
  const selected=page.items.map(id=>words.wordItems[id]).filter(w=>w?.method==="printed-cell-monotone-asr-silence-verified");
  let prevStart=-1;
  for(const item of selected){
   assert.equal(item.pdfPage,Number(n));
   assert.equal(item.readingUnit,"full-word");
   assert.equal(item.reviewed,false);
   assert.equal(item.status,"asr-text-match-requires-listening");
   assert.ok(item.start>=0&&item.end>item.start);
   assert.ok(item.start>=prevStart);
   prevStart=item.start;
   assert.equal(item.box.length,4);
  }
  count+=selected.length;
 }
 assert.equal(count,56);
});

test("all 18 translated editions have distinct physical page mapping",()=>{
 const counts=[];
 for(const code of allLocales){
  const map=get("data/edition-maps/"+code+".json");
  const coverage=pageCover[code];
  assert.equal(Object.keys(map.pageIndex).length,coverage.indexed);
  assert.ok(coverage.indexed>=100,"Low coverage "+code);
  assert.ok(map.pdfPageCount>=102);
  const used=new Set();
  for(const [n,rec] of Object.entries(map.pageIndex)){
   assert.ok(Number(n)>=3&&Number(n)<=104);
   assert.equal(rec.printedPage,Number(n)-2);
   assert.ok(rec.pdfPage>=1&&rec.pdfPage<=map.pdfPageCount);
   assert.ok(!used.has(rec.pdfPage),"Duplicate target "+code+":"+rec.pdfPage);
   used.add(rec.pdfPage);
   const verified=map.verifiedPages[n];
   if(rec.zonesVerified){
    assert.ok(verified&&verified.pdfPage===rec.pdfPage);
   }
  }
  counts.push(coverage.indexed);
 }
 assert.ok(Math.min(...counts)>=100);
});

test("numeric lesson is matched by PDF glyphs or independently verified rasters in all 18 translations",()=>{
 assert.equal(Object.keys(numericCover).length,18);
 assert.equal(Object.values(numericCover).reduce((a,v)=>a+v.mapped,0),378);
 for(const [code,details] of Object.entries(numericCover)){
  const map=get("data/edition-maps/"+code+".json");
  const p=map.verifiedPages["101"];
  assert.ok(p,"Missing numeric geometry in "+code);
  assert.equal(p.pdfPage,details.pdfPage);
  const rows=p.numericWordMapping;
  assert.equal(rows.humanListeningApproved,false);
  assert.equal(rows.mapped,details.mapped);
  for(let n=0;n<details.printed;n++){
   const id="p101-grid-"+String(n+1).padStart(3,"0");
   if(!p.zoneBoxes[id])continue;
   const box=p.zoneBoxes[id];
   assert.ok(box.length===4&&box.every(v=>v>=0&&v<=1));
   assert.equal(words.wordItems[id].arabicText,String(n));
  }
 }
 for(const code of ["fa","ur"]){
  const map=get("data/edition-maps/"+code+".json");
  const status=map.verifiedPages["101"].numericWordMapping;
  assert.equal(status.method,"raster-fingerprint-verified-21-digit-grid");
  assert.ok(status.f1Median>=.88);
  assert.ok(status.f1Minimum>=.6);
  assert.ok(status.f1Above075>=18);
  assert.equal(status.humanListeningApproved,false);
 }
});
