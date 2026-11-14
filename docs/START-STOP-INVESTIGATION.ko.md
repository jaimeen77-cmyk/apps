# MGU 오토 스타트·스톱 제어 가능 여부 확인

현재는 제어 명령을 확인하지 못했습니다. 참고한 IterioDev Comfort/Seats와 클러스터 앱 소스에서 검증된 오토 스타트·스톱 ON/OFF 구현을 찾지 못했고, 기존 제한속도 주행 로그에는 이를 판단할 전체 인터페이스 정의가 없습니다. 이것은 차량에서 제어가 불가능하다는 결론이 아닙니다.

`tools/inspect-start-stop.js`는 차량의 `/etc/oap/someip/someip-interfaces.json`을 한 번 읽고 관련 이름을 가진 상태 필드·setter·메서드·이벤트 정의만 출력합니다. SOME/IP 연결·구독·getter 호출·진단 요청·차량 쓰기를 하지 않습니다. 지속 수집, 로그 메뉴, 서비스 설치도 없습니다. 기존 레드라인 앱에는 변경이 없습니다.

## 실행

이미 차량 인터페이스 파일을 PC에 복사해 두었다면:

```sh
node tools/inspect-start-stop.js /path/to/someip-interfaces.json
```

기존 차량 SSH 연결을 사용하는 Windows PowerShell에서는 저장소 루트에서 다음을 실행합니다. IP와 키 경로를 자신의 기존 연결 값으로 바꿉니다. 스크립트는 차량에 설치하지 않고 표준 입력으로 실행하며, 결과 파일은 PC에만 생성합니다.

```powershell
Get-Content -Raw .\tools\inspect-start-stop.js | ssh -T -i "C:\path\car_key" root@192.168.0.10 "node -" | Set-Content -Encoding UTF8 .\start-stop-interfaces.json
```

`node` 명령을 찾지 못하면 차량에서 사용하는 Node 실행 경로가 필요합니다. 일반 MGU Store 앱 목록인 `catalog.json`은 이 검사에 사용할 수 없습니다.

## 다음 판단

- getter·notifier·이벤트만 있으면 상태 조회 후보입니다. 제어 가능하다는 뜻은 아닙니다.
- setter·메서드가 있어도 이름만으로 호출하지 않습니다. 입력 자료형·값의 의미·대상 서비스·권한을 확인해야 합니다.
- 결과가 0개여도 진단 통신 등 다른 경로가 없다는 뜻은 아닙니다. 이 검사는 SOME/IP 정의 이름에 대한 1차 확인입니다.
- 실제 제어 경로가 검증돼야 MGU 앱의 ON/OFF 버튼을 구현할 수 있습니다. 시동 버튼이나 엔진 정지 명령을 ISG 해제 명령으로 대체하지 않습니다.

차량에서 실행한 결과는 아직 없습니다. 결과 파일을 확인한 뒤 지원 여부와 다음 구현 범위를 결정합니다.
