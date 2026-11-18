'use strict';
// Position / size previews draw parts with no live data on the HUD and cluster. They are honoured only while
// the settings screen is really on screen: its frame loop (main.js) calls touch() a few times a second and stops
// when the screen is left by any route (Back, Home, another app, a tab button), so the preview ends within
// STALE_MS even when no "screen hidden" event arrives. Before the first touch() (no settings screen in this
// process, tests) the layoutPreview setting alone decides, as before.
const STALE_MS = 2500;
let seen = null;
function touch(now) { seen = typeof now === 'number' ? now : Date.now(); }
function fresh(now) { const t = typeof now === 'number' ? now : Date.now(); return seen === null || (t >= seen - 1000 && t - seen <= STALE_MS); }
function reset() { seen = null; }
module.exports = { touch, fresh, reset, STALE_MS };
