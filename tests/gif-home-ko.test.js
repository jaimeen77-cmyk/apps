'use strict';
// Host-only: the Korean edition of GIF Home (from NamelsMissing/mgu-apps).
// Builds the actual Store package, inspects it, and runs the phone page in a minimal DOM
// as a Korean and as an English phone. No vehicle SDK. Run from PowerShell (Windows tar).
const assert = require('assert'), fs = require('fs'), path = require('path');
const cp = require('child_process'), vm = require('vm'), os = require('os');
const { build } = require('../tools/store-build');
const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ko-gif-terminal-test-'));
const HANGUL = /[가-힣]/;

const APPS = [
    { template: 'gif_home', id: 'gif_home_ko', title: 'GIF 플레이어', widget: true,
      lines: { 'Mode · Random – Selected GIFs': '모드 · 무작위 – 선택한 GIF', 'HTTP server · Running': 'HTTP 서버 · 실행 중',
          'Phone connection · Not verified': '휴대폰 연결 · 확인 안 됨', 'Tap to open': '눌러서 열기',
          '[x] Pixel drive: Sunset  · Playing': '[x] 픽셀 드라이브: 노을  · 재생 중', 'Widget preview  1/5': '위젯 미리보기  1/5',
          'Widget settings  2/5': '위젯 설정  2/5', 'Animation settings  4/5': '애니메이션 설정  4/5',
          'Animation screen · GPU renderer (mgu-renderd, smooth)': '애니메이션 화면 · GPU 렌더러 (mgu-renderd, 부드럽게)',
          'GPU renderer (mgu-renderd) · Not running': 'GPU 렌더러(mgu-renderd) · 실행 안 됨' } },
];

function checkPackage(app) {
    const source = JSON.parse(fs.readFileSync(path.join(root, 'apps', app.template, 'app.json'), 'utf8'));
    const listing = JSON.parse(fs.readFileSync(path.join(root, 'store/apps', app.id, 'app.json'), 'utf8'));
    assert.deepStrictEqual(listing, { id: app.id, version: source.version });
    const repo = JSON.parse(fs.readFileSync(path.join(root, 'mgu-repo.json'), 'utf8'));
    const entry = repo.components.find((c) => c.id === app.id);
    assert.strictEqual(entry.version, source.version);
    assert.strictEqual(entry.path, 'store/apps/' + app.id);
    assert.ok(entry.title.indexOf('(한국어)') > 0);
    assert.deepStrictEqual(entry.build.args.slice(-4), ['--language', 'ko', '--source', 'apps/' + app.template]);
    Object.keys(entry.requires).forEach((tool) => {
        const toolEntry = repo.components.find((c) => c.id === tool && c.kind === 'tool');
        const component = JSON.parse(fs.readFileSync(path.join(root, toolEntry.path, 'component.json'), 'utf8'));
        assert.strictEqual(component.id, tool);
        assert.strictEqual(component.version, entry.requires[tool]);
        assert.strictEqual(toolEntry.version, component.version);
    });

    const file = build({ template: app.template, id: app.id, version: source.version, language: 'ko',
        dir: 'store/apps/' + app.id, source: 'apps/' + app.template, out: path.join(temp, app.id) });
    const stage = path.join(temp, app.id, 'installed'); fs.mkdirSync(stage);
    cp.execFileSync('tar', ['-xzf', file, '-C', stage]);
    const pkgDir = path.join(stage, 'package'), js = path.join(pkgDir, 'javascript');
    const pkg = require(path.join(pkgDir, 'package.json'));
    assert.strictEqual(pkg.name, app.id);
    assert.strictEqual(pkg.version, source.version);
    assert.deepStrictEqual(pkg.mguHmi, ['ID7']);
    assert.strictEqual(pkg.license, 'GPL-3.0');
    assert.strictEqual(pkg.displayName, app.title);
    for (const rel of ['LICENSE.GPL-3.0', 'LICENSE.idrive7-apps', 'javascript/NOTICE', 'javascript/app.js',
        'javascript/kit/fonts/korean.json', 'javascript/kit/fonts/OFL-NotoSansKR.txt']) {
        assert.ok(fs.statSync(path.join(pkgDir, rel)).isFile(), app.id + ': missing ' + rel);
    }
    assert.ok(!fs.existsSync(path.join(pkgDir, 'node_modules')), 'no SDK/node_modules in a host build');
    const spec = require(path.join(js, 'kit/app-spec.json'));
    assert.strictEqual(spec.title, app.title);
    spec.screens.forEach((s) => s.buttons.forEach((b) => assert.ok(HANGUL.test(b[1]) || /^IP$/.test(b[1]), 'button ' + b[1])));
    (spec.settings || []).forEach((s) => {
        assert.ok(HANGUL.test(s.label), 'setting ' + s.label);
        (s.options || []).forEach((o) => assert.ok(HANGUL.test(o[1]), 'option ' + o[1]));
    });
    assert.deepStrictEqual((spec.settings || []).map((s) => [s.key, s.default]), (source.settings || []).map((s) => [s.key, s.default]));
    const strings = require(path.join(pkgDir, 'rhmiData/variantGroups/Common/texts/ko_KR.json'));
    assert.ok(Object.values(strings).indexOf(app.title) >= 0, 'RHMI title is Korean');
    if (app.widget) {
        assert.ok(fs.statSync(path.join(pkgDir, 'rhmiDataStartWidget/application.json')).isFile());
        assert.ok(fs.readFileSync(path.join(js, 'kit/mgu.js'), 'utf8').indexOf("'GIF_HOME_WIDGET'") > 0, 'widget text via StringBundle');
        const presets = fs.readdirSync(path.join(js, 'resources')).filter((n) => /\.json$/.test(n));
        assert.strictEqual(presets.length, 5, 'built-in animations are packaged');
        assert.ok(fs.statSync(path.join(js, 'LICENSE')).isFile(), 'QR code MIT license');
        // the Animation screen: drawn by the GPU renderer (the template's display.js serves the "gpu" screen)
        const anim = spec.screens.find((s) => s.name === 'ANIM');
        assert.ok(anim && anim.gpu === true, 'ANIM is the GPU screen');
        assert.deepStrictEqual(anim.buttons.map((b) => b[0]), ['BTN_PREVGIF', 'BTN_NEXTGIF', 'BTN_ANIM_SETTINGS']);
        assert.ok(!spec.screens.find((s) => s.name === 'MAIN').buttons.some((b) => b[0] === 'BTN_ANIM'), 'page 3 opens it, no own button');
        assert.ok(fs.readFileSync(path.join(js, 'kit/display.js'), 'utf8').indexOf('canvasScreens.find((s) => s.gpu === true)') > 0, 'display.js patched');
        assert.ok(fs.statSync(path.join(js, 'animation.js')).isFile(), 'animation.js packaged');
        const ui = fs.readFileSync(path.join(pkgDir, 'rhmiData/uiDescriptions/ID7/uiDescription.json'), 'utf8');
        ['ANIM_GFX', 'BTN_PREVGIF', 'BTN_NEXTGIF', 'BTN_ANIM_SETTINGS'].forEach((id) => assert.ok(ui.indexOf('"' + id + '"') > 0, id));
        // the user's picture is both the menu icon and the widget's preview image
        const icon = fs.readFileSync(path.join(root, 'apps/gif_home/icon.png'));
        assert.ok(icon.equals(fs.readFileSync(path.join(root, 'store/apps/gif_home_ko/icon.png'))), 'Store listing icon');
        assert.ok(icon.equals(fs.readFileSync(path.join(pkgDir, 'rhmiData/variantGroups/Common/images/gif_home_ko_icon.png'))), 'menu icon');
        assert.ok(icon.equals(fs.readFileSync(path.join(pkgDir, 'rhmiDataStartWidget/variantGroups/Common/images/gif_home_ko_widget_icon.png'))), 'widget icon');
    }
    // the packaged translator turns the lines the app draws into Korean
    const { t } = require(path.join(js, 'kit/i18n'));
    Object.keys(app.lines).forEach((line) => assert.strictEqual(t(line), app.lines[line]));
    // every Hangul syllable the app can draw is in the packaged font atlas
    const glyphs = require(path.join(js, 'kit/fonts/korean.json')).sizes[0].glyphs;
    const missing = new Set();
    Object.values(source.translations.ko).join('').split('').filter((c) => HANGUL.test(c)).forEach((c) => { if (!glyphs[c.charCodeAt(0)]) missing.add(c); });
    assert.deepStrictEqual(Array.from(missing), [], app.id + ': glyphs missing from the Korean font');
    // and every other non-ASCII character the app draws (a line with Hangul is drawn in the Korean font)
    const drawn = new Set();
    fs.readFileSync(path.join(root, 'apps', app.template, 'main.js'), 'utf8').replace(/'([^'\\]|\\.)*'/g, (s) => {
        s.split('').forEach((c) => { if (c.charCodeAt(0) > 126 && !glyphs[c.charCodeAt(0)]) drawn.add(c); });
    });
    assert.deepStrictEqual(Array.from(drawn), [], app.id + ': characters main.js draws that the Korean font lacks');
}

// ---- phone pages in a minimal DOM -------------------------------------------------------
function fakeDom(html, language) {
    const body = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
    const textNodes = [], attrs = [], elements = {};
    const re = />([^<]+)</g;
    for (let m = re.exec(body); m; m = re.exec(body)) if (m[1].trim()) textNodes.push({ nodeValue: m[1].replace(/&gt;/g, '>').replace(/&amp;/g, '&') });
    const tagRe = /<[a-z]+\b([^>]*)>/g;
    for (let m = tagRe.exec(body); m; m = tagRe.exec(body)) {
        const values = {};
        m[1].replace(/([a-z-]+)="([^"]*)"/g, (_, k, v) => { values[k] = v; });
        if (values.placeholder || values['aria-label']) attrs.push({ values, getAttribute: (k) => values[k], setAttribute: (k, v) => { values[k] = v; } });
    }
    const element = () => ({ textContent: '', value: '', style: {}, disabled: false, files: [], href: '', handlers: {},
        classList: { add() {}, remove() {}, toggle() {}, contains: () => true },
        addEventListener(type, fn) { this.handlers[type] = fn; }, appendChild() {}, setAttribute() {}, getAttribute: () => '' });
    const document = {
        title: (/<title>([^<]*)<\/title>/.exec(html) || [])[1], body: {}, documentElement: {}, hidden: false,
        getElementById: (id) => elements[id] || (elements[id] = element()),
        createElement: element, createTextNode: (v) => ({ nodeValue: v }),
        querySelectorAll: (sel) => (/placeholder|aria-label/.test(sel) ? attrs : []),
        createTreeWalker: () => { let i = -1; return { nextNode: () => textNodes[++i] || null }; },
        execCommand: () => true,
    };
    function XMLHttpRequest() {} XMLHttpRequest.prototype = { open() {}, setRequestHeader() {}, send() {} };
    const context = { document, navigator: { language, languages: [language] }, window: { location: { hash: '' } },
        location: { search: '?t=abc', pathname: '/' }, history: { replaceState() {} }, URLSearchParams,
        XMLHttpRequest, fetch: () => Promise.reject(new Error('offline')), setInterval: () => 0, console, Promise };
    return { context, textNodes, attrs, document };
}
function wordsOf(source) {
    const m = /(?:const|var) WORDS = (\{[\s\S]*?\n    \});/.exec(source);
    return vm.runInNewContext('(' + m[1] + ')');
}
function checkPage(name, html, script, keep) {
    const words = wordsOf(script);
    // every L('...') used in the script has a Korean entry
    const re = /\bL\('((?:[^'\\]|\\.)+)'\)/g;
    for (let m = re.exec(script); m; m = re.exec(script)) {
        const key = vm.runInNewContext("'" + m[1] + "'");
        assert.ok(Object.prototype.hasOwnProperty.call(words, key), name + ': no Korean for ' + key);
    }
    Object.keys(words).forEach((k) => assert.ok(HANGUL.test(words[k]), name + ': ' + k));
    const ko = fakeDom(html, 'ko-KR');
    vm.runInNewContext(script, ko.context);
    ko.textNodes.forEach((n) => {
        const text = n.nodeValue.trim();
        assert.ok(HANGUL.test(text) || keep.indexOf(text) >= 0, name + ': untranslated "' + text + '"');
    });
    ko.attrs.forEach((a) => Object.keys(a.values).filter((k) => k === 'placeholder' || k === 'aria-label')
        .forEach((k) => assert.ok(HANGUL.test(a.values[k]) || keep.indexOf(a.values[k]) >= 0, name + ': ' + k + ' ' + a.values[k])));
    assert.strictEqual(ko.document.documentElement.lang, 'ko');
    const en = fakeDom(html, 'en-US'), before = en.textNodes.map((n) => n.nodeValue);
    vm.runInNewContext(script, en.context);
    assert.deepStrictEqual(en.textNodes.map((n) => n.nodeValue), before, name + ': English phones keep English');
}


try {
    APPS.forEach(checkPackage);
    const gifPage = require('../apps/gif_home/phone_page').page;
    const gifScript = /<script>([\s\S]*)<\/script>/.exec(gifPage)[1];
    checkPage('GIF Home phone page', gifPage, gifScript, []);
    console.log('GIF Home Korean edition: package, Korean text, font coverage, phone page, icons');
} finally {
    fs.rmSync(temp, { recursive: true, force: true });
}
