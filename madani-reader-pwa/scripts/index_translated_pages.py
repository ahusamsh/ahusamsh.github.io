"""Map every translated-book page by printed folio or bracketed alignment.

Arabic and translation PDF page numbers differ. Physical page coordinates are
never treated as verified merely because the *page* index can be inferred.
Conflicting previous ORB geometry is quarantined (never silently trusted).
"""
import collections,json,pathlib,re,os,fitz
ROOT=pathlib.Path(__file__).resolve().parents[1]
SOURCE=pathlib.Path(os.environ.get("MADANI_LIBRARY_SOURCE",ROOT))
data=ROOT/"public/data"
doc=fitz.open(SOURCE/"local-assets/official-book.pdf")
stats={}
for mapfile in sorted((data/"edition-maps").glob("*.json")):
 code=mapfile.stem
 edfile=SOURCE/"local-assets/library-editions"/f"{code}.pdf"
 if not edfile.exists():continue
 edoc=fitz.open(edfile)
 mapping=json.loads(mapfile.read_text(encoding="utf-8"))
 found=collections.defaultdict(list)
 for t,page in enumerate(edoc,1):
  lines=[s.strip() for s in page.get_text("text").splitlines() if s.strip()]
  for line in lines[:8]:
   # Unicode decimal digits are essential for the Hindi edition (e.g. २३).
   if re.fullmatch(r"\d{1,3}",line):
    folio=int(line)
    if 1<=folio<=102:found[folio].append(t)
    break
 out={}
 conflicts=[]
 invalidated=mapping.setdefault("invalidatedVerifiedPages",{})
 verified=mapping.get("verifiedPages",{})
 # Detect a wrong historic ORB match by two independent immediate geometric
 # neighbors that agree on the precise intervening PDF page. Quarantine bad
 # image geometry rather than creating duplicate physical-page mappings.
 for n in range(4,len(doc)):
  key=str(n)
  centre=verified.get(key)
  left=verified.get(str(n-1))
  right=verified.get(str(n+1))
  if centre and left and right and right["pdfPage"]-left["pdfPage"]==2:
   correct=left["pdfPage"]+1
   if centre["pdfPage"]!=correct:
    invalidated[key]={"record":centre,
                      "reason":"contradicts two adjacent geometric page anchors",
                      "correctPdfPage":correct}
    del verified[key]
 # Find the predominant offset using pages with independently readable folios.
 folio_offsets=[]
 for key,prev in verified.items():
  n=int(key);choices=found.get(n-2,[])
  if len(choices)==1 and choices[0]==prev["pdfPage"]:
   folio_offsets.append(choices[0]-n)
 dominant=collections.Counter(folio_offsets).most_common(1)
 common_offset=dominant[0][0] if dominant else None
 for canon in range(3,len(doc)+1):
  folio=canon-2
  key=str(canon)
  prev=verified.get(key)
  proven=prev.get("pdfPage") if prev else None
  choices=found.get(folio,[])
  if proven is not None and len(choices)==1 and proven!=choices[0]:
   conflicts.append([canon,proven,choices[0]])
   invalidated[key]={"record":prev,"reason":"trusted geometric target disagrees with unique printed folio",
                     "correctPdfPage":choices[0]}
   del verified[key]
   proven=None
  if proven is not None and common_offset is not None and not choices and abs(proven-canon-common_offset)>2:
   invalidated[key]={"record":prev,"reason":"outlier among corroborated edition pagination"}
   del verified[key]
   proven=None
  if proven is not None:
   if not(1<=proven<=len(edoc)):raise AssertionError("invalid target")
   out[key]={"pdfPage":proven,"printedPage":folio,
             "method":"geometric-verified-and-folio" if proven in choices else "geometric-verified",
             "zonesVerified":True}
  elif len(choices)==1:
   out[key]={"pdfPage":choices[0],"printedPage":folio,
             "method":"exact-printed-folio-number","zonesVerified":False}
 # If confirmed targets on both sides preserve the same page shift, every
 # intermediate physical page is unambiguous. This verifies pagination only.
 anchors=sorted((int(k),v["pdfPage"]) for k,v in out.items())
 used={v["pdfPage"]:int(k) for k,v in out.items()}
 for (a,pa),(b,pb) in zip(anchors,anchors[1:]):
  gap=b-a
  if 1<gap<=16 and pb-pa==gap:
   for n in range(a+1,b):
    t=pa+n-a
    if t in used or not 1<=t<=len(edoc):continue
    out[str(n)]={"pdfPage":t,"printedPage":n-2,
                 "method":"unique-page-between-two-corresponding-folios",
                 "zonesVerified":False}
    used[t]=n
 # For unlabelled early pages in the same book, permit only cautious
 # noninteracting display mapping: the first five confirmed anchors must agree.
 if len(anchors)>=5:
  early=anchors[:5]
  shifts={t-n for n,t in early}
  if len(shifts)==1:
   delta=next(iter(shifts))
   for n in range(max(3,early[0][0]-15),early[0][0]):
    t=n+delta
    if str(n) not in out and 1<=t<=len(edoc) and t not in used:
     out[str(n)]={"pdfPage":t,"printedPage":n-2,
                   "method":"consistent-nearby-pagination-unverified",
                   "zonesVerified":False}
     used[t]=n
 # The ending of each edition consists of word examples, numbers, and
 # contents. Continue only a page shift witnessed in at least five successive
 # verified folios; never infer boxes merely from this page continuation.
 if len(anchors)>=5:
  recent=anchors[-5:]
  offsets={target-n for n,target in recent}
  if len(offsets)==1:
   offset=next(iter(offsets))
   last=recent[-1][0]
   for n in range(last+1,min(len(doc),last+10)+1):
    target=n+offset
    if str(n) in out or target in used or not 1<=target<=len(edoc):continue
    out[str(n)]={"pdfPage":target,"printedPage":n-2,
                 "method":"consistent-tail-pagination-unverified",
                 "zonesVerified":False}
    used[target]=n
 # Never claim a word position was measured for a page known only by pagination.
 mapping["pageIndex"]=dict(sorted(out.items(),key=lambda x:int(x[0])))
 mapping["pageIndexStatus"]="page labels, geometric anchors and non-conflicting sequential infill"
 mapping["pageIndexCompleteCount"]=len(out)
 mapping["pdfPageCount"]=len(edoc)
 mapping["verifiedPages"]=verified
 mapping["pendingPages"]=[n for n in range(1,len(doc)+1) if str(n) not in verified]
 mapfile.write_text(json.dumps(mapping,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
 stats[code]={"pdfPages":len(edoc),"indexed":len(out),
              "zonesVerified":len(verified),
              "folioMatches":sum(v["method"]=="exact-printed-folio-number" for v in out.values()),
              "inferredPages":sum("unverified" in v["method"] or "between" in v["method"] for v in out.values()),
              "missingPrintedFolios":[i-2 for i in range(3,len(doc)+1) if str(i) not in out],
              "quarantinedConflicts":len(conflicts)}
 print("INDEXED",code,stats[code],flush=True)
(data/"translation-page-coverage.json").write_text(
 json.dumps(stats,ensure_ascii=False,indent=2),encoding="utf-8")
print("DONE",len(stats),"translations",flush=True)
