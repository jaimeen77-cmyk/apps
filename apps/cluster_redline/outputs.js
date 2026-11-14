'use strict';
const { EventEmitter } = require('events');
const { Controller } = require('./controller');
const { Policy, settings } = require('./policy');
const { Telemetry } = require('./telemetry');
const D=require('./display-config'),{navAllowed,rpmOutput}=D;
const { tr } = require('./strings');
const { UploadPacer } = require('./upload');
// One socket and one upload allowance, with independently released outputs.
class OutputClient extends EventEmitter {
    constructor(client) {
        super(); this.client = client; this.refs = new Set(); this.listeners = [];
        ['ready', 'disconnected', 'layer', 'target'].forEach((name) => this.forward(name));
        const refused = (op, ref, reason) => {
            if (!ref || this.refs.has(ref)) this.emit('refused', op, ref, reason);
        };
        client.on('refused', refused); this.listeners.push(['refused', refused]);
    }
    forward(name) { const fn = (...args) => this.emit(name, ...args); this.client.on(name, fn); this.listeners.push([name, fn]); }
    get ready() { return this.client.ready; }
    get targets() { return this.client.targets; }
    image(options) { const ref = this.client.image(options); if (ref) this.refs.add(ref); return ref; }
    pixels() { return this.client.pixels.apply(this.client, arguments); }
    set() { return this.client.set.apply(this.client, arguments); }
    canPaint(ref) { return this.client.canPaint?this.client.canPaint(ref):true; }
    contendWhenSent(ref) {
        if (this.client.contendWhenSent) return this.client.contendWhenSent(ref);
        return this.client.set(ref, { contend: true });
    }
    showWhenSent(ref) {
        if (this.client.showWhenSent) return this.client.showWhenSent(ref);
        return this.client.set(ref, { visible: true });
    }
    drop(ref) { this.refs.delete(ref); return this.client.drop(ref); }
    close() { this.listeners.forEach((pair) => this.client.removeListener(pair[0], pair[1])); }
}
function previewConfig(cfg,name,pv){
    const out=Object.assign({},cfg);
    if(pv.tab==='nav'){const p=D.NAV_PARTS.find(v=>v.key===pv.part);out.hudNavigationEnabled=true;out.navDisplayMode='all';if(p)out[p.prefix+'Hidden']=false;}
    else{out[name+pv.part+'Hidden']=false;if(name==='hud'&&pv.part==='Gear')out.hudAlertHidden=false;}
    return out;
}
function sampleNavigation(){
    const lane=(d,hl)=>({directions:[d],other:[],highlighted:hl,blocked:false});
    return {visible:true,maneuverVisible:true,reason:'layout_preview',kind:'intersection',maneuver:'RIGHT',distanceText:'300 m',description:tr('Navigation preview'),provider:'PREVIEW',
        lanes:{visible:true,lanes:[lane('LEFT',false),lane('STRAIGHT_ON',false),lane('STRAIGHT_ON',false),lane('RIGHT',true)]}};
}
class Outputs {
    constructor(client, clusterPainter, hudPainter) {
        this.client = client; this.policy = new Policy(); this.telemetry = new Telemetry(); this.upload = new UploadPacer();
        this.gear = '--'; this.gearMode = null; this.profile = null; this.order = 0;
        this.onBudget = (cap) => this.upload.budget(cap); this.onReady = () => this.upload.reset();
        client.on('budget', this.onBudget); client.on('ready', this.onReady);
        this.cluster = new Controller(new OutputClient(client), clusterPainter, hudPainter, { upload: this.upload, liveLayout: true });
        this.hud = new Controller(new OutputClient(client), clusterPainter, hudPainter, { upload: this.upload, liveLayout: true });
        [this.cluster, this.hud].forEach((out) => { out.policy = this.policy; out.telemetry = this.telemetry; });
    }
    get refused() { return this.cluster.refused || this.hud.refused; }
    set refused(value) { this.cluster.refused = this.hud.refused = value; }
    get transitions() { return this.cluster.transitions.concat(this.hud.transitions).sort((a,b) => a.at-b.at).slice(-24); }
    hide() { this.cluster.hide(); this.hud.hide(); }
    tick(now, raw) {
        const cfg = settings(raw), prefix = cfg.displayMode === 'all' ? 'all' : 'sport';
        if (this.profile !== null && this.profile !== cfg.engineProfile) {
            this.hide(); this.policy.reset(); this.telemetry.clear();
        }
        this.profile = cfg.engineProfile;
        const states = {}, order = this.order++ % 2 ? ['hud','cluster'] : ['cluster','hud'];
        // Settings layout editor: draw the part being moved even when it is hidden, unused
        // in the current drive mode or has no live data (sample guidance / lit alert).
        const preview = D.layoutPreview(cfg);
        order.forEach((name) => {
            const out=this[name],pv=preview&&preview.display===name?preview:null,local=pv?previewConfig(cfg,name,pv):cfg;
            const rpm=pv&&pv.tab!=='nav'?true:rpmOutput(local,name==='hud'?'Hud':'Cluster',this.policy.mode)&&D.faceVisible(local,name);
            const navigation=pv&&pv.tab==='nav'?sampleNavigation():this.navigation;
            const nav=name==='hud'&&(pv&&pv.tab==='nav'||navAllowed(local,this.policy.mode)&&navigation&&navigation.visible);
            const selected=rpm||nav?'redline':'stock';
            out.renderRpm=rpm;out.aux=this.aux||{};
            out.traffic=name==='hud'&&!pv?this.traffic:null;
            out.requiresRpm=!pv&&rpm&&D.faceRpmNeeded(local,name);out.preview=pv;
            out.profile = cfg.engineProfile; out.gear = this.gear; out.gearMode = this.gearMode;
            out.navigation = name === 'hud' && navAllowed(local,this.policy.mode) ? navigation : null;
            // Navigation setting: the cluster gives way to route guidance (Waze over CarPlay / Android Auto, or any).
            const yielded=name==='cluster'&&!pv&&cfg.clusterYieldGuidance!=='off'&&!!this.guidanceYield;
            const blocked=name==='hud' && this.hudBlocked || yielded;
            states[name] = out.tick(now, Object.assign({}, local, { displayMode: pv||local['all'+(name==='hud'?'Hud':'Cluster')+'Output']==='redline'||nav?'all':'sport', displayTarget: name === 'hud' ? 'hud' : 'map', appEnabled: cfg.appEnabled && selected === 'redline' && !blocked }));
            if (selected === 'stock' && cfg.appEnabled) states[name].reason = 'stock';
            else if(yielded && cfg.appEnabled)states[name].reason='cluster_yield';
            else if(blocked && cfg.appEnabled)states[name].reason=this.hudBlockReason || 'hud_safety';
        });
        const active = states.cluster.requested ? states.cluster : states.hud.requested ? states.hud :
            (cfg[prefix+'ClusterOutput'] === 'redline' ? states.cluster : states.hud);
        return Object.assign({}, active, { requested: !!(states.cluster.requested || states.hud.requested), outputs: states, config: cfg });
    }
    close() {
        this.cluster.close(); this.hud.close(); this.policy.reset(); this.client.close();
        this.client.removeListener('budget', this.onBudget); this.client.removeListener('ready', this.onReady);
    }
}
module.exports = { Outputs, previewConfig, sampleNavigation };
