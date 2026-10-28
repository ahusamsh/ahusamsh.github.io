import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=new URL('../public/data/',import.meta.url);
const read=n=>JSON.parse(fs.readFileSync(new URL(n,root),'utf8'));
const lib=read('word-library.json');
const audit=read('fullbook-audio-coverage.json');
const qa=read('word-library-validation.json');

test('published audio-coverage audit explicitly separates page index and audio-link completion',()=>{
 assert.equal(audit.bookPdfPages,104);
 assert.equal(audit.editionCount,19);
 assert.equal(audit.availableOfficialPageRecordings,90);
 assert.equal(audit.catalogRecords,Object.keys(lib.wordItems).length);
 assert.equal(audit.catalogRecords,9077);
 assert.equal(audit.autoAlignedNewLinks.total,452);
 assert.equal(audit.autoAlignedNewLinks.exactGrid,192);
 assert.equal(audit.autoAlignedNewLinks.lessonPatterns,204);
 assert.equal(audit.autoAlignedNewLinks.recognizedFullWords,56);
 assert.equal(audit.visualTimedZonesTotal,2819);
 assert.equal(audit.unplacedAsrWordsTotal,6258);
 assert.equal(audit.humanApprovedWordAudio,0);
 assert.equal(qa.humanReviewed,0);
 assert.equal(Object.keys(audit.pageCoverage).length,104);
 assert.equal(Object.keys(audit.editionCoverage).length,18);
});
test('each edition missing physical book page and each missing sound is marked honestly',()=>{
 let missing=0;
 for(const page of Object.values(audit.pageCoverage)){
  assert.ok(page.canonicalPdfPage>=1&&page.canonicalPdfPage<=104);
  assert.equal(page.humanReviewed,0);
  assert.ok(page.timeLinkedVisualZones<=page.listedSegments);
  if(!page.officialPageAudio)missing++;
 }
 assert.equal(missing,14);
 assert.equal(audit.sourceAudioMissingCanonicalPdfPages.length,14);
 for(const [code,edition] of Object.entries(audit.editionCoverage)){
  assert.ok(edition.pageIndexEntries>=100);
  assert.ok(edition.verifiedGeometryPages<=edition.pageIndexEntries);
  assert.ok(edition.mappedClickableItems>0);
  assert.equal(edition.humanReviewedItems,0);
 }
});
