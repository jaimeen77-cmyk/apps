'use strict';
// The driver greeting on the HUD (driver-greeting.js): one overlay layer of its own, above whatever the HUD shows,
// in the upper half of the part of the HUD the driver sees (iDrive 7: x 120..605, y 100..378, from car photos, as
// appsKOR's Redline measures it), for three seconds; the Redline HUD face steps aside meanwhile (outputs.js), so the
// words do not sit on the gauges. Drawn once per greeting; hidden, kept for the next one.
const W=440,H=64,X=(800-W)/2,Y=140;
function text(name){const {tr,language}=require('./strings'),ko=language()==='ko';
 return name?(ko?name+'님 '+tr('Hello'):tr('Hello')+', '+name):tr('Hello');}
function draw(name){
 const {Canvas}=require('./kit/canvas');require('./crisp-text');
 const cv=new Canvas(W,H);cv.clear([0,0,0,0]);const t=text(name);let size=36;
 while(size>18&&cv.textWidth(t,size,{font:'bold',literal:true})>W-24)size--;
 cv.text(t,W/2,H/2+size*0.36,size,'#f4f7fb',{font:'bold',align:'center',literal:true});
 cv.fillRect(W/2-60,H-6,120,3,'#37c6ff');
 return cv;
}
class GreetingOverlay{
 constructor(client){this.client=client;this.ref=0;this.key=null;this.visible=false;}
 tick(value){
  if(!value){this.hide();return false;}
  if(!this.ref){this.ref=this.client.image({target:'hud',klass:'overlay',z:13,x:X,y:Y,w:W,h:H,iw:W,ih:H,visible:false});if(!this.ref)return false;}
  const key=value.name||'';
  if(this.key!==key){const cv=draw(value.name);this.client.pixels(this.ref,null,Buffer.from(cv.d.buffer,cv.d.byteOffset,cv.d.byteLength));this.key=key;}
  if(!this.visible){this.client.set(this.ref,{visible:true});this.visible=true;}
  return true;
 }
 hide(){if(this.ref&&this.visible){this.client.set(this.ref,{visible:false});this.visible=false;}}
 close(){if(this.ref)this.client.drop(this.ref);this.ref=0;this.key=null;this.visible=false;}
}
module.exports={GreetingOverlay,text,draw,W,H,X,Y};
