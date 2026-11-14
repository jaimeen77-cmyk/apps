'use strict';
const fs=require('fs'),path=require('path'),mgu=require('./kit/mgu');
const Probe=require('./probe'),{Session}=require('./session'),View=require('./view');
const IFACE='de.bmw.infotainment.vehicle.Vehicle2',FIELD='statusCarSpeed2';
function quiet(ctx){
 if(ctx.log)['error','warn','info','debug'].forEach(k=>ctx.log[k]=()=>{});
 const file=path.join(ctx.dataDir,ctx.spec.id+'.log');
 [file,file+'.1'].forEach(p=>{try{if(fs.statSync(p).isFile())fs.unlinkSync(p);}catch(e){}});
 try{fs.mkdirSync(file);}catch(e){}
}
mgu.run({settingsUI:'custom',async start(ctx){
 quiet(ctx);let closed=false,visible=true,busy=false,dirty=true,page=0,targets=[],sub=null,polling=false,lastPoll=-Infinity,lastFrame=-Infinity,wasAvailable=false,epoch=0;
 let caps=Probe.inspect(),scanning=false,localPage=null;
 const request=()=>{dirty=true;},session=new Session(ctx.dataDir,request);
 function refresh(){if(scanning||closed)return;scanning=true;caps=Probe.inspect();caps.localUrl=localPage&&localPage.url;Probe.libc(value=>{scanning=false;if(!closed){caps.glibc=value;request();}});request();}
 function dispose(){if(closed)return;closed=true;epoch++;session.close();if(localPage)localPage.close();if(sub)try{sub.shutdown();}catch(e){}if(ctx.app&&ctx.app.removeListener)ctx.app.removeListener('shutdown',dispose);process.removeListener('exit',dispose);}
 try{
  if(ctx.signals&&ctx.signals.hasNative())ctx.signals.watch(IFACE,'1',{[FIELD]:v=>{if(!closed){epoch++;session.sample(v);request();}}},ctx.log,{}).then(s=>{if(closed){s.shutdown();return;}sub=s;}).catch(()=>{});
 }catch(e){}
 async function render(){
  if(closed||!visible||busy||!dirty)return;busy=true;dirty=false;
  try{const mem=process.memoryUsage(),cv=View.draw(ctx.canvas(View.W,View.H),{page,caps,state:session.state,parked:session.parked(),now:Date.now(),memory:(mem.rss/1048576).toFixed(1)+' / '+(mem.heapUsed/1048576).toFixed(1)+' MB'});targets=cv.targets;await ctx.ui.image('MAIN_GFX',cv);}
  catch(e){/* Renderer failure is not a media pass. The HMI's native STOP stays available. */}
  finally{busy=false;}
 }
 function action(name,value){
  if(closed||!visible&&name!=='stop')return;
  if(name==='page')page=value===undefined?(page+1)%3:value;
  else if(name==='refresh')refresh();
  else if(name==='stop')session.stop();
  else if(name==='local'||name==='youtube'){page=2;session.start(name,caps);}
  request();render();
 }
 ctx.ui.onClick('BTN_PAGE',()=>action('page'));
 ctx.ui.onClick('BTN_REFRESH',()=>action('refresh'));
 ctx.ui.onClick('BTN_LOCAL',()=>action('local'));
 ctx.ui.onClick('BTN_YOUTUBE',()=>action('youtube'));
 ctx.ui.onClick('BTN_STOP',()=>action('stop'));
 ctx.onTab(i=>action('page',Math.max(0,Math.min(2,i|0))));
 ctx.onTap((x,y)=>{const r=targets.find(r=>x>=r.x&&x<r.x+r.w&&y>=r.y&&y<r.y+r.h);if(r)action(r.action,r.value);});
 ctx.onLayout(request);
 if(ctx.ui.onVisible)ctx.ui.onVisible((name,on)=>{if(name!=='MAIN')return;visible=on;if(!on){epoch++;session.stop('Settings screen left');session.invalidate();}else{request();render();}});
 if(ctx.app&&ctx.app.once)ctx.app.once('shutdown',dispose);process.once('exit',dispose);
 try{localPage=await require('./local-page').start();if(closed){localPage.close();return;}}catch(e){/* Still allow environment checks and a separate YouTube launch. */}
 refresh();
 ctx.loop('MAIN',10,async()=>{
  if(closed||!visible)return;const now=Date.now();
  if(sub){const available=!!(sub.available&&!sub.error);if(wasAvailable&&!available){epoch++;session.invalidate();}wasAvailable=available;
   if(sub.error)session.invalidate();
   if(available&&sub.proxy&&sub.proxy.getValue&&!polling&&now-lastPoll>=1000){polling=true;lastPoll=now;const rev=epoch;
    Promise.resolve().then(()=>sub.proxy.getValue(FIELD,1000)).then(v=>{if(!closed&&rev===epoch){session.sample(v);request();}},()=>{}).then(()=>{polling=false;});}}
  session.tick();const interval=page===1?100:1000;if(now<lastFrame||now-lastFrame>=interval){lastFrame=now;request();}await render();
 });
 await render();
}});
