# MGU Store에 Jam 저장소 추가

이 저장소는 **Repo tree 방식**을 사용합니다. GitHub Release나 별도 catalog 주소를 만들 필요가 없습니다.

## iDrive 7·8

이 소스의 앱 8개(한국어·영어판)와 이름 조회 보조 도구는 iDrive 7과 iDrive 8에 설치됩니다.
Store 런타임 템플릿(`store/runtime`)을 `appsKOR`의 최신 App Kit(2bb7902)으로 다시 만들어,
설치 패키지에 iDrive 7과 iDrive 8 화면 정의(`rhmiData/uiDescriptions/ID7`, `ID8`)가 함께 들어가고
`package.json`과 Store 목록의 `mguHmi`가 모두 `["ID7", "ID8"]`입니다.
iDrive 8 실차 검증은 아직 하지 않았으므로 설명의 **ID8 미검증** 표시는 유지합니다.
버전을 올렸으므로(Circuit 1.0.2, Cluster Redline 1.3.1, MGU 모니터 1.1.3, Seats 0.6.13) iDrive 7 설치본도 Store에서 업데이트됩니다.

재생성 방법(유지보수):

```sh
python3 tools/install-overlay.py <appsKOR 사본>
# 사본에서: python3 kit/tools/build.py --preview-only --language ko|en idrive_circuit cluster_redline seats_easy_access
# dist/<id>/source 를 package/ 로 묶어 <id>@<버전>[-ko.1].tgz 로 만든 뒤
python3 tools/prepare-store.py --dist <tgz 폴더> --language ko|en --apps idrive_circuit cluster_redline seats_easy_access
python3 tools/prepare-storage.py --kit-root <appsKOR 사본> --kit-commit <appsKOR 커밋>
```

## 차량에서 등록

1. MGU Store를 열고 인터넷 연결을 확인합니다.
2. **Settings → Add source**를 선택합니다.
3. 다음 주소 또는 짧은 저장소 이름을 입력합니다.

```text
https://github.com/jaimeen77-cmyk/apps
```

```text
jaimeen77-cmyk/apps
```

4. 채널 선택 화면에서 **main** 브랜치를 선택합니다. Releases가 아닙니다.
5. **Check now**를 실행하고 Store 목록에서 다음 앱을 선택해 설치합니다.

| 앱 | Store 빌드 언어 | 시작 방식 | 필수 조건 |
|---|---|---|---|
| 아이드라이브 회로 (한국어) | 한국어 | 앱 목록에서 수동 실행 | iDrive 7·8, mgu-deploy 0.7.17+ |
| iDrive Circuit (English) | 영어 | 앱 목록에서 수동 실행 | 위와 동일 |
| 계기판 레드라인 (한국어) | 한국어 | 백그라운드 자동 시작 | 위 조건 + cluster-render 0.4.0+ |
| Cluster Redline (English) | 영어 | 백그라운드 자동 시작 | 위와 동일 |
| MGU 모니터 (한국어) 1.1.2 | 한국어 | 앱 목록에서 수동 실행 | iDrive 7·8, mgu-deploy 0.7.17+ |
| MGU Monitor (English) 1.1.3 | 영어 | 앱 목록에서 수동 실행 | 위와 동일 |

## 언어 선택과 변경

Store 목록에서 원하는 언어가 붙은 앱을 선택합니다. 별도의 `--language` 입력은 필요 없습니다.
이미 이 저장소를 등록했다면 **Check now**로 영문판을 포함한 목록을 새로 받으세요.
Store 자체에 언어 선택 버튼을 추가하는 방식이 아니라 **두 언어판을 별도 항목으로 제공**합니다.
차량이나 Store의 표시 언어를 바꿔도 설치한 앱의 언어가 자동으로 바뀌지는 않습니다.

기존 한국어판 ID(`idrive_circuit`, `cluster_redline`)는 유지합니다.
영문판은 `idrive_circuit_en`, `cluster_redline_en`이며, 설정과 기록은 자동으로 옮겨지지 않습니다.
MGU 모니터는 한국어 `storage`, 영어 `storage_en`이며 두 항목 모두 1.1.3입니다.
언어를 바꾸려면 사용할 언어판을 설치하고, 불필요한 기존 언어판은 제거하세요.

