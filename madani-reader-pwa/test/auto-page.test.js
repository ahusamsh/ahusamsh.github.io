import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {markerFromUrl,markerGeometry,AutoPageVision} from "../src/page-vision.js";
import {closestZone} from "../src/core.js";
const pilot=JSON.parse(fs.readFileSync(new URL("../public/data/pilot-audio.json",import.meta.url),"utf8"));
const markers=[
 {page:17,printed:15,code:"QM015",box:[.054673,.021840,.082844,.058599]},
 {page:18,printed:16,code:"QM016",box:[.862319,.021840,.082845,.058599]},
 {page:19,printed:17,code:"QM017",box:[.054673,.022673,.082844,.058599]}
];
test("all three official QR identifiers select correct PDF page",()=>{
 for(const x of markers){assert.equal(markerFromUrl("https://go.alqasim.com/"+x.code)?.page,x.page)}
 assert.equal(markerFromUrl("https://go.alqasim.com/QM088"),null);
});
test("unknown QR cannot trigger any page",()=>assert.equal(markerGeometry("https://unknown/QM088",[],850,1180),null));
test("a page marker automatically maps fingertip to the matching letter, no calibration",()=>{
 for(const m of markers){
  const [x,y,w,h]=m.box;
  const corners=[{x:x*850,y:y*1180},{x:(x+w)*850,y:y*1180},{x:(x+w)*850,y:(y+h)*1180},{x:x*850,y:(y+h)*1180}];
  const result=markerGeometry("https://go.alqasim.com/"+m.code,corners,850,1180);
  assert.equal(result.page,m.page);
  const z=pilot.pages[m.page].zones[0];
  const tip={x:z.box[0]+z.box[2]/2,y:z.box[1]+z.box[3]/2};
  const mapped=AutoPageVision.prototype.pointInPage.call(null,result,tip);
  assert.ok(mapped);
  assert.ok(Math.abs(mapped.x-tip.x)<.0001&&Math.abs(mapped.y-tip.y)<.0001);
  assert.equal(closestZone(mapped,pilot.pages[m.page].zones)?.id,z.id);
 }
});

test("actual printed QR uses BookSound/page15.mp3 and maps to PDF page 17",()=>{
 assert.equal(markerFromUrl("https://a-alqasim.com/App/BookSound/page15.mp3")?.page,17);
 assert.equal(markerFromUrl("https://www.a-alqasim.com/App/BookSound/page016.mp3")?.page,18);
 assert.equal(markerFromUrl("http://a-alqasim.com/App/BookSound/page17.mp3")?.page,19);
 assert.equal(markerFromUrl("https://a-alqasim.com/App/BookSound/page99.mp3"),null);
 assert.equal(markerFromUrl("https://evil.example/App/BookSound/page15.mp3"),null);
 assert.equal(markerFromUrl("https://evil.example/QM015"),null);
});
test("printed page15 QR geometry is accepted for finger projection",()=>{
 const m=markers[0], [x,y,w,h]=m.box;
 const pts=[{x:x*850,y:y*1180},{x:(x+w)*850,y:y*1180},{x:(x+w)*850,y:(y+h)*1180},{x:x*850,y:(y+h)*1180}];
 assert.equal(markerGeometry("https://a-alqasim.com/App/BookSound/page15.mp3",pts,850,1180)?.page,17);
});
