'use strict';
// HUD turn signals: the direction from the car's light module (de.bmw.body.Light StatusFunctionsIndicators /
// StatusFunctionsIndicators2) and the flash phase the HUD shows.
//
// The binding hands an enum over as its name or as its number. controlIndicateDirection is the stalk / hazard
// switch: 1 and 3 left (tap, steady), 2 and 4 right, 8 both (hazards), 0 off. activeFunctionIndicateDirection is the
// function blinking: 7, 9, 18, 20, 22 left; 8, 10, 19, 21, 23 right; hazard and alarm functions (1, 5, 6, 11, 12, 13,
// 16, 17, 24, 25) both; 0 off. Values from BMW's interface catalog, as cluster_info (appscluster_fork) reads them.
const CONTROL={BLINKEN_AUS:0,TIPP_BLINKEN_LINKS_EIN:1,TIPP_BLINKEN_RECHTS_EIN:2,DAUER_BLINKEN_LINKS_EIN:3,DAUER_BLINKEN_RECHTS_EIN:4,BEIDSEITIGES_BLINKEN_EIN:8};
const ACTIVE={BLINKEN_AUS:0,CRASH_BLINKEN:1,DWA_BLINKEN:5,WARNBLINKEN_MANUELL:6,DAUERBLINKEN_LINKS:7,DAUERBLINKEN_RECHTS:8,TIPPBLINKEN_LINKS:9,TIPPBLINKEN_RECHTS:10,
 UEBERFALLALARM:11,FAS_WARNBLINKEN_AUSPRAEGUNG_1:12,AUFFAHRWARNBLINKEN:13,WARNBLINKEN_NACH_GEFAHRENBREMSUNG:16,WARNBLINKEN_VON_RCP:17,
 FAS_RICHTUNGSBLINKEN_LOWPRIO_LINKS:18,FAS_RICHTUNGSBLINKEN_LOWPRIO_RECHTS:19,FAS_RICHTUNGSBLINKEN_MIDPRIO_LINKS:20,FAS_RICHTUNGSBLINKEN_MIDPRIO_RECHTS:21,
 FAS_RICHTUNGSBLINKEN_HIGHPRIO_LINKS:22,FAS_RICHTUNGSBLINKEN_HIGHPRIO_RECHTS:23,FAS_WARNBLINKEN_AUSPRAEGUNG_2:24,FAS_WARNBLINKEN_AUSPRAEGUNG_3:25};
const LEFT=[7,9,18,20,22],RIGHT=[8,10,19,21,23],BOTH=[1,5,6,11,12,13,16,17,24,25];
// The cluster's own flasher: about 640 ms a cycle, lit about 335 ms; the head unit hears of the stalk ~40 ms after
// the cluster's first flash.
const ON_MS=335,CYCLE_MS=638,LEAD_MS=40;
function code(v,names){if(typeof v==='string'){if(Object.prototype.hasOwnProperty.call(names,v))return names[v];const n=Number(v);return isFinite(n)?n:null;}return typeof v==='number'?v:null;}
// A field however the value is wrapped ({ controlIndicateDirection: … } or nested one level deeper).
function field(v,key,depth){if(!v||typeof v!=='object')return undefined;if(key in v)return v[key];if((depth||0)>3)return undefined;for(const k of Object.keys(v)){const r=field(v[k],key,(depth||0)+1);if(r!==undefined)return r;}return undefined;}
/** 'off' | 'left' | 'right' | 'both', or null when the value says nothing. */
function direction(value){
 const c=code(field(value,'controlIndicateDirection'),CONTROL),a=code(field(value,'activeFunctionIndicateDirection'),ACTIVE);
 let dir=c===1||c===3?'left':c===2||c===4?'right':c===8?'both':c===0?'off':null;
 if(dir===null||dir==='off'&&a!==null&&a>0&&a<250)dir=LEFT.includes(a)?'left':RIGHT.includes(a)?'right':BOTH.includes(a)?'both':a===0?'off':dir;
 return dir;
}
class TurnSignal{
 constructor(){this.dir='off';this.at=null;this.since=0;}
 sample(value,now){const d=direction(value);if(d===null)return;if(d!==this.dir){this.dir=d;this.since=now-LEAD_MS;}this.at=now;}
 clear(){this.dir='off';this.at=null;}
 /** { indicator, lit }: lit is the flash phase (on while the cluster's arrow is lit). */
 // The fields notify on change only: the direction holds (flashing) until the car says otherwise or the
 // interface goes away (clear()).
 read(now){const dir=this.at!==null?this.dir:'off';
  return {indicator:dir,lit:dir!=='off'&&((now-this.since)%CYCLE_MS+CYCLE_MS)%CYCLE_MS<ON_MS};}
}
module.exports={direction,TurnSignal,ON_MS,CYCLE_MS};
