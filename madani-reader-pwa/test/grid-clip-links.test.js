import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../public/',import.meta.url);
const read = file => JSON.parse(fs.readFileSync(new URL(file,root),'utf8'));
const lib=read('data/word-library.json');
const qa=read('data/word-library-validation.json');
const editions=read('data/editions.json');
const expected=new Map([[25,28],[28,28],[31,28],[39,28],[41,28],[43,28],[101,24]]);
const sum=[...expected.values()].reduce((a,b)=>a+b,0);

test('the published Madani reader retains the old catalog and adds 192 actual clips',()=>{
 assert.equal(Object.keys(lib.pages).length,104);
 assert.equal(Object.keys(editions.locales).length,19);
 assert.equal(qa.gridAlignedNewClips,sum);
 assert.equal(qa.gridAlignedPages,expected.size);
 assert.equal(qa.totalItems,8625+sum);
 assert.equal(lib.requiresHumanListeningApproval,true);
 assert.equal(qa.humanReviewed,0);
});

test('every exact-count grid cell points to its own playable audio file',()=>{
 const unique=new Set();
 const packaged=fs.existsSync(new URL('word-clips/',root));
 for(const [pdfPage,count] of expected){
  const page=lib.pages[String(pdfPage)];
  assert.ok(page,'page missing '+pdfPage);
  assert.equal(page.gridAudioLink.cellCount,count);
  assert.ok(page.gridAudioLink.agreement>=0.65);
  const items=page.items.map(id=>lib.wordItems[id]).filter(item=>item?.type==='printed-grid-cell');
  assert.equal(items.length,count);
  for(const [index,item] of items.entries()){
   assert.equal(item.pdfPage,pdfPage);
   assert.equal(item.row,Math.floor(index/(pdfPage===101?3:4)));
   assert.equal(item.reviewed,false,'auto-linked item was marked as human-approved');
   assert.equal(item.status,'machine-linked-requires-listening');
   assert.ok(item.end>item.start&&item.start>=0);
   assert.match(item.arabicText,/[\u0621-\u064a0-9]/);
   assert.match(item.clip,/^\.\/word-clips\/p\d+-grid-\d+\.mp3$/);
   assert.ok(!unique.has(item.clip),'clip reused by another word');
   unique.add(item.clip);
   const physical=new URL(item.clip.replace(/^\.\//,''),root);
   if(packaged){
    assert.ok(fs.existsSync(physical),'missing audio '+item.clip);
    assert.ok(fs.statSync(physical).size>300,'empty clip');
   } else {
    // CI intentionally omits binary media; official page timings remain usable.
    assert.match(page.pageAudioUrl,/^https:\/\//);
   }
   const [x,y,w,h]=item.box;
   assert.ok(x>=0&&y>=0&&w>0&&h>0&&x+w<=1.002&&y+h<=1.002);
  }
  for(let index=1;index<items.length;index++){
   assert.ok(items[index].start>=items[index-1].end-.36,
     'audio utterances out of order on page '+pdfPage);
  }
 }
 assert.equal(unique.size,sum);
});

test('translation overlays only use verified geometry',()=>{
 for(const [lang,record] of Object.entries(editions.locales)){
  assert.equal(record.audioLanguage,'ar');
  const map=read('data/edition-maps/'+lang+'.json');
  assert.ok(map.verifiedPages);
  for(const [page,entry] of Object.entries(map.verifiedPages)){
   for(const [itemId,rect] of Object.entries(entry.zoneBoxes)){
    if(lib.wordItems[itemId]?.type!=='printed-grid-cell')continue;
    assert.equal(lib.wordItems[itemId].pdfPage,Number(page));
    assert.equal(rect.length,4);
    assert.ok(rect.every(v=>Number.isFinite(v)&&v>=0&&v<=1));
   }
  }
 }
});
