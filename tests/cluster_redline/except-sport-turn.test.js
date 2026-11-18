'use strict';
// All modes RPM display "except Sport modes" (cluster and HUD) and the HUD turn signals.
// Optional argument: a built stage (dist/cluster_redline) to also draw the HUD frame and the settings screen.
const assert=require('assert'),path=require('path'),{EventEmitter}=require('events');
const {Outputs}=require('../../apps/cluster_redline/outputs');
const D=require('../../apps/cluster_redline/display-config'),{settings}=require('../../apps/cluster_redline/policy');
const {TurnSignal,direction}=require('../../apps/cluster_redline/turn-signal');
const K=require('../../apps/cluster_redline/render-state');
class Client extends EventEmitter {
    constructor(){super();this.ready=true;this.targets='map:1088x480,hud:800x480';this.next=0;this.active=new Map();}
    image(o){const ref=++this.next;this.active.set(ref,Object.assign({},o));return ref;}
    pixels(){}showWhenSent(ref){this.set(ref,{visible:true});}
    set(ref,o){Object.assign(this.active.get(ref),o);}drop(ref){this.active.delete(ref);}close(){this.ready=false;}
}
// --- 1, 2: except Sport modes
assert.strictEqual(settings({allHudOutput:'nosport'}).allHudOutput,'nosport');
assert.strictEqual(settings({allClusterOutput:'nosport'}).allClusterOutput,'nosport');
assert.strictEqual(settings({sportHudOutput:'nosport'}).sportHudOutput,'stock','only the all-modes rows take except Sport');
['Hud','Cluster'].forEach(name=>{
    const cfg={['all'+name+'Output']:'nosport',['sport'+name+'Output']:'stock'};
    assert.strictEqual(D.rpmOutput(cfg,name,'COMFORT'),true);assert.strictEqual(D.rpmOutput(cfg,name,'ECO_PRO'),true);
    ['SPORT','SPORT_PLUS','SPORT_INDIVIDUAL','PHEV_SPORT_STANDARD'].forEach(m=>assert.strictEqual(D.rpmOutput(cfg,name,m),false,name+' '+m+': Sport follows its own row'));
    cfg['sport'+name+'Output']='redline';assert.strictEqual(D.rpmOutput(cfg,name,'SPORT'),true);
});
const painter=(w,h)=>({W:w,H:h,draw:()=>({d:Buffer.alloc(64)}),difference:()=>({rects:[],pixels:Buffer.alloc(0)})});
for(const name of ['hud','cluster']){
    const client=new Client(),out=new Outputs(client,painter(1088,480),Object.assign(painter(800,480),{fullTarget:true})),key=name==='hud'?'Hud':'Cluster';
    const cfg={['all'+key+'Output']:'nosport',['sport'+key+'Output']:'stock',[(name==='hud'?'sportCluster':'sportHud')+'Output']:'stock'};
    const at=(t,mode)=>{out.policy.modeSample(mode,t-1500);out.policy.rpmSample(3000,t);return out.tick(t,cfg).outputs[name];};
    assert(at(1000,4).requested,name+': Comfort shows the Redline display');
    at(3000,1);assert(!at(5000,1).requested,name+': Sport leaves the stock display');
    assert(at(7000,7).requested,name+': Eco Pro shows it again');
    out.close();
}
// --- 3: turn signals
assert.strictEqual(direction({controlIndicateDirection:'TIPP_BLINKEN_LINKS_EIN'}),'left');
assert.strictEqual(direction({controlIndicateDirection:4}),'right');
assert.strictEqual(direction({controlIndicateDirection:'BEIDSEITIGES_BLINKEN_EIN'}),'both');
assert.strictEqual(direction({status:{controlIndicateDirection:0,activeFunctionIndicateDirection:'DAUERBLINKEN_RECHTS'}}),'right');
assert.strictEqual(direction({controlIndicateDirection:0,activeFunctionIndicateDirection:0}),'off');
assert.strictEqual(direction({}),null);
const ts=new TurnSignal();assert.deepStrictEqual(ts.read(0),{indicator:'off',lit:false,step:0});
ts.sample({controlIndicateDirection:3},1000);
const phases=[];for(let t=1000;t<2300;t+=50)phases.push(ts.read(t).lit?1:0);
assert(phases[0]===1&&phases.includes(0),'flashes');assert.strictEqual(phases.filter(Boolean).length,14,'lit about 335 of every 638 ms');
// <<< >>>: one, two, three chevrons in turn, a third of the cycle each, never dark while the signal is on.
{const q=new TurnSignal();q.sample({controlIndicateDirection:2},1040);const steps=[];for(let t=1000;t<2276;t+=50)steps.push(q.read(t).step);
 assert.strictEqual(steps.join(''),'11111222233331111122223333');assert.strictEqual(new TurnSignal().read(0).step,0);
 const c3=settings({hudTurnSignals:'on',hudTurnStyle:'chevron3'});assert.deepStrictEqual(D.turnSides(c3,'right',false,false),['right'],'<<< >>> stays on between flashes');
 assert.deepStrictEqual(D.turnSides(c3,'off',false,false),[]);
 const k=n=>K.key({config:c3,renderRpm:false,navigation:null,indicator:'right',turnLit:true,turnStep:n},'hud');assert(k(1)!==k(2)&&k(2)!==k(3),'each step repaints');}
ts.sample({controlIndicateDirection:3},5000);assert.strictEqual(ts.read(9000).indicator,'left','a held stalk (no new notification) keeps flashing');
ts.clear();assert.strictEqual(ts.read(9100).indicator,'off');
const cfg=settings({hudTurnSignals:'on'});assert.strictEqual(settings({}).hudTurnSignals,'off','off by default');
assert.deepStrictEqual(D.turnSides(cfg,'left',true,false),['left']);assert.deepStrictEqual(D.turnSides(cfg,'left',false,false),[]);
assert.deepStrictEqual(D.turnSides(cfg,'both',true,false),['left','right']);assert.deepStrictEqual(D.turnSides(settings({}),'both',true,false),[]);
assert.deepStrictEqual(D.turnSides(settings({}),'off',false,true),['left','right'],'Position / size shows both');
assert.deepStrictEqual(D.turnSides(settings({hudTurnSignals:'on',hudTurnLeftHidden:true}),'both',true,false),['right']);
const L=D.turnRect(cfg,'left'),R=D.turnRect(cfg,'right');assert(L.x+L.w<=R.x&&L.y===R.y);
const moved=settings({hudTurnSignals:'on',hudTurnOffsetX:30,hudTurnLeftOffsetY:-10});
assert.strictEqual(D.turnRect(moved,'left').x,L.x+30);assert.strictEqual(D.turnRect(moved,'right').x,R.x+30);
assert.strictEqual(D.turnRect(moved,'left').y,L.y-10);assert.strictEqual(D.turnRect(moved,'right').y,R.y,'each side moves on its own');
assert(D.turnRect(settings({hudTurnScale:150}),'left').w>L.w);
assert.strictEqual(settings({hudTurnStyle:'bad',hudTurnColor:'pink'}).hudTurnStyle,'arrow');assert.strictEqual(settings({hudTurnColor:'pink'}).hudTurnColor,'green');
const state=(ind,lit)=>({config:cfg,renderRpm:false,navigation:null,indicator:ind,turnLit:lit});
assert.notStrictEqual(K.key(state('left',true),'hud'),K.key(state('left',false),'hud'),'each flash repaints');
assert.strictEqual(K.key(state('off',false),'hud'),K.key(state('left',false),'hud'),'unlit draws nothing');
// The controller hands the worker's turn state to the HUD painter; a turn part in Position / size lights both.
{
    let seen=null;const client=new Client(),hud=Object.assign(painter(800,480),{fullTarget:true,key:d=>JSON.stringify([d.indicator,d.turnLit,d.turnPreview]),draw:d=>{seen=d;return {d:Buffer.alloc(64)};}});
    const out=new Outputs(client,painter(1088,480),hud);out.turn={indicator:'right',lit:true};
    out.policy.modeSample(4,0);out.policy.rpmSample(3000,1000);out.tick(1000,{allHudOutput:'redline',hudTurnSignals:'on'});
    assert.strictEqual(seen.indicator,'right');assert.strictEqual(seen.turnLit,true);assert.strictEqual(seen.turnPreview,false);
    out.turn={indicator:'right',lit:false};out.tick(1300,{allHudOutput:'redline',hudTurnSignals:'on'});assert.strictEqual(seen.turnLit,false);
    out.tick(1600,{allHudOutput:'redline',layoutPreview:'hud:TurnLeft@'+Date.now()});assert.strictEqual(seen.turnPreview,true);
    out.close();
}
// A turn signal shows on the HUD by itself, with the stock HUD (no RPM face, no navigation), like Cluster Info.
{
    const client=new Client(),out=new Outputs(client,painter(1088,480),Object.assign(painter(800,480),{fullTarget:true}));
    const tick=(t,ind,cfg)=>{out.turn={indicator:ind,lit:true,step:1};out.policy.modeSample(4,t-1);out.policy.rpmSample(800,t);return out.tick(t,cfg).outputs.hud;};
    assert(!tick(1000,'off',{hudTurnSignals:'on'}).requested,'no signal: the stock HUD is left alone');
    assert(tick(2000,'left',{hudTurnSignals:'on'}).requested,'a turn signal takes the HUD with the stock HUD selected');
    assert(tick(3000,'both',{hudTurnSignals:'on'}).requested,'hazards too');
    assert(tick(9000,'off',{hudTurnSignals:'on'}).requested,'held a few seconds after the stalk returns');
    assert(!tick(12000,'off',{hudTurnSignals:'on'}).requested,'then released');
    assert(!tick(13000,'right',{}).requested,'turn signals off: nothing');
    assert(!tick(14000,'right',{hudTurnSignals:'on',hudTurnHidden:true}).requested,'hidden: nothing');
    out.close();
}
// Position / size ends when the settings screen stops being drawn, even without a "hidden" event.
{
    const presence=require('../../apps/cluster_redline/preview-presence');
    const client=new Client(),out=new Outputs(client,painter(1088,480),Object.assign(painter(800,480),{fullTarget:true}));
    const tick=t=>{out.turn={indicator:'off',lit:false,step:0};out.policy.modeSample(4,t-1);out.policy.rpmSample(800,t);return out.tick(t,{layoutPreview:'hud:Turn@'+Date.now()}).outputs.hud;};
    presence.touch();assert(tick(1000).requested,'shown while the screen is drawn');
    presence.touch(Date.now()-presence.STALE_MS-100);assert(!tick(2000).requested,'gone once the screen is no longer drawn');
    presence.reset();out.close();
}
if(process.argv[2]){
    const dir=path.join(path.resolve(process.argv[2]),'source/javascript'),hud=require(path.join(dir,'hud-compose'));
    const count=(cv,r)=>{let n=0;for(let y=r.y;y<r.y+r.h;y++)for(let x=r.x;x<r.x+r.w;x++)if(cv.d[(y*cv.w+x)*4+3])n++;return n;};
    D.TURN_STYLES.forEach(style=>Object.keys(D.TURN_COLORS).forEach(color=>{
        const c=settings({hudTurnSignals:'on',hudTurnStyle:style,hudTurnColor:color}),s=(ind,lit)=>({config:c,renderRpm:false,navigation:null,indicator:ind,turnLit:lit});
        const lit=hud.draw(s('left',true)),dark=hud.draw(s('left',false));
        assert(count(lit,D.turnRect(c,'left'))>50,style+' '+color+' draws');
        if(style==='chevron3'){const n=k=>count(hud.draw(Object.assign(s('left',false),{turnStep:k})),D.turnRect(c,'left'));assert(n(1)>0&&n(1)<n(2)&&n(2)<n(3),'one, two, three chevrons');return;}assert.strictEqual(count(lit,D.turnRect(c,'right')),0);assert.strictEqual(count(dark,D.turnRect(c,'left')),0);
    }));
    const {SettingsPage}=require(path.join(dir,'settings-ui')),{Canvas}=require(path.join(dir,'kit/canvas'));
    const spec=require(path.join(dir,'kit/app-spec.json')),vals={};spec.settings.forEach(s=>{vals[s.key]=s.default;});
    assert(spec.settings.find(s=>s.key==='allHudOutput').options.some(o=>o[0]==='nosport'));
    const page=new SettingsPage({schema:spec.settings,get:k=>vals[k],set:(k,v)=>{vals[k]=v;},onChange(){}},()=>{},'test');
    page.selectTab(1);page.focus=page.keys().indexOf('turn');page.activate();assert.strictEqual(page.open,'turn');
    const screen=()=>{const cv=new Canvas(1600,520);page.draw(cv,{},null);return cv.targets;};
    screen().find(t=>t.id==='turn-on').run();screen().find(t=>t.id==='turn-style-chevron').run();screen().find(t=>t.id==='turn-color-orange').run();
    assert.deepStrictEqual([vals.hudTurnSignals,vals.hudTurnStyle,vals.hudTurnColor],['on','chevron','orange']);
    screen().find(t=>t.id==='turn-layout').run();assert.strictEqual(page.open,'layout');assert(/^hud:Turn@/.test(vals.layoutPreview));
    page.adjust(0,1);assert.strictEqual(vals.hudTurnOffsetX,10);
    page.selectLayoutPart(1,true);page.adjust(1,1);assert.strictEqual(vals.hudTurnLeftOffsetY,10);page.adjust(2,1);assert.strictEqual(vals.hudTurnScale,105);
    page.back();assert.strictEqual(page.open,'turn');assert.strictEqual(vals.layoutPreview,'');page.back();assert.strictEqual(page.open,null);
    page.focus=page.keys().indexOf('turn');page.activate();screen().find(t=>t.id==='turn-layout').run();assert(/^hud:Turn@/.test(vals.layoutPreview));page.selectTab(0);assert.strictEqual(vals.layoutPreview,'','a tab button ends Position / size');assert.strictEqual(page.open,null);
}
console.log('PASS: all modes except Sport (cluster, HUD), HUD turn signals: decode, flash, sides, position, size, colour, shape'+(process.argv[2]?', drawn frame and settings screen':''));
