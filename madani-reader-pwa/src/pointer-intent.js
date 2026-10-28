// Short deliberate dwell in a cell's interior; slower at borders to reject sweeps.
export class PointerIntent{
 constructor(){this.reset()}
 reset(){this.id=null;this.point=null;this.since=0;this.samples=0;this.lastSeen=0;this.played=null}
 update(zone,p,time){
  if(!zone||!p){if(time-this.lastSeen>180)this.reset();return null}
  const [x,y,w,h]=zone.box,margin=Math.min((p.x-x)/w,(x+w-p.x)/w,(p.y-y)/h,(y+h-p.y)/h),distance=this.point?Math.hypot(p.x-this.point.x,p.y-this.point.y):0;
  if(this.id!==zone.id||distance>.025){this.id=zone.id;this.since=time;this.samples=0;if(this.played!==zone.id)this.played=null}
  this.samples++;this.point=p;this.lastSeen=time;
  if(this.samples>=2&&time-this.since>=(margin>.15?80:160)&&this.played!==zone.id){this.played=zone.id;return zone}
  return null;
 }
}
