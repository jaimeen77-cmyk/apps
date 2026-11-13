# Seats 한국어 소스 overlay

기존 `apps` 같은 MGU Store 저장소에 한국어 Seats를 추가합니다.

```sh
python3 tools/install-seats-overlay.py /path/to/apps
```

대상 `apps/seats_easy_access/`에 소스를 복사하고 `kit/tools/build.py`와 MGU Store 빌드 항목을 추가합니다. 기존 앱과 도구 항목은 유지합니다. 공용 빌드 파일 또는 Seats 파일이 다르면 복사 전에 중단합니다. 기존 공용 빌드 파일이 있는 프로젝트에는 내용을 검토해 통합해야 합니다. `--force`는 해당 파일을 교체하므로 신중히 사용하세요.

```sh
python3 kit/tools/build.py --language ko seats_easy_access
```

패키지는 `dist/`에 생성됩니다. 이 공용 명령은 패키지 빌드용이며 원본 프로젝트의 `--preview-only` 옵션은 지원하지 않습니다.

대상에서 Seats는 한국어 리소스만 만들고 기본 언어도 한국어로 설정됩니다. Comfort는 별도 원본 의존성이므로 `IterioDev/car-apps` 소스가 필요합니다.

대상 변경을 커밋·푸시한 뒤 MGU Store에서 해당 저장소의 main 채널을 새로고침하면 **시트 Easy Access**가 표시됩니다. `catalog.json` 직접 주소 채널 대신 main 저장소 채널을 사용하세요.
