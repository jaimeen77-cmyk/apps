'use strict';
// My picture layout: your own GIFs (stop / drive / reverse) read from <data>/my-pictures/ and shown in the Car
// layout's place. The GIF decoder against known patterns, the limits, the scenes from gear and speed held against
// noise, the fallback to the layout's own picture, the folder looked at again, drawing on the cluster and HUD,
// the settings status and the PC tool's check. MY_PICTURE_PREVIEW=<dir> writes PNGs.
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path'),{spawnSync}=require('child_process');
const root=path.join(path.resolve(process.argv[2]),'source/javascript'),repo=path.resolve(__dirname,'../..'),fx=path.join(__dirname,'fixtures');
const {Canvas}=require(root+'/kit/canvas'),GIF=require(root+'/gif-decode'),MP=require(root+'/my-picture'),RL=require(root+'/redline-hud'),D=require(root+'/display-config'),{settings}=require(root+'/policy');
const {draw,W,H}=require(root+'/draw'),{demand}=require(root+'/data-demand');

// the decoder: every pixel of a known pattern (index = (x + 3y + 5f) % 7), its delays, transparency, the limits
{const g=GIF.decode(fs.readFileSync(path.join(fx,'pattern-64x36.gif')));assert.deepStrictEqual([g.w,g.h,g.frames.length],[64,36,4]);
 let bad=0;g.frames.forEach((fr,f)=>{for(let y=0;y<g.h;y++)for(let x=0;x<g.w;x++)if(fr.px[y*g.w+x]!==(x+3*y+5*f)%7)bad++;});assert.strictEqual(bad,0,'every pixel of every frame');
 assert(g.frames.every(fr=>fr.delay===100),'a 50 ms delay plays at 100 ms (10 a second at most)');
 assert.deepStrictEqual(Array.from(g.colours.slice(3,6)),[255,0,0]);assert.deepStrictEqual(GIF.probe(fs.readFileSync(path.join(fx,'pattern-64x36.gif'))),{w:64,h:36,frames:4});}
{const t=GIF.decode(fs.readFileSync(path.join(fx,'pattern-transparent.gif')));let clear=0,six=0;t.frames[0].px.forEach(v=>{if(v===GIF.CLEAR)clear++;if(v===6)six++;});assert(clear>0&&six===0,'the transparent colour is clear');assert.strictEqual(t.frames[0].delay,100,'no delay: 100 ms');}
assert.throws(()=>GIF.decode(fs.readFileSync(path.join(fx,'too-big-401x225.gif')),MP.LIMIT),e=>e.code==='too_big');
assert.throws(()=>GIF.decode(Buffer.from('PNG not a gif')),e=>e.code==='not_gif');
assert.throws(()=>GIF.decode(fs.readFileSync(path.join(fx,'pattern-64x36.gif')).slice(0,200)),e=>e.code==='broken'||e.code==='no_frames');
{const g=GIF.decode(fs.readFileSync(path.join(fx,'pattern-64x36.gif')),{maxFrames:2});assert.strictEqual(g.frames.length,2,'frames past the limit are left out');}
assert.deepStrictEqual(MP.LIMIT,{maxW:400,maxH:225,maxFrames:20,maxBytes:1024*1024});

// the scenes: reverse, standing still (under 1 km/h, or P without a speed), otherwise moving forward
assert.strictEqual(MP.want('R',30),'reverse');assert.strictEqual(MP.want('D',0.4),'stop');assert.strictEqual(MP.want('D',40),'drive');assert.strictEqual(MP.want('P',null),'stop');assert.strictEqual(MP.want('D',null),'drive');assert.strictEqual(MP.want('P',12),'drive','a known speed wins over P');
MP.reset();assert.strictEqual(MP.pick('c','D',40,0),'drive');assert.strictEqual(MP.pick('c','D',0,1000),'drive','a new scene waits 300 ms');assert.strictEqual(MP.pick('c','D',0,1350),'stop');assert.strictEqual(MP.pick('c','R',0,1360),'reverse','reverse at once');

// the folder: made at start, read again when a file changes; a missing or unusable GIF falls back
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'mypic-')),dir=path.join(tmp,'my-pictures');MP.setDir(tmp);assert(fs.existsSync(dir),'my-pictures/ made');
MP.scan(0,true);assert.deepStrictEqual(MP.status().map(s=>[s.name,s.ok,s.error]),[['stop',false,'missing'],['drive',false,'missing'],['reverse',false,'missing']]);
assert.deepStrictEqual(MP.frameAt('stop','cluster',0),{state:'stop',mirror:false,i:0,set:'cluster'},'no GIF: the layout\'s own standing-still picture');
assert.strictEqual(MP.frameAt('drive','cluster',0).state,'cruise');assert.strictEqual(MP.frameAt('reverse','hud',0).set,'hud');
fs.copyFileSync(path.join(fx,'pattern-64x36.gif'),path.join(dir,'drive.gif'));fs.copyFileSync(path.join(fx,'too-big-401x225.gif'),path.join(dir,'reverse.gif'));fs.writeFileSync(path.join(dir,'stop.gif'),Buffer.alloc(MP.LIMIT.maxBytes+1));
MP.scan(1000);assert.strictEqual(MP.status()[1].ok,false,'not looked at again before 5 s');
MP.scan(6000);const st=MP.status();assert.deepStrictEqual(st.map(s=>[s.name,s.ok,s.error]),[['stop',false,'too_large'],['drive',true,null],['reverse',false,'too_big']]);assert.deepStrictEqual([st[1].w,st[1].h,st[1].frames],[64,36,4]);
// your GIF's frames follow its delays (100 ms each here), looping
{const f0=MP.frameAt('drive','cluster',0),f1=MP.frameAt('drive','cluster',150),f3=MP.frameAt('drive','cluster',390),f4=MP.frameAt('drive','cluster',420);
 assert.deepStrictEqual([f0.mine,f0.i,f1.i,f3.i,f4.i],['drive',0,1,3,0]);assert(f0.sig,'the file\'s signature, so a new copy repaints');}
assert.strictEqual(MP.frameAt('reverse','cluster',0).state,'reverse','too big: the own picture');

// the layout: on the cluster and the HUD, the Car layout's elements, G read only for its small G meter
assert(RL.stylesFor('cluster').includes('mypic')&&RL.stylesFor('hud').includes('mypic'));assert.strictEqual(RL.NAMES.mypic,'My picture');
const cfg=o=>settings(Object.assign({clusterDesign:'rl-mypic',clusterAuxConfig:JSON.stringify({mode:'values',items:['power','gforce','boost','torque']})},o||{}));
assert.deepStrictEqual(RL.elements(cfg(),'cluster').map(e=>e.id),RL.elements(cfg({clusterDesign:'rl-car'}),'cluster').map(e=>e.id),'the Car layout\'s elements');
assert.deepStrictEqual(D.carMeterFaces(cfg()),['cluster']);assert.strictEqual(settings({hudDesign:'rl-mypic'}).hudDesign,'rl-mypic');
{const on=Object.assign(cfg({clusterAuxConfig:JSON.stringify({mode:'values',items:['boost']})}),{appEnabled:true,allClusterOutput:'redline'});assert(demand(on,'SPORT').aux.has('gforce'),'the small G meter');assert(!demand(Object.assign({},on,{clusterRlGMeterHidden:true}),'SPORT').aux.has('gforce'),'no G meter: no G');}
// drawn on the cluster: your GIF in the picture's place (letterboxed, fitted), the own picture without one
const base={renderRpm:true,rpm:3000,gear:'D3',shift:false,flash:false,torqueNm:300,powerPS:200,mode:'SPORT'};
const s=(car,o)=>Object.assign({},base,{config:cfg(o),aux:{gLat:0,gLong:0,gforce:0,boost:0.5,car:{cluster:car}}});
const face={x:0,y:0,w:W,h:H},pic=RL.placed(s(null),RL.rect(s(null).config,face,'cluster'),'cluster',face).find(e=>e.id==='carpic').r;
// (the test pattern is strongly coloured everywhere; the own night picture hardly at all)
const red=(im,r)=>{let n=0;for(let y=r.y;y<r.y+r.h;y++)for(let x=r.x;x<r.x+r.w;x++){const i=(y*im.w+x)*4;if(im.d[i+3]>200&&Math.max(im.d[i],im.d[i+1],im.d[i+2])-Math.min(im.d[i],im.d[i+1],im.d[i+2])>90)n++;}return n;};
const mine=draw(s(MP.frameAt('drive','cluster',0))),own=draw(s(MP.frameAt('stop','cluster',0)));
assert(red(mine,pic)>pic.w*pic.h*0.05,'your GIF\'s colours show');assert(red(own,pic)<red(mine,pic)/3,'the own picture is not your GIF');
assert.notStrictEqual(RL.keys(s(MP.frameAt('drive','cluster',0)),'cluster')('carpic'),RL.keys(s(MP.frameAt('drive','cluster',150)),'cluster')('carpic'),'the next GIF frame repaints');
// the settings preview (no worker frame): the scene the gear shows, first frame
assert.strictEqual(RL.frame(Object.assign({},base,{gear:'D3',config:cfg(),aux:{}}),0,'cluster').car.mine,'drive');
assert.strictEqual(RL.frame(Object.assign({},base,{gear:'P',config:cfg(),aux:{}}),0,'cluster').car.state,'stop','P: standing still (its GIF too large: the own picture)');
if(process.env.MY_PICTURE_PREVIEW){const out=path.resolve(process.env.MY_PICTURE_PREVIEW);fs.mkdirSync(out,{recursive:true});[['mine',mine],['own',own]].forEach(([n,im])=>{const p=new Canvas(im.w,im.h);p.clear('#05070b');p.blit(im,0,0);fs.writeFileSync(path.join(out,'mypic-'+n+'.png'),p.png());});}

// the PC tool: checks the three names and their limits; copies nothing without --car
{const src=fs.mkdtempSync(path.join(os.tmpdir(),'mypic-src-'));fs.copyFileSync(path.join(fx,'pattern-64x36.gif'),path.join(src,'drive.gif'));
 let r=spawnSync(process.execPath,[path.join(repo,'tools/my-pictures.js'),'--source',src],{encoding:'utf8'});
 assert.strictEqual(r.status,0,r.stdout+r.stderr);assert(/OK  drive\.gif .*64 x 36, 4 frames/.test(r.stdout)&&/--  stop\.gif/.test(r.stdout)&&/not 16:9|All good/.test(r.stdout),r.stdout);
 fs.copyFileSync(path.join(fx,'too-big-401x225.gif'),path.join(src,'reverse.gif'));
 r=spawnSync(process.execPath,[path.join(repo,'tools/my-pictures.js'),'--source',src],{encoding:'utf8'});assert.strictEqual(r.status,1);assert(/NO  reverse\.gif .*larger than 400 x 225/.test(r.stdout),r.stdout);
 r=spawnSync(process.execPath,[path.join(repo,'tools/my-pictures.js'),'--source',src,'--car','not-an-ip','--key','x'],{encoding:'utf8'});assert.notStrictEqual(r.status,0);}
console.log('PASS: My picture layout: GIF decoder (pixels, delays, transparency, limits), stop / drive / reverse from gear and speed held 300 ms, folder read again on change, fallback to the own picture, drawn letterboxed on the cluster, repaint per GIF frame, settings preview and the PC tool\'s check');
