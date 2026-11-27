'use strict';
// The Car layout (cluster only): a big car picture (car-meter.js) in the middle doing what the car does, an rpm bar
// under it, gear, rpm, a small G meter and up to four readouts. The state the G and gear pick, held against noise;
// the frames; the layout on the cluster; repaint keys; faster G reads. CAR_METER_PREVIEW=<dir> writes PNGs.
const assert=require('assert'),fs=require('fs'),path=require('path'),root=path.join(path.resolve(process.argv[2]),'source/javascript');
const {Canvas}=require(root+'/kit/canvas'),CM=require(root+'/car-meter'),RL=require(root+'/redline-hud'),D=require(root+'/display-config'),{settings}=require(root+'/policy');
const {draw,W,H}=require(root+'/draw'),K=require(root+'/render-state'),{SOURCES}=require(root+'/aux-info'),{demand}=require(root+'/data-demand');

// the state from G and gear
assert.strictEqual(CM.want({lat:0,long:0},'D'),'cruise');
assert.strictEqual(CM.want({lat:0,long:0.2},'D'),'accel');
assert.strictEqual(CM.want({lat:0,long:-0.3},'D'),'brake');
assert.strictEqual(CM.want({lat:0.4,long:0},'D'),'left3','lateral G positive to the left');
assert.strictEqual(CM.want({lat:0.09,long:0},'D'),'cruise');assert.strictEqual(CM.want({lat:0.12,long:0},'D'),'left1','step 1 from 0.10 G');assert.strictEqual(CM.want({lat:-0.27,long:0},'D'),'right2','step 2 from 0.25 G');assert.strictEqual(CM.want({lat:-0.36,long:0},'D'),'right3','step 3 from 0.35 G');assert.strictEqual(CM.want({lat:0.49,long:0},'D'),'left3');assert.strictEqual(CM.want({lat:0.5,long:0},'D'),'left4','step 4 (the drift) from 0.50 G');assert.strictEqual(CM.want({lat:-0.7,long:0},'D'),'right4');
assert.deepStrictEqual(CM.look('left2'),{state:'turn2_left',mirror:false},'a left bend has its own pictures');assert.deepStrictEqual(CM.look('right3'),{state:'turn3_left',mirror:true});assert.deepStrictEqual(CM.look('left4'),{state:'drift',mirror:false},'the drift picture is a left bend');assert.deepStrictEqual(CM.look('right4'),{state:'drift',mirror:true},'a right drift is it mirrored');assert.deepStrictEqual(CM.look('brake'),{state:'brake',mirror:false});
assert.strictEqual(CM.want({lat:-0.4,long:0.3},'D'),'right3','cornering wins over accelerating');
assert.strictEqual(CM.want({lat:0.25,long:-0.6},'D'),'brake','braking further past its threshold than cornering');
assert.strictEqual(CM.want({lat:0.5,long:-0.2},'D'),'left4');
assert.strictEqual(CM.want({lat:0.5,long:-0.5},'R'),'reverse','reverse gear whatever the G');
assert.strictEqual(CM.want({lat:null,long:undefined},'D'),'cruise','no G: straight on');
// standing still: under 1 km/h, or in P when the speed is not known; reverse first
assert.strictEqual(CM.want({lat:0,long:0},'D',0),'stop');assert.strictEqual(CM.want({lat:0,long:-0.3},'D',0.5),'stop','stopped wins over the last braking G');assert.strictEqual(CM.want({lat:0,long:0},'D',30),'cruise');
assert.strictEqual(CM.want({lat:0,long:0},'P'),'stop','P with no speed');assert.strictEqual(CM.want({lat:0,long:0},'D'),'cruise','no speed in D: driving');assert.strictEqual(CM.want({lat:0,long:0},'P',20),'cruise','a known speed wins over P');assert.strictEqual(CM.want({},'R',0),'reverse');

// held against noise: one sample does not switch; a lasting one does after the hold; reverse at once
CM.reset();
assert.strictEqual(CM.pick('cluster',{lat:0,long:0},'D',0),'cruise');
assert.strictEqual(CM.pick('cluster',{lat:0,long:-0.4},'D',1000),'cruise','a new state waits to be confirmed');
assert.strictEqual(CM.pick('cluster',{lat:0,long:0},'D',1100),'cruise','the blip is forgotten');
assert.strictEqual(CM.pick('cluster',{lat:0,long:-0.4},'D',2000),'cruise');
assert.strictEqual(CM.pick('cluster',{lat:0,long:-0.4},'D',2200),'brake','confirmed after 150 ms');
assert.strictEqual(CM.pick('cluster',{lat:0.5,long:0},'D',2250),'brake');
assert.strictEqual(CM.pick('cluster',{lat:0.5,long:0},'D',2450),'brake','the shown state lasts 400 ms');
assert.strictEqual(CM.pick('cluster',{lat:0.5,long:0},'D',2650),'left4');
assert.strictEqual(CM.pick('cluster',{lat:0,long:0},'R',2660),'reverse','reverse straight away');
assert.strictEqual(CM.pick('hud',{lat:0,long:0},'D',2660),'cruise','each display on its own');
const fr=CM.frameOf('cluster',{lat:0,long:0},'R',2700);assert.deepStrictEqual([fr.state,fr.mirror],['reverse',false]);
assert.notStrictEqual(CM.frameOf('cluster',{},'R',2700).i,CM.frameOf('cluster',{},'R',2800).i,'the frames move on at 10 a second');
{CM.reset();CM.pick('x',{lat:0.5},'D',0);CM.pick('x',{lat:0.5},'D',1000);const f=CM.frameOf('x',{lat:0.5},'D',1000);assert.deepStrictEqual([f.state,f.mirror],['drift',false],'a left drift: the drift picture');}
{CM.reset();CM.pick('y',{lat:0.3},'D',0);CM.pick('y',{lat:0.3},'D',1000);const f=CM.frameOf('y',{lat:0.3},'D',1000);assert.deepStrictEqual([f.state,f.mirror],['turn2_left',false],'a left bend: its own pictures, not the right one mirrored');}
const STATES=['stop','cruise','accel','brake','reverse','turn1_left','turn2_left','turn3_left','drift'];
{const F=CM.frames();STATES.forEach(s=>assert.strictEqual(F.states[s].length,F.W*F.H*F.N,s));assert.strictEqual(F.pal.length,768);}

// the layout: on the cluster and the HUD, with its own elements
assert(RL.STYLES.includes('car')&&RL.stylesFor('cluster').includes('car')&&RL.stylesFor('hud').includes('car'),'on both displays');
assert.strictEqual(settings({clusterDesign:'rl-car'}).clusterDesign,'rl-car');assert.strictEqual(settings({hudDesign:'rl-car'}).hudDesign,'rl-car');
assert.deepStrictEqual(D.carMeterFaces(settings({clusterDesign:'rl-car',hudDesign:'rl-car'})),['cluster','hud']);
{const F=CM.frames('hud');STATES.forEach(s=>assert.strictEqual(F.states[s].length,F.W*F.H*F.N,'HUD '+s));assert.strictEqual(CM.frameOf('hud',{},'D',0).set,'hud');assert.strictEqual(CM.frameOf('cluster',{},'D',0).set,'cluster');}
const cfgOf=(o)=>settings(Object.assign({clusterDesign:'rl-car',clusterAuxConfig:JSON.stringify({mode:'values',items:['power','gforce','boost','torque']})},o||{}));
assert.deepStrictEqual(RL.elements(cfgOf(),'cluster').map(e=>e.id),['carpic','gauge','gear','mode','rpm','gmeter','readA','readB','readC','readD','mark']);
assert.deepStrictEqual(D.carMeterFaces(cfgOf()),['cluster'],'only where it is chosen');
assert.deepStrictEqual(D.carMeterFaces(cfgOf({clusterRlCarPicHidden:true})),[],'the picture hidden: nothing to follow');
assert.deepStrictEqual(D.carMeterFaces(settings({clusterDesign:'rl-rings'})),[]);
assert(D.partsFor('cluster',cfgOf()).some(p=>p.key==='RlCarPic'&&p.label==='Car picture'),'Position / size lists the picture');
assert(require(root+'/settings-ui').favKeys([]).includes('clusterRlCarPicOffsetX'),'favourites and driver settings keep its place');
// the G is read (five times a second) while the picture shows
SOURCES.filter(s=>/AccelerationMassCenter$/.test(s.field)).forEach(s=>assert.strictEqual(s.carPollMs,200));
assert(demand(Object.assign(cfgOf({clusterAuxConfig:JSON.stringify({mode:'values',items:['boost']})}),{appEnabled:true,allClusterOutput:'redline'}),'SPORT').aux.has('gforce'),'G read for the picture whatever the readouts');

// on the cluster
const base={renderRpm:true,rpm:5200,gear:'D4',shift:false,flash:false,torqueNm:380,powerPS:260,mode:'SPORT'};
const st=(aux,o)=>Object.assign({},base,{config:cfgOf(o),aux:Object.assign({gLat:0.1,gLong:0.05,gforce:0.11,boost:0.8},aux||{})});
const face={x:0,y:0,w:W,h:H},layout=s=>RL.rect(s.config,face,'cluster');
const el=(s,id)=>{const r=RL.placed(s,layout(s),'cluster',face).find(e=>e.id===id);assert(r,id+' is placed');return r.r;};
const diff=(a,b,r)=>{let n=0;for(let y=r.y;y<r.y+r.h;y++)for(let x=r.x;x<r.x+r.w;x++){const i=(y*a.w+x)*4;if(Math.abs(a.d[i]-b.d[i])+Math.abs(a.d[i+1]-b.d[i+1])+Math.abs(a.d[i+2]-b.d[i+2])>30)n++;}return n;};
const lit=(im,r)=>{let n=0;for(let y=r.y;y<r.y+r.h;y++)for(let x=r.x;x<r.x+r.w;x++)if(im.d[(y*im.w+x)*4+3])n++;return n;};
const car=(s,i,m)=>({car:{cluster:{state:s,mirror:!!m,i:i||0}}});
const cruise0=draw(st(car('cruise'))),pic=el(st(),'carpic');
assert(pic.w>W*0.35,'the car is the big middle picture');
assert(lit(cruise0,pic)>pic.w*pic.h*0.7,'the picture fills its place');
{const g=el(st(),'gear'),r=el(st(),'readA'),m=el(st(),'gmeter');assert(g.x+g.w<=pic.x+4,'gear on the left');assert(r.y>=pic.y+pic.h*0.8&&m.y>=pic.y+pic.h*0.8,'readouts and G meter along the bottom');}
assert(diff(cruise0,draw(st(car('cruise',3))),pic)>100,'the road moves frame by frame');
{const s0=draw(st(car('stop',0))),s3=draw(st(car('stop',3)));assert(diff(s0,s3,pic)<diff(cruise0,draw(st(car('cruise',3))),pic)/3,'standing still: the road does not move');assert(diff(s0,cruise0,pic)>50,'the stopped picture is its own');}
const right=draw(st(car('turn3_left',0,true))),left=draw(st(car('turn3_left')));
assert(diff(right,left,pic)>pic.w*pic.h*0.1,'left and right differ');
{const bad=draw(st(car('turn3')));assert(diff(bad,cruise0,pic)<pic.w*pic.h*0.02,'an unknown state (the right-bend sets before 1.3.94): the straight-on picture, no crash');}
// 1.3.94: cornering steps 1-3 are the owner's pictures (nose turned 10, 20, 30 degrees into a left bend), each its own,
// none the straight-on picture; a right bend's step is the left one mirrored
{const L=[1,2,3].map((k)=>draw(st(car('turn'+k+'_left'))));
 L.forEach((im,i)=>{assert(diff(cruise0,im,pic)>pic.w*pic.h*0.1,'step '+(i+1)+' is not the straight-on picture');L.forEach((o,j)=>{if(j>i)assert(diff(im,o,pic)>pic.w*pic.h*0.05,'steps '+(i+1)+' and '+(j+1)+' differ');});});
 const dl=L[1],dr=draw(st(car('turn2_left',0,true)));let same=0,n=0;const y=pic.y+Math.floor(pic.h*0.5);
 for(let x=pic.x+Math.floor(pic.w*0.2);x<pic.x+pic.w*0.8;x++){const xm=2*pic.x+pic.w-1-x,a=(y*dl.w+x)*4,b=(y*dr.w+xm)*4;n++;if(Math.abs(dl.d[a]-dr.d[b])<40)same++;}
 assert(same>n*0.8,'a right bend is the left one mirrored');}
{const dl=draw(st(car('drift'))),dr=draw(st(car('drift',0,true)));
 let same=0,n=0;const y=pic.y+Math.floor(pic.h*0.45);for(let x=pic.x+Math.floor(pic.w*0.2);x<pic.x+pic.w*0.8;x++){const xm=2*pic.x+pic.w-1-x,a=(y*dl.w+x)*4,b=(y*dr.w+xm)*4;n++;if(Math.abs(dl.d[a]-dr.d[b])<40)same++;}assert(same>n*0.8,'a right drift is the left one mirrored');
 assert(diff(dl,right,pic)>pic.w*pic.h*0.2,'the drift is its own picture');}
assert(diff(cruise0,draw(st(car('brake'))),pic)>200,'braking lights the brake lamps');
assert.notStrictEqual(K.key(st(car('cruise',0)),'cluster'),K.key(st(car('cruise',1)),'cluster'),'a new frame repaints');
{const keys=RL.keys(st(car('cruise',0)),'cluster'),keys2=RL.keys(st(car('cruise',1)),'cluster');assert.notStrictEqual(keys('carpic'),keys2('carpic'));assert.strictEqual(keys('gear'),keys2('gear'),'only the picture tile repaints');}
// a change fades: for 300 ms the old picture (still moving) under the new one fading in, in six steps
{CM.reset();const G0={lat:0,long:0},GB={lat:0,long:-0.4};
 let f=CM.frameOf('fade',G0,'D',0,30);assert(!f.from,'no fade at the start');
 CM.frameOf('fade',GB,'D',1000,30);f=CM.frameOf('fade',GB,'D',1200,30);assert.strictEqual(f.state,'brake');assert.deepStrictEqual([f.from.state,f.t],['cruise',1/6],'just changed: mostly the old picture');
 f=CM.frameOf('fade',GB,'D',1350,30);assert(f.from&&f.t===0.5,'half way');assert.strictEqual(f.from.i,f.i,'the old picture keeps moving');
 f=CM.frameOf('fade',GB,'D',1499,30);assert(f.from&&f.t===5/6);
 f=CM.frameOf('fade',GB,'D',1500,30);assert(!f.from&&f.t===undefined,'done after 300 ms');
 f=CM.frameOf('fade',{lat:-0.5,long:0},'D',2000,30);f=CM.frameOf('fade',{lat:-0.5,long:0},'D',2200,30);assert.deepStrictEqual([f.state,f.mirror,f.from.state],['drift',true,'brake']);
 f=CM.frameOf('fade',{lat:0.5,long:0},'D',2800,30);f=CM.frameOf('fade',{lat:0.5,long:0},'D',3000,30);assert.deepStrictEqual([f.state,f.mirror,f.from.state,f.from.mirror],['drift',false,'drift',true],'a right drift to a left one fades too');
 // drawn: between the two pictures, and each step repaints
 const half=draw(st({car:{cluster:{state:'brake',mirror:false,i:0,set:'cluster',from:{state:'turn3_left',mirror:true,i:0,set:'cluster'},t:0.5}}})),A=draw(st(car('turn3_left',0,true))),B=draw(st(car('brake')));
 assert(diff(half,A,pic)>200&&diff(half,B,pic)>200,'a mix of both');
 const k1=RL.keys(st({car:{cluster:{state:'brake',i:0,set:'cluster',from:{state:'turn3_left',i:0,set:'cluster'},t:0.5}}}),'cluster')('carpic'),k2=RL.keys(st({car:{cluster:{state:'brake',i:0,set:'cluster',from:{state:'turn3_left',i:0,set:'cluster'},t:4/6}}}),'cluster')('carpic');assert.notStrictEqual(k1,k2,'each fade step repaints');
 if(process.env.CAR_METER_PREVIEW){const p=new Canvas(half.w,half.h);p.clear('#05070b');p.blit(half,0,0);fs.writeFileSync(path.join(path.resolve(process.env.CAR_METER_PREVIEW),'fade-half.png'),p.png());}}
// the drive mode colours it: Sport red (neon frame, rpm bar, the word SPORT), Comfort blue, Eco sky blue
{const red=(im,r)=>{let n=0;for(let y=r.y;y<r.y+r.h;y++)for(let x=r.x;x<r.x+r.w;x++){const i=(y*im.w+x)*4;if(im.d[i+3]&&im.d[i]>150&&im.d[i+1]<90&&im.d[i+2]<90)n++;}return n;};
 const blue=(im,r)=>{let n=0;for(let y=r.y;y<r.y+r.h;y++)for(let x=r.x;x<r.x+r.w;x++){const i=(y*im.w+x)*4;if(im.d[i+3]&&im.d[i+2]>150&&im.d[i]<120)n++;}return n;};
 const sport=draw(Object.assign(st(car('cruise')),{mode:'SPORT'})),comfort=draw(Object.assign(st(car('cruise')),{mode:'COMFORT'})),eco=draw(Object.assign(st(car('cruise')),{mode:'ECO_PRO'}));
 const g=el(st(),'gauge'),m=el(st(),'mode'),all={x:0,y:0,w:W,h:H};
 assert(red(sport,g)>red(comfort,g)+40,'Sport: a red rpm bar');assert(blue(comfort,all)>blue(sport,all)+40,'Comfort: blue');assert(blue(eco,all)>40,'Eco: sky blue');
 assert(red(sport,all)>red(comfort,all)+200,'Sport: the neon frame and the word');assert(diff(sport,comfort,m)>20,'the drive mode spelt out');
 assert.notStrictEqual(RL.keys(Object.assign(st(),{mode:'SPORT'}),'cluster')('carpic'),RL.keys(Object.assign(st(),{mode:'COMFORT'}),'cluster')('carpic'),'the frame repaints with the mode');}
// on the HUD: the HUD's pictures (the car alone, its black see-through), no frame round it
const HUDC=require(root+'/hud-compose'),hst=(aux,mode)=>Object.assign({},base,{mode:mode||'SPORT',config:settings({hudDesign:'rl-car',hudAuxConfig:JSON.stringify({mode:'values',items:['power','gforce']})}),aux:Object.assign({gLat:0.1,gLong:0.05,gforce:0.11},aux||{})});
{const hf=require(root+'/layout').placement(hst().config,'hud',require(root+'/hud-draw')),lay=RL.rect(hst().config,hf,'hud'),hp=RL.placed(hst(),lay,'hud',hf).find(e=>e.id==='carpic');assert(hp,'the picture is placed on the HUD');const r=hp.r;
 const im=HUDC.draw(hst({car:{hud:{state:'cruise',mirror:false,i:0,set:'hud'}}}));
 let clear=0,on=0;for(let y=r.y;y<r.y+r.h;y++)for(let x=r.x;x<r.x+r.w;x++){const a=im.d[(y*im.w+x)*4+3];if(!a)clear++;else on++;}
 assert(on>r.w*r.h*0.05,'the car shows');assert(clear>r.w*r.h*0.3,'its black ground is clear on the glass (no road, no frame)');
 if(process.env.CAR_METER_PREVIEW){const out=path.resolve(process.env.CAR_METER_PREVIEW);fs.mkdirSync(out,{recursive:true});
  ['cruise','accel','brake','turn1_left','turn3_left','drift'].forEach(s=>{const h=HUDC.draw(hst({car:{hud:{state:s,mirror:false,i:2,set:'hud'}}})),p=new Canvas(h.w,h.h);p.clear('#2a3440');p.blit(h,0,0);fs.writeFileSync(path.join(out,'hud-'+s+'.png'),p.png());});}}
// without the worker's frame (settings preview): the state the G shows now
assert.deepStrictEqual(RL.frame(st({gLat:0,gLong:-0.5}),0,'cluster').car,{state:'brake',mirror:false,i:0,set:'cluster'});
assert.strictEqual(RL.frame(hst({gLat:0,gLong:0}),0,'hud').car.set,'hud');
assert.strictEqual(RL.frame(Object.assign(st(),{config:settings({clusterDesign:'rl-rings'})}),0,'cluster').car,null,'other layouts: no picture');
// the rings layout's G meter is unchanged (still the dot)
{const rings=Object.assign(st(),{config:settings({clusterDesign:'rl-rings'})});assert(RL.elements(rings.config,'cluster').some(e=>e.id==='gmeter'));}

if(process.env.CAR_METER_PREVIEW){const out=path.resolve(process.env.CAR_METER_PREVIEW);fs.mkdirSync(out,{recursive:true});
 [['stop',false],['cruise',false],['accel',false],['brake',false],['reverse',false],['turn1_left',true],['turn2_left',true],['turn3_left',true],['turn3_left',false],['drift',false],['drift',true]].forEach(([s,m])=>{const im=draw(st(car(s,2,m))),p=new Canvas(im.w,im.h);p.clear('#05070b');p.blit(im,0,0);
  fs.writeFileSync(path.join(out,'layout-'+s+(m?'-left':'')+'.png'),p.png());});
 ['SPORT','COMFORT','ECO_PRO'].forEach(mode=>{const im=draw(Object.assign(st(car('turn3_left',2)),{mode})),p=new Canvas(im.w,im.h);p.clear('#05070b');p.blit(im,0,0);fs.writeFileSync(path.join(out,'mode-'+mode.toLowerCase()+'.png'),p.png());});}
// the settings screen's layout picker on the car records for the GPU renderer: the picture goes as a pixel image
// (the recorder's blit takes only cached layers: 'Recorder.blit: not a layer', 1.3.49 merge)
{const rec=require(root+'/kit/record'),CM=require(root+'/car-meter'),r=new rec.Recorder(1600,520);
 assert.doesNotThrow(()=>CM.draw(r,{state:'cruise',mirror:false,i:0,set:'cluster'},40,40,320,180));
 assert(r.images.size===1,'the picture as one pixel image');const id=[...r.images][0],im=rec.imageById.get(id);assert(im&&im.w>0&&im.h>0&&im.data.length===im.w*im.h*4);}
console.log('PASS: Car layout: big car picture following the G and gear (held against noise, reverse at once, 10 frames a second, each side with its own bends, four cornering steps, a right drift the left one mirrored), rpm bar, gear, rpm, small G meter and readouts on the cluster; drive mode colours; on the HUD the car alone, its black clear; repaint keys; Position / size; faster G reads');
