'use strict';
const {decodeDart}=require('./native-navigation');
const {INTERFACE,INSTANCE,METHODS}=require('./hud-guidance-config');
const ok=r=>r&&(r.GenericListError===0||r.GenericListError==='NO_ERROR');
// Read existing HUD views only. Never create/register a view, request a stream,
// change its settings or use CID/cluster content as a HUD maneuver.
class HudGuidance {
    constructor(clock,call) {
        this.clock=clock;this.call=call;this.sub=null;this.key=null;this.epoch=0;this.pending=false;
        this.lastPoll=-Infinity;this.value=null;this.at=null;this.state='not_connected';this.views=[];this.lastError=null;this.closed=false;
    }
    attach(sub) { if(this.closed)return;this.sub=sub;this.state=sub&&sub.error?'interface_unavailable':'waiting'; }
    stop() {this.closed=true;this.epoch++;this.value=null;this.at=null;this.sub=null;this.key=null;this.state='stopped';}
    tick(now,key) {
        const sub=this.sub,available=!!(sub&&sub.available===true&&!sub.error&&sub.proxy);
        if(key!==this.key||!available){this.epoch++;this.key=key;this.value=null;this.at=null;}
        if(this.closed||key===null||!available||this.pending||now-this.lastPoll<1000)return;
        this.lastPoll=now;this.pending=true;this.state='reading';const epoch=this.epoch;
        const current=()=>!this.closed&&epoch===this.epoch&&this.key===key&&this.sub===sub&&sub.available===true&&!sub.error;
        const read=async()=>{
            const raw=await sub.proxy.getValue('registeredViews',1000);if(!current())return;
            if(!Array.isArray(raw)){this.state='view_list_invalid';return;}
            const ids=raw.filter(id=>typeof id==='string'&&id.length>0&&id.length<=128).slice(0,8);
            this.views=[];const matches=[];
            for(const id of ids){
                if(!current())return;
                const config=await this.call(sub.proxy,'getViewConfig',{viewId:id},1000);if(!current())return;
                const target=config&&config.viewConfig&&config.viewConfig.targetUI;
                this.views.push({id,targetUI:typeof target==='string'||typeof target==='number'?target:null,configReplyKeys:config&&typeof config==='object'?Object.keys(config).slice(0,12):[]});
                if(!ok(config)||(target!==3&&target!=='HUD'))continue;
                const reply=await this.call(sub.proxy,'getViewContent',{viewId:id},1000);if(!current())return;
                const content=reply&&reply.viewContent,type=content&&content.type&&content.type.contentType;
                const entry=this.views[this.views.length-1];entry.contentType=type===undefined?null:type;
                entry.contentReplyKeys=reply&&typeof reply==='object'?Object.keys(reply).slice(0,12):[];
                entry.configSequenceId=config.configSequenceId;entry.contentSequenceId=content&&content.configSequenceId;
                if(!ok(reply)||!Number.isInteger(config.configSequenceId)||!content||content.configSequenceId!==config.configSequenceId||(type!==1&&type!=='HIGH_GUIDING')||!Number.isInteger(content.ramsesSceneId)||content.ramsesSceneId<=0)continue;
                const event=content.associatedEvent,decoded=decodeDart({maneuver:event});
                if(this.onEvent)try{this.onEvent(event,decoded);}catch(e){}   // the navigation record (nav-probe.js)
                entry.kind=event&&typeof event==='object'?Object.keys(event).filter(k=>event[k]!=null).slice(0,2):[];
                if(entry.kind.length===1){
                    const item=event[entry.kind[0]],distance=item&&item.formattedDistance;
                    if(distance)entry.distance={text:typeof distance.distance==='string'?distance.distance.slice(0,48):null,unit:typeof distance.unit==='string'?distance.unit.slice(0,32):distance.unit};
                }
                if(decoded)matches.push(Object.assign({},decoded,{source:'hud_rendered_event',viewId:id}));
            }
            if(!current())return;
            // Multiple distinct HUD arrows must not be selected arbitrarily.
            const distinct=matches.filter((v,i,a)=>a.findIndex(x=>x.maneuver===v.maneuver&&x.distanceText===v.distanceText&&x.exitNumber===v.exitNumber&&x.kind===v.kind&&x.branchType===v.branchType&&x.description===v.description)===i);
            this.value=distinct.length===1?distinct[0]:null;this.at=this.value?this.clock():null;
            this.state=distinct.length>1?'hud_views_ambiguous':this.value?'maneuver_ready':'no_readable_hud_maneuver';this.lastError=null;
        };
        Promise.resolve().then(read).catch(e=>{if(current()){this.value=null;this.at=null;this.state='read_failed';this.lastError=String(e.message||e).slice(0,160);}})
            .then(()=>{this.pending=false;});
    }
    read(now,key) {
        const s=this.sub;
        return !this.closed&&key!==null&&key===this.key&&s&&s.available===true&&!s.error&&this.value&&this.at!==null&&now>=this.at&&now-this.at<=2000?Object.assign({visible:true,reason:'navigation_ready',active:true,known:true,needsStock:true},this.value):null;
    }
    status(now) {return {state:this.state,available:!!(this.sub&&this.sub.available===true&&!this.sub.error),pending:this.pending,ageMs:this.at===null?null:Math.max(0,now-this.at),views:this.views.slice(),error:this.lastError};}
}
module.exports={HudGuidance,INTERFACE,INSTANCE,METHODS};
