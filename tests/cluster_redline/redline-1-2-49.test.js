'use strict';
// 1.2.49: the Classic dial is a clock in Korean time and nothing else (no rpm scale, oil window, gear or drive
// mode), and the app keeps no logs (no system log lines, no log file, no status file).
// Usage: node redline-1-2-49.test.js <built cluster_redline stage>
const assert=require('assert'),path=require('path'),fs=require('fs'),vm=require('vm');
const stage=path.resolve(process.argv[2]),root=path.join(stage,'source/javascript');
const {settings}=require(root+'/policy'),RL=require(root+'/redline-hud'),CL=require(root+'/draw');
const diff=(a,b)=>{let n=0;for(let k=0;k<a.length;k++)if(Math.abs(a[k]-b[k])>2)n++;return n;};

// 1. Classic dial: a clock only
assert.deepStrictEqual(RL.ELEMENTS.classic,['gauge','alert','readA','readB','readC','readD','mark']);
{
 const cfg=settings({clusterDesign:'rl-classic'}),st=(now,extra)=>Object.assign({config:cfg,now,renderRpm:true,rpm:2400,gear:'D4',mode:'SPORT',aux:{oil:96},shift:false,flash:false},extra||{});
 // Korean time: 01:08:37 UTC is 10:08:37 in Korea
 assert.deepStrictEqual(RL.frame(st(Date.UTC(2026,10,14,1,8,37)),0,'cluster').clock,{h:10,m:8,s:37});
 assert.deepStrictEqual(RL.frame(st(Date.UTC(2026,10,14,15,0,0)),0,'cluster').clock,{h:0,m:0,s:0},'midnight in Korea');
 assert.strictEqual(RL.frame({config:settings({clusterDesign:'rl-sportdial'}),rpm:2000},0,'cluster').clock,null,'other layouts: no clock');
 const t0=Date.UTC(2026,10,14,1,8,37),a=Buffer.from(CL.draw(st(t0)).d),b=Buffer.from(CL.draw(st(t0+1000)).d),c=Buffer.from(CL.draw(st(t0+3600000)).d);
 assert(diff(a,b)>20,'the seconds hand moves');assert(diff(a,c)>200,'the hour hand moves');
 // the rpm, gear and drive mode no longer change the dial (only the alert lamp follows the rpm)
 assert.strictEqual(diff(a,Buffer.from(CL.draw(st(t0,{rpm:2600,gear:'M2',mode:'COMFORT'})).d)),0,'rpm / gear / mode do not show');
 // cached tiles equal full draws as the time runs, only the hands tile repaints each second
 const cache=CL.createCache();
 for(let i=0;i<8;i++){const s=st(t0+i*1000);Object.defineProperty(s,'renderCache',{value:cache});assert.strictEqual(diff(Buffer.from(CL.draw(s).d),Buffer.from(CL.draw(st(t0+i*1000)).d)),0,'second '+i);}
 const k1=RL.keys(st(t0),'cluster'),k2=RL.keys(st(t0+1000),'cluster');
 assert.notStrictEqual(RL.key(st(t0),'cluster'),RL.key(st(t0+1000),'cluster'),'the frame key follows the time, so a steady car still gets new hands');
 assert.notStrictEqual(k1('gauge'),k2('gauge'));['readA','alert','mark'].forEach(id=>assert.strictEqual(k1(id),k2(id),id+' stays cached'));
}

// 2. No logs: main.js silences ctx.log, removes the log files and the old status file, blocks a new log file;
// the worker keeps its status in memory
{
 const dir=path.resolve(__dirname,'../../apps/cluster_redline'),ops=[],files={'/d/cluster_redline.log':'x','/d/cluster_redline.log.1':'y','/d/cluster-redline-status.json':'{}'};
 const fakeFs={readFileSync:()=>'{}',statSync:p=>{if(!(p in files))throw new Error('ENOENT');return {isFile:()=>files[p]!=='DIR'};},unlinkSync:p=>{ops.push('rm '+path.basename(p));delete files[p];},mkdirSync:p=>{ops.push('mkdir '+path.basename(p));files[p]='DIR';},
  writeFileSync:p=>ops.push('write '+p),appendFileSync:p=>ops.push('append '+p)};
 let entry;const m={exports:{}},said=[];
 const mocks={fs:fakeFs,path,'./kit/mgu':{run:e=>entry=e},'./kit/i18n':{t:x=>x},'./settings-ui':{SettingsPage:class{draw(c){c.targets=[];return c;}leave(){}},W:1600,H:520},
  './settings-chrome':{configure(){}},'./worker':{start(){return {stop(){},status:()=>({reason:'sport'})};}},'./migrate':{migrate(){}},'./output-status':{mapStatus:()=>''}};
 vm.runInNewContext(fs.readFileSync(path.join(dir,'main.js'),'utf8'),{module:m,require:n=>Object.prototype.hasOwnProperty.call(mocks,n)?mocks[n]:require(path.join(dir,n)),console},{filename:'main.js'});
 const values={autoStart:false,appEnabled:false},log={};['error','warn','info','debug'].forEach(l=>log[l]=x=>said.push(l+' '+x));
 Promise.resolve(entry.start({settings:{get:k=>values[k],set:(k,v)=>values[k]=v,onChange(){}},spec:{id:'cluster_redline',version:'t'},dataDir:'/d',log,canvas:()=>({}),ui:{image:async()=>{},onClick(){},text:async()=>{}},onTap(){},onTab(){},onLayout(){},loop(){}})).then(()=>{
  ['error','warn','info','debug'].forEach(l=>log[l]('hello'));
  assert.deepStrictEqual(said,[],'nothing reaches the system log');
  assert.deepStrictEqual(ops.sort(),['mkdir cluster_redline.log','rm cluster-redline-status.json','rm cluster_redline.log','rm cluster_redline.log.1']);
  assert.strictEqual(files['/d/cluster_redline.log'],'DIR','the log file is a folder: nothing can be appended');
  const src=fs.readFileSync(path.join(dir,'worker.js'),'utf8');
  assert(!/writeFileSync|appendFileSync|log\.(warn|info|error)\(/.test(src),'the worker writes no files and no log lines');
  console.log('PASS: Classic dial is a Korean-time clock only (hands follow the time, rpm / gear / mode not shown, only the hands repaint each second); no logs (system log silenced, log file removed and blocked, no status file)');
 }).catch(e=>{console.error(e);process.exitCode=1;});
}
