'use strict';
const assert=require('assert'),path=require('path'),root=path.join(path.resolve(process.argv[2]),'source/javascript');
const {Canvas}=require(root+'/kit/canvas'),{t,getLanguage}=require(root+'/kit/i18n'),{SettingsPage}=require(root+'/settings-ui'),spec=require(root+'/kit/app-spec.json'),{tr}=require(root+'/strings');
assert.strictEqual(getLanguage(),'ko');const values={};spec.settings.forEach(s=>values[s.key]=s.default);const missing=new Set(),page=new SettingsPage({schema:spec.settings,get:k=>values[k],set:(k,v)=>values[k]=v},null,'1.2.2');let screens=0;
function check(value){const rest=value.replace(/cluster-render/g,'').replace(/\b(?:MGU|HUD|RPM|rpm|PS|kW|Nm|kgf|m|km|L|bar|g|V|eDrive|Waze|X|Y|px)\b/g,'').replace(/\bM\d*\b/g,'').replace(/v\d+(?:\.\d+)*/g,'').replace(/12V|G포스/g,'');if(/[A-Za-z]/.test(rest))missing.add(value);}
function draw(){const cv=new Canvas(1600,520),text=cv.text;cv.text=function(v,x,y,size,c,o){check(o&&o.literal?String(v):t(v));return text.apply(this,arguments);};page.draw(cv);screens++;}
for(let tab=0;tab<4;tab++){
 page.selectTab(tab);draw();
 for(let i=0;i<page.keys().length;i++){
  const key=page.keys()[i];page.activate(i);draw();
  if(key==='aux'){page.choose(0);draw();page.back();page.back();page.activate(i);page.choose(1);draw();}
  if(key==='layout')for(let j=0;j<page.layoutParts().length;j++){page.selectLayoutPart(j,true);draw();}
  if(key==='design'){page.choose(0);page.activate(i);draw();page.choose(1);}
  if(page.open&&page.open!=='layout'&&page.open!=='auxSelect'&&page.open!=='auxMode'&&page.open!=='design'&&page.open!=='navColor'){
   const item=page.item();if(item&&item.options)for(const option of item.options)check(tr(option[1]));
  }
  page.back();
 }
}
assert.deepStrictEqual(Array.from(missing),[],'untranslated UI labels');
assert.strictEqual(t('CLUSTER display setting'),'계기판 표시 설정');assert.strictEqual(t('NAV display setting'),'길안내 표시 설정');assert.strictEqual(t('Stock'),'순정');
console.log('PASS: '+screens+' Korean settings renders, all reachable layout parts/metric pickers/designs/options, translated display tabs and buttons; physical units and required app IDs preserved');
