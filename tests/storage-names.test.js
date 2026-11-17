'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),os=require('os');
const {collect,publish}=require('../native/mgu-monitor-names/export-names');
const {readMap}=require('../apps/storage/app-names');
const {UsageLog,HEADER}=require('../apps/storage/usage-log');
const zlib=require('zlib');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'mgu-names-'));
function write(relative,data){const file=path.join(tmp,relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,typeof data==='string'?data:JSON.stringify(data));return file;}
try {
    const root=path.join(tmp,'oap');
    write('oap/oap_12201/security/uids.txt','12216=cluster_redline\n12218=seats_easy_access\n12227=legacy_app\n');
    write('oap/oap_12201/data/apps/cluster_redline.json',{userId:12216});
    write('oap/oap_12216/source/package.json',{name:'cluster_redline'});
    write('oap/oap_12216/source/javascript/kit/app-spec.json',{title:'Cluster Redline'});
    write('oap/oap_12217/source/package.json',{name:'storage',displayName:'MGU 모니터'});
    write('oap/oap_12218/source/package.json',{name:'seats_easy_access'});
    write('oap/oap_12218/rhmiData/application.json',{application:{entryPoints:[{textId:'TITLE'}]}});
    write('oap/oap_12218/rhmiData/strings/en_GB.json',{TITLE:'Seats Easy Access'});
    write('oap/oap_12218/rhmiData/strings/ko_KR.json',{TITLE:'시트 이지 액세스'});
    fs.mkdirSync(path.join(root,'oap_12227'));
    const table=collect(root,Date.now()),byUid=new Map(table.apps.map(a=>[a.uid,a]));
    assert.strictEqual(byUid.get(12216).name,'Cluster Redline');
    assert.strictEqual(byUid.get(12217).name,'MGU 모니터');
    assert.strictEqual(byUid.get(12218).name,'Seats Easy Access');
    assert.strictEqual(byUid.get(12218).titles.ko_KR,'시트 이지 액세스');
    assert.strictEqual(byUid.get(12227).name,'legacy_app');
    // UID numbers may move: lookup follows the metadata, not a guessed number table.
    write('oap/oap_12340/source/package.json',{name:'cluster_redline',displayName:'Different UID app'});
    const out=path.join(tmp,'public/apps.json');publish(root,out,Date.now());
    const names=readMap(out,process.getuid());assert.strictEqual(names[12340].name,'Different UID app');
    assert((fs.statSync(out).mode&0o777)===0o644);
    fs.symlinkSync(out,path.join(tmp,'link.json'));assert.deepStrictEqual(readMap(path.join(tmp,'link.json'),process.getuid()),{});
    write('bad.json',{schema:1,apps:[{uid:12216,name:null}]});assert.deepStrictEqual(readMap(path.join(tmp,'bad.json'),process.getuid()),{});
    const outside=write('outside.json',{displayName:'DO NOT EXPORT'});
    fs.mkdirSync(path.join(root,'oap_12400/source'),{recursive:true});fs.symlinkSync(outside,path.join(root,'oap_12400/source/package.json'));
    assert(!collect(root,Date.now()).apps.some(a=>a.name==='DO NOT EXPORT'));
    // Ten-second records are losslessly grouped into 30-second gzip blocks.
    const data=path.join(tmp,'logs');fs.mkdirSync(data);const log=new UsageLog(data),time=Date.parse('2026-11-17T12:00:00Z');
    for(let i=0;i<4;i++)assert(log.append({time:time+i*10000,cpu:20+i,memory:{total:1000,used:500,avail:500},uptime:100+i}));
    const file=path.join(data,'usage-logs/usage-2026-11-17.csv.gz');let lines=zlib.gunzipSync(fs.readFileSync(file)).toString().trim().split('\n');
    assert.strictEqual(lines.length,5);assert(lines[2].startsWith('2026-11-17T12:00:10.000Z'));
    log.append({time:time+40000,cpu:24,memory:null,uptime:140});assert.strictEqual(log.pending.length,1);assert(log.flush());
    lines=zlib.gunzipSync(fs.readFileSync(file)).toString().trim().split('\n');assert.strictEqual(lines.length,6);
    const src=require(path.join(process.env.MGU_STORE_UPDATER_JS,'sources'));
    const toolRoot=path.resolve(__dirname,'../native/mgu-monitor-names');
    const files=[];function walk(dir){fs.readdirSync(dir).forEach(name=>{const p=path.join(dir,name);if(fs.statSync(p).isDirectory())walk(p);else files.push({name:path.relative(toolRoot,p),data:fs.readFileSync(p),mode:0o644});});}walk(toolRoot);
    const bytes=src.packComponent({id:'mgu-monitor-names',kind:'tool',version:'0.1.0',path:'native/mgu-monitor-names'},files);
    fs.writeFileSync(path.join(tmp,'mgu-monitor-names.tgz'),bytes);
    const tar=require(path.join(process.env.MGU_STORE_UPDATER_JS,'tar'));
    // Continue the async archive checks below without a separate process.
    Promise.resolve(tar.untgz(bytes,4<<20)).then(members=>{
        const manifest=JSON.parse(members.find(m=>m.name==='component.json').data);
        assert.strictEqual(manifest.id,'mgu-monitor-names');assert(manifest.files.every(f=>/^[a-f0-9]{64}$/.test(f.sha256)));
        assert(manifest.units.some(u=>u.name==='mgu-monitor-names.timer'));
        console.log('PASS: actual UID/title export, moved UID, RHMI titles, safe public map, 10-second log batching and native Store tool packaging');
    }).catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>fs.rmSync(tmp,{recursive:true,force:true}));
} catch(e) {fs.rmSync(tmp,{recursive:true,force:true});throw e;}
