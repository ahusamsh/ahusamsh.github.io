"""Verify image-only numeric layouts in Persian and Urdu using 21 independent
black-pixel glyph fingerprints against the already-validated French lesson.

The OCR/text layer is empty in these two PDF editions. Never assume the
template is aligned: require 18/21 digit crops to match, a strong median score,
and agreement of physical page coordinates before copying hit rectangles.
"""
import json,os,pathlib,statistics
import numpy as np
import fitz

ROOT=pathlib.Path(__file__).resolve().parents[1]
SOURCE=pathlib.Path(os.environ.get("MADANI_LIBRARY_SOURCE",ROOT))
DATA=ROOT/"public/data"
mapfr=json.loads((DATA/"edition-maps/fr.json").read_text(encoding="utf-8"))
fr=fitz.open(SOURCE/"local-assets/library-editions/fr.pdf")
pagefr=fr[mapfr["pageIndex"]["101"]["pdfPage"]-1]

def ink(page):
    pix=page.get_pixmap(colorspace=fitz.csGRAY,alpha=False)
    return np.frombuffer(pix.samples,np.uint8).reshape(pix.height,pix.width)<170

reference=ink(pagefr)
catalog=json.loads((DATA/"word-library.json").read_text(encoding="utf-8"))
numeric=json.loads((DATA/"numeric-translation-coverage.json").read_text(encoding="utf-8"))
base=json.loads((DATA/"audio-library.json").read_text(encoding="utf-8"))

for code in ("fa","ur"):
    mapfile=DATA/"edition-maps"/f"{code}.json"
    mapping=json.loads(mapfile.read_text(encoding="utf-8"))
    target_index=mapping["pageIndex"].get("101")
    if not target_index:continue
    targetdoc=fitz.open(SOURCE/"local-assets/library-editions"/f"{code}.pdf")
    targetpage=targetdoc[target_index["pdfPage"]-1]
    raster=ink(targetpage)
    if raster.shape!=reference.shape:
        print("SKIP",code,"raster size differs",flush=True)
        continue
    similarities=[]
    for row in range(7):
        for x in [365,243,115]:
            y=172+row*68
            region=reference[y-18:y+30,x-24:x+22]
            sample=raster[y-18:y+30,x-24:x+22]
            intersection=(region&sample).sum()
            precision=intersection/max(1,region.sum())
            recall=intersection/max(1,sample.sum())
            f1=2*precision*recall/max(1e-9,precision+recall)
            similarities.append(float(f1))
    if (min(similarities)<.60 or statistics.median(similarities)<.88
            or sum(s>.75 for s in similarities)<18):
        print("SKIP",code,"raster too different",min(similarities),flush=True)
        continue
    french=mapfr["verifiedPages"]["101"]["zoneBoxes"]
    digitboxes={}
    for n in range(21):
        key=f"p101-grid-{n+1:03d}"
        if key not in french:
            raise AssertionError("French numeric box not found "+key)
        if catalog["wordItems"][key]["arabicText"]!=str(n):
            raise AssertionError("Printed digit order differs from canonical")
        digitboxes[key]=french[key]
    rec=mapping.setdefault("verifiedPages",{}).get("101")
    if rec and rec["pdfPage"]!=target_index["pdfPage"]:
        raise AssertionError("Previously verified numeric page contradiction")
    if rec is None:
        rec={"pdfPage":target_index["pdfPage"],"zoneBoxes":{},
             "confidence":round(statistics.median(similarities),3)}
        mapping["verifiedPages"]["101"]=rec
    rec["zoneBoxes"].update(digitboxes)
    rec["numericWordMapping"]={
        "method":"raster-fingerprint-verified-21-digit-grid",
        "reference":"fr:canonical-folio-99",
        "samples":21,"f1Median":round(statistics.median(similarities),4),
        "f1Minimum":round(min(similarities),4),
        "f1Above075":sum(s>.75 for s in similarities),
        "printedDigitCount":21,"mapped":21,
        "humanListeningApproved":False,
    }
    mapping["pendingPages"]=[i for i in range(1,105)
                             if str(i) not in mapping["verifiedPages"]]
    mapfile.write_text(json.dumps(mapping,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
    numeric[code]={"printed":21,"mapped":21,"pdfPage":target_index["pdfPage"],
                   "method":rec["numericWordMapping"]["method"],
                   "f1Median":rec["numericWordMapping"]["f1Median"]}
    base["editionMaps"][code]["verifiedPageCount"]=len(mapping["verifiedPages"])
    base["editionMaps"][code]["pendingPageCount"]=len(mapping["pendingPages"])
    print("RASTER_VERIFIED",code,numeric[code],flush=True)

(DATA/"numeric-translation-coverage.json").write_text(json.dumps(numeric,ensure_ascii=False,indent=2),encoding="utf-8")
(DATA/"audio-library.json").write_text(json.dumps(base,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
q=DATA/"audio-library-validation.json"
if q.exists():
    qa=json.loads(q.read_text(encoding="utf-8"))
    qa["localeMappedPages"]={c:x["verifiedPageCount"] for c,x in base["editionMaps"].items()}
    q.write_text(json.dumps(qa,ensure_ascii=False,indent=2),encoding="utf-8")
print("RESULT",len(numeric),sum(x["mapped"] for x in numeric.values()),flush=True)
