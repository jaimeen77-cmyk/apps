'use strict';

(function () {
    const $ = (id) => document.getElementById(id);
    // jaimeen77-cmyk/apps Korean edition: phones set to Korean see this page in
    // Korean; others keep the original English. Server messages stay English
    // on the wire (the checks below match them) and are translated for display.
    const nav = typeof navigator !== 'undefined' ? navigator : {};
    const KO = [].concat(nav.languages || [], nav.language || []).some((l) => /^ko(?:-|$)/i.test(String(l)));
    const WORDS = {
        'MGU Phone Terminal': 'MGU 폰 터미널', 'Phone Terminal': '폰 터미널',
        'Not connected': '연결 안 됨', 'Connected': '연결됨',
        'Root terminal.': '루트 터미널.',
        "Commands execute directly on the car's head unit. Work only while parked. Incorrect commands can disable the MGU. The session stays active until Disconnect, Revoke Access on iDrive, or a head unit restart.":
            '명령은 차량 헤드유닛에서 바로 실행됩니다. 반드시 주차 중에만 사용하세요. 잘못된 명령은 MGU를 멈추게 할 수 있습니다. 세션은 연결 끊기, iDrive의 접근 취소 또는 헤드유닛 재시작 전까지 유지됩니다.',
        'Connect your phone': '휴대폰 연결',
        'Start a new session in the Phone Terminal app on the car, then scan its QR code.': '차량의 폰 터미널 앱에서 새 세션을 시작한 다음 QR 코드를 스캔하세요.',
        'Terminal': '터미널', 'Non-interactive commands · max. 15 s each': '대화형이 아닌 명령 · 명령당 최대 15초',
        'Disconnect': '연결 끊기', 'IP addresses': 'IP 주소', 'Read-only commands': '읽기 전용 명령',
        'Shell command': '셸 명령', 'Clear command': '명령 지우기',
        'e.g. ls -la /var/opt/public/oap': '예: ls -la /var/opt/public/oap',
        'Commands execute as root.': '명령은 root 권한으로 실행됩니다.', 'Run command': '명령 실행',
        'Output': '출력', 'Copy output': '출력 복사', 'Ready.': '준비됨.', 'Clear output': '출력 지우기',
        'Download a file from the MGU': 'MGU에서 파일 내려받기',
        'Enter the absolute path of a file on the head unit. For a directory, create a .tgz archive in the terminal first. Maximum file size: 256 MiB.':
            '헤드유닛에 있는 파일의 절대 경로를 입력하세요. 폴더는 먼저 터미널에서 .tgz 압축 파일로 만드세요. 최대 파일 크기: 256 MiB.',
        'File path on the head unit': '헤드유닛의 파일 경로',
        'Prepare download': '내려받기 준비', 'CarPlay archive example': 'CarPlay 압축 파일 예시',
        'A download link is valid for 60 seconds and can be used once.': '내려받기 링크는 60초 동안 한 번만 쓸 수 있습니다.',
        'Save file on phone': '휴대폰에 파일 저장',
        'Local network only. No cloud account or SSH private key needed on the phone.': '로컬 네트워크 전용입니다. 휴대폰에 클라우드 계정이나 SSH 개인 키가 필요 없습니다.',
        'Active until Disconnect, Revoke Access or MGU restart.': '연결 끊기, 접근 취소 또는 MGU 재시작 전까지 유지됩니다.',
        'Invalid bridge response': '브리지 응답이 올바르지 않습니다', 'Request failed': '요청 실패',
        'This command may change or damage the head unit. Execute as root?': '이 명령은 헤드유닛을 바꾸거나 손상시킬 수 있습니다. root로 실행할까요?',
        'Executing…': '실행 중…', '[output limit reached]': '[출력 한도 도달]', '[15-second command timeout]': '[15초 명령 시간 초과]',
        'Automatic copy blocked. Output selected — use Copy in the browser.': '자동 복사가 막혔습니다. 출력을 선택해 두었으니 브라우저의 복사를 쓰세요.',
        'There is no output to copy.': '복사할 출력이 없습니다.', 'Complete output copied to clipboard.': '전체 출력을 클립보드에 복사했습니다.',
        'Output cleared.': '출력을 지웠습니다.', 'Enter the absolute path of the file.': '파일의 절대 경로를 입력하세요.',
        'Checking the file on the head unit…': '헤드유닛에서 파일을 확인하는 중…',
        'Download requested. Check your browser downloads or Files app. Prepare a new link to retry.': '내려받기를 요청했습니다. 브라우저 다운로드나 파일 앱을 확인하세요. 다시 받으려면 새 링크를 준비하세요.',
        'Disconnected. Start a new session on the car.': '연결을 끊었습니다. 차량에서 새 세션을 시작하세요.',
        'Access revoked or MGU restarted. Start a new session in the car.': '접근이 취소되었거나 MGU가 재시작되었습니다. 차량에서 새 세션을 시작하세요.',
        // bridge (server.js) messages
        'Another command is running': '다른 명령이 실행 중입니다', 'Command must be 1–1000 characters': '명령은 1–1000자여야 합니다',
        'Download link expired or already used. Prepare a new link.': '내려받기 링크가 만료되었거나 이미 사용되었습니다. 새 링크를 준비하세요.',
        'File is no longer available for download': '파일을 더 이상 내려받을 수 없습니다', 'Forbidden': '허용되지 않음',
        'Invalid request origin': '요청 출처가 올바르지 않습니다', 'Not found': '찾을 수 없음', 'Not paired': '페어링되지 않음',
        'Pairing code expired or incorrect': '페어링 코드가 만료되었거나 틀립니다',
        'Session ended. Pair again on iDrive.': '세션이 끝났습니다. iDrive에서 다시 페어링하세요.',
        'Session ended. Start a new session on iDrive.': '세션이 끝났습니다. iDrive에서 새 세션을 시작하세요.',
        'Too many pairing attempts': '페어링 시도가 너무 많습니다', 'Request too large': '요청이 너무 큽니다', 'Invalid JSON': 'JSON 형식 오류',
        'Enter a valid absolute file path': '올바른 절대 파일 경로를 입력하세요',
        'Only regular files can be downloaded; archive directories first': '일반 파일만 내려받을 수 있습니다. 폴더는 먼저 압축하세요',
        'File exceeds the 256 MiB download limit': '파일이 내려받기 한도 256 MiB를 넘습니다',
        'File not found, unreadable or a symbolic link': '파일이 없거나, 읽을 수 없거나, 심볼릭 링크입니다'
    };
    const L = (s) => (KO && Object.prototype.hasOwnProperty.call(WORDS, s) ? WORDS[s] : s);
    function translatePage() {
        if (!KO || !document.createTreeWalker || !document.body) return;
        if (document.documentElement) document.documentElement.lang = 'ko';
        document.title = L(document.title);
        const walker = document.createTreeWalker(document.body, 4 /* NodeFilter.SHOW_TEXT */);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
            const text = n.nodeValue, key = text.trim();
            if (key && L(key) !== key) n.nodeValue = text.replace(key, L(key));
        }
        document.querySelectorAll('[placeholder],[aria-label]').forEach((el) => {
            ['placeholder', 'aria-label'].forEach((name) => {
                const value = el.getAttribute(name);
                if (value && L(value) !== value) el.setAttribute(name, L(value));
            });
        });
    }
    translatePage();
    const state = $('state'), pairPanel = $('pair-panel'), terminal = $('terminal-panel');
    let busy = false, preparingFile = false;

    function showAuth(active) {
        pairPanel.classList.toggle('hidden', active);
        terminal.classList.toggle('hidden', !active);
        state.textContent = L(active ? 'Connected' : 'Not connected');
        state.classList.toggle('ok', active);
        $('expiry').textContent = active ? L('Active until Disconnect, Revoke Access or MGU restart.') : '';
        if (!active) $('save-file').classList.add('hidden');
    }
    async function api(endpoint, body) {
        const res = await fetch('/api/' + endpoint, {
            method: 'POST', credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', 'X-Terminal-Request': '1' },
            body: JSON.stringify(body || {})
        });
        let json;
        try { json = await res.json(); } catch (e) { throw new Error(L('Invalid bridge response')); }
        if (!res.ok) throw new Error(json.error || 'Request failed');
        return json;
    }
    async function startup() {
        const match = /^#pair=([0-9a-f]{64})$/.exec(window.location.hash);
        // The one-time code is in the fragment, never in the HTTP request URL or referrer.
        if (match) {
            history.replaceState(null, '', location.pathname);
            try {
                const result = await api('pair', { token: match[1] });
                showAuth(true);
                return;
            } catch (e) { $('pair-message').textContent = KO ? L(e.message) + '. 차량에서 새 세션을 시작하세요.' : e.message + '. Start a new session on the car.'; }
        }
        try {
            const res = await fetch('/api/status', { cache: 'no-store' });
            if (!res.ok) throw new Error('Not connected');
            const data = await res.json();
            showAuth(true);
        } catch (e) { showAuth(false); }
    }
    function dangerous(cmd) {
        return /\b(?:rm|dd|mkfs|fdisk|parted|mount|umount|chmod|chown|systemctl|reboot|shutdown|halt|poweroff|flash|killall|pkill)\b|\s[>]|\s*&&\s*|\s*;\s*/i.test(cmd);
    }
    async function run() {
        if (busy) return;
        const cmd = $('command').value.trim();
        if (!cmd) return;
        if (dangerous(cmd) && !confirm(L('This command may change or damage the head unit. Execute as root?'))) return;
        busy = true;
        $('run').disabled = true;
        $('hint').textContent = L('Executing…');
        $('output').textContent += '\n\nroot@mgu # ' + cmd + '\n';
        try {
            const result = await api('exec', { command: cmd });
            $('output').textContent += (result.stdout || '') + (result.stderr ? '\n[stderr]\n' + result.stderr : '');
            if (result.truncated) $('output').textContent += '\n' + L('[output limit reached]');
            if (result.timedOut) $('output').textContent += '\n' + L('[15-second command timeout]');
            $('output').textContent += (KO ? '\n[종료 코드 ' : '\n[exit ') + result.code + ', ' + result.elapsedMs + 'ms]';
        } catch (e) {
            $('output').textContent += (KO ? '\n[오류] ' : '\n[error] ') + L(e.message);
            if (/Session ended|Not paired/.test(e.message)) showAuth(false);
        } finally {
            busy = false; $('run').disabled = false;
            $('hint').textContent = L('Commands execute as root.');
            $('output').scrollTop = $('output').scrollHeight;
        }
    }
    $('run').addEventListener('click', run);
    $('command').addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); run(); }
    });
    document.querySelectorAll('[data-cmd]').forEach((button) => {
        button.addEventListener('click', () => { $('command').value = button.getAttribute('data-cmd'); });
    });
    $('clear-command').addEventListener('click', () => { $('command').value = ''; });
    // The MGU uses local HTTP. On iOS, navigator.clipboard may be unavailable
    // in that insecure context, so first try a synchronous user-gesture copy.
    function copyWithSelection(text) {
        const field = document.createElement('textarea');
        field.value = text;
        field.readOnly = true;
        field.style.position = 'fixed';
        field.style.top = '0';
        field.style.left = '0';
        field.style.opacity = '0';
        field.style.fontSize = '16px';
        document.body.appendChild(field);
        let copied = false;
        try {
            field.focus();
            field.select();
            field.setSelectionRange(0, text.length);
            copied = document.execCommand('copy');
        } catch (e) { /* Clipboard access may be blocked by the browser. */ }
        document.body.removeChild(field);
        return copied;
    }
    function manualOutputSelection() {
        const selection = window.getSelection && window.getSelection();
        if (selection && document.createRange) {
            const range = document.createRange();
            range.selectNodeContents($('output'));
            selection.removeAllRanges();
            selection.addRange(range);
        }
        $('copy-status').textContent = L('Automatic copy blocked. Output selected — use Copy in the browser.');
    }
    $('copy-output').addEventListener('click', () => {
        const outputText = $('output').textContent;
        if (!outputText) {
            $('copy-status').textContent = L('There is no output to copy.');
            return;
        }
        if (copyWithSelection(outputText)) {
            $('copy-status').textContent = L('Complete output copied to clipboard.');
        } else if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            navigator.clipboard.writeText(outputText).then(() => {
                $('copy-status').textContent = L('Complete output copied to clipboard.');
            }, manualOutputSelection);
        } else {
            manualOutputSelection();
        }
    });
    $('clear').addEventListener('click', () => { $('output').textContent = L('Output cleared.'); });
    $('example-file').addEventListener('click', () => { $('file-path').value = '/tmp/carplay-audio-analysis.tgz'; });
    $('prepare-file').addEventListener('click', async () => {
        if (preparingFile) return;
        const file = $('file-path').value.trim();
        if (!file) { $('file-message').textContent = L('Enter the absolute path of the file.'); return; }
        preparingFile = true;
        $('prepare-file').disabled = true;
        $('save-file').classList.add('hidden');
        $('file-message').textContent = L('Checking the file on the head unit…');
        try {
            const result = await api('download', { path: file });
            const size = result.size < 1024 ? result.size + (KO ? ' 바이트' : ' bytes') : (result.size / (1024 * 1024)).toFixed(2) + ' MiB';
            $('save-file').href = result.url;
            $('save-file').download = result.filename;
            $('save-file').textContent = KO ? result.filename + ' 저장' : 'Save ' + result.filename;
            $('save-file').classList.remove('hidden');
            $('file-message').textContent = KO ? '파일 준비됨 (' + size + '). ' + result.validSeconds + '초 안에 저장을 누르세요.'
                : 'File ready (' + size + '). Tap Save within ' + result.validSeconds + ' seconds.';
        } catch (error) {
            $('file-message').textContent = (KO ? '내려받기 오류: ' : 'Download error: ') + L(error.message);
            if (/Session ended|Not paired/.test(error.message)) showAuth(false);
        } finally {
            preparingFile = false;
            $('prepare-file').disabled = false;
        }
    });
    $('save-file').addEventListener('click', () => {
        $('file-message').textContent = L('Download requested. Check your browser downloads or Files app. Prepare a new link to retry.');
        $('save-file').classList.add('hidden');
    });
    $('disconnect').addEventListener('click', async () => {
        try {
            await api('logout');
            showAuth(false);
            $('pair-message').textContent = L('Disconnected. Start a new session on the car.');
        } catch (e) {
            $('copy-status').textContent = KO ? '접근을 취소하지 못했습니다: ' + L(e.message) + '. iDrive에서 접근 취소를 누르세요.'
                : 'Could not revoke access: ' + e.message + '. Use Revoke Access on iDrive.';
        }
    });
    // Detect server restart or iDrive revocation without imposing a timeout.
    // Ignore transient Wi-Fi dropouts instead of falsely claiming revocation.
    setInterval(async () => {
        if (terminal.classList.contains('hidden')) return;
        try {
            const res = await fetch('/api/status', { cache: 'no-store', credentials: 'same-origin' });
            if (res.status === 401) {
                showAuth(false);
                $('pair-message').textContent = L('Access revoked or MGU restarted. Start a new session in the car.');
            }
        } catch (e) { /* network temporarily unavailable; revoke on iDrive if needed */ }
    }, 10000);
    startup();
})();
