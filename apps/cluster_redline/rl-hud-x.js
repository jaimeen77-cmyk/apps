'use strict';
// Cluster Redline's own layouts in the Redline layout family (redline-hud.js): M shift lights, data logger,
// analog needle, G-force + RPM rings, mode ribbon and hexagon. Drawn in a 1088x480 design space scaled to the
// layouts' 400x176 image, so the same frame (f) and element filter (f.only) work as for the other layouts.
// Readouts are the display's selected auxiliary items (f.readouts), like the other layouts.
const {language}=require('./strings');
const S=400/1088,IH=176,clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),isNum=x=>typeof x==='number'&&isFinite(x);
const C={track:'#1b212b',dim:'#8d97a4',soft:'#c8d2df',text:'#f4f7fb',accent:'#ff6a1a',red:'#c4202f',redDim:'#3a1218',off:'#171c23'};
const want=(f,p)=>!f.only||f.only===p;
const rpmText=d=>isNum(d.rpm)?String(Math.round(d.rpm/10)*10):'----';
// Fraction of the way from the first light to the shift point, and whether the alert flashes now.
function cue(f){const c=f.cue,r=isNum(f.d.rpm)?f.d.rpm:0;return {p:clamp((r-c.from)/Math.max(1,c.at-c.from),0,1),flash:c.shift||c.limiter,on:f.blink!==false};}
function pill(cv,x,y,w,h,col){cv.fillRect(x+h/2,y,w-h,h,col);cv.circle(x+h/2,y+h/2,h/2,col);cv.circle(x+w-h/2,y+h/2,h/2,col);}
function ring(cv,cx,cy,r,w,col){cv.arc(cx,cy,r-w/2,r+w/2,0,360,col);}
// Drive-mode colour and name for the ribbon: Comfort blue, Sport orange, Eco green.
function drive(mode){const m=String(mode||'');if(/SPORT|BOOST/.test(m))return {col:'#ff6a1a',name:language()==='ko'?'스포츠':'SPORT'};
 if(/ECO/.test(m))return {col:'#2bd46a',name:language()==='ko'?'에코':'ECO'};if(m)return {col:'#3d8bff',name:language()==='ko'?'컴포트':'COMFORT'};return {col:'#ff6a1a',name:''};}
// gauge mode: the item has a range to show
const gb=it=>!!(it&&it.gauge&&it.frac!==null&&it.frac!==undefined);
// a row of slanted segments from x (w wide), lit up to frac
function slants(cv,x,y,w,h,n,sl,frac,on,off,gap){const pitch=w/n,lit=Math.round(clamp(frac,0,1)*n);for(let i=0;i<n;i++){const bx=x+i*pitch;cv.quad([[bx+sl,y],[bx+pitch-(gap||3)+sl,y],[bx+pitch-(gap||3),y+h],[bx,y+h]],i<lit?(typeof on==='function'?on(i,n):on):off);}}
function readout(cv,it,x,y,ls,vs,align,col){if(!it)return;const o={align,font:'bold'};cv.text(it.label,x,y,ls,C.dim,o);cv.text(it.value,x,y+vs*0.95,vs,col||C.text,o);}

function drawShift(cv,f,h){
 const d=f.d,q=cue(f),lit=q.flash?15:Math.floor(q.p*15+1e-6);
 if(want(f,'alert'))for(let i=0;i<15;i++){const col=i<5?h.P.low:i<10?h.P.mid:h.P.high,on=i<lit&&(!q.flash||q.on);pill(cv,84+i*62,36,48,26,on?(q.flash?h.P.flash:col):C.off);}
 if(want(f,'gear'))cv.text(h.gearText(d),544,330,230,C.text,{align:'center',font:h.gearFont(f.opts)});
 if(want(f,'mode')&&f.mode)cv.text(f.mode,640,170,44,C.accent,{font:'bold'});
 if(want(f,'rpm'))cv.text(rpmText(d),544,395,46,'#9aa6b6',{align:'center',font:'bold',spacing:6});
 if(want(f,'read')&&f.readouts.length){const n=f.readouts.length;f.readouts.forEach((it,i)=>{const x=544+(i-(n-1)/2)*250,bar=gb(it);cv.text(it.label+' '+it.value,x,bar?432:450,30,C.soft,{align:'center',font:'bold'});
  // gauge mode: ten round dots, green / yellow / red like the shift lights
  if(bar){const lit=Math.round(clamp(it.frac,0,1)*10);for(let k=0;k<10;k++)cv.circle(x+(k-4.5)*14,456,5,k<lit?(k<4?h.P.low:k<7?h.P.mid:h.P.high):C.off);}});}
}
function drawLogger(cv,f,h){
 const d=f.d,max=f.max;
 if(want(f,'gauge')){const r=isNum(d.rpm)?d.rpm:0;for(let i=0;i<40;i++){const v=i/40*max,col=v>=f.redline?h.P.high:v>=f.cue.from?h.P.mid:h.P.low;cv.fillRect(60+i*24.2,60,20,70,v<r?(f.cue.shift&&!f.blink?C.off:col):v>=f.redline?C.redDim:C.off);}
  for(let k=0;k*1000<=max;k++)cv.text(String(k),60+968*k*1000/max,166,26,C.dim,{align:k===0?'left':k*1000===max?'right':'center',font:'bold'});}
 if(want(f,'gear')){cv.polyline([[60,190],[310,190],[310,440],[60,440],[60,190]],4,C.accent);cv.text('GEAR',80,225,26,C.accent,{font:'bold'});cv.text(h.gearText(d),185,390,210,C.text,{align:'center',font:h.gearFont(f.opts)});}
 if(want(f,'mode')&&f.mode)cv.text(f.mode,292,225,30,C.accent,{align:'right',font:'bold'});
 if(want(f,'rpm')){cv.text('RPM',1028,232,26,C.dim,{align:'right',font:'bold'});cv.text(rpmText(d),1028,300,56,f.cue.shift?h.P.high:'#ffd522',{align:'right',font:'bold'});}
 [[350,232],[700,232],[350,362],[700,362]].forEach((p,i)=>{if(!want(f,'read'+'ABCD'[i]))return;const it=f.readouts[i];readout(cv,it,p[0],p[1],26,72,'left');
  // gauge mode: a 20-block strip like the rev graph with a scale under it
  if(gb(it)){const x=p[0],y=p[1]+92,lit=Math.round(clamp(it.frac,0,1)*20);for(let k=0;k<20;k++)cv.fillRect(x+k*15,y,12,26,k<lit?(k<14?h.P.low:k<17?h.P.mid:h.P.high):C.off);
   for(let k=0;k<=4;k++)cv.fillRect(x+k*74.25,y+30,2,k%2?6:10,C.dim);const fm=v=>Math.abs(v)>=10?String(Math.round(v)):String(Math.round(v*10)/10);
   cv.text(fm(it.lo),x,y+60,20,C.dim,{font:'bold'});cv.text(fm(it.hi),x+297,y+60,20,C.dim,{align:'right',font:'bold'});}});
}
function drawNeedle(cv,f,h){
 const d=f.d,max=f.max,cx=544,cy=430,A=v=>-90+180*clamp(v,0,max)/max,pt=(a,r)=>[cx+r*Math.sin(a*Math.PI/180),cy-r*Math.cos(a*Math.PI/180)];
 if(want(f,'gauge')){
  cv.arc(cx,cy,330,360,-90,90,C.track);cv.arc(cx,cy,330,360,A(f.redline),90,C.red);
  for(let k=0;k*1000<=max;k++){const a=A(k*1000),p=pt(a,360),q=pt(a,328),l=pt(a,292);cv.line(p[0],p[1],q[0],q[1],5,'#e6ecf3');cv.text(String(k),l[0],l[1]+12,34,k*1000>=f.redline?'#ff4a55':'#e6ecf3',{align:'center',font:'bold'});}
  const a=A(isNum(d.rpm)?d.rpm:0),tip=pt(a,320);cv.line(cx,cy,tip[0],tip[1],9,f.cue.shift&&f.blink?h.P.flash:'#ff7a1a');cv.circle(cx,cy,28,'#2a3039');ring(cv,cx,cy,26,4,'#ff7a1a');
 }
 if(want(f,'gear'))cv.text(h.gearText(d),544,345,130,C.text,{align:'center',font:h.gearFont(f.opts)});
 if(want(f,'mode')&&f.mode)cv.text(f.mode,600,255,36,C.accent,{font:'bold'});
 const at=[[60,415,'left'],[1028,415,'right'],[60,40,'left'],[1028,40,'right']];
 at.forEach((p,i)=>{if(want(f,'read'+'ABCD'[i]))readout(cv,f.readouts[i],p[0],p[1],26,40,p[2],C.soft);});
}
function drawRings(cv,f,h){
 const d=f.d,max=f.max,g=f.g||{};
 if(want(f,'gmeter')){const cx=290,cy=240;ring(cv,cx,cy,160,4,'#2a3039');ring(cv,cx,cy,80,3,'#1f252d');cv.line(130,cy,450,cy,3,'#1f252d');cv.line(cx,80,cx,400,3,'#1f252d');
  const lat=isNum(g.lat)?clamp(g.lat,-1.2,1.2):0,lon=isNum(g.long)?clamp(g.long,-1.2,1.2):0;cv.circle(cx+lat*150,cy-lon*150,16,'#ffd522');
  cv.text(isNum(g.total)?g.total.toFixed(2)+' G':'-- G',cx,455,34,'#ffd522',{align:'center',font:'bold'});}
 if(want(f,'gauge')){const cx=800,cy=240,A=v=>-135+270*clamp(v,0,max)/max,r=isNum(d.rpm)?d.rpm:0;
  cv.arc(cx,cy,144,176,-135,135,C.track);cv.arc(cx,cy,144,176,A(f.redline),135,C.redDim);
  if(r>0)cv.arc(cx,cy,144,176,-135,A(r),f.cue.shift?(f.blink?h.P.flash:C.track):r>=f.cue.from?h.P.mid:C.accent);}
 if(want(f,'gear'))cv.text(h.gearText(d),800,290,150,C.text,{align:'center',font:h.gearFont(f.opts)});
 if(want(f,'mode')&&f.mode)cv.text(f.mode,868,175,40,C.accent,{font:'bold'});
 if(want(f,'rpm'))cv.text(rpmText(d),800,440,40,'#9aa6b6',{align:'center',font:'bold',spacing:4});
 if(want(f,'read'))f.readouts.forEach((it,i)=>readout(cv,it,544,110+i*92,22,40,'center'));
}
function drawRibbon(cv,f,h){
 const d=f.d,dm=drive(f.drive),B=t=>{const u=1-t;return [u*u*u*60+3*u*u*t*330+3*u*t*t*520+t*t*t*1028,u*u*u*410+3*u*u*t*410+3*u*t*t*140+t*t*t*90];};
 if(want(f,'gauge')){const pts=[];for(let i=0;i<=64;i++)pts.push(B(i/64));cv.polyline(pts,40,C.track);
  const p=isNum(d.rpm)?clamp(d.rpm/f.max,0,1):0,n=Math.round(p*64);if(n>0)cv.polyline(pts.slice(0,n+1),40,f.cue.shift?(f.blink?h.P.flash:C.track):dm.col);}
 if(want(f,'gear'))cv.text(h.gearText(d),90,230,190,C.text,{font:h.gearFont(f.opts)});
 if(want(f,'mode')&&(dm.name||f.mode))cv.text(dm.name||f.mode,96,290,34,dm.col,{font:'bold',spacing:4});
 [[640,290],[850,290],[640,395],[850,395]].forEach((p,i)=>{if(!want(f,'read'+'ABCD'[i]))return;const it=f.readouts[i];readout(cv,it,p[0],p[1],26,52,'left');
  // gauge mode: a slanted band in the drive mode's colour, like the ribbon
  if(gb(it))slants(cv,p[0],p[1]+72,170,18,10,8,it.frac,it.tone==='hot'?'#ff3a3a':dm.col,C.track,3);});
}
// Hexagon: an angular hexagonal tachometer (yellow, red past the redline) round a hexagonal gear cell,
// readouts in angled side boxes, two chevrons as the shift light.
// The part of a polyline between fractions t0 and t1 of its length.
function sub(pts,t0,t1){const seg=[];let total=0;for(let i=1;i<pts.length;i++){const l=Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]);seg.push(l);total+=l;}
 const d0=clamp(t0,0,1)*total,d1=clamp(t1,0,1)*total,at=(i,u)=>[pts[i][0]+(pts[i+1][0]-pts[i][0])*u,pts[i][1]+(pts[i+1][1]-pts[i][1])*u],out=[];let run=0;
 for(let i=0;i<seg.length;i++){const a=run,b=run+seg[i];if(b>=d0&&a<=d1){if(!out.length)out.push(at(i,(Math.max(d0,a)-a)/seg[i]));out.push(at(i,(Math.min(d1,b)-a)/seg[i]));}run=b;}
 return out.length?out:[pts[0],pts[0]];}
const pointAt=(pts,t)=>{const p=sub(pts,0,t);return p[p.length-1];};
function drawHexagon(cv,f,h){
 const d=f.d,max=f.max,q=cue(f),P=[[354,342],[354,158],[544,62],[734,158],[734,342]],r=isNum(d.rpm)?d.rpm/max:0,red=f.redline/max,YEL='#e8ff1a';
 if(want(f,'gauge')){
  cv.polyline([[544,30],[760,140],[760,360],[544,470],[328,360],[328,140],[544,30]],3,'#2a2f37');
  cv.polyline(P,22,C.track);cv.polyline(sub(P,red,1),22,C.redDim);
  if(r>0){const flash=q.flash&&!q.on;cv.polyline(sub(P,0,Math.min(r,red)),22,flash?C.track:q.flash?h.P.flash:YEL);if(r>red)cv.polyline(sub(P,red,r),22,flash?C.track:'#ff2a2a');}
  for(let k=0;k*1000<=max;k++){const p=pointAt(P,k*1000/max),x=p[0]+(544-p[0])*0.16,y=p[1]+(250-p[1])*0.16;cv.text(String(k),x,y+9,24,k*1000>=f.redline?'#ff4a55':'#e6ecf3',{align:'center',font:'bold'});}}
 if(want(f,'alert')){const lit=q.flash?(q.on?h.P.flash:C.off):q.p>=0.66?h.P.high:q.p>=0.33?h.P.mid:q.p>0?h.P.low:C.off;cv.quad([[300,40],[330,40],[316,62],[314,62]],lit);cv.quad([[758,40],[788,40],[774,62],[772,62]],lit);}
 if(want(f,'gear')){cv.polyline([[544,170],[613,210],[613,290],[544,330],[475,290],[475,210],[544,170]],3,YEL);cv.text(h.gearText(d),544,292,120,C.text,{align:'center',font:h.gearFont(f.opts)});}
 if(want(f,'mode')&&f.mode)cv.text(f.mode,624,206,32,YEL,{font:'bold'});
 if(want(f,'rpm'))cv.text(rpmText(d),544,385,40,q.flash?h.P.flash:YEL,{align:'center',font:'bold',spacing:4});
 if(f.readouts.length&&f.readouts[0].gauge){
  // gauge mode: one tall angled box each side, the value and a vertical stack of hex cells on its inner edge
  [[60,1],[1028,-1]].forEach(([x,s],i)=>{const it=f.readouts[i];if(!it||!want(f,'read'+'ABCD'[i]))return;const y0=150,y1=380;
   cv.polyline([[x,y0],[x+190*s,y0],[x+230*s,y0+30],[x+230*s,y1],[x+30*s,y1],[x,y1-30],[x,y0]],3,'#2a2f37');
   readout(cv,it,x+20*s,y0+40,24,48,s>0?'left':'right');
   if(!gb(it))return;const fm=v=>Math.abs(v)>=10?String(Math.round(v)):String(Math.round(v*10)/10),n=9,cx=x+196*s,lit=Math.round(clamp(it.frac,0,1)*n);
   for(let k=0;k<n;k++){const cy=y1-24-k*21,r=11,on=k<lit,col=on?(k>=n-2?'#ff2a2a':YEL):'#2a2f37';
    cv.quad([[cx-r,cy],[cx-r/2,cy-r*0.87],[cx+r/2,cy-r*0.87],[cx+r,cy]],col);cv.quad([[cx-r,cy],[cx+r,cy],[cx+r/2,cy+r*0.87],[cx-r/2,cy+r*0.87]],col);}
   cv.text(fm(it.hi),cx-24*s,y1-24-(n-1)*21+6,18,C.dim,{align:s>0?'right':'left',font:'bold'});cv.text(fm(it.lo),cx-24*s,y1-18,18,C.dim,{align:s>0?'right':'left',font:'bold'});});
  return;}
 const box=[[60,150,1],[60,270,1],[1028,150,-1],[1028,270,-1]];
 box.forEach((b,i)=>{if(!want(f,'read'+'ABCD'[i])||!f.readouts[i])return;const [x,y,s]=b;cv.polyline([[x,y],[x+190*s,y],[x+220*s,y+30],[x+220*s,y+90],[x+30*s,y+90],[x,y+60],[x,y]],3,'#2a2f37');
  readout(cv,f.readouts[i],x+20*s,y+35,22,44,s>0?'left':'right');});
}
// Sport dial: a big round tachometer with a glow in the drive mode's colour (Sport red, Comfort blue, Eco sky blue) in the middle (0 at bottom left round to the end at
// the right, numbers from the redline in yellow, a yellow needle), the rpm in big digits inside it, the gear
// in a box under it and the drive mode below; side panels hold up to four readouts in boxes, with a
// segmented bar under each when the readouts are gauges.
const SD={cx:544,cy:228,R:204,a0:-130,a1:112,yellow:'#ffd21f',glow:'#ff2a1a',panel:'#0d1014',box:'#15191f',edge:'#2b313a'};
// The dial's colour follows the drive mode: Sport red, Comfort blue, Eco sky blue.
function sdTheme(drive){const m=String(drive||'');
 if(/ECO/.test(m))return {main:[64,200,255],trim:[110,214,255],deep:[2,12,18]};
 if(/SPORT/.test(m)||!m)return {main:[255,40,24],trim:[255,70,50],deep:[18,4,4]};
 return {main:[40,110,255],trim:[80,140,255],deep:[3,6,20]};}
const rgbA=(c,a)=>[c[0],c[1],c[2],Math.round(a)];
function sdBox(cv,it,x,y,w,hh,right,th){
 // no box background: a red accent on the outer side, then the label and value
 cv.fillRect(right?x+w-4:x,y+10,4,hh-20,rgbA((th||sdTheme('')).main,200));
 if(!it)return;
 const ko=language()==='ko',bar=it.gauge&&it.frac!==null;
 cv.text(it.label,x+24,y+38,26,C.soft,{font:'bold'});
 const unitless=/[°%:]/.test(it.value)||!it.unit,vy=bar?y+96:y+hh-34;
 cv.text(it.value,x+w-(unitless?24:70),vy,bar?50:58,it.tone==='hot'?'#ff5a3a':it.tone==='cold'?'#5ab0ff':C.text,{align:'right',font:'bold'});
 if(!unitless)cv.text(it.unit,x+w-24,vy,22,C.dim,{align:'right',font:'bold'});
 if(bar){const bx=x+24,bw=w-48,by=y+hh-46,n=16,seg=bw/n,lit=Math.round(it.frac*n);
  for(let i=0;i<n;i++)cv.fillRect(bx+i*seg+1,by,seg-3,12,i<lit?SD.yellow:'#2a2f37');
  const fmt=v=>Math.abs(v)>=10?String(Math.round(v)):String(Math.round(v*10)/10);
  cv.text(fmt(it.lo)+(it.unit&&it.unit!=='%'?' '+it.unit:''),bx,by+34,17,C.dim,{font:'bold'});cv.text(fmt(it.hi)+(it.unit&&it.unit!=='%'?' '+it.unit:''),bx+bw,by+34,17,C.dim,{align:'right',font:'bold'});}
 void ko;
}
function drawSportDial(cv,f,h){
 const th=sdTheme(f.drive),d=f.d,max=f.max,{cx,cy,R}=SD,A=v=>SD.a0+(SD.a1-SD.a0)*clamp(v,0,max)/max,pt=(a,r)=>[cx+r*Math.sin(a*Math.PI/180),cy-r*Math.cos(a*Math.PI/180)];
 const rpm=isNum(d.rpm)?clamp(d.rpm,0,max):0,q=cue(f),atShift=f.cue.shift,ko=language()==='ko';
 if(want(f,'gauge')&&f.sel!=='live'){
  // red neon trims framing the side wings (the readouts stand on the black inside them)
  [[1],[-1]].forEach(([sg])=>{const X=x=>sg>0?x:1088-x,trim=[[X(318),20],[X(52),20],[X(16),56],[X(16),424],[X(52),460],[X(318),460]];
   [[12,rgbA(th.main,30)],[6,rgbA(th.main,70)],[2.2,rgbA(th.trim,255)]].forEach(([w,c])=>cv.polyline(trim,w,c));
   [[X(300),20],[X(330),60]].forEach(()=>{});cv.line(X(318),20,X(338),46,2,rgbA(th.trim,200));cv.line(X(318),460,X(338),434,2,rgbA(th.trim,200));});
  // the dial: a dark housing, a metal bezel lit from the top left, the red glow strongest at the rim
  cv.circle(cx+5,cy+8,R+26,[0,0,0,150]);cv.circle(cx,cy,R+22,'#060708');
  for(let a=0;a<360;a+=5){const L=0.5+0.5*Math.cos((a+2.5+45)*Math.PI/180);cv.arc(cx,cy,R+6,R+20,a,a+5.4,[0,1,2].map(k=>Math.round([38,40,46][k]+([214,220,228][k]-[38,40,46][k])*L)).concat([255]));}
  cv.arc(cx,cy,R+2,R+6,0,360,rgbA(th.trim,255));
  cv.circle(cx,cy,R+2,rgbA(th.deep,255));
  for(let k=0;k<10;k++){const r=R-k*9,a=0.85*Math.pow(1-k/10,1.6);cv.arc(cx,cy,r-9.6,r,0,360,rgbA(th.main,a*255));}
  for(let v=0;v<=max+1;v+=250){const major=v%1000===0,a=A(v),p=pt(a,R-6),q2=pt(a,major?R-30:R-16);cv.line(p[0]+1.5,p[1]+2,q2[0]+1.5,q2[1]+2,major?5:2.5,[0,0,0,140]);cv.line(p[0],p[1],q2[0],q2[1],major?5:2.5,v>=f.redline?SD.yellow:'#f6f7f9');}
  for(let k=0;k*1000<=max;k++){const a=A(k*1000),l=pt(a,R-58),col=k*1000>=f.redline?SD.yellow:'#f6f7f9';cv.text(String(k),l[0]+2,l[1]+17,46,[0,0,0,170],{align:'center',font:'bold'});cv.text(String(k),l[0],l[1]+15,46,col,{align:'center',font:'bold'});}
  // the inner disc: dark, a little lighter at the top, ringed in grey with a lit upper edge
  const ri=R-92;cv.circle(cx,cy,ri+6,'#2b2e33');for(let a=0;a<360;a+=10){const L=0.5+0.5*Math.cos((a+5)*Math.PI/180);cv.arc(cx,cy,ri+2,ri+6,a,a+10.5,[0,1,2].map(k=>Math.round([30,32,36][k]+([180,186,194][k]-[30,32,36][k])*L)).concat([255]));}
  cv.circle(cx,cy,ri+2,'#08090b');for(let k=0;k<4;k++)cv.arc(cx,cy,0,ri-k*ri/4,-70,70,[255,255,255,9]);
 }
 if(want(f,'gauge')&&f.sel!=='face'){
  // the needle: glow, shadow, then a tapered yellow blade from the inner disc to the ticks
  const a=A(rpm),u=[Math.sin(a*Math.PI/180),-Math.cos(a*Math.PI/180)],n=[-u[1],u[0]],L0=R-90,L1=R-6;
  const blade=(ox,oy,w,c)=>cv.quad([[cx+ox+u[0]*L0+n[0]*w,cy+oy+u[1]*L0+n[1]*w],[cx+ox+u[0]*L1+n[0]*w*0.35,cy+oy+u[1]*L1+n[1]*w*0.35],[cx+ox+u[0]*L1-n[0]*w*0.35,cy+oy+u[1]*L1-n[1]*w*0.35],[cx+ox+u[0]*L0-n[0]*w,cy+oy+u[1]*L0-n[1]*w]],c);
  blade(0,0,11,[255,190,40,50]);blade(4,6,4,[0,0,0,120]);blade(0,0,4.5,atShift&&f.blink?'#ff3b24':SD.yellow);
  cv.line(cx+u[0]*L0,cy+u[1]*L0,cx+u[0]*L1,cy+u[1]*L1,1.2,[255,248,210,220]);
 }
 if(want(f,'alert')&&rpm>50){
  // the rpm alert: the dial's rim lit red up to the rpm, brighter towards the shift point, flashing at it
  const col=q.flash?(q.on?'#ff2a1a':null):rgbA(th.main,255*(0.35+0.65*q.p));
  if(col)cv.arc(cx,cy,R+4,R+14,SD.a0,A(rpm),col);
 }
 if(want(f,'rpm')){
  cv.text(ko?'엔진 회전수':'ENGINE RPM',cx,cy-82,24,'#f2f4f7',{align:'center',font:'bold',literal:true});cv.text('×1,000 rpm',cx,cy-58,16,C.dim,{align:'center',font:'bold',literal:true});
  cv.text('rpm',cx,cy+66,22,C.dim,{align:'center',font:'bold',literal:true});
  cv.text(rpmText(d),cx,cy+40,104,atShift?(f.blink?'#ff3b24':C.text):C.text,{align:'center',font:'bold'});
 }
 if(want(f,'gear')){
  const g=[[cx-66,cy+92],[cx+66,cy+92],[cx+86,cy+182],[cx-86,cy+182]];
  cv.quad(g,'#0b0d10');cv.polyline(g.concat([g[0]]),2.5,SD.edge);cv.line(g[1][0],g[1][1],g[2][0],g[2][1],3,SD.yellow);cv.line(g[0][0],g[0][1],g[3][0],g[3][1],3,SD.yellow);
  cv.text(ko?'기어':'GEAR',cx,cy+118,21,'#f2f4f7',{align:'center',font:'bold',literal:true});
  cv.text(h.gearText(d),cx,cy+176,70,atShift&&f.blink?'#ff3b24':C.text,{align:'center',font:h.gearFont(f.opts)});
  if(f.mode)cv.text(f.mode,cx+50,cy+140,24,SD.yellow,{font:'bold'});
 }
 if(want(f,'mode')){const m=String(f.drive||''),word=/SPORT/.test(m)?(/PLUS/.test(m)?(ko?'스포츠+':'SPORT+'):(ko?'스포츠':'SPORT')):/ECO/.test(m)?(ko?'에코 프로':'ECO PRO'):m?(ko?'컴포트':'COMFORT'):'';
  if(word){cv.text(word,cx,cy+218,34,SD.yellow,{align:'center',font:'bold',literal:true});cv.text(ko?'주행 모드':'DRIVE MODE',cx,cy+240,16,C.dim,{align:'center',font:'bold',literal:true});}}
 // readouts: A top left, B top right, C bottom left, D bottom right
 [[26,60,0],[790,60,1],[26,256,0],[790,256,1]].forEach((p,i)=>{if(want(f,'read'+'ABCD'[i])&&f.readouts[i])sdBox(cv,f.readouts[i],p[0],p[1],272,170,p[2],th);});
}
// Classic dial: a cream dial in a knurled chrome bezel on black (0 at lower left round to the end at
// lower right, a red band from the redline, a bronze needle on a chrome hub), "x1000 rpm" under the top
// numbers, a small temperature dial in a green window at the bottom (oil, C 50 - H 150 °C, red past 130),
// and up to four readouts in panels left and right.
const CL={cx:544,cy:230,R:184,a0:-128,a1:128,cream:'#efe6cf',ink:'#26231e',bronze:'#c88a4c',green:'#12312a',green2:'#0b211c',gold:'#b89a5e',red:'#c4241c',chrome:'#c9cdd2'};
// gauge mode: a vertical chrome-rimmed thermometer on the outer edge (side -1 left, 1 right), cream inside with
// black ticks, a red column and bulb, the label and value beside it on the inner side
function clTube(cv,it,side){
 const tx=side<0?64:1024,y0=70,y1=380,tw=30,al=side<0?'left':'right',ix=tx-side*48,bar=gb(it);
 rr(cv,tx-tw/2-4,y0-4,tw+8,y1-y0+8,(tw+8)/2,[150,156,164,255]);rr(cv,tx-tw/2-1,y0-1,tw+2,y1-y0+2,(tw+2)/2,[236,240,244,255]);rr(cv,tx-tw/2+2,y0+2,tw-4,y1-y0-4,(tw-4)/2,[218,206,174,255]);
 cv.circle(tx,y1+26,28,[150,156,164,255]);cv.circle(tx,y1+26,24,[236,240,244,255]);cv.circle(tx,y1+26,20,'#c8402a');
 const ty0=y0+14,ty1=y1-6,hh=ty1-ty0;
 for(let k=0;k<=10;k++){const y=ty1-hh*k/10,l=k%5?5:9;cv.fillRect(tx-tw/2+3,y-1,l,2,'#2a2418');cv.fillRect(tx+tw/2-3-l,y-1,l,2,'#2a2418');}
 const fr=bar?clamp(it.frac,0,1):0;cv.fillRect(tx-5,ty1-hh*fr,10,hh*fr+8,'#c8402a');cv.fillRect(tx-5,ty1,10,22,'#c8402a');
 const fm=v=>Math.abs(v)>=10?String(Math.round(v)):String(Math.round(v*10)/10);
 if(bar){cv.text(fm(it.hi),ix,ty0+8,20,'#cdbf98',{align:al,font:'bold'});cv.text(fm(it.lo),ix,ty1+6,20,'#cdbf98',{align:al,font:'bold'});}
 const lx=tx-side*84;
 cv.text(it.label,lx+2,182,26,[0,0,0,200],{align:al,font:'bold'});cv.text(it.label,lx,180,26,'#d8c99e',{align:al,font:'bold'});
 cv.text(it.value,lx+2,248,58,[0,0,0,200],{align:al,font:'bold'});cv.text(it.value,lx,246,58,it.tone==='hot'?'#ff6a4a':it.tone==='cold'?'#7fc4ff':'#f3ead2',{align:al,font:'bold'});
 if(it.unit&&!/[°%:]/.test(it.value))cv.text(it.unit,lx,282,22,'#cdbf98',{align:al,font:'bold'});
}
function clPanel(cv,it,x,y,w,hh){
 // no box: label and value straight on the black
 
 if(!it)return;
 cv.text(it.label,x+24,y+42,24,[0,0,0,200],{font:'bold'});cv.text(it.label,x+22,y+40,24,'#d8c99e',{font:'bold'});
 const unitless=/[°%:]/.test(it.value)||!it.unit;
 cv.text(it.value,x+w-(unitless?22:66)+2,y+hh-28,54,[0,0,0,200],{align:'right',font:'bold'});
 cv.text(it.value,x+w-(unitless?22:66),y+hh-30,54,it.tone==='hot'?'#ff6a4a':it.tone==='cold'?'#7fc4ff':'#f3ead2',{align:'right',font:'bold'});
 if(!unitless)cv.text(it.unit,x+w-22,y+hh-30,21,'#cdbf98',{align:'right',font:'bold'});
}
// light from the top left: 1 facing it, 0 facing away (angle in degrees clockwise from 12)
const lit=a=>0.5+0.5*Math.cos((a+45)*Math.PI/180);
const mixc=(a,b,t)=>[0,1,2].map(k=>Math.round(a[k]+(b[k]-a[k])*t)).concat([255]);
function drawClassic(cv,f,h){
 const d=f.d,max=f.max,{cx,cy,R}=CL,A=v=>CL.a0+(CL.a1-CL.a0)*clamp(v,0,max)/max,pt=(a,r,x0,y0)=>[(x0||cx)+r*Math.sin(a*Math.PI/180),(y0||cy)-r*Math.cos(a*Math.PI/180)];
 const rpm=isNum(d.rpm)?clamp(d.rpm,0,max):0,q=cue(f),ko=language()==='ko';
 if(want(f,'gauge')&&f.sel!=='live'){
  // quilted green leather: each diamond lit on its upper-left edges, shaded on the lower-right ones
  // on black: the dial's shadow, then the knurled chrome bezel lit from the top left
  for(let k=0;k<3;k++)cv.circle(cx+6,cy+10,R+40-k*5,[0,0,0,50]);
  for(let a=0;a<360;a+=5){const L=lit(a+2.5);cv.arc(cx,cy,R+6,R+30,a,a+5.4,mixc([58,62,68],[236,240,244],L));}
  for(let k=0;k<120;k++){const a=k*3,L=lit(a),p=pt(a,R+9),q2=pt(a,R+27);cv.line(p[0],p[1],q2[0],q2[1],2,k%2?mixc([120,126,134],[255,255,255],L):mixc([30,33,37],[150,156,164],L));}
  for(let a=0;a<360;a+=6){const L=lit(a+3);cv.arc(cx,cy,R+30,R+33,a,a+6.4,mixc([20,22,25],[200,205,210],L));cv.arc(cx,cy,R+1,R+6,a,a+6.4,mixc([110,70,34],[236,184,120],1-L));}
  // the face: cream, lighter in the middle; a soft shadow under the bezel's top-left edge
  cv.circle(cx,cy,R,[218,206,174,255]);for(let k=1;k<6;k++)cv.arc(cx,cy,0,R-k*R/6,0,360,[255,252,240,46]);
  for(let k=0;k<3;k++)cv.arc(cx,cy,R-4-k*6,R,-150,60,[60,45,20,26]);
  // red band from the redline, ticks every 250 rpm (longer every 1000), numbers with a faint emboss
  cv.arc(cx,cy,R-30,R-18,A(f.redline),A(max),CL.red);
  for(let v=0;v<=max+1;v+=250){const major=v%1000===0,mid=v%500===0,a=A(v),p=pt(a,R-14),q2=pt(a,major?R-40:mid?R-30:R-24);cv.line(p[0],p[1],q2[0],q2[1],major?5:2.2,v>=f.redline?CL.red:CL.ink);}
  for(let k=0;k*1000<=max;k++){const a=A(k*1000),l=pt(a,R-72),col=k*1000>=f.redline?CL.red:CL.ink;cv.text(String(k),l[0]+1.5,l[1]+19.5,50,[255,255,255,120],{align:'center',font:'bold'});cv.text(String(k),l[0],l[1]+18,50,col,{align:'center',font:'bold'});}
  cv.text('×1000 rpm',cx,cy-60,21,'#5a5348',{align:'center',font:'bold',literal:true});
  // the glass: a faint highlight across the upper left
  for(let k=0;k<5;k++)cv.arc(cx,cy,R-40-k*14,R-34-k*14,-75,5,[255,255,255,Math.round(26-k*4)]);
 }
 if(want(f,'gauge')&&f.sel!=='face'){
  // the needle: its shadow, then a tapered bronze blade with a lit edge, on a domed chrome hub
  const a=A(rpm),u=[Math.sin(a*Math.PI/180),-Math.cos(a*Math.PI/180)],n=[-u[1],u[0]],L1=R-24,L0=34;
  const blade=(ox,oy,c,w)=>cv.quad([[cx+ox-u[0]*L0+n[0]*w*1.6,cy+oy-u[1]*L0+n[1]*w*1.6],[cx+ox+u[0]*L1+n[0]*w*0.3,cy+oy+u[1]*L1+n[1]*w*0.3],[cx+ox+u[0]*L1-n[0]*w*0.3,cy+oy+u[1]*L1-n[1]*w*0.3],[cx+ox-u[0]*L0-n[0]*w*1.6,cy+oy-u[1]*L0-n[1]*w*1.6]],c);
  blade(5,7,[0,0,0,70],4);blade(0,0,f.cue.shift&&f.blink?CL.red:[176,112,54,255],4);
  cv.line(cx-u[0]*L0+n[0]*2,cy-u[1]*L0+n[1]*2,cx+u[0]*L1,cy+u[1]*L1,1.4,[255,214,160,220]);
  cv.circle(cx+3,cy+4,24,[0,0,0,70]);for(let k=0;k<8;k++)cv.circle(cx-k*0.9,cy-k*0.9,22-k*2.4,mixc([92,98,106],[250,252,255],k/7));
 }

 if(want(f,'alert')&&rpm>50&&rpm>=f.cue.from){
  // the rpm alert: a domed lamp at the top of the dial, amber while counting in, red (flashing) at the shift
  const on=q.flash?q.on:true,base=q.flash?[220,36,28]:[255,160,30];
  const x=cx,y=cy-R+58;cv.circle(x,y,16,[60,48,30,255]);
  if(on){for(let k=0;k<5;k++)cv.circle(x,y,30-k*4,[base[0],base[1],base[2],Math.round(18+k*10)]);cv.circle(x,y,12,mixc(base,[255,255,255],0.15));cv.circle(x-4,y-4,4,[255,255,255,170]);}
 }
 if(want(f,'temp')){
  // the temperature window: a recessed green half-disc with a lit chrome rim, C..H, red past 130 °C
  const tx=cx,ty=cy+R-36,tr=78,T=v=>-62+124*clamp((v-50)/100,0,1),oil=f.oil;
  for(let a=-90;a<90;a+=6)cv.arc(tx,ty,tr,tr+6,a,a+6.4,mixc([70,74,80],[240,243,246],lit(a+3)));
  cv.fillRect(tx-tr-6,ty,2*tr+12,6,[150,156,162,255]);
  cv.arc(tx,ty,0,tr,-90,90,CL.green);for(let k=0;k<5;k++)cv.arc(tx,ty,tr-4-k*3,tr,-90,90,[0,0,0,Math.round(60-k*11)]);
  for(let v=50;v<=150;v+=12.5){const a=T(v),p=pt(a,tr-8,tx,ty),q2=pt(a,tr-(v%50===0?22:15),tx,ty);cv.line(p[0],p[1],q2[0],q2[1],2.4,v>130?'#ff4a3a':'#e9e1c8');}
  cv.text('C',tx-tr+18,ty-8,20,'#e9e1c8',{align:'center',font:'bold',literal:true});cv.text('H',tx+tr-18,ty-8,20,'#ff6a5a',{align:'center',font:'bold',literal:true});
  cv.text(ko?'오일':'OIL',tx,ty-6,17,'#e9e1c8',{align:'center',font:'bold',literal:true});
  const a=T(isNum(oil)?oil:50),e=pt(a,tr-10,tx,ty);cv.line(tx+2,ty+2,e[0]+2,e[1]+2,3.4,[0,0,0,90]);cv.line(tx,ty,e[0],e[1],3.4,isNum(oil)?'#d79a5a':'#6b6455');cv.circle(tx,ty,6,'#dfe3e7');
 }
 if(want(f,'gear')){
  // gear: a recessed window under the hub (like a date window), the gearbox letter beside it
  cv.fillRect(cx-34,cy+30,68,52,CL.green2);cv.line(cx-34,cy+31,cx+34,cy+31,3,[0,0,0,140]);cv.line(cx-33,cy+30,cx-33,cy+82,3,[0,0,0,110]);
  cv.polyline([[cx-35,cy+29],[cx+35,cy+29],[cx+35,cy+83],[cx-35,cy+83],[cx-35,cy+29]],2,CL.bronze);
  cv.text(h.gearText(d),cx,cy+76,46,f.cue.shift&&f.blink?'#ff5a4a':'#f3ead2',{align:'center',font:h.gearFont(f.opts)});
  if(f.mode)cv.text(f.mode,cx+42,cy+76,20,CL.bronze,{font:'bold'});
 }
 if(want(f,'mode')){const m=String(f.drive||''),word=/SPORT/.test(m)?(ko?'스포츠':'SPORT'):/ECO/.test(m)?(ko?'에코 프로':'ECO PRO'):m?(ko?'컴포트':'COMFORT'):'';
  if(word)cv.text(word,cx,cy-34,19,CL.bronze,{align:'center',font:'bold',literal:true});}
 if(f.readouts.length&&f.readouts[0].gauge)[0,1].forEach(i=>{if(want(f,'read'+'ABCD'[i])&&f.readouts[i])clTube(cv,f.readouts[i],i?1:-1);});
 else [[24,52],[764,52],[24,252],[764,252]].forEach((p,i)=>{if(want(f,'read'+'ABCD'[i])&&f.readouts[i])clPanel(cv,f.readouts[i],p[0],p[1],300,170);});
}
// Luxury arc (for the HUD): a wide shallow gold arc across the top (rpm, 0 at the left), finely ticked, lit
// brighter up to the rpm with a glowing marker; the rpm in big gold digits under it; the gear in a gold pill
// between two fading rules; the drive mode spelt out below; gold pips over the number as the rpm alert;
// readouts left and right; two gold ribbons sweeping up at the lower corners. On the glass black is clear.
const LX={cx:544,cy:780,r:700,half:30,gold:[217,178,106],bright:[255,227,168],dim:[122,98,55]};
const lxc=(c,a)=>[c[0],c[1],c[2],Math.round(a===undefined?255:a)];
function drawLuxury(cv,f,h){
 const d=f.d,max=f.max,{cx,cy,r}=LX,A=v=>-LX.half+2*LX.half*clamp(v,0,max)/max,pt=(a,rr)=>[cx+rr*Math.sin(a*Math.PI/180),cy-rr*Math.cos(a*Math.PI/180)];
 const rpm=isNum(d.rpm)?clamp(d.rpm,0,max):0,q=cue(f),ko=language()==='ko';
 if(want(f,'gauge')){
  // the arc: a dim gold track, ticks every 250 rpm (taller each 1000 with its number above), the redline
  // section in amber, then the lit part to the rpm and a glowing marker
  cv.arc(cx,cy,r-3,r+3,-LX.half,LX.half,lxc(LX.dim,200));
  cv.arc(cx,cy,r-3,r+3,A(f.redline),LX.half,lxc([210,120,60],220));
  for(let v=0;v<=max+1;v+=250){const major=v%1000===0,a=A(v),p=pt(a,r+4),q2=pt(a,r+(major?26:12));cv.line(p[0],p[1],q2[0],q2[1],major?3:1.6,lxc(major?LX.gold:LX.dim,major?255:220));
   if(major){const l=pt(a,r+52);cv.text(String(v/1000),l[0],l[1]+10,30,lxc(v>=f.redline?[235,150,90]:LX.gold),{align:'center',font:'bold'});}}
  if(rpm>50){const hot=f.cue.shift?(f.blink?[255,90,60]:LX.gold):LX.bright;
   cv.arc(cx,cy,r-5,r+5,-LX.half,A(rpm),lxc(hot));cv.arc(cx,cy,r-12,r-5,-LX.half,A(rpm),lxc(hot,60));
   const a=A(rpm),p=pt(a,r-22),q2=pt(a,r+30);cv.line(p[0],p[1],q2[0],q2[1],12,lxc(LX.bright,50));cv.line(p[0],p[1],q2[0],q2[1],4,lxc([255,245,220]));}
  // gold ribbons at the lower corners: two strands each, the outer one bright
  [[1],[-1]].forEach(([s])=>{const X=x=>s>0?x:1088-x,B=(t,o)=>{const u=1-t;return [X(10+2*u*t*140+t*t*300)+o*s,u*u*466+2*u*t*462+t*t*404];};
   [[0,4,LX.gold,230],[18,2,LX.dim,200],[34,1.4,LX.dim,140]].forEach(([o,w,c,al])=>{const pts=[];for(let i=0;i<=24;i++)pts.push(B(i/24,o));cv.polyline(pts,w,lxc(c,al));});});
 }
 if(want(f,'alert')){
  // seven gold pips over the number: lit with the count-in, all red (flashing) at the shift point
  const n=7,lit=q.flash?n:Math.floor(q.p*n+1e-6);
  for(let i=0;i<n;i++){const x=cx+(i-3)*30,y=168,on=i<lit&&(!q.flash||q.on),c=q.flash?[255,70,50]:LX.bright;
   cv.quad([[x,y-7],[x+7,y],[x,y+7],[x-7,y]],on?lxc(c):lxc(LX.dim,150));}
 }
 if(want(f,'rpm')){
  const t=rpmText(d);cv.text(t,cx+3,330+4,150,[40,28,10,180],{align:'center',font:'bold'});cv.text(t,cx,330,150,lxc(f.cue.shift&&f.blink?[255,110,80]:LX.bright),{align:'center',font:'bold'});
  cv.text('rpm',cx,368,28,lxc(LX.gold),{align:'center',font:'bold',literal:true});
 }
 if(want(f,'gear')){
  // the gear in a gold pill between two rules that fade outwards
  const w=118,y=380,g=h.gearText(d)+(f.mode&&f.mode!==h.gearText(d)?'':'');
  cv.polyline([[cx-w/2+16,y],[cx+w/2-16,y],[cx+w/2,y+20],[cx+w/2-16,y+40],[cx-w/2+16,y+40],[cx-w/2,y+20],[cx-w/2+16,y]],2.4,lxc(LX.gold));
  for(let k=0;k<6;k++){const a=220-k*36;cv.line(cx-w/2-12-k*36,y+20,cx-w/2-12-(k+1)*36,y+20,2,lxc(LX.gold,a));cv.line(cx+w/2+12+k*36,y+20,cx+w/2+12+(k+1)*36,y+20,2,lxc(LX.gold,a));}
  cv.text((f.mode||'')+h.gearText(d),cx,y+33,32,lxc(LX.bright),{align:'center',font:'bold'});
 }
 if(want(f,'mode')){const m=String(f.drive||''),word=/SPORT/.test(m)?(ko?'스포츠':'SPORT'):/ECO/.test(m)?(ko?'에코 프로':'ECO PRO'):m?(ko?'컴포트':'COMFORT'):'';
  if(word)cv.text(ko?word:word.split('').join(' '),cx,462,26,lxc(LX.gold),{align:'center',font:'bold',literal:true});}
 // readouts: two left and two right, under the arc's ends
 [[96,250,'left'],[992,250,'right'],[96,350,'left'],[992,350,'right']].forEach((p,i)=>{const it=f.readouts[i];if(!it||!want(f,'read'+'ABCD'[i]))return;
  cv.text(it.label,p[0],p[1],24,lxc(LX.gold,220),{align:p[2],font:'bold'});cv.text(it.value,p[0],p[1]+50,46,lxc(LX.bright),{align:p[2],font:'bold'});});
}
// Sport HUD: four yellow and three red pips, a long slanted segment bar 0..max with the scale under it,
// the gear big inside a stepped frame, the rpm big under it, the drive mode at the foot, readouts left/right.
const SH={x0:80,x1:1000,y:128,hgt:18,slant:10,seg:40};
function drawSportHud(cv,f,h){
 const d=f.d,max=f.max,cx=544,rpm=isNum(d.rpm)?clamp(d.rpm,0,max):0,q=cue(f),ko=language()==='ko';
 const W=[236,236,236],Y=[255,214,0],R=[255,40,30],X=v=>SH.x0+(SH.x1-SH.x0)*clamp(v,0,max)/max;
 const zone=v=>v>=f.redline?R:v>=f.cue.from?Y:W;
 if(want(f,'gauge')){
  const n=SH.seg,step=max/n,gap=4,top=SH.y-SH.hgt;
  for(let i=0;i<n;i++){const v0=i*step,v1=(i+1)*step,x0=X(v0)+gap/2,x1=X(v1)-gap/2,on=rpm>v0+step*0.5||(rpm>v0&&i===0&&rpm>50),c=zone(v0+step/2);
   const hot=on&&f.cue.shift&&f.blink?R:c;
   cv.quad([[x0,SH.y],[x1,SH.y],[x1+SH.slant,top],[x0+SH.slant,top]],on?rgbA(hot,255):rgbA(c,60));}
  cv.line(SH.x0-4,SH.y+4,SH.x1+SH.slant,SH.y+4,2,[200,200,200,200]);
  for(let v=0;v<=max+1;v+=1000){const x=X(v);cv.line(x,SH.y+4,x,SH.y+16,2,[220,220,220,230]);
   cv.text(String(v/1000),x,SH.y+50,32,v>=f.redline?rgbA(R,255):[230,230,230,255],{align:'center',font:'bold'});}
  cv.text(ko?'RPM ×1000':'RPM ×1000',SH.x1+SH.slant,SH.y+92,20,[200,200,200,230],{align:'right',font:'bold',literal:true});
 }
 if(want(f,'alert')){
  const n=7,lit=q.flash?n:Math.floor(q.p*n+1e-6);
  for(let i=0;i<n;i++){const x=cx+(i-3)*38,y=38,on=i<lit&&(!q.flash||q.on),c=q.flash?R:i<4?Y:R;
   cv.circle(x,y,10,on?rgbA(c,255):rgbA(c,55));}
 }
 if(want(f,'gear')){
  const lc=[220,220,220,200];
  [1,-1].forEach(s=>{const X2=x=>cx+s*x;cv.polyline([[X2(250),300],[X2(160),300],[X2(130),226],[X2(80),226]],2,lc);});
  cv.text(h.gearText(d),cx,300,112,[240,240,240,255],{align:'center',font:'bold'});
 }
 if(want(f,'rpm')){
  const t=rpmText(d),c=f.cue.shift&&f.blink?rgbA(R,255):[240,240,240,255];
  cv.text(t,cx+20,422,108,c,{align:'right',font:'bold'});cv.text('rpm',cx+34,422,32,[220,220,220,230],{align:'left',font:'bold',literal:true});
 }
 if(want(f,'mode')){const m=String(f.drive||''),th=sdTheme(m),word=/SPORT/.test(m)?(ko?'스포츠':'SPORT'):/ECO/.test(m)?(ko?'에코 프로':'ECO PRO'):m?(ko?'컴포트':'COMFORT'):'';
  if(word){cv.text(word,cx,470,30,rgbA(th.main,255),{align:'center',font:'bold',literal:true});
   cv.line(cx-170,460,cx-100,460,2,[200,200,200,170]);cv.line(cx+100,460,cx+170,460,2,[200,200,200,170]);}}
 // readouts: two on each side beside the gear and rpm, with a thin divider on the inner side
 [[80,'left',150],[1008,'right',938]].forEach(([x,al,dx],side)=>{[0,1].forEach(r=>{const i=side+2*r,it=f.readouts[i];if(!it||!want(f,'read'+'ABCD'[i]))return;const y=262+r*110;
  cv.line(side?dx-100:dx+100,y-34,side?dx-100:dx+100,y+20,2,[200,200,200,150]);
  cv.text(it.label,x,y-10,24,[190,190,190,230],{align:al,font:'bold'});cv.text(it.value,x,y+38,44,[240,240,240,255],{align:al,font:'bold'});
  // gauge mode: slanted white segments like the rev bar, the top two yellow
  if(gb(it))slants(cv,side?x-150:x,y+56,150,14,12,6,it.frac,(k,n)=>k>=n-2?[255,210,40,255]:[240,240,240,255],[80,80,80,170],3);});});
}
// Tyres & trip (cluster only): the car from above, nose up, gear and drive mode in its middle, each tyre's
// temperature (colour: cold blue, warm green, hot yellow, very hot red) and pressure in psi beside it, and up to
// four auxiliary items underneath (two with bars in gauge mode).
const TY={cx:544,cy:176,hw:64,hh:150,psi:14.5038};
function tyreCol(t){return !isNum(t)?'#5d6b7c':t<20?'#3aa0ff':t<45?'#2fd27a':t<75?'#ffcf33':'#ff4a3a';}
function rr(cv,x,y,w,h,r,c){cv.fillRect(x+r,y,w-2*r,h,c);cv.fillRect(x,y+r,r,h-2*r,c);cv.fillRect(x+w-r,y+r,r,h-2*r,c);
 [[x+r,y+r],[x+w-r,y+r],[x+r,y+h-r],[x+w-r,y+h-r]].forEach(p=>cv.circle(p[0],p[1],r,c));}
function drawTyres(cv,f,h){
 const {cx,cy,hw,hh}=TY,d=f.d,dm=drive(f.drive),ko=language()==='ko',ty=f.tyres||{};
 if(want(f,'car')){
  const B=[[cx-hw+10,cy-hh],[cx+hw-10,cy-hh],[cx+hw,cy-hh+34],[cx+hw+2,cy+hh-36],[cx+hw-8,cy+hh],[cx-hw+8,cy+hh],[cx-hw-2,cy+hh-36],[cx-hw,cy-hh+34]];
  // body as one rectangle and two trapezoids (no seams inside), then the outline
  const top=cy-hh,bot=cy+hh;cv.fillRect(cx-hw-1,top+33,2*hw+3,bot-36-top-33+1,'#1b2330');
  cv.quad([[cx-hw+10,top],[cx+hw-10,top],[cx+hw+0.5,top+34],[cx-hw-0.5,top+34]],'#1b2330');cv.quad([[cx-hw-1.5,bot-37],[cx+hw+2,bot-37],[cx+hw-8,bot],[cx-hw+8,bot]],'#1b2330');
  cv.polyline(B.concat([B[0]]),3,'#5d6b7c');
  cv.quad([[cx-52,cy-92],[cx+52,cy-92],[cx+44,cy-56],[cx-44,cy-56]],'#2b3a4d');
  cv.quad([[cx-44,cy+70],[cx+44,cy+70],[cx+50,cy+100],[cx-50,cy+100]],'#2b3a4d');
  rr(cv,cx-46,cy-52,92,118,14,'#10161f');
  cv.fillRect(cx-44,cy-hh-5,26,5,'#d9e2ec');cv.fillRect(cx+18,cy-hh-5,26,5,'#d9e2ec');
  cv.fillRect(cx-46,cy+hh,26,5,'#ff3b30');cv.fillRect(cx+20,cy+hh,26,5,'#ff3b30');
  [['FL',-1,-1],['FR',1,-1],['RL',-1,1],['RR',1,1]].forEach(([k,sx,sy])=>{
   const t=ty.temp&&ty.temp[k],b=ty.bar&&ty.bar[k],x=cx+sx*(hw+10),y=cy+sy*94,col=tyreCol(t),al=sx<0?'right':'left',tx=sx<0?x-26:x+26;
   rr(cv,x-11,y-28,22,56,7,col);rr(cv,x-6,y-23,12,46,4,[0,0,0,90]);
   cv.text(isNum(t)?Math.round(t)+'°C':'--°C',tx,y+2,34,col,{align:al,font:'bold'});
   cv.text(isNum(b)?Math.round(b*TY.psi)+' psi':'-- psi',tx,y+28,19,C.dim,{align:al,font:'bold'});
  });
 }
 if(want(f,'gear'))cv.text(h.gearText(d),cx,cy+18,54,C.text,{align:'center',font:h.gearFont(f.opts)});
 if(want(f,'mode')&&dm.name)cv.text(dm.name,cx,cy+48,18,dm.col,{align:'center',font:'bold'});
 // readouts: four text columns, or two wider columns with bars in gauge mode
 const list=f.readouts||[],gauges=list.length&&list[0].gauge,n=gauges?2:4,x0=140,w=808/n;
 for(let i=0;i<n;i++){const it=list[i],id='read'+'ABCD'[i];if(!want(f,id))continue;
  const x=x0+i*w;if(i&&(it||list[i-1]))cv.line(x,366,x,446,1,'#2a3038');if(!it)continue;const mid=x+w/2;
  cv.text(it.label,mid,386,19,C.dim,{align:'center',font:'bold'});
  const unitless=/[°%:]/.test(it.value)||!it.unit,vw=cv.textWidth(it.value,40,{font:'bold'}),uw=unitless?0:cv.textWidth(it.unit,17,{font:'bold'})+6;
  const vx=mid-(vw+uw)/2,vy=gauges?424:436,col=it.tone==='hot'?'#ff5a3a':it.tone==='cold'?'#5ab0ff':C.text;
  cv.text(it.value,vx,vy,40,col,{font:'bold'});if(!unitless)cv.text(it.unit,vx+vw+6,vy,17,C.dim,{font:'bold'});
  if(gauges&&it.frac!==null){const bx=x+24,bw=w-48,seg=bw/16,lit=Math.round(it.frac*16);for(let k=0;k<16;k++)cv.fillRect(bx+k*seg+1,436,seg-3,10,k<lit?'#ff9a1a':'#2a2f37');}
 }
 void ko;
}
const DRAW={shift:drawShift,logger:drawLogger,needle:drawNeedle,rings:drawRings,ribbon:drawRibbon,hexagon:drawHexagon,sportdial:drawSportDial,classic:drawClassic,luxury:drawLuxury,sporthud:drawSportHud,tyres:drawTyres};
// Each layout draws in one pass (no separate background layer); the bg layer request draws nothing.
function drawX(cv,f,layer,h){if(layer==='bg')return;DRAW[f.opts.style](h.scaled(cv,S,0,0),f,h);}
module.exports={STYLES:Object.keys(DRAW),IH,drawX};
