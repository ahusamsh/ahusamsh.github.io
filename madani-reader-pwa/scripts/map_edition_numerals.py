"""Match printed numeric lesson 99 by exact, unique PDF digit positions.

The Arabic original has digits 0..23. Most translations intentionally print
only 0..20: never synthesize absent digits 21..23. The Persian and Urdu PDFs
do not expose their numeric glyphs as text; they remain unmapped until
independent raster verification, rather than copying another edition's boxes.
"""
import collections,json,os,pathlib,re,statistics,unicodedata
import fitz

ROOT=pathlib.Path(__file__).resolve().parents[1]
SOURCE=pathlib.Path(os.environ.get("MADANI_LIBRARY_SOURCE",ROOT))
DATA=ROOT/"public/data"
CATALOG=json.loads((DATA/"word-library.json").read_text(encoding="utf-8"))
BASE=json.loads((DATA/"audio-library.json").read_text(encoding="utf-8"))
found={}
for mapfile in sorted((DATA/"edition-maps").glob("*.json")):
 code=mapfile.stem
 if code=="ar":continue
 mapping=json.loads(mapfile.read_text(encoding="utf-8"))
 pg=mapping.get("pageIndex",{}).get("101")
 if not pg:continue
 doc=fitz.open(SOURCE/"local-assets/library-editions"/f"{code}.pdf")
 page=doc[pg["pdfPage"]-1]
 tokens=collections.defaultdict(list)
 for item in page.get_text("words"):
  text=item[4]
  text="".join(str(unicodedata.decimal(c)) if c.isdecimal() else c for c in text)
  if re.fullmatch(r"\d{1,2}",text):
   n=int(text)
   if 0<=n<=23:tokens[n].append(tuple(item[:4]))
 unique={n:v[0] for n,v in tokens.items() if len(v)==1}
 upper=23 if all(n in unique for n in range(24)) else 20
 expected=range(upper+1)
 eligible={n:unique[n] for n in expected if n in unique}
 if len(eligible)<18 or not all(n in eligible for n in (0,1,2,3,6,9,12,15,20)):
  print("PENDING",code,"only",len(eligible),"digit tokens",flush=True)
  continue
 def xc(box):return (box[0]+box[2])/2
 def yc(box):return (box[1]+box[3])/2
 cols={c:statistics.median(xc(box) for n,box in eligible.items() if n%3==c) for c in range(3)}
 rows={r:statistics.median(yc(box) for n,box in eligible.items() if n//3==r) for r in range((upper//3)+1)}
 if not(cols[0]>cols[1]>cols[2] and 45<=cols[0]-cols[1]<=170 and 45<=cols[1]-cols[2]<=170):
  print("REJECT",code,"wrong column coordinates",flush=True);continue
 if any(abs(xc(box)-cols[n%3])>22 for n,box in eligible.items()):
  print("REJECT",code,"disordered digits",flush=True);continue
 if any(abs(yc(box)-rows[n//3])>15 for n,box in eligible.items()):
  print("REJECT",code,"disordered rows",flush=True);continue
 if any(rows[i+1]-rows[i]<40 or rows[i+1]-rows[i]>90 for i in range(max(rows))):
  print("REJECT",code,"row distance inconsistent",flush=True);continue
 xs={0:(cols[0]+cols[1])/2,1:(cols[1]+cols[2])/2}
 rects={}
 for n,box in eligible.items():
  col=n%3; row=n//3
  if col==0:
   l=(cols[0]+cols[1])/2;right=cols[0]+(cols[0]-cols[1])/2
  elif col==1:
   l=(cols[1]+cols[2])/2;right=(cols[0]+cols[1])/2
  else:
   l=cols[2]-(cols[1]-cols[2])/2;right=(cols[1]+cols[2])/2
  if row==0:
   ytop=rows[0]-(rows[1]-rows[0])/2
  else:ytop=(rows[row-1]+rows[row])/2
  if row==max(rows):
   ybottom=rows[row]+(rows[row]-rows[row-1])/2
  else:ybottom=(rows[row]+rows[row+1])/2
  left=max(0,l+2);right=min(page.rect.width,right-2)
  ytop=max(0,ytop+2);ybottom=min(page.rect.height,ybottom-2)
  if not(left<right and ytop<ybottom):raise AssertionError("invalid numeric box")
  key=f"p101-grid-{n+1:03d}"
  assert CATALOG["wordItems"].get(key,{}).get("arabicText","").strip()==str(n)
  rects[key]=[round(left/page.rect.width,7),round(ytop/page.rect.height,7),
              round((right-left)/page.rect.width,7),round((ybottom-ytop)/page.rect.height,7)]
 entry=mapping.setdefault("verifiedPages",{}).get("101")
 if entry is None:
  entry={"pdfPage":pg["pdfPage"],"zoneBoxes":{},
         "confidence":round(len(rects)/(upper+1),3),
         "evidence":{"method":"exact-PDF-numeric-glyph-grid",
                     "count":len(rects),"printedMaximum":upper}}
  mapping["verifiedPages"]["101"]=entry
 elif entry["pdfPage"]!=pg["pdfPage"]:
  raise AssertionError("numeric candidate contradicts geometry "+code)
 entry["zoneBoxes"].update(rects)
 entry["numericWordMapping"]={"method":"glyph-centres-with-grid-structure-checked",
                               "printedDigitCount":upper+1,"mapped":len(rects),
                               "noAssumptionAboutUnprintedDigits":True,
                               "humanListeningApproved":False}
 mapping["pendingPages"]=[n for n in range(1,105) if str(n) not in mapping["verifiedPages"]]
 mapfile.write_text(json.dumps(mapping,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
 BASE["editionMaps"][code]["verifiedPageCount"]=len(mapping["verifiedPages"])
 BASE["editionMaps"][code]["pendingPageCount"]=len(mapping["pendingPages"])
 found[code]={"printed":upper+1,"mapped":len(rects),"pdfPage":pg["pdfPage"]}
 print("NUMERIC",code,found[code],flush=True)

(DATA/"audio-library.json").write_text(json.dumps(BASE,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
q=DATA/"audio-library-validation.json"
if q.exists():
 report=json.loads(q.read_text(encoding="utf-8"))
 report["localeMappedPages"]={code:info["verifiedPageCount"] for code,info in BASE["editionMaps"].items()}
 q.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
(DATA/"numeric-translation-coverage.json").write_text(json.dumps(found,ensure_ascii=False,indent=2),encoding="utf-8")
print("RESULT",len(found),"mapped editions",sum(x["mapped"] for x in found.values()),"targets",flush=True)
