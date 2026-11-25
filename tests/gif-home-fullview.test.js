'use strict';
// Host-only: GIF Home's Animation screen Full view (전체보기). Builds the actual Store package, runs its app
// with a minimal kit context (the software path, no GPU renderer) and renders the screen: the split screen
// with its Full view button, the GIF alone after it, and the menu screen again after a tap / a bottom button.
// Set GIF_PREVIEW_DIR to keep the rendered PNGs.
const assert = require('assert'), fs = require('fs'), path = require('path');
const cp = require('child_process'), vm = require('vm'), os = require('os');
const { build } = require('../tools/store-build');
const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gif-fullview-test-'));
const previews = process.env.GIF_PREVIEW_DIR;

const source = require('../apps/gif_home/app.json');
const file = build({ template: 'gif_home', id: 'gif_home_ko', version: source.version, language: 'ko',
    dir: 'store/apps/gif_home_ko', source: 'apps/gif_home', out: path.join(temp, 'out') });
const stage = path.join(temp, 'installed'); fs.mkdirSync(stage);
cp.execFileSync('tar', ['-xzf', file, '-C', stage]);
const js = path.join(stage, 'package/javascript');
const spec = require(path.join(js, 'kit/app-spec.json'));
const { Canvas } = require(path.join(js, 'kit/canvas'));
const { Recorder, play } = require(path.join(js, 'kit/record'));
const { theme } = require(path.join(js, 'kit/themes'));
const { t } = require(path.join(js, 'kit/i18n'));

const values = {}; spec.settings.forEach((s) => { values[s.key] = s.default; });
const loops = {}, clicks = {}, visibility = [], labels = [];
let frame = null, tap = null, start = null, visible = 'ANIM', gpu = false;
const dataDir = path.join(temp, 'data'); fs.mkdirSync(dataDir);
const ctx = { spec, dataDir, theme: () => theme('m_red'),
    // place: the GPU renderer's full-screen layout on iDrive 7 (kit/runtime/display.js), when gpu is set
    canvas: (w, h) => { const r = new Recorder(w, h); if (gpu) r.place = { full: true, x: 0, y: 0, w: 1920, h: 720, scale: 1.165, ox: 76, oy: 36 }; return r; },
    log: { info() {}, warn() {}, error() {} },
    settings: { get: (k) => values[k], set: (k, v) => { values[k] = v; }, onChange() {} },
    ui: { onClick: (n, fn) => { clicks[n] = fn; }, image: async (n, cv) => { if (n === 'ANIM_GFX') frame = cv; },
        open: (n) => { visible = n; }, isVisible: (n) => n === visible, onVisible: (fn) => visibility.push(fn) },
    loop: (n, hz, fn) => { loops[n] = fn; }, onTab() {}, onTap: (fn) => { tap = fn; } };
const originalText = Recorder.prototype.text;
Recorder.prototype.text = function (value) { labels.push(t(value)); return originalText.apply(this, arguments); };
const images = [], originalImage = Recorder.prototype.image;
Recorder.prototype.image = function (id, x, y, w, h) { images.push({ x, y, w, h }); return originalImage.apply(this, arguments); };
vm.runInNewContext(fs.readFileSync(path.join(js, 'app.js'), 'utf8'), {
    require(n) { if (n === './kit/mgu') return { run: (impl) => { start = impl.start(ctx); } }; return n[0] === '.' ? require(path.join(js, n)) : require(n); },
    module: { exports: {} }, __dirname: js, process: { env: {}, on() {} }, Buffer, console, setTimeout, clearTimeout,
    setInterval: () => 0, clearInterval() {} });

// arrays made inside the vm context: copied into this realm before deepStrictEqual
const keys = () => Array.from(frame.targets, (x) => x.key);
const save = (name) => { if (previews) fs.writeFileSync(path.join(previews, name), play(frame.words(), new Canvas(frame.w, frame.h)).png()); };
const full = async () => { frame.targets.find((x) => x.key === 'anim-full').run(); await loops.ANIM(); };
(async () => {
    await start;
    if (previews) fs.mkdirSync(previews, { recursive: true });
    visibility.forEach((fn) => fn('ANIM', true));
    await new Promise((r) => setTimeout(r, 300));  // the first GIF decodes
    labels.length = 0; await loops.ANIM(); save('anim-split.png');
    assert.deepStrictEqual(keys(), ['anim-prev', 'anim-next', 'anim-speed', 'anim-full']);
    assert.ok(labels.includes('전체보기'), 'the Full view button is drawn, in Korean');
    assert.ok(labels.includes('애니메이션'), 'the menu screen shows the tabs');

    // Full view: the GIF alone, no tabs or panel; the whole page is one target (tap / controller press)
    labels.length = 0; await full(); save('anim-full.png');
    assert.deepStrictEqual(Array.from(frame.targets, (x) => [x.key, x.x, x.y, x.w, x.h]), [['anim-menu', 0, 0, 1600, 520]]);
    assert.deepStrictEqual(labels, [], 'nothing but the GIF is drawn');
    // in the middle of the iDrive 7 screen (1920 x 720), not of the HMI's image (x 124, y 82 on the screen)
    const gif = images[images.length - 1];
    assert.ok(gif && gif.h >= 480, 'the GIF is drawn large: ' + JSON.stringify(gif));
    assert.ok(Math.abs(124 + gif.x + gif.w / 2 - 960) <= 1 && Math.abs(82 + gif.y + gif.h / 2 - 360) <= 1, 'centred on the screen: ' + JSON.stringify(gif));
    await new Promise((r) => setTimeout(r, 50)); await loops.ANIM();
    assert.deepStrictEqual(keys(), ['anim-menu'], 'full view stays until a tap');

    // a tap on it: the menu screen again, with the tabs
    labels.length = 0; frame.targets[0].run(); await loops.ANIM(); save('anim-back.png');
    assert.deepStrictEqual(keys(), ['anim-prev', 'anim-next', 'anim-speed', 'anim-full']);
    assert.ok(labels.includes('애니메이션'), 'tabs shown again');

    // a tap the kit hands to onTap (no target under it) leaves full view too
    await full(); tap(10, 10); await loops.ANIM();
    assert.ok(keys().includes('anim-full'));
    // a bottom button (the software path's only input) leaves full view and does nothing else
    await full(); clicks.BTN_ANIM_SETTINGS(); await loops.ANIM();
    assert.strictEqual(visible, 'ANIM', 'Settings was not opened by the press that left full view');
    assert.ok(keys().includes('anim-full'));
    // with the GPU renderer: drawn in screen pixels, the GIF in the middle of the whole 1920 x 720 screen
    gpu = true; await loops.ANIM(); await full();
    const onScreen = images[images.length - 1];
    assert.ok(Math.abs(onScreen.x + onScreen.w / 2 - 960) <= 1 && Math.abs(onScreen.y + onScreen.h / 2 - 360) <= 1 && onScreen.h === 720,
        'GPU: centred on the screen: ' + JSON.stringify(onScreen));
    frame.targets[0].run(); await loops.ANIM(); gpu = false;
    // opening the screen again starts on the menu screen
    await full(); visibility.forEach((fn) => fn('ANIM', true)); await loops.ANIM();
    assert.ok(keys().includes('anim-full'));
    Recorder.prototype.text = originalText; Recorder.prototype.image = originalImage;
    console.log('GIF Home Animation screen Full view: GIF alone in the screen centre, the whole screen one target, tap / bottom button / reopen back to the menu screen');
    process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
