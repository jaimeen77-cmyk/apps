'use strict';
// The 0-100 km/h timer for the 0-100 screen (1.3.105): from the car's speed (the vehicle alerts' own copy, about 10 a
// second) and its longitudinal acceleration (CDS2, in g).
//   ready  standing (under 1 km/h for 0.5 s): the last time stays shown, the clock at 0
//   run    the car moved off: timed from the moment it left 1 km/h (the sample before and after it, interpolated)
//   done   it reached 100 km/h (the crossing interpolated between two samples): the time kept, a new best saved
//   a run that slows down again (10 km/h under its highest) or takes over 30 s is dropped (back to ready on standing)
// The time between samples is carried on with the clock, so it counts up smoothly while running.
const START_KMH = 1, TARGET_KMH = 100, STAND_MS = 500, DROP_KMH = 10, MAX_MS = 30000;
class LaunchTimer {
    constructor(best) { this.best = typeof best === 'number' && best > 0 ? best : null; this.reset(); }
    reset() { this.state = 'ready'; this.start = null; this.time = null; this.peak = 0; this.last = null; this.standSince = null; this.newBest = false; this.result = null; }
    /** One speed sample (km/h, or null) at now (ms). Returns a new best (seconds) when one was just set, else null. */
    sample(now, speed) {
        if (typeof speed !== 'number' || !isFinite(speed)) return null;
        const prev = this.last; this.last = { t: now, v: speed };
        if (speed < START_KMH) { if (this.standSince === null) this.standSince = now; } else this.standSince = null;
        const standing = this.standSince !== null && now - this.standSince >= STAND_MS;
        // standing again: ready for the next run (a finished run's time stays shown; an unfinished one is dropped)
        if (standing) { if (this.state !== 'done' && this.state !== 'ready') this.result = null; this.state = 'ready'; this.start = null; return null; }
        if (this.state === 'ready' && prev && prev.v < START_KMH && speed >= START_KMH) {
            // the moment it left 1 km/h, between the two samples
            const f = (START_KMH - prev.v) / Math.max(1e-6, speed - prev.v); this.start = prev.t + (now - prev.t) * Math.max(0, Math.min(1, f));
            this.state = 'run'; this.peak = speed; this.newBest = false; this.result = null;
        }
        if (this.state !== 'run') return null;
        this.peak = Math.max(this.peak, speed);
        if (speed < this.peak - DROP_KMH || now - this.start > MAX_MS) { this.state = 'dropped'; this.time = null; return null; }
        if (speed >= TARGET_KMH && prev) {
            const f = (TARGET_KMH - prev.v) / Math.max(1e-6, speed - prev.v), at = prev.t + (now - prev.t) * Math.max(0, Math.min(1, f));
            this.result = Math.round((at - this.start) / 10) / 100; this.state = 'done';
            if (this.best === null || this.result < this.best) { this.best = this.result; this.newBest = true; return this.best; }
        }
        return null;
    }
    /** What the screen shows now: {state, time (s, running or kept), best, newBest}. */
    view(now) {
        const time = this.state === 'run' ? Math.max(0, (now - this.start) / 1000) : this.state === 'done' || this.state === 'ready' ? this.result : null;
        return { state: this.state, time, best: this.best, newBest: this.newBest };
    }
}
module.exports = { LaunchTimer, START_KMH, TARGET_KMH };
