'use strict';
// Read-only decoding of the vehicle's Guidance schema. No destinations or coordinates.
const TTL_MS=5000;
const {summarize}=require('./navigation-input');
const DIRECTIONS=['NONE','STRAIGHT_ON','LEFT','SLIGHT_LEFT','HARD_LEFT','RIGHT','SLIGHT_RIGHT','HARD_RIGHT','UTURN_RIGHT','UTURN_LEFT'];
const PROVIDERS=['NONE','CAR_PLAY','ANDROID_AUTO','CAR_LIFE','OTHER'];
const STATES=['INACTIVE','CALCULATING_ROUTE','ACTIVE'];
const UNITS=['','km','mi','mi','m','yd','ft'];
const UNIT_NAMES=['NONE','KM','MILE_UK','MILE_US','METER','YARD','FEET'];
const SUPPORTED=['intersection','branch','roundabout','alongMainRoad','laneChange','destinationManeuver'];
const BRANCHES=['NONE','BRANCH_LEFT','BRANCH_RIGHT','HIGHWAY_IN_LEFT','HIGHWAY_IN_RIGHT','HIGHWAY_IN_STRAIGHT','HIGHWAY_OUT_LEFT','HIGHWAY_OUT_RIGHT','HIGHWAY_OUT_STRAIGHT','FORK_LEFT','FORK_RIGHT','TRIPLE_FORK_LEFT','TRIPLE_FORK_RIGHT','TRIPLE_FORK_STRAIGHT','OVERPASS','UNDERPASS'];
function enumeration(value,names) { return typeof value==='string'&&names.indexOf(value)>=0?value:typeof value==='number'&&value===Math.floor(value)&&value>=0&&value<names.length?names[value]:null; }
function object(v) { return !!v&&typeof v==='object'&&!Array.isArray(v); }
function distanceText(value) {
    if(!object(value)||typeof value.distance!=='string')return null;
    // Display the supplied localized number and declared unit, never assume rawDistance is metres.
    const text=value.distance.trim(),unit=enumeration(value.unit,UNIT_NAMES);
    if(!text||!/[0-9]/.test(text)||text.length>24||!unit||unit==='NONE'||/[\x00-\x1f\x7f]/.test(text))return null;
    const suffix=UNITS[UNIT_NAMES.indexOf(unit)];
    return text.toLowerCase().endsWith(suffix)?text:text+' '+suffix;
}
function descriptionText(value) {
    if(!object(value)||!Array.isArray(value.elements))return '';
    const text=value.elements.slice(0,24).map(e=>{
        if(!object(e))return '';
        if(typeof e.text==='string')return e.text;
        // an icon's own text (1.3.75): an exit or IC number, a road number on its shield, sent as an icon, not as text
        if(object(e.icon)&&typeof e.icon.text==='string'&&e.icon.text.trim())return ' '+e.icon.text.trim()+' ';
        if(e.spacer==='SLASH'||e.spacer===4)return ' / ';
        if(e.spacer!==undefined&&e.spacer!==null)return ' ';
        return '';
    }).join('').replace(/[\x00-\x1f\x7f]/g,' ').replace(/\s+/g,' ').trim();
    return Array.from(text).slice(0,64).join('');
}
function decodeDart(value) {
    if(!object(value)||!object(value.maneuver))return null;
    const stamp=value.timeStamp;
    if(stamp&&((stamp.date&&stamp.date.invalid===true)||(stamp.time&&stamp.time.invalid===true)))return null;
    const union=value.maneuver,keys=Object.keys(union).filter((k)=>union[k]!==undefined&&union[k]!==null);
    if(keys.length!==1)return null;
    const kind=keys[0],item=union[kind];
    if(!object(item)||item.unreliable===true)return null;
    let maneuver=null,exitNumber=null,branchType=null;
    if(kind==='intersection')maneuver=enumeration(item.direction,DIRECTIONS);
    else if(kind==='branch') {
        const branch=branchType=enumeration(item.branchType,BRANCHES);
        if(branch&&/LEFT$/.test(branch))maneuver='SLIGHT_LEFT';
        else if(branch&&/RIGHT$/.test(branch))maneuver='SLIGHT_RIGHT';
        else if(branch&&/STRAIGHT$/.test(branch))maneuver='STRAIGHT_ON';
    } else if(kind==='roundabout'&&Number.isInteger(item.exitNumber)&&item.exitNumber>0&&item.exitNumber<100) {
        maneuver='ROUNDABOUT';exitNumber=item.exitNumber;
    }
    if(kind==='alongMainRoad') {
        const side=enumeration(item.mainRoadDirection,['LEFT','RIGHT']);
        if(side)maneuver='KEEP_'+side;
    } else if(kind==='laneChange') {
        const side=enumeration(item.changeSide,['NONE','LEFT','RIGHT']);
        if(side&&side!=='NONE')maneuver='LANE_'+side;
    } else if(kind==='destinationManeuver') {
        const position=enumeration(item.position,['NONE','LEFT','CENTER','RIGHT','NOT_DIGITIZED']);
        if(position&&position!=='NONE')maneuver='ARRIVAL_'+position;
    }
    const text=distanceText(item.formattedDistance);
    if(!maneuver||maneuver==='NONE'||!text)return null;
    const decoded={maneuver,distanceText:text,exitNumber,kind};
    // Keep the supplied entry/exit identity: both previously became the same
    // slight-turn arrow, losing the information needed for a highway diagram.
    if(branchType)decoded.branchType=branchType;
    const description=descriptionText(item.description);if(description)decoded.description=description;
    return decoded;
}
function dartFailure(value) {
    if(!object(value))return 'payload_missing';
    if(!object(value.maneuver))return 'maneuver_missing';
    const stamp=value.timeStamp;
    if(stamp&&((stamp.date&&stamp.date.invalid===true)||(stamp.time&&stamp.time.invalid===true)))return 'clock_invalid';
    const keys=Object.keys(value.maneuver).filter((k)=>value.maneuver[k]!==undefined&&value.maneuver[k]!==null);
    if(keys.length!==1)return 'union_ambiguous';
    const kind=keys[0],item=value.maneuver[kind];
    if(!object(item))return 'variant_missing';
    if(item.unreliable===true)return 'maneuver_unreliable';
    if(SUPPORTED.indexOf(kind)<0)return 'maneuver_unsupported';
    if(!distanceText(item.formattedDistance))return 'distance_unavailable';
    return 'direction_unavailable';
}
class NativeNavigation {
    constructor(ttl) { this.ttl=typeof ttl==='number'&&isFinite(ttl)&&ttl>0?ttl:TTL_MS;this.clear(); }
    clearGuidance() {
        this.state=null;this.provider=null;this.dart=null;
        this.stateAt=this.providerAt=this.dartAt=null;this.dartDetail='not_received';this.dartKind=null;this.inputSummary=null;this.inputAt=null;
    }
    clear() {
        this.clearGuidance();this.projections={};
        ['ANDROID_AUTO','CAR_PLAY'].forEach((provider)=>{
            this.projections[provider]={available:false,active:null,activeAt:null,metadataAvailable:null,metadataAt:null};
        });
    }
    clock(now) { return typeof now==='number'&&isFinite(now)&&now>=0; }
    fresh(at,now) { return this.clock(now)&&at!==null&&now>=at&&now-at<=this.ttl; }
    phone(provider) { return provider==='ANDROID_AUTO'||provider==='CAR_PLAY'; }
    invalidate(reason) { this.dart=null;this.dartAt=null;this.dartDetail=reason;this.dartKind=null;this.inputSummary=null;this.inputAt=null; }
    phoneActive(provider,now) {
        const p=this.projections[provider];
        return !!(p&&p.available===true&&p.active===true&&this.fresh(p.activeAt,now));
    }
    projectionAvailability(provider,available,now) {
        const name=enumeration(provider,PROVIDERS),p=this.projections[name];
        if(!p)return;
        const before=this.phoneActive(name,now);
        p.available=available===true&&this.clock(now);
        if(!p.available){p.active=null;p.activeAt=null;p.metadataAvailable=null;p.metadataAt=null;}
        if(name===this.provider&&(!before||!this.phoneActive(name,now)))this.invalidate(p.available?'projection_unconfirmed':'projection_unavailable');
    }
    projectionSample(provider,field,value,now) {
        const name=enumeration(provider,PROVIDERS),p=this.projections[name];
        if(!p)return;
        if(!this.clock(now)){this.projectionAvailability(name,false,now);return;}
        const before=this.phoneActive(name,now),flag=typeof value==='boolean'?value:null;
        if(field==='projectedGuidanceActive'){p.active=flag;p.activeAt=now;}
        else if(field==='projectedGuidanceMetadataAvailable'){p.metadataAvailable=flag;p.metadataAt=now;}
        else return;
        // An old route's arrow must not reappear on activation, reconnection,
        // or the first confirmation after a gap in the source's live state.
        if(name===this.provider&&(!before||!this.phoneActive(name,now)))this.invalidate(flag===false?'projection_inactive':'projection_unconfirmed');
    }
    projectedStatus(now) {
        const out={};
        Object.keys(this.projections).forEach((provider)=>{
            const p=this.projections[provider],age=(at)=>at===null||!this.clock(now)?null:now-at;
            out[provider]={available:p.available,active:p.active,activeFresh:p.available&&this.fresh(p.activeAt,now)&&p.active!==null,
                metadataAvailable:p.metadataAvailable,metadataFresh:p.available&&this.fresh(p.metadataAt,now)&&p.metadataAvailable!==null,
                activeAgeMs:age(p.activeAt),metadataAgeMs:age(p.metadataAt)};
        });
        return out;
    }
    context(now,available) {
        const blocked=(reason)=>({active:false,known:false,needsStock:true,reason});
        if(available!==true)return blocked('navigation_unavailable');
        if(!this.provider||!this.fresh(this.providerAt,now))return blocked('navigation_provider_unknown');
        const nativeKnown=this.state!==null&&this.fresh(this.stateAt,now);
        const anotherPhoneActive=Object.keys(this.projections).some((provider)=>provider!==this.provider&&this.phoneActive(provider,now));
        if(this.phone(this.provider)) {
            const p=this.projections[this.provider];
            if(!p.available)return blocked('projection_unavailable');
            if(p.active===null||!this.fresh(p.activeAt,now))return blocked(p.activeAt===null?'projection_unknown':'projection_stale');
            if(p.active===true)return {active:true,known:true,needsStock:true,reason:'projection_active'};
            if(anotherPhoneActive)return blocked('navigation_provider_mismatch');
            return {active:false,known:true,needsStock:!nativeKnown||this.state!=='INACTIVE',reason:'navigation_inactive'};
        }
        if(!nativeKnown)return blocked('navigation_unknown');
        if(this.state==='ACTIVE')return {active:true,known:true,needsStock:true,reason:'guidance_active'};
        if(anotherPhoneActive)return blocked('navigation_provider_mismatch');
        return {active:false,known:true,needsStock:this.state!=='INACTIVE',reason:this.state==='INACTIVE'?'navigation_inactive':'navigation_calculating'};
    }
    sample(field,value,now) {
        if(!this.clock(now)){this.clear();return;}
        if(field==='guidanceState') {
            const next=enumeration(value,STATES);
            // This can remain INACTIVE during phone guidance; the matched
            // phone manager supplies the projected route's active state.
            if(!this.phone(this.provider)&&(this.state!==next||next!=='ACTIVE'))this.invalidate(next==='ACTIVE'?'route_changed':'state_not_active');
            this.state=next;this.stateAt=now;
        }
        if(field==='guidingProvider') {
            const next=enumeration(value,PROVIDERS);
            if(this.provider!==next)this.invalidate('provider_changed');
            this.provider=next;this.providerAt=now;
        }
        if(field==='conclusiveDart') {
            const union=object(value)&&object(value.maneuver)?value.maneuver:null;
            const kinds=union?Object.keys(union).filter(k=>union[k]!==undefined&&union[k]!==null):[];
            this.dartKind=kinds.length===1&&kinds[0].length<=64?kinds[0]:null;
            const decoded=decodeDart(value),ctx=this.context(now,true);
            this.inputSummary=ctx.active?summarize(value):null;this.inputAt=this.inputSummary?now:null;
            this.dart=ctx.active?decoded:null;this.dartAt=this.dart?now:null;
            this.dartDetail=this.dart?'decoded':decoded?ctx.reason:dartFailure(value);
        }
    }
    read(now,available) {
        const ctx=this.context(now,available);
        const input=ctx.active&&this.fresh(this.inputAt,now)?this.inputSummary:null;
        if(!ctx.active) {
            if(this.dart)this.invalidate(ctx.reason);
            return Object.assign({visible:false,provider:this.provider,maneuver:null,distanceText:null,exitNumber:null,detail:this.dartDetail,kind:this.dartKind},ctx);
        }
        if(this.dart&&this.fresh(this.dartAt,now))return Object.assign({visible:true,reason:'navigation_ready',provider:this.provider,ageMs:now-this.dartAt,active:true,known:true,needsStock:true,input},this.dart);
        if(this.dart)this.invalidate('maneuver_stale');
        return {visible:false,reason:'navigation_maneuver_unknown',provider:this.provider,maneuver:null,distanceText:null,exitNumber:null,detail:this.dartDetail,kind:this.dartKind,active:true,known:true,needsStock:true,input};
    }
}
module.exports={descriptionText,NativeNavigation,decodeDart,distanceText,TTL_MS,DIRECTIONS,PROVIDERS};
