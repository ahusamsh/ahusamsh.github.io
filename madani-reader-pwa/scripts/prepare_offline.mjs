import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const dist=path.resolve('dist');
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(x=>x.isDirectory()?walk(path.join(dir,x.name)):[path.join(dir,x.name)])}
const paths=walk(dist).filter(p=>!p.endsWith(`${path.sep}sw.js`));
const files=paths.map(p=>'./'+path.relative(dist,p).split(path.sep).join('/'));
const digest=crypto.createHash('sha256');for(const p of paths)digest.update(fs.readFileSync(p));
const name='madani-reader-'+digest.digest('hex').slice(0,12);
fs.writeFileSync(path.join(dist,'sw.js'),`const VERSION=${JSON.stringify(name)},FILES=${JSON.stringify(['./',...files])};
self.addEventListener('install',e=>e.waitUntil(caches.open(VERSION).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('madani-reader-')&&k!==VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==self.location.origin)return;e.respondWith(caches.match(e.request).then(c=>c||fetch(e.request)))});
`);
console.log('Offline cache prepared:',files.length,'files; book/audio available after installation. Camera model requires network.');
