"""Build reviewable clips and geometry from the official edition. Never auto-approve."""
import argparse, concurrent.futures, hashlib, json, pathlib, re, subprocess, wave
import fitz
import imageio_ffmpeg

BOOK_URL = 'https://files.a-alqasim.com/books/AbdulMuhsin/AlQaaidahAlMadaniyahAlQiraaah.pdf'
COUNTS = {15:28,16:30,17:32}
LETTERS = ['ا','ب','ت','ث','ج','ح','خ','د','ذ','ر','ز','س','ش','ص','ض','ط','ظ','ع','غ','ف','ق','ك','ل','م','ن','هـ','و','ي']
NAMES = ['ألف','باء','تاء','ثاء','جيم','حاء','خاء','دال','ذال','راء','زاي','سين','شين','صاد','ضاد','طاء','ظاء','عين','غين','فاء','قاف','كاف','لام','ميم','نون','هاء','واو','ياء']
parser=argparse.ArgumentParser();parser.add_argument('--root',type=pathlib.Path,default=pathlib.Path(__file__).resolve().parents[1]);args=parser.parse_args()
root=args.root; assets=root/'local-assets'; assets.mkdir(exist_ok=True)
out=root/'public'/'pilot-media';out.mkdir(parents=True,exist_ok=True)
ff=imageio_ffmpeg.get_ffmpeg_exe()
def download(url,target):
    if target.exists() and target.stat().st_size>1000:return
    subprocess.run(['curl.exe' if __import__('os').name=='nt' else 'curl','-f','-s','-L','-A','Mozilla/5.0','--max-time','90','-o',str(target),url],check=True)
download(BOOK_URL,assets/'official-book.pdf')
doc=fitz.open(assets/'official-book.pdf')
sources=json.loads((assets/'sources.json').read_text(encoding='utf-8')) if (assets/'sources.json').exists() else []
manifest={'schema':2,'id':'madani-first-lessons-v1','book':{'url':BOOK_URL,'sha256':hashlib.sha256((assets/'official-book.pdf').read_bytes()).hexdigest(),'pdfPages':104},'reviewStatus':'machine-aligned-pending-listening','pages':{},'segments':{}}
def clustered(values,tolerance=1):
    result=[]
    for value in sorted(values):
        if not result or value-result[-1]>tolerance:result.append(value)
    return result
def clip(task):
    source,start,end,target=task
    subprocess.run([ff,'-v','error','-y','-i',str(source),'-ss',str(start),'-t',str(round(end-start,6)),'-map','0:a:0','-vn','-map_metadata','-1','-ac','1','-ar','24000','-b:a','64k',str(target)],check=True)
    if target.stat().st_size<1000:raise ValueError(f'Invalid clip: {target}')
tasks=[]
for printed,count in COUNTS.items():
    pdfnum=printed+2;p=doc[pdfnum-1];W,H=p.rect.width,p.rect.height
    source=next((x for x in sources if x['printedPage']==printed),None)
    if not source:
        url=f'https://files.a-alqasim.com/audio/Mutoon/AbdullahAlWaayely/AlQiraaah/AlQaaidahAlMadaniyahAlQiraaah_{printed:03d}_AbdullahAlWaayely.mp3'
        source={'printedPage':printed,'pdfPage':pdfnum,'url':url,'qr':f'https://go.alqasim.com/QM{printed:03d}'}
    audio=assets/f'page-{printed:03d}.mp3';download(source['url'],audio)
    source['sha256']=hashlib.sha256(audio.read_bytes()).hexdigest()
    log=subprocess.run([ff,'-hide_banner','-i',str(audio),'-map','0:a:0','-vn','-af','silencedetect=noise=-45dB:d=0.3','-f','null','-'],capture_output=True,text=True,check=True).stderr
    silences=[];start=None
    for kind,value in re.findall(r'silence_(start|end): ([\d.]+)',log):
        if kind=='start':start=float(value)
        elif start is not None:silences.append((start,float(value)));start=None
    speech=[(a[1],b[0]) for a,b in zip(silences,silences[1:]) if b[0]>a[1]]
    expected_intro=4 if printed in (15,16) else 0
    if len(speech)!=count+expected_intro:raise ValueError(f'{printed}: {len(speech)} speech regions, expected {count+expected_intro}; manual review required')
    timings=speech[expected_intro:]
    cutoff=70 if printed==17 else 120
    draws=[d for d in p.get_drawings() if d.get('color') and d['color'][1]>.4]
    horizontal=[d['rect'] for d in draws if d['rect'].height<1 and d['rect'].width>50 and cutoff<d['rect'].y0<610]
    ys=clustered([r.y0 for r in horizontal]);left=min(r.x0 for r in horizontal);right=max(r.x1 for r in horizontal)
    expected_rows=8 if printed==17 else 7
    if len(ys)!=expected_rows+1:raise ValueError(f'{printed}: table boundary mismatch {ys}')
    table_words=[w for w in p.get_text('words') if left<(w[0]+w[2])/2<right and ys[0]<(w[1]+w[3])/2<ys[-1]]
    zones=[];boxes=[]
    for row,(top,bottom) in enumerate(zip(ys,ys[1:]),1):
        words=sorted([w for w in table_words if top<(w[1]+w[3])/2<bottom],key=lambda w:-(w[0]+w[2]))
        centers=[(w[0]+w[2])/2 for w in words]
        if not words:raise ValueError(f'Empty row {printed}:{row}')
        mid=(top+bottom)/2
        vx=clustered([d['rect'].x0 for d in draws if d['rect'].width<1 and d['rect'].height>20 and d['rect'].y0<=mid<=d['rect'].y1])
        inner=[x for x in vx if left+2<x<right-2]
        if printed==15:
            boundaries=[right]+sorted(inner,reverse=True)+[left]
            if len(boundaries)!=len(words)+1:raise ValueError(f'Cell mismatch {printed}:{row}')
        else:
            divider=max(inner)
            boundaries=[right,divider]+[(centers[i]+centers[i+1])/2 for i in range(1,len(words)-1)]+[left]
        rowzones=[]
        for col,w in enumerate(words,1):
            index=len(zones)+1;word_id=f'p{pdfnum}-w{index}'
            text=w[4]
            if printed==15:name=NAMES[index-1]
            elif printed==16:name=['ألف','باء','تاء','ثاء','جيم','حاء','خاء'][row-1]
            else:name=['دال','ذال','راء','زاي','سين','شين','صاد','ضاد'][row-1]
            # Correct extraction artifacts only against visually inspected printed glyphs.
            text=text.replace('ــجـ','جـ').replace('ــحـ','حـ').replace('ــخـ','خـ')
            x0,x1=boundaries[col]+.5,boundaries[col-1]-.5
            b=[round(x0/W,7),round((top+.5)/H,7),round((x1-x0)/W,7),round((bottom-top-1)/H,7)]
            zone={'id':word_id,'text':text,'spokenText':name,'row':row,'columnRtl':col,'box':b,'geometryReviewed':True,'reviewed':False}
            s,e=timings[index-1];s=round(max(0,s-.12),6);e=round(e+.15,6)
            filename=f'p{printed:03d}-word-{index:03d}.mp3'
            segment={'start':s,'end':e,'reviewed':False,'page':pdfnum,'sourceSha256':source['sha256'],'status':'machine-aligned-pending-listening','clip':f'./pilot-media/{filename}'}
            manifest['segments'][word_id]=segment
            tasks.append((audio,s,e,out/filename));zones.append(zone);rowzones.append(zone)
        groups=[[z] for z in rowzones] if printed==15 else [[rowzones[0]],rowzones[1:]]
        for group in groups:
            boxid=f'p{pdfnum}-b{len(boxes)+1}';a=min(z['box'][0] for z in group);b=max(z['box'][0]+z['box'][2] for z in group)
            st=manifest['segments'][group[0]['id']]['start'];en=manifest['segments'][group[-1]['id']]['end']
            filename=f'p{printed:03d}-box-{len(boxes)+1:03d}.mp3'
            boxes.append({'id':boxid,'row':row,'wordIds':[z['id'] for z in group],'box':[a,group[0]['box'][1],b-a,group[0]['box'][3]],'start':st,'end':en,'reviewed':False,'clip':f'./pilot-media/{filename}'})
            for z in group:z['parentBoxId']=boxid
            tasks.append((audio,st,en,out/filename))
    if len(zones)!=count:raise ValueError(f'{printed}: {len(zones)} zones, expected {count}')
    pagefile=f'page-{printed:03d}.jpg';p.get_pixmap(matrix=fitz.Matrix(1.6,1.6)).save(str(out/pagefile))
    pageaudio=f'page-{printed:03d}.mp3';tasks.append((audio,0,silences[-1][1],out/pageaudio))
    manifest['pages'][str(pdfnum)]={'pdfPage':pdfnum,'printedPage':printed,'width':W,'height':H,'image':f'./pilot-media/{pagefile}','localAudio':f'./pilot-media/{pageaudio}','source':source,'duration':silences[-1][1],'introRegions':speech[:expected_intro],'zones':zones,'boxes':boxes}
    print(f'PREPARED printed={printed}, pdf={pdfnum}, words={len(zones)}, boxes={len(boxes)}',flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:list(pool.map(clip,tasks))
data=root/'public'/'data';data.mkdir(parents=True,exist_ok=True)
(data/'pilot-audio.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
(out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
for page in manifest['pages'].values():
    prev=0
    for z in page['zones']:
        s=manifest['segments'][z['id']]
        assert prev<s['start']<s['end']<=page['duration']
        assert all(0<=v<=1 for v in z['box'])
        prev=s['end']
report={'pages':3,'wordClips':sum(COUNTS.values()),'boxClips':sum(len(p['boxes']) for p in manifest['pages'].values()),'humanListeningReviewed':0,'totalAudioFiles':len(tasks),'checks':['exact speech region counts','all word zones mapped once','monotonic non-overlapping word boundaries','all clip files encoded','geometry inside page']}
(out/'validation.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report),flush=True)
