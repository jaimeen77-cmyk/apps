'use strict';
const assert=require('assert'),fs=require('fs'),vm=require('vm'),path=require('path');
const stage=path.resolve(process.argv[2]),root=stage+'/source/javascript',runtime=fs.readFileSync(root+'/kit/mgu.js','utf8');
const {RenderQueue}=require('../../apps/cluster_redline/render-queue');
function wire(source){const start=source.indexOf('function wireSettings('),end=source.indexOf('// widget text cells:',start),box={};vm.runInNewContext(source.slice(start,end)+';this.wire=wireSettings;',box);return box.wire;}
function nativeFixture(){
 const schema=require(root+'/kit/app-spec.json').settings,values={},listeners=[],calls=[],clicks=[];
 schema.forEach(s=>values[s.key]=s.default);
 const settings={schema,get:k=>values[k],display:k=>String(values[k]),onChange:f=>listeners.push(f),set(k,v){values[k]=v;listeners.forEach(f=>f(k));}};
 const ui={comp:n=>n.startsWith('SET_')?{}:null,onClick:(...a)=>clicks.push(a)};
 for(const key of ['text','checked','selected','cells'])ui[key]=(...a)=>{calls.push([key,...a]);return Promise.resolve();};
 return {ctx:{settings,ui,display:{}},calls,clicks,listeners};
}
async function run(){
 const legacy=nativeFixture();await wire(runtime)(legacy.ctx,false);legacy.calls.length=0;
 legacy.ctx.settings.set('hudRpmGaugeOffsetX',10);legacy.ctx.settings.set('hudGearOffsetX',10);
 // Upstream used to refresh every generated cell (200+ updates for two moves); it now refreshes far fewer,
 // but the generated page is still updated, which a custom settings page must avoid entirely.
 const oldCalls=legacy.calls.length;assert(oldCalls>0,'baseline: the generic path updates the unused native settings page');
 const custom=nativeFixture();await wire(runtime)(custom.ctx,true);custom.ctx.settings.set('hudRpmGaugeOffsetX',10);custom.ctx.settings.set('hudGearOffsetX',10);
 assert.strictEqual(custom.calls.length,0);assert.strictEqual(custom.clicks.length,0);assert.strictEqual(custom.listeners.length,0);
 const generic=nativeFixture();await wire(runtime)(generic.ctx,false);assert(generic.calls.length>0);generic.calls.length=0;generic.ctx.settings.set('hudGearOffsetX',10);assert(generic.calls.length>0,'other apps retain generic settings');
 let writes=0,saved;const box={module:{exports:{}},DATA_DIR:'/mock',path,fs:{existsSync:()=>false,readFileSync:()=>{throw Error('No saved settings');},writeFileSync:(file,data)=>{writes++;saved=JSON.parse(data);}},log:{warn(){},error:e=>{throw e}}};
 const start=runtime.indexOf('class Settings {'),end=runtime.indexOf('\nclass Ui',start);assert(start>=0&&end>start);
 vm.runInNewContext(runtime.slice(start,end)+';module.exports=Settings;',box);
 const store=new box.module.exports([{key:'x',default:0},{key:'y',default:0}]);
 store.onChange(()=>{assert.strictEqual(store.get('x'),10);assert.strictEqual(store.get('y'),20);});
 store.setMany({x:10,y:20});assert.strictEqual(writes,1);assert.deepStrictEqual(saved,{x:10,y:20});store.setMany({x:10,y:20});assert.strictEqual(writes,1,'unchanged layout must not rewrite settings');
 const full=new box.module.exports(require(root+'/kit/app-spec.json').settings),{SettingsPage}=require(root+'/settings-ui');
 const page=new SettingsPage(full);page.selectTab(1);page.activate(page.keys().indexOf('layout'));page.selectLayoutPart(1);
 let observed=0;full.onChange(()=>{assert.strictEqual(full.get('hudRpmGaugeOffsetX'),10);assert.strictEqual(full.get('hudGearOffsetX'),10);observed++;});
 const before=writes;page.adjust(0,1);assert.strictEqual(writes-before,1,'real multi-selection movement persists once');assert.strictEqual(observed,2,'listeners see only the complete coordinate batch');
 let jobs=new Map(),id=0,draws=0,value=0,seen=[],release;const errors=[];
 const timers={setTimeout:fn=>{jobs.set(++id,fn);return id;},clearTimeout:n=>jobs.delete(n)};
 const queue=new RenderQueue(async()=>{draws++;seen.push(value);if(draws===1)await new Promise(r=>release=r);},e=>errors.push(e),timers);
 for(let n=0;n<100;n++){value=n;queue.request();}assert.strictEqual(jobs.size,1);
 const job=jobs.entries().next().value;jobs.delete(job[0]);job[1]();assert.deepStrictEqual(seen,[99]);
 for(let n=100;n<200;n++){value=n;queue.request();}assert.strictEqual(jobs.size,0,'no second render while HMI is busy');
 release();for(let n=0;n<5;n++)await Promise.resolve();assert.strictEqual(jobs.size,1);
 const second=jobs.entries().next().value;jobs.delete(second[0]);second[1]();for(let n=0;n<5;n++)await Promise.resolve();assert.deepStrictEqual(seen,[99,199]);assert.strictEqual(errors.length,0);
 queue.request();queue.stop();assert.strictEqual(jobs.size,0);queue.request();assert.strictEqual(jobs.size,0);
 assert(runtime.includes("wireSettings(ctx, !!(impl && impl.settingsUI === 'custom'))"),'production runtime must actually pass the opt-out flag');
 console.log('PASS: generic two-element movement emits '+oldCalls+' native settings updates; custom UI emits zero, generic apps retain settings, one atomic batch save and latest-only serialized rendering');
}
run().catch(e=>{console.error(e);process.exitCode=1;});
