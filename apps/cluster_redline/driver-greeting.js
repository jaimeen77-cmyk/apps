'use strict';
// The HUD greeting (settings per driver), when the engine starts: the worker reports the engine (RPM) each frame,
// the settings host (driver-profiles.js, in main.js, same process) reports the driver it recognises. A start counts
// when the engine had been off at least RESTART_MS (so auto start-stop restarts are not greeted) or is the first
// since the app started. A driver change while the app runs is greeted at once. An eDrive (plug-in hybrid) car may
// start without its engine: there the driver's recognition at the app's start is the start.
// The greeting waits up to NAME_WAIT_MS for the driver to be recognised (the engine may start first), then shows for
// SHOW_MS as soon as the HUD can take it; dropped if that does not happen within WAIT_MS.
const SHOW_MS=3000,WAIT_MS=60000,NAME_WAIT_MS=15000,RESTART_MS=180000,RUNNING_RPM=400;
const s={enabled:false,hybrid:false,known:false,name:null,running:false,lastRunAt:null,pending:null,showing:null};
const now0=t=>typeof t==='number'?t:Date.now();
function queue(t){s.pending={at:t};s.showing=null;}
/** Settings per driver on / off (no greeting while off). */
function setEnabled(on){s.enabled=!!on;if(!on){s.pending=null;s.showing=null;s.known=false;s.name=null;}}
function setHybrid(on){s.hybrid=!!on;}
/** A driver recognised: name (or null); change: another driver was in use before (not the first since the app started). */
function driver(name,change,now){
 const t=now0(now);s.known=true;s.name=typeof name==='string'&&name?name:null;
 if(!s.enabled)return;
 if(change||s.hybrid)queue(t);
}
/** The engine each frame: rpm (null when unknown) and whether that reading is fresh. */
function engine(rpm,fresh,now){
 const t=now0(now),running=!!fresh&&typeof rpm==='number'&&rpm>=RUNNING_RPM;
 if(running&&!s.running&&s.enabled&&!s.hybrid&&(s.lastRunAt===null||t-s.lastRunAt>=RESTART_MS))queue(t);
 if(running)s.lastRunAt=t;
 s.running=running;
}
/** What to show now ({ name } or null); ready: the HUD overlay can be drawn. */
function read(ready,now){
 const t=now0(now);
 if(s.pending&&t-s.pending.at>WAIT_MS)s.pending=null;
 if(s.pending&&ready&&(s.known||t-s.pending.at>=NAME_WAIT_MS)){s.showing={name:s.name,until:t+SHOW_MS};s.pending=null;}
 if(s.showing&&t>=s.showing.until)s.showing=null;
 return s.showing?{name:s.showing.name}:null;
}
/** The worker reads the engine speed for the greeting while it is on. */
function wantsEngine(){return s.enabled&&!s.hybrid;}
function reset(){Object.assign(s,{enabled:false,hybrid:false,known:false,name:null,running:false,lastRunAt:null,pending:null,showing:null});}
module.exports={setEnabled,setHybrid,driver,engine,read,wantsEngine,reset,SHOW_MS,WAIT_MS,NAME_WAIT_MS,RESTART_MS};
