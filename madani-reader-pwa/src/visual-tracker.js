import {homography,project} from './core.js';
export class VisualTracker{
 constructor(){this.worker=null;this.ready=false;this.pending=null;this.canvas=document.createElement('canvas');this.ctx=this.canvas.getContext('2d',{willReadFrequently:true});this.closed=false;this.averageMs=180;this.quality=null}
 init(pages){return new Promise((resolve,reject)=>{
  this.worker=new Worker(new URL('./page-detector-worker.js',document.baseURI));const timer=setTimeout(()=>reject(Error('Recognition initialization timed out')),60000);
  this.worker.onmessage=({data})=>{if(this.closed)return;if(data.type==='ready'){clearTimeout(timer);this.ready=true;resolve()}else if(data.type==='result'){this.quality=data.quality;this.averageMs=.7*this.averageMs+.3*data.elapsedMs;const result=data.result;if(result){result.H=homography(result.corners,[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}]);result.inverse=homography([{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}],result.corners)}const done=this.pending;this.pending=null;done?.resolve(result)}else if(data.type==='error'){clearTimeout(timer);this.pending?.reject(Error(data.message));this.pending=null;reject(Error(data.message))}};
  this.worker.onerror=e=>{clearTimeout(timer);this.pending?.reject(Error(e.message));this.pending=null;reject(Error(e.message))};
  this.worker.postMessage({type:'init',pages:Object.entries(pages).map(([id,p])=>({...p,id,image:new URL(p.image,document.baseURI).href}))});
 })}
 detect(video){if(!this.ready||this.pending||this.closed)return Promise.resolve(null);const scale=Math.min(1,900/Math.max(video.videoWidth,video.videoHeight));const w=Math.round(video.videoWidth*scale),h=Math.round(video.videoHeight*scale);if(!w||!h)return Promise.resolve(null);if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h}this.ctx.drawImage(video,0,0,w,h);const image=this.ctx.getImageData(0,0,w,h);return new Promise((resolve,reject)=>{this.pending={resolve,reject};this.worker.postMessage({type:'frame',image},[image.data.buffer])})}
 pointInPage(result,tip){const p=result&&project(result.H,tip);return p&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1?p:null}
 dispose(){this.closed=true;this.worker?.terminate();this.pending?.resolve(null);this.pending=null;this.worker=null}
}
