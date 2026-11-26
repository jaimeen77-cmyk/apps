'use strict';
// The door-open HUD warning: the car seen from above, an open door drawn open in red, while any door is open (also
// standing still). From DoorsWindowsRoofMirrors.CentralLockingSystemAndPanelStatus (added at install by
// traffic-config.js), each door's switch: open = 1 or a ..._OFFEN name, as appsKOR's Ambient Config reads it.
// Its own overlay layer, placed by display-config doorRect (middle of the HUD below the RPM face by default, moved and
// sized in Basic → Door-open warning → Position / size). Pixels are sent only when the open doors or the size change.
const IFACE='de.bmw.body.DoorsWindowsRoofMirrors',FIELD='CentralLockingSystemAndPanelStatus';
const DOORS={statusDoorSwitchDRD:'driverFront',statusDoorSwitchPSD:'passengerFront',statusDoorSwitchDRDR:'driverRear',statusDoorSwitchPSDR:'passengerRear'};
// The picture: 120 x 150, the car seen from above (56 wide, 128 long), room on each side for a door swung open.
const W=120,H=150;
const RED='#ff2b3a';
// The hood and the tailgate (1.3.28): their switches are in the same status, but their names have not been seen on a
// car yet, so they are found by name (English or German, as the door names and values are): an item naming the
// hood / bonnet / Motorhaube or the tailgate / trunk / boot / Heckklappe, not its window, lock, button or light.
const LIDS=[['hood',/hood|bonnet|motorhaube|front_?lid|engine_?lid/i],['trunk',/tailgate|trunk|heckklappe|rear_?lid|boot_?lid|bootlid|deck_?lid|luggage/i]];
const NOT_LID=/window|glass|scheibe|lock|verriegel|button|taster|light|lamp|leuchte|sensor|position|valid|qualifier|alarm/i;
const isOpen=x=>x===1||x===true||/OFFEN|OPEN/i.test(String(x))&&!/NICHT|NOT|CLOSED|GESCHLOSSEN/i.test(String(x));
// every item of a value with a plain value, by name (however it is wrapped, a few levels deep)
function items(v){const out=[];const walk=(o,d)=>{if(!o||typeof o!=='object'||d>3)return;Object.keys(o).forEach(k=>{const x=o[k];if(x!==null&&typeof x==='object')walk(x,d+1);else out.push([k,x]);});};walk(v,0);return out;}
/** The hood / trunk items in a value: { seen: ['hood', ...], open: ['trunk', ...], names: { hood: 'statusX' } }. */
function lids(v){
 const seen=[],open=[],names={};
 items(v).forEach(([k,x])=>{if(DOORS[k]||NOT_LID.test(k))return;LIDS.forEach(([lid,re])=>{if(!re.test(k)||names[lid])return;names[lid]=k;seen.push(lid);if(isOpen(x))open.push(lid);});});
 return {seen,open,names};
}
/** The open doors (and hood / trunk) in a status value, or null when it names none of them. */
function openDoors(v){
 const find=(o,k,d)=>{if(!o||typeof o!=='object'||d>3)return undefined;if(k in o)return o[k];for(const x of Object.keys(o)){const r=find(o[x],k,d+1);if(r!==undefined)return r;}return undefined;};
 let seen=false;const open=[];
 Object.keys(DOORS).forEach(k=>{const x=find(v,k,0);if(x===undefined)return;seen=true;if(isOpen(x))open.push(DOORS[k]);});
 const found=lids(v);if(found.seen.length)seen=true;found.open.forEach(l=>open.push(l));
 return seen?open:null;
}
class DoorState{
 constructor(){this.open=[];this.received=0;this.at=null;this.names=[];this.lidNames={};}
 // names: what else the status carries (shown on the settings screen, to tell the hood and trunk names on a car)
 sample(v,now){this.received++;this.at=now;const o=openDoors(v);if(o)this.open=o;
  items(v).map(([k])=>k).filter(k=>!DOORS[k]).forEach(k=>{if(this.names.indexOf(k)<0&&this.names.length<40)this.names.push(k);});
  Object.assign(this.lidNames,lids(v).names);}
 clear(){this.open=[];}
}
// Left-hand drive (Korea): the driver's doors on the left. Car pointing up, drawn as the car's own door display draws
// it: a silver body with soft shading, the windscreen and rear window dark, a large panoramic roof, the mirrors; an open
// door swung out from its front hinge, in red (its inner trim dark): red marks only what is open. Black is see-through on the HUD, so the dark parts are a dark grey.
function bez(p0,p1,p2,p3,n){const o=[];for(let i=1;i<=n;i++){const t=i/n,u=1-t;o.push([u*u*u*p0[0]+3*u*u*t*p1[0]+3*u*t*t*p2[0]+t*t*t*p3[0],u*u*u*p0[1]+3*u*u*t*p1[1]+3*u*t*t*p2[1]+t*t*t*p3[1]]);}return o;}
// a shape given by its right half (x from the car's centre line, y from the nose), mirrored
const mirror=half=>half.concat(half.slice().reverse().map(([x,y])=>[-x,y]));
const CX=60,TOP=11,HALF=28;
const BODY=mirror([[0,0],...bez([0,0],[17,0],[26,2.5],[27.4,13],8),[28,38],[27.6,70],[28,96],[28,112],...bez([28,112],[28,124],[19,128],[0,128],8)]);
const HOOD=mirror([[0,2.4],...bez([0,2.4],[15,2.4],[23.5,5],[24.2,14],6),[24,28.5],...bez([24,28.5],[16,26],[7,25.4],[0,25.4],5)]);
const SCREEN=mirror([[0,25.4],...bez([0,25.4],[9,25.4],[18,26.4],[24,29],5),[22.4,39],...bez([22.4,39],[15,37.4],[7,37],[0,37],5)]);
const SIDE_GLASS=[[22.4,39],[24.6,31],[25.4,46],[25.2,86],[23.4,92],[21.6,88]];
const ROOF=mirror([[0,37],...bez([0,37],[8,37],[16,37.6],[21.4,39.5],4),[21.2,82],...bez([21.2,82],[14,80.6],[7,80.4],[0,80.4],4)]);
const PANO=mirror([[0,42],[13.5,42],...bez([13.5,42],[16,42],[16.8,43.2],[16.8,46],3),[16.8,74],...bez([16.8,74],[16.8,76.6],[16,77.6],[13.5,77.6],3),[0,77.6]]);
const REAR_GLASS=mirror([[0,80.4],...bez([0,80.4],[9,80.4],[17,81.2],[21.4,83],5),[22.6,94],...bez([22.6,94],[22.6,104],[16,108.4],[0,108.6],6)]);
const GATE=mirror([[0,108.6],...bez([0,108.6],[12,108.6],[21,106.5],[24.4,101],4),[25.4,116],[0,117]]);
// the tail lights: one a side, apart in the middle of the tailgate as on a BMW, each an L round its corner
const LAMP=[[9.5,116.4],[24.6,115.4],[25.6,108.6],[27.4,109.2],[26.8,119.8],[9.5,119.6]];
const MIRROR=[[26.6,30],[33.4,32.4],[34,35.4],[26.6,37]];
// The doors along each side: from the front hinge, its length along the car.
const DOOR_AT={driverFront:{side:-1,y:40,len:30},passengerFront:{side:1,y:40,len:30},driverRear:{side:-1,y:71,len:25},passengerRear:{side:1,y:71,len:25}};
const SILVER=[201,206,214,255],LIGHT=[236,239,243,255],EDGE=[128,134,143,255],GLASS=[52,57,64,255],PANO_GLASS=[222,226,231,255],TRIM=[62,67,75,255];
function paint(cv,open){
 const has=d=>open.includes(d),at=pts=>pts.map(([x,y])=>[CX+x,TOP+y]),flip=pts=>pts.map(([x,y])=>[-x,y]);
 const inset=(pts,k,dy)=>pts.map(([x,y])=>[x*k,y+(dy||0)]);
 // the body: an edge, then the paint lighter towards the middle (a soft gradient)
 cv.fill(at(BODY),EDGE);cv.fill(at(inset(BODY,0.95)),SILVER);cv.fill(at(inset(HOOD,0.86)),LIGHT);cv.fill(at(inset(GATE,0.86)),LIGHT);
 cv.fill(at(MIRROR),SILVER);cv.fill(at(flip(MIRROR)),SILVER);
 cv.fill(at(SCREEN),GLASS);cv.fill(at(SIDE_GLASS),GLASS);cv.fill(at(flip(SIDE_GLASS)),GLASS);
 cv.fill(at(ROOF),SILVER);cv.fill(at(PANO),PANO_GLASS);cv.fill(at(REAR_GLASS),GLASS);cv.fill(at(LAMP),[150,34,44,255]);cv.fill(at(flip(LAMP)),[150,34,44,255]);
 cv.line(CX,TOP+76,CX,TOP+79,1.6,EDGE);                                       // the aerial fin
 // the hood open: lifted from its hinge at the windscreen, so it looks shorter from above, in red; the tailgate open:
 // lifted from the roof's end, the rear window and the tailgate in red
 if(has('hood')){cv.fill(at(inset(HOOD,1.02,-0.5)),RED);cv.fill(at(inset(HOOD,0.72,1.5).map(([x,y])=>[x,Math.min(y,23)])),[255,120,128,255]);}
 if(has('trunk')){cv.fill(at(REAR_GLASS),RED);cv.fill(at(GATE),RED);cv.fill(at([[-19,110],[19,110],[18.5,115],[-18.5,115]]),[255,120,128,255]);}
 // each open door: the opening in the side dark, the door swung out about 80 degrees from its front hinge
 Object.keys(DOOR_AT).forEach(d=>{
  if(!has(d))return;const {side,y,len}=DOOR_AT[d],s=side,x0=HALF+0.2,L=len*0.9,T=len*0.52;
  const P=pts=>at(pts.map(([x,yy])=>[s*x,yy]));
  cv.fill(P([[x0-2.6,y+1],[x0,y+1],[x0,y+len-1],[x0-2.6,y+len-1]]),TRIM);
  const panel=[[x0,y],[x0+L,y+3],[x0+L+1.5,y+T+2],[x0+L-1,y+T+4],[x0,y+T]];
  cv.fill(P(panel),RED);cv.fill(P([[x0+0.8,y+4.6],[x0+L-1,y+7],[x0+L,y+T+1.4],[x0+L-1.6,y+T+2.6],[x0+0.8,y+T-1.2]]),TRIM);
  cv.fill(P([[x0+1,y+1.6],[x0+L-1.5,y+4.2],[x0+L-1.5,y+5.4],[x0+1,y+3.4]]),[255,120,128,255]);   // the window frame, lit
  cv.line(CX+s*(x0+4),TOP+y+9.5,CX+s*(x0+L-5),TOP+y+11,1.3,[120,126,136,255]);                 // the armrest
  cv.fill(P([[x0+L-5,y+T-2],[x0+L-1,y+T-1.4],[x0+L-1.5,y+T+1],[x0+L-5.5,y+T+0.4]]),[150,156,166,255]); // the handle
 });
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
const SAMPLE=Object.assign(['driverFront','passengerFront','driverRear','passengerRear','hood','trunk'],{preview:true});
// the car's shapes (top view, x across, y from the front), also for the HUD lane lines (lane-lines.js, 1.3.79)
const SHAPES={BODY,HOOD,SCREEN,SIDE_GLASS,ROOF,PANO,REAR_GLASS,GATE,LAMP,MIRROR,SILVER,LIGHT,EDGE,GLASS,PANO_GLASS,LENGTH:128};
module.exports={IFACE,FIELD,DOORS,LIDS,lids,items,openDoors,DoorState,DoorOverlay,draw,drawSized,paint,SAMPLE,SHAPES,W,H};
