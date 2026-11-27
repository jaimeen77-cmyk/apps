'use strict';
// The Car layout's picture: a car seen from slightly above and behind at night that does what the car does,
// from its own G, gear and speed.
//   reverse gear: reversing lamps lit         standing still: the road still, the engine idling
//   braking: brake lamps lit, the nose dipping
//   cornering (four steps): a lean, the tail stepping out, sliding with smoke, a full drift   accelerating: flames
//   from the exhaust   otherwise: driving straight on
// A new state fades in over the old one (FADE_MS), so a change does not jump.
// The frames (car-meter-frames.js, made by tools/car-meter/m3.py, 1.3.90) are the owner's BMW M3: seen from behind,
// with each side's bend drawn on its own (steps 1-3), and the owner's drift picture for step 4 (a left bend; a right
// one is it mirrored). Small palette images; each state's frames are unpacked on first use and scaled to the
// element's size once (kept while that state and size last).
const zlib=require('zlib');
const isNum=x=>typeof x==='number'&&isFinite(x);
// G thresholds. Lateral G is positive to the left (ISO 8855, as the meter's dot is drawn). Cornering has four
// steps (TURN): leaning into the bend, the tail stepping out with a little smoke, sliding in a cloud of it, and
// (1.3.90) a full drift from 0.50 G.
const TH={brake:-0.18,accel:0.12,turn:0.10},TURN=[0.10,0.25,0.35,0.50];
const HOLD_MS=400,CONFIRM_MS=150,FPS=10,FADE_MS=300,FADE_STEPS=6;
// Two sets: the cluster's (the car on a night road) and the HUD's (the car alone on black, which is clear on the
// glass), each loaded on first use.
const data={};
function frames(set){
 const k=set==='hud'?'hud':'cluster';if(data[k])return data[k];
 const src=require(k==='hud'?'./car-meter-hud-frames':'./car-meter-frames'),pal=Buffer.from(src.palette,'base64'),states={};
 Object.keys(src.states).forEach(s=>{states[s]=zlib.inflateSync(Buffer.from(src.states[s],'base64'));});
 return (data[k]={W:src.W,H:src.H,N:src.N,pal,states});
}
// What the car is doing, from its G, gear and speed (km/h, null when unknown): 'reverse', 'stop', 'brake',
// 'left1'..'left4', 'right1'..'right4', 'accel' or 'cruise'. Standing still: under 1 km/h, or in P when the
// speed is not known.
function want(g,stage,speed){
 if(stage==='R')return 'reverse';
 if(isNum(speed)?speed<1:stage==='P')return 'stop';
 const lat=g&&isNum(g.lat)?g.lat:0,lon=g&&isNum(g.long)?g.long:0,a=Math.abs(lat);
 // braking and cornering at once: whichever is further past its threshold
 const b=lon<=TH.brake?lon/TH.brake:0,t=a>=TH.turn?a/TH.turn:0;
 if(b||t){if(b>=t)return 'brake';const step=a>=TURN[3]?4:a>=TURN[2]?3:a>=TURN[1]?2:1;return (lat>0?'left':'right')+step;}
 return lon>=TH.accel?'accel':'cruise';
}
// A state's pictures: cornering steps 1-3 are the owner's left-bend pictures ('turn2_left', 1.3.94), step 4 the drift
// picture, also a left bend; a right bend is them mirrored when drawn (only the left ones are kept: a smaller set).
function look(s){const m=/^(left|right)([1234])$/.exec(s);if(!m)return {state:s,mirror:false};
 return {state:m[2]==='4'?'drift':'turn'+m[2]+'_left',mirror:m[1]==='right'};}
// A new state must last CONFIRM_MS and the shown one HOLD_MS, so a single noisy sample does not flicker.
const shown={};
function pick(display,g,stage,now,speed){
 const m=shown[display]||(shown[display]={cur:'cruise',since:-Infinity,cand:null,candSince:0}),w=want(g,stage,speed);
 if(w===m.cur){m.cand=null;return m.cur;}
 if(w==='reverse'||m.cur==='reverse'){m.cur=w;m.since=now;m.cand=null;return m.cur;}   // the gear is no guess
 if(m.cand!==w){m.cand=w;m.candSince=now;}
 if(now-m.candSince>=CONFIRM_MS&&now-m.since>=HOLD_MS){m.cur=w;m.since=now;m.cand=null;}
 return m.cur;
}
// The frame to show on a display: {state, mirror, i, set} (set: the HUD's own pictures on the HUD); for FADE_MS
// after a change also from: the old picture (still moving) and t (0..1, in FADE_STEPS steps): how far the new one
// has faded in.
function frameOf(display,g,stage,now,speed){
 const s=look(pick(display,g,stage,now,speed)),set=display==='hud'?'hud':'cluster',n=frames(set).N,m=shown[display];
 const key=s.state+(s.mirror?'<':''),pos=now*FPS/1000,i=Math.floor(pos)%n;
 if(m.lookKey!==key){if(m.lookKey)m.fade={from:m.look,at:now};m.lookKey=key;m.look=s;}
 const out={state:s.state,mirror:s.mirror,i,set};
 // 1.3.58: the second half of each frame's 100 ms shows it mixed half and half with the next one, so the picture
 // changes every 50 ms (the cluster's 20 frames a second) instead of jumping every 100 ms; same frames, same speed
 if(pos-Math.floor(pos)>=0.5)out.next=(i+1)%n;
 if(m.fade&&now-m.fade.at<FADE_MS){
  out.from={state:m.fade.from.state,mirror:m.fade.from.mirror,i,set};
  out.t=Math.max(1,Math.min(FADE_STEPS-1,Math.ceil((now-m.fade.at)/FADE_MS*FADE_STEPS)))/FADE_STEPS;
 }else m.fade=null;
 return out;
}
function reset(){Object.keys(shown).forEach(k=>delete shown[k]);}
// One frame as RGBA at w x h (bilinear), its edges fading out into the dark cluster.
const scaledCache=new Map();
function rgba(f,w,h){
 const key=(f.set||'cluster')+'|'+f.state+'|'+(f.mirror?1:0)+'|'+w+'|'+h;let list=scaledCache.get(key);
 if(!list){if(scaledCache.size>=6)scaledCache.clear();list=[];scaledCache.set(key,list);}   // (a fade on each display: 4)
 if(list[f.i])return list[f.i];
 const D=frames(f.set),sw=D.W,sh=D.H,src=D.states[f.state]||D.states.cruise,off=(D.states[f.state]?f.i:0)*sw*sh,pal=D.pal,out=new Uint8ClampedArray(w*h*4);
 const fade=Math.max(1,Math.round(Math.min(w,h)*0.14)),hud=f.set==='hud';
 for(let y=0;y<h;y++){
  const fy=Math.max(0,Math.min(sh-1,(y+0.5)*sh/h-0.5)),y0=Math.floor(fy),y1=Math.min(sh-1,y0+1),ty=fy-y0;
  const ey=Math.min(y,h-1-y);
  for(let x=0;x<w;x++){
   let fx=Math.max(0,Math.min(sw-1,(x+0.5)*sw/w-0.5));if(f.mirror)fx=sw-1-fx;
   const x0=Math.floor(fx),x1=Math.min(sw-1,x0+1),tx=fx-x0,p=(y*w+x)*4;
   const a=src[off+y0*sw+x0]*3,b=src[off+y0*sw+x1]*3,c=src[off+y1*sw+x0]*3,d=src[off+y1*sw+x1]*3;
   for(let k=0;k<3;k++){const top=pal[a+k]+(pal[b+k]-pal[a+k])*tx,bot=pal[c+k]+(pal[d+k]-pal[c+k])*tx;out[p+k]=top+(bot-top)*ty;}
   const e=Math.min(x,w-1-x,ey);let al=e>=fade?255:Math.round(255*Math.pow(e/fade,1.5));
   // the HUD's set: black is see-through, so nothing under the picture is covered by its dark ground
   if(hud)al=Math.round(al*Math.min(1,Math.max(out[p],out[p+1],out[p+2])/64));
   out[p+3]=al;
  }
 }
 return (list[f.i]=out);
}
// Frame f half and half with the next one (f.next), as RGBA at w x h; kept like the frames (one in-between per frame).
const halfCache=new Map();
function between(f,w,h){
 const a=rgba(f,w,h);if(f.next===undefined)return a;
 const key=(f.set||'cluster')+'|'+f.state+'|'+(f.mirror?1:0)+'|'+w+'|'+h;let list=halfCache.get(key);
 if(!list){if(halfCache.size>=6)halfCache.clear();list=[];halfCache.set(key,list);}
 if(list[f.i])return list[f.i];
 const b=rgba({state:f.state,mirror:f.mirror,i:f.next,set:f.set},w,h),mix=new Uint8ClampedArray(a.length);
 for(let p=0;p<a.length;p+=4){const wa=a[p+3],wb=b[p+3],al=wa+wb;if(!al)continue;
  mix[p]=(a[p]*wa+b[p]*wb)/al;mix[p+1]=(a[p+1]*wa+b[p+1]*wb)/al;mix[p+2]=(a[p+2]*wa+b[p+2]*wb)/al;mix[p+3]=al/2;}
 return (list[f.i]=mix);
}
// Draws frame f into r (a kit Canvas, or anything with blit) at x, y (pixels), w x h.
function draw(r,f,x,y,w,h){
 if(f&&f.flip)return;   // (1.3.62) the GPU flipbook (flipbook.js) shows it on a layer of its own
 if(f&&f.mine){require('./my-picture').draw(r,f,x,y,w,h);return;}   // the My picture layout's own GIF
 x=Math.round(x);y=Math.round(y);w=Math.round(w);h=Math.round(h);if(w<2||h<2)return;
 let px=between(f,w,h);
 // fading from the old picture: the two mixed (colour weighted by each one's cover, so edges stay soft)
 if(f.from&&f.t>0&&f.t<1){const a=rgba(f.from,w,h),b=px,t=f.t,mix=new Uint8ClampedArray(b.length);
  for(let p=0;p<b.length;p+=4){const wa=a[p+3]*(1-t),wb=b[p+3]*t,al=wa+wb;if(!al)continue;
   mix[p]=(a[p]*wa+b[p]*wb)/al;mix[p+1]=(a[p+1]*wa+b[p+1]*wb)/al;mix[p+2]=(a[p+2]*wa+b[p+2]*wb)/al;mix[p+3]=al;}
  px=mix;}
 if(r.d&&isNum(r.w)&&isNum(r.h)){
  const dd=r.d,dw=r.w,x0=Math.max(0,x),x1=Math.min(r.w,x+w),y0=Math.max(0,y),y1=Math.min(r.h,y+h);
  for(let yy=y0;yy<y1;yy++)for(let xx=x0;xx<x1;xx++){
   const s=((yy-y)*w+(xx-x))*4,p=(yy*dw+xx)*4,sa=px[s+3];if(!sa)continue;
   if(sa===255||!dd[p+3]){dd[p]=px[s];dd[p+1]=px[s+1];dd[p+2]=px[s+2];dd[p+3]=sa;continue;}
   const a=sa/255,da=dd[p+3]/255,oa=a+da*(1-a);
   for(let k=0;k<3;k++)dd[p+k]=Math.round((px[s+k]*a+dd[p+k]*da*(1-a))/oa);dd[p+3]=Math.round(oa*255);
  }
  return;
 }
 // the GPU renderer's recorder (the settings screen's layout picker on the car): a pixel image by id, not a canvas
 // (its blit takes only cached layers: 'Recorder.blit: not a layer')
 if(typeof r.image==='function'&&!r.d){let rec=null;try{rec=require('./kit/record');}catch(e){}
  if(rec&&typeof rec.setImage==='function'){const id=(IMAGE_ID+((w*131+h)&0xffff))>>>0,data=Buffer.from(px);
   rec.setImage(id,w,h,data);r.image(id,x,y,w,h);return;}}
 if(typeof r.blit==='function'){const {Canvas}=require('./kit/canvas'),c=new Canvas(w,h);c.d.set(px);r.blit(c,x,y);}
}
// pixel image ids for the recorder path (one per picture size)
const IMAGE_ID=0x43A20000;
module.exports={TH,TURN,want,look,pick,frameOf,reset,draw,frames,FPS,FADE_MS};
