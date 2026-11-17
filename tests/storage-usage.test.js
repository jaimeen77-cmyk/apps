'use strict';
const assert = require('assert'), fs = require('fs'), path = require('path'), os = require('os');
const S = require('../apps/storage/sysinfo');
const zlib = require('zlib');
const readLog = (p) => zlib.gunzipSync(fs.readFileSync(p)).toString('utf8');
const writeLog = (p,s) => fs.writeFileSync(p,zlib.gzipSync(Buffer.from(s)));
const { UsageMonitor, trends, INTERVAL, WINDOW } = require('../apps/storage/usage');
const { UsageLog, RETENTION, HEADER, MAX_FILE, MAX_TOTAL } = require('../apps/storage/usage-log');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'storage-usage-'));
const now = Date.parse('2026-11-17T12:00:00Z');
const point = (time, cpu, memory) => ({ time, cpu, memory: memory === null ? null : { used: memory * 1000, total: 100000, avail: (100 - memory) * 1000 }, uptime: 1234 });
try {
    assert.strictEqual(INTERVAL,30000);assert.strictEqual(WINDOW,1800000);
    const first=S.parseCpu('cpu 100 20 30 200 50 10 10 0 80 10\ncpu0 1 2 3 4');
    assert.deepStrictEqual(first,{total:420,idle:250}); // guest fields excluded
    assert.strictEqual(S.cpuPercent(first,{total:520,idle:320}),30);
    assert.strictEqual(S.cpuPercent(null,first),null);
    assert.strictEqual(S.cpuPercent(first,first),null);
    assert.strictEqual(S.cpuPercent(first,{total:100,idle:90}),null);
    assert.strictEqual(S.parseCpu('cpu nope 0 0 2'),null);
    assert.strictEqual(S.parseCpu('cpu0 1 2 3 4'),null);
    assert.strictEqual(S.cpuPercent(first,{total:520,idle:250}),100);
    assert.strictEqual(S.cpuPercent(first,{total:520,idle:350}),0);
    assert.strictEqual(S.parseMemory('MemTotal: 1000 kB\nMemAvailable: 750 kB\nCached: 500 kB').used,250*1024);
    assert.strictEqual(S.parseMemory('MemTotal: 1000 kB\nMemFree: 100 kB\nBuffers: 50 kB\nCached: 200 kB\nSReclaimable: 100 kB\nShmem: 50 kB').avail,400*1024);
    assert.strictEqual(S.parseMemory('MemTotal: 100 kB\nMemAvailable: 200 kB').used,0);
    assert.strictEqual(S.parseMemory('not meminfo'),null);

    const flat=Array.from({length:31},(_,i)=>point(now+i*INTERVAL,20,40));
    assert.deepStrictEqual(trends(flat),{cpuDelta:0,memoryDelta:0,cpuRising:false,memoryRising:false,leakSuspected:false});
    const growing=flat.map((s,i)=>point(s.time,20+i,40+i/2));
    const result=trends(growing);assert(result.memoryRising&&result.leakSuspected);assert.strictEqual(result.memoryDelta,5);
    const cpuGrowing=flat.slice(0,11).map((s,i)=>point(s.time,20+i*3,40));
    assert(trends(cpuGrowing).cpuRising);
    cpuGrowing[cpuGrowing.length-1].cpu=95;cpuGrowing[cpuGrowing.length-2].cpu=20;
    assert(!trends(cpuGrowing).cpuRising,'a one-sample spike is not sustained growth');
    assert(!trends(growing.slice(1)).leakSuspected,'needs 15 minutes');
    assert(!trends(growing.filter((s,i)=>i!==15)).leakSuspected,'a missing sample breaks the window');
    const unavailable=growing.map(s=>Object.assign({},s));unavailable[15].memory=null;
    assert(!trends(unavailable).leakSuspected);
    const plateau=growing.map((s,i)=>point(s.time,s.cpu,i>20?50:40+i/2));assert(!trends(plateau).leakSuspected);

    const data=path.join(root,'data');fs.mkdirSync(data);const logger=new UsageLog(data);
    assert(logger.append(point(now,25,60)));const dir=path.join(data,'usage-logs');
    const beforeCutoff=new Date(now-RETENTION-1000).toISOString()+',1,2,3,4,5,,,,,,,ok\n';
    const afterCutoff=new Date(now-RETENTION+60000).toISOString()+',1,2,3,4,5,,,,,,,ok\n';
    writeLog(path.join(dir,'usage-2026-10-17.csv.gz'),HEADER+beforeCutoff);
    writeLog(path.join(dir,'usage-2026-10-18.csv.gz'),HEADER+beforeCutoff+afterCutoff);
    fs.writeFileSync(path.join(dir,'keep.txt'),'unrelated');
    const restarted=new UsageLog(data);assert(restarted.append(point(now+INTERVAL,35,61)));
    assert(!fs.existsSync(path.join(dir,'usage-2026-10-17.csv.gz')));
    const boundary=readLog(path.join(dir,'usage-2026-10-18.csv.gz'));
    assert(!boundary.includes(beforeCutoff.trim()));assert(boundary.includes(afterCutoff.trim()));assert.strictEqual(fs.readFileSync(path.join(dir,'keep.txt'),'utf8'),'unrelated');
    const today=path.join(dir,'usage-2026-11-17.csv.gz');const rows=readLog(today).trim().split('\n');
    assert.strictEqual(rows.length,3);assert(rows[1].includes(',25.00,60.00,'));
    // A full month at 30-second cadence fits the declared budget.
    const worst=point(now,99.99,99.99);worst.uptime=99999999.9;worst.trend={cpuDelta:-100,memoryDelta:-100,cpuRising:true,memoryRising:true,leakSuspected:true};
    worst.apps=Array.from({length:20},(_,i)=>({uid:12200+i,name:'App, "name" '+i,cpu:12.34,rss:104857600+i*1048576,processes:2,partial:false,trend:{cpuDelta:15.12,memoryDelta:32,cpuRising:true,memoryRising:true,leakSuspected:true}}));
    assert(logger.append(worst));const last=readLog(today).trim().split('\n').pop();
    const dayBytes=Buffer.byteLength(HEADER)+2880*zlib.gzipSync(Buffer.from(last+'\n')).length;
    assert(dayBytes<MAX_FILE&&dayBytes*31<MAX_TOTAL);
    const original=fs.appendFileSync;
    try {fs.appendFileSync=()=>{const e=Error('full');e.code='ENOSPC';throw e;};assert(!logger.append(point(now,10,50)));assert.strictEqual(logger.error,'ENOSPC');}
    finally {fs.appendFileSync=original;}
    assert(logger.append(point(now,null,null)));assert.strictEqual(logger.error,'');
    assert(readLog(today).includes('cpu_unavailable|memory_unavailable'));
    const outside=path.join(root,'outside');fs.writeFileSync(outside,'preserve');
    fs.symlinkSync(outside,path.join(dir,'usage-2026-10-01.csv.gz'));
    assert(!logger.append(point(now+3600000,20,50)));assert.strictEqual(fs.readFileSync(outside,'utf8'),'preserve');
    fs.unlinkSync(path.join(dir,'usage-2026-10-01.csv.gz'));
    const capped=path.join(dir,'usage-2026-11-18.csv.gz');fs.writeFileSync(capped,Buffer.alloc(MAX_FILE));
    assert(!logger.append(point(now+86400000,20,50)));assert(logger.error.includes('limit'));

    const monitorDir=path.join(root,'monitor');fs.mkdirSync(monitorDir);let step=0;
    const source={cpu:()=>({total:1000+100*step++,idle:600+70*(step-1)}),memory:()=>({total:1000,used:600,avail:400}),uptime:()=>1234};
    const monitor=new UsageMonitor(monitorDir,source);
    assert.strictEqual(monitor.sample(now,null,true).cpu,null);
    assert.strictEqual(monitor.sample(now+INTERVAL,null,true).cpu,30);
    const file=path.join(monitorDir,'usage-logs/usage-2026-11-17.csv.gz');
    assert.strictEqual(readLog(file).trim().split('\n').length,3);
    const saved=readLog(file);monitor.sample(now+2*INTERVAL,'crit',true);
    assert.strictEqual(readLog(file),saved,'demo never enters real CSV logs');
    monitor.sample(now+3*INTERVAL,null,false);assert.strictEqual(readLog(file),saved);
    for(let i=4;i<80;i++)monitor.sample(now+i*INTERVAL,null,false);
    assert(monitor.history.length<=61);
    const old=path.join(monitorDir,'usage-logs/usage-2026-09-01.csv.gz');writeLog(old,HEADER);
    monitor.sample(now+140*INTERVAL,null,false);assert(!fs.existsSync(old),'retention continues with recording disabled');
    monitor.sample(now,null,false);assert.strictEqual(monitor.history.length,1,'clock rollback resets the chart');
    console.log('PASS: aggregate CPU, MemAvailable, 30-second sampling/logging, sustained CPU/memory trends, leak suspicion guards, 30-day retention/restart, quota, ENOSPC and symlink boundaries');
} finally {fs.rmSync(root,{recursive:true,force:true});}
