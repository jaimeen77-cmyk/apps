'use strict';
const fs=require('fs'),os=require('os'),cp=require('child_process');
function executable(name,io){
 for(const dir of ['/usr/bin','/bin','/usr/local/bin']){const p=dir+'/'+name;try{io.accessSync(p,1);if(io.statSync(p).isFile())return p;}catch(e){}}
 return null;
}
function inspect(io,env){
 io=io||fs;env=env||process.env;
 const exists=p=>{try{return io.statSync(p).isDirectory()||io.statSync(p).isFile()||io.statSync(p).isCharacterDevice();}catch(e){return false;}};
 const read=p=>{try{return io.readFileSync(p,'utf8').trim().slice(0,500);}catch(e){return '';}};
 return {arch:os.arch(),kernel:os.release(),node:process.version,glibc:null,
  gpu:['/dev/dri/renderD128','/dev/dri/card0'].filter(exists),
  display:env.WAYLAND_DISPLAY?'Wayland environment':env.DISPLAY?'X11 environment':'No display environment advertised',
  sound:read('/proc/asound/cards').split('\n').filter(Boolean).slice(0,2).join(' ').slice(0,160),
  browser:executable('chromium',io)||executable('chromium-browser',io)||executable('firefox',io),
  note:'Presence only; not proof of working GPU, audio routing or browser compatibility'};
}
function libc(done,execute){
 let called=false;const finish=v=>{if(!called){called=true;done(v);}};
 try{(execute||cp.execFile)('/usr/bin/getconf',['GNU_LIBC_VERSION'],{timeout:1200,maxBuffer:1024},(e,out)=>finish(e?'Unavailable':String(out).trim().slice(0,80)));}catch(e){finish('Unavailable');}
}
module.exports={inspect,executable,libc};
