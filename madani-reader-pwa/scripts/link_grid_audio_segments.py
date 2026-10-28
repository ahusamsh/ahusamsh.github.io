"""Add reproducible audio-to-printed-cell links to the published Madani word library.

A link is generated ONLY when the exact extracted grid cell count matches the
number of detected spoken regions after a small introductory prefix AND a
majority of independent word-ASR anchors agree with the same reading order.
All machine links remain UNREVIEWED. Existing pilot data is never overwritten.
"""
import collections
import json
import os
import pathlib
import re
import subprocess
import unicodedata

import fitz
import imageio_ffmpeg

ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCE = pathlib.Path(os.environ.get("MADANI_LIBRARY_SOURCE", ROOT))
BOOK = SOURCE / "local-assets" / "official-book.pdf"
AUDIO = SOURCE / "local-assets" / "library-audio"
ASR = SOURCE / "local-assets" / "word-asr"
LIBRARY_FILE = ROOT / "public/data/word-library.json"
QA_FILE = ROOT / "public/data/word-library-validation.json"
CLIPS = ROOT / "public/word-clips"
assert BOOK.exists() and (SOURCE / "public/data/audio-library.json").exists()
assert LIBRARY_FILE.exists()
CLIPS.mkdir(parents=True, exist_ok=True)
doc = fitz.open(BOOK)
base = json.loads((SOURCE / "public/data/audio-library.json").read_text(encoding="utf-8"))
library = json.loads(LIBRARY_FILE.read_text(encoding="utf-8"))
qa = json.loads(QA_FILE.read_text(encoding="utf-8"))
ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()

def normalized(text):
    s = unicodedata.normalize("NFKC", text or "")
    s = s.translate(str.maketrans({"أ": "ا", "إ": "ا", "آ": "ا",
                                   "ٱ": "ا", "ى": "ي", "ة": "ه"}))
    return "".join(c for c in s if "\u0621" <= c <= "\u064a")

def grid_cells(page):
    """Recognize actual rectangular lesson grid, not a guessed fixed layout."""
    horizontal = collections.defaultdict(list)
    for drawing in page.get_drawings():
        for entry in drawing["items"]:
            if entry[0] != "l":
                continue
            a, b = entry[1:3]
            x0, x1 = sorted([a.x, b.x])
            if (abs(a.y-b.y) < 1.5 and x1-x0 >= 75
                    and 50 <= x0 and x1 <= 440 and 74 <= a.y <= 620):
                horizontal[round(a.y)].append((round(x0), round(x1)))
    lines = {y: sorted(set(v)) for y, v in horizontal.items()}
    votes = collections.Counter(len(v) for v in lines.values() if 1 <= len(v) <= 4)
    columns = next((n for n, count in votes.most_common() if count >= 5), None)
    if not columns:
        return []
    rows = [(y, pieces) for y, pieces in sorted(lines.items()) if len(pieces) == columns]
    if len(rows) < 6 or len(rows) > 13:
        return []
    reference = rows[0][1]
    for y, pieces in rows:
        if len(pieces) != columns:
            return []
        for (left, right), (ref_left, ref_right) in zip(pieces, reference):
            if abs(left-ref_left) > 6 or abs(right-ref_right) > 6:
                return []
    cells = []
    for row in range(len(rows)-1):
        y0, y1 = rows[row][0], rows[row+1][0]
        if y1-y0 < 30 or y1-y0 > 95:
            return []
        for column in reversed(range(columns)):
            x0, x1 = rows[row][1][column]
            if x1-x0 < 70:
                return []
            crop = fitz.Rect(x0+2, y0+2, x1-2, y1-1)
            printed = page.get_text("text", clip=crop).strip().replace("\n", "")
            letters = normalized(printed)
            if not letters and not re.search(r"\d", printed):
                return []
            if printed and unicodedata.combining(printed[0]):
                # PDF sometimes extracts a diacritic ahead of its letter.
                marks = []
                while printed and unicodedata.combining(printed[0]):
                    marks.append(printed[0]); printed = printed[1:]
                if printed:
                    printed = printed[0] + "".join(marks) + printed[1:]
            cells.append({
                "text": printed, "normalized": letters, "row": row,
                "columnRtl": columns-column,
                "box": [round((x0+1)/page.rect.width, 7),
                        round((y0+1)/page.rect.height, 7),
                        round((x1-x0-2)/page.rect.width, 7),
                        round((y1-y0-2)/page.rect.height, 7)]
            })
    return cells

NUMBER_WORDS = [
    "صفر","واحد","اثنان","ثلاثة","اربعة","خمسة","ستة","سبعة","ثمانية","تسعة",
    "عشرة","احد عشر","اثنا عشر","ثلاثة عشر","اربعة عشر","خمسة عشر",
    "ستة عشر","سبعة عشر","ثمانية عشر","تسعة عشر","عشرون",
    "واحد وعشرون","اثنان وعشرون","ثلاثة وعشرون",
]

def validate_by_asr(pdf_page, cells, utterances, skip):
    asr_file = ASR / f"page-{pdf_page-2:03d}.json"
    if not asr_file.exists():
        return None
    data = json.loads(asr_file.read_text(encoding="utf-8"))
    words = data.get("words", [])
    matching = 0
    present = 0
    all_numeric = all(c["text"].strip().isdigit() for c in cells)
    if all_numeric:
        numbers = [int(c["text"].strip()) for c in cells]
        if numbers != list(range(numbers[0], numbers[0]+len(numbers))):
            return None
        if min(numbers) < 0 or max(numbers) >= len(NUMBER_WORDS):
            return None
    for cell, u in zip(cells, utterances[skip:]):
        observed = [normalized(w.get("text", "")) for w in words
                    if u["start"]-.8 <= w.get("start",-100) <= u["end"]+.2]
        observed = [v for v in observed if v]
        if not observed:
            continue
        present += 1
        if all_numeric:
            desired = [normalized(s) for s in NUMBER_WORDS[int(cell["text"])].split()]
            matched = any(any(token in v or v in token
                              for token in desired if len(token)>=2)
                          for v in observed if len(v)>=2)
        else:
            first = cell["normalized"][:1]
            matched = bool(first) and any(v[:1] == first for v in observed)
        matching += int(matched)
    if present < 9 and not (all_numeric and present >= 8):
        return None
    agreement = matching/present
    # For single-letter lessons, majority independent ASR evidence is essential.
    if agreement < (0.55 if all_numeric else 0.65):
        return None
    return {"method": "printed-grid-exact-count-and-asr-sequence",
            "asrMatches": matching, "asrWithText": present,
            "agreement": round(agreement, 3),
            "introductoryUtterances": skip,
            "alignmentReviewed": False}

# Re-running produces the same generated entries without duplicates.
prior_grid = {k for k,v in library["wordItems"].items()
              if v.get("type") == "printed-grid-cell" and v.get("method") ==
              "printed-grid-exact-count-and-asr-sequence"}
for identifier in prior_grid:
    del library["wordItems"][identifier]
for record in library["pages"].values():
    record["items"] = [i for i in record.get("items",[]) if i not in prior_grid]
    record.pop("gridAudioLink",None)

report = {}
for pdf_page in range(1,len(doc)+1):
    key = str(pdf_page)
    page_record = library["pages"].get(key)
    if not page_record:
        continue
    # Never alter the original three-page pilot or existing count-verified clips.
    if pdf_page in (17,18,19,20,21):
        continue
    cells = grid_cells(doc[pdf_page-1])
    if len(cells) < 20:
        continue
    utterances = base["unlinkedUtterances"].get(key, [])
    skip = len(utterances)-len(cells)
    if not (0 <= skip <= 5):
        continue
    printed = pdf_page-2
    source_audio = AUDIO / f"page-{printed:03d}.mp3"
    if not source_audio.exists():
        continue
    evidence = validate_by_asr(pdf_page,cells,utterances,skip)
    if not evidence:
        continue
    inserted = 0
    for index, (cell, u) in enumerate(zip(cells,utterances[skip:]),1):
        ident = f"p{pdf_page}-grid-{index:03d}"
        if ident in library["wordItems"]:
            raise AssertionError(f"Already exists {ident}")
        start = max(0,round(u["start"]-.10,3))
        end = round(u["end"]+.12,3)
        if end <= start:
            raise AssertionError("Invalid time "+ident)
        clip = CLIPS / f"{ident}.mp3"
        if not clip.is_file():
            completed = subprocess.run([
                ffmpeg,"-hide_banner","-loglevel","error","-y",
                "-i",str(source_audio),"-ss",str(start),
                "-t",str(round(end-start,3)),"-vn","-map","0:a:0",
                "-ac","1","-ar","24000","-b:a","64k",str(clip)],
                capture_output=True,text=True,timeout=25)
            if completed.returncode != 0 or not clip.is_file() or clip.stat().st_size < 300:
                raise RuntimeError("Could not cut "+ident+" "+completed.stderr[:200])
        item = {
            "id": ident, "arabicText": cell["text"],"spokenText": cell["text"],
            "type": "printed-grid-cell", "pdfPage": pdf_page,
            "printedPage": printed, "box": cell["box"],
            "start": start, "end": end,
            "clip": f"./word-clips/{clip.name}",
            "row": cell["row"], "columnRtl": cell["columnRtl"],
            "reviewed": False,
            "status": "machine-linked-requires-listening",
            "method": evidence["method"],
            "evidence": {**evidence,"audioSourcePage":printed,
                         "originalUtteranceId":u["id"]}
        }
        library["wordItems"][ident]=item
        page_record["items"].append(ident)
        inserted+=1
    page_record["gridAudioLink"] = {"cellCount":len(cells),**evidence}
    report[key]={"count":inserted,"agreement":evidence["agreement"],
                 "asrMatches":evidence["asrMatches"],"asrWithText":evidence["asrWithText"],
                 "introductoryUtterances":skip}
    print("MATCHED",pdf_page,json.dumps(report[key]),flush=True)

count = sum(x["count"] for x in report.values())
library.setdefault("statistics",{})["gridAlignedNewClips"] = count
library["statistics"]["gridAlignedPages"] = len(report)
library["statistics"]["wordItemsTotalAfterGrid"] = len(library["wordItems"])
qa.update({"totalItems":len(library["wordItems"]),
           "gridAlignedNewClips":count,
           "gridAlignedPages":len(report),
           "gridPageDetails":report,
           "humanReviewed":0,
           "status":"machine-generated-unreviewed"})
LIBRARY_FILE.write_text(json.dumps(library,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
QA_FILE.write_text(json.dumps(qa,ensure_ascii=False,indent=2),encoding="utf-8")
print("RESULT",json.dumps({"pages":len(report),"clips":count,
                           "libraryWords":len(library["wordItems"])},
                          ensure_ascii=False),flush=True)
