"""Generate explicit per-page, per-edition progress audit.

Distinguish book-index coverage, available source recordings, automatic word
alignment, translated glyph geometry and human listening approval. None of
these are interchangeable. Designed for the existing published PWA.
"""
import collections,json,pathlib

ROOT=pathlib.Path(__file__).resolve().parents[1]
D=ROOT/"public/data"
lib=json.loads((D/"word-library.json").read_text(encoding="utf-8"))
qa=json.loads((D/"word-library-validation.json").read_text(encoding="utf-8"))
editions=json.loads((D/"editions.json").read_text(encoding="utf-8"))
src=json.loads((D/"audio-library.json").read_text(encoding="utf-8"))
lang={}
for code in editions["locales"]:
    if code=="ar":continue
    mp=json.loads((D/"edition-maps"/f"{code}.json").read_text(encoding="utf-8"))
    page_index=mp.get("pageIndex",{})
    refs=mp.get("verifiedPages",{})
    words_total=0
    linked_cells=0
    missing=[]
    for n in range(1,105):
        page=lib["pages"][str(n)]
        if n>=3 and str(n) not in page_index:
            missing.append(n)
        for item_id in page.get("items",[]):
            item=lib["wordItems"].get(item_id)
            if not item or item.get("box") is None:continue
            if item_id in refs.get(str(n),{}).get("zoneBoxes",{}):
                words_total+=1
                if item.get("type")=="printed-grid-cell":linked_cells+=1
    lang[code]={
        "pdfPages":mp.get("pdfPageCount"),
        "pageIndexEntries":len(page_index),
        "verifiedGeometryPages":len(refs),
        "mappedClickableItems":words_total,
        "mappedPrintedCells":linked_cells,
        "missingCanonicalPages":missing,
        "humanReviewedItems":0,
        "quality":"page navigation and machine geometry only; subject to visual/audio review"
    }
pages={}
total_placed=0;source_pages=0;total_unplaced=0
for canon in range(1,105):
    page=lib["pages"][str(canon)]
    ids=set(page.get("items",[]) + page.get("unplaced",[]))
    placed=[lib["wordItems"][i] for i in page.get("items",[])
            if i in lib["wordItems"] and lib["wordItems"][i].get("box") is not None]
    # Existing model generated time-aligned words may share a visual rectangle:
    # report the count, not a claim of unique approved pronunciations.
    readable=[w for w in placed if isinstance(w.get("start"),(float,int)) and
              isinstance(w.get("end"),(float,int)) and w["end"]>w["start"]]
    audio=bool(page.get("pageAudioUrl"))
    source_pages+=int(audio)
    total_placed+=len(readable)
    total_unplaced+=len(page.get("unplaced",[]))
    pages[str(canon)]={
        "canonicalPdfPage":canon,
        "printedPage":page.get("printedPage"),
        "officialPageAudio":audio,
        "listedSegments":len(ids),
        "timeLinkedVisualZones":len(readable),
        "newGridOrExactSoundZones":len([w for w in readable if
              w.get("method") in {"printed-grid-exact-count-and-asr-sequence",
                                  "printed-cell-monotone-asr-silence-verified",
                                  "three-column-progressive-word",
                                  "two-column-progressive-word",
                                  "four-column-repeat-two"}]),
        "unplacedOrUnverifiedAsr":len(page.get("unplaced",[])),
        "humanReviewed":sum(bool(w.get("reviewed")) for w in readable),
        "status":("no-official-page-audio" if not audio else
                  "machine-linked-audio-unreviewed" if readable else
                  "page-audio-only-or-no-visible-word-links")
    }
output={
    "schema":1,
    "bookPdfPages":104,
    "editionCount":len(editions["locales"]),
    "teachingAudioLanguage":"ar",
    "humanApprovedWordAudio":0,
    "mediaCopyrightStatus":"source recording and books require owner permission before third-party redistribution",
    "availableOfficialPageRecordings":source_pages,
    "sourceAudioMissingCanonicalPdfPages":[int(n) for n,p in pages.items() if not p["officialPageAudio"]],
    "catalogRecords":len(lib["wordItems"]),
    "autoAlignedNewLinks":{
        "exactGrid":qa.get("gridAlignedNewClips",0),
        "lessonPatterns":qa.get("patternAlignedNewClips",0),
        "recognizedFullWords":qa.get("asrVerifiedNewWordLinks",0),
        "total":sum(qa.get(k,0) for k in ("gridAlignedNewClips","patternAlignedNewClips","asrVerifiedNewWordLinks")),
    },
    "visualTimedZonesTotal":total_placed,
    "unplacedAsrWordsTotal":total_unplaced,
    "editionCoverage":lang,
    "pageCoverage":pages,
    "currentStatus":"machine-aligned; independent human audible/visual quality review still required",
}
assert output["autoAlignedNewLinks"]["total"]==452
assert output["catalogRecords"]==9077
assert len(lang)==18
(D/"fullbook-audio-coverage.json").write_text(
    json.dumps(output,ensure_ascii=False,indent=2),encoding="utf-8")
print(json.dumps({
    "bookPages":104,
    "catalogRecords":output["catalogRecords"],
    "availableOfficialPageRecordings":source_pages,
    "autoAlignedNewLinks":output["autoAlignedNewLinks"],
    "visuallyTimeLinked":total_placed,
    "notVisuallyLinked":total_unplaced,
    "translationStats":{k:{"indexed":v["pageIndexEntries"],"verified":v["verifiedGeometryPages"],
                           "mappedWordZones":v["mappedClickableItems"]}for k,v in lang.items()},
},ensure_ascii=False),flush=True)
