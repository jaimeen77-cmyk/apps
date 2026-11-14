'use strict';
const assert=require('assert'),path=require('path'),fs=require('fs');
const root=path.join(path.resolve(process.argv[2]),'source/javascript'),{Canvas}=require(root+'/kit/canvas'),View=require(root+'/view');
const model={page:0,caps:{arch:'x64',node:'v8.x',glibc:'glibc 2.x',gpu:[],display:'No display environment advertised',browser:null},state:{phase:'unsupported',detail:'No supported browser installed'},parked:false,now:2000,memory:'40.0 / 8.0 MB'};
for(let page=0;page<3;page++){
 const cv=View.draw(new Canvas(View.W,View.H),Object.assign({},model,{page}));
 assert.equal(cv.targets.length,7);cv.targets.forEach(r=>assert(r.x>=0&&r.y>=0&&r.x+r.w<=View.W&&r.y+r.h<=View.H));
 if(process.argv[3]){fs.mkdirSync(process.argv[3],{recursive:true});fs.writeFileSync(path.join(process.argv[3],'page-'+page+'.png'),cv.png());}
}
const a=View.draw(new Canvas(View.W,View.H),Object.assign({},model,{page:1,now:1000})),b=View.draw(new Canvas(View.W,View.H),Object.assign({},model,{page:1,now:2000}));assert(!Buffer.from(a.d).equals(Buffer.from(b.d)),'display test must move');
const locale=require(root+'/kit/locale.json');if(locale.language==='ko'){
 const atlas=require(root+'/kit/fonts/korean.json').sizes[0].glyphs;
 for(const s of Object.values(require('../../apps/media_check/app.json').translations.ko))for(const ch of s)if(/[가-힣]/.test(ch))assert(atlas[ch.codePointAt(0)],ch+' missing');
}
console.log('PASS three real canvas pages, bounded touch targets, moving test pattern and Korean glyph coverage');
