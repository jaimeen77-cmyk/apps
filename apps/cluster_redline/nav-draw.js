'use strict';
const {Canvas}=require('./kit/canvas');
const W=240,H=112,WHITE='#f4f7fb',ARROW='#37c6ff';
const {NAV_COLORS}=require('./display-config');
// state.color: the arrow (orange / green / blue / white); state.textColor: the distance and exit name.
const arrowColor=state=>NAV_COLORS[state.color]||(state.color==='gray'?WHITE:ARROW),textColor=state=>NAV_COLORS[state.textColor]||WHITE;
function highwayInfo(state) {
    if(!state||state.kind!=='branch'||typeof state.branchType!=='string')return null;
    const match=/^HIGHWAY_(IN|OUT)_(LEFT|RIGHT|STRAIGHT)$/.exec(state.branchType);
    if(!match)return null;
    return {action:match[1]==='IN'?'entry':'exit',side:match[2],label:match[1]==='IN'?'Highway entry':'Highway exit'};
}
// Simplified road diagrams for junction types where a plain arrow says too little:
// forks, branches, roundabouts, highway entries/exits, keep-on-main-road and lane
// changes. Generic shapes from the maneuver type only (the vehicle data has no arm
// count or angles), drawn in a 104x112 box shrunk towards its bottom so they stay
// clear of the texts. Plain turns, U-turns and arrivals keep the large arrow.
const ROAD='#3a4552',FAINT='#232b34',RW=24,AW=7,K=0.82,D2R=Math.PI/180;
const ray=(c,deg,len)=>[c[0]+Math.sin(deg*D2R)*len,c[1]-Math.cos(deg*D2R)*len];
function box(cv){const X=x=>52+(x-52)*K,Y=y=>110-(110-y)*K;return{
 path:(pts,w,col)=>{for(let i=1;i<pts.length;i++)cv.line(X(pts[i-1][0]),Y(pts[i-1][1]),X(pts[i][0]),Y(pts[i][1]),w*K,col);},
 line:(a,b,c,d,w,col)=>cv.line(X(a),Y(b),X(c),Y(d),w*K,col),
 ring:(x,y,r0,r1,col)=>cv.arc(X(x),Y(y),r0*K,r1*K,0,360,col),
 tri:(p,col)=>cv.quad([p[0],p[1],p[2],p[2]].map(q=>[X(q[0]),Y(q[1])]),col),
 text:(t,x,y,size,col,o)=>cv.text(t,X(x),Y(y),size*K,col,o)};}
function smooth(pts,r){const out=[pts[0]];for(let i=1;i<pts.length-1;i++){const p=pts[i],a=pts[i-1],b=pts[i+1];
 const la=Math.hypot(p[0]-a[0],p[1]-a[1]),lb=Math.hypot(b[0]-p[0],b[1]-p[1]),k=Math.min(r,la/2,lb/2),A=[p[0]+(a[0]-p[0])*k/la,p[1]+(a[1]-p[1])*k/la],B=[p[0]+(b[0]-p[0])*k/lb,p[1]+(b[1]-p[1])*k/lb];
 for(let n=0;n<=8;n++){const t=n/8,u=1-t;out.push([u*u*A[0]+2*u*t*p[0]+t*t*B[0],u*u*A[1]+2*u*t*p[1]+t*t*B[1]]);}}
 out.push(pts[pts.length-1]);return out;}
function arrowAlong(b,p,color){const end=p[p.length-1],prev=p[p.length-2],l=Math.hypot(end[0]-prev[0],end[1]-prev[1])||1,dx=(end[0]-prev[0])/l,dy=(end[1]-prev[1])/l,base=[end[0]-dx*13,end[1]-dy*13];
 b.path(p.slice(0,-1).concat([base]),AW,color);b.tri([[base[0]-dy*9.5,base[1]+dx*9.5],[base[0]+dy*9.5,base[1]-dx*9.5],end],color);}
const road=(b,pts,col)=>b.path(smooth(pts,14),RW,col||ROAD);
const route=(b,pts,color)=>arrowAlong(b,smooth(pts,14),color);
function diagramKind(state){
 const b=state&&typeof state.branchType==='string'?state.branchType:'',m=state&&state.maneuver;
 if(/^(FORK|TRIPLE_FORK|BRANCH)_(LEFT|RIGHT|STRAIGHT)$/.test(b))return 'branch';
 if(highwayInfo(state))return 'highway';
 if(m==='ROUNDABOUT'&&Number.isInteger(state.exitNumber)&&state.exitNumber>0)return 'roundabout';
 if(/^(KEEP|LANE)_(LEFT|RIGHT)$/.test(m||''))return 'road';
 return null;
}
function roadDiagram(cv,state,color){
 const b=box(cv),m=state.maneuver,t=state.branchType||'',mir=/LEFT/.test(t)||/LEFT/.test(m)?-1:1,bottom=[52,110],C=[52,74];
 const info=highwayInfo(state);
 if(info){
  if(info.side==='STRAIGHT'){road(b,[bottom,[52,4]]);route(b,[bottom,[52,8]],color);}
  else if(info.action==='exit'){road(b,[[52-mir*14,110],[52-mir*14,4]]);road(b,[[52-mir*14,90],[52-mir*14,70],[52+mir*34,14]]);route(b,[[52-mir*14,106],[52-mir*14,70],[52+mir*32,16]],color);}
  else{road(b,[[52+mir*20,110],[52+mir*20,4]]);road(b,[[52-mir*30,110],[52-mir*30,84],[52+mir*20,40]]);route(b,[[52-mir*30,106],[52-mir*30,84],[52+mir*20,40],[52+mir*20,10]],color);}
  return;
 }
 if(m==='ROUNDABOUT'){
  // Entry at the bottom, exits evenly spaced counterclockwise (right-hand traffic).
  const n=state.exitNumber,count=Math.max(3,n),R=20,cx=52,cy=50,ang=i=>180-i*360/(count+1);
  b.ring(cx,cy,R-RW/2,R+RW/2,ROAD);road(b,[bottom,[cx,cy+R]]);
  for(let i=1;i<=count;i++){const d=ray([cx,cy],ang(i),1);road(b,[[cx+(d[0]-cx)*R,cy+(d[1]-cy)*R],[cx+(d[0]-cx)*48,cy+(d[1]-cy)*48]],i===n?ROAD:FAINT);}
  const pts=[bottom];for(let a=180;a>=ang(n)-0.1;a-=6)pts.push(ray([cx,cy],a,R));pts.push(ray([cx,cy],ang(n),46));
  arrowAlong(b,pts,color);b.text(String(n),cx,cy+9,22,WHITE,{align:'center',font:'num',literal:true});return;
 }
 if(/^TRIPLE_FORK/.test(t)){const exits=[-28,0,28],pick=/LEFT/.test(t)?0:/RIGHT/.test(t)?2:1;
  exits.forEach((a,i)=>road(b,[bottom,[52,72],ray([52,72],a,52)],i===pick?ROAD:FAINT));route(b,[bottom,[52,72],ray([52,72],exits[pick],50)],color);return;}
 if(/^FORK_/.test(t)){road(b,[bottom,C,ray(C,-mir*24,52)],FAINT);road(b,[bottom,C,ray(C,mir*24,52)]);route(b,[bottom,C,ray(C,mir*24,50)],color);return;}
 if(/^BRANCH_/.test(t)||/^KEEP_/.test(m)){
  // BRANCH: leave the main road for a side road. KEEP: stay on the main road where it bends.
  road(b,[bottom,[52,4]],/^KEEP_/.test(m)?FAINT:ROAD);road(b,[bottom,[52,76],ray([52,76],mir*42,52)]);route(b,[bottom,[52,76],ray([52,76],mir*42,50)],color);return;}
 if(/^LANE_/.test(m)){const s=m==='LANE_RIGHT'?1:-1;b.path([[52,110],[52,2]],RW*2.1,ROAD);for(let y=8;y<108;y+=18)b.line(52,y,52,y+9,2,'#80909d');
  route(b,[[52-s*13,108],[52-s*13,80],[52+s*13,46],[52+s*13,14]],color);}
}
function draw(state,target) {
    const cv=target||new Canvas(W,H);if(!target)cv.clear([0,0,0,0]);
    if(!state||!state.visible)return cv;
    const kind=diagramKind(state),color0=arrowColor(state),ink=textColor(state);
    if(kind){
        if(!(kind!=='branch'&&!/^KEEP_/.test(state.maneuver||'')&&icon(cv,state,color0,4,8,96,98)))roadDiagram(cv,state,color0);const info=highwayInfo(state),text=state.distanceText||'';let size=40;
        while(size>20&&cv.textWidth(text,size,{font:'num',literal:true})>130)size--;
        if(info){let ls=22;while(ls>14&&cv.textWidth(info.label,ls,{font:'bold'})>130)ls--;cv.text(info.label,108,32,ls,ink,{font:'bold'});cv.text(text,108,84,size,ink,{font:'num',literal:true});}
        else cv.text(text,108,67,size,ink,{font:'num',literal:true});
        return cv;
    }
    if(!arrow(cv,state,arrowColor(state)))return cv;
    const text=state.distanceText||'';let size=40;
    while(size>20&&cv.textWidth(text,size,{font:'num',literal:true})>130)size--;
    cv.text(text,108,67,size,ink,{font:'num',literal:true});
    return cv;
}
// The turn after this one, when it follows close behind (1.3.35): "Then [arrow] 120 m", its own HUD part (1.3.43,
// Position / size: Next turn; until then drawn under Direction's distance). The arrow is the turn's own, a third of
// the size (a plain arrow for a junction diagram, which would not read that small).
const THEN_W=132,THEN_H=44;
function thenLine(cv,then,color,ink){
    const label=require('./strings').tr('Then');let x=0;
    cv.text(label,x,33,17,withAlpha(ink,0.8),{font:'bold',literal:true});x+=cv.textWidth(label,17,{font:'bold',literal:true})+6;
    arrow(at(cv,0.3,x,6),{maneuver:then.maneuver,exitNumber:then.exitNumber},color,true);x+=34;
    if(typeof then.gap==='number')cv.text(then.gap+' m',x,33,17,withAlpha(ink,0.8),{font:'num',literal:true});
}
function drawThen(state,target){
    const cv=target||new Canvas(THEN_W,THEN_H);if(!target)cv.clear([0,0,0,0]);
    const then=state&&state.visible&&state.then;if(!then||!then.maneuver)return cv;
    thenLine(cv,then,arrowColor(state),textColor(state));return cv;
}
const withAlpha=(c,a)=>{const m=/^#([0-9a-f]{6})$/i.exec(c);if(!m)return c;const n=parseInt(m[1],16);return [n>>16&255,n>>8&255,n&255,Math.round(a*255)];};
// a view of cv drawn at scale s from (ox, oy)
function at(cv,s,ox,oy){const P=v=>[ox+v[0]*s,oy+v[1]*s];return {art:typeof cv.art==='function'?(n,x,y,w,h,o)=>cv.art(n,ox+x*s,oy+y*s,w*s,h*s,o):(n,x,y,w,h,o)=>require('./hud-art').paint(cv,n,ox+x*s,oy+y*s,w*s,h*s,o),line:(a,b,c,d,w,col)=>cv.line(ox+a*s,oy+b*s,ox+c*s,oy+d*s,w*s,col),polyline:(p,w,c)=>cv.polyline(p.map(P),Math.max(2.5,w*s),c),
 quad:(p,c)=>cv.quad(p.map(P),c),arc:(x,y,r0,r1,a0,a1,c,o)=>cv.arc(ox+x*s,oy+y*s,r0*s,r1*s,a0,a1,c,o),
 text:(t,x,y,size,c,o)=>cv.text(t,ox+x*s,oy+y*s,size*s,c,o),textWidth:(t,size,o)=>cv.textWidth(t,size*s,o)/s};}
// The guidance icons (1.3.81): cut from the user's icon sheet (tools/hud-art/nav, hud-art.js), in the sheet's blue or
// turned to the chosen navigation colour. A view that cannot paint pixels (cv.art missing or false) gets the drawn arrows.
const ICON={LEFT:'left',RIGHT:'right',HARD_LEFT:'left',HARD_RIGHT:'right',SHARP_LEFT:'left',SHARP_RIGHT:'right',SLIGHT_LEFT:'slight-left',SLIGHT_RIGHT:'slight-right',
 STRAIGHT_ON:'straight',UTURN_LEFT:'uturn-left',UTURN_RIGHT:'uturn-right',ROUNDABOUT:'roundabout',LANE_LEFT:'lane-left',LANE_RIGHT:'lane-right',ARRIVAL_LEFT:'arrival-left',ARRIVAL_RIGHT:'arrival-right'};
const DEFAULT_BLUE=['#37c6ff','#29c5ff','#45b8ff'];
function iconOf(state){
 const m=state&&state.maneuver,info=highwayInfo(state);
 if(info)return (info.action==='exit'?'out-':'in-')+(info.side==='LEFT'?'left':info.side==='RIGHT'?'right':'straight');
 if(/^ARRIVAL/.test(m||''))return m==='ARRIVAL_LEFT'?'arrival-left':'arrival-right';
 return ICON[m]||null;
}
// paint the icon fitted in the box (x, y, w, h), bottom-centred; the roundabout's exit number over its middle
function icon(cv,state,color,x,y,w,h,small){
 const name=iconOf(state),art=typeof cv.art==='function'?cv.art:cv&&cv.d?(n,a,b,c,d,o)=>require('./hud-art').paint(cv,n,a,b,c,d,o):null;if(!name||!art)return false;
 const A=require('./hud-art'),sz=A.size('nav/'+name);if(!sz)return false;
 const k=Math.min(w/sz.w,h/sz.h),iw=sz.w*k,ih=sz.h*k,ix=x+(w-iw)/2,iy=y+h-ih;
 const tint=DEFAULT_BLUE.indexOf(String(color).toLowerCase())>=0?null:color;
 if(art('nav/'+name,ix,iy,iw,ih,{tint})===false)return false;
 if(name==='roundabout'&&!small&&state.exitNumber){const cx=ix+iw*0.505,cy=iy+ih*0.47,r=iw*0.12;
  cv.arc(cx,cy,0,r,0,360,'#141a22');cv.text(String(state.exitNumber),cx,cy+r*0.62,r*1.7,WHITE,{align:'center',font:'num',literal:true});}
 return true;
}
/** The turn's arrow in the 104 x 112 box; false for a turn it has no arrow for. small: the "then" arrow (no number). */
function arrow(cv,state,color,small){
    if(icon(cv,state,color,4,8,96,98,small))return true;
    const dir=state.maneuver,FLAG='#e5322d';
    const line=(points)=>cv.polyline(points,10,color);
    const mirror=(points)=>points.map((p)=>[104-p[0],p[1]]);
    if(/^ARRIVAL_/.test(dir)) {
        // Arrival flag, never a turn arrow. Preserve the supplied roadside position.
        const x=dir==='ARRIVAL_LEFT'?25:dir==='ARRIVAL_RIGHT'?68:47;
        // A pole with a red swallowtail flag (white outline, notched fly end).
        line([[x,92],[x,20]]);
        const L=x+3,R=x+29,T=20,B=45,N=R-10,M=(T+B)/2;
        cv.quad([[L,T],[N,T],[N,B],[L,B]],FLAG);
        cv.quad([[N,T],[R,T],[N,M],[N,M]],FLAG);cv.quad([[N,M],[R,B],[N,B],[N,B]],FLAG);
        cv.polyline([[L,T],[R,T],[N,M],[R,B],[L,B]],3,WHITE);
    } else if(/^LANE_/.test(dir)) {
        // Offset lane-change arrow differs from a90-degree intersection turn.
        let pts=[[76,90],[76,70],[28,45],[28,20]],head=[[10,38],[28,20],[46,38]];
        if(dir==='LANE_RIGHT'){pts=mirror(pts);head=mirror(head);}line(pts);line(head);
    } else if(dir==='ROUNDABOUT') {
        const pts=[];for(let i=0;i<=24;i++){const a=(i/24*1.7+0.15)*Math.PI;pts.push([52+27*Math.cos(a),48+27*Math.sin(a)]);}line(pts);
        if(!small)cv.text(String(state.exitNumber),52,60,28,WHITE,{align:'center',font:'num'});
    } else if(dir==='STRAIGHT_ON') {line([[52,90],[52,20]]);line([[30,42],[52,20],[74,42]]);}
    else if(/UTURN/.test(dir)) {
        let pts=[[79,90],[79,42]],head=[[9,55],[25,73],[41,55]];
        for(let i=1;i<=24;i++){const a=-Math.PI*i/24;pts.push([52+27*Math.cos(a),42+27*Math.sin(a)]);}
        pts.push([25,73]);
        if(dir==='UTURN_RIGHT'){pts=mirror(pts);head=mirror(head);}line(pts);line(head);
    } else if(/LEFT|RIGHT/.test(dir)) {
        const slight=/SLIGHT|KEEP/.test(dir);let pts=slight?[[76,90],[76,65],[28,20]]:[[78,90],[78,43],[23,43]];
        let head=slight?[[28,48],[28,20],[56,20]]:[[44,22],[23,43],[44,64]];
        if(/RIGHT/.test(dir)){pts=mirror(pts);head=mirror(head);}line(pts);line(head);
    } else return false;
    return true;
}
// Paint at the final HUD size: the same 240x112 drawing through a scaled view,
// so no resampled image loses thin strokes.
function scaled(cv,s){return {art:(n,x,y,w,h,o)=>require('./hud-art').paint(cv,n,x*s,y*s,w*s,h*s,o),line:(a,b,c,d,w,col)=>cv.line(a*s,b*s,c*s,d*s,w*s,col),polyline:(p,w,c)=>cv.polyline(p.map(v=>[v[0]*s,v[1]*s]),w*s,c),
 quad:(p,c)=>cv.quad(p.map(v=>[v[0]*s,v[1]*s]),c),arc:(x,y,r0,r1,a0,a1,c,o)=>cv.arc(x*s,y*s,r0*s,r1*s,a0,a1,c,o),
 text:(t,x,y,size,c,o)=>cv.text(t,x*s,y*s,size*s,c,o),textWidth:(t,size,o)=>cv.textWidth(t,size*s,o)/s};}
function drawSized(state,w,h){const s=(w||W)/W,cv=new Canvas(Math.max(1,Math.round(w||W)),Math.max(1,Math.round(h||H*s)));cv.clear([0,0,0,0]);draw(state,scaled(cv,s));return cv;}
const then={W:THEN_W,H:THEN_H,draw:drawThen,drawSized(state,w,h){const s=(w||THEN_W)/THEN_W,cv=new Canvas(Math.max(1,Math.round(w||THEN_W)),Math.max(1,Math.round(h||THEN_H*s)));cv.clear([0,0,0,0]);drawThen(state,scaled(cv,s));return cv;}};
module.exports={draw,drawSized,then,W,H,highwayInfo,diagramKind,arrow};
