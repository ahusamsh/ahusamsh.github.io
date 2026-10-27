export function reliableMatch(result,expectedPage){
 return !!result&&result.page===expectedPage&&result.inliers>=16&&result.ratio>=.28;
}
export function strongMovingMatch(result,expectedPage){
 return reliableMatch(result,expectedPage)&&result.inliers>=32&&result.ratio>=.35;
}
export function geometryAgrees(first,second,tolerance=.048){
 if(!first?.H||!second?.H)return false;
 const points=[{x:.2,y:.25},{x:.8,y:.72}];
 return points.every(pt=>{
  const a=project(first.H,pt),b=project(second.H,pt);
  return a&&b&&Math.hypot(a.x-b.x,a.y-b.y)<tolerance;
 });
}
import {project} from "./core.js";
