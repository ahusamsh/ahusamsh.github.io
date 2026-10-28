"""Conservative phonics-lesson audio alignment based on PDF grid structure and
the *actual* recitation repetition pattern. Auto-links remain unapproved.

For a 3-column progressive word, one 9-utterance row reads the first letter,
the partial syllable, and finally the full word; the selected utterances for
the three printed columns are offsets 0, 2, and 8, respectively. A 2-column
6-utterance row uses offsets 2 and 5. A 4-column 2-pass letter drill uses the
second utterance of each pair.

No time is guessed if a page's count, introductory region count, visual-grid
structure, or independent transcript evidence contradict this pattern.
"""
import argparse,collections,json,os,pathlib,re,subprocess,unicodedata
import fitz
import imageio_ffmpeg

ROOT=pathlib.Path(__file__).resolve().parents[1]
SOURCE=pathlib.Path(os.environ.get("MADANI_LIBRARY_SOURCE",ROOT))
DATA=ROOT/"public/data"
AUDIO=SOURCE/"local-assets/library-audio"
ASR=SOURCE/"local-assets/word-asr"
BOOK=fitz.open(SOURCE/"local-assets/official-book.pdf")
LIBRARY_FILE=DATA/"word-library.json"
ORIGINAL=json.loads((SOURCE/"public/data/audio-library.json").read_text(encoding="utf-8"))
CATALOG=json.loads(LIBRARY_FILE.read_text(encoding="utf-8"))
QA=json.loads((DATA/"word-library-validation.json").read_text(encoding="utf-8"))
ffmpeg=imageio_ffmpeg.get_ffmpeg_exe()
parser=argparse.ArgumentParser()
parser.add_argument("--dry-run",action="store_true")
args=parser.parse_args()

def norm(value):
    chars=unicodedata.normalize("NFKC",value or "").translate(str.maketrans(
        {"أ":"ا","إ":"ا","آ":"ا","ٱ":"ا","ى":"ي","ة":"ه"}))
    return "".join(c for c in chars if "\u0621"<=c<="\u064a")

def visual_grid(page):
    hlines=collections.defaultdict(list)
    for drawing in page.get_drawings():
        for item in drawing["items"]:
            if item[0]!="l":continue
            a,b=item[1:3];lo,hi=sorted([a.x,b.x])
            if abs(a.y-b.y)<1.5 and 75<=hi-lo and 50<=lo and hi<=440 and 74<=a.y<=620:
                hlines[round(a.y)].append((round(lo),round(hi)))
    hlines={y:sorted(set(v)) for y,v in hlines.items()}
    counts=collections.Counter(len(v) for v in hlines.values() if 1<=len(v)<=4)
    cols=next((c for c,n in counts.most_common() if n>=5),None)
    if cols is None:return []
    rows=[(y,v) for y,v in sorted(hlines.items()) if len(v)==cols]
    if len(rows)<7 or len(rows)>13:return []
    for y,segments in rows:
        if any(abs(a-b)>6 for (a,_),(b,_) in zip(segments,rows[0][1])):return []
        if any(abs(a-b)>6 for (_,a),(_,b) in zip(segments,rows[0][1])):return []
    # Reconstruct glyphs from their actual centres to avoid PDF text spilling
    # between adjacent printed table cells.
    glyphs=[]
    for block in page.get_text("rawdict")["blocks"]:
        if block.get("type")!=0:continue
        for line in block["lines"]:
            for span in line["spans"]:
                for ch in span["chars"]:
                    x0,y0,x1,y1=ch["bbox"]
                    if 0<=x0<=page.rect.width and 0<=y0<=page.rect.height:
                        glyphs.append(((x0+x1)/2,(y0+y1)/2,ch["c"]))
    matrix=[]
    for row in range(len(rows)-1):
        y0,y1=rows[row][0],rows[row+1][0]
        if not 30<=y1-y0<=95:return []
        cells=[]
        for col in reversed(range(cols)):
            x0,x1=rows[row][1][col]
            if x1-x0<70:return []
            chars=[(x,ch) for x,y,ch in glyphs if x0+2<=x<=x1-2 and y0+2<=y<=y1-2]
            chars.sort(key=lambda v:-v[0])
            txt="".join(ch for x,ch in chars if ch.strip())
            if not norm(txt):
                txt=page.get_text("text",clip=fitz.Rect(x0+2,y0+2,x1-2,y1-1)).strip().replace("\n","")
            if not norm(txt):return []
            cells.append({"text":txt,"normalized":norm(txt),"row":row,"columnRtl":cols-col,
                          "box":[round((x0+1)/page.rect.width,7),
                                 round((y0+1)/page.rect.height,7),
                                 round((x1-x0-2)/page.rect.width,7),
                                 round((y1-y0-2)/page.rect.height,7)]})
        matrix.append(cells)
    return matrix

def words_for_u(words,u):
    return [norm(w.get("text","")) for w in words
            if u["start"]-.85<=w.get("start",-100)<=u["end"]+.24 and norm(w.get("text",""))]

def scheme_for(matrix,nutterances):
    cols=len(matrix[0]);nrows=len(matrix)
    # For this phonics curriculum the selected utterance always reads either
    # the particular letter/segment or the complete word, not a concatenation.
    modes=[
        (3,9,(0,2,8),"three-column-progressive-word"),
        (2,6,(2,5),"two-column-progressive-word"),
        (4,8,(1,3,5,7),"four-column-repeat-two"),
    ]
    for col,utter_per_row,offsets,mode in modes:
        if cols!=col:continue
        intro=nutterances-utter_per_row*nrows
        if 0<=intro<=4:
            return (intro,utter_per_row,offsets,mode)
    return None

def assessment(pdfpage,matrix,spoken,scheme,words):
    intro,perrow,offsets,mode=scheme
    # A zero-intro lesson must not begin with narration of chapter headings;
    # this catches apparent exact-count collisions due to missed silences.
    if intro==0:
        header="".join(norm(w.get("text","")) for w in words if w.get("start",100)>-1 and w.get("start",100)<4.5)
        if any(x in header for x in ("الباب","الدرس","الخامس","الثالث","امثله","الحروف")):
            return None
    hits=0;observed=0;completeHits=0;completeObserved=0
    for r,row in enumerate(matrix):
        for col,cell in enumerate(row):
            speech=spoken[intro+r*perrow+offsets[col]]
            predicted=words_for_u(words,speech)
            if not predicted:continue
            observed+=1
            expected=cell["normalized"]
            # For ligatures the source PDF may extract the same letter multiple
            # times; comparing first one is robust only when target is unambiguous.
            variants=[expected,expected[::-1]]
            if any(t[:1] in {v[:1] for v in variants if v} for t in predicted):
                hits+=1
            if col==len(row)-1:
                completeObserved+=1
                if any(t[:1] in {v[:1] for v in variants if v} for t in predicted):
                    completeHits+=1
    # ASR on teaching syllables commonly misses short utterances; require at
    # least several independent matching timestamps and reasonably good ratio.
    ratio=hits/max(1,observed)
    if observed<8 or hits<5 or ratio<.52:return None
    return {"method":mode,"intro":intro,"uttPerRow":perrow,
            "recorded":len(spoken),"expected":intro+len(matrix)*perrow,
            "asrObservations":observed,"asrMatches":hits,
            "asrAgreement":round(ratio,3),
            "completeWordObservations":completeObserved,
            "completeWordMatches":completeHits,
            "humanReviewed":False}

CLIPS=ROOT/"public/word-clips"
CLIPS.mkdir(parents=True,exist_ok=True)
candidates=[];rejected=[]
for pdf in range(17,103):
    if CATALOG["pages"].get(str(pdf),{}).get("gridAudioLink"):
        continue
    printed=pdf-2
    source=AUDIO/f"page-{printed:03d}.mp3"
    asrfile=ASR/f"page-{printed:03d}.json"
    utterances=ORIGINAL["unlinkedUtterances"].get(str(pdf),[])
    if not source.is_file() or not utterances or not asrfile.is_file():
        continue
    matrix=visual_grid(BOOK[pdf-1])
    if not matrix:continue
    proposed=scheme_for(matrix,len(utterances))
    if not proposed:
        rejected.append({"page":pdf,"reason":"recorded count differs from phonics pattern",
                         "rows":len(matrix),"cols":len(matrix[0]),"utterances":len(utterances)})
        continue
    words=json.loads(asrfile.read_text(encoding="utf-8")).get("words",[])
    evidence=assessment(pdf,matrix,utterances,proposed,words)
    if not evidence:
        rejected.append({"page":pdf,"reason":"insufficient independent ASR matching",
                         "rows":len(matrix),"cols":len(matrix[0]),"utterances":len(utterances),
                         "proposed":proposed[3]})
        continue
    candidates.append((pdf,matrix,utterances,proposed,evidence,source))
    print("ACCEPT",pdf,"printed",printed,"cells",sum(map(len,matrix)),
          "method",evidence["method"],"asr",evidence["asrMatches"],"/",evidence["asrObservations"],
          flush=True)
print("REJECTED",json.dumps(rejected,ensure_ascii=False),flush=True)
if args.dry_run:
    print("DRY_RESULT",len(candidates),sum(len(r)*len(r[0]) for _,r,*_ in candidates),flush=True)
    raise SystemExit(0)

report={}
for pdf,matrix,spoken,(intro,perrow,offsets,mode),evidence,source in candidates:
    page=CATALOG["pages"][str(pdf)]
    created=0
    for r,row in enumerate(matrix):
        for col,cell in enumerate(row):
            u=spoken[intro+r*perrow+offsets[col]]
            begin=max(0,round(u["start"]-.10,3))
            end=round(u["end"]+.12,3)
            id=f"p{pdf}-phonics-r{r+1:02d}-c{col+1:01d}"
            if id in CATALOG["wordItems"]:raise AssertionError("Duplicate "+id)
            out=CLIPS/f"{id}.mp3"
            if not out.exists() or out.stat().st_size<350:
                proc=subprocess.run([ffmpeg,"-hide_banner","-loglevel","error","-y",
                                     "-i",str(source),"-ss",str(begin),
                                     "-t",str(round(end-begin,3)),
                                     "-vn","-map","0:a:0","-ac","1","-ar","24000",
                                     "-b:a","64k",str(out)],
                                    capture_output=True,text=True,timeout=25)
                if proc.returncode or not out.is_file() or out.stat().st_size<350:
                    raise RuntimeError("ffmpeg failed "+id+" "+proc.stderr[:250])
            obj={"id":id,"arabicText":cell["text"],"spokenText":cell["text"],
                 "type":"printed-grid-cell","pdfPage":pdf,"printedPage":pdf-2,
                 "box":cell["box"],"row":r,"columnRtl":col+1,
                 "parentWordId":f"p{pdf}-phonics-r{r+1:02d}" if len(row)<=3 else None,
                 "readingUnit":"full-word" if col==len(row)-1 else "phonics-fragment",
                 "start":begin,"end":end,"clip":"./word-clips/"+out.name,
                 "reviewed":False,"status":"pattern-aligned-requires-listening",
                 "method":mode,"evidence":{"uttIndex":intro+r*perrow+offsets[col],
                                           "sourceAudioPage":pdf-2,
                                           "asrPageAgreement":evidence["asrAgreement"],
                                           "alignmentReviewed":False}}
            CATALOG["wordItems"][id]=obj
            page["items"].append(id)
            created+=1
    page["gridAudioLink"]={"cellCount":created,**evidence}
    report[str(pdf)]={"count":created,**evidence}
    print("CREATED",pdf,created,flush=True)
QA["patternAlignedNewClips"]=sum(x["count"] for x in report.values())
QA["patternAlignedPages"]=len(report)
QA["patternPageDetails"]=report
QA["patternRejectedPages"]=rejected
QA["humanReviewed"]=0
QA["totalItems"]=len(CATALOG["wordItems"])
QA["status"]="machine-generated-unreviewed"
CATALOG["statistics"]["patternAlignedNewClips"]=QA["patternAlignedNewClips"]
CATALOG["statistics"]["patternAlignedPages"]=len(report)
CATALOG["statistics"]["wordItemsTotalAfterPattern"]=len(CATALOG["wordItems"])
LIBRARY_FILE.write_text(json.dumps(CATALOG,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
(DATA/"word-library-validation.json").write_text(json.dumps(QA,ensure_ascii=False,indent=2),encoding="utf-8")
print("RESULT",json.dumps({"pages":len(report),"clips":QA["patternAlignedNewClips"],
                           "total":QA["totalItems"]}),flush=True)
