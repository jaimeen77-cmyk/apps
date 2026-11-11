'use strict';
// Host-only: inspect and render the actual Store packages; no vehicle SDK.
const assert = require('assert'), fs = require('fs'), path = require('path');
const cp = require('child_process'), vm = require('vm'), os = require('os');
const { build } = require('../tools/store-build');
const S = require('../apps/storage/sysinfo');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'storage-test-'));
const previews = process.env.STORAGE_PREVIEW_DIR;
async function checkRenderer(language) {
    const id = language === 'ko' ? 'storage' : 'storage_en';
    const file = build({ template:'storage', id, version:'1.0.2', language,
        dir:language === 'ko' ? 'apps/storage' : 'store/apps/storage_en',
        source:'apps/storage', out:path.join(temp,id) });
    const stage = path.join(temp,id,'installed');fs.mkdirSync(stage);
    cp.execFileSync('tar',['-xzf',file,'-C',stage]);
    const js = path.join(stage,'package/javascript');
    const spec = require(path.join(js,'kit/app-spec.json'));
    assert.strictEqual(spec.version,'1.0.2');
    const source = require('../apps/storage/app.json');
    assert.deepStrictEqual(spec.settings.map(s=>[s.key,s.default]),source.settings.map(s=>[s.key,s.default]));
    assert.strictEqual(/[가-힣]/.test(spec.settings[0].label),language==='ko');
    const {Canvas} = require(path.join(js,'kit/canvas'));
    const {Recorder,play} = require(path.join(js,'kit/record'));
    const {t} = require(path.join(js,'kit/i18n'));
    const {theme} = require(path.join(js,'kit/themes'));
    const labels = [], original = Canvas.prototype.text;
    const originalRecord = Recorder.prototype.text;
    Canvas.prototype.text = function(value) {labels.push(t(value));return original.apply(this,arguments);};
    Recorder.prototype.text = function(value) {labels.push(t(value));return originalRecord.apply(this,arguments);};
    let loop, widget, start, frame, cells = [];
    const values = {};spec.settings.forEach(s=>{values[s.key]=s.default;});values.demo='ok';
    const handlers = {}, callbacks = [];
    const ctx = {spec,dataDir:'/var/opt/public/oap/oap_12212/data',
        theme:()=>theme('m_tricolour'),canvas:(w,h)=>new Recorder(w,h),
        log:{info(){},warn(e){throw Error(e);}},
        settings:{get:k=>values[k],onChange(fn){callbacks.push(fn);}},
        ui:{onClick:(name,fn)=>{handlers[name]=fn;},image:async(name,cv)=>{assert.strictEqual(name,'MAIN_GFX');frame=cv;}},
        onTab(){},loop:(name,hz,fn)=>{loop=fn;},
        widget:{loop:(hz,fn)=>{widget=fn;},onChange(){},active:()=>false,set:(spawn,cell,value,type)=>cells.push([spawn,cell,value,type])}};
    try {
        vm.runInNewContext(fs.readFileSync(path.join(js,'app.js'),'utf8'),{
            require(name){if(name==='./kit/mgu')return {run:impl=>{start=impl.start(ctx);}};
                return name[0]==='.'?require(path.join(js,name)):require(name);},
            process:{env:{},on(){}},setInterval:()=>0,clearInterval(){},console});
        await start;
        for(const mode of ['ok','crit']) {
            values.demo=mode;await handlers.BTN_ACTION();await loop();
            assert(labels.some(s=>s.toLowerCase()===t('File systems').toLowerCase()));
            if(mode==='crit')assert(labels.some(s=>s.includes('95%')&&s.includes(language==='ko'?'경고':'STORAGE HIGH')));
            assert(labels.includes(t('DEMO')));
            if(previews){fs.mkdirSync(previews,{recursive:true});fs.writeFileSync(path.join(previews,`disks-${mode}-${language}.png`),play(frame.words(),new Canvas(frame.w,frame.h)).png());}
            cells=[];const cv=widget({spawnId:1,big:true});
            assert(cells.some(c=>c[1]==='Title'&&c[2].includes(t('Storage'))));
            assert(cells.some(c=>c[1]==='Progress'&&c[2]===(mode==='crit'?95:44)));
            if(previews)fs.writeFileSync(path.join(previews,`widget-${mode}-${language}.png`),cv.png());
        }
        values.page='apps';callbacks.forEach(fn=>fn('page'));await loop();await loop();
        assert(labels.some(s=>s.toLowerCase()===t('Installed apps').toLowerCase()));
        assert(labels.some(s=>s.includes(language==='ko'?'앱 4개':'4 apps')));
        if(previews)fs.writeFileSync(path.join(previews,`apps-${language}.png`),play(frame.words(),new Canvas(frame.w,frame.h)).png());
        // Exercise the packaged Widget.set and real HmiText with an SDK bridge mock.
        const box={module:{exports:{}},__dirname:path.join(js,'kit'),console,process,Buffer,setTimeout,clearTimeout,
            require(name){if(name==='oap-sdk')return {logging:{getSDKLogger:()=>({info(){},warn(e){throw Error(e);},error(){}})}};
                if(name==='./display')return {};if(name==='./sheet')return {};
                return name[0]==='.'?require(path.join(js,'kit',name)):require(name);}};
        vm.runInNewContext(fs.readFileSync(path.join(js,'kit/mgu.js'),'utf8')+'\nmodule.exports.TestWidget=Widget;',box);
        const instance=new box.module.exports.TestWidget({});let strings,write;
        instance.comp={getStringBundle:()=>({setStrings:async s=>{strings=s;}}),setValue:async(...args)=>{write=args;}};
        await instance.set(7,'Title','Storage','Text');
        if(language==='ko') {assert.strictEqual(Object.values(strings)[0],'저장공간');assert.strictEqual(write[3],'StringId');}
        else {assert.strictEqual(write[2],'Storage');assert.strictEqual(write[3],'Text');}
        const bundle=require(path.join(stage,'package/rhmiDataStartWidget/variantGroups/Common/texts/en_GB.json'));
        assert(Object.prototype.hasOwnProperty.call(bundle,'SID_CN_DYNAMIC_0255'));
        assert(Object.keys(bundle).length<=1024);
    } finally {Canvas.prototype.text=original;Recorder.prototype.text=originalRecord;}
}
(async()=>{
    const df='Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/mmcblk0p10 1000 950 25 95% /var/opt\n/dev/very-long-device\n 200 10 180 5% /path with space\ninvalid NaN 0 0 0% /bad\n';
    const parsed=S.parseDf(df);assert.strictEqual(parsed.length,2);assert.strictEqual(parsed[0].avail,25*1024);assert.strictEqual(parsed[1].mount,'/path with space');
    assert.strictEqual(S.parseDf('not df'),null);
    const root={mount:'/',alsoAt:[]},apps={mount:'/var/opt',alsoAt:['/alias']};
    assert.strictEqual(S.fsOf([root,apps],'/var/opt/public/oap'),apps);
    assert.strictEqual(S.fsOf([root,apps],'/alias/file'),apps);
    assert.strictEqual(S.fsOf([root,apps],'/var/optional'),root);
    const appRoot=path.join(temp,'oap');fs.mkdirSync(appRoot);
    const a=path.join(appRoot,'oap_12212');fs.mkdirSync(a);fs.writeFileSync(path.join(a,'package.json'),' {"name":"fixture"}');
    fs.writeFileSync(path.join(a,'file'),Buffer.alloc(9000));fs.symlinkSync('/proc',path.join(a,'outside'));
    fs.symlinkSync(a,path.join(appRoot,'oap_12213'));
    const result=await S.appFolders(appRoot);assert.strictEqual(result.list.length,1);assert.strictEqual(result.list[0].name,'fixture');assert(result.list[0].bytes>=9000&&result.list[0].bytes<100000);
    assert.strictEqual((await S.folderSize(a,1)).partial,true);
    assert.strictEqual((await S.folderSize(path.join(temp,'missing'))).denied,1);
    assert((await S.appFolders(path.join(temp,'missing'))).error);
    const real=await S.fileSystems();assert(!real.error&&real.list.length);assert(S.memory().total>0&&S.uptime()>0);
    await checkRenderer('ko');await checkRenderer('en');
    console.log('PASS: Storage 1.0.2 actual packages, KO/EN disks/apps/alerts/widgets, Unicode widget transport, df/parser, read-only filesystem measurement and demo labels');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>fs.rmSync(temp,{recursive:true,force:true}));
