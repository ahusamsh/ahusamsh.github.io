import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const dist=path.resolve('dist');
// Keep the deployed JSON truthful: if a build has no locally packaged short
// clip, its word still plays using the official full-page URL and timestamps.
const catalogFile=path.join(dist,'data','word-library.json');
if(fs.existsSync(catalogFile)){
 const library=JSON.parse(fs.readFileSync(catalogFile,'utf8'));
 let absent=0;
 for(const entry of Object.values(library.wordItems||{})){
  if(entry.type!=='printed-grid-cell'||!entry.clip)continue;
  const relative=entry.clip.replace(/^\.\//,'');
  if(!/^word-clips\/[a-zA-Z0-9-]+\.mp3$/.test(relative)||!fs.existsSync(path.join(dist,relative))){
   delete entry.clip;absent++;
  }
 }
 if(absent)fs.writeFileSync(catalogFile,JSON.stringify(library));
 console.log('Short audio media absent from this deployment:',absent,'(official timestamp playback remains available).');
}
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(x=>x.isDirectory()?walk(path.join(dir,x.name)):[path.join(dir,x.name)])}
const paths=walk(dist).filter(p=>!p.endsWith(`${path.sep}sw.js`)&&!p.includes(`${path.sep}vision${path.sep}`));
const files=paths.map(p=>'./'+path.relative(dist,p).split(path.sep).join('/'));
const digest=crypto.createHash('sha256');for(const p of paths)digest.update(fs.readFileSync(p));
const name='madani-reader-'+digest.digest('hex').slice(0,12);
fs.writeFileSync(path.join(dist,'sw.js'),`const VERSION=${JSON.stringify(name)},FILES=${JSON.stringify(['./',...files])};
self.addEventListener('install',e=>e.waitUntil(caches.open(VERSION).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('madani-reader-')&&k!==VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==self.location.origin)return;e.respondWith(caches.match(e.request).then(c=>c||fetch(e.request).then(r=>{if(r.ok&&u.pathname.includes('/vision/')){const copy=r.clone();e.waitUntil(caches.open('madani-vision-v1').then(cache=>cache.put(e.request,copy)))}return r})))});
`);
console.log('Offline cache prepared:',files.length,'files; book/audio available after installation. Vision models load on camera use and remain cached afterward.');
