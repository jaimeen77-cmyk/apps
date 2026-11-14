'use strict';
const { Policy, settings } = require('./policy');
const gear = require('./gear');
const { Telemetry } = require('./telemetry');
const { UploadPacer } = require('./upload');
const { placement } = require('./layout');
// Only these exact server contracts describe a lost layer or temporary
// resource/attachment failure. Malformed frames, unsupported targets, native
// slot refusals and guard decisions must not become retry loops.
const RETRY_MS = [2000, 5000, 10000];
function transientFailure(op, reason) {
    return ((op === 'frame' || op === 'set') && reason === 'no such layer') ||
        (op === 'layer' && (reason === 'too many layers' || reason === "the service's pixel memory is full")) ||
        (op === 'layer-state' && reason === 'image buffer or quad refused');
}
class Controller {
    constructor(client, painter, hudPainter, options) {
        options = options || {};
        this.client = client; this.painter = painter; this.hudPainter = hudPainter; this.policy = new Policy();
        this.ref = 0; this.previous = null; this.layerState = 'hidden'; this.refused = false;
        this.profile = null; this.layerRate = null;
        this.gear = '--'; this.gearMode = null; this.telemetry = new Telemetry(); this.layerScale = null;
        this.upload = options.upload || new UploadPacer(); this.ownsUpload = !options.upload; this.liveLayout = !!options.liveLayout;
        this.retryAfter = 0; this.recoverySince = null; this.recovering = false;
        this.transitions = []; this.lastReason = null;
        client.on('budget', (cap) => this.upload.budget(cap));
        this.targetName = null; this.targetStates = {}; this.paintKey = null;
        this.renderCache = null;
        this.now = 0; this.failure = null; this.healthySince = null; this.layerReason = '';
        client.on('disconnected', () => { this.hide(); this.targetStates = {}; this.policy.reset(); this.telemetry.clear(); this.gear = '--'; this.gearMode = null; });
        client.on('refused', (op, ref, reason) => {
            // Delayed answers about an already dropped layer (including its
            // drop acknowledgement) cannot disable a newer live layer.
            if (op === 'drop' || (ref && ref !== this.ref)) return;
            this.fail(op, reason);
        });
        client.on('ready', () => { this.hide(); this.targetStates = {}; this.policy.reset(); this.refused = false; this.failure = null; });
        client.on('layer', (ref, state, reason) => {
            if (ref !== this.ref) return;
            this.layerState = state; this.layerReason = reason || '';
            if (state === 'error') this.fail('layer-state', this.layerReason);
            else if (state === 'shown') this.healthySince = this.now;
            else this.healthySince = null;
        });
        client.on('target', (target, state, holder, reason, guideDisabled) => {
            if (target !== 'map' && target !== 'panel' && target !== 'hud') return;
            this.targetStates[target] = { state: state, holder: holder || '', reason: reason || '', guideDisabled: !!guideDisabled };
        });
    }
    hide() {
        if (this.ref) this.client.drop(this.ref);
        this.ref = 0; this.previous = null; this.paintKey = null; this.layerState = 'hidden';
        if (this.ownsUpload) this.upload.reset();
        this.placementKey = null;
        this.targetName = null; this.layerReason = ''; this.healthySince = null;
        this.navContend = false;
        if(this.renderCache)this.renderCache.reset();
        // Target events describe the renderer's global slot, not this ref.
        // Keep the latest ownership through a drop: a new layer need not
        // produce another target event if the native slot has not changed.
    }
    yieldGuidance() {
        // Retain the RPM image while letting the native HUD own the slot.
        // Missing/stale maneuvers clear on the next paced frame; they must
        // never make a fresh RPM image repeatedly drop and re-upload.
        if (this.ref && this.navContend) this.client.set(this.ref, { contend: false });
        this.navContend = false;
    }
    fail(op, reason) {
        const attempts = this.failure ? this.failure.attempts : 0;
        const retryable = transientFailure(op, reason || '');
        this.failure = { op: op || '', reason: reason || '', retryable: retryable,
            attempts: attempts, exhausted: retryable && attempts >= RETRY_MS.length,
            nextAt: retryable && attempts < RETRY_MS.length ? this.now + RETRY_MS[attempts] : null };
        this.hide(); this.refused = true;
    }
    tick(now, config) {
        this.now = now;
        const cfg = settings(config);
        if (this.profile !== null && this.profile !== cfg.engineProfile) {
            this.hide(); this.policy.reset();
            this.telemetry.clear();
        } else if (this.ref && (this.layerRate !== cfg.frameRate || this.targetName !== cfg.displayTarget || (!this.liveLayout && this.layerScale !== cfg.widgetScale))) this.hide();
        this.profile = cfg.engineProfile;
        const targetBefore = this.targetStates[cfg.displayTarget] || {};
        const otherOwns = targetBefore.holder === 'stock' || targetBefore.holder === 'foreign';
        // Rebuild only our failed image, with fresh live data and a bounded
        // backoff. Native acquisition/parking/lock recovery stays native; no
        // periodic layer churn, service restart or guard reset is performed.
        if (this.refused && this.failure && this.failure.retryable && !this.failure.exhausted &&
            now >= this.failure.nextAt && !otherOwns && this.policy.evaluate(now, this.client.ready, cfg,this.requiresRpm).show) {
            this.refused = false; this.failure.attempts++; this.failure.nextAt = null;
        }
        if (this.failure && !this.refused && this.healthySince !== null && now - this.healthySince >= 30000)
            this.failure = null;
        const d = this.policy.evaluate(now, this.client.ready && !this.refused, cfg,this.requiresRpm);
        // Layout preview: show the face without waiting for an engine and light the alert being moved.
        if (this.preview && d.show) {
            if (typeof d.rpm !== 'number') d.rpm = 0;
            if (this.preview.part === 'Alert' || this.preview.display === 'hud' && this.preview.part === 'Gear') d.shift = true;
        }
        if (this.refused && this.failure && d.reason === 'renderer_unavailable') d.reason = this.failure.retryable && !this.failure.exhausted ? 'renderer_recovering' : 'renderer_refused';
        d.recovery = this.failure ? Object.assign({ state: this.refused ? this.failure.retryable && !this.failure.exhausted ? 'waiting' : 'failed' : 'retrying' }, this.failure) : null;
        d.gear = gear.display(this.gear, this.gearMode, 'auto');
        Object.assign(d, this.telemetry.read(d.rpm, now));
        d.targetName = cfg.displayTarget;
        const target = this.targetStates[cfg.displayTarget] || {};
        d.layerReason = this.layerReason;
        d.targetState = target.state || 'idle'; d.targetHolder = target.holder || ''; d.targetReason = target.reason || '';
        d.guidanceRequested = cfg.displayTarget === 'map'; d.guidanceDisabled = !!target.guideDisabled;
        const panel = cfg.displayTarget === 'panel', hud = cfg.displayTarget === 'hud';
        const painter = hud ? this.hudPainter : this.painter;
        d.navigation = hud ? this.navigation : null;
        d.renderRpm=this.renderRpm!==false;d.aux=this.aux||{};
        d.rendering=this.renderCache?this.renderCache.stats():null;
        const targetWidth = panel ? 1920 : hud ? 800 : 1088, targetHeight = panel ? 720 : 480;
        const geometry = cfg.displayTarget + ':' + targetWidth + 'x' + targetHeight;
        if (d.show && (!painter || cfg.displayTarget === 'unknown' || String(this.client.targets || '').split(',').indexOf(geometry) < 0)) {
            d.show = false; d.reason = 'target_unavailable';
        }
        if (!d.show) {
            if (this.ref && ['rpm_unknown', 'mode_unknown', 'rpm_invalid'].indexOf(d.reason) >= 0) { this.recovering = true; this.retryAfter = now + 2000; }
            this.recoverySince = null;
            if (['disabled', 'not_sport', 'engine_stopped', 'hybrid_engine_stopped'].indexOf(d.reason) >= 0) this.recovering = false;
        } else if (this.recovering) {
            if (this.recoverySince === null) this.recoverySince = now;
            if (now < this.retryAfter || now - this.recoverySince < 1000) { d.show = false; d.reason = 'recovering'; }
            else this.recovering = false;
        }
        if (this.lastReason !== d.reason) {
            this.transitions.push({ at: now, reason: d.reason, target: d.targetState });
            this.transitions = this.transitions.slice(-12); this.lastReason = d.reason;
        }
        if (!d.show) { this.hide(); return Object.assign(d, { requested: false, layerState: this.layerState }); }
        const rect = painter.fullTarget ? {x:0,y:0,w:targetWidth,h:targetHeight} : placement(cfg, cfg.displayTarget, painter);
        const placementKey = [rect.x, rect.y, rect.w, rect.h].join('|');
        const navContend = hud && cfg.hudNavigationEnabled && !!(d.navigation && d.navigation.visible);
        if (hud && !navContend) this.yieldGuidance();
        d.placement = rect;
        d.flash = d.shift && Math.floor(now / 250) % 2 === 0;
        if (this.ref && this.placementKey !== placementKey) {
            if (this.liveLayout) this.client.set(this.ref, { x: rect.x, y: rect.y, w: rect.w, h: rect.h });
            else this.hide();
        }
        this.placementKey = placementKey;
        if (!this.ref) {
            // Preserve alpha inside the image too; shrink its footprint so the
            // frame/text do not extend into the factory dials as 0.5.0 did.
            this.ref = this.client.image({ target: cfg.displayTarget, klass: panel ? 'overlay' : 'content', z: 100,
                x: rect.x, y: rect.y, w: rect.w, h: rect.h, iw: painter.W, ih: painter.H, sampling: 'bilinear',
                // An exclusive image keeps its last complete frame if a write
                // fails; a nonexclusive image is hidden during the rewrite.
                // Alpha remains transparent over factory gauges. Other lower
                // custom layers in this compositor target are suspended.
                // Map requests stock-map takeover. HUD yields to stock content,
                // including guidance newly parked behind us. Stock unmapping is a
                // separate renderer policy (HUD defaults to disabled); this
                // app never changes it. Panel and HUD share a native scene ID,
                // so only the selected target has a layer here.
                // Follow the same guide hold as MapFeed on map only. The
                // renderer limits this to its supported maneuver-panel slots,
                // releases it with the map, and retains its guard/allowlist.
                // HUD contention is enabled after the composed pixels below.
                // Missing data yields the slot without destroying the RPM
                // image; native popup yielding and takeover limits still apply.
                visible: false, prewarm: false, exclusive: !hud, contend: !panel && !hud, guide_hold: !panel && !hud, fps: d.config.frameRate });
            if (!this.ref) { this.fail('layer', 'client did not create a layer'); d.show = false; d.reason = 'renderer_refused'; return d; }
            this.layerState = 'waiting';
            this.layerRate = d.config.frameRate;
            this.layerScale = cfg.widgetScale;
            this.targetName = cfg.displayTarget;
        }
        // Do not repaint a whole canvas 60 times/s when no source value changed.
        // Keep freshness/mode checks above this cache so stale signals still hide.
        const paintKey = painter.key ? painter.key(d) : [d.rpm,d.shift,d.flash,d.gear,d.torqueNm,d.powerPS,d.torquePeak,d.powerPeak,JSON.stringify([cfg,d.renderRpm,d.aux,hud?d.navigation:null])].join('|');
        if (this.previous && this.paintKey === paintKey && (!navContend || this.navContend)) return Object.assign(d, { requested: true, layerState: this.layerState });
        if (this.previous && this.client.canPaint && !this.client.canPaint(this.ref)) return Object.assign(d, { requested: true, layerState: this.layerState });
        if (this.previous && !this.upload.ready(now)) return Object.assign(d, { requested: true, layerState: this.layerState });
        if (!this.previous && !this.ownsUpload && !this.upload.ready(now)) return Object.assign(d, { requested: true, layerState: this.layerState });
        if(painter.createCache){if(!this.renderCache)this.renderCache=painter.createCache();Object.defineProperty(d,'renderCache',{value:this.renderCache,enumerable:false});}
        const canvas = painter.draw(d), source=canvas.d;
        const pixels=ArrayBuffer.isView(source)?Buffer.from(source.buffer,source.byteOffset,source.byteLength):Buffer.from(source);
        if (!this.previous) {
            this.upload.allow(pixels.length, now, true);
            if (!this.ownsUpload) this.upload.waitUntil = now + Math.max(250, Math.ceil(pixels.length / this.upload.rate * 1000));
            this.client.pixels(this.ref, null, pixels);
            // The production client waits if pixels are still queued behind
            // socket backpressure. Simple synchronous test/legacy clients can
            // keep the original frame -> visible calls.
            if (typeof this.client.showWhenSent === 'function') this.client.showWhenSent(this.ref);
            else this.client.set(this.ref, { visible: true });
        } else {
            const delta = painter.difference(this.previous, pixels);
            if (delta.rects.length && !this.upload.allow(delta.pixels.length, now, false)) return Object.assign(d, { requested: true, layerState: this.layerState });
            if (delta.rects.length) this.client.pixels(this.ref, delta.rects, delta.pixels);
        }
        // Retained canvases are mutable. Keep one stable sent-frame snapshot,
        // reusing its allocation instead of producing a full-frame GC stream.
        if(!this.previous||this.previous.length!==pixels.length)this.previous=Buffer.alloc(pixels.length);
        pixels.copy(this.previous);
        d.rendering=this.renderCache?this.renderCache.stats():null;
        this.paintKey = paintKey;
        if (navContend && !this.navContend) {
            if (typeof this.client.contendWhenSent === 'function') this.client.contendWhenSent(this.ref);
            else this.client.set(this.ref, { contend: true });
            this.navContend = true;
        }
        return Object.assign(d, { requested: true, layerState: this.layerState });
    }
    close() { this.hide(); this.policy.reset(); this.client.close(); }
}
module.exports = { Controller };
