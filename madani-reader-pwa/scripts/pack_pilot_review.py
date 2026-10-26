"""Package the three-page review into one offline HTML, without publishing media."""
import argparse,base64,json,mimetypes,pathlib,re
p=argparse.ArgumentParser();p.add_argument('--root',type=pathlib.Path,default=pathlib.Path(__file__).resolve().parents[1]);p.add_argument('--output',type=pathlib.Path);a=p.parse_args();r=a.root
data=json.loads((r/'public/data/pilot-audio.json').read_text(encoding='utf-8'))
def uri(relative):
    file=r/'public'/relative.removeprefix('./')
    mime='audio/mpeg' if file.suffix=='.mp3' else mimetypes.guess_type(file)[0]
    return f'data:{mime};base64,'+base64.b64encode(file.read_bytes()).decode()
for page in data['pages'].values():
    page['image']=uri(page['image']);page['localAudio']=uri(page['localAudio'])
    for box in page['boxes']:box['clip']=uri(box['clip'])
for s in data['segments'].values():s['clip']=uri(s['clip'])
js=(r/'public/pilot-review.js').read_text(encoding='utf-8')
needle="fetch('./data/pilot-audio.json').then(r=>{if(!r.ok)throw Error('تعذر فتح بيانات التقسيم');return r.json()})"
assert needle in js
js=js.replace(needle,'Promise.resolve('+json.dumps(data,ensure_ascii=False,separators=(',',':')).replace('</','<\\/')+')')
html=(r/'public/pilot-review.html').read_text(encoding='utf-8').replace('<script type="module" src="./pilot-review.js"></script>','<script type="module">'+js+'</script>')
html=html.replace('<a class="link" href="./">العودة إلى التطبيق</a>','')
target=a.output or r/'local-assets/Madani_First_Three_Pages_Review.html';target.parent.mkdir(parents=True,exist_ok=True);target.write_text(html,encoding='utf-8')
print(json.dumps({'file':str(target),'bytes':target.stat().st_size,'words':len(data['segments'])}))
