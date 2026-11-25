'use strict';
// The Animation layout's GIFs on the GPU (1.3.62, flipbook.js): the frames sent once (an r8 atlas and a palette),
// an effect layer over the picture's place that the renderer steps through them itself (nothing sent per frame),
// a change of scene fading, the layout's image leaving the picture out (no repaint for its frames), the fallback to
// painting it while the renderer has not shown the layer or refused it. (Its shader is checked against the painted
// picture pixel by pixel in WebGL by hand: identical on the cluster, the HUD, mirrored and fading.)
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path'),{EventEmitter}=require('events');
const root=path.join(path.resolve(process.argv[2]),'source/javascript'),fx=path.join(__dirname,'fixtures');
const MP=require(root+'/my-picture'),GIF=require(root+'/gif-decode'),FB=require(root+'/flipbook'),{Outputs}=require(root+'/outputs');
const fit=(f)=>MP.fit(GIF.decode(fs.readFileSync(path.join(fx,f)),Object.assign({box:MP.BOX},MP.SOURCE)));

// the atlas: a whole 30-frame GIF of the picture's box kept; frames side by side; 255 clear; delays as the renderer's steps
{const g=fit('big-640x360-60f.gif'),a=FB.build([{name:'drive',sig:'1',gif:g}]);
 assert.deepStrictEqual([g.w,g.h,g.frames.length],[320,180,30]);assert.deepStrictEqual([a.w,a.h,a.thinned],[1920,900,false],'30 frames of 320 x 180: 6 a row, 5 rows');
 assert(a.bytes<=FB.CAP_BYTES);const e=a.entries.drive;assert.strictEqual(e.tiles.length,30);assert.deepStrictEqual(e.tiles[7],[320,180,320,180]);
 const k=FB.keysOf(e).split(' ');assert.strictEqual(k.length,31);assert.strictEqual(k[0],'0:0,0,320,180');assert.strictEqual(k[30],e.total+':0,0,320,180','the first frame again at the end, looped');
 // more than fits (five GIFs): thinned alike, each kept frame lasting as long as those it stands for
 const five=['stop','drive','reverse','left','right'].map(n=>({name:n,sig:n,gif:g})),b=FB.build(five);
 assert(b.thinned&&b.w*b.h<=FB.CAP_BYTES&&b.h<=2048);assert.strictEqual(b.rows,5);assert.strictEqual(b.entries.right.row,4);
 assert.strictEqual(b.entries.drive.total,e.total,'thinned, it runs as long');assert.strictEqual(b.entries.drive.of[29],b.entries.drive.tiles.length-1);
 // half the room (the renderer's memory full): thinned further
 assert(FB.build([{name:'drive',sig:'1',gif:g}],FB.CAP_BYTES/2).thinned);}
// colours: those used; more than 255, the most used kept and the others the nearest of them; clear stays clear
{const n=300,col=new Uint8Array(n*3);for(let c=0;c<n;c++){col[c*3]=c%256;col[c*3+1]=c>255?40:0;col[c*3+2]=0;}
 const px=new Uint16Array(n+2);for(let c=0;c<n;c++)px[c]=c;px[n]=0xFFFF;px[n+1]=5;
 const g={w:n+2,h:1,colours:col,frames:[{px,delay:100}]},a=FB.build([{name:'drive',sig:'1',gif:g}]);
 assert.strictEqual(a.data[n],FB.CLEAR);assert(Array.from(a.data.slice(0,n)).every(v=>v<255));assert.strictEqual(a.pal[a.data[n+1]*4],5,'the most used colour kept as it is');
 const p=FB.palette(g),j=p.map[299];assert(Math.abs(p.rgb[j*3]-(299%256))<=2,'a colour not kept: the nearest kept one');}

// the controller: a client that has the renderer's assets and effect layers
class Client extends EventEmitter {
 constructor(){super();this.ready=true;this.targets='map:1088x480,panel:1920x720,hud:800x480';this.next=0;this.layers=new Map();this.events=[];}
 add(kind,o){const ref=++this.next;this.layers.set(ref,Object.assign({kind},o));this.events.push([kind,ref,o]);return ref;}
 image(o){return this.add('image',o);}effect(o){return this.add('effect',o);}asset(o){return this.add('asset',o);}
 pixels(ref,rects,px){this.events.push(['pixels',ref,px.length]);return true;}
 showWhenSent(ref){this.events.push(['show',ref]);}set(ref,o){Object.assign(this.layers.get(ref)||{},o);this.events.push(['set',ref,o]);}
 uniform(ref,name,v){this.events.push(['uniform',ref,name,v.slice()]);}bind(ref,s,a){this.events.push(['bind',ref,s,a]);}
 animate(ref,o){this.events.push(['animate',ref,o]);return this.events.length;}stop(ref,a){this.events.push(['stop',ref,a]);}
 drop(ref){this.layers.delete(ref);this.events.push(['drop',ref]);}close(){}
 of(kind){return [...this.layers.entries()].filter(([,l])=>l.kind===kind).map(([r])=>r);}
}
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'flip-'));fs.mkdirSync(path.join(tmp,'my-pictures'));
fs.writeFileSync(path.join(tmp,'my-pictures','drive.mpic'),MP.encode(fit('big-640x360-60f.gif')));
fs.writeFileSync(path.join(tmp,'my-pictures','stop.mpic'),MP.encode(fit('pattern-64x36.gif')));
MP.setDir(tmp);MP.scan(0,true);MP.reset();
const client=new Client(),out=new Outputs(client,require(root+'/draw'),require(root+'/hud-compose'));
const cfg={clusterDesign:'rl-car',hudDesign:'rl-car',sportClusterOutput:'redline',sportHudOutput:'redline'};
let speed=50;const tick=(t)=>{out.policy.modeSample(1,t-1000);out.policy.rpmSample(3000,t);out.aux={car:{cluster:MP.frameOf('cluster','D',speed,t,{lat:0,long:0}),hud:MP.frameOf('hud','D',speed,t,{lat:0,long:0})}};return out.tick(t,cfg);};
let s=tick(1000);for(let t=1050;t<=1500;t+=50)s=tick(t);
const early=client.of('effect').length;for(let t=1550;t<=4600;t+=50)s=tick(t);
const effects=client.of('effect'),assets=client.of('asset');
assert.strictEqual(effects.length,2,'one effect layer on the cluster and one on the HUD');assert.strictEqual(assets.length,4,'an atlas and a palette each');
const cl=client.layers.get(effects.find(r=>client.layers.get(r).target!=='hud')),hl=client.layers.get(effects.find(r=>client.layers.get(r).target==='hud'));
assert.strictEqual(cl.z,101,'over the layout\'s image');assert.strictEqual(cl.klass,client.layers.get(out.cluster.ref).klass);
const atlasPx=client.events.filter(e=>e[0]==='pixels'&&assets.includes(e[1]));assert.strictEqual(atlasPx.length,4,'the frames sent once');
assert(client.events.some(e=>e[0]==='animate'&&e[2].name==='u_a'&&e[2].interp==='step'&&e[2].loop),'the renderer steps through the frames');
assert(client.events.some(e=>e[0]==='uniform'&&e[2]==='u_size'&&e[3][3]===1),'HUD: black see-through');
assert(early<2,'the effect layer only once the layout\'s image has its first frame');
// the picture's place: inside the cluster layout's image, at the image layer's scale
{const img=client.layers.get(out.cluster.ref),k=img.w/1088;assert(cl.x>=img.x&&cl.y>=img.y&&cl.x+cl.w<=img.x+img.w+1&&cl.y+cl.h<=img.y+img.h+1,'within the image');assert(cl.w>100*k&&Math.abs(cl.w/cl.h-580/326)<0.03,'the Car layout\'s picture box');}
// not shown yet: still painted into the image, which changes with the frames
assert(!s.outputs.cluster.flipbook||s.outputs.cluster.flipbook.state!=='shown');
const imagePx=()=>client.events.filter(e=>e[0]==='pixels'&&(e[1]===out.cluster.ref||e[1]===out.hud.ref)).length;
// shown: the picture leaves the image, which is then not sent again for the GIF's frames
effects.forEach(r=>client.emit('layer',r,'shown',''));
for(let t=4650;t<=5000;t+=50)tick(t);const before=imagePx();
for(let t=5050;t<=6000;t+=50)tick(t);assert.strictEqual(imagePx(),before,'the GIF running: nothing painted or sent for it');
assert.strictEqual(tick(6050).outputs.cluster.flipbook.state,'shown');
// a change of scene: the new GIF's steps, a fade from the frame left
const n0=client.events.length;speed=0;for(let t=6100;t<=6600;t+=50)tick(t);
const ev=client.events.slice(n0);assert(ev.some(e=>e[0]==='stop'),'the old steps stopped');assert(ev.some(e=>e[0]==='animate'&&e[2].name==='u_a'&&/^0:0,0,64,36/.test(e[2].keys)),'the stop GIF\'s frames');
assert(ev.some(e=>e[0]==='animate'&&e[2].name==='u_t'&&e[2].keys==='0:0 400:1'),'faded in over 400 ms');assert(ev.some(e=>e[0]==='uniform'&&e[2]==='u_meta'&&e[3][0]!==e[3][1]),'from the drive GIF\'s palette row');
assert(!ev.some(e=>e[0]==='pixels'&&assets.includes(e[1])),'no frames sent again');
// a new GIF copied in: the atlas made again (the layer first, then the assets)
fs.writeFileSync(path.join(tmp,'my-pictures','drive.mpic'),MP.encode(fit('pattern-transparent.gif')));MP.scan(10000,true);
const n1=client.events.length;tick(10000);const ev1=client.events.slice(n1),drops=ev1.filter(e=>e[0]==='drop').map(e=>e[1]);
assert(drops.indexOf(effects[0])>=0&&drops.indexOf(effects[0])<drops.indexOf(assets[0]),'the layer dropped before its atlas');assert(ev1.some(e=>e[0]==='asset'));
// refused (the renderer's pixel memory full): painted as before, half the room tried a second later
const fresh=client.of('asset');client.emit('refused','asset',fresh[0],"the service's pixel memory is full");
assert.strictEqual(client.of('asset').length,2,'that display\'s released (the other one\'s kept)');s=tick(10100);
for(let t=10150;t<=11200;t+=50)tick(t);assert.strictEqual(client.of('asset').length,4,'tried again');
// the layout's image hidden (the engine off): the layer goes, the atlas stays for when it comes back
client.of('effect').forEach(r=>client.emit('layer',r,'shown',''));out.policy.reset();out.hide();assert.strictEqual(client.of('effect').length,0);assert.strictEqual(client.of('asset').length,4);
// no GIF: the Car layout's own picture, nothing on the GPU
['drive','stop'].forEach(n=>fs.unlinkSync(path.join(tmp,'my-pictures',n+'.mpic')));MP.scan(20000,true);for(let t=20000;t<=20500;t+=50)tick(t);
assert.strictEqual(client.of('asset').length+client.of('effect').length,0,'released');
// a client without effect layers (older renderer client): painted as before
{const c2=new Client();c2.effect=undefined;const o2=new Outputs(c2,require(root+'/draw'),require(root+'/hud-compose'));fs.writeFileSync(path.join(tmp,'my-pictures','drive.mpic'),MP.encode(fit('pattern-64x36.gif')));MP.scan(30000,true);
 for(let t=30000;t<=36000;t+=50){o2.policy.modeSample(1,t-1000);o2.policy.rpmSample(3000,t);o2.aux={car:{cluster:MP.frameOf('cluster','D',50,t,{}),hud:MP.frameOf('hud','D',50,t,{})}};o2.tick(t,cfg);}
 assert.strictEqual(c2.of('asset').length,0);assert(c2.events.filter(e=>e[0]==='pixels').length>=4,'painted');}
console.log('PASS: GPU flipbook: frames sent once (r8 atlas + palette, thinned to fit, 255 colours), renderer-stepped, scene fade, image leaves the picture out, rebuilt for a new GIF, memory-full fallback and retry, hidden / no GIF / old client');
// refused for another reason (the shader): painted as before, not tried again for these GIFs; a new GIF tries again
{const c3=new Client(),F=new FB.Flipbook(c3,'cluster');const o={target:'panel',klass:'overlay',z:101,rect:{x:0,y:0,w:1088,h:480},iw:1088,ih:480,box:{x:100,y:10,w:580,h:326},frame:{mine:'drive',i:0},sent:true};
 F.update(40000,o);const eff=c3.of('effect')[0];assert(eff);c3.emit('layer',eff,'error','effect quad refused');assert.strictEqual(c3.of('asset').length,0);
 for(let t=40050;t<200000;t+=5000)F.update(t,o);assert.strictEqual(c3.of('asset').length,0,'not again');
 fs.writeFileSync(path.join(tmp,'my-pictures','drive.mpic'),MP.encode(fit('pattern-transparent.gif')));MP.scan(200000,true);F.update(200000,o);assert.strictEqual(c3.of('asset').length,2,'a new GIF: tried again');
 assert.strictEqual(F.update(200050,Object.assign({},o,{box:null})),false);assert.strictEqual(c3.of('asset').length,0,'picture hidden: released');}
console.log('PASS: refused flipbook not retried for the same GIFs');
