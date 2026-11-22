'use strict';
// The HUD greeting (settings per driver), when the engine starts: the worker reports the engine (RPM) each frame,
// the settings host (driver-profiles.js, in main.js, same process) reports the driver it recognises. A start counts
// when the engine had been off at least RESTART_MS (so auto start-stop restarts are not greeted) or is the first
// since the app started. A driver change while the app runs is greeted at once. An eDrive (plug-in hybrid) car may
// start without its engine: there the driver's recognition at the app's start is the start.
// A shorter stop counts too when a door was opened while the engine was off (1.3.28: someone got out or in, as at a
// petrol station; auto start-stop restarts keep the doors shut).
// The greeting waits up to NAME_WAIT_MS for the driver to be recognised (the engine may start first), then shows for
// SHOW_MS as soon as the HUD or the cluster can take it; dropped if that does not happen within WAIT_MS (1.3.28: 3
// minutes, was 1: the renderer can come up late after the head unit wakes).
// status() keeps what happened last (shown, a restart not greeted, no display ready), for the settings screen.
const SHOW_MS=3000,WAIT_MS=180000,NAME_WAIT_MS=15000,RESTART_MS=180000,RUNNING_RPM=400;
const s={enabled:false,hybrid:false,known:false,name:null,running:false,lastRunAt:null,pending:null,showing:null,doorOff:false,last:null};
function note(what){s.last={what,wall:Date.now()};}
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
 if(running&&!s.running&&s.enabled&&!s.hybrid){if(s.lastRunAt===null||t-s.lastRunAt>=RESTART_MS||s.doorOff)queue(t);else note('restart');}
 if(running){s.lastRunAt=t;s.doorOff=false;}
 s.running=running;
}
/** Any door open now (the door-open warning's door switches): while the engine is off, the next start is greeted. */
function door(open){if(open&&!s.running)s.doorOff=true;}
/** What to show now ({ name } or null); ready: the HUD overlay can be drawn. */
function read(ready,now){
 const t=now0(now);
 if(s.pending&&t-s.pending.at>WAIT_MS){s.pending=null;note('not_ready');}
 if(s.pending&&ready&&(s.known||t-s.pending.at>=NAME_WAIT_MS)){s.showing={name:s.name,until:t+SHOW_MS};s.pending=null;note('shown');}
 if(s.showing&&t>=s.showing.until)s.showing=null;
 return s.showing?{name:s.showing.name}:null;
}
/** The worker reads the engine speed for the greeting while it is on. */
function wantsEngine(){return s.enabled&&!s.hybrid;}
/** For the settings screen: { last: { what: 'shown' | 'restart' | 'not_ready', wall: Date.now() then } | null, waiting }. */
function status(){return {last:s.last,waiting:!!s.pending};}
function reset(){Object.assign(s,{enabled:false,hybrid:false,known:false,name:null,running:false,lastRunAt:null,pending:null,showing:null,doorOff:false,last:null});}
module.exports={setEnabled,setHybrid,driver,engine,door,read,status,wantsEngine,reset,SHOW_MS,WAIT_MS,NAME_WAIT_MS,RESTART_MS};
