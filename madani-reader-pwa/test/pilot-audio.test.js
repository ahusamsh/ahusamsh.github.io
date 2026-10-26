import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {closestZone,validSegment} from '../src/core.js';
const data=JSON.parse(fs.readFileSync(new URL('../public/data/pilot-audio.json',import.meta.url)));
const expected={17:{printed:15,words:28,boxes:28},18:{printed:16,words:30,boxes:14},19:{printed:17,words:32,boxes:16}};
test('all 90 words belong to the correct source edition and printed folio',()=>{
 assert.equal(data.book.pdfPages,104);assert.match(data.book.sha256,/^[a-f0-9]{64}$/);assert.equal(Object.keys(data.segments).length,90);
 for(const [n,e] of Object.entries(expected)){const p=data.pages[n];assert.equal(p.printedPage,e.printed);assert.equal(p.pdfPage,Number(n));assert.equal(p.zones.length,e.words);assert.equal(p.boxes.length,e.boxes);assert.ok(p.source.qr.endsWith(`QM0${e.printed}`));}
});
test('each visual target maps to itself and belongs to exactly one physical box',()=>{
 for(const p of Object.values(data.pages))for(const z of p.zones){const [x,y,w,h]=z.box;assert.ok(x>=0&&y>=0&&w>0&&h>0&&x+w<=1&&y+h<=1);assert.equal(closestZone({x:x+w/2,y:y+h/2},p.zones)?.id,z.id);const parents=p.boxes.filter(b=>b.wordIds.includes(z.id));assert.equal(parents.length,1);assert.equal(parents[0].id,z.parentBoxId);const [bx,by,bw,bh]=parents[0].box;assert.ok(x>=bx-1e-6&&y>=by-1e-6&&x+w<=bx+bw+1e-6&&y+h<=by+bh+1e-6);}
});
test('the letter sequence and every repeated shape remain in RTL reading order',()=>{
 assert.deepEqual(data.pages[17].zones.map(z=>z.spokenText),['ألف','باء','تاء','ثاء','جيم','حاء','خاء','دال','ذال','راء','زاي','سين','شين','صاد','ضاد','طاء','ظاء','عين','غين','فاء','قاف','كاف','لام','ميم','نون','هاء','واو','ياء']);
 assert.equal(data.pages[18].zones.filter(z=>z.spokenText==='تاء').length,6);assert.ok(data.pages[18].zones.some(z=>z.text==='ة'));assert.ok(data.pages[18].zones.some(z=>z.text==='ـة'));
 for(const p of Object.values(data.pages))for(let i=1;i<p.zones.length;i++){const a=p.zones[i-1],b=p.zones[i];assert.ok(a.row<b.row||(a.row===b.row&&a.box[0]>b.box[0]));}
});
test('word timing is positive, non-overlapping, source-bound and not silently approved',()=>{
 for(const p of Object.values(data.pages)){let end=0;for(const z of p.zones){const s=data.segments[z.id];assert.ok(end<s.start&&s.start<s.end&&s.end<p.duration);assert.equal(s.sourceSha256,p.source.sha256);assert.equal(s.page,p.pdfPage);assert.equal(validSegment(s),false);assert.match(s.clip,/^\.\/pilot-media\/p0\d+-word-\d{3}\.mp3$/);end=s.end;}}
});
test('whole-box timing contains exactly its child words',()=>{
 for(const p of Object.values(data.pages))for(const b of p.boxes){const children=b.wordIds.map(id=>data.segments[id]);assert.equal(b.start,children[0].start);assert.equal(b.end,children.at(-1).end);assert.ok(children.every(s=>s.start>=b.start&&s.end<=b.end));assert.equal(b.reviewed,false);}
});
