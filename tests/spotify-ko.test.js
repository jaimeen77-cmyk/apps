'use strict';
// Host-only: the Korean edition of Spotify (spotify_ko, from hexlay/idrive7-custom-apps).
// Builds the Store package as the head unit does (tools/store-build.js, no SDK), inspects it, and runs its
// translator on the lines the app draws and on names from Spotify, which must stay as they are.
const assert = require('assert'), fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const { build } = require('../tools/store-build');
const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'spotify-ko-test-'));
const HANGUL = /[가-힣]/;
const ID = 'spotify_ko', TEMPLATE = 'spotify';

const source = JSON.parse(fs.readFileSync(path.join(root, 'apps', TEMPLATE, 'app.json'), 'utf8'));
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'localization/spotify.ko.json'), 'utf8'));

// the Store listing and its entry
assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(root, 'store/apps', ID, 'app.json'), 'utf8')), { id: ID, version: source.version });
const repo = JSON.parse(fs.readFileSync(path.join(root, 'mgu-repo.json'), 'utf8'));
const entry = repo.components.find((c) => c.id === ID);
assert.strictEqual(entry.version, source.version);
assert.strictEqual(entry.path, 'store/apps/' + ID);
assert.ok(entry.title.indexOf('(한국어)') > 0);
assert.deepStrictEqual(entry.mguHmi, ['ID7']);
assert.deepStrictEqual(entry.build.args.slice(-4), ['--language', 'ko', '--source', 'apps/' + TEMPLATE]);
assert.ok(entry.build.shared.indexOf('apps/' + TEMPLATE) >= 0);
Object.keys(source.requires).forEach((tool) => assert.strictEqual(entry.requires[tool], source.requires[tool], 'requires ' + tool + ' as upstream'));
assert.deepStrictEqual(source.storeMguHmi, ['ID7']);

// the Korean edition's changes in main.js are there
const main = fs.readFileSync(path.join(root, 'apps', TEMPLATE, 'main.js'), 'utf8');
assert.ok(main.indexOf("const { t: tr } = require('./kit/i18n');") > 0);
assert.ok(main.indexOf("str = opts && opts.literal ? String(str || '') : tr(String(str || ''));") > 0, 'fitText translates first');
['curTrk.title', 'trk.title', 'pl.name', 'curPl.name', 'nx.title', 'dev.name'].forEach((name) =>
    assert.ok(new RegExp('fitText\\(cv, ' + name.replace('.', '\\.') + ',[^\\n]*literal: true').test(main), name + ' drawn as it is'));

// the package, as the head unit builds it
const file = build({ template: TEMPLATE, id: ID, version: source.version, language: 'ko',
    dir: 'store/apps/' + ID, source: 'apps/' + TEMPLATE, out: path.join(temp, 'out') });
const stage = path.join(temp, 'installed'); fs.mkdirSync(stage);
cp.execFileSync('tar', ['-xzf', file, '-C', stage]);
const pkgDir = path.join(stage, 'package'), js = path.join(pkgDir, 'javascript');
const pkg = require(path.join(pkgDir, 'package.json'));
assert.strictEqual(pkg.name, ID);
assert.strictEqual(pkg.version, source.version);
assert.deepStrictEqual(pkg.mguHmi, ['ID7']);
assert.strictEqual(pkg.mguInternet, true, 'Spotify needs the internet');
assert.strictEqual(pkg.displayName, '스포티파이');
for (const rel of ['LICENSE', 'LICENSE.MIT', 'javascript/NOTICE', 'javascript/LICENSE', 'javascript/app.js', 'javascript/api.js',
    'javascript/art.js', 'javascript/cloud_pair.js', 'javascript/jpeg.js', 'javascript/kit/fonts/korean.json', 'javascript/kit/fonts/OFL-NotoSansKR.txt']) {
    assert.ok(fs.statSync(path.join(pkgDir, rel)).isFile(), 'missing ' + rel);
}
assert.ok(!fs.existsSync(path.join(pkgDir, 'node_modules')), 'no SDK in a host build');
assert.ok(!fs.existsSync(path.join(js, 'kit/fonts/cjk.json')), 'no Chinese atlas beside the Korean one');
['app.js', 'api.js', 'art.js', 'cloud_pair.js', 'jpeg.js'].forEach((f) => assert.ok(
    fs.readFileSync(path.join(js, f)).equals(fs.readFileSync(path.join(root, 'apps', TEMPLATE, f === 'app.js' ? 'main.js' : f))), f + ' from apps/spotify'));
const application = JSON.parse(fs.readFileSync(path.join(pkgDir, 'rhmiData/application.json'), 'utf8'));
assert.strictEqual(application.application.name, ID, 'its own app beside the original Spotify');
assert.ok(fs.readFileSync(path.join(js, 'kit/fonts.js'), 'utf8').indexOf("name = 'korean'") > 0, 'fonts.js picks the Korean atlas');
assert.ok(fs.readFileSync(path.join(js, 'kit/i18n.js')).equals(fs.readFileSync(path.join(root, 'tools/spotify-i18n.js'))), 'i18n.js');

// the template carries this repository's catalog (a catalog change needs tools/prepare-spotify.py template)
const locale = require(path.join(js, 'kit/locale.json'));
assert.strictEqual(locale.language, 'ko');
assert.deepStrictEqual(locale.strings, catalog.strings, 'template strings are stale: run tools/prepare-spotify.py template');
assert.deepStrictEqual(locale.rules, catalog.rules, 'template rules are stale: run tools/prepare-spotify.py template');

// the car's own menus: tabs, buttons, settings
const spec = require(path.join(js, 'kit/app-spec.json'));
spec.screens.forEach((s) => s.buttons.forEach((b) => assert.ok(HANGUL.test(b[1]), 'button ' + b[1])));
spec.settings.forEach((s) => assert.ok(HANGUL.test(s.label), 'setting ' + s.label));
assert.deepStrictEqual(spec.settings.map((s) => [s.key, s.default]), source.settings.map((s) => [s.key, s.default]));
const strings = require(path.join(pkgDir, 'rhmiData/variantGroups/Common/texts/ko_KR.json'));
['스포티파이', '다음 페이지', '설정', '재생 모드', '온라인 모드 (기본)', '데모 모드 (오프라인)', '재생 상태 갱신 간격', '1초', '10초'].forEach((s) =>
    assert.ok(Object.values(strings).indexOf(s) >= 0, 'HMI string ' + s));

// the lines the app draws
const { t } = require(path.join(js, 'kit/i18n'));
const lines = {
    'Playlists': '플레이리스트', 'Liked Songs': '좋아요 표시한 곡', 'Now Playing': '지금 재생 중', 'Connect': '연결',
    'No internet connection': '인터넷에 연결되어 있지 않습니다', 'Try again': '다시 시도',
    '7 songs': '7곡', '7 songs  ·  Playing': '7곡  ·  재생 중', '7 songs  ·  27 min  ·  Road trip': '7곡  ·  27분  ·  Road trip',
    '142 saved songs  ·  showing 1–8  ·  1 hr 5 min': '저장한 곡 142개  ·  1–8 표시  ·  1시간 5분',
    '1 of 4': '1/4', 'Loading more songs (50 of 120)...': '곡 더 불러오는 중 (50/120)...',
    'Playing on Kitchen Speaker': 'Kitchen Speaker에서 재생 중', 'Paused on BMW iDrive 7': 'BMW iDrive 7에서 일시정지됨',
    'iPhone is not responding': 'iPhone 응답 없음',
    'Hurry Up, We\'re Dreaming  ·  from Liked Songs': 'Hurry Up, We\'re Dreaming  ·  좋아요 표시한 곡에서',
    'from a playlist': '플레이리스트에서', 'Carpenter Brut  ·  in 4:03': 'Carpenter Brut  ·  4:03 후', '+2 more': '+2곡 더',
    'Smartphone  ·  volume 82 %': '스마트폰  ·  볼륨 82%', '3 playlists · 1 liked song': '플레이리스트 3개 · 좋아요 표시한 곡 1곡',
    'Skip failed': '다음 곡 실패', 'Shuffle is not possible here (Spotify said no)': '셔플: 여기서는 할 수 없습니다 (Spotify가 거부함)',
    'No connection to Spotify - play did not go through': 'Spotify에 연결되지 않아 재생 요청이 전달되지 않았습니다',
};
Object.keys(lines).forEach((line) => assert.strictEqual(t(line), lines[line], line));
// names from Spotify inside a line stay as they are (the kit's own i18n swapped words found inside a line)
['Play That Funky Music', 'Connect the Dots', 'Shuffle Mix  ·  Daily Playlists', 'Songs from the Big Chair', 'Pause Button Remix']
    .forEach((name) => assert.strictEqual(t(name), name, name));
Object.values(lines).forEach((ko) => assert.strictEqual(t(ko), ko, 'a translation is left as it is: ' + ko));

// every Hangul syllable the catalog can draw is in the packaged atlas
const glyphs = require(path.join(js, 'kit/fonts/korean.json')).sizes[0].glyphs;
const missing = new Set();
JSON.stringify(catalog).split('').filter((c) => HANGUL.test(c)).forEach((c) => { if (!glyphs[c.charCodeAt(0)]) missing.add(c); });
assert.deepStrictEqual(Array.from(missing), [], 'glyphs missing from the Korean font');
const fonts = require(path.join(js, 'kit/fonts'));
assert.strictEqual(fonts.get('bold', 20, '방탄소년단').family, 'korean', 'a Korean song title draws from the Korean atlas');
assert.strictEqual(fonts.get('bold', 20, 'Midnight City').family, 'bold');

// the GPU path: the tall Korean atlas reaches the renderer in pieces of at most 512 rows (sent whole it did not fit
// the renderer's shared atlas texture and every Hangul line was blank on the car), and the pieces draw the same pixels
const rec = require(path.join(js, 'kit/record'));
const { Canvas } = require(path.join(js, 'kit/canvas'));
const line = '플레이리스트 · 좋아요 표시한 곡 · 지금 재생 중 · 연결 · 방탄소년단 Dynamite';
const r = new rec.Recorder(1600, 120);
r.text(line, 10, 60, 30, '#ffffff');
const used = Array.from(r.atlases).map((id) => rec.atlasById(id));
assert.ok(used.length > 1, 'Korean text uses several atlas pieces');
used.forEach((f) => assert.ok(f.atlasH <= 512 && f.alpha.length === f.atlasW * f.atlasH, 'piece of ' + f.atlasH + ' rows'));
const viaPieces = new Canvas(1600, 120), direct = new Canvas(1600, 120);
rec.play(r.words ? r.words() : r, viaPieces);
direct.text(line, 10, 60, 30, '#ffffff');
const lit = (cv) => { let n = 0; for (let k = 0; k < cv.d.length; k += 4) if (cv.d[k] > 128) n++; return n; };
assert.ok(lit(direct) > 1000, 'the line is drawn');
assert.ok(Math.abs(lit(viaPieces) - lit(direct)) <= lit(direct) * 0.02, 'pieces draw the same glyphs: ' + lit(viaPieces) + ' vs ' + lit(direct));

fs.rmSync(temp, { recursive: true, force: true });
console.log('PASS: spotify_ko builds without an SDK, menus and lines in Korean, names from Spotify untranslated, Hangul in its atlas');
