'use strict';
// The car ahead for the HUD headway badge (1.3.37): its distance, the time gap at our speed, and how fast we close on it
// or fall back. From de.bmw.dass.GapVehicleAhead (the ACC / front radar's measurement), added at install by
// traffic-config.js where the car's catalog has it, and subscribed only while the badge is on.
//   GapVehicleDrivingAhead    statusMeasurementVehicleDrivingAhead (0 / KEIN_ELEMENT...: none; 1..4 / ..._GEMESSEN,
//                             ..._PRAEDIZIERT: measured; 5 and up: invalid), gapVehicleDrivingAhead (metres)
//   DataFrontVehicle          frontVehicleGapX (x 0.0625 m, 0 or 4090 and up: none), frontVehicleObjectID (250 and up:
//                             none), qualifierEventDataFunctionFrontVehicle (2, 15, NOT_AVAILABLE...: invalid)
//   DataFrontVehicleExtended  the kind of object (shown in the status only)
// The field names, values and scale are those chyiz's idrive7-cluster-metrics found on a G30 (GPL; facts only, no code
// taken); not yet seen on this car, so the settings screen shows what arrives. Read only: nothing is ever sent.
const {AssistView}=require('./assist-view'),{CameraObjects}=require('./camera-objects'),{LeadHelper}=require('./lead-helper');
const IFACE='de.bmw.dass.GapVehicleAhead',FIELDS=['GapVehicleDrivingAhead','DataFrontVehicle','DataFrontVehicleExtended'];
const STALE_MS=2500,FINE_MS=900,MIN_M=0.4,MAX_M=260,SLOW_KMH=12,RED_S=1.0,AMBER_S=1.5;
const num=(v)=>typeof v==='number'&&isFinite(v)?v:null;
const names=(v,re)=>typeof v==='string'&&re.test(v);
/** The time gap's colour step: 'red' under 1.0 s, 'amber' under 1.5 s, else 'ok' (also without a time gap). */
function level(headway){return headway===null?'ok':headway<RED_S?'red':headway<AMBER_S?'amber':'ok';}
class LeadVehicle {
    // clock: the worker's monotonic ms (the same as read()'s now)
    constructor(signals,log,instanceOf,clock) {
        this.clock=clock||Date.now;this.signals=signals;this.log=log||{warn(){},info(){}};this.instanceOf=instanceOf||(()=>'1');
        this.sub=null;this.state='off';this.error=null;this.token=0;this.instance=null;this.altInstance=null;this.subscribedAt=0;this.speed=null;this.speedAt=null;
        this.raw={status:null,gap:null,gapX:null,object:null,qualifier:null,kind:null};this.received=0;this.reset();
        // the car's Drive assist view (assist-view.js, 1.3.68): the car followed when the radar's service is not offered
        this.radarAt=null;this.source=null;
        this.assist=new AssistView(signals,log,instanceOf,this.clock,(m,id,now)=>this.fromAssist(m,id,now),(now)=>{if(this.source==='assist'&&!this.radarFresh(now))this.reset();});
        // the front camera's object list (camera-objects.js, 1.3.73): before the Drive assist view, after the radar
        this.cameraAt=null;
        // Cluster Redline's root helper (lead-helper.js, native/redline-lead, 1.3.74): the same camera objects and radar,
        // received as root where this app's uid is refused them; first of all when it is installed
        this.helper=new LeadHelper((m,now)=>this.fromHelper(m,now),this.clock);
        this.camera=new CameraObjects(signals,log,instanceOf,this.clock,(m,id,now)=>{this.cameraAt=now;this.fromAssist(m,id,now,'camera');},(now)=>{if(this.source==='camera'&&!this.radarFresh(now))this.reset();});
    }
    reset(){this.type=null;this.gap=null;this.at=null;this.fineAt=null;this.object=null;this.closing=null;this.ref=null;this.source=null;this.cameraAt=null;}
    fromHelper(m,now){
        const f=m.radar&&m.radar.front,g=m.radar&&m.radar.gap,c=m.cam;
        // the radar, only a valid reading (its "no car" values would clear the camera's car too)
        if(f&&f.qualifier<2&&f.id<250&&f.gapX>0&&f.gapX<4090)this.sampleFront({qualifierEventDataFunctionFrontVehicle:f.qualifier,frontVehicleObjectID:f.id,frontVehicleGapX:f.gapX},now);
        if(g&&g.status>=1&&g.status<=4&&g.gap>0&&g.gap<250)this.sampleGap({statusMeasurementVehicleDrivingAhead:g.status,gapVehicleDrivingAhead:g.gap},now);
        // the camera's car in our lane, while its lists are fresh
        const fresh=c&&typeof c.at==='number'&&typeof m.at==='number'&&m.at-c.at<1500;
        if(fresh&&c.lead&&typeof c.lead.m==='number'){this.cameraAt=now;this.fromAssist(c.lead.m,c.lead.id,now,'camera');this.type=typeof c.lead.type==='number'?c.lead.type:null;}
        else if(this.source==='camera'&&!this.radarFresh(now))this.reset();
    }
    radarFresh(now){return this.radarAt!==null&&now-this.radarAt<STALE_MS;}
    fromAssist(m,id,now,src){src=src||'assist';if(this.radarFresh(now))return;if(src==='assist'&&this.cameraAt!==null&&now-this.cameraAt<STALE_MS)return;
        if(this.source!==src){this.closing=null;this.ref=null;}this.distance(m,id,now);this.source=src;}
    // on: the badge wanted (on, the app running, the car's signals there). Subscribes or lets go.
    sync(on) {
        if(this.assist)this.assist.sync(on);if(this.camera)this.camera.sync(on);if(this.helper)this.helper.sync(on,this.clock());
        if(!on){if(this.sub||this.state==='subscribing'){this.token++;if(this.sub)try{this.sub.shutdown();}catch(e){}this.sub=null;}this.state='off';this.reset();return;}
        if(this.sub)this.check(this.clock());
        if(this.sub||this.state==='subscribing'||this.state==='not_installed'||this.state==='error')return;
        let cfg=null;try{cfg=this.signals.loadConfig(IFACE);}catch(e){}
        const fields=cfg&&cfg.fields?FIELDS.filter(f=>cfg.fields[f]):[];
        if(!fields.length){this.state='not_installed';return;}
        const token=++this.token,handlers={};
        handlers.GapVehicleDrivingAhead=(v)=>{if(token===this.token)this.sampleGap(v,this.clock());};
        handlers.DataFrontVehicle=(v)=>{if(token===this.token)this.sampleFront(v,this.clock());};
        handlers.DataFrontVehicleExtended=(v)=>{if(token===this.token&&v&&typeof v==='object'){const k=v.frontVehicleExtendedObjectType;if(k!==undefined&&k!==null)this.raw.kind=String(k);}};
        const wanted={};fields.forEach(f=>{wanted[f]=handlers[f];});
        this.state='subscribing';
        // the instance the manifest names; after 20 s offered nothing there, instance 1 (as cluster-metrics subscribes it), once
        const inst=this.altInstance||String(this.instanceOf(IFACE)||'1');this.instance=inst;this.subscribedAt=this.clock();
        Promise.resolve().then(()=>this.signals.watch(IFACE,inst,wanted,this.log,{})).then((s)=>{
            if(token!==this.token){try{s.shutdown();}catch(e){}return;}
            this.sub=s;this.error=s&&s.error?String(s.error):null;this.state=this.error?'error':'subscribed';
        },(e)=>{if(token===this.token){this.error=String(e&&e.message||e).slice(0,120);this.state='error';}});
    }
    // nothing received for 20 s on another instance than 1, the service not offered there: subscribed again on 1 (1.3.65)
    check(now){
        if(this.state!=='subscribed'||this.received||this.altInstance||this.instance==='1'||now-this.subscribedAt<20000)return;
        if(this.sub&&this.sub.available)return;
        this.altInstance='1';this.token++;try{this.sub.shutdown();}catch(e){}this.sub=null;this.state='off';this.sync(true);
    }
    /** Our speed (Vehicle2.statusCarSpeed2, km/h x 64), as the vehicle alerts read it. */
    sampleSpeed(v,now){const r=v&&num(v.speedVehicleCentreOfGravity);this.speed=r!==null&&r>=0&&r<=400*64?r/64:null;this.speedAt=this.speed===null?null:now;}
    sampleGap(v,now) {
        if(!v||typeof v!=='object')return;this.received++;
        const s=v.statusMeasurementVehicleDrivingAhead,g=num(v.gapVehicleDrivingAhead);this.raw.status=s===undefined?null:s;this.raw.gap=g;
        const none=s===0||(typeof s==='number'&&s>=5)||names(s,/KEIN|UNGUELTIG|FEHLER|INVALID|NOT_/);
        const measured=(typeof s==='number'&&s>=1&&s<=4)||names(s,/GEMESSEN|PRAEDIZIERT/)&&!names(s,/KEIN/);
        const fine=this.fineAt!==null&&now-this.fineAt<FINE_MS;
        if(none){if(!fine)this.lost();return;}
        // the coarse metres only while the finer distance is not coming
        if(measured&&!fine&&g!==null){this.distance(g,this.object,now);this.radarAt=now;this.source='radar';}
    }
    sampleFront(v,now) {
        if(!v||typeof v!=='object')return;this.received++;
        const q=v.qualifierEventDataFunctionFrontVehicle,id=num(v.frontVehicleObjectID),x=num(v.frontVehicleGapX);
        this.raw.qualifier=q===undefined?null:q;this.raw.object=id;this.raw.gapX=x;
        const bad=q===2||q===15||names(q,/NOT_AVAILABLE|UNBEFUELLT|INVALID/);
        if(bad||(id!==null&&id>=250)||(x!==null&&(x<=0||x>=4090))){this.lost();return;}
        if(x!==null){this.fineAt=now;this.distance(x*0.0625,id,now);this.radarAt=now;this.source='radar';}
    }
    lost(){this.reset();}
    distance(m,id,now) {
        if(m<MIN_M||m>MAX_M)return;
        // another car ahead (a new object): its closing speed starts again
        if(id!==null&&this.object!==null&&id!==this.object){this.closing=null;this.ref=null;}
        if(id!==null)this.object=id;
        // closing speed from how the gap changes, a quarter second apart at least, smoothed; negative: closing in
        if(!this.ref)this.ref={m,at:now};
        else{const dt=now-this.ref.at;
            if(dt>=250&&dt<=2000){const kmh=(m-this.ref.m)/(dt/1000)*3.6;if(Math.abs(kmh)<=140)this.closing=this.closing===null?kmh:this.closing*0.65+kmh*0.35;this.ref={m,at:now};}
            else if(dt>2000||dt<0)this.ref={m,at:now};}
        this.gap=m;this.at=now;
    }
    /** The car ahead now: { gap m, headway s or null (slow, or our speed unknown), closing km/h or null, level }, or null. */
    read(now) {
        if(this.state==='off'||this.gap===null||this.at===null||now-this.at>STALE_MS)return null;
        const speed=this.speedAt!==null&&now-this.speedAt<=STALE_MS?this.speed:null;
        const headway=speed!==null&&speed>=SLOW_KMH?Math.max(0.1,Math.min(9.9,this.gap/(speed/3.6))):null;
        return {gap:this.gap,headway,closing:this.closing,level:level(headway),type:this.type===undefined?null:this.type};   // (type: the camera's class, 1.3.87)
    }
    // nothing of the car ahead offered to the app at all, 10 s after subscribing (1.3.70): the radar's service and the
    // Drive assist view's two sources not offered (or not in the catalog), nothing received. The user's car is so:
    // its cluster draws the Drive assist view from the driving assistant directly, the head unit never gets it.
    unsupported(now){
        if(this.state==='off'||this.received)return false;
        if(this.helper&&this.helper.lines)return false;   // the root helper answers: the car ahead does reach the head unit
        const a=this.assist?this.assist.status():null,since=Math.max(this.subscribedAt||0,a&&a.state==='subscribed'?this.assist.startedAt||0:0);
        if(now===undefined||now-since<10000)return false;
        const radarOff=this.state==='not_installed'||this.state==='error'||(this.state==='subscribed'&&!(this.sub&&this.sub.available));
        const assistOff=!a||a.state!=='subscribed'||(!(a.acc&&a.acc.offered)&&!(a.objects&&a.objects.offered)&&!a.received.acc&&!a.received.objects);
        const c=this.camera?this.camera.status():null,cameraOff=!c||c.state!=='subscribed'||(!c.offered&&!c.received.rec&&!c.received.pos);
        return radarOff&&assistOff&&cameraOff;
    }
    status(now){return {unsupported:this.unsupported(now),helper:this.helper?this.helper.status():null,source:this.source,camera:this.camera?this.camera.status():null,assist:this.assist?this.assist.status():null,state:this.state,error:this.error,received:this.received,instance:this.instance||null,available:this.sub?!!this.sub.available:null,raw:Object.assign({},this.raw),ageMs:this.at===null?null:Math.round(now-this.at)};}
}
/** The car ahead as shown (1.3.91): the distance with the correction added (metres, 0 to -3: the sensor sits behind the
 *  windscreen, about 2 m behind the bumper), never under 0, and the time gap with it. read() keeps the sensor's own. */
function corrected(v,offset){
    if(!v||typeof v.gap!=='number'||!offset)return v;
    const out=Object.assign({},v,{gap:Math.max(0,v.gap+offset)});
    if(typeof v.headway==='number'&&v.gap>0){out.headway=Math.max(0.1,Math.min(9.9,v.headway*out.gap/v.gap));out.level=level(out.headway);}
    return out;
}
module.exports={LeadVehicle,level,corrected,IFACE,FIELDS,STALE_MS,SLOW_KMH,RED_S,AMBER_S};
