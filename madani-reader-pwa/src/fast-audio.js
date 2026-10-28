export class FastAudio{
 constructor(){this.context=null;this.cache=new Map();this.pending=new Map();this.raw=new Map();this.fetching=new Map();this.rawBytes=0;this.source=null;this.generation=0;this.bytes=0;this.warmGeneration=0}
 unlock(){try{const Type=globalThis.AudioContext||globalThis.webkitAudioContext;if(!Type)return Promise.resolve(false);this.context??=new Type({latencyHint:'interactive'});return this.context.resume().then(()=>true).catch(()=>false)}catch{return Promise.resolve(false)}}
 async read(url){
  if(this.raw.has(url)){const b=this.raw.get(url);this.raw.delete(url);this.raw.set(url,b);return b}
  if(this.fetching.has(url))return this.fetching.get(url);
  const job=(async()=>{const r=await fetch(url);if(!r.ok)throw Error('Audio '+r.status);const b=await r.arrayBuffer();if(b.byteLength<=8*1024*1024){while(this.rawBytes+b.byteLength>8*1024*1024&&this.raw.size){const key=this.raw.keys().next().value;this.rawBytes-=this.raw.get(key).byteLength;this.raw.delete(key)}this.raw.set(url,b);this.rawBytes+=b.byteLength}return b})();this.fetching.set(url,job);try{return await job}finally{this.fetching.delete(url)}
 }
 stage(urls){let index=0;const unique=[...new Set(urls.filter(Boolean))].slice(0,96);const loop=async()=>{while(index<unique.length){try{await this.read(unique[index++])}catch{}}};return Promise.all([loop(),loop(),loop()])}
 async load(url){
  if(this.cache.has(url)){const b=this.cache.get(url);this.cache.delete(url);this.cache.set(url,b);return b}
  if(this.pending.has(url))return this.pending.get(url);if(!this.context)return null;
  const job=(async()=>{const b=await this.context.decodeAudioData((await this.read(url)).slice(0));const bytes=b.length*b.numberOfChannels*4;if(bytes>24*1024*1024)throw Error('Audio too large');while(this.bytes+bytes>24*1024*1024&&this.cache.size){const key=this.cache.keys().next().value,old=this.cache.get(key);this.bytes-=old.length*old.numberOfChannels*4;this.cache.delete(key)}this.cache.set(url,b);this.bytes+=bytes;return b})();this.pending.set(url,job);try{return await job}finally{this.pending.delete(url)}
 }
 warm(urls){const generation=++this.warmGeneration;let index=0;const unique=[...new Set(urls.filter(Boolean))].slice(0,48);const loop=async()=>{while(index<unique.length&&generation===this.warmGeneration){try{await this.load(unique[index++])}catch{}}};return Promise.all([loop(),loop(),loop()])}
 stop(){this.generation++;try{this.source?.stop()}catch{}this.source?.disconnect();this.source=null}
 async play(url){const requestedAt=performance.now(),cacheHit=this.cache.has(url);this.stop();const generation=this.generation;if(!await this.unlock())return false;const buffer=await this.load(url);if(generation!==this.generation)return true;if(!buffer)return false;const source=this.context.createBufferSource();source.buffer=buffer;source.connect(this.context.destination);this.source=source;source.start();globalThis.document?.dispatchEvent(new CustomEvent('madani-audio-start',{detail:{url,cacheHit,latencyMs:performance.now()-requestedAt}}));return true}
}
