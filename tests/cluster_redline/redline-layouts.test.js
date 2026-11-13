'use strict';
// Redline app HUD layouts (appsKOR apps/redline, MIT) as Cluster Redline HUD designs.
const assert=require('assert'),path=require('path'),root=path.join(path.resolve(process.argv[2]),'source/javascript');
const {Canvas}=require(root+'/kit/canvas'),{getLanguage,t}=require(root+'/kit/i18n'),spec=require(root+'/kit/app-spec.json');
const RL=require(root+'/redline-hud'),HUD=require(root+'/hud-compose'),D=require(root+'/display-config'),K=require(root+'/render-state'),{settings}=require(root+'/policy'),{placement}=require(root+'/layout'),face=require(root+'/hud-draw');
const {SettingsPage}=require(root+'/settings-ui');
const alpha=(im,x0,y0,x1,y1)=>{let n=0;for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)if(im.d[(y*im.w+x)*4+3])n++;return n;};
assert.strictEqual(RL.STYLES.length,18,'Redline app layouts and Cluster Redline\'s own');
assert.deepStrictEqual(RL.CLUSTER_ONLY,['sportdial','classic','tyres']);assert.deepStrictEqual(RL.GAUGE_LAYOUTS,['standard','digital','vfd','vector','ramp','shift','logger','ribbon','hexagon','classic','sporthud','sportdial','tyres']);assert.strictEqual(RL.stylesFor('hud').length,15,'the HUD offers 15');assert.deepStrictEqual(RL.HUD_ONLY,['sporthud']);assert(!RL.stylesFor('cluster').includes('sporthud'));assert.strictEqual(settings({clusterDesign:'rl-sporthud'}).clusterDesign,'own');assert.strictEqual(settings({hudDesign:'rl-sporthud'}).hudDesign,'rl-sporthud');assert.strictEqual(settings({hudDesign:'rl-classic'}).hudDesign,'own','cluster-only on the HUD: back to the default design');assert.strictEqual(settings({clusterDesign:'rl-classic'}).clusterDesign,'rl-classic');assert(!RL.STYLES.includes('minimal')&&!RL.STYLES.includes('wings'));assert.strictEqual(settings({hudDesign:'rl-minimal',clusterDesign:'rl-wings'}).hudDesign,'own','a removed layout falls back to the own design');
assert.strictEqual(settings({}).hudDesign,'own');assert.strictEqual(settings({hudDesign:'rl-fivedial',clusterDesign:'rl-fivedial'}).clusterDesign,'own','a removed layout falls back to the own design');assert.strictEqual(settings({hudDesign:'rl-nope'}).hudDesign,'own');
assert.deepStrictEqual(RL.gearOf('M3'),{gear:3,stage:'D',mode:'M'});assert.deepStrictEqual(RL.gearOf('P'),{gear:0,stage:'P',mode:null});assert.strictEqual(RL.gearOf('--').gear,null);
const base={renderRpm:true,rpm:5900,gear:'M3',shift:false,flash:false,torqueNm:380,powerPS:260,mode:'SPORT',aux:{boost:1.05,oil:96,outside:18,clock:'23:00'}};
const own=HUD.draw(Object.assign({},base,{config:settings({})}));
const images={};
for(const st of RL.stylesFor('hud')){
 const cfg=settings({hudDesign:'rl-'+st,hudAuxConfig:JSON.stringify({mode:'gauges',items:['boost','clock']})}),state=Object.assign({},base,{config:cfg});
 const hf=placement(cfg,'hud',face),r=RL.rect(cfg,hf,'hud'),sa=RL.safe(hf,'hud');
 if(RL.heightOf(st)===RL.IH)assert.deepStrictEqual([r.w,r.h],[400,RL.IH],'400 × 130 at the default HUD size');
 else assert(r.w<=400&&r.w>=320&&Math.abs(r.h/r.w-RL.heightOf(st)/400)<0.01,st+': a taller layout keeps its shape, shrunk only to stay in the HUD');
 {const u=RL.extent(cfg,'hud'),k=r.w/RL.IW;const down=((RL.HUD_BASE[st]||{}).y||0)*hf.h/240;assert(r.x+u.x0*k>=sa.x-1&&r.y+u.y0*k>=sa.y-1&&r.x+u.x1*k<=sa.x+sa.w+1&&r.y+u.y1*k<=sa.y+sa.h+down+1,st+' starts in the default design area, lowered by its tuned default');}
 const direct=HUD.draw(state),cached=HUD.draw(Object.assign({},state,{renderCache:HUD.createCache()}));
 assert(alpha(direct,r.x,r.y,r.x+r.w,r.y+r.h)>800,st+' draws its layout');
 if(!((RL.HUD_BASE[st]||{}).read))assert.strictEqual(alpha(direct,0,0,800,480),alpha(direct,r.x,r.y,r.x+r.w,r.y+r.h),st+' draws nothing outside its rectangle (no RPM face)');
 {let diff=0;for(let i=3;i<direct.d.length;i+=4)if((direct.d[i]>0)!==(cached.d[i]>0)||Math.abs(direct.d[i]-cached.d[i])>8)diff++;assert(diff<=direct.w*direct.h*0.001,st+': cached and direct paths agree ('+diff+' px)');}
 assert(!Buffer.from(direct.d).equals(Buffer.from(own.d)));images[st]=Buffer.from(direct.d);
 // rpm, gear and the shift flash change the picture and its cache key
 const hi=Object.assign({},state,{rpm:6900,shift:true,flash:true});assert.notStrictEqual(K.key(hi,'hud'),K.key(state,'hud'));
 assert(!Buffer.from(HUD.draw(hi).d).equals(images[st]));
 assert.strictEqual(alpha(HUD.draw(Object.assign({},state,{config:settings({hudDesign:'rl-'+st,hudRpmGaugeHidden:true})})),0,0,800,480),0,'hidden RPM gauge hides the layout');
}
assert.strictEqual(new Set(Object.values(images).map(b=>b.toString('base64'))).size,RL.stylesFor('hud').length,'every layout distinct');
// Position / size moves and scales the layout through the RPM gauge part.
const moved=settings({hudDesign:'rl-standard',hudRpmGaugeOffsetX:40,hudRpmGaugeOffsetY:20,hudRpmGaugeWidthScale:150}),r0=RL.rect(settings({hudDesign:'rl-standard'}),placement(settings({}),'hud',face)),r1=RL.rect(moved,placement(moved,'hud',face));
{const f=placement(moved,'hud',face),u=RL.extent(moved,'hud'),k=r1.w/RL.IW;assert(r1.w>r0.w&&r1.x!==r0.x,'larger and moved');assert(r1.y+u.y1*k<=480+1&&r1.x+u.x1*k<=800+1,'but kept on the HUD picture');}
assert.deepStrictEqual(D.partsFor('hud',settings({hudDesign:'rl-arc'})).map(p=>p.key),['RpmGauge','RlGear','RlMode','RlAlert','RlGauge','RlReadA','RlReadB','RlMark'],'Whole layout, then each element (default readouts: two) and the M mark');
// Navigation and lanes stay alongside a layout.
const nav={visible:true,maneuverVisible:true,kind:'intersection',maneuver:'RIGHT',distanceText:'300 m',description:'강남대로',lanes:{visible:true,lanes:[{directions:['STRAIGHT_ON'],other:[],highlighted:true}]}};
const withNav=HUD.draw(Object.assign({},base,{config:settings({hudDesign:'rl-dial'}),navigation:nav}));assert(alpha(withNav,0,250,800,480)>500);
// Readouts follow the selected auxiliary items (clock only in gauges mode).
assert.deepStrictEqual(RL.readouts(Object.assign({},base,{config:settings({hudAuxConfig:JSON.stringify({mode:'gauges',items:['boost','clock']})})})).map(r=>r.value),['1.05','23:00']);
assert.deepStrictEqual(RL.readouts(Object.assign({},base,{config:settings({hudAuxConfig:JSON.stringify({mode:'off',items:['boost']})})})),[]);
// Settings: Design -> Redline app layouts -> pick; Cluster Redline designs switch back; screens are Korean.
const values={};spec.settings.forEach(s=>{values[s.key]=s.default;});
const page=new SettingsPage({schema:spec.settings,get:k=>values[k],set:(k,v)=>{values[k]=v;},setMany(c){Object.assign(values,c);}},null,'1.2.5');
const english=[];const draw=()=>{const cv=new Canvas(1600,520),text=cv.text;cv.text=function(v,x,y,z,c,o){const shown=o&&o.literal?String(v):t(v);if(/[A-Za-z]{4,}/.test(shown.replace(/\b(HUD|RPM|Redline|appsKOR|MIT|VFD|M3|M4|M5|F80|G80|E60)\b/g,'')))english.push(shown);return text.apply(this,arguments);};page.draw(cv);};
page.selectTab(1);page.activate(page.keys().indexOf('design'));draw();page.choose(2);assert.strictEqual(page.open,'rlDesign');draw();
page.choose(RL.stylesFor('hud').indexOf('arc'));assert.strictEqual(values.hudDesign,'rl-arc');assert(/F80/.test(page.value(page.item(),page.config())));
page.activate(page.keys().indexOf('layout'));assert.deepStrictEqual(page.layoutParts().map(p=>p.key),['RpmGauge','RlGear','RlMode','RlAlert','RlGauge','RlReadA','RlReadB','RlMark']);draw();page.back();
page.activate(page.keys().indexOf('design'));page.choose(1);assert.strictEqual(values.hudDesign,'own');assert.strictEqual(values.hudAlertStyle,'circle');
page.selectTab(2);page.activate(page.keys().indexOf('design'));assert.strictEqual(page.open,'design');page.choose(2);assert.strictEqual(page.open,'rlDesign','the cluster offers the Redline layouts too');draw();page.choose(RL.STYLES.indexOf('ramp'));assert.strictEqual(values.clusterDesign,'rl-ramp');assert.strictEqual(values.hudDesign,'own','HUD and cluster designs are separate');
page.activate(page.keys().indexOf('design'));page.choose(0);assert.strictEqual(values.clusterDesign,'own');assert.strictEqual(values.clusterAlertStyle,'bar');
if(getLanguage()==='ko')assert.deepStrictEqual(english,[],'untranslated labels');
console.log('PASS: nine Redline app layouts (HUD, and cluster picker) drawn 1:1 at HUD size with live rpm/gear/shift, aux readouts, navigation alongside, Position / size, settings picker');
