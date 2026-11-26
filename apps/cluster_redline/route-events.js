'use strict';
const {decodeDart}=require('./native-navigation');
const {INTERFACE,INSTANCE,METHODS,queryParams}=require('./route-events-config');
function decodeReply(reply) {
    if(!reply||(reply.GuidanceEventListError!==0&&reply.GuidanceEventListError!=='NO_ERROR'))return {state:'query_rejected',value:null};
    const views=reply.viewContent;
    if(!Array.isArray(views)||views.length!==1||!views[0]||!Array.isArray(views[0].eventsInView))return {state:'query_shape_invalid',value:null};
    // a passive junction (along the highway, no turn to make) is not a turn to show: left out (1.3.75, with the query
    // asking for them); any other kind the decoder does not know stays, so it is never skipped over
    const events=views[0].eventsInView.filter(e=>!(e&&typeof e==='object'&&e.passiveManeuver&&typeof e.passiveManeuver==='object'));
    if(!events.length)return {state:'no_route_events',value:null};
    if(events.length>10)return {state:'query_limit_exceeded',value:null};
    // The viewport begins at the current car position. Never skip an unknown
    // first event to display a later turn as if it were the upcoming one.
    const value=decodeDart({maneuver:events[0]});
    return {state:value?'maneuver_ready':'first_event_unreadable',value,then:value?nextTurn(events[0],events[1]):null};
}
// The turn after the next one (1.3.35, HUD only): the list's second event, shown under the first when it follows
// within THEN_M, so both can be prepared for (the lane to pick, as a "then" on BMW's own HUD). Written for this app;
// the way to tell how far apart they are, from each event's distance to the destination, is the one the App Kit's
// Redline (cauliflowermossgrape/idrive7-apps, MIT) uses.
const THEN_M=250;
const bodyOf=(e)=>{if(!e||typeof e!=='object')return null;const keys=Object.keys(e).filter(k=>e[k]&&typeof e[k]==='object');return keys.length===1?e[keys[0]]:null;};
const numberOr=(v)=>typeof v==='number'&&isFinite(v)?v:null;
function nextTurn(first,second) {
    if(!second)return null;
    const a=bodyOf(first),b=bodyOf(second);if(!a||!b)return null;
    // a turn the phone (or the head unit) has already passed comes back with a smaller number: not "then"
    const ua=numberOr(a.uid),ub=numberOr(b.uid);if(ua!==null&&ub!==null&&ub<ua)return null;
    // the second turn's own distance text may be missing (a phone sends it only close by): borrow the first's to decode
    let turn=decodeDart({maneuver:second});
    if(!turn&&a.formattedDistance){const copy={};copy[Object.keys(second).find(k=>second[k]===b)]=Object.assign({},b,{formattedDistance:a.formattedDistance});const t=decodeDart({maneuver:copy});if(t)turn=Object.assign(t,{distanceText:null});}
    if(!turn)return null;
    const da=numberOr(a.distanceToDestination),db=numberOr(b.distanceToDestination);
    const gap=da!==null&&db!==null&&da-db>0?da-db:null;
    if(gap===null||gap>THEN_M)return null;
    return {maneuver:turn.maneuver,exitNumber:turn.exitNumber,kind:turn.kind,gap:Math.round(gap)};
}
class RouteEvents {
    constructor(clock,call) {
        this.clock=clock;this.call=call;this.sub=null;this.key=null;this.epoch=0;
        this.pending=false;this.closed=false;this.lastPoll=-Infinity;
        this.value=null;this.at=null;this.state='not_connected';this.lastError=null;
        this.first=null;this.then=null;   // the list's first turn and the one after it (next())
        this.onReply=null;   // the hidden speed limit data collection looks at each reply
    }
    attach(sub) {
        if(this.closed)return;
        if(this.sub!==sub){this.epoch++;this.value=null;this.at=null;this.key=null;}
        this.sub=sub;this.state=sub&&sub.error?'interface_unavailable':'waiting';
    }
    stop() {this.closed=true;this.epoch++;this.sub=null;this.key=null;this.value=null;this.at=null;this.state='stopped';}
    tick(now,key) {
        const sub=this.sub,available=!!(sub&&sub.available===true&&!sub.error&&sub.proxy);
        if(key!==this.key||!available){this.epoch++;this.key=key;this.value=null;this.at=null;this.first=null;this.then=null;}
        if(this.closed||key===null||!available||this.pending||now-this.lastPoll<1000)return;
        this.pending=true;this.lastPoll=now;this.state='reading';const epoch=this.epoch;
        const current=()=>!this.closed&&epoch===this.epoch&&key===this.key&&this.sub===sub&&sub.available===true&&!sub.error;
        Promise.resolve().then(()=>this.call(sub.proxy,'queryContent',queryParams(),1000)).then(reply=>{
            if(!current())return;
            if(this.onReply)try{this.onReply(reply);}catch(e){}
            const decoded=decodeReply(reply);
            this.value=decoded.value?Object.assign({source:'route_event_list'},decoded.value):null;
            this.first=decoded.value||null;this.then=decoded.then||null;
            this.at=this.value?this.clock():null;this.state=decoded.state;this.lastError=null;
        },e=>{
            if(!current())return;
            this.value=null;this.at=null;this.state='read_failed';this.lastError=String(e&&e.message||e).slice(0,160);
        }).then(()=>{this.pending=false;});
    }
    read(now,key) {
        const s=this.sub;
        return !this.closed&&key!==null&&key===this.key&&s&&s.available===true&&!s.error&&this.value&&this.at!==null&&now>=this.at&&now-this.at<=2000?
            Object.assign({visible:true,active:true,known:true,reason:'navigation_ready',needsStock:true},this.value):null;
    }
    /** The turn after the one shown (maneuver: what the HUD shows now), or null: fresh, the same route, and the list's
     *  first turn the one on the HUD (BMW's own guidance and the phone's are both checked against it). */
    next(now,key,maneuver) {
        const s=this.sub;
        if(this.closed||key===null||key!==this.key||!s||s.available!==true||s.error||!this.then||!this.first||this.at===null||now-this.at>2000)return null;
        return maneuver&&maneuver.maneuver===this.first.maneuver&&(maneuver.exitNumber||null)===(this.first.exitNumber||null)?this.then:null;
    }
    status(now) {return {state:this.state,available:!!(this.sub&&this.sub.available===true&&!this.sub.error),pending:this.pending,
        ageMs:this.at===null?null:Math.max(0,now-this.at),error:this.lastError};}
}
module.exports={RouteEvents,decodeReply,nextTurn,THEN_M,INTERFACE,INSTANCE,METHODS};
