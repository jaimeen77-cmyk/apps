'use strict';
const {decodeDart}=require('./native-navigation');
const {INTERFACE,INSTANCE,METHODS,queryParams}=require('./route-events-config');
function decodeReply(reply) {
    if(!reply||(reply.GuidanceEventListError!==0&&reply.GuidanceEventListError!=='NO_ERROR'))return {state:'query_rejected',value:null};
    const views=reply.viewContent;
    if(!Array.isArray(views)||views.length!==1||!views[0]||!Array.isArray(views[0].eventsInView))return {state:'query_shape_invalid',value:null};
    const events=views[0].eventsInView;
    if(!events.length)return {state:'no_route_events',value:null};
    if(events.length>6)return {state:'query_limit_exceeded',value:null};
    // The viewport begins at the current car position. Never skip an unknown
    // first event to display a later turn as if it were the upcoming one.
    const value=decodeDart({maneuver:events[0]});
    return {state:value?'maneuver_ready':'first_event_unreadable',value};
}
class RouteEvents {
    constructor(clock,call) {
        this.clock=clock;this.call=call;this.sub=null;this.key=null;this.epoch=0;
        this.pending=false;this.closed=false;this.lastPoll=-Infinity;
        this.value=null;this.at=null;this.state='not_connected';this.lastError=null;
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
        if(key!==this.key||!available){this.epoch++;this.key=key;this.value=null;this.at=null;}
        if(this.closed||key===null||!available||this.pending||now-this.lastPoll<1000)return;
        this.pending=true;this.lastPoll=now;this.state='reading';const epoch=this.epoch;
        const current=()=>!this.closed&&epoch===this.epoch&&key===this.key&&this.sub===sub&&sub.available===true&&!sub.error;
        Promise.resolve().then(()=>this.call(sub.proxy,'queryContent',queryParams(),1000)).then(reply=>{
            if(!current())return;
            if(this.onReply)try{this.onReply(reply);}catch(e){}
            const decoded=decodeReply(reply);
            this.value=decoded.value?Object.assign({source:'route_event_list'},decoded.value):null;
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
    status(now) {return {state:this.state,available:!!(this.sub&&this.sub.available===true&&!this.sub.error),pending:this.pending,
        ageMs:this.at===null?null:Math.max(0,now-this.at),error:this.lastError};}
}
module.exports={RouteEvents,decodeReply,INTERFACE,INSTANCE,METHODS};
