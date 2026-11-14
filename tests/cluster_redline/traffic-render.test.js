'use strict';
const assert=require('assert'),path=require('path'),fs=require('fs');
const root=path.join(path.resolve(process.argv[2]),'source/javascript');
const HUD=require(root+'/hud-compose'),{Canvas}=require(root+'/kit/canvas'),{settings}=require(root+'/policy'),{SettingsPage}=require(root+'/settings-ui'),spec=require(root+'/kit/app-spec.json');
const values={},store={schema:spec.settings,get:k=>values[k],set:(k,v)=>{values[k]=v;}};spec.settings.forEach(s=>values[s.key]=s.default);
const page=new SettingsPage(store,null,'1.2.53');page.selectTab(1);page.activate(5);page.choose(3);
assert.equal(values.hudTrafficMode,'both');assert.equal(page.config().hudTrafficMode,'both');
const cv=page.draw(new Canvas(1600,520));cv.targets.forEach(t=>assert(t.y+t.h<=520));
const base={rpm:3500,gear:'D4',shift:false,flash:false,torqueNm:200,powerPS:100,torquePeak:300,powerPeak:180,aux:{},mode:'COMFORT',renderRpm:true,config:settings({allHudOutput:'redline',hudTrafficMode:'both'}),traffic:{visible:true,limit:30,children:true,over:true}};
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
}
console.log('PASS traffic HUD settings, bounds, stable cache keys and expired-alert pixel removal');
