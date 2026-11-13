'use strict';
// 1.2.46: average speed and driving time as auxiliary items, TPMS tyre data, the cluster-only Tyres & trip
// layout (gauge support), and what is read for it.
// Usage: node redline-1-2-46.test.js <built cluster_redline stage>
const assert=require('assert'),path=require('path'),root=path.join(path.resolve(process.argv[2]),'source/javascript');
const {AuxInfo,SOURCES,avgSpeed,tripTime,auxOf}=require(root+'/aux-info'),{metric}=require(root+'/aux-draw'),RL=require(root+'/redline-hud'),D=require(root+'/display-config');
const {settings}=require(root+'/policy'),{demand}=require(root+'/data-demand'),CL=require(root+'/draw');
// decoding, as Live Data reads these fields
assert.strictEqual(avgSpeed({speedAverage1BC1:463,statusUnitOfMeasurementSpeedBC:'KM_S_H__KM'}).toFixed(1),'46.3');
assert.strictEqual(avgSpeed({speedAverage1BC1:288,statusUnitOfMeasurementSpeedBC:'MPH__MLS'}).toFixed(1),'46.3');
assert.strictEqual(avgSpeed({speedAverage1BC1:65535}),null);
assert.strictEqual(tripTime({rideDurationHours:1,rideDurationMinutes:12}),72);assert.strictEqual(tripTime({rideDurationHours:1,rideDurationMinutes:60}),null);
const a=new AuxInfo(),src=f=>SOURCES.find(s=>s.field===f);
a.sample(src('statusTyreTemperature'),{actualValueTemperatureTyreFLH:78,actualValueTemperatureTyreFRH:81,actualValueTemperatureTyreRLH:65535,actualValueTemperatureTyreRRH:250},1000);
a.sample(src('statusTyrePressure'),{actualValuePressureTyreFLH:25,actualValuePressureTyreFRH:25,actualValuePressureTyreRLH:27,actualValuePressureTyreRRH:65533},1000);
a.sample(src('statusBordcomputerAverage'),{consumptionAverage1BC1:84,statusUnitOfMeasurementConsumptionBC:'VERBRAUCH_IN_L_S_100KM',speedAverage1BC1:463,statusUnitOfMeasurementSpeedBC:'KM_S_H__KM'},1000);
a.sample(src('statusBordcomputerTravelData'),{rideDurationHours:1,rideDurationMinutes:12},1000);
const r=a.read(1500);
assert.deepStrictEqual(r.tyreTemp,{FL:38,FR:41,RL:null,RR:null},'°C + 40; 65535 and above 150 °C are no value');
assert.deepStrictEqual(Object.keys(r.tyrePressure).map(k=>r.tyrePressure[k]===null?null:+r.tyrePressure[k].toFixed(1)),[2.5,2.5,2.7,null]);
assert.strictEqual(r.avgSpeed.toFixed(1),'46.3');assert.strictEqual(r.tripTime,72);
assert.strictEqual(auxOf('tFL'),'tyres');assert.strictEqual(auxOf('pRR'),'tyres');assert.strictEqual(auxOf('oilFallback'),'oil');
// the two new items in both auxiliary modes
assert(D.METRICS.includes('avgSpeed')&&D.METRICS.includes('tripTime'));
assert.deepStrictEqual(D.auxConfig({mode:'gauges',items:['avgSpeed','tripTime']}).items,['avgSpeed','tripTime']);
const st={config:settings({}),aux:{avgSpeed:46.3,tripTime:72}};
assert.strictEqual(metric(st,'tripTime').text,'1:12');assert.strictEqual(Math.round(metric(st,'avgSpeed').value),46);
// layout registration: cluster only, gauge support listed
assert(RL.STYLES.includes('tyres')&&RL.CLUSTER_ONLY.includes('tyres')&&!RL.stylesFor('hud').includes('tyres')&&RL.stylesFor('cluster').includes('tyres'));
assert.strictEqual(settings({hudDesign:'rl-tyres'}).hudDesign,'own');assert.strictEqual(settings({clusterDesign:'rl-tyres'}).clusterDesign,'rl-tyres');
assert(RL.GAUGE_LAYOUTS.includes('tyres')&&RL.GAUGE_LAYOUTS.includes('sportdial'));
// what is read: the tyre data only while the car is shown; trip data only when chosen
const cfg=settings({clusterDesign:'rl-tyres',sportClusterOutput:'redline',allClusterOutput:'redline',clusterAuxConfig:JSON.stringify({mode:'values',items:['avgSpeed','tripTime']})});
const dm=demand(cfg,'SPORT');
['de.bmw.infotainment.vehicle.TPMS.statusTyreTemperature','de.bmw.infotainment.vehicle.TPMS.statusTyrePressure','de.bmw.infotainment.KombiIF.statusBordcomputerAverage','de.bmw.infotainment.KombiIF.statusBordcomputerTravelData'].forEach(f=>assert(dm.fields.has(f),f));
const hidden=demand(settings(Object.assign({},cfg,{clusterRlCarHidden:true,clusterAuxConfig:JSON.stringify({mode:'values',items:['oil']})})),'SPORT');
assert(!hidden.fields.has('de.bmw.infotainment.vehicle.TPMS.statusTyreTemperature')&&!hidden.fields.has('de.bmw.infotainment.KombiIF.statusBordcomputerTravelData'));
// the layout draws with and without data, and gauge mode puts bars under two items
const frame=(aux,items,mode)=>CL.draw({config:settings({clusterDesign:'rl-tyres',clusterAuxConfig:JSON.stringify({mode,items})}),renderRpm:true,rpm:3000,gear:'D4',mode:'SPORT',aux,shift:false,flash:false});
const full=frame({tyreTemp:{FL:38,FR:41,RL:47,RR:82},tyrePressure:{FL:2.5,FR:2.5,RL:2.7,RR:2.6},avgSpeed:46,tripTime:72,economy:11.9,oil:96},['economy','avgSpeed','tripTime','oil'],'values');
const none=frame({},['economy','avgSpeed','tripTime','oil'],'values');assert(!Buffer.from(full.d).equals(Buffer.from(none.d)));
const t0=process.hrtime();for(let i=0;i<50;i++)frame({tyreTemp:{FL:38+i%5,FR:41,RL:47,RR:82},tyrePressure:{FL:2.5,FR:2.5,RL:2.7,RR:2.6},avgSpeed:46,tripTime:72},['avgSpeed','oil'],'gauges');const dt=process.hrtime(t0);
console.log('  Tyres & trip full frame (no cache): '+((dt[0]*1e3+dt[1]/1e6)/50).toFixed(2)+' ms');
console.log('PASS: average speed / driving time / TPMS decoding (Live Data scales, invalid values dropped), both aux modes, cluster-only Tyres & trip with gauge support, data read only while shown');
