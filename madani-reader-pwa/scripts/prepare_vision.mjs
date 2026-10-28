import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const dir=path.resolve('public/vision');fs.mkdirSync(dir,{recursive:true});
fs.copyFileSync('node_modules/@techstark/opencv-js/dist/opencv.js',path.join(dir,'opencv.js'));
fs.cpSync('node_modules/@mediapipe/tasks-vision/wasm',path.join(dir,'wasm'),{recursive:true});
for(const [name,source] of [['OpenCV-LICENSE','node_modules/@techstark/opencv-js/LICENSE'],['MediaPipe-LICENSE','node_modules/@mediapipe/tasks-vision/LICENSE']])if(fs.existsSync(source))fs.copyFileSync(source,path.join(dir,name));
const model=path.join(dir,'hand_landmarker.task'),url='https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',expected='fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1';
const digest=buffer=>crypto.createHash('sha256').update(buffer).digest('hex');
if(!fs.existsSync(model)||digest(fs.readFileSync(model))!==expected){const response=await fetch(url,{signal:AbortSignal.timeout(90000)});if(!response.ok)throw Error('Hand model download failed: '+response.status);const buffer=Buffer.from(await response.arrayBuffer());if(digest(buffer)!==expected)throw Error('Hand model checksum mismatch');fs.writeFileSync(model,buffer)}
console.log('Local page recognition and finger model assets prepared. Camera frames stay on the device.');
