# 8게임즈 (Parked Games 한국어판)

주차 중에 iDrive 컨트롤러(와 터치스크린)로 즐기는 게임 8개를 한 앱에 담았습니다. 원작은
[MaxxxFoka의 Parked Games](https://github.com/jaimeen77-cmyk/idrive7games_fork)(MIT)이며, 이 저장소의 판은 화면 문구를 모두 한국어로 옮긴 것입니다.

| 게임 | 내용 |
|---|---|
| 차선 러너 | 차선을 바꿔 콘을 피하며 달리기 |
| 패들 대결 | 차(컴퓨터)와 또는 2인 탁구 |
| 협곡 비행 | 끝없는 동굴을 글라이더로 날기 |
| 회전 유지 | 움직이는 초록 구간에 회전수 맞추기 |
| 벽돌 깨기 | 벽돌 벽 부수기 (레벨 8개) |
| 블록 드롭 | 줄을 채우거나 같은 색 4개 모으기 |
| 스케치패드 | 손가락이나 컨트롤러로 그림 그리기 |
| 체스 | 컴퓨터(쉬움·보통·어려움) 또는 2인 |

- **주차 중에만**: 차가 움직이면 게임이 멈추고, 메뉴에 `주차 중에만` 안내가 나옵니다.
- **조작**: 돌리기·누르기·밀기. 게임 중 컨트롤러를 길게 누르면 일시정지, 거기서 `게임 메뉴`로 돌아갑니다.
- **설치**: MGU Store에서 이 소스(`jaimeen77-cmyk/apps`)의 **8게임즈**. iDrive 7 전용입니다(원작과 같음).
- **필요한 도구**: 게임은 GPU 렌더러(`idrive7-renderd`)와 컨트롤러 연결(`mgu-inputgate`)로 그려지고 조작됩니다.
  이 두 도구는 이 소스에 없으므로, 그것을 제공하는 소스(예: [appsKOR](https://github.com/jaimeen77-cmyk/appsKOR))가 MGU Store에 등록되어 있어야 함께 설치됩니다.

## 관리자용

- 앱 코드: `apps/parked_games` (게임은 `games/` 폴더, 차에서 설치할 때 그대로 들어갑니다).
- 번역: `app.json`의 `translations.ko`. 바꾼 뒤에는 한국어 화면 틀을 다시 만듭니다:
  `python3 tools/prepare-games.py --kit-root <idrive7games_fork 체크아웃>`
- 라이선스·출처: [NOTICE](NOTICE).
