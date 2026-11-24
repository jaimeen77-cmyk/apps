# 폰 터미널 (한국어판) — MGU/iDrive 7

[English](README.md)

윈도우 노트북을 ENET/OBD로 연결하지 않고, 휴대폰 브라우저로 이미 루팅된 헤드유닛에서 셸 명령을
잠깐 실행합니다. 원본은 [NamelsMissing/mgu-apps](https://github.com/NamelsMissing/mgu-apps)의
Phone Terminal(GPL-3.0)이고, 이 판은 차량 화면과 휴대폰 페이지를 한국어로 옮긴 수정본입니다.
라이선스는 [NOTICE](NOTICE)와 [저장소 안내](../../NOTICE.gif-home-phone-terminal.md)를 보세요.

## 설치

MGU Store에 소스 **`jaimeen77-cmyk/apps`**, 브랜치 **`main`**을 추가하고 **폰 터미널 (한국어)**
(0.1.7)을 설치합니다. 필요한 도구 **Phone Terminal Bridge**(`mgu-phone-bridge` **0.1.7**)가 함께
설치되거나 업데이트됩니다. 이 도구는 일반 앱이 아니라 root로 실행되는 systemd 서비스입니다.
SSH 개인 키는 쓰지 않고 MGU 안에서 명령을 실행합니다.

- 브리지 0.1.7은 이 저장소에서 고친 판입니다. 한국어판 앱 id(`mgu_phone_terminal_ko`)를 먼저 찾고,
  없으면 원본 `mgu_phone_terminal`을 씁니다. **두 판을 함께 설치하지 마세요.** 둘 다 있으면 한국어판만
  동작합니다. 원본 0.1.6 브리지로는 한국어판이 키를 찾지 못합니다("브리지는 실행 중이지만 앱 등록/키가
  준비되지 않았습니다").
- 휴대폰 언어가 한국어면 휴대폰 페이지가 한국어로, 그 밖에는 영어로 나옵니다.

차량에서 **폰 터미널**을 열고 **새 세션**을 누른 뒤 휴대폰 카메라로 QR 코드를 스캔합니다. 로컬 웹 페이지가
열리면 명령을 보내고 stdout/stderr를 볼 수 있습니다. 다 쓰면 iDrive의 **접근 취소**나 웹 페이지의
**연결 끊기**를 누르세요.

- **명령 지우기**는 입력칸만 지우고 출력은 그대로 둡니다.
- **출력 복사**는 스크롤 밖 내용까지 전체 출력을 휴대폰 클립보드에 복사합니다. 브라우저가 막으면
  출력을 선택해 두니 브라우저의 복사를 쓰세요.

### 휴대폰으로 파일 내려받기

1. 터미널에서 헤드유닛의 파일을 만들거나 찾습니다. 예: `/tmp/carplay-audio-analysis.tgz`
2. 휴대폰 페이지의 **MGU에서 파일 내려받기**에 절대 경로를 넣고 **내려받기 준비**를 누릅니다.
3. 나타난 **(파일 이름) 저장**을 누릅니다. iPhone에서는 브라우저 다운로드나 파일 앱에서 찾습니다.

링크는 로그인된 세션에서 한 번만, 60초 동안 쓸 수 있고 연결 끊기/접근 취소로 무효가 됩니다. 일반 파일
256 MiB까지이며, 폴더는 먼저 터미널에서 `.tgz`로 묶으세요. 내려받은 파일은 MGU에서 지워지지 않습니다.

## 보안

- 차량 안 제어 포트는 `127.0.0.1:18891`이고 앱 데이터 폴더의 0600 키로 인증합니다.
- 휴대폰용 HTTP는 포트 `18890`이며 앱이 새 QR 토큰을 만들 때까지 잠겨 있습니다. QR은 한 번만 쓰이고
  3분 뒤 만료됩니다. 연결된 루트 터미널에는 시간 제한이 없습니다. 휴대폰의 **연결 끊기**, iDrive의
  **접근 취소**, MGU/브리지 재시작 전까지 유지됩니다.
- 브리지는 연결 중이거나 세션이 있을 때만 `wlan_bridge`의 TCP `18890`에 표시가 붙은 `nftables` 허용 규칙
  하나를 엽니다. 취소하거나 서비스가 멈추면 규칙을 지웁니다. 규칙이 준비되기 전에는 QR을 보이지 않습니다.
- QR의 토큰은 URL 조각(#)이라 HTTP 요청에 실리지 않고, 로그인하면 HttpOnly·SameSite=Strict 쿠키로 바뀝니다.
- 대화형이 아닌 명령 하나만 동시에 실행되며 15초 또는 출력 60 KB에서 끊깁니다.
- **포트 18890을 인터넷에 노출하지 마세요.** HTTPS가 아닌 로컬 HTTP입니다.
- **주차 중에만 쓰세요.** 잘못된 root 명령은 헤드유닛을 망가뜨릴 수 있습니다. 속도 제한은 없습니다.

## 알려진 제한

- SSH/PTY가 아니므로 `vi`, 대화형 `top` 같은 명령은 쓸 수 없습니다.
- 브리지는 `/var/opt/public/oap/oap_12201/data/apps/<앱 id>.json`에서 앱 데이터를 찾습니다. 다른
  펌웨어 구조에서는 고쳐야 할 수 있습니다.
- 한국어판은 아직 차량에서 확인하지 않았습니다.

## 빌드 (관리자용)

한국어 템플릿: `python tools/prepare-upstream-apps.py --kit-root <appsKOR 체크아웃> --kit-commit <커밋> mgu_phone_terminal`.
검사: `node tests/gif-home-phone-terminal-ko.test.js`(PowerShell)와 원본 검사 `tests/phone_terminal_*.test.js`
(`phone_terminal_bridge`, `phone_terminal_firewall`은 리눅스 파일 권한을 확인하므로 Windows에서는 실패합니다).

QR 생성은 `qrcode-generator`(MIT)를 씁니다. `QR-LICENSE`를 보세요.
