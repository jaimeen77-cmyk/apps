'use strict';
const assert=require('assert'),path=require('path'),fs=require('fs');
const root=path.join(path.resolve(process.argv[2]),'source/javascript');
const HUD=require(root+'/hud-compose'),{Canvas}=require(root+'/kit/canvas'),{settings}=require(root+'/policy'),{SettingsPage}=require(root+'/settings-ui'),spec=require(root+'/kit/app-spec.json');
const values={},store={schema:spec.settings,get:k=>values[k],set:(k,v)=>{values[k]=v;}};spec.settings.forEach(s=>values[s.key]=s.default);
const page=new SettingsPage(store,null,spec.version);page.selectTab(1);page.activate(5);page.choose(3);
assert.equal(values.hudTrafficMode,'both');assert.equal(page.config().hudTrafficMode,'both');
values.allHudOutput='redline';
const cv=page.draw(new Canvas(1600,520));cv.targets.forEach(t=>assert(t.y+t.h<=520));
const base={rpm:3500,gear:'D4',shift:false,flash:false,torqueNm:200,powerPS:100,torquePeak:300,powerPeak:180,aux:{},mode:'COMFORT',renderRpm:true,config:settings({allHudOutput:'redline',hudTrafficMode:'both'}),traffic:{visible:true,limit:30,children:true,over:true}};
const trafficPainter=require(root+'/traffic-draw'),text=Canvas.prototype.text;
try{
 Canvas.prototype.text=function(value,x,y,size,color,opts){
  const width=this.textWidth(value,size,opts),left=opts&&opts.align==='center'?x-width/2:x;
  assert(left>=0&&left+width<=this.w,'traffic caption clipped: '+value);
  return text.apply(this,arguments);
 };
 for(const limit of [null,30,50])trafficPainter.draw({traffic:{visible:true,limit,children:true,over:limit!==null}});
}finally{Canvas.prototype.text=text;}
const scene=HUD.createCache();
const image=HUD.draw(Object.assign({},base,{renderCache:scene}));
const key=HUD.key(base),before=scene.stats().paints;
base.traffic.speed=48;assert.equal(HUD.key(base),key);HUD.draw(Object.assign({},base,{renderCache:scene}));assert.equal(scene.stats().paints,before,'undrawn speed metadata does not repaint');
base.traffic={visible:false,limit:null,children:false,over:false};
const cleared=HUD.draw(Object.assign({},base,{renderCache:scene})),fresh=HUD.draw(Object.assign({},base,{renderCache:HUD.createCache()}));
assert(Buffer.from(cleared.d).equals(Buffer.from(fresh.d)),'expired traffic erases old alert pixels');
if(process.argv[3]){
 fs.mkdirSync(process.argv[3],{recursive:true});
 base.traffic={visible:true,limit:30,children:true,over:true};const face=HUD.draw(base),black=new Canvas(800,480);black.clear('#05070b');black.blit(face,0,0);
 fs.writeFileSync(path.join(process.argv[3],'hud-traffic.png'),black.png());
 fs.writeFileSync(path.join(process.argv[3],'settings-traffic.png'),cv.png());
 page.activate(5);fs.writeFileSync(path.join(process.argv[3],'settings-traffic-options.png'),page.draw(new Canvas(1600,520)).png());
 for(const [name,v] of [['speed',{visible:true,limit:30,children:false,over:false}],['overspeed',{visible:true,limit:30,children:false,over:true}],['children',{visible:true,limit:null,children:true,over:false}]]){
  base.traffic=v;const im=new Canvas(800,480);im.clear('#05070b');im.blit(HUD.draw(base),0,0);fs.writeFileSync(path.join(process.argv[3],'hud-traffic-'+name+'.png'),im.png());
 }
}
console.log('PASS traffic HUD settings, bounds, stable cache keys and expired-alert pixel removal');
