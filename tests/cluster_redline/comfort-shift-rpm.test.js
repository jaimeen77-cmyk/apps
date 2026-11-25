'use strict';
// Basic settings: Comfort / Eco shift alert RPM, under Shift alert RPM. Automatic keeps 90 % of the shift alert
// RPM; a set RPM is the shift point in every non-sport mode (lights from 50 %, yellow from 80 %, red at it).
// Usage: node comfort-shift-rpm.test.js <built cluster_redline stage>
const assert=require('assert'),path=require('path'),root=path.join(path.resolve(process.argv[2]),'source/javascript');
const {settings}=require(root+'/policy'),{shiftSpec,alertState}=require(root+'/shift-alert');
const {Canvas}=require(root+'/kit/canvas'),{getLanguage,t}=require(root+'/kit/i18n'),{SettingsPage}=require(root+'/settings-ui'),spec=require(root+'/kit/app-spec.json');

const auto=settings({});assert.strictEqual(auto.comfortShiftRpm,0);
assert.deepStrictEqual(shiftSpec(auto,'COMFORT'),{style:'comfort',shift:5000,start:2500,yellow:4000},'automatic: unchanged');
const set=settings({comfortShiftRpm:2500});
['COMFORT','COMFORT_PLUS','ECO_PRO','ECO_PRO_PLUS','PHEV_ECO','TRACTION'].forEach(mode=>assert.deepStrictEqual(shiftSpec(set,mode),{style:'comfort',shift:2500,start:1250,yellow:2000},mode));
assert.deepStrictEqual(shiftSpec(set,'SPORT'),shiftSpec(auto,'SPORT'),'sport modes keep the shift alert RPM');
assert.strictEqual(alertState({config:set,mode:'ECO_PRO',rpm:2500}).stage,'red','shift alert at 2500 in Eco');
assert.strictEqual(alertState({config:set,mode:'COMFORT',rpm:2100}).stage,'yellow');
assert.strictEqual(alertState({config:set,mode:'COMFORT',rpm:1000}).visible,false);
assert.strictEqual(settings({comfortShiftRpm:2600}).comfortShiftRpm,0,'unknown value: automatic');
assert(!spec.settings.some(s=>s.key==='comfortShiftRpm'),'kept outside app.json: the Store settings templates stay valid');

const values={};spec.settings.forEach(s=>{values[s.key]=s.default;});
const page=new SettingsPage({schema:spec.settings,get:k=>values[k],set:(k,v)=>{values[k]=v;},setMany(c){Object.assign(values,c);}},null,'1.2.9');
page.selectTab(0);page.activate(page.keys().indexOf('vehiclePreset'));const at=page.keys().indexOf('comfortShiftRpm');
assert.strictEqual(at,page.keys().indexOf('shiftRpm')+1,'right under Shift alert RPM');
page.focus=at;assert(/5000 rpm/.test(page.value(page.item(),page.config())),'automatic shows its RPM');
page.activate(at);assert.strictEqual(page.open,'comfortShiftRpm');page.choose(3);assert.strictEqual(values.comfortShiftRpm,2500);
assert.strictEqual(page.config().comfortShiftRpm,2500);assert.strictEqual(page.value(page.item(),page.config()),'2500 rpm');
page.change(-1);assert.strictEqual(values.comfortShiftRpm,2250);page.activate(at);page.choose(0);assert.strictEqual(values.comfortShiftRpm,0);

// Seven rows fit the Basic tab; in Korean nothing is left in English.
const english=[];let bottom=0;
const draw=()=>{const cv=new Canvas(1600,520),text=cv.text;cv.text=function(v,x,y,z,c,o){const shown=o&&o.literal?String(v):t(v);bottom=Math.max(bottom,y);if(/[A-Za-z]{4,}/.test(shown.replace(/\b(HUD|RPM|MGU|cluster|render)\b/g,'')))english.push(shown);return text.apply(this,arguments);};page.draw(cv,null,null);return cv;};
page.back();page.focus=at;draw();assert(bottom<=515,'last row inside the screen ('+bottom+')');
page.activate(at);draw();
if(getLanguage()==='ko')assert.deepStrictEqual(english,[],'Korean: '+english.join(' | '));
console.log('PASS: Comfort / Eco shift alert RPM under Shift alert RPM; automatic unchanged, a set RPM is the shift point in every non-sport mode, sport unchanged; kept outside app.json; fits the Basic tab in Korean');
