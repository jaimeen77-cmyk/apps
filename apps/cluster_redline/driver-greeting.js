'use strict';
// The HUD greeting (settings per driver), when the engine starts: the worker reports the engine (RPM) each frame,
// the settings host (driver-profiles.js, in main.js, same process) reports the driver it recognises. A start counts
// when the engine had been off at least RESTART_MS (so auto start-stop restarts are not greeted) or is the first
// since the app started. A driver change is greeted at once only while the engine runs (1.3.30: the head unit wakes
// when a door opens and the key's driver replaces the account it woke with; that is not a start, the engine start is). An eDrive (plug-in hybrid) car may
// start without its engine: there the driver's recognition at the app's start is the start.
// A shorter stop counts too when a door was opened while the engine was off (1.3.28: someone got out or in, as at a
// petrol station; auto start-stop restarts keep the doors shut).
// The greeting waits up to NAME_WAIT_MS for the driver to be recognised (the engine may start first), then shows for
// SHOW_MS as soon as the HUD or the cluster can take it; dropped if that does not happen within WAIT_MS (1.3.28: 3
// minutes, was 1: the renderer can come up late after the head unit wakes).
// status() keeps what happened last (shown, a restart after a stop of 1 to 3 minutes not greeted, no display ready),
// for the settings screen; auto start-stop restarts at the lights (under a minute) are not noted, so they do not hide it.
const SHOW_MS=5000,WAIT_MS=180000,BYE_WAIT_MS=8000,PARK_MS=5000,NOTE_STOP_MS=60000,NAME_WAIT_MS=15000,RESTART_MS=180000,RUNNING_RPM=400;
const s={hello:true,bye:true,enabled:false,hybrid:false,known:false,name:null,running:false,lastRunAt:null,pending:null,showing:null,doorOff:false,last:null,stopAt:null,byeDone:true};
function note(what){s.last={what,wall:Date.now()};}
const now0=t=>typeof t==='number'?t:Date.now();
function queue(t,bye){s.pending={at:t,bye:!!bye};s.showing=null;}
/** Settings per driver on / off (no greeting while off). */
function setEnabled(on){s.enabled=!!on;if(!on){s.pending=null;s.showing=null;s.known=false;s.name=null;}}
function setHybrid(on){s.hybrid=!!on;}
/** The greeting and the goodbye each on / off (Basic → Settings per driver; 1.3.34). */
function setOptions(hello,bye){s.hello=hello!==false;s.bye=bye!==false;if(!s.hello&&s.pending&&!s.pending.bye)s.pending=null;if(!s.bye&&s.pending&&s.pending.bye)s.pending=null;}
/** A driver recognised: name (or null); change: another driver was in use before (not the first since the app started). */
function driver(name,change,now){
 const t=now0(now);s.known=true;s.name=typeof name==='string'&&name?name:null;
 if(!s.enabled)return;
 if(s.hello&&(change&&s.running||s.hybrid))queue(t);
}
// The goodbye (1.3.29): the engine switched off in P (or put in P within PARK_MS of stopping) is the end of the drive;
// an auto start-stop stop (in D, held on the brake) is not. Shown at once, for SHOW_MS; dropped after BYE_WAIT_MS
// (the HUD goes dark with the ignition, the cluster a little later).
/** The engine each frame: rpm (null when unknown), whether that reading is fresh, and the gear ('P', 'D', ...). */
function engine(rpm,fresh,now,gear){
 const t=now0(now),running=!!fresh&&typeof rpm==='number'&&rpm>=RUNNING_RPM;
 if(running&&!s.running&&s.enabled&&!s.hybrid){if(s.lastRunAt===null||t-s.lastRunAt>=RESTART_MS||s.doorOff){if(s.hello)queue(t);}else if(t-s.lastRunAt>=NOTE_STOP_MS)note('restart');}
 if(!running&&s.running){s.stopAt=t;s.byeDone=false;}
 if(!running&&!s.byeDone&&s.enabled&&!s.hybrid&&s.stopAt!==null){
  if(t-s.stopAt>PARK_MS)s.byeDone=true;else if(gear==='P'){s.byeDone=true;if(s.bye)queue(t,true);}
 }
 if(running){s.lastRunAt=t;s.doorOff=false;s.byeDone=true;}
 s.running=running;
}
/** Any door open now (the door-open warning's door switches): while the engine is off, the next start is greeted. */
function door(open){if(open&&!s.running)s.doorOff=true;}
/** What to show now ({ name } or null); ready: the HUD overlay can be drawn. */
function read(ready,now){
 const t=now0(now);
 if(s.pending&&t-s.pending.at>(s.pending.bye?BYE_WAIT_MS:WAIT_MS)){note(s.pending.bye?'bye_not_ready':'not_ready');s.pending=null;}
 if(s.pending&&ready&&(s.pending.bye||s.known||t-s.pending.at>=NAME_WAIT_MS)){s.showing={name:s.name,bye:s.pending.bye,until:t+SHOW_MS};note(s.pending.bye?'bye':'shown');s.pending=null;}
 if(s.showing&&t>=s.showing.until)s.showing=null;
 return s.showing?(s.showing.bye?{name:s.showing.name,bye:true}:{name:s.showing.name}):null;
}
/** The worker reads the engine speed for the greeting while it is on. */
function wantsEngine(){return s.enabled&&!s.hybrid;}
/** For the settings screen: { last: { what: 'shown' | 'restart' | 'not_ready' | 'bye' | 'bye_not_ready', wall: Date.now() then } | null, waiting }. */
function status(){return {last:s.last,waiting:!!s.pending};}
function reset(){Object.assign(s,{hello:true,bye:true,enabled:false,hybrid:false,known:false,name:null,running:false,lastRunAt:null,pending:null,showing:null,doorOff:false,last:null,stopAt:null,byeDone:true});}
module.exports={setEnabled,setHybrid,setOptions,driver,engine,door,read,status,wantsEngine,reset,SHOW_MS,BYE_WAIT_MS,PARK_MS,WAIT_MS,NAME_WAIT_MS,RESTART_MS};
