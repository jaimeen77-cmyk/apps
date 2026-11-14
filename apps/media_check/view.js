'use strict';
const {t}=require('./kit/i18n');
const W=1280,H=480;
function tr(v){return t(v);}
function draw(cv,m){
 const targets=[];cv.clear('#0a101a');cv.fillRect(0,0,W,65,'#142238');
 cv.text('Media Check',28,43,34,'#f6f8fc',{font:'bold'});cv.text('0.1.0',W-28,40,22,'#8ba4bd',{align:'right'});
 const pages=['Environment','Display test','Browser test'];
 pages.forEach((name,i)=>{const r={x:28+i*408,y:78,w:390,h:44};cv.roundRect(r.x,r.y,r.w,r.h,6,i===m.page?'#245a86':'#192635');cv.text(name,r.x+r.w/2,r.y+30,24,'#fff',{align:'center'});targets.push(Object.assign(r,{id:'page'+i,action:'page',value:i}));});
 const line=(label,value,row)=>{cv.text(label,32,162+row*37,22,'#8ba4bd');let v=String(value||'—');while(v.length>2&&cv.textWidth(v,23,{literal:true})>875)v=v.slice(0,-2);cv.text(v,365,162+row*37,23,'#f3f7fc',{literal:true});};
 if(m.page===0){
  line(tr('CPU / Node'),m.caps.arch+' / '+m.caps.node,0);
  line(tr('System library'),m.caps.glibc||tr('Checking'),1);
  line(tr('GPU device presence'),m.caps.gpu.join(', ')||tr('Not found'),2);
  line(tr('Display environment'),tr(m.caps.display),3);
  line(tr('Browser executable'),m.caps.browser||tr('Not installed'),4);
  line(tr('App RSS / JS heap'),m.memory,5);
 }else if(m.page===1){
  const colors=['#fff','#ffeb00','#00ffff','#00e041','#f000ff','#ff3030','#184bff'];
  colors.forEach((c,i)=>cv.fillRect(34+i*173,143,173,85,c));
  cv.gradientRect(34,242,1211,50,[[0,'#000'],[1,'#fff']]);
  const x=60+((m.now%6000)/6000)*1140;cv.line(34,330,1245,330,2,'#31516b');cv.circle(x,330,14,'#6de2ff');
  cv.text('Check bars, gradient, motion and touch targets.',34,380,23,'#c5deef');
 }else{
  line(tr('Native USB playback'),tr('Separate from browser playback'),0);
  line(tr('Browser executable'),m.caps.browser||tr('Not installed'),1);
  line(tr('Test state'),tr(m.state.phase),2);
  line(tr('Result'),tr(m.state.detail)||tr('No test run'),3);
  cv.text('Local test: touch, WebGL, H.264/AAC and quiet tone.',34,317,23,'#b2d0e6');
  cv.text('A running process is not proof of picture or sound.',34,355,23,'#ffcb7b');
 }
 const parked=m.parked?tr('Stationary speed confirmed'):tr('No fresh stationary speed · browser blocked');
 if(m.page!==1)cv.text(parked,32,390,22,m.parked?'#7ce0b5':'#ffcb7b',{literal:true});
 const actions=[['Refresh','refresh'],['Local browser test','local'],['YouTube test','youtube'],['STOP','stop']];
 actions.forEach(([label,action],i)=>{const r={x:28+i*310,y:412,w:292,h:52};cv.roundRect(r.x,r.y,r.w,r.h,7,action==='stop'?'#8a2434':'#234765');let size=23;while(size>16&&cv.textWidth(tr(label),size)>r.w-16)size--;cv.text(label,r.x+r.w/2,r.y+34,size,'#fff',{align:'center',font:'bold'});targets.push(Object.assign(r,{id:action,action}));});
 cv.targets=targets;return cv;
}
module.exports={draw,W,H};
