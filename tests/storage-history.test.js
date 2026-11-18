'use strict';
// MGU Monitor log history: daily averages and per-app averages read back from the files UsageLog writes,
// a past day read once (and kept on disk), today's again when it grew, placeholder names replaced by real ones.
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const { UsageLog } = require('../apps/storage/usage-log');
const { UsageHistory, parseRow, summarize, combine, demoDays } = require('../apps/storage/usage-history');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'storage-history-'));
const MB = 1048576;
const sample = (time, cpu, mem, apps) => ({ time, cpu, memory: { used: mem * 10 * MB, total: 1000 * MB, avail: (100 - mem) * 10 * MB }, uptime: 1,
    trend: {}, coverage: { denied: 0, skipped: 0, error: '' }, apps });
const app = (uid, name, cpu, rssMb, partial) => ({ uid, name, cpu, rss: rssMb * MB, processes: 1, partial: !!partial, trend: {} });
(async () => {
    try {
        const log = new UsageLog(root, { batchSize: 3 });
        const day1 = Date.parse('2026-11-16T10:00:00Z'), day2 = Date.parse('2026-11-17T10:00:00Z');
        // day 1: 6 samples; Redline named late (placeholder first), one partial sample of G-Force left out
        for (let i = 0; i < 6; i++) {
            assert(log.append(sample(day1 + i * 10000, 20 + i * 2, 50, [app(12210, i < 2 ? 'oap_12210' : 'Redline', 10, 40),
                app(12211, 'G-Force', i === 5 ? 99 : 2, i === 5 ? 999 : 20, i === 5)])), log.error);
        }
        assert(log.flush(), log.error);
        // day 2: 3 samples, one with no CPU
        [[null, 60], [40, 70], [60, 80]].forEach(([cpu, mem], i) => assert(log.append(sample(day2 + i * 10000, cpu, mem, [app(12210, 'Redline', 30, 60)])), log.error));
        assert(log.flush(), log.error);

        const files = fs.readdirSync(path.join(root, 'usage-logs')).sort();
        assert.deepStrictEqual(files, ['usage-2026-11-16.csv.gz', 'usage-2026-11-17.csv.gz']);

        const h = new UsageHistory(root);
        assert(await h.refresh(day2 + 60000), h.error);
        assert.strictEqual(h.days.length, 2);
        const [d1, d2] = h.days;
        assert.strictEqual(d1.day, '2026-11-16'); assert.strictEqual(d1.samples, 6);
        assert.strictEqual(d1.cpuSum / d1.cpuN, 25);                 // 20..30
        assert.strictEqual(d1.memSum / d1.memN, 50);
        assert.strictEqual(d1.apps['12210'].name, 'Redline');         // the real name over oap_12210
        assert.strictEqual(d1.apps['12211'].cpuN, 5);                 // the partial sample is left out
        assert.strictEqual(d1.apps['12211'].rssMax, 20 * MB);
        assert.strictEqual(d2.cpuN, 2); assert.strictEqual(d2.cpuSum / d2.cpuN, 50);

        const all = combine(h.days, 10000), one = combine([d2], 10000);
        assert.strictEqual(all.samples, 9);
        assert.strictEqual(all.cpu, (20 + 22 + 24 + 26 + 28 + 30 + 40 + 60) / 8);
        assert.strictEqual(all.memory, (50 * 6 + 60 + 70 + 80) / 9);
        assert.strictEqual(all.apps[0].name, 'Redline');              // sorted by average CPU
        assert.strictEqual(all.apps[0].cpu, (10 * 6 + 30 * 3) / 9);
        assert.strictEqual(all.apps[0].rss, (40 * 6 + 60 * 3) / 9 * MB);
        assert.strictEqual(all.apps[1].name, 'G-Force');
        assert.strictEqual(one.apps.length, 1); assert.strictEqual(one.cpu, 50);
        assert(Math.abs(all.hours - 9 * 10 / 3600) < 1e-9);

        // a past day is kept on disk and not read again; today's file is read again once it has grown
        assert(fs.existsSync(path.join(root, 'usage-summary.json')));
        const again = new UsageHistory(root);
        const zlib = require('zlib'), original = zlib.gunzip; let reads = [];
        zlib.gunzip = function (buffer, cb) { reads.push(buffer.length); return original.apply(this, arguments); };
        try {
            assert(await again.refresh(day2 + 120000));
            assert.strictEqual(reads.length, 1, 'only today is read at a new start');
            reads = [];
            assert(await again.refresh(day2 + 130000));
            assert.strictEqual(reads.length, 0, 'unchanged files are not read again');
            assert(log.append(sample(day2 + 30000, 80, 90, [app(12210, 'Redline', 50, 70)])));
            assert(log.flush());
            assert(await again.refresh(day2 + 140000));
            assert.strictEqual(reads.length, 0, 'today is read at most once a minute');
            assert(await again.refresh(day2 + 200000));
            assert.strictEqual(reads.length, 1, 'today grew: read again');
            assert.strictEqual(again.days[1].samples, 4);
        } finally { zlib.gunzip = original; }

        // a broken row and an appended member's header are skipped; quotes in names survive
        const csv = (apps) => '"' + JSON.stringify(apps).replace(/"/g, '""') + '"';     // as usage-log.js writes it
        const text = 'timestamp_utc,x\n' +
            '2026-11-18T00:00:00.000Z,10,20,1,2,3,,,0,0,0,ok,0,0,' + csv([[1, 'A "b", c', 5, MB, 1, null, null, 0]]) + '\n' +
            'garbage\ntimestamp_utc,x\n' +
            '2026-11-18T00:00:10.000Z,30,40,1,2,3,,,0,0,0,ok,0,0,"[]"\n';
        const s = summarize('2026-11-18', text);
        assert.strictEqual(s.samples, 2); assert.strictEqual(s.cpuSum, 40); assert.strictEqual(s.apps['1'].name, 'A "b", c');
        assert.strictEqual(parseRow('not,a,row'), null);

        // no log folder: nothing, no error
        const empty = new UsageHistory(path.join(root, 'none'));
        assert(await empty.refresh(day2)); assert.strictEqual(empty.days.length, 0); assert.strictEqual(empty.error, '');

        const demo = demoDays(day2);
        assert(demo.length >= 25 && demo.every((d) => d.samples > 0 && Object.keys(d.apps).length));
        assert(combine(demo, 10000).apps.length >= 5);
        console.log('PASS: MGU Monitor log history: daily and per-app averages from the usage logs, partial samples left out, real names, a day read once, demo days');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
