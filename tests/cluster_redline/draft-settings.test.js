'use strict';
const assert=require('assert'),fs=require('fs'),vm=require('vm'),path=require('path');
const dir=path.resolve(__dirname,'../../apps/cluster_redline'),spec=JSON.parse(fs.readFileSync(path.join(dir,'app.json')));
function load(name,mocks){const m={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(dir,name),'utf8'),{module:m,require:n=>Object.prototype.hasOwnProperty.call(mocks,n)?mocks[n]:require(path.join(dir,n)),console},{filename:name});return m.exports;}
function store(old){const v={};spec.settings.forEach(s=>v[s.key]=s.default);Object.assign(v,old);const callbacks=[];return {schema:spec.settings,get:k=>v[k],set(k,x){if(v[k]===x)return;v[k]=x;callbacks.forEach(f=>f(k));},onChange:f=>callbacks.push(f)};}
const ui=load('settings-ui.js',{'./kit/i18n':{t:x=>x},'./kit/gauges':{},'./settings-chrome':{header(cv){cv.tabRects=[];}},'./draw':{W:1088,H:480},'./hud-draw':{W:800,H:240},'./nav-draw':{W:240,H:112},'./nav-text':{W:240,H:48},'./component-canvas':{measurePart:()=>({w:580,h:90})}});
function canvas(){const c={labels:[],textWidth:(s,z)=>String(s).length*z/2,text(s){this.labels.push(s);}};for(const n of ['clear','line','polyline','fillRect','roundRect','gradientRect'])c[n]=()=>{};return c;}
const saved=store({autoStart:false,appEnabled:false}),page=new ui.SettingsPage(saved,null,'draft');
let cv=page.draw(canvas());
assert.strictEqual(page.keys().length,8,'Basic: six settings, the Comfort / Eco shift alert RPM and Settings per driver');
for(const r of cv.targets)assert(r.x>=0&&r.y>=0&&r.x+r.w<=1600&&r.y+r.h<=520);
cv.targets.find(r=>r.x===990).act();assert.strictEqual(saved.get('appEnabled'),true);assert.strictEqual(saved.get('autoStart'),false);
cv.targets.find(r=>r.x===1268).act();assert.strictEqual(saved.get('appEnabled'),false);
page.selectTab(1);page.activate(0);cv=page.draw(canvas());assert(cv.labels.includes('Back')&&!cv.labels.includes('Cancel'));
const back=cv.targets.find(r=>r.x===1210&&r.y===448);assert(back);back.act();assert.strictEqual(page.open,null);
page.activate(4);cv=page.draw(canvas());assert(cv.targets.find(r=>r.x===1210&&r.y===448));
assert.strictEqual(spec.settings.find(s=>s.key==='displayMode').options.length,2);
async function lifecycle(autoStart){
 const s=store({autoStart,appEnabled:!autoStart}),calls=[],events=new (require('events').EventEmitter)();let entry;
 class Page{constructor(){this.open=null;}draw(c){c.targets=[];return c;}}
 const app=load('main.js',{
  fs:{readFileSync:()=>JSON.stringify({autoStart,appEnabled:!autoStart,_outputsV:1})},path,
  './kit/mgu':{run:e=>entry=e},'./kit/i18n':{t:x=>x},'./settings-ui':{SettingsPage:Page,W:1600,H:520},
  './settings-chrome':{configure(){}},'./worker':{start(){calls.push('start');return {stop(){calls.push('stop');}};}},
  './migrate':require(path.join(dir,'migrate')),'./output-status':{mapStatus:()=>''}
 });
 await entry.start({app:events,settings:s,spec,dataDir:'/mock',log:{error:e=>{throw e}},canvas:canvas,
 ui:{text:async()=>{},image:async()=>{},onClick(){}},onTap(){},onTab(){},onLayout(){},loop(){}});
 assert.strictEqual(calls.length,autoStart?1:0);
 s.set('autoStart',!autoStart);assert.strictEqual(calls.length,autoStart?1:0,'auto-start preference must not change current operation');
 s.set('appEnabled',true);s.set('appEnabled',true);
 assert.strictEqual(calls.filter(x=>x==='start').length,1);
 s.set('appEnabled',false);assert.strictEqual(calls.filter(x=>x==='stop').length,1);
 s.set('appEnabled',true);assert.strictEqual(calls.filter(x=>x==='start').length,2);
 await new Promise(r=>setImmediate(r));
 events.emit('shutdown');
}
(async()=>{await lifecycle(false);await lifecycle(true);console.log('PASS: live app start/stop, independent next-start preference, both launch states, two visible operation buttons, six rows in bounds and submenu Back at bottom right');})().catch(e=>{console.error(e);process.exitCode=1;});
