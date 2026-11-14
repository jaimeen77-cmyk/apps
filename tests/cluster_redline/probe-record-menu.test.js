'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),os=require('os');
const root=path.join(path.resolve(process.argv[2]),'source/javascript'),{SpeedProbe}=require(root+'/speed-probe'),{SettingsPage}=require(root+'/settings-ui'),{Canvas}=require(root+'/kit/canvas'),spec=require(root+'/kit/app-spec.json');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'record-menu-')),p=new SpeedProbe({fs,dataDir:dir,signals:null,someipDirs:[],manifestFiles:[],version:spec.version});
const values={},settings={schema:spec.settings,get:k=>values[k],set:(k,v)=>{values[k]=v;}};spec.settings.forEach(s=>values[s.key]=s.default);
try{
 p.setOn(true);p.sample('speed',30);
 const page=new SettingsPage(settings,null,spec.version);page.probe=p;page.tapBasic(10000);page.tapBasic(10500);page.tapBasic(11000);
 let cv=page.draw(new Canvas(1600,520));assert.equal(cv.targets.filter(t=>/^probe-/.test(t.id)).length,4);
 cv.targets.find(t=>t.id==='probe-1').act();assert.equal(p.lastSaved,'speed-probe-1.log');assert.equal(p.on,true);
 cv=page.draw(new Canvas(1600,520));cv.targets.forEach(t=>assert(t.x>=0&&t.y>=0&&t.x+t.w<=1600&&t.y+t.h<=520));
 page.choose(2);assert(fs.existsSync(path.join(dir,'speed-probe-1.log')),'clear current preserves saved archive');
 page.choice=1;page.move(1);assert.equal(page.choice,2);page.move(1);assert.equal(page.choice,3);page.move(1);assert.equal(page.choice,0);
 if(process.argv[3]){fs.mkdirSync(process.argv[3],{recursive:true});fs.writeFileSync(path.join(process.argv[3],'settings-record.png'),cv.png());}
 page.choose(3);assert.equal(page.open,null);
 console.log('PASS record menu: four bounded buttons, save-and-continue, clear protection and controller navigation');
}finally{p.setOn(false);for(const n of fs.readdirSync(dir))fs.unlinkSync(path.join(dir,n));fs.rmdirSync(dir);}
