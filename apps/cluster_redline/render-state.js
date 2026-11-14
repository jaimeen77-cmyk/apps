'use strict';
const D=require('./display-config'),{gauges}=require('./units'),{alertState}=require('./shift-alert');
function alertKey(s){const a=alertState(s);return [a.lit,a.stage,a.stage==='red'?!!s.flash:false];}
function auxiliary(s,d,side){
 const cfg=s.config,a=D.auxConfig(cfg[d+'AuxConfig']),g=gauges(s),values=s.aux||{};
 if(a.mode==='off')return ['off'];
 return [a.mode,D.metricSlots(a.items).filter(v=>v.side===side).map(v=>{
  const id=v.id;return [id,v.row,v.rows,id==='torque'||id==='power'?g[id]:id==='gforce'?[values.gforce,values.gLat]:values[id]];
 })];
}
function partKey(s,d,name,sub){
 const c=s.config,style=c[d+'AlertStyle'];let value=[];
 if(name==='RpmGauge')value=[c.maxRpm,c.redlineRpm,sub==='track'||sub==='ticks'?null:s.rpm];
 else if(name==='RpmValue')value=[Math.round(s.rpm/10)*10,!!s.shift];
 else if(name==='Alert')value=[c[d+'AlertHidden']?null:alertKey(s)];
 else if(name==='Gear')value=[s.gear,d==='hud'&&style==='circle'&&!c.hudAlertHidden?alertKey(s):null];
 else if(name==='AuxLeft'||name==='AuxRight')value=[auxiliary(s,d,name==='AuxLeft'?0:1),d==='hud'?c.hudAuxTextOffsetY:0];
 else value=[!!c[d+name+'Hidden'],!!c[d+name+'LineHidden']];
 return JSON.stringify([style,name,sub||'',value]);
}
function navKey(s,part){
 const c=s.config,n=s.navigation,on=D.navAllowed(c,s.mode)&&n&&n.visible,p=D.NAV_PARTS.find(p=>p.key===part);
 if(!on||c[p.prefix+'Hidden']||part!=='Lanes'&&n.maneuverVisible===false)return null;
 if(part==='Direction')return [n.kind,n.branchType,n.maneuver,n.exitNumber,n.distanceText,c.navColor];
 if(part==='Text')return n.description?[n.description]:null;
 const lanes=n.lanes;return lanes&&lanes.visible?[c.navColor,lanes.lanes]:null;
}
function key(s,d){
 const c=s.config,face=s.renderRpm!==false,values=[];
 if(face){
  const config={};Object.keys(c).sort().forEach(k=>{if(k.indexOf(d)===0&&!(d==='hud'&&/^hud(?:Nav|Text|Lanes|Navigation)/.test(k)))config[k]=c[k];});
  values.push(config);
  D.partsFor(d,c).forEach(p=>{if(!c[d+p.key+'Hidden'])values.push(partKey(s,d,p.key));});
  if(c[d+'Design']&&c[d+'Design']!=='own')values.push(['redline',require('./redline-hud').key(s,d)]);
 }
 if(d==='hud')D.NAV_PARTS.forEach(p=>{const n=navKey(s,p.key);if(n)values.push([p.key,n,D.navRect(c,p.key)]);});
 return JSON.stringify(values);
}
module.exports={key,partKey,navKey,auxiliary};
