'use strict';
const assert=require('assert'),path=require('path'),fs=require('fs');
const dir=path.join(path.resolve(process.argv[2]),'source/javascript'),{SettingsPage,TABS}=require(dir+'/settings-ui'),{Canvas}=require(dir+'/kit/canvas'),{t}=require(dir+'/kit/i18n'),spec=require(dir+'/kit/app-spec.json');
const values={};spec.settings.forEach(s=>values[s.key]=s.default);const store={schema:spec.settings,get:k=>values[k],set:(k,v)=>values[k]=v},page=new SettingsPage(store,null,'test');
const labels=[],text=Canvas.prototype.text;Canvas.prototype.text=function(v){labels.push(t(v));return text.apply(this,arguments);};
try{
 for(let i=0;i<4;i++){
  page.selectTab(i);const cv=page.draw(new Canvas(1600,520));assert.strictEqual(cv.tabRects.length,5);for(const r of cv.targets)assert(r.x>=0&&r.y>=0&&r.x+r.w<=1600&&r.y+r.h<=520);
  const full=new Canvas(1600,520);full.chrome={};page.draw(full);assert.strictEqual(full.chrome.tabs.tabs.length,5);
 }
 page.selectTab(1);page.activate(0);page.choose(0);assert.strictEqual(values.sportHudOutput,'redline');page.activate(1);page.choose(1);assert.strictEqual(values.allHudOutput,'stock');
 page.activate(3);page.draw(new Canvas(1600,520));assert(labels.includes('5060'));page.choose(1);assert.strictEqual(values.hudAlertStyle,'circle');
 page.selectTab(2);page.activate(3);page.draw(new Canvas(1600,520));page.choose(0);assert.strictEqual(values.clusterAlertStyle,'bar');
 if(require(dir+'/kit/locale.json').language==='ko'){
  const atlas=require(dir+'/kit/fonts/korean.json').sizes[0].glyphs;
  for(const label of labels)for(const ch of label)if(/[가-힣]/.test(ch))assert(atlas[ch.charCodeAt(0)],'missing Korean glyph '+ch);
  for(const key of TABS)assert.notStrictEqual(key==='Favorites'?require(dir+'/strings').tr(key):t(key),key);
 }
 console.log('PASS: bilingual four-tab settings, tap bounds, native chrome tabs, per-display output/style persistence and Korean glyph coverage');
}finally{Canvas.prototype.text=text;}
