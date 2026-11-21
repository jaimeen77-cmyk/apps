'use strict';
// The door-open HUD warning: the car seen from above, an open door drawn open in red, while any door is open (also
// standing still). From DoorsWindowsRoofMirrors.CentralLockingSystemAndPanelStatus (added at install by
// traffic-config.js), each door's switch: open = 1 or a ..._OFFEN name, as appsKOR's Ambient Config reads it.
// Its own overlay layer, left of the RPM face. Pixels are sent only when the set of open doors changes.
const IFACE='de.bmw.body.DoorsWindowsRoofMirrors',FIELD='CentralLockingSystemAndPanelStatus';
const DOORS={statusDoorSwitchDRD:'driverFront',statusDoorSwitchPSD:'passengerFront',statusDoorSwitchDRDR:'driverRear',statusDoorSwitchPSDR:'passengerRear'};
const W=96,H=150,X=34,Y=96;
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
class DoorOverlay{
 constructor(client){this.client=client;this.ref=0;this.key=null;this.visible=false;}
 tick(open){
  if(!open||!open.length){this.hide();return false;}
  if(!this.ref){this.ref=this.client.image({target:'hud',klass:'overlay',z:12,x:X,y:Y,w:W,h:H,iw:W,ih:H,visible:false});if(!this.ref)return false;}
  const key=open.slice().sort().join(',');
  if(this.key!==key){const cv=draw(open);this.client.pixels(this.ref,null,Buffer.from(cv.d.buffer,cv.d.byteOffset,cv.d.byteLength));this.key=key;}
  if(!this.visible){this.client.set(this.ref,{visible:true});this.visible=true;}
  return true;
 }
 hide(){if(this.ref&&this.visible){this.client.set(this.ref,{visible:false});this.visible=false;}}
 close(){if(this.ref)this.client.drop(this.ref);this.ref=0;this.key=null;this.visible=false;}
}
module.exports={IFACE,FIELD,DOORS,openDoors,DoorState,DoorOverlay,draw,paint,W,H,X,Y};
