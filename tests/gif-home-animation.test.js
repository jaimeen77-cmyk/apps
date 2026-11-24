'use strict';
// GIF Home's Animation screen helpers (apps/gif_home/animation.js): Previous history, the settings sheet's
// adapter over the shared playback options, and where the GIF goes on the page.
const assert = require('assert');
const { area, FULL_AREA, History, playbackSettings } = require('../apps/gif_home/animation');
const { MODES } = require('../apps/gif_home/library');
const spec = require('../apps/gif_home/app.json');

// area: the full-screen GPU layout shows FULL_AREA of the page (its header holds the tabs); the software path all below its tabs
assert.deepStrictEqual(area({ full: true }, 1600, 520), FULL_AREA);
assert.deepStrictEqual(area({ full: false }, 1600, 520), { x: 0, y: 80, w: 1600, h: 440 }, 'below the tabs');
assert.deepStrictEqual(area(undefined, 1600, 520), { x: 0, y: 80, w: 1600, h: 440 });

// History: newest first, skips the current GIF and what is no longer eligible, bounded
const h = new History(3);
['a', 'b', 'b', 'c', 'd'].forEach((id) => h.left(id));
assert.deepStrictEqual(h.ids, ['b', 'c', 'd'], 'repeats collapse, oldest dropped');
assert.strictEqual(h.back('d', () => true), 'c', 'the current GIF is skipped');
assert.strictEqual(h.back('x', (id) => id !== 'b'), null, 'ineligible GIFs are skipped');
h.left(null);
assert.deepStrictEqual(h.ids, []);

// playbackSettings: library playback through apply(), fit / speed through the app settings
const state = { playback: { mode: 'single', single: 'demo', group: null, seconds: 7, paused: false, selected: [] },
    groups: [{ id: 'g1', name: 'Drive', ids: [] }] };
const applied = [];
const appSettings = { v: { fit: 'contain', speed: 'normal' }, get(k) { return this.v[k]; }, set(k, v) { this.v[k] = v; } };
const s = playbackSettings({
    state: () => state, apply: (a) => { applied.push(a); Object.keys(a).forEach((k) => { if (k !== 'type') state.playback[k] = a[k]; }); },
    files: () => [{ id: 'demo', name: 'Animated BMW logo' }, { id: 'u1', name: 'mine.gif' }],
    modes: MODES, modeNames: MODES.map((m) => 'name ' + m), settings: appSettings, spec,
});
assert.deepStrictEqual(s.schema.map((x) => x.key), ['mode', 'single', 'group', 'seconds', 'paused', 'fit', 'speed']);
assert.strictEqual(s.get('group'), null);
assert.strictEqual(s.display('single'), 'Animated BMW logo');
assert.deepStrictEqual(s.schema.find((x) => x.key === 'group').options, [[null, 'None'], ['g1', 'Drive']]);
// a custom interval stays listed
assert.deepStrictEqual(s.schema.find((x) => x.key === 'seconds').options.map((o) => o[0]), [0, 5, 10, 15, 30, 7]);
s.set('mode', 'group');
s.set('group', 'g1');
s.cycle('paused');
assert.deepStrictEqual(applied, [{ type: 'playback', mode: 'group' }, { type: 'playback', group: 'g1' }, { type: 'playback', paused: true }]);
s.cycle('fit');
assert.strictEqual(appSettings.v.fit, 'cover', 'fit is the app setting, not the library');
assert.strictEqual(applied.length, 3);
s.set('speed', 'fast');
assert.strictEqual(appSettings.v.speed, 'fast');
assert.strictEqual(s.display('paused'), 'On');

// app.json: the Animation screen is the GPU screen, its buttons are not names the kit's bar hides (BTN_PAGE / BTN_PREV)
const anim = spec.screens.find((x) => x.name === 'ANIM');
assert.strictEqual(anim.gpu, true);
assert.ok(anim.buttons.every((b) => ['BTN_PAGE', 'BTN_PREV', 'BTN_SETTINGS'].indexOf(b[0]) < 0));
assert.strictEqual(spec.settings.find((x) => x.key === 'renderer').default, 'auto');
console.log('GIF Home animation screen: area, previous history, settings sheet adapter, GPU screen manifest');
