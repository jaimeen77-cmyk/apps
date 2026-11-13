# MGU Store에 Jam 저장소 추가

이 저장소는 **Repo tree 방식**을 사용합니다. GitHub Release나 별도 catalog 주소를 만들 필요가 없습니다.

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
| 아이드라이브 회로 (한국어) | 한국어 | 앱 목록에서 수동 실행 | iDrive 7, mgu-deploy 0.7.17+ |
| iDrive Circuit (English) | 영어 | 앱 목록에서 수동 실행 | 위와 동일 |
| 계기판 레드라인 (한국어) | 한국어 | 백그라운드 자동 시작 | 위 조건 + cluster-render 0.4.0+ |
| Cluster Redline (English) | 영어 | 백그라운드 자동 시작 | 위와 동일 |
| 저장공간 (한국어) 1.0.4 | 한국어 | 앱 목록에서 수동 실행 | iDrive 7, mgu-deploy 0.7.17+ |
| Storage (English) 1.0.4 | 영어 | 앱 목록에서 수동 실행 | 위와 동일 |

## 언어 선택과 변경

Store 목록에서 원하는 언어가 붙은 앱을 선택합니다. 별도의 `--language` 입력은 필요 없습니다.
이미 이 저장소를 등록했다면 **Check now**로 영문판을 포함한 목록을 새로 받으세요.
Store 자체에 언어 선택 버튼을 추가하는 방식이 아니라 **두 언어판을 별도 항목으로 제공**합니다.
차량이나 Store의 표시 언어를 바꿔도 설치한 앱의 언어가 자동으로 바뀌지는 않습니다.

기존 한국어판 ID(`idrive_circuit`, `cluster_redline`)는 유지합니다.
영문판은 `idrive_circuit_en`, `cluster_redline_en`이며, 설정과 기록은 자동으로 옮겨지지 않습니다.
저장공간은 한국어 `storage`, 영어 `storage_en`이며 두 항목 모두 1.0.4입니다.
언어를 바꾸려면 사용할 언어판을 설치하고, 불필요한 기존 언어판은 제거하세요.

