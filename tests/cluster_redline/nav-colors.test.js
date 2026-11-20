'use strict';
// Navigation colours: arrow (navColor) and text (navTextColor), each orange / green / blue / white; grey (no longer
// offered) becomes white; the HUD draws the arrow, lanes, distance and road name in them; the colour screen sets both.
// Optional argument: a built stage (dist/cluster_redline) to draw.
const assert=require('assert'),path=require('path');
const {settings}=require('../../apps/cluster_redline/policy'),D=require('../../apps/cluster_redline/display-config'),K=require('../../apps/cluster_redline/render-state');
assert.deepStrictEqual(D.NAV_COLOR_NAMES,['orange','green','blue','white']);
assert.strictEqual(settings({}).navColor,'blue');assert.strictEqual(settings({}).navTextColor,'white','defaults as before: blue arrow, white text');
assert.strictEqual(settings({navColor:'gray'}).navColor,'white','grey is no longer offered');
D.NAV_COLOR_NAMES.forEach(c=>{assert.strictEqual(settings({navColor:c}).navColor,c);assert.strictEqual(settings({navTextColor:c}).navTextColor,c);});
assert.strictEqual(settings({navTextColor:'pink'}).navTextColor,'white');
const nav={visible:true,maneuverVisible:true,maneuver:'RIGHT',distanceText:'300 m',description:'Road',lanes:{visible:true,lanes:[]}};
const key=(part,c)=>JSON.stringify(K.navKey({config:settings(Object.assign({hudNavigationEnabled:true,navDisplayMode:'all'},c)),navigation:nav,mode:'COMFORT'},part));
assert.notStrictEqual(key('Direction',{navTextColor:'orange'}),key('Direction',{}),'distance colour repaints the arrow part');
assert.notStrictEqual(key('Text',{navTextColor:'green'}),key('Text',{}),'text colour repaints the road name');
if(process.argv[2]){
 const dir=path.join(path.resolve(process.argv[2]),'source/javascript'),NAV=require(path.join(dir,'nav-draw')),TEXT=require(path.join(dir,'nav-text'));
 const rgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
 const has=(cv,hex,box)=>{const [r,g,b]=rgb(hex);let n=0;for(let y=box[1];y<box[3];y++)for(let x=box[0];x<box[2];x++){const p=(y*cv.w+x)*4;if(cv.d[p+3]>200&&Math.abs(cv.d[p]-r)<12&&Math.abs(cv.d[p+1]-g)<12&&Math.abs(cv.d[p+2]-b)<12)n++;}return n;};
 D.NAV_COLOR_NAMES.forEach(a=>D.NAV_COLOR_NAMES.forEach(t=>{
  const cv=NAV.draw(Object.assign({},nav,{color:a,textColor:t}));
  assert(has(cv,D.NAV_COLORS[a],[0,0,104,112])>100,'arrow '+a);assert(has(cv,D.NAV_COLORS[t],[104,30,240,90])>30,'distance '+t);
 }));
 assert(has(TEXT.draw(Object.assign({},nav,{textColor:'orange'})),D.NAV_COLORS.orange,[0,0,240,48])>30,'road name orange');
 const {SettingsPage}=require(path.join(dir,'settings-ui')),{Canvas}=require(path.join(dir,'kit/canvas')),spec=require(path.join(dir,'kit/app-spec.json'));
 const vals={};spec.settings.forEach(s=>{vals[s.key]=s.default;});
 const page=new SettingsPage({schema:spec.settings,get:k=>vals[k],set:(k,v)=>{vals[k]=v;},onChange(){}},()=>{},'test');
 page.selectTab(3);page.focus=page.keys().indexOf('navColor');page.activate();assert.strictEqual(page.open,'navColor');
 const screen=()=>{const cv=new Canvas(1600,520);page.draw(cv,'',{});return cv.targets;};
 screen().find(t=>t.id==='navColor-orange').run();screen().find(t=>t.id==='navTextColor-green').run();
 assert.deepStrictEqual([vals.navColor,vals.navTextColor],['orange','green']);
 page.move(1);page.choose(page.choice);assert(D.NAV_COLOR_NAMES.includes(vals.navColor),'cursor and Select work too');
 page.back();assert.strictEqual(page.open,null);
}
console.log('PASS: navigation arrow and text colours (orange / green / blue / white), grey to white, repaint keys'+(process.argv[2]?', drawn arrow, distance, road name and the colour screen':''));
