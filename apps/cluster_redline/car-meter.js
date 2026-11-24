'use strict';
// Car picture in place of the G-force meter's dot (G-force + RPM rings layout, "Car picture" on the
// G-force meter's Position / size screen): a car seen from behind at night that follows the car's own G.
//   reverse gear: reversing lamps lit         standing still: the road still, the engine idling
//   braking: brake lamps lit, the nose dipping
//   cornering: the tail sliding out, smoke     accelerating: flames from the exhaust
//   otherwise: driving straight on
// The frames (car-meter-frames.js) are original drawings, small palette images; each state's frames are
// unpacked on first use and scaled to the element's size once (kept while that state and size last).
const zlib=require('zlib');
const isNum=x=>typeof x==='number'&&isFinite(x);
// G thresholds. Lateral G is positive to the left (ISO 8855, as the meter's dot is drawn). Cornering has three
// steps (TURN): leaning into the bend, the tail stepping out with a little smoke, a full drift.
const TH={brake:-0.18,accel:0.12,turn:0.10},TURN=[0.10,0.25,0.35];
const HOLD_MS=400,CONFIRM_MS=150,FPS=10;
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
// 'left1'..'left3', 'right1'..'right3', 'accel' or 'cruise'. Standing still: under 1 km/h, or in P when the
// speed is not known.
function want(g,stage,speed){
 if(stage==='R')return 'reverse';
 if(isNum(speed)?speed<1:stage==='P')return 'stop';
 const lat=g&&isNum(g.lat)?g.lat:0,lon=g&&isNum(g.long)?g.long:0,a=Math.abs(lat);
 // braking and cornering at once: whichever is further past its threshold
 const b=lon<=TH.brake?lon/TH.brake:0,t=a>=TH.turn?a/TH.turn:0;
 if(b||t){if(b>=t)return 'brake';const step=a>=TURN[2]?3:a>=TURN[1]?2:1;return (lat>0?'left':'right')+step;}
 return lon>=TH.accel?'accel':'cruise';
}
// A state's pictures: the cornering ones are the right-hand drift, mirrored for a left one.
function look(s){const m=/^(left|right)([123])$/.exec(s);return m?{state:'turn'+m[2],mirror:m[1]==='left'}:{state:s,mirror:false};}
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
// The frame to show on a display: {state, mirror, i, set} (set: the HUD's own pictures on the HUD).
function frameOf(display,g,stage,now,speed){
 const s=look(pick(display,g,stage,now,speed)),set=display==='hud'?'hud':'cluster',n=frames(set).N;
 return {state:s.state,mirror:s.mirror,i:Math.floor(now*FPS/1000)%n,set};
}
function reset(){Object.keys(shown).forEach(k=>delete shown[k]);}
// One frame as RGBA at w x h (bilinear), its edges fading out into the dark cluster.
const scaledCache=new Map();
function rgba(f,w,h){
 const key=(f.set||'cluster')+'|'+f.state+'|'+(f.mirror?1:0)+'|'+w+'|'+h;let list=scaledCache.get(key);
 if(!list){if(scaledCache.size>=4)scaledCache.clear();list=[];scaledCache.set(key,list);}
 if(list[f.i])return list[f.i];
 const D=frames(f.set),sw=D.W,sh=D.H,src=D.states[f.state],off=f.i*sw*sh,pal=D.pal,out=new Uint8ClampedArray(w*h*4);
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
// Draws frame f into r (a kit Canvas, or anything with blit) at x, y (pixels), w x h.
function draw(r,f,x,y,w,h){
 if(f&&f.mine){require('./my-picture').draw(r,f,x,y,w,h);return;}   // the My picture layout's own GIF
 x=Math.round(x);y=Math.round(y);w=Math.round(w);h=Math.round(h);if(w<2||h<2)return;
 const px=rgba(f,w,h);
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
 if(typeof r.blit==='function'){const {Canvas}=require('./kit/canvas'),c=new Canvas(w,h);c.d.set(px);r.blit(c,x,y);}
}
module.exports={TH,TURN,want,look,pick,frameOf,reset,draw,frames,FPS};
