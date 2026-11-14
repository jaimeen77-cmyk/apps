'use strict';
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const {SpeedProbe}=require('../../apps/cluster_redline/speed-probe');
const {archive}=require('../../apps/cluster_redline/probe-archive');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'probe-archive-test-'));
const file=n=>path.join(dir,n),read=n=>fs.readFileSync(file(n),'utf8'),write=(n,s)=>fs.writeFileSync(file(n),s);
function probe(io){return new SpeedProbe({fs:io||fs,dataDir:dir,signals:null,someipDirs:[],manifestFiles:[],version:'test'});}
try{
 const p=probe();assert.equal(p.saveAndContinue(),null);assert.equal(p.on,true);assert.equal(p.saveError,null,'empty capture starts without a meaningless archive');
 p.sample('speed',30);p.rawSeen=true;
 write('speed-probe.log.1','{"ev":"older"}\n');const snapshot=read('speed-probe.log.1')+read('speed-probe.log');
 assert.equal(p.saveAndContinue(),'speed-probe-1.log');assert.equal(read('speed-probe-1.log'),snapshot);
 assert.equal(p.on,true);assert.equal(p.rawSeen,false);assert(!fs.existsSync(file('speed-probe.log.1')));
 const records=read('speed-probe.log').trim().split('\n').map(JSON.parse);
 assert.deepStrictEqual(records.slice(0,3).map(r=>r.ev),['start','catalog','readable']);
 assert.equal(records[0].previousArchive,'speed-probe-1.log');
 p.sample('speed',30);assert(read('speed-probe.log').includes('"name":"speed"'),'unchanged value can be recorded in new file');
 assert.equal(p.saveAndContinue(),'speed-probe-2.log');
 p.clear();assert.equal(read('speed-probe-1.log'),snapshot,'clear never deletes numbered archives');
 p.setOn(false);
 const restarted=probe();assert.equal(restarted.saveAndContinue(),'speed-probe-3.log');assert.equal(restarted.on,true,'save while off starts the next capture');restarted.setOn(false);
 fs.unlinkSync(file('speed-probe-3.log'));write('speed-probe.log','fourth\n');
 assert.equal(probe().saveAndContinue(),'speed-probe-4.log','persisted sequence survives restart and archive deletion');
 // A higher existing name wins over the stored sequence, and collision cannot replace it.
 write('speed-probe-9.log','DO NOT REPLACE\n');assert.equal(archive(fs,dir),'speed-probe-10.log');assert.equal(read('speed-probe-9.log'),'DO NOT REPLACE\n');
 const race=Object.create(fs);let raced=null;race.linkSync=(from,to)=>{if(!raced){raced=to;fs.writeFileSync(to,'CONCURRENT FILE');throw Object.assign(new Error('exists'),{code:'EEXIST'});}fs.linkSync(from,to);};
 const raceName=archive(race,dir);assert.equal(fs.readFileSync(raced,'utf8'),'CONCURRENT FILE');assert.notEqual(file(raceName),raced,'exclusive commit retries a new number');
 const broken=Object.create(fs);broken.linkSync=()=>{throw Object.assign(new Error('full'),{code:'ENOSPC'});};
 const failing=probe(broken),before=read('speed-probe.log');assert.equal(failing.saveAndContinue(),null);assert.equal(failing.saveError,'ENOSPC');assert.equal(read('speed-probe.log'),before,'failed snapshot leaves active log intact');
 assert(!fs.readdirSync(dir).some(n=>n.startsWith('.speed-probe-save-')),'transaction files cleaned');
 // Restart failures happen only after a safe numbered copy exists.
 const cannotRestart=Object.create(fs),rename=fs.renameSync.bind(fs);cannotRestart.renameSync=(a,b)=>{if(a===file('speed-probe.log.new'))throw Object.assign(new Error('read only'),{code:'EROFS'});return rename(a,b);};
 const partial=probe(cannotRestart),partialBefore=read('speed-probe.log');assert.equal(partial.saveAndContinue(),null);assert(partial.lastSaved);assert.equal(read(partial.lastSaved),partialBefore);assert.equal(read('speed-probe.log'),partialBefore);
 console.log('PASS numbered probe snapshots: complete rotation, fresh metadata/dedup, restart persistence, no overwrite, clear protection and disk errors');
}finally{
 // Test-only cleanup; no vehicle file is touched.
 for(const name of fs.readdirSync(dir))fs.unlinkSync(file(name));fs.rmdirSync(dir);
}
