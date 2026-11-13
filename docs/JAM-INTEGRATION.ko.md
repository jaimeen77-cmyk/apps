# 기존 idrive7-apps 방식으로 함께 배포하기

Seats 한국어판도 같은 방식으로 지원합니다. `python tools/install-overlay.py ../idrive7-apps --apps seats_easy_access`로 합친 뒤 대상에서 `python kit/tools/make_kit.py seats_easy_access --language ko`를 실행하세요. [Seats 상세 안내](SEATS-OVERLAY.ko.md)

세 앱은 `apps/idrive_circuit`, `apps/cluster_redline`, `apps/storage`에 들어갑니다. Storage의 한국어 문구는 대상 저장소의 한국어 카탈로그(`kit/runtime/locales/ko.json`, `ko.tsv`)에 합쳐집니다.
원본 프로젝트에 한 번 합친 뒤에는 원래 빌드·설치 명령을 사용합니다.
영어가 기본이며 **`--language ko`로 한국어를 선택**합니다.

## 1. 기존 프로젝트에 소스 합치기

두 저장소를 나란히 두고 `idrive7-apps-jam` 폴더에서:

```powershell
python tools/install-overlay.py ../idrive7-apps
```

이 명령은 두 앱, 번역 추가분과 보조 도구를 복사하고, 기존 `kit/tools/build.py`와
`deploy/mgu-app-install.sh`가 앱별 자동 시작 정보를 유지하도록 보완합니다.
원본 구조를 확인할 수 없는 버전이면 복사 전에 중지합니다.
기존 파일 내용이 다르면 먼저 확인하고 `--force`로 갱신할 수 있습니다.
앱 하나만 합칠 때는 `--apps idrive_circuit`, `--apps cluster_redline` 또는 `--apps storage`를 추가합니다.

이후 명령은 **합쳐진 `idrive7-apps` 폴더**에서 실행합니다.

## 2. 기존 미리보기 명령

```powershell
python kit/tools/build.py --language ko --preview-only idrive_circuit cluster_redline storage
node kit/tools/preview.js dist/idrive_circuit preview/idrive_circuit frames=3
node kit/tools/preview.js dist/cluster_redline preview/cluster_redline-ui frames=3
node kit/tools/preview.js dist/storage preview/storage frames=3
```

계기판 중앙 위젯의 데모 화면은 다음 도구로 확인합니다.

```powershell
node tools/cluster-redline-preview.js
```

`preview/cluster_redline/index.html`을 여세요. 차량에는 연결하지 않습니다.
영어 미리보기는 `--language ko`를 생략하고 다시 빌드합니다.

## 3. 전체 앱을 한 키트로 빌드

본인 차량에서 추출한 `oap-sdk`가 기존 위치에 있어야 합니다.

Windows:

```powershell
deploy\make-car-kit.cmd --language ko
```

macOS/Linux:

```sh
deploy/make-car-kit.sh --language ko
```

앱 이름을 생략하면 `apps/`의 **기존 앱 전부와 새 두 앱**을 함께 넣습니다.
결과는 기존과 같은 `dist/mgu-custom-apps-ko.tar.gz`입니다.
세 앱만 선택하려면 명령 끝에 `idrive_circuit cluster_redline storage`를 추가합니다.
영어 전체 키트는 `--language ko`를 생략하며 `dist/mgu-custom-apps.tar.gz`로 생성됩니다.

## 4. 기존 방식으로 검사·설치

Windows PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File deploy\push-to-car.ps1 check -Kit dist\mgu-custom-apps-ko.tar.gz -Key <SSH키경로> -Ip <헤드유닛IP>
powershell -ExecutionPolicy Bypass -File deploy\push-to-car.ps1 install -Kit dist\mgu-custom-apps-ko.tar.gz -Key <SSH키경로> -Ip <헤드유닛IP>
```

macOS/Linux:

```sh
KIT=dist/mgu-custom-apps-ko HU=root@<헤드유닛IP> KEY=<SSH키경로> deploy/push-to-car.sh check
KIT=dist/mgu-custom-apps-ko HU=root@<헤드유닛IP> KEY=<SSH키경로> deploy/push-to-car.sh install
```

기존 백업·검사·복구 흐름을 사용합니다. 이 방식에는 별도 `mgu-deploy`가 필요하지 않습니다.
기존 배포 도구는 차량에서 거부된 앱을 건너뛰고, 받아들여진 다른 앱을 설치합니다.
계기판 레드라인은 `cluster-render 0.3.10+`가 필요하며, 설치된 버전이 없거나 낮으면
해당 앱을 검사에서 거부합니다. ID7 대상·신호 유효성은 실행 중에도 확인합니다.

## 설치 후

- Circuit: 기존처럼 앱 목록에서 직접 실행. 기본 주차 전용 설정 유지.
- Cluster Redline: 백그라운드 자동 시작, 기본 화면 표시 OFF, 스포츠 모드에서만 표시 요청.
- 앱 ID·설정 키는 유지하며 영어·한국어 패키지는 같은 앱의 언어별 빌드입니다.
