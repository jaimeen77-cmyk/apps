'use strict';
// The car ahead pulling away (1.3.87): we stand (under 1 km/h for 2 s) with a car ahead within 15 m, then it moves
// off (3 m further than its nearest while we stood, for half a second) or, having been within 10 m, is lost for
// half a second, and we still stand: an alert for 3 s, once a stop. Not in P. Moving off (over 5 km/h) starts again.
// (1.3.95, from the user's drive: none in 26 minutes before) quicker: 1 s standing, a car within 20 m, 1.5 m further for
// 0.3 s (or lost from within 12 m); a speed that stops coming while we stand (the car sends none at rest) is still a stand
// (1.3.101) how soon (the setting, 앞차 간격 → 출발 알림): faster 1 m for 0.2 s, quick 1.5 m for 0.3 s (the 1.3.95 values,
// the default), relaxed 3 m for 0.5 s (as before 1.3.95); off: none. Standing, the gap the camera measures moves 0.15 m at most
// (the user's clips, 2026-11-27), so 1 m is well clear of it.
const STAND_KMH = 1, STAND_MS = 1000, NEAR_M = 20, LOST_NEAR_M = 12, AWAY_M = 1.5, HOLD_MS = 300, SHOW_MS = 3000, GONE_KMH = 5;
const LEVELS = { faster: { away: 1.0, hold: 200 }, quick: { away: AWAY_M, hold: HOLD_MS }, relaxed: { away: 3.0, hold: 500 } };
class LeadDeparture {
    constructor() { this.reset(); this.fired = 0; }
    reset() { this.standSince = null; this.nearest = null; this.armed = false; this.awaySince = null; this.done = false; this.showUntil = 0; }
    /** One frame: now (ms), our speed (km/h or null), gear ('P', 'D', ...), the gap (m) to the car ahead or null, how soon
     *  ('off' | 'faster' | 'quick' | 'relaxed', default quick); true while it shows. */
    tick(now, speed, gear, gap, level) {
        if (level === 'off') { if (this.armed || now < this.showUntil) this.reset(); return false; }
        const lv = LEVELS[level] || LEVELS.quick;
        if (typeof speed !== 'number') { if (this.lastSpeed !== null && this.lastSpeed !== undefined && this.lastSpeed < STAND_KMH) speed = 0; else { this.standSince = null; this.armed = false; return now < this.showUntil; } }
        else this.lastSpeed = speed;
        if (speed > GONE_KMH) { const show = now < this.showUntil; this.reset(); if (show) this.showUntil = now; return false; }
        if (speed >= STAND_KMH) { this.standSince = null; this.awaySince = null; return now < this.showUntil; }
        if (this.standSince === null) this.standSince = now;
        if (/^P/.test(String(gear || ''))) { this.armed = false; this.nearest = null; return false; }
        const standing = now - this.standSince >= STAND_MS;
        // its nearest only once we have stood 2 s (a car moving off as we stop is not waited on)
        if (standing && typeof gap === 'number' && gap <= NEAR_M) { this.nearest = this.nearest === null ? gap : Math.min(this.nearest, gap); this.armed = true; }
        if (this.armed && !this.done) {
            const away = typeof gap === 'number' ? gap >= this.nearest + lv.away : this.nearest !== null && this.nearest <= LOST_NEAR_M;
            if (away) { if (this.awaySince === null) this.awaySince = now; if (now - this.awaySince >= lv.hold) { this.done = true; this.showUntil = now + SHOW_MS; this.fired++; } }
            else this.awaySince = null;
        }
        return now < this.showUntil;
    }
    status(now) { return { armed: this.armed, standing: this.standSince !== null && now - this.standSince >= STAND_MS, nearest: this.nearest, showing: now < this.showUntil, fired: this.fired }; }
}
module.exports = { LeadDeparture, NEAR_M, AWAY_M, SHOW_MS, LEVELS };
