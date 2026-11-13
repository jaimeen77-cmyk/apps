'use strict';
// What Comfort did, for the line under the page: its own log (journalctl -u iteriodev-comfort) where the app may
// read it, else the changes the app sees in Comfort's status (the car on / off, standing, a seat move starting
// and ending, the way back after easy exit waiting or done). Read only: nothing here sends Comfort a command.
const { execFile } = require('child_process');

const SEATS = ['driver', 'passenger'];
const JOBS = { exit: '하차 위치로 이동 시작', back: '운전 위치로 복귀 시작', memory: '메모리 위치로 이동 시작',
    gentleman: '공간 확보 이동 시작' };
const ENV = { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', LANG: 'C', LC_ALL: 'C' };

function clock(t) {
    const d = new Date(t), p = (n) => String(n).padStart(2, '0');
    return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
}

/** journalctl's short output: "Nov 13 23:01:02 host node[123]: car on (..)" -> "23:01:02 car on (..)" */
function journalLines(out) {
    return String(out || '').split('\n').map((l) => {
        const m = l.match(/^\S+\s+\d+\s+(\d\d:\d\d:\d\d)\s+\S+\s+[^:]+:\s?(.*)$/);
        return m ? m[1] + ' ' + m[2].trim() : null;
    }).filter(Boolean);
}

class ComfortLog {
    /** client: emits 'state' / 'lost'; options: { journal: false (demo), exec, now, size } */
    constructor(client, options) {
        const o = options || {};
        this.now = o.now || Date.now;
        this.exec = o.exec || execFile;
        this.size = o.size || 6;
        this.journal = o.journal !== false;   // null once journalctl gave nothing usable: the status changes then
        this.fromJournal = [];
        this.events = [];
        this.prev = null;
        this.reading = false; this.readAt = 0; this.failures = 0;
        client.on('state', (s) => this.observe(s));
        client.on('lost', () => { if (this.prev) this.add(['Comfort 연결 끊김']); this.prev = null; });
    }
    add(parts) { this.events.push({ at: this.now(), parts }); if (this.events.length > this.size) this.events.shift(); }
    observe(s) {
        const p = this.prev;
        if (!p) this.add(['Comfort 연결됨', s.carOn ? '차량 켜짐' : '차량 꺼짐', s.parked ? '정차' : '주행 중']);
        else {
            if (s.carOn !== p.carOn) this.add([s.carOn ? '차량 켜짐' : '차량 꺼짐']);
            if (s.parked !== p.parked) this.add([s.parked ? '정차' : '주행 중']);
            if (s.seats.job !== p.job || s.seats.jobSeat !== p.jobSeat) {
                if (s.seats.job) this.add([s.seats.jobSeat || '', JOBS[s.seats.job] || s.seats.job]);
                else if (p.job) this.add([p.jobSeat || '', '시트 이동 끝']);
            }
            SEATS.forEach((who) => {
                if (s.seats.pre[who] && !p.pre[who]) this.add([who, '복귀 대기 (하차 전 위치 기억)']);
                if (!s.seats.pre[who] && p.pre[who]) this.add([who, '복귀 완료']);
            });
            if (s.settings.easyExit !== p.easyExit) this.add([s.settings.easyExit ? '자동 Easy Access 켜짐' : '자동 Easy Access 꺼짐']);
        }
        this.prev = { carOn: s.carOn, parked: s.parked, job: s.seats.job, jobSeat: s.seats.jobSeat,
            pre: Object.assign({}, s.seats.pre), easyExit: s.settings.easyExit };
    }
    /** Read Comfort's journal again (at most every 3 s, one read at a time). Resolves true when it changed. */
    poll() {
        if (!this.journal || this.reading || this.now() - this.readAt < 3000) return Promise.resolve(false);
        this.reading = true; this.readAt = this.now();
        return new Promise((resolve) => {
            const done = (lines) => {
                this.reading = false;
                if (!lines) {
                    if (++this.failures >= 2) this.journal = null;   // no access to the journal: the status changes
                    return resolve(false);
                }
                this.failures = 0;
                const changed = lines.join('\n') !== this.fromJournal.join('\n');
                this.fromJournal = lines;
                resolve(changed);
            };
            try {
                this.exec('journalctl', ['-u', 'iteriodev-comfort', '-n', String(this.size), '-o', 'short', '--no-pager', '-q'],
                    { timeout: 2000, env: ENV, maxBuffer: 1 << 16 }, (err, out) => {
                        const lines = err ? null : journalLines(out);
                        done(lines && lines.length ? lines : null);
                    });
            } catch (e) { done(null); }
        });
    }
    source() { return this.journal && this.fromJournal.length ? 'journal' : 'status'; }
    /** The newest n lines, oldest first; tr translates the app's own words (the journal's are Comfort's). */
    lines(n, tr) {
        if (this.source() === 'journal') return this.fromJournal.slice(-n);
        const t = tr || ((v) => v);
        return this.events.slice(-n).map((e) => clock(e.at) + ' ' + e.parts.filter(Boolean)
            .map((v) => t(v === 'driver' ? '운전석' : v === 'passenger' ? '조수석' : v)).join(' · '));
    }
}

module.exports = { ComfortLog, journalLines };
