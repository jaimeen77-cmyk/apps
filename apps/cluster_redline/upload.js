'use strict';
// Bound this app's pixel traffic below the compositor's shared link budget.
// Only the latest state is rendered when credit returns; never queue old frames.
const HOLD_MS = 1000;
class UploadPacer {
    constructor() { this.rate = 1024 * 1024; this.reset(); }
    reset() { this.credit = this.rate / 8; this.at = null; this.waitUntil = 0; this.sent = 0; this.skipped = 0; this.hold = null; this.next = null; }
    budget(kb) { if (typeof kb === 'number' && isFinite(kb) && kb > 0) this.rate = Math.min(1024 * 1024, kb * 1024 * 0.3); }
    ready(now) { return now >= this.waitUntil; }
    // who: the output asking (the cluster's and the HUD's share one allowance). An output refused for want of
    // credit keeps what builds up for itself (hold) for up to HOLD_MS: before 1.3.60 the HUD's small changes,
    // twenty a second with an animation, spent the credit as fast as it came, and the cluster's bigger ones never
    // went (the cluster's Animation picture stood still while the HUD's moved).
    allow(bytes, now, first, who) {
        const capacity = Math.max(this.rate / 4, bytes, this.hold ? this.hold.bytes : 0);
        if (this.at !== null) this.credit = Math.min(capacity, this.credit + Math.max(0, now - this.at) * this.rate / 1000);
        this.at = now;
        if (first) { this.credit = 0; this.waitUntil = now + 250; this.sent += bytes; if (this.hold && this.hold.who === who) this.hold = null; return true; }
        const hold = this.hold && now - this.hold.at <= HOLD_MS ? this.hold : (this.hold = null);
        // another output is waiting: only what is left over its need may be spent; this one waits next (turns)
        if (hold && who !== undefined && hold.who !== who && this.credit - bytes < hold.bytes) { this.next = { who, bytes }; this.skipped++; return false; }
        if (bytes > this.credit) {
            if (!hold || hold.who === who) this.hold = { who, bytes, at: hold && hold.who === who ? hold.at : now };
            else this.next = { who, bytes };
            this.waitUntil = now + Math.ceil((bytes - this.credit) / this.rate * 1000);
            this.skipped++; return false;
        }
        // sent: the output that waited behind it holds next, so the two take turns when both want more than there is
        if (hold && hold.who === who) { const n = this.next; this.next = null; this.hold = n && n.who !== who ? { who: n.who, bytes: n.bytes, at: now } : null; }
        this.credit -= bytes; this.waitUntil = now; this.sent += bytes; return true;
    }
}
module.exports = { UploadPacer, HOLD_MS };
