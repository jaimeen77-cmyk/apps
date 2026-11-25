'use strict';

function phone() {
    // jaimeen77-cmyk/apps Korean edition: phones set to Korean see this page in
    // Korean; others keep the original English. The app's own messages stay
    // English on the wire (and in its diagnostic log) and are translated here.
    var nav = typeof navigator !== 'undefined' ? navigator : {};
    var KO = [].concat(nav.languages || [], nav.language || []).some(function (l) { return /^ko(?:-|$)/i.test(String(l)); });
    var WORDS = {
        'GIF Home': 'GIF 플레이어', 'Connecting to MGU…': 'MGU에 연결하는 중…', 'Playing': '재생 중',
        'GIF library': 'GIF 라이브러리', 'Choose GIFs': 'GIF 고르기', 'Upload': '업로드',
        'Delete marked uploads': '표시한 업로드 삭제', 'Groups': '그룹', 'Create group': '그룹 만들기',
        'Playback': '재생', 'Connection': '연결', 'Extend session': '세션 연장',
        'Download diagnostic log': '진단 로그 내려받기',
        'The MGU did not respond. Check Phone Connection.': 'MGU가 응답하지 않습니다. 휴대폰 연결을 확인하세요.',
        'Waiting for MGU confirmation…': 'MGU 확인을 기다리는 중…', 'Confirmed by MGU': 'MGU가 확인함',
        'New name': '새 이름', 'Built-in animation': '기본 애니메이션',
        'Mark for bulk actions': '일괄 작업용 표시', 'Selected for playback': '재생 목록에 선택',
        'Preview': '미리보기', 'Play on Home': '홈에서 재생', 'Rename': '이름 바꾸기', 'Delete': '삭제',
        'Empty group': '빈 그룹', 'Add marked': '표시한 GIF 추가', 'Remove marked': '표시한 GIF 빼기',
        'Play group': '그룹 재생', 'Delete group': '그룹 삭제',
        'Delete this group? Its GIFs will stay in the library.': '이 그룹을 삭제할까요? 그룹의 GIF는 라이브러리에 남습니다.',
        'Mode': '모드', 'Single GIF': 'GIF 하나', 'Random – Selected GIFs': '무작위 – 선택한 GIF',
        'Random – Group': '무작위 – 그룹', 'Sequential': '차례대로', 'Random – All': '무작위 – 전체',
        'Group': '그룹', 'Choose group': '그룹 선택', 'One full GIF pass': 'GIF 한 바퀴 재생', 'Custom…': '직접 입력…',
        'Switch after': '전환 간격', 'Seconds (1–3600)': '초 (1–3600)', 'Resume': '다시 재생', 'Pause': '일시정지',
        'Next GIF': '다음 GIF', 'Selected order': '선택한 순서', 'Move up': '위로', 'No GIF': 'GIF 없음',
        'Group name': '그룹 이름', 'Choose one or more GIFs.': 'GIF를 하나 이상 고르세요.',
        'Connected to MGU': 'MGU에 연결됨', 'MGU online': 'MGU 온라인',
        // built-in animations (main.js PRESETS)
        'Animated BMW logo': '움직이는 BMW 로고', 'Pixel drift: Night City': '픽셀 드리프트: 나이트 시티',
        'Pixel drive: Sunset': '픽셀 드라이브: 노을', 'Pixel art: Neon Garage': '픽셀 아트: 네온 차고',
        'Pixel art: Midnight Run': '픽셀 아트: 미드나잇 런',
        // the app's messages (main.js, upload.js, library.js, gif.js)
        'No decodable GIF': '재생할 수 있는 GIF 없음',
        'Selection unavailable. Playing the built-in fallback.': '선택한 항목을 재생할 수 없어 기본 애니메이션을 재생합니다.',
        'GIF Home network helper unavailable': 'GIF Home 네트워크 도우미를 쓸 수 없습니다',
        'Another request is being processed': '다른 요청을 처리하는 중입니다', 'Request too large': '요청이 너무 큽니다',
        'Request timed out': '요청 시간이 초과되었습니다', 'Invalid URL': '잘못된 URL',
        'Invalid or expired QR session. Scan a new code.': 'QR 세션이 잘못되었거나 만료되었습니다. 새 코드를 스캔하세요.',
        'Selected local network only': '선택한 로컬 네트워크에서만 쓸 수 있습니다',
        'Application request header required': '앱 요청 헤더가 필요합니다',
        'Too many GIF previews in progress': '진행 중인 GIF 미리보기가 너무 많습니다',
        'Unsupported request content type': '지원하지 않는 요청 형식입니다',
        'Session expired during request': '요청 중에 세션이 만료되었습니다', 'Page not found': '페이지를 찾을 수 없습니다',
        'A name is required': '이름이 필요합니다', 'Unknown GIF': '알 수 없는 GIF', 'GIF file size changed': 'GIF 파일 크기가 바뀌었습니다',
        'Invalid library or playback settings': '라이브러리 또는 재생 설정이 올바르지 않습니다',
        'Library limit reached (64 GIFs or 96 MiB)': '라이브러리 한도에 도달했습니다 (GIF 64개 또는 96 MiB)',
        'Invalid action': '잘못된 작업', 'Library changed. Refresh and retry.': '라이브러리가 바뀌었습니다. 새로 고친 뒤 다시 시도하세요.',
        'Confirm deletion of uploaded GIFs': '업로드한 GIF 삭제를 확인하세요', 'Unknown group': '알 수 없는 그룹',
        'Confirm group deletion': '그룹 삭제를 확인하세요', 'Invalid group membership': '그룹 구성원이 올바르지 않습니다',
        'Unknown action': '알 수 없는 작업',
        'Library storage or metadata unreadable. Existing data preserved. Restore library.json before editing.':
            '라이브러리 저장소나 메타데이터를 읽을 수 없습니다. 기존 데이터는 보존됩니다. 편집하기 전에 library.json을 복구하세요.',
        'GIF is too large (max 6 MB)': 'GIF가 너무 큽니다 (최대 6 MB)', 'Not a GIF87a/GIF89a file': 'GIF87a/GIF89a 파일이 아닙니다',
        'GIF dimensions must be at most 640x360': 'GIF 크기는 최대 640x360이어야 합니다',
        'GIF has too many frames for the MGU': 'GIF 프레임이 MGU에서 쓰기에 너무 많습니다', 'GIF contains no image': 'GIF에 그림이 없습니다'
    };
    function L(s) {
        if (!KO || typeof s !== 'string') return s;
        if (Object.prototype.hasOwnProperty.call(WORDS, s)) return WORDS[s];
        var m = /^Upload rejected: (.*)$/.exec(s);
        if (m) return '업로드 거부: ' + L(m[1]);
        m = /^Storage operation failed \((.*)\)$/.exec(s);
        if (m) return '저장 작업 실패 (' + m[1] + ')';
        // the decoder's other format errors (gif.js): a damaged or unusual GIF
        if (/^(Truncated|Corrupt|Invalid|Missing|Unexpected) GIF|GIF image has excess pixels/.test(s)) return '손상되었거나 지원하지 않는 GIF입니다 (' + s + ')';
        return s;
    }
    var fname = function (f) { return f.bytes ? f.name : L(f.name); };
    function translatePage() {
        if (!KO || !document.createTreeWalker || !document.body) return;
        if (document.documentElement) document.documentElement.lang = 'ko';
        document.title = L(document.title);
        var walker = document.createTreeWalker(document.body, 4 /* NodeFilter.SHOW_TEXT */);
        for (var n = walker.nextNode(); n; n = walker.nextNode()) {
            var key = n.nodeValue.trim();
            if (key && L(key) !== key) n.nodeValue = n.nodeValue.replace(key, L(key));
        }
        Array.prototype.forEach.call(document.querySelectorAll('[aria-label]'), function (el) {
            el.setAttribute('aria-label', L(el.getAttribute('aria-label')));
        });
    }
    translatePage();
    var token = new URLSearchParams(location.search).get('t');
    var state, busy = false, marked = [], preview = null;
    var byId = function (id) { return document.getElementById(id); };
    var endpoint = function (path) { return path + '?t=' + encodeURIComponent(token); };
    var status = byId('status');
    byId('export').href = endpoint('/diagnostics');

    function get(path, method, body, type) {
        return new Promise(function (resolve, reject) {
            var x = new XMLHttpRequest();
            x.open(method || 'GET', path);
            x.timeout = 35000;
            if (method === 'POST') {
                x.setRequestHeader('X-GIF-Home', '1');
                x.setRequestHeader('Content-Type', type || 'application/json');
            }
            x.onload = function () {
                try {
                    var data = JSON.parse(x.responseText);
                    if (x.status !== 200) throw new Error(L(data.error) || 'HTTP ' + x.status);
                    resolve(data);
                } catch (e) { reject(e); }
            };
            x.onerror = x.ontimeout = function () { reject(new Error(L('The MGU did not respond. Check Phone Connection.'))); };
            x.send(body || null);
        });
    }
    function run(fn) {
        if (busy || !state) return;
        busy = true;
        byId('controls').disabled = true;
        status.textContent = L('Waiting for MGU confirmation…');
        Promise.resolve().then(fn).then(function (data) {
            receive(data);
            status.textContent = L('Confirmed by MGU');
        }).catch(function (e) { status.textContent = e.message; render(); }).then(function () {
            busy = false;
            byId('controls').disabled = false;
        });
    }
    function action(type, values) {
        run(function () {
            return get(endpoint('/action'), 'POST', JSON.stringify(Object.assign({
                type: type, revision: state.revision
            }, values)));
        });
    }
    function node(tag, parent, text) {
        var item = document.createElement(tag);
        if (text) item.textContent = text;
        parent.appendChild(item);
        return item;
    }
    function button(parent, text, fn) {
        var b = node('button', parent, text);
        b.type = 'button';
        b.onclick = fn;
        return b;
    }
    function select(parent, text, items, value, fn) {
        var label = node('label', parent, text);
        var input = node('select', label);
        items.forEach(function (item) {
            var opt = node('option', input, item[1]);
            opt.value = item[0];
        });
        input.value = value;
        input.onchange = function () { fn(input.value); };
    }
    function checkbox(parent, text, checked, fn) {
        var label = node('label', parent);
        var input = node('input', label);
        input.type = 'checkbox';
        input.checked = checked;
        label.appendChild(document.createTextNode(text));
        input.onchange = function () { fn(input.checked); };
    }
    function rename(type, item) {
        var value = prompt(L('New name'), item.name);
        if (value) action(type, { id: item.id, name: value });
    }
    function remove(ids) {
        if (ids.length && confirm(KO ? '업로드한 GIF ' + ids.length + '개를 삭제할까요?' : 'Delete ' + ids.length + ' uploaded GIF(s)?'))
            action('delete', { ids: ids, confirm: true });
    }
    function render() {
        var p = state.playback;
        var library = byId('library'), groups = byId('groups'), playback = byId('playback');
        var files = state.files.concat(state.presets);
        marked = marked.filter(function (id) { return files.some(function (f) { return f.id === id; }); });
        library.textContent = groups.textContent = playback.textContent = '';
        files.forEach(function (f) {
            var card = node('article', library);
            node('h3', card, fname(f));
            node('p', card, f.bytes ? (f.bytes / 1024).toFixed(1) + ' KiB · ' + f.width + ' × ' +
                f.height + ' · ' + f.frames + (KO ? '프레임 · ' : ' frames · ') + (f.duration / 1000).toFixed(2) + ' s' : L('Built-in animation'));
            checkbox(card, L('Mark for bulk actions'), marked.indexOf(f.id) >= 0, function (on) {
                marked = marked.filter(function (id) { return id !== f.id; });
                if (on) marked.push(f.id);
            });
            checkbox(card, L('Selected for playback'), p.selected.indexOf(f.id) >= 0, function (on) {
                var ids = p.selected.filter(function (id) { return id !== f.id; });
                if (on) ids.push(f.id);
                action('playback', { selected: ids });
            });
            button(card, L('Preview'), function () {
                if (preview) preview.remove();
                preview = node('img', card);
                preview.alt = KO ? fname(f) + ' 미리보기' : 'Preview of ' + f.name;
                preview.src = endpoint('/preview') + '&id=' + encodeURIComponent(f.id);
            });
            button(card, L('Play on Home'), function () { action('activate', { id: f.id }); });
            if (f.bytes) {
                button(card, L('Rename'), function () { rename('rename', f); });
                button(card, L('Delete'), function () { remove([f.id]); });
            }
        });
        state.groups.forEach(function (g) {
            var card = node('article', groups);
            node('h3', card, g.name);
            node('p', card, files.filter(function (f) { return g.ids.indexOf(f.id) >= 0; })
                .map(fname).join(', ') || L('Empty group'));
            button(card, L('Add marked'), function () { if (marked.length) action('members', { id: g.id, ids: marked, add: true }); });
            button(card, L('Remove marked'), function () { if (marked.length) action('members', { id: g.id, ids: marked, add: false }); });
            button(card, L('Play group'), function () { action('playback', { mode: 'group', group: g.id }); });
            button(card, L('Rename'), function () { rename('renameGroup', g); });
            button(card, L('Delete group'), function () {
                if (confirm(L('Delete this group? Its GIFs will stay in the library.')))
                    action('deleteGroup', { id: g.id, confirm: true });
            });
        });
        select(playback, L('Mode'), [
            ['single', L('Single GIF')], ['selected', L('Random – Selected GIFs')], ['group', L('Random – Group')],
            ['sequential', L('Sequential')], ['all', L('Random – All')]
        ], p.mode, function (v) { action('playback', { mode: v }); });
        select(playback, L('Single GIF'), files.map(function (f) { return [f.id, fname(f)]; }), p.single,
            function (v) { action('playback', { single: v }); });
        select(playback, L('Group'), [['', L('Choose group')]].concat(state.groups.map(function (g) {
            return [g.id, g.name];
        })), p.group || '', function (v) { action('playback', { group: v || null }); });
        var intervals = [0, 5, 10, 15, 30];
        var intervalLabel = intervals.map(function (v) { return [v, v ? v + (KO ? '초' : ' seconds') : L('One full GIF pass')]; });
        intervalLabel.push(['custom', L('Custom…')]);
        if (intervals.indexOf(p.seconds) < 0) intervalLabel.push([p.seconds, p.seconds + (KO ? '초' : ' seconds')]);
        select(playback, L('Switch after'), intervalLabel, String(p.seconds), function (v) {
            if (v === 'custom') v = prompt(L('Seconds (1–3600)'), p.seconds || 20);
            if (v !== null && v !== '' && /^\d+$/.test(v)) action('playback', { seconds: Number(v) });
        });
        button(playback, L(p.paused ? 'Resume' : 'Pause'), function () { action('playback', { paused: !p.paused }); });
        button(playback, L('Next GIF'), function () { action('next'); });
        node('h3', playback, L('Selected order'));
        var ordered = node('ol', playback);
        p.selected.forEach(function (id, i) {
            var f = files.filter(function (item) { return item.id === id; })[0];
            var row = node('li', ordered, fname(f) + ' ');
            if (i > 0) button(row, L('Move up'), function () {
                var ids = p.selected.slice();
                ids[i] = ids[i - 1]; ids[i - 1] = id;
                action('playback', { selected: ids });
            });
        });
    }
    function receive(data) {
        var rebuild = !state || state.revision !== data.revision;
        state = data;
        byId('active').textContent = (state.presets.some(function (f) { return f.id === state.active; }) ? L(state.activeName) : state.activeName) || L('No GIF');
        byId('expiry').textContent = state.expires ? (KO ? '세션 종료 시각 ' : 'Session ends at ') + new Date(state.expires).toLocaleTimeString() : '';
        byId('issue').textContent = L(state.error || state.playbackNotice || '');
        if (rebuild) render();
    }
    byId('delete').onclick = function () {
        remove(marked.filter(function (id) { return state.files.some(function (f) { return f.id === id; }); }));
    };
    byId('group').onclick = function () {
        var value = prompt(L('Group name'));
        if (value) action('createGroup', { name: value });
    };
    byId('renew').onclick = function () {
        run(function () { return get(endpoint('/renew'), 'POST', '{}'); });
    };
    byId('upload').onclick = function () {
        var input = byId('files'), files = Array.prototype.slice.call(input.files);
        if (!files.length) { status.textContent = L('Choose one or more GIFs.'); return; }
        run(function () {
            var errors = [], count = 0;
            return files.reduce(function (chain, file) {
                return chain.then(function () {
                    return get(endpoint('/upload') + '&name=' + encodeURIComponent(file.name), 'POST', file, 'image/gif')
                        .then(function (data) { receive(data); count++; })
                        .catch(function (e) { errors.push(file.name + ' · ' + e.message); });
                });
            }, Promise.resolve()).then(function () {
                input.value = '';
                if (errors.length) throw new Error(count + (KO ? '개 저장됨. ' : ' stored. ') + errors.join(' / '));
                return state;
            });
        });
    };
    function poll() {
        if (busy || document.hidden) return;
        var previous = state;
        get(endpoint('/state')).then(function (data) {
            if (busy || previous !== state) return;
            receive(data);
            if (!previous) status.textContent = L('Connected to MGU');
            byId('connection').textContent = L('MGU online');
            byId('controls').disabled = false;
        }).catch(function (e) {
            if (!busy) byId('connection').textContent = e.message;
        });
    }
    poll();
    setInterval(poll, 3000);
}
const page = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>GIF Home</title><style>
*{box-sizing:border-box}body{margin:0;background:#101827;color:#eef4ff;font:16px system-ui,-apple-system,sans-serif}
main{max-width:850px;margin:auto;padding:20px}h1{margin:0}h2{margin-top:28px}h3,p{margin:0 0 10px;overflow-wrap:anywhere}
a{color:#9dccff}button,input,select{font:inherit}button,select{margin:4px 5px 4px 0;padding:9px 12px;min-height:44px;
border:1px solid #607a9f;border-radius:8px;background:#233a57;color:#fff}button:disabled{opacity:.55}
label{display:block;padding:4px 0}label select{display:block;max-width:100%}input[type=checkbox]{margin-right:8px}
article{background:#1a293e;border-radius:12px;padding:14px;margin:10px 0}img{display:block;max-width:100%;max-height:240px;margin-top:6px}
fieldset{padding:0;border:0;min-width:0}#issue,#status,#connection{overflow-wrap:anywhere;color:#b8d2f8}
@media(min-width:650px){#library,#groups{display:grid;grid-template-columns:1fr 1fr;gap:10px}}
</style></head><body><main><h1>GIF Home</h1><p id="connection">Connecting to MGU…</p>
<p>Playing <strong id="active"></strong></p><p id="issue"></p><p id="status" role="status"></p>
<fieldset id="controls" disabled><section><h2>GIF library</h2>
<input id="files" type="file" accept="image/gif,.gif" multiple aria-label="Choose GIFs">
<button type="button" id="upload">Upload</button><button type="button" id="delete">Delete marked uploads</button>
<div id="library"></div></section><section><h2>Groups</h2>
<button type="button" id="group">Create group</button><div id="groups"></div></section>
<section><h2>Playback</h2><div id="playback"></div></section>
<section><h2>Connection</h2><button type="button" id="renew">Extend session</button>
<p id="expiry"></p><a id="export">Download diagnostic log</a></section></fieldset></main>
<script>(${phone.toString()})();</script></body></html>`;
module.exports = { page };
