'use strict';
const fs=require('fs'),path=require('path'),cp=require('child_process');
class Session{
 constructor(dir,changed,options){const o=options||{};this.dir=dir;this.changed=changed||(()=>{});this.fs=o.fs||fs;this.spawn=o.spawn||cp.spawn;this.kill=o.kill||((child,sig)=>{if(process.platform==='linux'&&Number.isInteger(child.pid)&&child.pid>1){try{process.kill(-child.pid,sig);return;}catch(e){}}child.kill(sig);});this.now=o.now||(()=>Date.now());this.timers=o.timers||{setTimeout,clearTimeout};this.speed=null;this.speedAt=-Infinity;this.job=null;this.closed=false;this.state={kind:null,phase:'idle',detail:'',code:null};}
 sample(v){const raw=v&&v.speedVehicleCentreOfGravity;this.speed=typeof raw==='number'&&isFinite(raw)&&raw>=0&&raw<=400*64?raw/64:null;this.speedAt=this.now();if(!this.parked())this.stop('Vehicle moving or speed unavailable');}
 parked(){return this.speed!==null&&this.speed<=.5&&this.now()>=this.speedAt&&this.now()-this.speedAt<=3000;}
 invalidate(){this.speed=null;this.stop('Speed source disconnected');}
 tick(){if(this.job&&!this.parked())this.stop('Vehicle moving or speed unavailable');}
 set(phase,detail,kind,code){this.state={phase,detail:detail||'',kind:kind||this.state.kind,code:code===undefined?null:code};this.changed();}
 start(kind,caps){
  if(this.closed||this.job)return false;
  if(!this.parked()){this.set('blocked','Fresh stationary vehicle speed required',kind);return false;}
  const bin=caps.browser;
  if(!bin){this.set('unsupported','No supported browser installed',kind);return false;}
  if(kind!=='youtube'&&!/^http:\/\/127\.0\.0\.1:\d+\/$/.test(caps.localUrl||'')){this.set('error','Local test page unavailable',kind);return false;}
  let profile;
  try{profile=path.join(this.dir,'browser-test-profile');try{this.fs.mkdirSync(profile,0o700);}catch(e){if(e.code!=='EEXIST')throw e;}}
  catch(e){this.set('error','Cannot prepare local sample: '+e.message,kind);return false;}
  const url=kind==='youtube'?'https://www.youtube.com/':caps.localUrl;
  const args=/firefox$/.test(bin)?['--no-remote','--profile',profile,'--private-window',url]:['--user-data-dir='+profile,'--incognito','--disk-cache-size=1048576','--media-cache-size=1048576','--no-first-run','--disable-sync','--disable-background-networking',url];
  let child;try{child=this.spawn(bin,args,{shell:false,detached:true,stdio:['ignore','ignore','pipe']});}catch(e){this.set('error',e.message,kind);return false;}
  const job={child,kind,stderr:'',reason:null,timer:null,killTimer:null};this.job=job;this.set('starting','Browser requested; picture / sound unverified',kind);
  const finish=(phase,detail,code)=>{
   if(this.job!==job)return;this.timers.clearTimeout(job.timer);this.timers.clearTimeout(job.killTimer);try{this.kill(job.child,'SIGTERM');}catch(e){}this.job=null;
   if(!this.closed)this.set(phase,detail,kind,code);
  };
  if(child.stderr)child.stderr.on('data',b=>{job.stderr=(job.stderr+String(b)).slice(-1200);});
  child.once('spawn',()=>{if(this.job===job&&!job.reason&&!this.closed)this.set('running','Browser running; verify picture / sound',kind);});
  child.once('error',e=>finish('error',e.message));
  child.once('close',(code,signal)=>finish(job.reason?'stopped':code===0?'finished':'error',job.reason||job.stderr.replace(/[\r\n]+/g,' ').trim()||(code===0?'Process finished; picture / sound unverified':'Player exited: '+(signal||code)),code));
  if(child.pid&&!job.reason&&!this.closed)this.set('running','Browser running; verify picture / sound',kind);
  job.timer=this.timers.setTimeout(()=>this.stop('Test time limit reached'),90000);return true;
 }
 stop(reason){const job=this.job;if(!job||job.reason)return;job.reason=reason||'Stopped by user';this.timers.clearTimeout(job.timer);if(!this.closed)this.set('stopping',job.reason,job.kind);try{this.kill(job.child,'SIGTERM');}catch(e){}job.killTimer=this.timers.setTimeout(()=>{if(this.job===job)try{this.kill(job.child,'SIGKILL');}catch(e){}},500);}
 close(){this.closed=true;this.stop('App closed');}
}
module.exports={Session};
