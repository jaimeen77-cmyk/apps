'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),os=require('os');
const {ProcessUsage,parseStat,parseStatus}=require('../apps/storage/process-usage');
const {appTrend}=require('../apps/storage/usage');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'storage-proc-'));
const stat=(pid,user,system,start)=>{const f=Array(22).fill('0');f[0]='S';f[11]=user;f[12]=system;f[19]=start;return pid+' (odd) process) '+f.join(' ');};
const proc=path.join(root,'proc'),oap=path.join(root,'oap');fs.mkdirSync(proc);fs.mkdirSync(oap);
function process(pid,uid,user,system,rss,start){const dir=path.join(proc,String(pid));fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'status'),`Name: fixture\nUid: ${uid} ${uid} ${uid} ${uid}\nVmRSS: ${rss} kB\n`);fs.writeFileSync(path.join(dir,'stat'),stat(pid,user,system,start));}
function total(user,idle){fs.writeFileSync(path.join(proc,'stat'),`cpu ${user} 0 0 ${idle} 0 0 0 0 999 999\nbtime 12345\n`);}
(async()=>{
    for(const [uid,name]of [[12210,'Example app'],[12211,'Memory app']]){const dir=path.join(oap,'oap_'+uid);fs.mkdirSync(dir);fs.writeFileSync(path.join(dir,'package.json'),JSON.stringify({name}));}
    assert.deepStrictEqual(parseStat(stat(100,20,10,42)),{ticks:30,start:42});
    assert.strictEqual(parseStat('bad'),null);
    assert.deepStrictEqual(parseStatus('Uid: 1 12210 1 1\nVmRSS: 512 kB'),{uid:12210,rss:524288});
    total(400,600);process(101,12210,10,10,1024,1);process(102,12210,20,10,2048,2);process(103,12211,5,5,4096,3);process(104,0,999,999,9999,4);
    const sampler=new ProcessUsage(oap,proc),first=await sampler.sample();
    assert.strictEqual(first.apps.length,2);assert.strictEqual(first.apps[0].cpu,null);assert.strictEqual(first.apps[0].rss,3*1048576);
    total(500,700);process(101,12210,20,20,1024,1);process(102,12210,30,20,2048,2);process(103,12211,10,10,8192,3);
    const second=await sampler.sample();
    assert.strictEqual(second.apps[0].cpu,20);assert.strictEqual(second.apps[0].processes,2);assert(!second.apps[0].partial);
    assert.strictEqual(second.apps[1].cpu,5);assert.strictEqual(second.apps[1].rss,8*1048576);
    // PID reuse cannot turn a new process's lifetime ticks into a CPU spike.
    total(600,800);process(101,12210,9000,9000,1024,99);
    const reused=await sampler.sample();assert.strictEqual(reused.apps[0].cpu,0);assert(reused.apps[0].partial);
    // A disappearing /proc entry is reported, and cannot kill the whole scan.
    fs.mkdirSync(path.join(proc,'105'));total(700,900);
    const gone=await sampler.sample();assert(gone.skipped>0&&gone.apps.length===2);
    fs.chmodSync(path.join(proc,'103/status'),0);total(800,1000);
    const denied=await sampler.sample();assert(denied.denied>0);assert(denied.apps.some(a=>a.uid===12210));
    fs.chmodSync(path.join(proc,'103/status'),0o600);
    const base=Date.parse('2026-11-17T00:00:00Z');
    const history=Array.from({length:91},(_,i)=>({time:base+i*10000,apps:[{uid:12210,name:'growing',cpu:20+i/3,rss:(32+i*2/3)*1048576,partial:false}]}));
    const trend=appTrend(history,history[90].apps[0]);assert(trend.memoryRising&&trend.leakSuspected);assert.strictEqual(trend.memoryDelta,20);
    history[15].apps[0].partial=true;assert(!appTrend(history,history[90].apps[0]).leakSuspected);
    console.log('PASS: per-app UID grouping, summed RSS/helpers, normalized CPU, PID reuse, inaccessible/disappearing processes and app memory-growth indicators');
})().catch(e=>{console.error(e);global.process.exitCode=1;}).finally(()=>fs.rmSync(root,{recursive:true,force:true}));
