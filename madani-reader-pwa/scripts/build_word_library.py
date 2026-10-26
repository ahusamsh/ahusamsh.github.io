"""Build a new per-occurrence word/audio library for the published Madani PWA.
Uses per-word ASR timestamps and exact normalized PDF glyph sequence geometry.
Matched entries remain unreviewed until checked by a qualified listener.
"""
import collections,json,pathlib,re,sys,os,unicodedata,fitz
ROOT=pathlib.Path(__file__).resolve().parents[1]
SOURCE=pathlib.Path(os.environ.get("MADANI_LIBRARY_SOURCE",str(ROOT)))
output=ROOT/"public/data/word-library.json"
old=json.loads((SOURCE/"public/data/audio-library.json").read_text(encoding="utf-8"))
doc=fitz.open(SOURCE/"local-assets/official-book.pdf")
asr_root=SOURCE/"local-assets/word-asr"
def norm(s):
    chars=unicodedata.normalize("NFKC",s).replace("ـ","")
    change=str.maketrans({"أ":"ا","إ":"ا","آ":"ا","ٱ":"ا","ى":"ي","ة":"ه","ؤ":"و","ئ":"ي"})
    return "".join(c for c in chars.translate(change) if "\u0621"<=c<="\u064a" and not unicodedata.combining(c))
def glyphs(page):
    result=[]
    raw=page.get_text("rawdict")
    for bi,b in enumerate(raw["blocks"]):
        if b.get("type")!=0:continue
        for li,line in enumerate(b["lines"]):
            chars=[]
            for span in line["spans"]:
                for c in span["chars"]:
                    box=c["bbox"]
                    if not(50<=box[1]<=624 and box[0]>=35 and box[2]<470):continue
                    for ch in norm(c["c"]):
                        if ch:chars.append((ch,box))
            if not chars:continue
            chars.sort(key=lambda x:(-(x[1][0]+x[1][2])/2,(x[1][1]+x[1][3])/2))
            result.append((bi,li,chars))
    return result

def positions(lines,word,pdf):
    needle=norm(word)
    if len(needle)<2 or len(needle)>36:return []
    matches=[]
    for bi,li,chars in lines:
        hay="".join(c for c,_ in chars)
        start=0
        while True:
            idx=hay.find(needle,start)
            if idx<0:break
            sample=chars[idx:idx+len(needle)]
            l=min(b[0] for _,b in sample); t=min(b[1] for _,b in sample)
            r=max(b[2] for _,b in sample);bottom=max(b[3] for _,b in sample)
            w=r-l;h=bottom-t
            if 1.5<=w<=min(200,14*len(needle)) and h<55 and l>=30 and r<=460:
                B=[round(max(0,(l-2)/pdf.rect.width),6),round(max(0,(t-1)/pdf.rect.height),6),
                   round((w+4)/pdf.rect.width,6),round((h+2)/pdf.rect.height,6)]
                if B[0]+B[2]<=1 and B[1]+B[3]<=1:matches.append((bi,li,B))
            start=idx+1
    unique=[]
    for bi,li,b in matches:
        if not any(abs(b[0]-t[2][0])<.017 and abs(b[1]-t[2][1])<.015 for t in unique):
            unique.append((bi,li,b))
    return sorted(unique,key=lambda x:(x[2][1],-x[2][0]))

lib={"schema":1,"name":"Madani canonical Arabic word-to-voice library","bookId":old["book"]["sha256"],
 "teachingLanguage":"ar","requiresHumanListeningApproval":True,
 "pages":{},"wordItems":{},"statistics":{}}
stat=collections.Counter()
for pdfnum in range(1,105):
    printed=pdfnum-2
    oldpage=old["pages"][str(pdfnum)]
    page={"pdfPage":pdfnum,"printedPage":printed if printed>0 else None,
          "image":oldpage.get("image"),
          "pageAudioUrl":oldpage.get("audioSourceUrl") or oldpage.get("localAudio"),
          "items":[],"unplaced":[],
          "geometry":"verified-pilot" if pdfnum in (17,18,19) else "exact-text-derived-or-unplaced"}
    # Retain the 90 original carefully bounded pilot items and the two auto-matched pages.
    for z in oldpage["zones"]:
        segment=old["segments"].get(z["id"])
        if segment and segment.get("start") is not None:
            entry={"id":z["id"],"arabicText":z["text"],"spokenText":z.get("spokenText",z["text"]),
               "type":"letter-or-word","pdfPage":pdfnum,"printedPage":printed,
               "box":z["box"],"start":segment["start"],"end":segment["end"],
               "reviewed":False,"status":segment.get("status","machine-aligned-pending-listening"),
               "method":"existing-pilot" if pdfnum in (17,18,19) else "exact-count-segment"}
            lib["wordItems"][z["id"]]=entry;page["items"].append(z["id"]);stat["existing"]+=1
    if printed<1 or not (asr_root/f"page-{printed:03d}.json").exists():
        lib["pages"][str(pdfnum)]=page;continue
    transcript=json.loads((asr_root/f"page-{printed:03d}.json").read_text(encoding="utf-8"))
    words=[]
    for i,x in enumerate(transcript["words"],1):
        if not norm(x["text"]):continue
        ident=f"p{pdfnum}-asr{i:04d}"
        word={"id":ident,"arabicText":x["text"].strip(),"spokenText":x["text"].strip(),
          "type":"word","pdfPage":pdfnum,"printedPage":printed,
          "box":None,"start":x["start"],"end":x["end"],"probability":x.get("probability"),
          "reviewed":False,"status":"asr-draft-unreviewed","method":"arabic-asr"}
        words.append(word)
    if not words:
        lib["pages"][str(pdfnum)]=page;continue
    lines=glyphs(doc[pdfnum-1])
    group=collections.defaultdict(list)
    for word in words:group[norm(word["arabicText"])].append(word)
    for target,wordlist in group.items():
        poss=positions(lines,target,doc[pdfnum-1])
        # Single exact printed occurrence is safe to locate. Multiple repeated words
        # can only be ordered when print/audio multiplicity agrees.
        if len(poss)==1 and len(wordlist)==1:
            for w in wordlist:w["box"]=poss[0][2];w["method"]="exact-pdf-glyph"
        elif len(poss)==len(wordlist) and 1<len(poss)<=16:
            for w,p in zip(wordlist,poss):
                w["box"]=p[2];w["method"]="repeat-count-and-reading-order"
    # Where a word already has approved pilot geometry, do not double-overlay it.
    keep_pilot=pdfnum in (17,18,19)
    for w in words:
        if keep_pilot:w["box"]=None
        if w["box"] is not None:
            page["items"].append(w["id"]);stat["visuallyLinkedAsr"]+=1
        else:
            page["unplaced"].append(w["id"]);stat["unplacedAsr"]+=1
        lib["wordItems"][w["id"]]=w
        stat["asrWordSegments"]+=1
    lib["pages"][str(pdfnum)]=page
    stat["asrPages"]+=1
    if pdfnum%10==0:print("INDEXED",pdfnum,dict(stat),flush=True)
lib["statistics"]=dict(stat)
output.parent.mkdir(parents=True,exist_ok=True)
output.write_text(json.dumps(lib,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
print("RESULT",json.dumps({"pages":len(lib["pages"]),"items":len(lib["wordItems"]),**stat},ensure_ascii=False),flush=True)
