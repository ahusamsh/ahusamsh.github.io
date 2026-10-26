/**
 * Restore already-published pilot assets into a clean CI/Vercel build.
 * Pinned immutable deployment avoids circular fetches from a mutable alias.
 * No media is copied into Git and no unrelated directories are modified.
 */
import fs from "node:fs/promises";
import path from "node:path";
const ROOT=path.resolve(process.cwd());
const MANIFEST=path.join(ROOT,"public/data/pilot-audio.json");
const SOURCE="https://madani-reader-pilot-ny5g23t0u-muzn2.vercel.app";
const manifest=JSON.parse(await fs.readFile(MANIFEST,"utf8"));
const files=new Set();
for(const p of Object.values(manifest.pages||{})){
 for(const x of [p.image,p.localAudio,...(p.boxes||[]).map(b=>b.clip)]){
  if(x)files.add(x.replace(/^\.\//,""));
 }
}
for(const segment of Object.values(manifest.segments||{})){if(segment.clip)files.add(segment.clip.replace(/^\.\//,""))}
const names=Array.from(files).sort();
if(names.length!==154)throw new Error("Unexpected pilot asset count: "+names.length+" (expected 154)");
if(names.some(x=>!/^pilot-media\/[a-zA-Z0-9-]+\.(?:jpg|mp3)$/.test(x)))throw new Error("Unexpected unsafe asset filename");
let next=0,downloaded=0,reused=0;
async function transfer(){
 while(next<names.length){
  const name=names[next++],dst=path.join(ROOT,"public",name);
  try{if((await fs.stat(dst)).size>=1000){reused++;continue}}catch{}
  await fs.mkdir(path.dirname(dst),{recursive:true});
  let last;
  for(let attempt=1;attempt<=3;attempt++){
   try{
    const response=await fetch(SOURCE+"/"+name,{signal:AbortSignal.timeout(25000)});
    if(!response.ok)throw new Error(name+": HTTP "+response.status);
    const buf=Buffer.from(await response.arrayBuffer());
    if(buf.length<1000)throw new Error("Incomplete "+name);
    await fs.writeFile(dst,buf);
    downloaded++;
    last=null;break;
   }catch(e){last=e;if(attempt<3)await new Promise(r=>setTimeout(r,400*attempt))}
  }
  if(last)throw last;
 }
}
await Promise.all(Array.from({length:8},transfer));
console.log("Pilot media assets verified:",names.length,"files, downloaded",downloaded,", reused",reused);
