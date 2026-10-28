"""Geometrically align multilingual *image-based* PDF editions to canonical Arabic exercises.
Uses matched image features, RANSAC and a source/target foreground consistency gate.
Unverified pages are explicitly unmapped, never assigned by guess.
"""
import argparse, json, math, pathlib, os
import cv2, fitz, numpy as np

ROOT=pathlib.Path(__file__).resolve().parents[1]
SOURCE=pathlib.Path(os.environ.get("MADANI_LIBRARY_SOURCE",str(ROOT)))
p=argparse.ArgumentParser()
p.add_argument("--codes",default="en,fr,ur,id")
p.add_argument("--start",type=int,default=17)
p.add_argument("--end",type=int,default=99)
p.add_argument("--inspect-only",action="store_true")
args=p.parse_args()
book=fitz.open(SOURCE/"local-assets"/"official-book.pdf")
library=json.loads((ROOT/"public/data/audio-library.json").read_text(encoding="utf-8"))
catalog_file=ROOT/"public/data/editions.json"
catalog=json.loads(catalog_file.read_text(encoding="utf-8"))
map_root=ROOT/"public/data/edition-maps"
orb=cv2.ORB_create(nfeatures=2200,fastThreshold=10,scaleFactor=1.2,nlevels=8)
mask_cache={}
def feature(page):
    matrix=fitz.Matrix(1.2,1.2)
    pix=page.get_pixmap(matrix=matrix,alpha=False,colorspace=fitz.csGRAY)
    img=np.frombuffer(pix.samples,np.uint8).reshape(pix.height,pix.width)
    h,w=img.shape; mask=np.zeros(img.shape,np.uint8)
    mask[int(h*.18):int(h*.9),int(w*.045):int(w*.955)]=255
    # suppress broad solid colors; focus on edge geometry and printed glyphs
    kp,desc=orb.detectAndCompute(img,mask)
    return img,kp,desc
source_cache={n:feature(book[n-1]) for n in range(args.start,args.end+1)}
def candidate(canonical,target):
    src,sk,sd=canonical;dst,tk,td=target
    if sd is None or td is None or len(sd)<20 or len(td)<20:return None
    matcher=cv2.BFMatcher(cv2.NORM_HAMMING)
    pairs=matcher.knnMatch(sd,td,k=2)
    good=[m for pair in pairs if len(pair)==2 for m,n in [pair] if m.distance<.72*n.distance]
    if len(good)<30:return None
    srcpts=np.float32([sk[m.queryIdx].pt for m in good]).reshape(-1,1,2)
    dstpts=np.float32([tk[m.trainIdx].pt for m in good]).reshape(-1,1,2)
    H,mask=cv2.findHomography(srcpts,dstpts,cv2.RANSAC,4.0,maxIters=1500,confidence=.995)
    if H is None:return None
    inliers=mask.ravel().astype(bool)
    count=int(np.count_nonzero(inliers))
    if count<28:return None
    fraction=count/len(good)
    if fraction<.43:return None
    originals=srcpts[inliers,0,:]
    xs=np.ptp(originals[:,0])/src.shape[1]
    ys=np.ptp(originals[:,1])/src.shape[0]
    if xs<.24 or ys<.20:return None
    pts=np.float32([[0,0],[src.shape[1],0],[src.shape[1],src.shape[0]],[0,src.shape[0]]]).reshape(-1,1,2)
    corners=cv2.perspectiveTransform(pts,H)[:,0,:]
    max_deviation=np.max(np.abs(corners-np.array([[0,0],[dst.shape[1],0],[dst.shape[1],dst.shape[0]],[0,dst.shape[0]]])))
    if max_deviation>max(dst.shape)*.19:return None
    # Compare actual foreground strokes rather than blank white background.
    warped=cv2.warpPerspective(src,H,(dst.shape[1],dst.shape[0]),borderValue=255)
    top=int(dst.shape[0]*.20);bottom=int(dst.shape[0]*.88)
    fg=(warped[top:bottom]<170); target_fg=(dst[top:bottom]<170)
    both=int(np.count_nonzero(fg & target_fg))
    precision=both/max(1,int(np.count_nonzero(fg)))
    recall=both/max(1,int(np.count_nonzero(target_fg)))
    overlap=2*precision*recall/max(1e-6,precision+recall)
    if overlap<.52:return None
    score=count*fraction*(.6+.4*overlap)
    return {"H":H,"score":score,"inliers":count,"inlierRatio":fraction,
            "foregroundF1":overlap,"maxDeviation":float(max_deviation)}

def transform_zone(H,z,src_shape,dst_shape):
    x,y,w,h=z["box"]
    ih,iw=src_shape;oh,ow=dst_shape
    pts=np.float32([[x*iw,y*ih],[(x+w)*iw,y*ih],[(x+w)*iw,(y+h)*ih],[x*iw,(y+h)*ih]]).reshape(-1,1,2)
    pts=cv2.perspectiveTransform(pts,H)[:,0,:]
    xmin=max(0,float(np.min(pts[:,0]))/ow);xmax=min(1,float(np.max(pts[:,0]))/ow)
    ymin=max(0,float(np.min(pts[:,1]))/oh);ymax=min(1,float(np.max(pts[:,1]))/oh)
    if xmin>=xmax or ymin>=ymax:return None
    if xmax-xmin>.8 or ymax-ymin>.4:return None
    return [round(xmin,7),round(ymin,7),round(xmax-xmin,7),round(ymax-ymin,7)]

for code in args.codes.split(","):
    f=SOURCE/"local-assets/library-editions"/f"{code}.pdf"
    if not f.exists():print("MISSING",code,flush=True);continue
    edoc=fitz.open(f)
    old=json.loads((map_root/f"{code}.json").read_text(encoding="utf-8"))
    source_pages=old.get("verifiedPages",{})
    target_cache={}
    mapped=0
    for n in range(args.start,min(args.end,len(book))+1):
        sr=source_cache[n]
        best=None
        for t in range(max(1,n-5),min(len(edoc),n+3)+1):
            if t not in target_cache:target_cache[t]=feature(edoc[t-1])
            score=candidate(sr,target_cache[t])
            if score is None:continue
            if best is None or score["score"]>best[1]["score"]:best=(t,score)
        if best:
            target,info=best
            boxes={}
            for zone in library["pages"][str(n)]["zones"]:
                b=transform_zone(info["H"],zone,sr[0].shape,target_cache[target][0].shape)
                if b:boxes[zone["id"]]=b
            if len(boxes)>=min(4,len(library["pages"][str(n)]["zones"])):
                source_pages[str(n)]={"pdfPage":target,"zoneBoxes":boxes,
                    "confidence":round(min(.999,info["foregroundF1"]*info["inlierRatio"]),4),
                    "evidence":{"method":"ORB-RANSAC-foreground",
                        "inliers":info["inliers"],"foregroundF1":round(info["foregroundF1"],4),
                        "inlierRatio":round(info["inlierRatio"],4)}}
                mapped+=1
        if (n-args.start)%20==0:print("SCANNED",code,n,flush=True)
    old["verifiedPages"]=source_pages
    old["pendingPages"]=[n for n in range(1,len(book)+1) if str(n) not in source_pages]
    old["mappingMethod"]="ORB-RANSAC-foreground with geometric QA; text-backed map is fallback"
    if not args.inspect_only:
        (map_root/f"{code}.json").write_text(json.dumps(old,ensure_ascii=False,indent=2),encoding="utf-8")
        catalog["locales"][code]["pageMappings"]="vision-verified-per-page"
    print("LOCALE_RESULT",code,"new",mapped,"total",len(source_pages),"of",len(book),
        "examples",[(n,v["pdfPage"],v["confidence"]) for n,v in list(source_pages.items())[:4]],flush=True)
if not args.inspect_only:
    catalog_file.write_text(json.dumps(catalog,ensure_ascii=False,indent=2),encoding="utf-8")
    for code in args.codes.split(","):
        m=map_root/f"{code}.json"
        if m.exists():
            o=json.loads(m.read_text(encoding="utf-8"))
            library["editionMaps"][code]["verifiedPageCount"]=len(o["verifiedPages"])
            library["editionMaps"][code]["pendingPageCount"]=len(o["pendingPages"])
    (ROOT/"public/data/audio-library.json").write_text(json.dumps(library,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
    report=ROOT/"public/data/audio-library-validation.json"
    obj=json.loads(report.read_text(encoding="utf-8"))
    obj["localeMappedPages"]={code:entry["verifiedPageCount"] for code,entry in library["editionMaps"].items()}
    report.write_text(json.dumps(obj,ensure_ascii=False,indent=2),encoding="utf-8")
