'use strict';
// This module never talks to the vehicle or renderer; its inputs must be live.
const displayConfig=require('./display-config');
const {shiftSpec}=require('./shift-alert');
const PROFILES = {
    petrol: { label: 'Petrol', shiftRpm: 5500, redlineRpm: 6000, maxRpm: 7000,
        torqueScale: 500, powerScale: 300,
        ranges: { shiftRpm: [2000, 7500], redlineRpm: [3000, 8500], maxRpm: [4000, 10000] } },
    diesel: { label: 'Diesel', shiftRpm: 4200, redlineRpm: 5000, maxRpm: 6000,
        torqueScale: 700, powerScale: 300,
        ranges: { shiftRpm: [2000, 5000], redlineRpm: [3000, 5500], maxRpm: [4000, 7000] } },
    hybrid: { label: 'eDrive (PHEV)', shiftRpm: 5500, redlineRpm: 7000, maxRpm: 8000,
        torqueScale: 600, powerScale: 400,
        ranges: { shiftRpm: [2000, 7500], redlineRpm: [3000, 8500], maxRpm: [4000, 10000] } },
    m: { label: 'M', shiftRpm: 5500, redlineRpm: 7000, maxRpm: 9000,
        torqueScale: 800, powerScale: 600,
        ranges: { shiftRpm: [2000, 7500], redlineRpm: [3000, 8500], maxRpm: [4000, 10000] } },
};
// Zero RPM settings mean the selected profile's defaults, rather than engine-off.
const FRAME_RATE = 20;
const DEFAULTS = { appEnabled: true, autoStart: true, engineProfile: 'petrol', displayMode: 'sport', powerUnit: 'PS', torqueUnit: 'Nm', shiftRpm: 0, comfortShiftRpm: 0, clusterYieldGuidance: 'off', frameRate: FRAME_RATE, displayTarget: 'map', widgetScale: 80 };
Object.assign(DEFAULTS,{hudTrafficMode:'off'});
Object.assign(DEFAULTS, { sportClusterOutput: 'redline', sportHudOutput: 'stock', allClusterOutput: 'stock', allHudOutput: 'stock',
    clusterOffsetX: 0, clusterOffsetY: 0, clusterWidthScale: 80, clusterHeightScale: 80,
    hudOffsetX: 0, hudOffsetY: -100, hudWidthScale: 75, hudHeightScale: 75,
    hudNavigationEnabled: true, hudNavOffsetX: 210, hudNavOffsetY: 30, hudNavWidthScale: 70, hudNavHeightScale: 70,
    hudAlertStyle: 'circle', hudAuxDisplay: 'gauges' });
const MODES = { 1: 'SPORT', 2: 'SPORT_PLUS', 3: 'SPORT_INDIVIDUAL', 4: 'COMFORT', 5: 'COMFORT_PLUS',
    6: 'COMFORT_INDIVIDUAL', 7: 'ECO_PRO', 8: 'ECO_PRO_PLUS', 9: 'ECO_PRO_INDIVIDUAL', 10: 'ADAPTIVE',
    SPORT_DYNAMIC: 'SPORT', SPORT_EXPERT: 'SPORT_PLUS', SPORT_INDIVIDUAL: 'SPORT_INDIVIDUAL',
    COMFORT: 'COMFORT', COMFORT_PLUS: 'COMFORT_PLUS', ECO_PRO_EFFICIENT: 'ECO_PRO' };
Object.assign(MODES, {"28": "BOOST", "24": "EASE_MODUS", "13": "OFFROAD_GRIP", "11": "OFFROAD_ICE", "14": "OFFROAD_ROUGH", "12": "OFFROAD_SMOOTH", "22": "PHEV_BATTERYCONTROL", "21": "PHEV_ELECTRIC_INDIVIDUAL", "20": "PHEV_ELECTRIC_STANDARD", "19": "PHEV_HYBRID_COMFORT", "18": "PHEV_HYBRID_ECO", "17": "PHEV_HYBRID_STANDARD", "16": "PHEV_SPORT_INDIVIDUAL", "23": "PHEV_SPORT_PLUS", "15": "PHEV_SPORT_STANDARD", "27": "TRACTION_ASSIST", "ADAPTIVE": "ADAPTIVE", "BOOST": "BOOST", "COMFORT": "COMFORT", "COMFORT_INDIVIDUAL": "COMFORT_INDIVIDUAL", "COMFORT_PLUS": "COMFORT_PLUS", "EASE_MODUS": "EASE_MODUS", "ECO_PRO_EFFICIENT": "ECO_PRO_EFFICIENT", "ECO_PRO_INDIVIDUAL": "ECO_PRO_INDIVIDUAL", "ECO_PRO_PLUS": "ECO_PRO_PLUS", "OFFROAD_GRIP": "OFFROAD_GRIP", "OFFROAD_ICE": "OFFROAD_ICE", "OFFROAD_ROUGH": "OFFROAD_ROUGH", "OFFROAD_SMOOTH": "OFFROAD_SMOOTH", "PHEV_BATTERYCONTROL": "PHEV_BATTERYCONTROL", "PHEV_ELECTRIC_INDIVIDUAL": "PHEV_ELECTRIC_INDIVIDUAL", "PHEV_ELECTRIC_STANDARD": "PHEV_ELECTRIC_STANDARD", "PHEV_HYBRID_COMFORT": "PHEV_HYBRID_COMFORT", "PHEV_HYBRID_ECO": "PHEV_HYBRID_ECO", "PHEV_HYBRID_STANDARD": "PHEV_HYBRID_STANDARD", "PHEV_SPORT_INDIVIDUAL": "PHEV_SPORT_INDIVIDUAL", "PHEV_SPORT_PLUS": "PHEV_SPORT_PLUS", "PHEV_SPORT_STANDARD": "PHEV_SPORT_STANDARD", "SPORT_INDIVIDUAL": "SPORT_INDIVIDUAL", "TRACTION_ASSIST": "TRACTION_ASSIST"});
Object.assign(MODES, { SPORT:'SPORT', SPORT_PLUS:'SPORT_PLUS', ECO_PRO:'ECO_PRO' });
const SPORT = ['SPORT', 'SPORT_PLUS', 'SPORT_INDIVIDUAL', 'PHEV_SPORT_STANDARD', 'PHEV_SPORT_PLUS', 'PHEV_SPORT_INDIVIDUAL'];
// Sport selection is restricted to Sport modes; all includes every valid catalog mode.
const AUTOMATIC_MODES = SPORT;
Object.assign(DEFAULTS,displayConfig.defaults);
// Settings already normalised here carry their normalised values under this symbol (enumerable, so
// Object.assign copies it; JSON and Object.keys skip symbols). The worker, the outputs and both controllers each
// used to normalise the same settings every frame. A copy that still matches them, except for the outputs' own
// overrides with valid values, is taken as it is; any other change is normalised in full.
const NORMALISED = Symbol('normalised');
const OVERRIDES = { displayMode: ['sport', 'all'], displayTarget: ['map', 'hud', 'panel'], appEnabled: [true, false] };
function unchanged(raw) {
    const snap = raw[NORMALISED], keys = Object.keys(raw);
    if (!snap || typeof snap !== 'object' || keys.length !== Object.keys(snap).length) return false;
    for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        if (raw[k] === snap[k]) continue;
        if (!OVERRIDES[k] || OVERRIDES[k].indexOf(raw[k]) < 0 || !Object.prototype.hasOwnProperty.call(snap, k)) return false;
    }
    return true;
}
function settings(raw) {
    if (raw && raw[NORMALISED] && unchanged(raw)) return Object.assign({}, raw);
    const out = full(raw);
    out[NORMALISED] = Object.assign({}, out);
    return out;
}
function full(raw) {
    raw = raw || {};
    const out = Object.assign({}, DEFAULTS);
    out.hudTrafficMode='off'; // Removed experiment: ignore saved values and old favorites.
    // Retain an old owner's OFF choice; removed manual scales/prefixes are ignored.
    if (typeof raw.appEnabled === 'boolean') out.appEnabled = raw.appEnabled;
    else if (raw.autoSport === false) out.appEnabled = false;
    if (typeof raw.autoStart === 'boolean') out.autoStart = raw.autoStart;
    if (typeof raw.hudNavigationEnabled === 'boolean') out.hudNavigationEnabled = raw.hudNavigationEnabled;
    if (['bar','circle'].indexOf(raw.hudAlertStyle)>=0) out.hudAlertStyle=raw.hudAlertStyle;
    if (['gauges','values','off'].indexOf(raw.hudAuxDisplay)>=0) out.hudAuxDisplay=raw.hudAuxDisplay;
    if (['sport', 'all'].indexOf(raw.displayMode) >= 0) out.displayMode = raw.displayMode;
    if (['PS', 'kW'].indexOf(raw.powerUnit) >= 0) out.powerUnit = raw.powerUnit;
    if (['Nm', 'kgfm'].indexOf(raw.torqueUnit) >= 0) out.torqueUnit = raw.torqueUnit;
    if (Object.prototype.hasOwnProperty.call(raw, 'engineProfile')) {
        out.engineProfile = typeof raw.engineProfile === 'string' && Object.prototype.hasOwnProperty.call(PROFILES, raw.engineProfile)
            ? raw.engineProfile : 'unknown';
    }
    const profile = PROFILES[out.engineProfile] || PROFILES.petrol;
    ['shiftRpm'].forEach((key) => {
        const value = raw[key], range = profile.ranges[key];
        out[key] = typeof value === 'number' && isFinite(value) && value >= range[0] && value <= range[1] ? value : profile[key];
    });
    // Comfort / Eco shift alert RPM (kept outside app.json): 0 = automatic, 90 % of the shift alert RPM.
    out.comfortShiftRpm = [2000, 2250, 2500, 2750, 3000, 3250, 3500, 4000, 4500, 5000].indexOf(raw.comfortShiftRpm) >= 0 ? raw.comfortShiftRpm : 0;
    // Cluster yields while route guidance (Waze included) shows on the HUD (kept outside app.json): off / on ('phone';
    // the earlier third choice 'any' reads as on).
    out.clusterYieldGuidance = raw.clusterYieldGuidance === 'nosport' ? 'nosport' : raw.clusterYieldGuidance === 'phone' || raw.clusterYieldGuidance === 'any' ? 'phone' : 'off';
    ['redlineRpm', 'maxRpm', 'torqueScale', 'powerScale'].forEach((key) => { out[key] = profile[key]; });
    // Fixed request ceiling. Retired saved 12/30/60 fps choices never override it.
    if (Object.prototype.hasOwnProperty.call(raw, 'displayTarget')) out.displayTarget = ['map', 'panel', 'hud'].indexOf(raw.displayTarget) >= 0 ? raw.displayTarget : 'unknown';
    if ([60, 65, 70, 75, 80, 85, 90, 100].indexOf(raw.widgetScale) >= 0) out.widgetScale = raw.widgetScale;
    const outputKeys = ['sportClusterOutput', 'sportHudOutput', 'allClusterOutput', 'allHudOutput'];
    outputKeys.forEach((key) => { if (raw[key] !== undefined) out[key] = ['redline', 'stock'].indexOf(raw[key]) >= 0 ? raw[key] : 'stock'; });
    // Direct legacy callers retain their selected single output. The entry
    // migrates persisted choices before the worker reads the new schema.
    if (raw.displayTarget && outputKeys.every((key) => raw[key] === undefined)) {
        ['sport', 'all'].forEach((mode) => {
            out[mode + 'ClusterOutput'] = ['map','panel'].indexOf(raw.displayTarget) >= 0 ? 'redline' : 'stock';
            out[mode + 'HudOutput'] = raw.displayTarget === 'hud' ? 'redline' : 'stock';
        });
    }
    ['cluster', 'hud', 'hudNav'].forEach((target) => {
        ['OffsetX', 'OffsetY'].forEach((suffix) => {
            const key = target + suffix, value = raw[key];
            if (typeof value === 'number' && isFinite(value)) out[key] = Math.max(-1000, Math.min(1000, Math.round(value / 10) * 10));
        });
        ['WidthScale', 'HeightScale'].forEach((suffix) => {
            const key = target + suffix, value = raw[key], max = target === 'hudNav' ? 200 : target === 'hud' && suffix === 'HeightScale' ? 150 : 100;
            if (typeof value === 'number' && isFinite(value)) out[key] = Math.max(20, Math.min(max, Math.round(value / 5) * 5));
            else if (target === 'cluster' && typeof raw.widgetScale === 'number') out[key] = out.widgetScale;
        });
    });
    // Red-zone start and shift alert are independent display settings.
    out.maxRpm = Math.max(out.maxRpm, out.redlineRpm);
    return displayConfig.normalize(raw,out);
}
function modeOf(raw) { return (typeof raw === 'number' || typeof raw === 'string') && Object.prototype.hasOwnProperty.call(MODES, raw) ? MODES[raw] : null; }
class Policy {
    constructor() { this.reset(); }
    reset() { this.mode = null; this.rpm = null; this.modeAt = null; this.rpmAt = null; this.activeSince = null; this.runningSeen = false; }
    modeSample(raw, now) {
        const next = modeOf(raw), wasActive = AUTOMATIC_MODES.indexOf(this.mode) >= 0 && this.modeAt !== null && now >= this.modeAt && now - this.modeAt <= 3500;
        const isActive = AUTOMATIC_MODES.indexOf(next) >= 0;
        this.activeSince = isActive ? (wasActive && this.activeSince !== null ? this.activeSince : now) : null;
        this.mode = next; this.modeAt = next ? now : null;
    }
    rpmSample(rpm, now) {
        this.rpm = typeof rpm === 'number' && isFinite(rpm) && rpm >= 0 && rpm <= 10000 ? rpm : null;
        this.rpmAt = this.rpm === null ? null : now;
        if (this.rpm === null) this.runningSeen = false;
        else if (this.rpm >= 100) this.runningSeen = true;
    }
    evaluate(now, ready, config, requireRpm) {
        const cfg = settings(config);
        const fresh = (at, ttl) => at !== null && now >= at && now - at <= ttl;
        let reason = cfg.displayMode === 'all' ? 'all_modes' : 'sport';
        if (!cfg.appEnabled) reason = 'disabled';
        else if (!Object.prototype.hasOwnProperty.call(PROFILES, cfg.engineProfile)) reason = 'profile_unknown';
        else if (!ready) reason = 'renderer_unavailable';
        else if (!fresh(this.modeAt, 3500)) reason = 'mode_unknown';
        else if (cfg.displayMode === 'sport' && AUTOMATIC_MODES.indexOf(this.mode) < 0) reason = 'not_sport';
        else if (requireRpm!==false&&!fresh(this.rpmAt, 1800)) reason = 'rpm_unknown';
        // Fresh zero RPM after a running sample is a live stopped engine, not
        // a reason to release the display at every automatic stop/start.
        // A cold boot still waits for the engine; stale/invalid data and
        // lifecycle/provider loss keep their normal release behavior.
        else if (requireRpm!==false&&this.rpm < 100 && !this.runningSeen) reason = cfg.engineProfile === 'hybrid' ? 'hybrid_engine_stopped' : 'engine_stopped';
        else if (requireRpm!==false&&this.rpm > cfg.maxRpm + 1000) reason = 'rpm_invalid';
        else if (cfg.displayMode === 'sport' && (this.activeSince === null || now - this.activeSince < 1000)) reason = 'stabilizing';
        const show = reason === 'sport' || reason === 'all_modes';
        return { show: show, reason: reason, mode: this.mode, rpm: this.rpm, engineStopped: this.rpm !== null && this.rpm < 100,
            shift: show && this.rpm >= shiftSpec(cfg, this.mode).shift, config: cfg };
    }
}
module.exports = { Policy, DEFAULTS, FRAME_RATE, PROFILES, settings, modeOf, SPORT };
