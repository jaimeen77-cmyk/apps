'use strict';
// jaimeen77-cmyk/apps: GIF Home's Animation screen (ANIM, app.json "gpu": true). The GIF across the screen
// at its own speed through the GPU renderer (mgu-renderd), with Previous / Next and the animation settings
// (the playback options of the phone page) in a sheet the kit draws over the page.

const SECONDS = [0, 5, 10, 15, 30];
// The part of the 1600 x 520 page the kit's full-screen GPU layout shows between its header and its
// slim button bar (kit/runtime/display.js FULL.src); the software path shows the whole page, below the tabs GIF
// Home draws itself (look.js HEAD).
const FULL_AREA = { x: 12, y: 38, w: 1576, h: 482 }, TABS_H = 80;

function area(place, width, height) {
    return place && place.full ? FULL_AREA : { x: 0, y: TABS_H, w: width, h: height - TABS_H };
}

/** GIFs played before the current one, for Previous (newest last). */
class History {
    constructor(max) { this.max = max || 30; this.ids = []; }
    /** The player moved on from `id` (not by going back). */
    left(id) {
        if (!id) return;
        if (this.ids[this.ids.length - 1] === id) return;
        this.ids.push(id);
        if (this.ids.length > this.max) this.ids.shift();
    }
    /** The newest earlier GIF that `ok(id)` accepts (taken off the list), or null. */
    back(current, ok) {
        while (this.ids.length) {
            const id = this.ids.pop();
            if (id !== current && ok(id)) return id;
        }
        return null;
    }
}

/**
 * A settings-like object for kit/sheet.js listSheet: the playback options (mode, single GIF, group, interval,
 * pause) live in the library and change through apply(); the Animation screen's fit and speed are app settings.
 *   o.state()     -> library.state          o.apply(action) -> library change, as the phone page sends it
 *   o.files()     -> [{ id, name }]         o.modes, o.modeNames: library MODES and their labels
 *   o.settings    the app's Settings        o.spec: app.json (fit / speed options)
 */
function playbackSettings(o) {
    const own = (key) => (o.spec.settings || []).find((s) => s.key === key);
    const seconds = () => {
        const now = o.state().playback.seconds;
        const list = SECONDS.indexOf(now) >= 0 || !Number.isInteger(now) ? SECONDS : SECONDS.concat([now]);
        return list.map((v) => [v, v ? v + ' seconds' : 'One full GIF pass']);
    };
    const schema = [
        { key: 'mode', label: 'Mode', type: 'choice', get options() { return o.modes.map((m, i) => [m, o.modeNames[i]]); } },
        { key: 'single', label: 'Single GIF', type: 'choice', get options() { return o.files().map((f) => [f.id, f.name]); } },
        { key: 'group', label: 'Group', type: 'choice',
            get options() { return [[null, 'None']].concat(o.state().groups.map((g) => [g.id, g.name])); } },
        { key: 'seconds', label: 'Switch after', type: 'choice', get options() { return seconds(); } },
        { key: 'paused', label: 'Pause animation', type: 'bool' },
        // the Animation screen's own speed (the widget has its own)
        { key: 'animSpeed', label: own('animSpeed').label, type: 'choice', options: own('animSpeed').options, app: true },
    ];
    const find = (key) => schema.find((s) => s.key === key);
    const api = {
        schema,
        get(key) {
            const s = find(key);
            if (s && s.app) return o.settings.get(key);
            const v = o.state().playback[key];
            return key === 'group' ? v || null : v;
        },
        set(key, value) {
            const s = find(key);
            if (!s) return;
            if (s.app) { o.settings.set(key, value); return; }
            const change = { type: 'playback' };
            change[key] = key === 'paused' ? !!value : value;
            o.apply(change);
        },
        display(key) {
            const s = find(key), v = api.get(key);
            if (s.type === 'bool') return v ? 'On' : 'Off';
            const hit = (s.options || []).find((x) => x[0] === v);
            return hit ? hit[1] : '';
        },
        cycle(key) {
            const s = find(key);
            if (s.type === 'bool') return api.set(key, !api.get(key));
            const list = s.options || [];
            if (!list.length) return;
            const i = list.findIndex((x) => x[0] === api.get(key));
            api.set(key, list[(i + 1) % list.length][0]);
        },
    };
    return api;
}

const SPEEDS = { slow: 0.5, normal: 1, fast: 1.5, double: 2 };
/** The frame of `gif` shown `ms` into its loop (GIF frame delays). */
function frameAt(gif, ms) {
    if (!gif || !gif.frames.length || !(gif.duration > 0)) return 0;
    let t = Math.max(0, ms) % gif.duration;
    for (let i = 0; i < gif.frames.length; i++) {
        if (t < gif.frames[i].delay) return i;
        t -= gif.frames[i].delay;
    }
    return 0;
}

module.exports = { area, FULL_AREA, SECONDS, SPEEDS, History, playbackSettings, frameAt };
