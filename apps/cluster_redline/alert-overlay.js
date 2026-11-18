'use strict';
// Vehicle alerts on the HUD: one overlay layer of their own, above whatever the HUD shows (stock or Redline HUD),
// like the turn signal overlay. Placed and sized by the NAV tab's Position / size (display-config ALERT_PART).
// Pixels are sent only when what is shown changes (a new alert, a distance step); between alerts the layer is
// hidden, kept for the next one.
const D=require('./display-config');
class AlertOverlay{
 constructor(client){this.client=client;this.layer=null;this.state={shown:false};}
 // value: VehicleAlerts.read() (or the preview sample), null for nothing.
 tick(cfg,value){
  if(!value||cfg.hudCarAlertHidden&&!value.preview){this.hide();this.state={shown:false};return this.state;}
  const draw=require('./alert-draw'),r=D.navRect(cfg,'CarAlert'),key=draw.key(value)+'|'+r.w+'x'+r.h;
  let l=this.layer;
  if(l&&(l.w!==r.w||l.h!==r.h)){this.client.drop(l.ref);l=this.layer=null;}
  if(!l){
   const ref=this.client.image({target:'hud',klass:'overlay',z:11,x:r.x,y:r.y,w:r.w,h:r.h,iw:r.w,ih:r.h,visible:false});
   if(!ref)return this.state;
   l=this.layer={ref,x:r.x,y:r.y,w:r.w,h:r.h,key:null,visible:false};
  }
  if(l.key!==key){const im=draw.drawSized(value,r.w,r.h),px=Buffer.alloc(r.w*r.h*4);
   // drawSized may round one pixel short: copy row by row into the layer's exact size
   for(let y=0;y<Math.min(r.h,im.h);y++)Buffer.from(im.d.buffer,im.d.byteOffset+y*im.w*4,Math.min(r.w,im.w)*4).copy(px,y*r.w*4);
   this.client.pixels(l.ref,null,px);l.key=key;}
  if(l.x!==r.x||l.y!==r.y){this.client.set(l.ref,{x:r.x,y:r.y});l.x=r.x;l.y=r.y;}
  if(!l.visible){this.client.set(l.ref,{visible:true});l.visible=true;}
  this.state={shown:true,speeding:!!value.speeding,school:!!value.school,camera:!!value.camera};return this.state;
 }
 hide(){const l=this.layer;if(l&&l.visible){this.client.set(l.ref,{visible:false});l.visible=false;}}
 close(){if(this.layer)this.client.drop(this.layer.ref);this.layer=null;}
 status(){return this.state;}
}
module.exports={AlertOverlay};
