'use strict';
const http=require('http');
function start(){return new Promise((resolve,reject)=>{
 const html=Buffer.from(require('./test-page'),'utf8'),video=Buffer.from(require('./media-asset'),'base64'),sockets=new Set();
 const server=http.createServer((req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Connection','close');res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return;}
  const data=req.url==='/'?html:req.url==='/media-check-sample.mp4'?video:null;
  if(!data){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',req.url==='/'?'text/html; charset=utf-8':'video/mp4');res.setHeader('Accept-Ranges','bytes');
  let start=0,end=data.length-1;
  if(req.headers.range){
   const m=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
   if(!m||(!m[1]&&!m[2])){res.writeHead(416,{'Content-Range':'bytes */'+data.length});res.end();return;}
   if(!m[1])start=Math.max(0,data.length-Number(m[2]));else{start=Number(m[1]);if(m[2])end=Math.min(end,Number(m[2]));}
   if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=data.length){res.writeHead(416,{'Content-Range':'bytes */'+data.length});res.end();return;}
   res.statusCode=206;res.setHeader('Content-Range','bytes '+start+'-'+end+'/'+data.length);
  }
  res.setHeader('Content-Length',end-start+1);res.end(req.method==='HEAD'?undefined:data.slice(start,end+1));
 });
 server.maxConnections=8;server.timeout=5000;
 server.on('connection',s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));});
 const close=()=>{sockets.forEach(s=>s.destroy());server.close();};
 server.once('error',reject);
 server.listen(0,'127.0.0.1',()=>resolve({url:'http://127.0.0.1:'+server.address().port+'/',close}));
});}
module.exports={start};
