'use strict';
const http=require('http'),assert=require('assert');
function get(url,options){return new Promise((resolve,reject)=>{const req=http.request(url,options||{},res=>{const b=[];res.on('data',v=>b.push(v));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(b)}));});req.on('error',reject);req.end();});}
(async()=>{const local=await require('../../apps/media_check/local-page').start();try{
 assert(local.url.startsWith('http://127.0.0.1:'));
 const page=await get(local.url);assert.equal(page.status,200);assert(page.body.toString().includes('MGU Browser Check'));
 const movie=await get(local.url+'media-check-sample.mp4',{headers:{Range:'bytes=0-31'}});assert.equal(movie.status,206);assert.equal(movie.body.length,32);assert(movie.body.toString('ascii').includes('ftyp'));
 const bad=await get(local.url+'media-check-sample.mp4',{headers:{Range:'bytes=999999999-'}});assert.equal(bad.status,416);
 assert.equal((await get(local.url+'../etc/passwd')).status,404);
 assert.equal((await get(local.url,{method:'POST'})).status,405);
 const head=await get(local.url,{method:'HEAD'});assert.equal(head.body.length,0);assert(head.headers['content-length']>0);
 console.log('PASS loopback-only static page, exact routes, ranged MP4, invalid range and method rejection');
}finally{local.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
