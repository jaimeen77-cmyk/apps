'use strict';
// Test the actual bundled compositor and input routing with only transport stubbed.
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const { EventEmitter } = require('events');
const stage = path.resolve(process.argv[2]), js = path.join(stage, 'source/javascript');
const spec = JSON.parse(fs.readFileSync(path.join(js, 'kit/app-spec.json')));
const { SettingsPage } = require(path.join(js, 'settings-ui'));
const { configure } = require(path.join(js, 'settings-chrome'));
const { Recorder, play } = require(path.join(js, 'kit/record'));
const { Canvas } = require(path.join(js, 'kit/canvas'));
const { t } = require(path.join(js, 'kit/i18n'));
const values = {}, components = {}, calls = [];
spec.settings.forEach((s) => { values[s.key] = s.default; });
class Renderer extends EventEmitter {
    constructor() { super(); this.ready = this.native = this.touch = true; this.screen = { w: 1920, h: 720 }; this.info = { controller: true }; }
    static available() { return true; }
    connect() { this.emit('ready'); }
    place() {} show(on) { this.visible = on; } grab() {} claim() {} frame() {}
}
const ui = { rhmi: { getByName(name) { return components[name] || (components[name] = new EventEmitter()); } },
    onVisible() {}, onFocus() {}, isVisible(name) { return name === 'MAIN'; }, hasFocus() { return true; }, visible() {} };
const settings = { schema: spec.settings, get: (k) => values[k], set(k, v) { values[k] = v; }, onChange() {} };
const log = { info() {}, warn() {}, error(e) { throw e; } };
const box = { module: { exports: {} }, process: { env: {} }, Date, Buffer,
    setTimeout() {}, clearTimeout() {}, setInterval() { return { unref() {} }; },
    require(name) { return name === './renderd' ? { RenderClient: Renderer } : require(path.join(js, 'kit', name)); } };
vm.runInNewContext(fs.readFileSync(path.join(js, 'kit/display.js'), 'utf8'), box);
const display = new box.module.exports.Display(ui, log, spec, settings, () => require(path.join(js, 'kit/themes')).theme());
configure({ display, hideButton: (id) => display.hideButton(id) });
let page, bodyWords;
const oldText = Recorder.prototype.text;
Recorder.prototype.text = function (value, x, y, size) { calls.push({ value: t(value), size }); return oldText.apply(this, arguments); };
function render() {
    const r = page.draw(display.canvas(1600, 520)); bodyWords = new Uint32Array(r.words());
    return display.present('MAIN_GFX', r, () => {});
}
page = new SettingsPage(settings, render, spec.version);
display.onTab = (i) => page.selectTab(i);
function tapLogical(r) { display._touch(1, r.x + r.w / 2, r.y + r.h / 2); display._touch(3, r.x + r.w / 2, r.y + r.h / 2); }
function save(name) {
    if (!process.argv[3]) return;
    const out = path.resolve(process.argv[3]); fs.mkdirSync(out, { recursive: true });
    const pageImage = new Canvas(1600, 520), chrome = new Canvas(1920, 720), result = new Canvas(1920, 720);
    play(bodyWords, pageImage);
    // Native chrome ends with clipped transparent masks for HMI icons. The
    // software player ignores clips, so omit those clears in this host image;
    // no stock status icons are included in the preview.
    chrome.clear = () => chrome;
    play(display.chromeRec.words(), chrome);
    const p = display.place; result.clear('#090b0e');
    result.drawImage(pageImage.d, 1600, 520, p.ox, p.oy, 1600 * p.scale, 520 * p.scale); result.blit(chrome, 0, 0);
    fs.writeFileSync(path.join(out, name + '.png'), result.png());
}
try {
    render();assert(display.own());assert.strictEqual(display.barH(),80);
    assert.deepStrictEqual(Array.from(display.buttons(),b=>b.id),['BTN_PREVIOUS','BTN_NEXT','BTN_VALUE_DOWN','BTN_VALUE_UP']);
    display.buttons().forEach(b=>assert(b.w>=450));
    for(const name of ['Basic settings','HUD display setting','CLUSTER display setting','NAV display setting'])assert(calls.some(c=>c.value===t(name).toUpperCase()&&c.size===28));
    assert.strictEqual(display.tabs.length,5);
    const tap=id=>{const target=display.pageTargets.find(r=>r.id===id);assert(target,'missing target '+id);tapLogical(target);};
    tap('shiftRpm');assert.strictEqual(page.open,'shiftRpm');tap('back');
    tapLogical(display.tabs[1]);assert.strictEqual(page.tab,1);tap('sportHudOutput');tap('choice0');assert.strictEqual(values.sportHudOutput,'redline');
    tap('design');const nativeFrame=page.draw(display.canvas(1600,520));assert.strictEqual(nativeFrame.images.size,0,'design preview must use native vectors');
    tap('design0');assert.strictEqual(values.hudAlertStyle,'bar');tap('design');tap('design1');assert.strictEqual(values.hudAlertStyle,'circle');save('hud-design-full');
    tap('aux');tap('aux-mode1');tap('metric-oil');tap('metric-boost');tap('ok');assert.deepStrictEqual(JSON.parse(values.hudAuxConfig).items,['oil','boost']);
    tap('layout');tap('part1');tap('right');assert.strictEqual(values.hudGearOffsetX,10);tap('size-plus0');assert.strictEqual(values.hudGearWidthScale,105);save('hud-layout-full');tap('back');
    tapLogical(display.tabs[2]);tap('design');const clusterFrame=page.draw(display.canvas(1600,520));assert.strictEqual(clusterFrame.images.size,0);tap('back');
    tapLogical(display.tabs[3]);tap('navColor');assert.strictEqual(page.draw(display.canvas(1600,520)).images.size,0);tap('color2');assert.strictEqual(values.navColor,'blue');tap('layout');tap('part0');tap('part1');tap('right');assert.strictEqual(values.hudTextOffsetX,190);tap('size-plus0');assert.strictEqual(values.hudTextScale,70);assert.strictEqual(values.navUniformScale,70);save('nav-text-layout-full');tap('back');
    console.log('PASS: real native compositor four tabs/large controls, vector-only designs/colors, auxiliary picker confirmation, independent component/navigation touch routing and Back');
} finally { Recorder.prototype.text = oldText; }
