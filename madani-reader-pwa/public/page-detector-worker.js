/* Local image matching: frames never leave this worker/device. */
let cvReady, references=[], orb, matcher;
async function init(pages){
 importScripts('./vision/opencv.js');
 cvReady=await self.cv;
 if(!cvReady.Mat)await new Promise(resolve=>{cvReady.onRuntimeInitialized=resolve});
 const cv=cvReady;orb=new cv.ORB();orb.setMaxFeatures(1000);orb.setFastThreshold(9);matcher=new cv.BFMatcher(cv.NORM_HAMMING,false);
 for(const page of pages){
  const response=await fetch(page.image);if(!response.ok)throw Error('Reference image unavailable');
  const bitmap=await createImageBitmap(await response.blob()),scale=600/bitmap.width;
  const canvas=new OffscreenCanvas(600,Math.round(bitmap.height*scale)),ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
  const rgba=cv.matFromImageData(ctx.getImageData(0,0,canvas.width,canvas.height)),gray=new cv.Mat(),mask=cv.Mat.zeros(canvas.height,canvas.width,cv.CV_8UC1),kp=new cv.KeyPointVector(),desc=new cv.Mat();
  cv.cvtColor(rgba,gray,cv.COLOR_RGBA2GRAY);normalizeLighting(gray);
  const zones=page.zones,left=Math.min(...zones.map(z=>z.box[0])),top=Math.min(...zones.map(z=>z.box[1])),right=Math.max(...zones.map(z=>z.box[0]+z.box[2])),bottom=Math.max(...zones.map(z=>z.box[1]+z.box[3]));
  cv.rectangle(mask,new cv.Point(left*canvas.width,top*canvas.height),new cv.Point(right*canvas.width,bottom*canvas.height),new cv.Scalar(255),-1);
  orb.detectAndCompute(gray,mask,kp,desc);references.push({id:page.id,width:canvas.width,height:canvas.height,kp,desc});rgba.delete();gray.delete();mask.delete();
 }
 return references.map(r=>({page:r.id,features:r.kp.size()}));
}
function project(h,x,y){const d=h[6]*x+h[7]*y+h[8];return {x:(h[0]*x+h[1]*y+h[2])/d,y:(h[3]*x+h[4]*y+h[5])/d}}
function match(ref,kp,desc,w,h){
 const cv=cvReady,knn=new cv.DMatchVectorVector();let src,dst,H,mask;
 try{
  matcher.knnMatch(ref.desc,desc,knn,2);const good=[];
  for(let i=0;i<knn.size();i++){const pair=knn.get(i);if(pair.size()===2){const a=pair.get(0),b=pair.get(1);if(a.distance<.72*b.distance&&a.distance<65)good.push({queryIdx:a.queryIdx,trainIdx:a.trainIdx,distance:a.distance})}pair.delete()}
  const seen=new Set(),unique=good.sort((a,b)=>a.distance-b.distance).filter(m=>{if(seen.has(m.trainIdx))return false;seen.add(m.trainIdx);return true});
  if(unique.length<22)return null;
  const srcPoints=[],dstPoints=[];
  for(const m of unique){const a=ref.kp.get(m.queryIdx).pt,b=kp.get(m.trainIdx).pt;srcPoints.push(a.x,a.y);dstPoints.push(b.x,b.y)}
  src=cv.matFromArray(unique.length,1,cv.CV_32FC2,srcPoints);dst=cv.matFromArray(unique.length,1,cv.CV_32FC2,dstPoints);mask=new cv.Mat();H=cv.findHomography(src,dst,cv.RANSAC,3.5,mask,2000,.995);
  if(H.empty())return null;const matrix=Array.from(H.data64F),inliers=[];
  for(let i=0;i<unique.length;i++)if(mask.data[i])inliers.push({x:srcPoints[i*2]/ref.width,y:srcPoints[i*2+1]/ref.height});
  if(inliers.length<18||inliers.length/unique.length<.45)return null;
  const spreadX=Math.max(...inliers.map(p=>p.x))-Math.min(...inliers.map(p=>p.x)),spreadY=Math.max(...inliers.map(p=>p.y))-Math.min(...inliers.map(p=>p.y));
  if(spreadX<.38||spreadY<.35)return null;
  const corners=[[0,0],[ref.width,0],[ref.width,ref.height],[0,ref.height]].map(([x,y])=>project(matrix,x,y)).map(p=>({x:p.x/w,y:p.y/h}));
  if(corners.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<-.15||p.x>1.15||p.y<-.15||p.y>1.15))return null;
  let area=0;const crosses=[];for(let i=0;i<4;i++){const a=corners[i],b=corners[(i+1)%4],c=corners[(i+2)%4];area+=a.x*b.y-a.y*b.x;crosses.push((b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x))}
  area=Math.abs(area)/2;if(area<.08||area>1.15||!crosses.every(x=>x>0))return null;
  return {page:ref.id,corners,inliers:inliers.length,matches:unique.length,score:inliers.length*(inliers.length/unique.length),coverage:spreadX*spreadY};
 }finally{knn.delete();src?.delete();dst?.delete();H?.delete();mask?.delete()}
}
function normalizeLighting(gray){
 const a=gray.data,hist=new Uint32Array(256);let sum=0,n=0;
 for(let i=0;i<a.length;i+=4){hist[a[i]]++;sum+=a[i];n++}
 let lo=0,hi=255,count=0;while(lo<254&&(count+=hist[lo])<n*.02)lo++;count=0;while(hi>lo&&(count+=hist[hi])<n*.02)hi--;
 const span=hi-lo,mean=sum/n,quality={dark:mean<60,lowContrast:span<85,mean,contrast:span};
 if(span>12&&(mean<85||span<160)){const scale=255/span;for(let i=0;i<a.length;i++)a[i]=Math.max(0,Math.min(255,(a[i]-lo)*scale))}
 return quality;
}
let lastQuality=null;
function detect(image){
 const cv=cvReady,rgba=cv.matFromImageData(image),gray=new cv.Mat(),mask=new cv.Mat(),kp=new cv.KeyPointVector(),desc=new cv.Mat();
 try{cv.cvtColor(rgba,gray,cv.COLOR_RGBA2GRAY);lastQuality=normalizeLighting(gray);orb.detectAndCompute(gray,mask,kp,desc);if(desc.rows<22)return null;const matches=references.map(ref=>match(ref,kp,desc,image.width,image.height)).filter(Boolean).sort((a,b)=>b.score-a.score);if(!matches.length)return null;if(matches[1]&&matches[0].score<matches[1].score*1.4)return null;return matches[0]}
 finally{rgba.delete();gray.delete();mask.delete();kp.delete();desc.delete()}
}
self.onmessage=async({data})=>{
 try{
  if(data.type==='init'){const refs=await init(data.pages);postMessage({type:'ready',references:refs});return}
  if(data.type==='frame'){const start=performance.now();const result=detect(data.image);postMessage({type:'result',id:data.id,result,elapsedMs:performance.now()-start,quality:lastQuality})}
 }catch(error){postMessage({type:'error',message:error?.message||String(error)})}
};
