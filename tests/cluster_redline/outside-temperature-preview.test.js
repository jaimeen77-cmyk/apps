'use strict';
// Notifier-only exterior temperature survives the Store build filter; leaving the settings screen ends Position / size.
const assert=require('assert'),path=require('path'),root=path.join(path.resolve(process.argv[2]),'source/javascript');
const {filterAux}=require('../../apps/cluster_redline/aux-info'),spec=require(root+'/kit/app-spec.json'),{SettingsPage}=require(root+'/settings-ui');
const ENV='de.bmw.infrastructure.EnvironmentalInformation';
const manifest=()=>({proxies:{[ENV]:{attributes:{ExteriorTemperature:'rs'}}}});
const catalog=field=>({interfaces:{[ENV]:{fields:{ExteriorTemperature:field}}}});
const mode=field=>{const m=filterAux(manifest(),catalog(field));return m.proxies[ENV].attributes.ExteriorTemperature;};
assert.strictEqual(mode({notifier:{id:32770}}),'s','notifier only: subscribe (as the eDrive app does)');
assert.strictEqual(mode({getter:{id:7},notifier:{id:32770}}),'s','with a notifier the outside temperature is subscribed only, never read');assert.strictEqual(mode({getter:{id:7}}),'r');
{const CDS2='de.bmw.infotainment.vehicle.CDS2',m=filterAux({proxies:{[CDS2]:{attributes:{statusInjectionVolume:'rs'}}}},{interfaces:{[CDS2]:{fields:{statusInjectionVolume:{getter:{id:7},notifier:{id:32770}}}}}});
 assert.strictEqual(m.proxies[CDS2].attributes.statusInjectionVolume,'rs','other fields keep getter + notifier');}
assert.strictEqual(mode({}),undefined,'neither: the optional field is dropped');assert.strictEqual(mode(undefined),undefined);
const values={};spec.settings.forEach(s=>{values[s.key]=s.default;});
const page=new SettingsPage({schema:spec.settings,get:k=>values[k],set:(k,v)=>{values[k]=v;},setMany(c){Object.assign(values,c);}},null,'1.2.6');
page.selectTab(3);page.activate(page.keys().indexOf('layout'));assert(/^nav:/.test(values.layoutPreview));
page.leave();assert.strictEqual(page.open,null,'leaving the screen closes Position / size');assert.strictEqual(values.layoutPreview,'','and ends the preview');
page.selectTab(1);page.activate(page.keys().indexOf('layout'));page.open='layoutPresets';page.leave();assert.strictEqual(page.open,null);assert.strictEqual(values.layoutPreview,'');
page.activate(page.keys().indexOf('aux'));page.leave();assert.strictEqual(page.open,'auxMode','other screens are kept');
console.log('PASS: notifier-only exterior temperature kept by the build filter; leaving the settings screen ends Position / size and its preview');
