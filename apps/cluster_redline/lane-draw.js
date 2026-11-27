'use strict';
const {Canvas}=require('./kit/canvas');
// HUD lane guidance in the style of stock lane boards: fixed-size lanes with
// dashed dividers, solid outer edges and arrows with filled heads. Glyphs never
// shrink when more lanes are shown, and drawSized() paints directly at the HUD
// pixel size so the image is not resampled (resampling broke thin strokes).
// Arrows use only straight lines, single-pass arcs and filled triangles; a
// many-segment polyline blends its overlapping joints and looks jagged.
const W=240,H=72,CELL=29,BOTTOM=60,TOP=8,SW=4.6,HB=12.5,HL=9.5,PAD=2;
const DIM='#5d6670',OTHER='#3f4750',LINE='#68717c';
const D2R=Math.PI/180;
const dir=a=>[Math.sin(a*D2R),-Math.cos(a*D2R)];        // heading, degrees clockwise from up
// Arrow geometry in local units: trunk at x=0, lane base at y=BOTTOM.
// paired: this lane also has the U-turn and 90-degree turn to the same side;
// the turn bends lower and the U-turn tail is shorter so both stay readable.
function glyph(d,paired){
 const parts=[];let x=0,y=BOTTOM,heading=0;
 const straight=len=>{const v=dir(heading),nx=x+v[0]*len,ny=y+v[1]*len;parts.push({t:'line',a:[x,y],b:[nx,ny]});x=nx;y=ny;};
 const turn=(deg,r)=>{                                  // deg>0 clockwise, centre-line radius r
  const s=Math.sign(deg),v=dir(heading+s*90),cx=x+v[0]*r,cy=y+v[1]*r,from=heading-s*90,to=from+deg;
  parts.push({t:'arc',c:[cx,cy],r,a0:Math.min(from,to),a1:Math.max(from,to)});
  const p=dir(to);x=cx+p[0]*r;y=cy+p[1]*r;heading+=deg;
 };
 const head=()=>{const v=dir(heading),n=[-v[1],v[0]],tip=[x+v[0]*HL,y+v[1]*HL];parts.push({t:'tri',p:[[x+n[0]*HB/2,y+n[1]*HB/2],[x-n[0]*HB/2,y-n[1]*HB/2],tip]});};
 const s=/LEFT/.test(d)?-1:1;
 if(d==='STRAIGHT_ON'){straight(BOTTOM-TOP-HL);}
 else if(/^SLIGHT_/.test(d)){straight(20);turn(s*45,10);straight(9);}
 else if(/^HARD_/.test(d)){straight(22);turn(s*135,6.5);straight(5);}
 else if(/^UTURN_/.test(d)){straight(32);turn(s*180,6.5);straight(paired?0.5:4);}
 else if(d==='LEFT'||d==='RIGHT'){straight(paired?6:22);turn(s*90,7);straight(6);}
 else return null;
 head();return parts;
}
function bounds(parts){
 let lo=Infinity,hi=-Infinity;const add=(px,pad)=>{lo=Math.min(lo,px-pad);hi=Math.max(hi,px+pad);};
 parts.forEach(p=>{
  if(p.t==='line'){add(p.a[0],SW/2);add(p.b[0],SW/2);}
  else if(p.t==='tri')p.p.forEach(q=>add(q[0],0.5));
  else for(let a=p.a0;a<=p.a1;a+=5)add(p.c[0]+Math.sin(a*D2R)*p.r,SW/2);
 });return [lo,hi];
}
function paint(cv,parts,map,k,width,color){
 parts.forEach(p=>{
  if(p.t==='line'){const a=map(p.a),b=map(p.b);cv.line(a[0],a[1],b[0],b[1],width*k,color);}
  else if(p.t==='tri')cv.triangle(p.p.map(map),color);
  else{const c=map(p.c),r=p.r*k,hw=width*k/2;
   // Split arcs that cross 12 o'clock so a0<a1 stays within one turn.
   const spans=p.a0<0?[[p.a0+360,360],[0,p.a1]]:p.a1>360?[[p.a0,360],[0,p.a1-360]]:[[p.a0,p.a1]];
   spans.forEach(s=>{if(s[1]>s[0])cv.arc(c[0],c[1],r-hw,r+hw,s[0],s[1],color);});}
 });
}
// The lane arrows as pictures (1.3.81, tools/hud-art/nav lg-*): each direction's icon (a right one mirrored from the
// left), bottom-centred in the lane; the lane's other directions dimmer; true when every direction had one.
const LG={STRAIGHT_ON:['lg-straight',false],SLIGHT_LEFT:['lg-slight-left',false],SLIGHT_RIGHT:['lg-slight-right',false],LEFT:['lg-left',false],RIGHT:['lg-left',true],
 HARD_LEFT:['lg-left',false],HARD_RIGHT:['lg-left',true],UTURN_LEFT:['lg-uturn-left',false],UTURN_RIGHT:['lg-uturn-left',true]};
const BLUE=['#29c5ff','#37c6ff'];
function laneIcons(cv,s,cx,lane,selected){
 const A=require('./hud-art'),all=lane.other.map(d=>[d,'other']).concat(lane.directions.map(d=>[d,lane.highlighted?'on':'dim']));
 if(!all.length||!all.every(([d])=>LG[d]&&A.size('nav/'+LG[d][0])))return false;
 const tint=BLUE.indexOf(String(selected).toLowerCase())>=0?null:selected;
 all.sort((p,q)=>(p[1]==='on')-(q[1]==='on')).forEach(([d,kind])=>{
  const [base,flip]=LG[d],g=A.size('nav/'+base),k=Math.min((CELL-3)/g.w,(BOTTOM-TOP)/g.h);
  let name='nav/'+base,w=g.w*k,h=g.h*k,y=BOTTOM-h,x=cx-w/2;
  if(kind==='on'){const on=A.size(name+'-on');if(on){name+='-on';const pad=8,kk=k;w=on.w*kk;h=on.h*kk;x=cx-w/2;y=BOTTOM-h+pad*kk;}}
  A.paint(cv,name,x*s,y*s,w*s,h*s,{flip,tint:kind==='on'?tint:null,alpha:kind==='other'?0.4:kind==='dim'?0.85:1});
 });
 return true;
}
function drawSized(state,w,h){
 const s=(w||W)/W,cv=new Canvas(Math.max(1,Math.round(w||W)),Math.max(1,Math.round(h||H*s)));cv.clear([0,0,0,0]);
 if(!state||!state.visible||!Array.isArray(state.lanes)||!state.lanes.length)return cv;
 const lanes=state.lanes.slice(0,Math.floor(W/CELL)),n=lanes.length,left=(W-CELL*n)/2;
 const selected=require('./display-config').NAV_COLORS[state.color]||(state.color==='gray'?'#f2f4f8':'#29c5ff');
 const vline=(x,y0,y1,width)=>cv.line(x*s,y0*s,x*s,y1*s,width*s,LINE);
 // Solid outer edges, dashed lane dividers.
 vline(left,TOP,BOTTOM,1.8);vline(left+CELL*n,TOP,BOTTOM,1.8);
 for(let i=1;i<n;i++)for(let y=TOP+1;y<BOTTOM;y+=10)vline(left+CELL*i,y,Math.min(BOTTOM,y+5),1.6);
 lanes.forEach((lane,i)=>{
  const cx=left+CELL*(i+0.5),on=lane.highlighted;
  const list=lane.other.map(d=>({d,color:OTHER})).concat(lane.directions.map(d=>({d,color:on?selected:DIM})));
  const all=lane.directions.concat(lane.other),side=d=>(d.match(/LEFT|RIGHT/)||[''])[0],paired=d=>(d==='LEFT'||d==='RIGHT'||/^UTURN_/.test(d))&&all.includes(side(d))&&all.includes('UTURN_'+side(d));
  // (1.3.81) the arrows from the user's icon sheet: grey, the selected lane's lit (in its colour); drawn ones otherwise
  if(laneIcons(cv,s,cx,lane,selected))list.length=0;
  const shapes=list.map(e=>Object.assign(e,{parts:glyph(e.d,paired(e.d))})).filter(e=>e.parts);
  if(shapes.length){
   // One transform per lane: centre the combined glyph; shrink only a lane whose
   // combined directions are wider than its cell, never because of the lane count.
   let lo=0,hi=0;shapes.forEach(e=>{const b=bounds(e.parts);lo=Math.min(lo,b[0]);hi=Math.max(hi,b[1]);});
   const k=Math.min(1,(CELL-2*PAD)/(hi-lo)),x0=cx-(lo+hi)/2*k;
   const map=p=>[(x0+p[0]*k)*s,(BOTTOM+(p[1]-BOTTOM)*k)*s];
   shapes.forEach(e=>paint(cv,e.parts,map,k*s,SW,e.color));
  }
  if(lane.blocked){const r=6,y=(TOP+BOTTOM)/2;cv.line((cx-r)*s,(y-r)*s,(cx+r)*s,(y+r)*s,3.4*s,DIM);cv.line((cx+r)*s,(y-r)*s,(cx-r)*s,(y+r)*s,3.4*s,DIM);}
 });
 return cv;
}
function draw(state){return drawSized(state,W,H);}
module.exports={W,H,draw,drawSized};
