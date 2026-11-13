# 설치 안내 · MGU Store / iDrive 7

> **최신 설치·메뉴별 사용법은 [계기판 레드라인 설치·사용 설명서](CLUSTER-REDLINE.ko.md)를 보세요.** 제작: 잼님 · [GitHub](https://github.com/jaimeen77-cmyk/apps) · [네이버 블로그](https://blog.naver.com/jaimeen77)

[English](INSTALL.md) · [레드라인 사용 설명서](CLUSTER-REDLINE.ko.md) · [스크린샷](../screenshots/README.md)

이 저장소는 **계기판 레드라인**과 **아이드라이브 회로 1.0.0**을 한국어·영어로 배포합니다. 이 문서는 앱 설치 안내입니다. 헤드유닛 플래시·코딩 작업은 포함하지 않습니다.

## 준비

- MGU Store가 설치된 iDrive 7과 인터넷 연결
- 레드라인을 사용할 경우 **Cluster renderer (`cluster-render`) 0.4.0 이상**
- 설치를 마칠 때까지 주차 상태와 안정적인 차량 전원

Store의 일반 화면용 렌더러와 레드라인의 `cluster-render`는 별도 구성 요소입니다. Circuit만 사용할 때는 `cluster-render`가 필요하지 않습니다. 등록된 소스가 필요한 렌더러를 제공하면 Store가 의존성을 확인하며, 제공하지 않으면 해당 렌더러 소스를 먼저 등록해야 합니다.

MGU Store 자체 설치는 [개발자 안내](https://github.com/robertnisipeanu/mgu-store)를 따릅니다.

## MGU Store에서 설치

1. Store의 **Settings → 소스 추가(Add source)**를 엽니다.
2. 저장소에 `jaimeen77-cmyk/apps`, 브랜치에 `main`을 입력합니다.
3. **새로고침 / Check now**를 실행합니다. Offline이면 먼저 Settings에서 인터넷 연결을 확인합니다.
4. 아래 목록에서 원하는 언어의 앱을 선택하고 **Install**을 누릅니다.
5. 함께 표시되는 필수 도구의 설치 안내를 따릅니다. 재시작이 필요하다고 표시되면 설치가 끝난 뒤 안내에 따라 진행합니다.
6. 차량 앱 목록에서 앱을 엽니다.

| 표시 이름 | 설치 ID | 버전 |
|---|---|---|
| 계기판 레드라인 (한국어) | `cluster_redline` | 1.2.48 |
| Cluster Redline (English) | `cluster_redline_en` | 1.2.48 |
| 아이드라이브 회로 (한국어) | `idrive_circuit` | 1.0.0 |
| iDrive Circuit (English) | `idrive_circuit_en` | 1.0.0 |

스토어에서 언어가 표시된 목록을 선택하면 됩니다. PC에서 언어 옵션을 입력할 필요는 없습니다. Store는 저장소의 SDK 없는 UI·런타임과 현재 앱 코드를 조립하고, 필요한 차량 SDK는 기존 설치 절차에서 준비합니다.

## 레드라인 첫 설정

1. 앱 위쪽의 버전이 **v1.2.48** 이상인지 확인합니다.
2. **기본설정 → 차량 프리셋·단위·변속 알림 RPM**을 선택합니다.
3. **HUD 표시 설정 / CLUSTER 표시 설정**에서 원하는 모드의 RPM 출력을 **레드라인 앱**으로 선택합니다. 기본 HUD RPM은 순정입니다.
4. **앱 켜기**로 현재 출력을 시작합니다. 자동 실행을 원하면 **앱 자동 켜짐**도 켭니다.
5. 클러스터 출력은 BMW **계기판 → 중심 표시 영역**을 **지도 보기 또는 꺼짐**으로 설정해 확인합니다. Assist나 다른 앱의 화면 우선순위에 따라 가려질 수 있습니다.
6. NAV 설정을 확인한 뒤 휴대전화 길안내를 시작합니다. 방향·거리·문구는 차량에서 실제 수신한 지원 안내가 있을 때 표시합니다.

한국어판과 영어판은 별도 앱입니다. 두 판을 모두 설치했다면 사용하지 않는 판에서 **앱 끄기 + 앱 자동 켜짐 끄기**를 설정해 출력 경쟁을 피합니다.

## 업데이트·중지·삭제

- 같은 소스의 `main`을 새로고침한 뒤 **Installed → Update**를 실행합니다. 업데이트 후 버전을 다시 확인합니다.
- **앱 끄기**는 현재 표시 작업과 구독·연결을 종료합니다. 설정 화면은 다시 켤 수 있도록 유지됩니다.
- **앱 자동 켜짐**은 다음 앱 프로세스 시작 때의 동작을 정합니다. 업데이트·재시작 후에도 자동 시작을 원하지 않으면 이 항목을 끕니다.
- 삭제는 Store의 **Installed**에서 해당 앱을 선택해 진행합니다. 설정 보존 여부는 Store의 삭제 안내를 확인하세요.

1.2.0 첫 실행에서는 새 NAV 기본 위치·크기와 부가정보 좌우 설정을 한 번 적용합니다. 기존 클러스터의 50px 이동을 두 번 더하지 않으며, 이후 저장한 새 위치는 유지합니다. 다른 화면을 가리는 경우 표시 출력을 순정으로 바꾸거나 앱을 끌 수 있습니다.

## 설치·표시 문제 확인

| 증상 | 먼저 확인할 부분 |
|---|---|
| 앱 목록이 비어 있음 | 인터넷 연결, 저장소 철자, `main`, 소스 새로고침 |
| 업데이트 후 예전 화면 | 실제 앱의 상단 버전, 설치한 언어·ID, 다른 판의 실행 여부 |
| 클러스터/HUD에 RPM이 안 보임 | 앱 켜짐, 해당 모드의 출력 선택, 렌더러 버전, 실제 차량 신호 |
| Assist/다른 앱에 가림 | BMW 중심 표시 영역과 다른 앱의 출력 선택 |
| 전압·잔량·연비가 `--` | 선택한 값의 차량 지원·신선도. 지원되지 않는 값을 추정해 채우지 않습니다. |
| 길안내가 순정으로 전환됨 | 지원하는 최신 안내를 받지 못하면 순정에 양보합니다. 모든 지도 앱·버전의 안내 전달을 보장하지 않습니다. |
| install failed / interface 오류 | 오류 문구와 버전을 보관하고 [설치 오류 진단](REDLINE-INSTALL-FAILED.ko.md)을 참고하세요. |

계속되는 문제는 [로그 수집 안내](COLLECT-CLUSTER-REDLINE.ko.md)에 따라 로그와 설정 화면을 함께 확인합니다. 화면 예시는 모의 데이터로 실제 앱을 렌더링한 것이며 실차 촬영본이 아닙니다. 이번 버전의 차량별 설치·신호 수신·화면 복귀는 실차 확인이 필요합니다.

## 고급: PC에서 직접 빌드

소스 오버레이를 전체 원본에 합치는 과정은 [통합 안내](JAM-INTEGRATION.ko.md)를 참고합니다. 아래 명령은 **합쳐진 원본 프로젝트 폴더**에서, 본인 차량에서 추출한 SDK가 준비된 상태로 실행합니다.

```powershell
python kit/tools/make_kit.py --language ko cluster_redline
```

한국어 결과는 `dist/mgu-custom-apps-ko.tar.gz`입니다. 기본 영어는 `--language ko`를 생략하며 결과는 `dist/mgu-custom-apps.tar.gz`입니다. Circuit도 넣으려면 앱 ID를 뒤에 추가합니다.

```powershell
powershell.exe -ExecutionPolicy Bypass -File ".\deploy\push-to-car.ps1" check -Key "C:\keys\id_rsa" -Ip "헤드유닛IP" -Kit ".\dist\mgu-custom-apps-ko.tar.gz"
powershell.exe -ExecutionPolicy Bypass -File ".\deploy\push-to-car.ps1" install -Key "C:\keys\id_rsa" -Ip "헤드유닛IP" -Kit ".\dist\mgu-custom-apps-ko.tar.gz"
```

키와 IP를 본인 환경으로 바꾸고, 키트에 필요한 `cluster-render`도 별도로 준비합니다. 생성된 PC 패키지는 SDK를 포함할 수 있으므로 공개하지 않습니다.
