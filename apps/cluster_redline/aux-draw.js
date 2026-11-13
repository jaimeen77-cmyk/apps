'use strict';
require('./crisp-text');
const {gauges}=require('./units');
const {auxConfig,metricSlots,LABELS}=require('./display-config');
const {part}=require('./component-canvas');
const {mix}=require('./kit/canvas'),{tr}=require('./strings');
const WHITE='#f4f7fb',BLUE='#1caeff',DIM='#b8c2d1',LIQUID='#ff3b30';
const tone=(c,f)=>mix(c,f>0?'#ffffff':'#000000',Math.abs(f));
function metric(state,id){
 const g=gauges(state),v=state.aux||{};
 if(id==='torque'||id==='power')return Object.assign({id,label:LABELS[id],minimum:0},g[id]);
 // Trip 1 driving time: hours:minutes as text; its gauge runs to 5 h.
 if(id==='tripTime'){const m=v.tripTime;return {id,label:tr(LABELS.tripTime),text:valid(m)?Math.floor(m/60)+':'+String(m%60).padStart(2,'0'):'--:--',unit:'h',value:valid(m)?m:null,decimals:0,minimum:0,maximum:300};}
 if(id==='avgSpeed')return {id,label:tr(LABELS.avgSpeed),value:v.avgSpeed,unit:'km/h',decimals:0,minimum:0,maximum:200};
 if(id==='clock')return {id,label:tr(LABELS.clock),text:typeof v.clock==='string'&&/^\d\d:\d\d$/.test(v.clock)?v.clock:'--:--',unit:''};
 const spec={boost:[v.boost,'bar',2,0,2.5],gforce:[v.gforce,'g',2,0,2],outside:[v.outside,'°C',1,-40,60],oil:[v.oil,'°C',0,0,180],batteryCharge:[v.batteryCharge,'%',0,0,100],batteryVoltage:[v.batteryVoltage,'V',2,0,18],economy:[v.economy,'km/L',1,0,50]}[id];
 return {id,label:id==='outside'?'Outside temp':id==='oil'?'Oil temp':LABELS[id],value:spec&&spec[0],unit:spec&&spec[1],decimals:spec&&spec[2],minimum:spec&&spec[3],maximum:spec&&spec[4]};
}
function valid(v){return typeof v==='number'&&isFinite(v);}
function valueY(h,cfg,s,shift){return (s.rows===2?(h?(cfg.hudAlertStyle==='circle'?(s.row?184:126):(s.row?204:159)):(s.row?385:315)):h?(cfg.hudAlertStyle==='circle'?146:180):370)+shift;}
// Largest size up to `size` (not below `min`) whose text fits `width`.
function fit(c,text,size,min,width,opts){while(size>min&&c.textWidth(text,size,opts)>width)size-=0.5;return size;}
// Slanted band. With [top, mid, bottom] it is drawn as a solid mid-tone band with a
// lighter upper and darker lower band on top (no seams between slices).
function band(c,gx,y,length,bh,slant,stops){
 if(length<=0)return;
 const strip=(t0,t1,color)=>{const l0=slant*(1-t0),l1=slant*(1-t1);c.quad([[gx+l0,y+bh*t0],[gx+l0+length,y+bh*t0],[gx+l1+length,y+bh*t1],[gx+l1,y+bh*t1]],color);};
 if(stops.length===1){strip(0,1,stops[0]);return;}
 strip(0,1,stops[1]);strip(0,0.38,stops[0]);strip(0.68,1,stops[2]);
}
function barGauge(c,item,gx,y,gw,bh,fraction){
 const slant=7,span=gw-slant;
 band(c,gx+2,y+2,span,bh,slant,['#00000088']);                                  // drop shadow (cluster)
 band(c,gx,y,span,bh,slant,['#2c3543','#181e27','#0d1117']);                   // recessed track
 c.line(gx+slant,y+0.5,gx+slant+span,y+0.5,1,'#3c4858');
 if(fraction>0){
  band(c,gx,y,span*fraction,bh,slant,[tone(BLUE,0.5),BLUE,tone(BLUE,-0.4)]);
  band(c,gx+slant*0.1,y+1.5,span*fraction-1.5,bh*0.2,slant*0.2,['#ffffff50']);   // gloss
 }
 if(valid(item.value))c.line(gx+slant+span*fraction,y-1,gx+span*fraction,y+bh+1,1.5,WHITE);
 if(valid(item.peak))c.line(gx+slant,y-2,gx+slant+span*Math.max(0,Math.min(1,item.peak/item.maximum)),y-2,2,'#ff2a2a');
 return {from:gx,span:gw-7};
}
// A real thermometer lying on its side: glass bulb and tube, red liquid, scale marks.
function thermometer(c,item,gx,y,gw,bh,fraction){
 const cy=y+bh/2,r=bh*0.44,th=bh*0.4,tx=gx+r*1.55,tw=gw-r*1.55-2,glass='#9aabbe',inner='#0e1319';
 c.arc(gx+r+1.5,cy+1.5,0,r+1.5,0,360,'#00000088');
 c.roundRect(tx-r*0.6,cy-th/2-1.5,tw+r*0.6+1.5,th+3,th/2+1.5,glass);c.arc(gx+r,cy,0,r+1.5,0,360,glass);
 c.roundRect(tx-r*0.6+1.5,cy-th/2,tw+r*0.6-1.5,th,th/2,inner);c.arc(gx+r,cy,0,r,0,360,inner);
 for(let i=1;i<10;i++){const px=tx+tw*i/10;c.line(px,cy-th/2-1.5,px,cy-th/2-(i%5?3.5:6),1,DIM);}
 const on=valid(item.value);
 if(on){
  const liquid=[tone(LIQUID,0.35),LIQUID,tone(LIQUID,-0.35)],len=Math.max(0,(tw-2)*fraction),lh=th-4;
  c.arc(gx+r,cy,0,r-2.5,0,360,LIQUID);c.arc(gx+r-r*0.25,cy-r*0.3,0,r*0.32,0,360,'#ffffff66');
  if(len>0){for(let i=0;i<3;i++)c.fillRect(tx-r*0.6+2,cy-lh/2+lh*i/3,len+r*0.6-1,lh/3+0.5,liquid[i]);}
 }
 c.line(tx,cy-th/2+1.2,tx+tw-th/2,cy-th/2+1.2,1,'#ffffff40');                      // glass reflection
 return {from:tx,span:tw};
}
function batteryGauge(c,item,gx,y,gw,bh,fraction){
 const terminal=bh*0.16,body=gw-terminal-2,pad=bh*0.13,iw=body-pad*2,seg=iw/10,gap=Math.max(1,seg*0.2),color=!valid(item.value)?DIM:item.value<40?'#ff2a2a':item.value<65?'#ffd522':'#19ee67';
 c.roundRect(gx+2,y+2,body,bh,bh*0.12,'#00000088');
 c.roundRect(gx,y,body,bh,bh*0.12,DIM);c.roundRect(gx+1.5,y+1.5,body-3,bh-3,bh*0.08,'#151a22');c.roundRect(gx+body+1,y+bh*0.3,terminal,bh*0.4,1,DIM);
 c.line(gx+bh*0.12,y+0.8,gx+body-bh*0.12,y+0.8,1,'#ffffff66');
 for(let n=0;n<10;n++){const sx=gx+pad+n*seg,sw=seg-gap,sh=bh-pad*2;c.roundRect(sx,y+pad,sw,sh,1,'#2d3644');const f=Math.max(0,Math.min(1,fraction*10-n));
  if(f>0){c.roundRect(sx,y+pad,sw*f,sh,1,color);c.fillRect(sx,y+pad+sh*0.62,sw*f,sh*0.38,tone(color,-0.3));c.fillRect(sx,y+pad,sw*f,sh*0.28,tone(color,0.45));}}
 return {from:gx,span:gw-7};
}
function gforceGauge(c,item,gx,y,gw,bh,state){
 c.fillRect(gx+2,y+2,gw,bh,'#00000088');
 [['#252d39',0],['#1b212b',0.35],['#12161d',0.7]].forEach(s=>c.fillRect(gx,y+bh*s[1],gw,bh*0.35+0.5,s[0]));
 c.polyline([[gx,y],[gx+gw,y],[gx+gw,y+bh],[gx,y+bh],[gx,y]],1,DIM);c.line(gx+1,y+1,gx+gw-1,y+1,1,'#ffffff40');
 c.line(gx+gw/2,y+3,gx+gw/2,y+bh-3,1,'#506176');
 if(valid(item.value)&&state.aux&&valid(state.aux.gLat)){const r=bh*0.3,cx=gx+gw/2+Math.max(-1,Math.min(1,state.aux.gLat/2))*(gw/2-r-3),cy=y+bh/2;
  c.arc(cx,cy,0,r,0,360,tone(BLUE,-0.35));c.arc(cx,cy,0,r*0.82,0,360,BLUE);c.arc(cx-r*0.28,cy-r*0.3,0,r*0.35,0,360,'#ffffff88');}
 return {from:gx,span:gw-7};
}
function drawAux(cv,state,display,geometry){
 const cfg=state.config,selected=auxConfig(cfg[display+'AuxConfig']),h=display==='hud';
 const columns=geometry||{left:h?64:200,right:h?452:658,width:h?160:230,top:h?100:310,bottom:h?188:422};
 const slots=metricSlots(selected.items),numberSize=h?26.4:32,labelSize=h?19:22,unitSize=h?14:15,scaleSize=15,shift=(columns.textShift||0)+(h&&selected.mode==='values'?cfg.hudAuxTextOffsetY:0);
 [0,1].forEach(side=>{
  const x=side?columns.right:columns.left,w=columns.width,group=slots.filter(s=>s.side===side);
  const top=Math.min(columns.top-20,...group.map(s=>valueY(h,cfg,s,shift)-(s.rows===2?25:h?46:55)-labelSize-8))-12;
  const bottom=Math.max(columns.bottom+12,...group.map(s=>valueY(h,cfg,s,shift)+12));
  part(cv,cfg,display,side?'AuxRight':'AuxLeft',{x:x-10,y:top,w:w+20,h:bottom-top},c=>{
   if(selected.mode==='off')return;
   group.forEach(s=>{
    const item=metric(state,s.id),text=item.text||(valid(item.value)?item.value.toFixed(item.decimals):'--');
    const bold={font:'bold'},num={font:'num',literal:true},lit={literal:true};
    if(selected.mode==='values'){
     const y=valueY(h,cfg,s,shift),size0=s.rows===2&&h?16.5:labelSize;c.text(item.label,x,y-(s.rows===2?25:h?46:55),fit(c,item.label,size0,12,w,bold),DIM,bold);
     const uw=c.textWidth(item.unit,unitSize,lit);let size=h?(s.rows===2?30:59.4):(s.rows===2?40:64);
     while(size>16&&c.textWidth(text,size,num)+uw+5>w)size--;
     c.text(text,x+w-uw-5,y,size,WHITE,{font:'num',literal:true,align:'right'});c.text(item.unit,x+w,y,unitSize,DIM,{align:'right',literal:true});return;
    }
    const labelY=columns.top+15,y=columns.top+29,bh=h?28.8:26,gw=w*0.9,gx=x+(w-gw)/2;
    const uw=item.unit?c.textWidth(item.unit,unitSize,lit):0;
    if(s.id==='batteryVoltage'||s.id==='economy'||s.id==='clock'){
     c.text(item.label,x,labelY,fit(c,item.label,labelSize,12,w,bold),DIM,bold);
     let size=s.id==='clock'?(h?44:50):(h?36:42);while(size>16&&c.textWidth(text,size,num)+uw+6>w)size--;
     c.text(text,x+w-(uw?uw+6:0),y+bh+(s.id==='clock'?6:0),size,WHITE,{font:'num',literal:true,align:'right'});if(uw)c.text(item.unit,x+w,y+bh,unitSize,DIM,{align:'right',literal:true});return;
    }
    // Value and unit share the label's line: shrink only a label that would collide.
    const vw=c.textWidth(text,numberSize,num);
    c.text(item.label,x,labelY,fit(c,item.label,labelSize,11,w-vw-uw-14,bold),DIM,bold);
    c.text(text,x+w-uw-5,labelY,numberSize,WHITE,{font:'num',literal:true,align:'right'});c.text(item.unit,x+w,labelY,unitSize,DIM,{align:'right',literal:true});
    const fraction=valid(item.value)?Math.max(0,Math.min(1,(item.value-item.minimum)/(item.maximum-item.minimum))):0;
    const scale=s.id==='outside'||s.id==='oil'?thermometer(c,item,gx,y,gw,bh,fraction):s.id==='gforce'?gforceGauge(c,item,gx,y,gw,bh,state):s.id==='batteryCharge'?batteryGauge(c,item,gx,y,gw,bh,fraction):barGauge(c,item,gx,y,gw,bh,fraction);
    [0,0.5,1].forEach(f=>{const px=scale.from+scale.span*f;c.line(px,y+bh+3,px,y+bh+6,1,DIM);c.text((s.id==='gforce'?(f-0.5)*4:item.minimum+(item.maximum-item.minimum)*f).toFixed(s.id==='gforce'?1:item.decimals),px,columns.bottom,scaleSize,DIM,{align:'center',font:'num',literal:true});});
   });
  });
 });
}
module.exports={drawAux,metric,valueY};
