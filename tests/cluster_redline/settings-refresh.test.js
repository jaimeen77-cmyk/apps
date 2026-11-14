'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(__dirname,'../../apps/cluster_redline');
let entry,loop,requests=0,now=0;const clicks={};
const mocks={fs:{statSync(){throw Error('ENOENT');},mkdirSync(){},readFileSync(){return '{}';}},path,
 './kit/mgu':{run:e=>entry=e},'./kit/i18n':{t:x=>x},
 './settings-ui':{SettingsPage:class{constructor(s,changed){this.changed=changed;}selectTab(){this.changed();}},W:1600,H:520},
 './settings-chrome':{configure(){}},'./worker':{start(){throw Error('disabled app must not start');}},
 './migrate':{migrate(){}},'./output-status':{mapStatus:()=>''},
 './render-queue':{RenderQueue:class{request(){requests++;}async flush(){}stop(){}}}};
vm.runInNewContext(fs.readFileSync(root+'/main.js','utf8'),{require:n=>{assert(n in mocks,'unexpected runtime dependency '+n);return mocks[n];},Date:{now:()=>now,parse:Date.parse}});
(async()=>{
 await entry.start({dataDir:'/d',spec:{id:'cluster_redline',version:'test'},settings:{get:()=>false,set(){},onChange(){}},
  ui:{onClick:(n,f)=>clicks[n]=f,text:async()=>{}},onTap(){},onTab(){},onLayout(){},loop:(name,fps,f)=>loop=f});
 for(let i=0;i<120;i++){now=i*1000/60;loop();}
 assert.equal(requests,4,'60 Hz GPU ticks must produce only 2 status refreshes per second');
 clicks.BTN_BASIC();assert.equal(requests,5,'user actions bypass periodic throttle');
 now=-100;loop();assert.equal(requests,6,'clock adjustment must not freeze settings');
 console.log('PASS settings periodic refresh capped at 2 fps on 60 Hz host; actions remain immediate');
})().catch(e=>{console.error(e);process.exitCode=1;});
