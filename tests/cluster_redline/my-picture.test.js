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
MP.scan(0,true);assert.deepStrictEqual(MP.status().map(s=>[s.name,s.ok,s.error]),[['stop',false,'missing'],['drive',false,'missing'],['reverse',false,'missing'],['left',false,'missing'],['right',false,'missing']]);
assert.deepStrictEqual(MP.frameAt('stop','cluster',0),{state:'stop',mirror:false,i:0,set:'cluster'},'no GIF: the layout\'s own standing-still picture');
assert.strictEqual(MP.frameAt('drive','cluster',0).state,'cruise');assert.strictEqual(MP.frameAt('reverse','hud',0).set,'hud');
fs.copyFileSync(path.join(fx,'pattern-64x36.gif'),path.join(dir,'drive.gif'));fs.copyFileSync(path.join(fx,'too-big-401x225.gif'),path.join(dir,'reverse.gif'));fs.writeFileSync(path.join(dir,'stop.gif'),Buffer.alloc(MP.LIMIT.maxBytes+1));
MP.scan(1000);assert.strictEqual(MP.status()[1].ok,false,'not looked at again before 5 s');
MP.scan(6000);const st=MP.status();assert.deepStrictEqual(st.map(s=>[s.name,s.ok,s.error]),[['stop',false,'too_large'],['drive',true,null],['reverse',false,'too_big'],['left',false,'missing'],['right',false,'missing']]);assert.deepStrictEqual([st[1].w,st[1].h,st[1].frames],[64,36,4]);
// your GIF's frames follow its delays (100 ms each here), looping
{const f0=MP.frameAt('drive','cluster',0),f1=MP.frameAt('drive','cluster',150),f3=MP.frameAt('drive','cluster',390),f4=MP.frameAt('drive','cluster',420);
 assert.deepStrictEqual([f0.mine,f0.i,f1.i,f3.i,f4.i],['drive',0,1,3,0]);assert(f0.sig,'the file\'s signature, so a new copy repaints');}
assert.strictEqual(MP.frameAt('reverse','cluster',0).mine,'drive','no usable reverse GIF: the drive GIF (1.3.51)');assert.deepStrictEqual(MP.status().map(s=>s.uses),['drive','drive','drive','drive','drive']);

// the layout (My design, 1.3.50): on the cluster only, the Car layout's elements, G read only for its small G meter
// (1.3.55: My design is the Animation layout's GIFs; the old design id reads as the Animation layout)
assert(!RL.stylesFor('cluster').includes('mypic')&&RL.stylesFor('cluster').includes('car'),'one Animation layout');assert.strictEqual(RL.NAMES.car,'Animation');assert.strictEqual(settings({clusterDesign:'rl-mypic'}).clusterDesign,'rl-car','My design: now the Animation layout');
const cfg=o=>settings(Object.assign({clusterDesign:'rl-car',clusterAuxConfig:JSON.stringify({mode:'values',items:['power','gforce','boost','torque']})},o||{}));
assert.deepStrictEqual(RL.elements(cfg(),'cluster').map(e=>e.id),RL.elements(cfg({clusterDesign:'rl-car'}),'cluster').map(e=>e.id),'the Car layout\'s elements');
assert.deepStrictEqual(D.carMeterFaces(cfg()),['cluster']);assert.strictEqual(settings({hudDesign:'rl-mypic'}).hudDesign,'own','not on the HUD');
{const on=Object.assign(cfg({clusterAuxConfig:JSON.stringify({mode:'values',items:['boost']})}),{appEnabled:true,allClusterOutput:'redline'});assert(demand(on,'SPORT').aux.has('gforce'),'the small G meter');assert(demand(Object.assign({},on,{clusterRlGMeterHidden:true}),'SPORT').aux.has('gforce'),'the turn scenes read the G (1.3.52)');assert(!demand(Object.assign({},on,{clusterRlGMeterHidden:true,clusterRlCarPicHidden:true}),'SPORT').aux.has('gforce'),'no G meter, no picture: no G');}
// drawn on the cluster: your GIF in the picture's place (letterboxed, fitted), the own picture without one
const base={renderRpm:true,rpm:3000,gear:'D3',shift:false,flash:false,torqueNm:300,powerPS:200,mode:'SPORT'};
const s=(car,o)=>Object.assign({},base,{config:cfg(o),aux:{gLat:0,gLong:0,gforce:0,boost:0.5,car:{cluster:car}}});
const face={x:0,y:0,w:W,h:H},pic=RL.placed(s(null),RL.rect(s(null).config,face,'cluster'),'cluster',face).find(e=>e.id==='carpic').r;
// (the test pattern is strongly coloured everywhere; the own night picture hardly at all)
const red=(im,r)=>{let n=0;for(let y=r.y;y<r.y+r.h;y++)for(let x=r.x;x<r.x+r.w;x++){const i=(y*im.w+x)*4;if(im.d[i+3]>200&&Math.max(im.d[i],im.d[i+1],im.d[i+2])-Math.min(im.d[i],im.d[i+1],im.d[i+2])>90)n++;}return n;};
const mine=draw(s(MP.frameAt('drive','cluster',0))),own=draw(s({state:'stop',mirror:false,i:0,set:'cluster'}));
assert(red(mine,pic)>pic.w*pic.h*0.05,'your GIF\'s colours show');assert(red(own,pic)<red(mine,pic)/3,'the own picture is not your GIF');
// the layout picker on the car records for the GPU renderer: your GIF goes there as a pixel image
{const rec=require(path.join(root,'kit/record')),r=new rec.Recorder(1600,520);assert.doesNotThrow(()=>MP.draw(r,MP.frameAt('drive','cluster',0),10,10,320,180));assert.strictEqual(r.images.size,1);}
assert.notStrictEqual(RL.keys(s(MP.frameAt('drive','cluster',0)),'cluster')('carpic'),RL.keys(s(MP.frameAt('drive','cluster',150)),'cluster')('carpic'),'the next GIF frame repaints');
// the settings preview (no worker frame): the scene the gear shows, first frame
assert.strictEqual(RL.frame(Object.assign({},base,{gear:'D3',config:cfg(),aux:{}}),0,'cluster').car.mine,'drive');
assert.strictEqual(RL.frame(Object.assign({},base,{gear:'P',config:cfg(),aux:{}}),0,'cluster').car.mine,'drive','P: standing still (its GIF too large: the drive GIF)');
if(process.env.MY_PICTURE_PREVIEW){const out=path.resolve(process.env.MY_PICTURE_PREVIEW);fs.mkdirSync(out,{recursive:true});[['mine',mine],['own',own]].forEach(([n,im])=>{const p=new Canvas(im.w,im.h);p.clear('#05070b');p.blit(im,0,0);fs.writeFileSync(path.join(out,'mypic-'+n+'.png'),p.png());});}

// from the GIF player (1.3.50; fitted, drive required, 1.3.51): its share on 127.0.0.1 (gif_home redline-share.js)
// lists the GIFs; the chosen ones are fitted to the picture's box (320 x 180, at most 30 frames) and kept as .mpic;
// without a drive GIF nothing is fetched; no choice for a scene: its file removed (the drive GIF shows there)
(async()=>{
 const {RedlineShare}=require(path.join(repo,'apps/gif_home/redline-share')),MPS=require(path.join(repo,'apps/cluster_redline/my-picture-source')),MPR=require(path.join(repo,'apps/cluster_redline/my-picture'));
 const bytes={a:fs.readFileSync(path.join(fx,'pattern-64x36.gif')),c:fs.readFileSync(path.join(fx,'too-big-401x225.gif')),b:fs.readFileSync(path.join(fx,'big-640x360-60f.gif'))};
 const share=new RedlineShare({list:()=>[{id:'a',name:'A',bytes:bytes.a.length,width:64,height:36},{id:'c',name:'C',bytes:bytes.c.length,width:401,height:225},{id:'b',name:'B',bytes:bytes.b.length,width:640,height:360}],read:id=>bytes[id]}).start();
 await new Promise(r=>setTimeout(r,100));
 try{
  const files=await new Promise((res,rej)=>MPS.list((e,f)=>e?rej(e):res(f)));assert.deepStrictEqual(files.map(f=>f.id),['a','c','b']);
  assert.strictEqual(MPS.fits(files[1]),'ok','another size: fitted, not refused');assert(MPS.resized(files[2])&&!MPS.resized(files[0]));
  assert.strictEqual(MPS.fits({width:641,height:360}),'too_big','past the GIF player\'s own limits');assert.strictEqual(MPS.fits({bytes:7e6}),'too_large');
  const data=fs.mkdtempSync(path.join(os.tmpdir(),'mypic-fetch-'));fs.mkdirSync(path.join(data,'my-pictures'));fs.writeFileSync(path.join(data,'my-pictures','reverse.gif'),bytes.a);
  assert.deepStrictEqual(await new Promise(res=>MPS.fetchChosen(data,{stop:'a',drive:'',reverse:''},res)),{error:'need_drive'},'the drive GIF is required');
  const out=await new Promise(res=>MPS.fetchChosen(data,{stop:'c',drive:'b',reverse:''},res));
  assert.deepStrictEqual(out.drive,{ok:true,w:320,h:180,frames:30,source:{w:640,h:360,frames:60}},'640 x 360, 60 frames: 320 x 180, 30 frames');
  assert.deepStrictEqual([out.stop.w,out.stop.h],[320,180],'401 x 225: fitted (shape kept)');assert.deepStrictEqual(out.reverse,{none:true});
  assert(!fs.existsSync(path.join(data,'my-pictures','reverse.gif'))&&!fs.existsSync(path.join(data,'my-pictures','reverse.mpic')),'no choice: removed');
  // read back on the cluster: its frames last as long as before (the thinned ones add up their delays); reverse shows the drive GIF
  MPR.setDir(data);MPR.scan(0,true);const stt=MPR.status();assert.deepStrictEqual(stt.map(x=>[x.name,x.ok,x.uses]),[['stop',true,'stop'],['drive',true,'drive'],['reverse',false,'drive'],['left',false,'drive'],['right',false,'drive']]);
  const d=MPR.decodeFile(fs.readFileSync(path.join(data,'my-pictures','drive.mpic'))),g=GIF.decode(bytes.b,MPR.SOURCE);
  assert.strictEqual(d.frames.reduce((a,f)=>a+f.delay,0),g.frames.reduce((a,f)=>a+f.delay,0),'as long as the original');
  assert(fs.statSync(path.join(data,'my-pictures','drive.mpic')).size<200*1024,'kept compressed');
  // a change of scene fades over 400 ms; the drive GIF standing in for a scene does not fade
  MPR.reset();let f=MPR.frameOf('c','D',30,10000);assert.strictEqual(f.mine,'drive');assert(!f.from);
  f=MPR.frameOf('c','R',0,10100);assert.strictEqual(f.mine,'drive','reverse without its own GIF: the drive GIF');assert(!f.from,'the same GIF: no fade');
  MPR.frameOf('c','D',30,11000);f=MPR.frameOf('c','D',0,11000);f=MPR.frameOf('c','D',0,11400);assert.strictEqual(f.mine,'stop');assert.strictEqual(f.from&&f.from.mine,'drive','fading from the drive GIF');
  f=MPR.frameOf('c','D',0,11600);assert(f.t>0&&f.t<1,'part way');f=MPR.frameOf('c','D',0,11900);assert(!f.from,'done after 400 ms');
  {const {Canvas}=require(root+'/kit/canvas'),cv=new Canvas(320,180);MPR.reset();MPR.frameOf('c','D',30,20000);MPR.frameOf('c','D',0,21000);const mid=MPR.frameOf('c','D',0,21500);
   assert.doesNotThrow(()=>MPR.draw(cv,mid,0,0,320,180));assert(cv.d.some(v=>v>0),'the fade drawn');}
  // the turn scenes (1.3.52): sideways G past 0.12 (positive: left), out under 0.08, held 400 ms; a turn without its
  // own GIF shows the other turn's mirrored, then the drive GIF
  assert.strictEqual(MPR.want('D',40,{lat:0.2}),'left');assert.strictEqual(MPR.want('D',40,{lat:-0.2}),'right');assert.strictEqual(MPR.want('D',40,{lat:0.1}),'drive');
  assert.strictEqual(MPR.want('D',40,{lat:0.1},'left'),'left','a turn going stays through a wobble');assert.strictEqual(MPR.want('D',0,{lat:0.5}),'stop');assert.strictEqual(MPR.want('R',5,{lat:0.5}),'reverse');
  assert.deepStrictEqual(MPR.show('left'),{src:'drive',mirror:false},'no turn GIFs: the drive GIF');
  fs.copyFileSync(path.join(data,'my-pictures','stop.mpic'),path.join(data,'my-pictures','right.mpic'));MPR.scan(0,true);
  assert.deepStrictEqual(MPR.show('right'),{src:'right',mirror:false});assert.deepStrictEqual(MPR.show('left'),{src:'right',mirror:true},'left: the right turn mirrored');
  assert.deepStrictEqual(MPR.status().find(x=>x.name==='left'),Object.assign(MPR.status().find(x=>x.name==='left'),{uses:'right',mirrored:true}));
  MPR.reset();MPR.frameOf('c','D',40,30000,{lat:0});MPR.frameOf('c','D',40,31000,{lat:0.3});let tf=MPR.frameOf('c','D',40,31400,{lat:0.3});
  assert.strictEqual(tf.mine,'right');assert.strictEqual(tf.mirror,true,'drawn mirrored');assert.strictEqual(tf.from&&tf.from.mine,'drive','fading from driving');
  {const {Canvas}=require(root+'/kit/canvas'),a=new Canvas(320,180),b=new Canvas(320,180);MPR.draw(a,{mine:'right',i:0,set:'cluster'},0,0,320,180);MPR.draw(b,{mine:'right',i:0,set:'cluster',mirror:true},0,0,320,180);
   let same=true;for(let y=0;y<180&&same;y++)for(let x=0;x<320;x++){const p=(y*320+x)*4,q=(y*320+319-x)*4;if(Math.abs(a.d[p]-b.d[q])>2){same=false;break;}}assert(same,'mirrored left to right');}
  // a damaged copy: unreadable ('broken', also a cut one), the drive GIF or the Car picture stands in
  {const good=fs.readFileSync(path.join(data,'my-pictures','stop.mpic'));fs.writeFileSync(path.join(data,'my-pictures','stop.mpic'),good.slice(0,good.length-20));MPR.scan(0,true);
   assert.strictEqual(MPR.status()[0].error,'broken');assert.strictEqual(MPR.status()[0].uses,'drive');fs.writeFileSync(path.join(data,'my-pictures','stop.mpic'),good);MPR.scan(0,true);}
  // nothing chosen: every copy removed (back to the Car picture)
  {const tmpd=fs.mkdtempSync(path.join(os.tmpdir(),'mypic-clear-'));fs.mkdirSync(path.join(tmpd,'my-pictures'));['drive.mpic','left.mpic','stop.gif'].forEach(n=>fs.writeFileSync(path.join(tmpd,'my-pictures',n),'x'));
   assert.deepStrictEqual(await new Promise(res=>MPS.fetchChosen(tmpd,{},res)),{cleared:true});assert.strictEqual(fs.readdirSync(path.join(tmpd,'my-pictures')).length,0);MPR.setDir(data);MPR.scan(0,true);}
  // no GIF at all: the Car layout itself (1.3.54): its drifting car with the G, as car-meter.js draws it
  {const empty=fs.mkdtempSync(path.join(os.tmpdir(),'mypic-none-')),CMx=require(path.join(repo,'apps/cluster_redline/car-meter'));MPR.setDir(empty);MPR.scan(0,true);MPR.reset();CMx.reset();
   let cf=MPR.frameOf('c','D',40,50000,{lat:0,long:0});assert.strictEqual(cf.state,'cruise');assert(!cf.mine,'the Car picture');
   for(let t=50050;t<=51000;t+=50)cf=MPR.frameOf('c','D',40,t,{lat:-0.4,long:0});assert(/^turn/.test(cf.state),'cornering: the Car layout\'s drift ('+cf.state+')');
   cf=MPR.frameOf('c','R',3,51100,{lat:0,long:0});assert.strictEqual(cf.state,'reverse');MPR.setDir(data);MPR.scan(0,true);MPR.reset();}
  // the share answers only GET from this head unit, only listed GIFs
  const st=await new Promise(res=>require('http').get({host:'127.0.0.1',port:18884,path:'/gif?id=../library.json'},r=>{r.resume();res(r.statusCode);}));assert.strictEqual(st,404);
 }finally{share.stop();}
 // GIF player not running: told so
 const err=await new Promise(res=>MPS.list(e=>res(e)));assert.strictEqual(err&&err.message,'not_running');
console.log('PASS: My design layout: GIF decoder (pixels, delays, transparency, limits), stop / drive / reverse from gear and speed held 300 ms, folder read again on change, fallback to the own picture, drawn letterboxed on the cluster, repaint per GIF frame, settings preview and the PC tool\'s check');
})().catch(e=>{console.error(e);process.exitCode=1;});
