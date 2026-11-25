'use strict';
// The Animation layout's GIF on a layer of its own (1.3.64, picture-layer.js): an image layer over the picture's place
// at the GIF's own size (the renderer scaling it), only its changed pixels sent, the layout's image leaving the
// picture out once it shows (not sent again for the GIF's frames); a new GIF size a new layer; refused: painted into the layout's image as before.
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path'),{EventEmitter}=require('events');
const root=path.join(path.resolve(process.argv[2]),'source/javascript'),fx=path.join(__dirname,'fixtures');
const MP=require(root+'/my-picture'),GIF=require(root+'/gif-decode'),{Outputs}=require(root+'/outputs'),D=require(root+'/policy');
const fit=(f)=>MP.fit(GIF.decode(fs.readFileSync(path.join(fx,f)),Object.assign({box:MP.BOX},MP.SOURCE)));
class Client extends EventEmitter {
 constructor(){super();this.ready=true;this.targets='map:1088x480,panel:1920x720,hud:800x480';this.next=0;this.layers=new Map();this.events=[];}
 image(o){const ref=++this.next;this.layers.set(ref,Object.assign({},o));this.events.push(['image',ref,o]);return ref;}
 pixels(ref,rects,px){this.events.push(['pixels',ref,px.length,rects]);return true;}
 showWhenSent(ref){this.events.push(['show',ref]);}set(ref,o){Object.assign(this.layers.get(ref)||{},o);this.events.push(['set',ref,o]);}
 drop(ref){this.layers.delete(ref);this.events.push(['drop',ref]);}close(){}
}
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'piclayer-'));fs.mkdirSync(path.join(tmp,'my-pictures'));
fs.writeFileSync(path.join(tmp,'my-pictures','drive.mpic'),MP.encode(fit('pattern-64x36.gif')));
fs.writeFileSync(path.join(tmp,'my-pictures','stop.mpic'),MP.encode(fit('big-640x360-60f.gif')));
MP.setDir(tmp);MP.scan(0,true);MP.reset();
let speed=50;const run=(cfg,client,from,to,speed)=>{const out=client.out||(client.out=new Outputs(client,require(root+'/draw'),require(root+'/hud-compose')));
 for(let t=from;t<=to;t+=50){out.policy.modeSample(1,t-1000);out.policy.rpmSample(3000,t);out.aux={car:{cluster:MP.frameOf('cluster','D',speed,t,{lat:0,long:0}),hud:MP.frameOf('hud','D',speed,t,{lat:0,long:0})}};client.last=out.tick(t,cfg);}return client.out;};
const cfg={clusterDesign:'rl-car',hudDesign:'rl-car',sportClusterOutput:'redline',sportHudOutput:'redline'};
const c=new Client(),out=run(cfg,c,1000,5000,50);
const pics=[...c.layers.entries()].filter(([r])=>r!==out.cluster.ref&&r!==out.hud.ref);
assert.strictEqual(pics.length,2,'a picture layer on the cluster and on the HUD');
const cp=pics.find(([,l])=>l.target!=='hud'),hp=pics.find(([,l])=>l.target==='hud');
assert.deepStrictEqual([cp[1].iw,cp[1].ih,cp[1].sampling,cp[1].z],[64,36,'bilinear',101],'at the GIF\'s own size, scaled by the renderer, over the layout');
assert.strictEqual(cp[1].klass,c.layers.get(out.cluster.ref).klass);assert.strictEqual(hp[1].klass,'content');
{const img=c.layers.get(out.cluster.ref),l=cp[1];assert(l.x>=img.x&&l.y>=img.y&&l.x+l.w<=img.x+img.w+1&&l.y+l.h<=img.y+img.h+1,'inside the layout');assert(Math.abs(l.w/l.h-64/36)<0.05,'its shape kept');assert(l.w>150,'scaled up');}
const px=(ref)=>c.events.filter(e=>e[0]==='pixels'&&e[1]===ref);
assert(px(cp[0]).length>=1&&px(cp[0]).every(e=>e[2]<=64*36*4),'only the GIF\'s pixels');assert(c.events.some(e=>e[0]==='show'&&e[1]===cp[0]));
// shown: the GIF's frames go on its layer only; the layout's image is not sent again for them
pics.forEach(([r])=>c.emit('layer',r,'shown',''));run(cfg,c,5050,5500,50);
const layoutPx=()=>px(out.cluster.ref).length+px(out.hud.ref).length,before=layoutPx(),picBefore=px(cp[0]).length;
run(cfg,c,5550,7500,50);assert.strictEqual(layoutPx(),before,'the layout\'s image left alone');assert(px(cp[0]).length-picBefore>=8,'the GIF runs on its own layer ('+(px(cp[0]).length-picBefore)+' frames in 2 s at 50 ms a frame)');
assert.strictEqual(c.last.outputs.cluster.flipbook.state,'shown');
// another scene with a GIF of another size (320 x 180): a new layer, fading from the old GIF
speed=0;run(cfg,c,7550,8500,0);const big=[...c.layers.values()].filter(l=>l.iw===320&&l.ih===180);assert.strictEqual(big.length,2,'a new layer for the new size');assert(!c.layers.has(cp[0]),'the old one dropped');
// always on (1.3.66: the switch removed), even with the old stored Off
{const c2=new Client();run(Object.assign({myPicLayer:'off'},cfg),c2,1000,4000,50);assert.strictEqual(c2.layers.size,4,'the picture layers too');}
// refused: dropped, painted as before, not tried again for these GIFs
{const c3=new Client(),o3=run(cfg,c3,1000,4000,50),r=[...c3.layers.keys()].find(k=>k!==o3.cluster.ref&&k!==o3.hud.ref&&c3.layers.get(k).target!=='hud');
 c3.emit('layer',r,'error','image buffer or quad refused');run(cfg,c3,4050,6000,50);assert.strictEqual([...c3.layers.values()].filter(l=>l.target!=='hud'&&l.iw===64).length,0,'not again');assert(c3.last.outputs.cluster.flipbook.failure);}
// no GIF: the Car layout's car, no layer
['drive','stop'].forEach(n=>fs.unlinkSync(path.join(tmp,'my-pictures',n+'.mpic')));MP.scan(20000,true);run(cfg,c,20000,20500,50);assert.strictEqual(c.layers.size,2);
// the My GIFs screen: no switch any more; Record to a file read by the settings screen (1.3.66)
{const {SettingsPage}=require(root+'/settings-ui'),{Canvas}=require(root+'/kit/canvas'),spec=require(root+'/kit/app-spec.json'),v={};spec.settings.forEach(x=>{v[x.key]=x.default;});v.clusterDesign='rl-car';
 const page=new SettingsPage({schema:spec.settings,get:k=>v[k],set:(k,x)=>{v[k]=x;},onChange(){}},()=>{},'t');page.openMyPic();const cv=new Canvas(1600,520);page.draw(cv,'',{});
 assert(!cv.targets.some(x=>x.id==='mypic-layer'));v.navProbeLog='on';assert.strictEqual(page.config().navProbeLog,'on');}
console.log('PASS: GIF on its own layer: at its own size, scaled by the renderer, changed pixels only, layout image left alone, new layer for a new size, off / refused / no GIF painted as before');
