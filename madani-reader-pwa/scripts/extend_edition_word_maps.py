"""Project word rectangles onto verified translation layouts, never blind page offsets."""
import json,pathlib,cv2,numpy as np,collections
root=pathlib.Path(__file__).resolve().parents[1]
data=root/"public/data"
word=json.loads((data/"word-library.json").read_text(encoding="utf-8"))
original=json.loads((data/"audio-library.json").read_text(encoding="utf-8"))
report={}
for path in sorted((data/"edition-maps").glob("*.json")):
 code=path.stem
 if code=="ar":continue
 mapping=json.loads(path.read_text(encoding="utf-8"))
 accepted=0;verified=0
 for pdfPage,rec in mapping["verifiedPages"].items():
  oldzone={z["id"]:z["box"] for z in original["pages"][str(pdfPage)]["zones"]}
  src=[];dst=[]
  for key,target in rec["zoneBoxes"].items():
   initial=oldzone.get(key)
   if initial:
    src.append([initial[0]+initial[2]/2,initial[1]+initial[3]/2])
    dst.append([target[0]+target[2]/2,target[1]+target[3]/2])
  if len(src)<5:continue
  source=np.float32(src);dest=np.float32(dst)
  H,inliers=cv2.findHomography(source,dest,cv2.RANSAC,.022,maxIters=2500,confidence=.995)
  if H is None or inliers is None:continue
  frac=float(inliers.mean())
  projected=cv2.perspectiveTransform(source.reshape(-1,1,2),H)[:,0,:]
  err=float(np.median(np.linalg.norm(projected-dest,axis=1)))
  if frac<.75 or err>.023:continue
  verified+=1
  for key in word["pages"][pdfPage]["items"]:
   if key in rec["zoneBoxes"]:continue
   w=word["wordItems"][key]
   b=w.get("box")
   if not b:continue
   x,y,bw,bh=b
   pts=np.float32([[x,y],[x+bw,y],[x+bw,y+bh],[x,y+bh]]).reshape(-1,1,2)
   pts=cv2.perspectiveTransform(pts,H)[:,0,:]
   minx,miny=pts.min(axis=0);maxx,maxy=pts.max(axis=0)
   if not(0<=minx<maxx<=1 and 0<=miny<maxy<=1):continue
   if maxx-minx>.45 or maxy-miny>.2:continue
   rec["zoneBoxes"][key]=[round(float(minx),6),round(float(miny),6),
                         round(float(maxx-minx),6),round(float(maxy-miny),6)]
   accepted+=1
  rec["projectedWordRegions"]="geometric-transform-from-verified-anchors;human-review-pending"
 mapping["wordProjectionStatus"]="geometrically-transferred-draft-not-human-approved"
 path.write_text(json.dumps(mapping,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
 report[code]={"verifiedTransformPages":verified,"addedWordBoxes":accepted}
print(json.dumps(report,ensure_ascii=False))
