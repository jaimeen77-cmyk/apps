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
 assert.deepStrictEqual([1,2,3].map(n=>D.turnCount(c3,n,false)),[1,2,3],'each step its own chevron count');}
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
assert.strictEqual(K.key(state('left',true),'hud'),K.key(state('off',false),'hud'),'turn signals are not in the Redline HUD image (own overlay layers)');
// The controller hands the worker's turn state to the HUD painter; a turn part in Position / size lights both.
{
    let seen=null;const client=new Client(),hud=Object.assign(painter(800,480),{fullTarget:true,key:d=>JSON.stringify([d.indicator,d.turnLit,d.turnPreview]),draw:d=>{seen=d;return {d:Buffer.alloc(64)};}});
    const out=new Outputs(client,painter(1088,480),hud);out.turn={indicator:'right',lit:true};
    out.policy.modeSample(4,0);out.policy.rpmSample(3000,1000);out.tick(1000,{allHudOutput:'redline',hudTurnSignals:'on'});
    assert.strictEqual(seen.indicator,'right');assert.strictEqual(seen.turnLit,true);assert.strictEqual(seen.turnPreview,false);
    out.turn={indicator:'right',lit:false};out.tick(1300,{allHudOutput:'redline',hudTurnSignals:'on'});assert.strictEqual(seen.turnLit,false);
    out.close();
}
// HUD turn signals: two overlay layers of their own (above the stock or Redline HUD, as Cluster Info), lit by opacity.
{
    const {TurnOverlay,HIDE_MS}=require('../../apps/cluster_redline/turn-overlay');
    class Rec{constructor(){this.next=0;this.l=new Map();this.uploads=0;}image(o){const r=++this.next;this.l.set(r,Object.assign({},o));return r;}pixels(){this.uploads++;}set(r,o){Object.assign(this.l.get(r),o);}drop(r){this.l.delete(r);}}
    const rec=new Rec(),ov=new TurnOverlay(rec),on=settings({hudTurnSignals:'on'});
    // turn-draw needs the kit canvas: count uploads with a stub painter
    const Module=require('module'),orig=Module._load;Module._load=function(req,parent){if(req==='./turn-draw')return {painter:()=>({draw:()=>({d:new Uint8Array(16)})})};return orig.apply(this,arguments);};
    const layers=()=>[...rec.l.values()],op=side=>layers().find(l=>l.x===D.turnRect(on,side).x);
    ov.tick(0,on,{indicator:'off'},false);assert.strictEqual(rec.l.size,0,'no layers before a signal');
    ov.tick(100,on,{indicator:'left',lit:true,step:1},false);
    assert.strictEqual(rec.l.size,2);assert(layers().every(l=>l.target==='hud'&&l.klass==='overlay'),'overlay layers on the HUD');
    assert.strictEqual(op('left').visible,true);assert.strictEqual(op('left').opacity,1);assert.strictEqual(op('right').opacity,0);
    const sent=rec.uploads;ov.tick(400,on,{indicator:'left',lit:false,step:1},false);assert.strictEqual(op('left').opacity,0,'dark between flashes');assert.strictEqual(op('left').visible,true);assert.strictEqual(rec.uploads,sent,'a flash sends no pixels');
    ov.tick(700,on,{indicator:'both',lit:true,step:1},false);assert.strictEqual(op('right').opacity,1,'hazards light both');
    ov.tick(800,on,{indicator:'off'},false);assert.strictEqual(op('left').visible,true,'kept a moment after the stalk returns');
    ov.tick(800+HIDE_MS+1,on,{indicator:'off'},false);assert.strictEqual(op('left').visible,false,'then hidden');
    ov.tick(5000,settings({}),{indicator:'left',lit:true},false);assert.strictEqual(op('left').visible,false,'turn signals off: nothing');
    ov.tick(6000,settings({}),{indicator:'off'},true);assert(op('left').visible&&op('left').opacity===1&&op('right').opacity===1,'Position / size lights both, setting off or not');
    ov.tick(6100,settings({hudTurnOffsetX:30}),{indicator:'off'},true);assert(layers().some(l=>l.x===D.turnRect(settings({hudTurnOffsetX:30}),'left').x),'moves with Position / size');
    ov.tick(6200+HIDE_MS+1,settings({}),{indicator:'off'},false);ov.tick(6300+HIDE_MS*2,settings({}),{indicator:'off'},false);assert(layers().every(l=>!l.visible),'preview ends: arrows gone');
    const c3=settings({hudTurnSignals:'on',hudTurnStyle:'chevron3'}),before=rec.uploads;ov.tick(9000,c3,{indicator:'right',lit:false,step:1},false);ov.tick(9200,c3,{indicator:'right',lit:false,step:2},false);
    assert(rec.uploads>before,'<<< >>> steps are redrawn');assert.strictEqual(ov.status().sides.join(),'right','<<< >>> stays on between flashes');
    ov.close();assert.strictEqual(rec.l.size,0);Module._load=orig;
}
// Option 2: in the Redline HUD image while it is on screen, else on the overlay layers.
{
    const {redlineHudShown}=require('../../apps/cluster_redline/outputs');
    const shown={requested:true,layerState:'shown',targetState:'shown',targetHolder:'cluster-redline'};
    assert.strictEqual(redlineHudShown(shown),true);
    assert.strictEqual(redlineHudShown(Object.assign({},shown,{targetHolder:'stock'})),false,'stock HUD holds the slot: overlay');
    assert.strictEqual(redlineHudShown(Object.assign({},shown,{targetHolder:'foreign'})),false);
    assert.strictEqual(redlineHudShown(Object.assign({},shown,{layerState:'waiting'})),false,'not on screen yet: overlay');
    assert.strictEqual(redlineHudShown(Object.assign({},shown,{requested:false})),false,'stock HUD selected: overlay');
    const st=(inLayer,ind,lit)=>({config:on2,renderRpm:false,navigation:null,indicator:ind,turnLit:lit,turnInLayer:inLayer});const on2=settings({hudTurnSignals:'on'});
    assert.notStrictEqual(K.key(st(true,'left',true),'hud'),K.key(st(true,'left',false),'hud'),'in the Redline HUD each flash repaints');
    assert.strictEqual(K.key(st(false,'left',true),'hud'),K.key(st(false,'off',false),'hud'),'not in the Redline HUD image while the overlay shows them');
    // the controller learns where they go: after the HUD layer is reported on screen, the next frame carries them
    let seen=null;const client=new Client(),hud=Object.assign(painter(800,480),{fullTarget:true,key:d=>JSON.stringify([d.indicator,d.turnLit,d.turnInLayer]),draw:d=>{seen=d;return {d:Buffer.alloc(64)};}});
    const out=new Outputs(client,painter(1088,480),hud);out.turn={indicator:'left',lit:true};const cfg={allHudOutput:'redline',hudTurnSignals:'on'};
    out.policy.modeSample(4,0);out.policy.rpmSample(3000,1000);out.tick(1000,cfg);assert.strictEqual(seen.turnInLayer,false,'first frame: overlay');assert.strictEqual(out.turnInLayer,false);
    const ref=out.hud.ref;client.emit('layer',ref,'shown');client.emit('target','hud','shown','cluster-redline','');
    out.policy.rpmSample(3000,1100);out.tick(1100,cfg);out.policy.rpmSample(3000,1200);out.tick(1200,cfg);
    assert.strictEqual(out.turnPainted,false,'until a frame with the arrows is sent, the overlay stays');
    out.policy.rpmSample(3000,1600);out.tick(1600,cfg);
    assert.strictEqual(seen.turnInLayer,true,'Redline HUD on screen: drawn in it');assert.strictEqual(out.turnPainted&&out.hudShown,true,'the worker hides the overlay');
    client.emit('target','hud','shown','stock','');out.policy.rpmSample(3000,1700);out.tick(1700,cfg);assert.strictEqual(out.hudShown,false,'stock takes the slot: back to the overlay');
    out.close();
}
// The Redline HUD face is not forced on for a turn signal preview (the overlay shows it), and other
// Position / size previews end when the settings screen stops being drawn, even without a "hidden" event.
{
    const presence=require('../../apps/cluster_redline/preview-presence');
    const client=new Client(),out=new Outputs(client,painter(1088,480),Object.assign(painter(800,480),{fullTarget:true}));
    const tick=(t,part)=>{out.turn={indicator:'off',lit:false,step:0};out.policy.modeSample(4,t-1);out.policy.rpmSample(800,t);return out.tick(t,{layoutPreview:'hud:'+part+'@'+Date.now()}).outputs.hud;};
    presence.touch();assert(!tick(500,'Turn').requested,'turn preview: no Redline face');
    assert(tick(1000,'Gear').requested,'shown while the screen is drawn');
    presence.touch(Date.now()-presence.STALE_MS-100);assert(!tick(2000,'Gear').requested,'gone once the screen is no longer drawn');
    presence.reset();out.close();
}
if(process.argv[2]){
    const dir=path.join(path.resolve(process.argv[2]),'source/javascript'),turnDraw=require(path.join(dir,'turn-draw'));
    const count=cv=>{let n=0;for(let i=3;i<cv.d.length;i+=4)if(cv.d[i])n++;return n;};
    D.TURN_STYLES.forEach(style=>Object.keys(D.TURN_COLORS).forEach(color=>{
        const c=settings({hudTurnSignals:'on',hudTurnStyle:style,hudTurnColor:color}),r=D.turnRect(c,'left');
        assert(count(turnDraw.painter(r.w,r.h,'left',style,color,0).draw())>50,style+' '+color+' draws');
        if(style==='chevron3'){const n=k=>count(turnDraw.painter(r.w,r.h,'left',style,color,k).draw());assert(n(1)>0&&n(1)<n(2)&&n(2)<n(3),'one, two, three chevrons');}
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
