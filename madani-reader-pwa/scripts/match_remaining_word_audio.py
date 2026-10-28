"""Conservative word-to-utterance alignment for printed lesson grids.

Use text agreement and acoustic timestamp together. Reject ambiguous,
wrong-order, introductory and missing audio matches. No silent approvals.
"""
import collections
import difflib
import json
import os
import pathlib
import re
import unicodedata

import fitz

ROOT=pathlib.Path(__file__).resolve().parents[1]
SOURCE=pathlib.Path(os.environ.get("MADANI_LIBRARY_SOURCE",ROOT))
DATA=ROOT/"public/data"
CATALOG_FILE=DATA/"word-library.json"
QA_FILE=DATA/"word-library-validation.json"
CATALOG=json.loads(CATALOG_FILE.read_text(encoding="utf-8"))
QA=json.loads(QA_FILE.read_text(encoding="utf-8"))
BASE=json.loads((SOURCE/"public/data/audio-library.json").read_text(encoding="utf-8"))
BOOK=fitz.open(SOURCE/"local-assets/official-book.pdf")
ASR=SOURCE/"local-assets/word-asr"

def norm(s):
    text=unicodedata.normalize("NFKC",s or "").replace("ـ","")
    text=text.translate(str.maketrans({"أ":"ا","إ":"ا","آ":"ا","ٱ":"ا","ى":"ي","ة":"ه","ؤ":"و","ئ":"ي"}))
    return "".join(c for c in text if "\u0621"<=c<="\u064a")

def grids(page):
    horizontal=collections.defaultdict(list)
    for drawing in page.get_drawings():
        for item in drawing["items"]:
            if item[0]!="l":continue
            a,b=item[1:3];lo,hi=sorted((a.x,b.x))
            if abs(a.y-b.y)<1.5 and hi-lo>=75 and 50<=lo and hi<=440 and 74<=a.y<=620:
                horizontal[round(a.y)].append((round(lo),round(hi)))
    horizontal={y:sorted(set(v)) for y,v in horizontal.items()}
    votes=collections.Counter(len(v) for v in horizontal.values() if 1<=len(v)<=4)
    cols=next((x for x,n in votes.most_common() if n>=5),None)
    if cols is None:return []
    rows=[(y,v) for y,v in sorted(horizontal.items()) if len(v)==cols]
    if not 7<=len(rows)<=13:return []
    for y,seg in rows:
        if len(seg)!=cols or any(abs(v1-v2)>6 for pair1,pair2 in zip(rows[0][1],seg) for v1,v2 in zip(pair1,pair2)):
            return []
    # Reconstruct RTL words from positioned glyphs, not reversed PDF clip text.
    glyphs=[]
    for block in page.get_text("rawdict")["blocks"]:
        if block.get("type")!=0:continue
        for line in block["lines"]:
            for span in line["spans"]:
                for ch in span["chars"]:
                    x0,y0,x1,y1=ch["bbox"]
                    if x0>=0 and y0>=0:
                        glyphs.append(((x0+x1)/2,(y0+y1)/2,ch["c"]))
    result=[]
    for ri in range(len(rows)-1):
        y0,y1=rows[ri][0],rows[ri+1][0]
        if not 30<=y1-y0<=95:return []
        row=[]
        for col in reversed(range(cols)):
            x0,x1=rows[ri][1][col]
            if x1-x0<70:return []
            chars=[(x,ch) for x,y,ch in glyphs if x0+2<=x<=x1-2 and y0+2<=y<=y1-2]
            chars.sort(key=lambda pair:-pair[0])
            txt="".join(ch for x,ch in chars if ch.strip())
            if not norm(txt):
                txt=page.get_text("text",clip=fitz.Rect(x0+2,y0+2,x1-2,y1-1)).strip().replace("\n","")
            word=norm(txt)
            if len(word)<2:return []
            row.append({"text":txt,"norm":word,"row":ri,"columnRtl":cols-col,
                        "box":[round((x0+1)/page.rect.width,7),
                               round((y0+1)/page.rect.height,7),
                               round((x1-x0-2)/page.rect.width,7),
                               round((y1-y0-2)/page.rect.height,7)]})
        result.extend(row)
    return result

def score(word,spoken):
    if min(len(word),len(spoken))<2:return 0
    ratio=difflib.SequenceMatcher(None,word,spoken).ratio()
    if word==spoken:return 1.
    # Very short words need strict matches; a long ASR word that contains a
    # short root is not sufficient evidence for an exact whole-word read.
    if len(word)<4 or len(spoken)<4:return ratio*.95
    return ratio

def find_utterance(utterances,start):
    best=None
    for i,unit in enumerate(utterances):
        # ASR word start might precede silencedetect boundaries slightly.
        gap=0 if unit["start"]-.95<=start<=unit["end"]+.25 else min(abs(start-unit["start"]),abs(start-unit["end"]))
        if best is None or gap<best[0]:
            best=(gap,i,unit)
    return best if best and best[0]<.85 else None

stats={}
rejections={}
for pdfpage in range(17,103):
    page=CATALOG["pages"].get(str(pdfpage))
    if not page or page.get("gridAudioLink"):continue
    utterances=BASE.get("unlinkedUtterances",{}).get(str(pdfpage),[])
    asr_file=ASR/f"page-{pdfpage-2:03d}.json"
    if len(utterances)<6 or not asr_file.exists() or not page.get("pageAudioUrl"):continue
    cells=grids(BOOK[pdfpage-1])
    if len(cells)<12 or len(cells)>42:continue
    if not 2<=len(cells[0]["norm"])<=25:continue
    words=json.loads(asr_file.read_text(encoding="utf-8")).get("words",[])
    duration=max(u["end"] for u in utterances)
    if duration<=0:continue

    # Candidates must agree lexically, with the expected progression through
    # the recording. Allow a modest introduction and uneven word length.
    # Candidate cutoff is deliberately high because ASR often hallucinated
    # names of letters and accidentally repeated phonemes.
    intro=min(duration*.2,12.)
    pairs=[]
    for ci,cell in enumerate(cells):
        n=cell["norm"];expected=intro+(duration-intro)*(ci+.65)/len(cells)
        row_candidates=[]
        for wi,w in enumerate(words):
            t=w.get("start",-1)
            if not intro-2<=t<=duration:continue
            agreement=score(n,norm(w.get("text","")))
            if agreement<(.94 if len(n)<=3 else .87):continue
            normalized_distance=abs(t-expected)/max(duration-intro,1)
            if normalized_distance>.14:continue
            near=find_utterance(utterances,t)
            if near is None:continue
            _,ui,u=near
            # Do not let candidates from one spoken interval claim two cells.
            # Prefer utterances around the end of a progressive letter drill.
            merit=agreement*3.1-normalized_distance*4.8
            if t>=u["start"] and t<=u["end"]:merit+=.16
            if n==norm(w.get("text","")):merit+=.20
            row_candidates.append((merit,ci,ui,wi,agreement,w.get("text",""),t))
        row_candidates.sort(reverse=True)
        pairs.extend(row_candidates[:8])

    # Strictly monotone best alignment: each word may be linked to only one
    # distinct detected spoken segment; printed cells remain in RTL row order.
    bycell=collections.defaultdict(list)
    for candidate in pairs:bycell[candidate[1]].append(candidate)
    memo={}
    def choose(ci,last_ui):
        if ci>=len(cells):return (0.,())
        key=(ci,last_ui)
        if key in memo:return memo[key]
        best=choose(ci+1,last_ui)
        for cand in bycell.get(ci,[]):
            merit,_,ui,wi,agreement,spoken,t=cand
            if ui<=last_ui:continue
            s,chosen=choose(ci+1,ui)
            total=s+merit
            if total>best[0]:best=(total,(cand,)+chosen)
        memo[key]=best
        return best
    _,chosen=choose(0,-1)
    chosen=list(chosen)
    # A selected match still needs evidence from neighbors: if only one or two
    # words agree on an entire page, transcription is not trustworthy.
    if len(chosen)<max(4,len(cells)//4):
        rejections[str(pdfpage)]={"reason":"too few sequential lexical anchors",
                                 "cells":len(cells),"matches":len(chosen)}
        continue
    eligible=[]
    for merit,ci,ui,wi,agreement,spoken,t in chosen:
        item=cells[ci]
        if agreement<.87:continue
        u=utterances[ui]
        expected=intro+(duration-intro)*(ci+.65)/len(cells)
        # Differentiate an ASR word inside the utterance from an ASR prefix
        # straddling across utterance boundaries; distance >2s rejects it.
        if abs(t-expected)>max(4, duration*.12):continue
        eligible.append((ci,ui,agreement,spoken,t,item,u))
    if len(eligible)<max(4,len(cells)//4):
        rejections[str(pdfpage)]={"reason":"insufficient high-confidence full words",
                                 "cells":len(cells),"matches":len(eligible)}
        continue
    links=0
    for ci,ui,agreement,spoken,t,item,u in eligible:
        ident=f"p{pdfpage}-exactword-{ci+1:03d}"
        if ident in CATALOG["wordItems"]:raise AssertionError("duplicate "+ident)
        record={
            "id":ident,"arabicText":item["text"],"spokenText":item["text"],
            "type":"printed-grid-cell","readingUnit":"full-word",
            "pdfPage":pdfpage,"printedPage":pdfpage-2,
            "box":item["box"],"row":item["row"],"columnRtl":item["columnRtl"],
            "start":round(max(0,u["start"]-.10),3),
            "end":round(u["end"]+.12,3),
            "reviewed":False,
            "status":"asr-text-match-requires-listening",
            "method":"printed-cell-monotone-asr-silence-verified",
            "evidence":{"asrWord":spoken,"agreement":round(agreement,3),
                        "utteranceIndex":ui,"audioOriginalPage":pdfpage-2,
                        "alignmentReviewed":False}}
        CATALOG["wordItems"][ident]=record
        page["items"].append(ident)
        links+=1
    page["gridAudioLink"]={"cellCount":links,
                          "originalCellCount":len(cells),
                          "method":"monotone-fullword-asr-visual-grid",
                          "quality":"machine-aligned-requires-listening",
                          "asrMonotoneAnchors":len(chosen),
                          "alignmentReviewed":False}
    stats[str(pdfpage)]={"matchedCells":links,"gridCells":len(cells),
                         "asrAnchors":len(chosen)}
    print("NEW",pdfpage,stats[str(pdfpage)],flush=True)

# Keep all previously linked words in the quality report after any rerun.
all_details={}
for key,pg in CATALOG["pages"].items():
    linked=[itemid for itemid in pg.get("items",[])
            if CATALOG["wordItems"].get(itemid,{}).get("method")==
            "printed-cell-monotone-asr-silence-verified"]
    if linked:
        all_details[key]={"matchedCells":len(linked),
                          "gridCells":pg.get("gridAudioLink",{}).get("originalCellCount"),
                          "alignmentReviewed":False}
QA["asrVerifiedNewWordLinks"]=sum(x["matchedCells"] for x in all_details.values())
QA["asrVerifiedPages"]=len(all_details)
QA["asrVerifiedDetails"]=all_details
QA["asrVerifiedSkipped"]=rejections
QA["totalItems"]=len(CATALOG["wordItems"])
QA["humanReviewed"]=0
QA["status"]="machine-generated-unreviewed"
CATALOG.setdefault("statistics",{})["asrVerifiedNewWordLinks"]=QA["asrVerifiedNewWordLinks"]
CATALOG["statistics"]["wordItemsTotalAfterExact"]=len(CATALOG["wordItems"])
CATALOG_FILE.write_text(json.dumps(CATALOG,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
QA_FILE.write_text(json.dumps(QA,ensure_ascii=False,indent=2),encoding="utf-8")
print("SUMMARY",json.dumps({"pages":len(stats),"words":QA["asrVerifiedNewWordLinks"],
                            "total":len(CATALOG["wordItems"])}),flush=True)
