'use strict';
// 1.3.107 (the user): the HUD's parts stay on the HUD and look right untouched.
//  - navigation, vehicle alerts and the door picture stop at the HUD's edge (800 x 480) however far moved or enlarged,
//    and the Position / size editor stores no move past it (the first press back moves it);
//  - the lead car in the lane picture is drawn to our own car's scale: right behind us a little smaller than ours,
//    smaller the further it is.
// Optional argument: a built stage, for the editor and the lane picture.
const assert=require('assert'),path=require('path'),D=require('../../apps/cluster_redline/display-config'),{settings}=require('../../apps/cluster_redline/policy');
const inside=(r,t)=>assert(r.x>=0&&r.y>=0&&r.x+r.w<=800&&r.y+r.h<=480,t+' on the HUD: '+JSON.stringify(r));
for(const [x,y] of [[-1000,-1000],[1000,1000],[1000,-1000],[-1000,1000]]){
 const cfg=settings({hudNavOffsetX:x,hudNavOffsetY:y,hudTextOffsetX:x,hudTextOffsetY:y,hudLanesOffsetX:x,hudLanesOffsetY:y,hudThenOffsetX:x,hudThenOffsetY:y,hudCarAlertOffsetX:x,hudCarAlertOffsetY:y,hudDoorOffsetX:x,hudDoorOffsetY:y,navUniformScale:200,hudCarAlertScale:200,hudDoorScale:200});
 D.NAV_LAYOUT_PARTS.forEach(p=>inside(D.navRect(cfg,p.key),p.key));inside(D.doorRect(cfg),'door');
}
{const c=settings({});assert.deepStrictEqual(D.navRect(c,'Direction'),D.onHud(D.navRect(c,'Direction')),'the defaults unchanged');}
if(process.argv[2]){
 const dir=path.join(path.resolve(process.argv[2]),'source/javascript');
 const {SettingsPage}=require(path.join(dir,'settings-ui')),spec=require(path.join(dir,'kit/app-spec.json'));
 const vals={};spec.settings.forEach(x=>{vals[x.key]=x.default;});
 const page=new SettingsPage({schema:spec.settings,get:k=>vals[k],set:(k,v)=>{vals[k]=v;},onChange(){}},()=>{},'test');
 page.selectTab(3);page.focus=page.keys().indexOf('layout');page.activate();
 const i=page.layoutParts().findIndex(p=>p.key==='CarAlert');page.selectLayoutPart(i,true);
 for(let n=0;n<80;n++)page.adjust(0,-1);
 const atEdge=vals.hudCarAlertOffsetX,r=D.navRect(page.config(),'CarAlert');assert.strictEqual(r.x,0,'held at the left edge');
 assert(atEdge>-1000,'no move past the edge stored: '+atEdge);
 page.adjust(0,1);assert(D.navRect(page.config(),'CarAlert').x>0,'the first press back moves it');
 page.back();
 // the lane picture's lead car
 const LL=require(path.join(dir,'lane-lines'));
 const lane={left:{y:1.6,type:'dashed',color:'white',margin:0.65},right:{y:-1.6,type:'solid',color:'white',margin:0.65},levels:{left:'ok',right:'ok'}};
 // our car: 1.9 m at 0.66 seen from CAR_D; a 1.85 m car right behind us (gap 0) a little narrower, then smaller each metre
 const own=1.9*454/(-1.6+20)*0.66,w=g=>LL.vehW(1.85,-1.6+4.7+g);
 assert(w(0)<own&&w(0)>own*0.75,'right behind us a little smaller than ours: '+w(0).toFixed(1)+' / '+own.toFixed(1));
 assert(w(1)<w(0)&&w(5)<w(1)&&w(25)<w(5),'smaller the further it is');
 [1,5,12,25].forEach(g=>{const im=LL.draw(Object.assign({},lane,{lead:{gap:g,closing:0,level:'ok',type:3}}),112,84);assert(im&&im.w===112,'draws at '+g+' m');});
}
console.log('PASS: HUD navigation / vehicle alerts / door stay on the HUD, no stored overshoot, the lead car to our car\'s scale');
