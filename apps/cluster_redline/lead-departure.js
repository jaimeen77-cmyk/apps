'use strict';
// The car ahead pulling away (1.3.87): we stand (under 1 km/h for 2 s) with a car ahead within 15 m, then it moves
// off (3 m further than its nearest while we stood, for half a second) or, having been within 10 m, is lost for
// half a second, and we still stand: an alert for 3 s, once a stop. Not in P. Moving off (over 5 km/h) starts again.
const STAND_KMH = 1, STAND_MS = 2000, NEAR_M = 15, LOST_NEAR_M = 10, AWAY_M = 3, HOLD_MS = 500, SHOW_MS = 3000, GONE_KMH = 5;
class LeadDeparture {
    constructor() { this.reset(); this.fired = 0; }
    reset() { this.standSince = null; this.nearest = null; this.armed = false; this.awaySince = null; this.done = false; this.showUntil = 0; }
    /** One frame: now (ms), our speed (km/h or null), gear ('P', 'D', ...), the gap (m) to the car ahead or null; true while it shows. */
    tick(now, speed, gear, gap) {
        if (typeof speed !== 'number') { this.standSince = null; this.armed = false; return now < this.showUntil; }
        if (speed > GONE_KMH) { const show = now < this.showUntil; this.reset(); if (show) this.showUntil = now; return false; }
        if (speed >= STAND_KMH) { this.standSince = null; this.awaySince = null; return now < this.showUntil; }
        if (this.standSince === null) this.standSince = now;
        if (/^P/.test(String(gear || ''))) { this.armed = false; this.nearest = null; return false; }
        const standing = now - this.standSince >= STAND_MS;
        // its nearest only once we have stood 2 s (a car moving off as we stop is not waited on)
        if (standing && typeof gap === 'number' && gap <= NEAR_M) { this.nearest = this.nearest === null ? gap : Math.min(this.nearest, gap); this.armed = true; }
        if (this.armed && !this.done) {
            const away = typeof gap === 'number' ? gap >= this.nearest + AWAY_M : this.nearest !== null && this.nearest <= LOST_NEAR_M;
            if (away) { if (this.awaySince === null) this.awaySince = now; if (now - this.awaySince >= HOLD_MS) { this.done = true; this.showUntil = now + SHOW_MS; this.fired++; } }
            else this.awaySince = null;
        }
        return now < this.showUntil;
    }
    status(now) { return { armed: this.armed, standing: this.standSince !== null && now - this.standSince >= STAND_MS, nearest: this.nearest, showing: now < this.showUntil, fired: this.fired }; }
}
module.exports = { LeadDeparture, NEAR_M, AWAY_M, SHOW_MS };
