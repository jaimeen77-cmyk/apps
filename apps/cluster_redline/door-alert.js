'use strict';
// The door-open HUD warning: the car seen from above, an open door drawn open in red, while any door is open (also
// standing still). From DoorsWindowsRoofMirrors.CentralLockingSystemAndPanelStatus (added at install by
// traffic-config.js), each door's switch: open = 1 or a ..._OFFEN name, as appsKOR's Ambient Config reads it.
// Its own overlay layer, placed by display-config doorRect (middle of the HUD below the RPM face by default, moved and
// sized in Basic → Door-open warning → Position / size). Pixels are sent only when the open doors or the size change.
const IFACE='de.bmw.body.DoorsWindowsRoofMirrors',FIELD='CentralLockingSystemAndPanelStatus';
const DOORS={statusDoorSwitchDRD:'driverFront',statusDoorSwitchPSD:'passengerFront',statusDoorSwitchDRDR:'driverRear',statusDoorSwitchPSDR:'passengerRear'};
const W=96,H=150;
const RED='#ff2b3a',BODY='#c9d1dc',GLASS='#5d6b7c';
/** The open doors in a status value (a field however it is wrapped), or null when it names none of them. */
function openDoors(v){
 const find=(o,k,d)=>{if(!o||typeof o!=='object'||d>3)return undefined;if(k in o)return o[k];for(const x of Object.keys(o)){const r=find(o[x],k,d+1);if(r!==undefined)return r;}return undefined;};
 let seen=false;const open=[];
 Object.keys(DOORS).forEach(k=>{const x=find(v,k,0);if(x===undefined)return;seen=true;if(x===1||x===true||/_OFFEN$|^OPEN/.test(String(x)))open.push(DOORS[k]);});
 return seen?open:null;
}
class DoorState{
 constructor(){this.open=[];this.received=0;this.at=null;}
 sample(v,now){this.received++;this.at=now;const o=openDoors(v);if(o)this.open=o;}
 clear(){this.open=[];}
}
// Left-hand drive (Korea): the driver's doors on the left. Car pointing up, 96 x 150.
function paint(cv,open){
 const has=d=>open.includes(d);
 cv.roundRect(26,10,44,130,16,BODY);cv.roundRect(31,40,34,22,5,GLASS);cv.roundRect(31,98,34,16,5,GLASS);
 cv.roundRect(31,64,34,32,3,[60,70,82,255]);
 const door=(d,x0,y0,y1,left)=>{
  if(has(d)){const hinge=[x0,y0],end=[x0+(left?-22:22),y0+16];cv.line(hinge[0],hinge[1],end[0],end[1],6,RED);cv.line(x0,y0,x0,y1,2,RED);}
  else cv.line(x0,y0,x0,y1,3,[150,160,172,255]);
 };
 door('driverFront',26,42,74,true);door('passengerFront',70,42,74,false);door('driverRear',26,78,108,true);door('passengerRear',70,78,108,false);
 return cv;
}
function draw(open){const {Canvas}=require('./kit/canvas');const cv=new Canvas(W,H);cv.clear([0,0,0,0]);return paint(cv,open||[]);}
// At w x h (the Position / size scale), anti-aliased at that size rather than resampled.
function drawSized(open,w,h){const {ScaledCanvas}=require('./kit/canvas');const cv=new ScaledCanvas(W,H,Math.min(w/W,h/H));cv.clear([0,0,0,0]);paint(cv,open||[]);return cv.canvas;}
class DoorOverlay{
 constructor(client){this.client=client;this.layer=null;}
 // open: the open doors (none: hidden); cfg: settings for the place and size.
 tick(open,cfg){
  if(!open||!open.length||cfg.hudDoorHidden&&!open.preview){this.hide();return false;}
  const r=require('./display-config').doorRect(cfg);let l=this.layer;
  if(l&&(l.w!==r.w||l.h!==r.h)){this.client.drop(l.ref);l=this.layer=null;}
  if(!l){const ref=this.client.image({target:'hud',klass:'overlay',z:12,x:r.x,y:r.y,w:r.w,h:r.h,iw:r.w,ih:r.h,visible:false});if(!ref)return false;l=this.layer={ref,x:r.x,y:r.y,w:r.w,h:r.h,key:null,visible:false};}
  const key=open.slice().sort().join(',');
  if(l.key!==key){const im=drawSized(open,r.w,r.h),px=Buffer.alloc(r.w*r.h*4);
   for(let y=0;y<Math.min(r.h,im.h);y++)Buffer.from(im.d.buffer,im.d.byteOffset+y*im.w*4,Math.min(r.w,im.w)*4).copy(px,y*r.w*4);
   this.client.pixels(l.ref,null,px);l.key=key;}
  if(l.x!==r.x||l.y!==r.y){this.client.set(l.ref,{x:r.x,y:r.y});l.x=r.x;l.y=r.y;}
  if(!l.visible){this.client.set(l.ref,{visible:true});l.visible=true;}
  return true;
 }
 hide(){const l=this.layer;if(l&&l.visible){this.client.set(l.ref,{visible:false});l.visible=false;}}
 close(){if(this.layer)this.client.drop(this.layer.ref);this.layer=null;}
}
// the Position / size preview: every door open
const SAMPLE=Object.assign(['driverFront','passengerFront','driverRear','passengerRear'],{preview:true});
module.exports={IFACE,FIELD,DOORS,openDoors,DoorState,DoorOverlay,draw,drawSized,paint,SAMPLE,W,H};
