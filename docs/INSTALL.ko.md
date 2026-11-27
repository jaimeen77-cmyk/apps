# 설치 안내 · MGU Store

[English](INSTALL.md) · [앱 소개](../README.ko.md)

이 저장소의 앱은 모두 차량의 **MGU Store**에서 설치합니다. PC나 USB는 필요 없습니다.
Store가 설치할 때 그 차의 BMW SDK를 넣어 차에서 직접 빌드합니다.

## 1. 준비

- MGU Store가 설치된 헤드유닛(iDrive 7 또는 iDrive 8)과 인터넷 연결
  - MGU Store 자체 설치는 [MGU Store 안내](https://github.com/robertnisipeanu/mgu-store)를 따릅니다.
- 설치가 끝날 때까지 주차 상태와 안정적인 차량 전원(시동 또는 충전기)

## 2. 소스 등록

MGU Store에서 **Settings → Add source(소스 추가)**를 열고 아래 소스를 등록합니다. 브랜치는 모두 **`main`**입니다(Releases가 아닙니다).

| 소스 | 꼭 필요한가 | 제공하는 것 |
|---|---|---|
| **`jaimeen77-cmyk/apps`** | 예 | 이 저장소의 앱: 계기판 레드라인, MGU 모니터, 아이드라이브 회로, 시트 Easy Access, 8게임즈, GIF 플레이어 |
| **`jaimeen77-cmyk/appsKOR`** | 8게임즈·GIF 플레이어를 쓸 때 | GPU 렌더러(`idrive7-renderd`), iDrive 컨트롤러 연결(`mgu-inputgate`), 한국어 앱 15개 |
| Store 기본 소스(`robertnisipeanu/idrive-apps`) | 계기판 레드라인을 쓸 때 | 계기판 렌더러(`cluster-render`), `mgu-deploy` |
| `IterioDev/car-apps` | 시트 Easy Access를 쓸 때 | Comfort(`iteriodev-comfort`) |

등록한 뒤 **Check now(새로고침)**를 누릅니다. Offline으로 나오면 인터넷 연결부터 확인하세요.

## 3. 앱 설치

목록에서 앱을 고르고 **Install**을 누릅니다. 필요한 도구가 없거나 오래되었으면 Store가 앱보다 먼저 설치합니다.
도구를 제공하는 소스가 등록되어 있지 않으면 Store가 설치를 막고 그 이유를 보여 줍니다.

| Store 목록 이름 | 버전 | iDrive 7 | iDrive 8 | 함께 설치되는 도구 |
|---|---|:-:|:-:|---|
| 계기판 레드라인 (한국어) / Cluster Redline (English) | 1.3.89 | ✅ | ✅ | `cluster-render` 0.4.0+, `redline-lead` 0.3.0(이 소스, 앞차·차선 도우미), `mgu-deploy` 0.7.17+ |
| MGU 모니터 (한국어) / MGU Monitor (English) | 1.1.10 | ✅ | ✅ | `mgu-monitor-names` 0.1.0(이 소스), `mgu-deploy` |
| 아이드라이브 회로 (한국어) / iDrive Circuit (English) | 1.0.5 | ✅ | ✅ | `mgu-deploy` |
| 시트 Easy Access (한국어) / Seats Easy Access (English) | 0.7.10 | ✅ | ✅ | `iteriodev-comfort` 0.6.1+, `mgu-deploy` 0.7.11+ |
| 8게임즈 | 0.2.4 | ✅ | — | `idrive7-renderd`, `mgu-inputgate`, `mgu-deploy` |
| GIF 플레이어 (한국어) | 0.4.8 | ✅ | — | `idrive7-renderd`, `mgu-inputgate`, `mgu-gif-net` 0.1.0(이 소스), `mgu-deploy` |

- 8게임즈와 GIF 플레이어는 원본 앱과 같이 **iDrive 7 전용**입니다. iDrive 8에서는 Store가 설치를 거부합니다.
- iDrive 8 설치는 지원하지만, iDrive 8 차량에서의 동작은 아직 모든 앱에서 확인하지 않았습니다.
- 한국어판과 English판은 서로 다른 앱입니다. 같은 앱의 두 판을 함께 쓰지 마세요. 둘 다 설치했다면 쓰지 않는 쪽은 끄거나 삭제합니다.
- 설치가 끝나고 재시작 안내가 나오면 그대로 따릅니다(보조 도구가 다음 HMI 시작부터 적용되는 경우).

## 4. 처음 실행

설치한 앱은 차의 앱 목록에서 엽니다. 앱마다 처음 할 일은 설명서에 있습니다.

| 앱 | 설명서 |
|---|---|
| 계기판 레드라인 | [설명서](CLUSTER-REDLINE.ko.md) — 기본설정 → 앱 실행 → **앱 켜기** |
| MGU 모니터 | [설명서](../apps/storage/README.ko.md) — 홈 화면에 위젯 놓기 |
| 아이드라이브 회로 | [설명서](../apps/idrive_circuit/README.ko.md) |
| 8게임즈 | [설명서](../apps/parked_games/README.ko.md) |
| GIF 플레이어 | [설명서](../apps/gif_home/README.ko.md) — 휴대폰 연결로 GIF 올리기 |
| 시트 Easy Access | [설명서](../apps/seats_easy_access/README.ko.md) |

### 홈 화면에 위젯 놓기 (MGU 모니터, GIF 플레이어)

1. iDrive **HOME** 화면에서 컨트롤러를 **위로** 밀어 위쪽 메뉴를 엽니다.
2. **메인 메뉴 편집(Customize main menu)**을 고릅니다.
3. 놓을 칸을 고르고 목록에서 **MGU 모니터** 또는 **GIF 플레이어**를 추가합니다.
4. **큰 타일**을 고르면 그래프나 GIF가 그려진 큰 위젯이, 좁은 타일을 고르면 글자만 있는 작은 위젯이 나옵니다.
5. 저장합니다.

## 5. 업데이트

1. MGU Store에서 소스를 **Check now(새로고침)**합니다.
2. **Installed**에서 업데이트가 있는 앱의 **Update**를 누릅니다.
3. 앱을 열어 오른쪽 위 버전을 확인합니다.

설정은 업데이트해도 유지됩니다.

## 6. 삭제

MGU Store → **Installed** → 앱 → 삭제. 보조 도구(렌더러 등)는 다른 앱도 쓰므로 필요 없을 때만 따로 삭제합니다.

## 7. 문제 해결

| 증상 | 확인할 것 |
|---|---|
| 목록에 앱이 없음 | 소스 철자 `jaimeen77-cmyk/apps`, 브랜치 `main`, Check now, 인터넷 연결 |
| 필요한 도구 때문에 설치가 막힘 | 그 도구를 제공하는 소스(위 2번 표)가 등록되어 있는지 |
| iDrive 8에서 "is for iDrive 7" | 8게임즈·GIF 플레이어는 iDrive 7 전용입니다 |
| 업데이트했는데 예전 그대로 | 앱 오른쪽 위 버전, 같은 앱의 다른 언어판이 켜져 있지 않은지 |
| GIF 플레이어·8게임즈가 느리고 터치가 안 됨 | GPU 렌더러(`idrive7-renderd`)가 설치되어 있는지, appsKOR 소스가 등록되어 있는지 |
| 계기판 레드라인이 계기판에 안 나옴 | [레드라인 설명서의 문제 해결](CLUSTER-REDLINE.ko.md#문제-해결) |

모든 앱은 차량 신호를 **읽기만** 합니다(시트 Easy Access는 시트 이동, 계기판 레드라인은 계기판·HUD 그림 표시만 합니다).
운전 중에는 앱을 조작하지 마세요.
