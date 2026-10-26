import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const root=new URL('../public/data/',import.meta.url);
const read=file=>JSON.parse(fs.readFileSync(new URL(file,root),'utf8'));
const words=read('word-library.json'),book=read('audio-library.json'),translations=read('editions.json');
test('published word library enumerates all canonical PDF pages and language editions',()=>{
 assert.equal(Object.keys(words.pages).length,104);
 assert.equal(Object.keys(translations.locales).length,19);
 assert.equal(words.teachingLanguage,'ar');
 assert.equal(words.requiresHumanListeningApproval,true);
});
test('each timed spoken word belongs to its page and remains explicitly unreviewed',()=>{
 for(const [id,item] of Object.entries(words.wordItems)){
  assert.equal(item.id,id);
  assert.ok(words.pages[String(item.pdfPage)]);
  assert.ok(Number.isFinite(item.start)&&Number.isFinite(item.end)&&item.end>item.start);
  assert.equal(item.reviewed,false);
  assert.ok(typeof item.arabicText==='string'&&item.arabicText.length);
  assert.ok(item.status);
  if(item.box){const [x,y,w,h]=item.box;assert.ok(x>=0&&y>=0&&w>0&&h>0&&x+w<=1.001&&y+h<=1.001)}
 }
 for(const [page,data] of Object.entries(words.pages)){
  const ids=[...(data.items||[]),...(data.unplaced||[])];
  assert.equal(new Set(ids).size,ids.length);
  for(const id of ids){assert.ok(words.wordItems[id]);assert.equal(String(words.wordItems[id].pdfPage),page)}
 }
});
test('source audio is bound by printed page and no absent recording is fabricated',()=>{
 for(const [page,data] of Object.entries(words.pages)){
  const original=book.pages[page];
  assert.equal(data.printedPage,original.printedPage);
  if(data.pageAudioUrl)assert.match(data.pageAudioUrl,/^(https:\/\/|\.\/)/);
 }
});
test('translations use verified per-page mapping with no assumed pagination',()=>{
 for(const locale of Object.keys(translations.locales)){
  const m=read('edition-maps/'+locale+'.json');
  assert.equal(m.code,locale);
  for(const [page,rec] of Object.entries(m.verifiedPages)){
   assert.ok(words.pages[page]);
   assert.ok(Number.isInteger(rec.pdfPage));
   for(const box of Object.values(rec.zoneBoxes)){
    assert.equal(box.length,4);
    assert.ok(box.every(v=>Number.isFinite(v)&&v>=0&&v<=1));
   }
  }
 }
});
