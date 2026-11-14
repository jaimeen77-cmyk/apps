'use strict';
// Commit a complete numbered snapshot without replacing any existing archive. Originals are untouched here.
const path=require('path');
const MAX_BYTES=4*(1<<20);
function archive(fs,dir){
 const parts=[];
 for(const name of ['speed-probe.log.1','speed-probe.log']){
  const file=path.join(dir,name);
  try{if(fs.statSync(file).size>MAX_BYTES)throw new Error('Log exceeds archive size limit');parts.push(fs.readFileSync(file,'utf8'));}
  catch(e){if(e.code!=='ENOENT')throw e;}
 }
 const content=parts.join('');if(!content)return null;
 let number=0;
 try{const n=JSON.parse(fs.readFileSync(path.join(dir,'speed-probe-sequence.json'),'utf8')).last;if(Number.isSafeInteger(n)&&n>=0)number=n;}catch(e){}
 fs.readdirSync(dir).forEach(name=>{const m=/^speed-probe-(\d+)\.log$/.exec(name);if(m){const n=Number(m[1]);if(Number.isSafeInteger(n))number=Math.max(number,n);}});
 const temp=fs.mkdtempSync(path.join(dir,'.speed-probe-save-')),snapshot=path.join(temp,'snapshot'),sequence=path.join(temp,'sequence');
 function durable(file,text){const fd=fs.openSync(file,'wx',0o600);try{fs.writeFileSync(fd,text,'utf8');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
 let saved=null;
 try{
  durable(snapshot,content);
  for(;;){
   if(number>=Number.MAX_SAFE_INTEGER-1)throw new Error('Archive sequence exhausted');
   number++;const name='speed-probe-'+number+'.log';
   try{fs.linkSync(snapshot,path.join(dir,name));saved=name;break;}catch(e){if(e.code!=='EEXIST')throw e;}
  }
  durable(sequence,JSON.stringify({last:number})+'\n');fs.renameSync(sequence,path.join(dir,'speed-probe-sequence.json'));
  return saved;
 }catch(e){if(saved)e.savedArchive=saved;throw e;}
 finally{
  [snapshot,sequence].forEach(file=>{try{fs.unlinkSync(file);}catch(e){}});try{fs.rmdirSync(temp);}catch(e){}
 }
}
module.exports={archive};
