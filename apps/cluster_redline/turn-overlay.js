'use strict';
// HUD turn signal arrows as two small overlay layers of their own, the way Cluster Info (appscluster_fork) shows
// them: an overlay sits above whatever the HUD shows, the stock HUD included. They used to be drawn into the
// Redline HUD image, a content layer that gives way to the stock HUD, so with the stock HUD selected (or before the
// Redline HUD held the slot) the arrows never appeared.
//
// Each side is drawn and sent once (again only when its shape, colour, size or <<< >>> step changes); a flash only
// switches its opacity (a few bytes, no pixels). The layers stay visible at opacity 0 between flashes and go
// HIDE_MS after the signal ends, so a tap-blink does not flicker.
const D=require('./display-config');
const HIDE_MS=1200,SIDES=['left','right'];
class TurnOverlay{
 constructor(client){this.client=client;this.layers={left:null,right:null};this.shown=false;this.offSince=null;this.state={want:false,sides:[]};}
 // cfg: effective settings; turn: TurnSignal.read() ({indicator, lit, step}); preview: a turn part in Position / size.
 tick(now,cfg,turn,preview){
  const t=turn||{},dir=t.indicator||'off',enabled=cfg.hudTurnSignals==='on'&&!cfg.hudTurnHidden;
  const active=preview||(enabled&&dir!=='off');
  if(active)this.offSince=null;else if(this.shown&&this.offSince===null)this.offSince=now;
  const want=active||(this.shown&&this.offSince!==null&&now-this.offSince<=HIDE_MS);
  if(!want){this.hide();this.state={want:false,sides:[]};return this.state;}
  const lit=preview?SIDES:D.turnSides(cfg,active?dir:'off',!!t.lit,false),count=D.turnCount(cfg,t.step,!!preview);
  SIDES.forEach(side=>{
   const r=D.turnRect(cfg,side),key=[cfg.hudTurnStyle,cfg.hudTurnColor,r.w,r.h,count].join('|');
   let l=this.layers[side];
   if(l&&(l.w!==r.w||l.h!==r.h)){this.client.drop(l.ref);l=this.layers[side]=null;}
   if(!l){
    const ref=this.client.image({target:'hud',klass:'overlay',z:12,x:r.x,y:r.y,w:r.w,h:r.h,iw:r.w,ih:r.h,visible:false,opacity:0});
    if(!ref)return;
    l=this.layers[side]={ref,x:r.x,y:r.y,w:r.w,h:r.h,key:null,opacity:0,visible:false};
   }
   if(l.key!==key){const p=require('./turn-draw').painter(r.w,r.h,side,cfg.hudTurnStyle,cfg.hudTurnColor,count).draw(),px=p.d;
    this.client.pixels(l.ref,null,Buffer.from(px.buffer,px.byteOffset,px.byteLength));l.key=key;}
   if(l.x!==r.x||l.y!==r.y){this.client.set(l.ref,{x:r.x,y:r.y});l.x=r.x;l.y=r.y;}
   const opacity=lit.includes(side)?1:0;
   if(!l.visible){this.client.set(l.ref,{visible:true,opacity});l.visible=true;l.opacity=opacity;}
   else if(l.opacity!==opacity){this.client.set(l.ref,{opacity});l.opacity=opacity;}
  });
  this.shown=true;this.state={want:true,sides:lit,count};return this.state;
 }
 hide(){SIDES.forEach(side=>{const l=this.layers[side];if(l&&l.visible){this.client.set(l.ref,{visible:false,opacity:0});l.visible=false;l.opacity=0;}});this.shown=false;this.offSince=null;}
 close(){SIDES.forEach(side=>{const l=this.layers[side];if(l)this.client.drop(l.ref);this.layers[side]=null;});this.shown=false;}
 status(){return Object.assign({layers:SIDES.filter(s=>this.layers[s]).length},this.state);}
}
module.exports={TurnOverlay,HIDE_MS};
