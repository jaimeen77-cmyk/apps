'use strict';
const assert=require('assert'),{scan}=require('../tools/inspect-start-stop');
const catalog={interfaces:{
 'de.bmw.Engine':{serviceId:10,version:{major:1},fields:{statusMSA:{getter:{id:1}},settingStartStop:{getter:{id:2},setter:{id:3}},temperature:{getter:{id:4}}},methods:{requestAutoStartStop:{methodId:5,parameters:[{name:'mode',type:'UInt8'}]}},events:{automaticEngineStop:{eventId:32769}}},
 'de.bmw.AutomaticStartStop':{fields:{mode:{getter:{id:6}}}},
 'de.bmw.Other':{fields:{multisampling:{getter:{id:1}}}}
},instanceIDs:{'de.bmw.Engine':{'1':128}}};
const r=scan(catalog);assert.equal(r.matched,5);assert(r.readOnly);assert.equal(r.interfacesExamined,3);
const find=n=>r.matches.find(m=>m.name===n);
assert.deepEqual(find('statusMSA').access,{getter:true,setter:false,notifier:false});
assert(!find('statusMSA').interpretation.includes('control candidate'));
assert(find('settingStartStop').interpretation.includes('UNVERIFIED'));
assert.equal(find('requestAutoStartStop').definition.parameters[0].type,'UInt8');
assert.deepEqual(find('statusMSA').instances,{'1':128});
assert(!find('temperature'));assert(!find('multisampling'));
assert.throws(()=>scan({components:[]}),/master catalog/);
assert.equal(scan({interfaces:{}}).matched,0);
const many={interfaces:{'de.bmw.StartStop':{methods:{}}}};for(let i=0;i<120;i++)many.interfaces['de.bmw.StartStop'].methods['method'+i]={methodId:i};
assert.equal(scan(many).matches.length,100);assert(scan(many).truncated);
console.log('PASS definition-only Start/Stop discovery, access distinction, missing catalog and bounded output');
