'use strict';
// 1.3.100: the warning recording (road-log.js) and QR log collection (redline-lead 0.8.0 share.js): a warning writes 5 s
// before and 3 s after, a miss the last 20 s, nothing kept while off; 1.5 MB parts (at most 3 MB); Delete logs; the
// helper gives only the two logs of an app's data folder, never a symlink, and both together as a tar.gz.
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path'),zlib=require('zlib');
const {RoadLog,PART_BYTES}=require('../../apps/cluster_redline/road-log');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'roadlog-'));
const msg=t=>({cam:{at:t,objects:[{id:7,type:3,x:20,y:3.1}]},lane:{data:{lines:[{y:1.6,angle:0.2},{y:-1.7,angle:0.1}]}}});
{const r=new RoadLog({dir,version:'t'});for(let t=0;t<=30000;t+=100){r.frame(msg(t),40);if(t===20000)r.warned({kind:'cutin',id:7},t);}
 const L=fs.readFileSync(path.join(dir,'road-alerts.log'),'utf8').trim().split('\n'),h=JSON.parse(L[0]);
 assert.strictEqual(h.why,'cutin');assert.strictEqual(h.frames,81,'5 s before + 3 s after at 10 a second: '+h.frames);assert.strictEqual(JSON.parse(L[1]).t,-5000);
 assert.deepStrictEqual(JSON.parse(L[1]).o,[[7,3,20,3.1]]);assert(!/lat|lon/.test(L.join('')),'no position');
 assert(r.miss());const M=fs.readFileSync(path.join(dir,'road-alerts.log'),'utf8').trim().split('\n');const mh=JSON.parse(M[82]);assert.strictEqual(mh.why,'miss');assert.strictEqual(mh.frames,201,'the last 20 s');
 r.stop();assert.strictEqual(r.frames.length,0,'off: nothing kept');
 // parts: past 1.5 MB the file becomes .1
 fs.writeFileSync(path.join(dir,'road-alerts.log'),'x'.repeat(PART_BYTES-100));for(let t=40000;t<=70000;t+=100)r.frame(msg(t),40);r.miss();
 assert(fs.existsSync(path.join(dir,'road-alerts.log.1'))&&fs.statSync(path.join(dir,'road-alerts.log')).size<PART_BYTES,'a new part');
 fs.writeFileSync(path.join(dir,'nav-probe.log'),'n');assert(r.clear(['nav-probe.log'])>=3);assert(!fs.existsSync(path.join(dir,'road-alerts.log'))&&!fs.existsSync(path.join(dir,'nav-probe.log')),'Delete logs');}
{const S=require('../../native/redline-lead/share');
 assert.strictEqual(S.folderOf({dir:'/var/opt/public/oap/oap_12211/data'}),'/var/opt/public/oap/oap_12211/data');
 ['/etc','/var/opt/public/oap/oap_1/data/..','/var/opt/public/oap/oap_1/data/x'].forEach(d=>assert.strictEqual(S.folderOf({dir:d}),null,d));
 assert.strictEqual(S.folderOf({file:'/var/opt/public/oap/oap_3/data/nav-probe.log'}),'/var/opt/public/oap/oap_3/data','0.5.0 form');
 assert.deepStrictEqual(S.FILES,['nav-probe.log','road-alerts.log']);
 fs.writeFileSync(path.join(dir,'secret'),'s');fs.symlinkSync(path.join(dir,'secret'),path.join(dir,'road-alerts.log'));
 assert.strictEqual(S.readPlain(path.join(dir,'road-alerts.log')),null,'a symlink is not followed');
 const sh=new S.Share();sh.dir=dir;fs.writeFileSync(path.join(dir,'nav-probe.log.1'),'old\n');fs.writeFileSync(path.join(dir,'nav-probe.log'),'new\n');
 assert.strictEqual(String(sh.read('nav-probe.log')),'old\nnew\n','the older part first');assert.strictEqual(sh.read('road-alerts.log'),null);assert.strictEqual(sh.read('secret'),null);
 const t=S.tar([{name:'nav-probe.log',data:sh.read('nav-probe.log')}]);assert.strictEqual(t.length%512,0);assert.strictEqual(t.toString('ascii',257,262),'ustar');assert(zlib.gunzipSync(zlib.gzipSync(t)).equals(t));}
fs.rmSync(dir,{recursive:true,force:true});
console.log('PASS: warning recording (5 s + 3 s, a miss 20 s, no position, 1.5 MB parts, Delete logs); helper 0.8.0 share: two logs of an app folder only, no symlink, older part first, tar.gz');
