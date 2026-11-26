# Spotify (스포티파이, 한국어판): licenses

Spotify comes from [hexlay/idrive7-custom-apps](https://github.com/hexlay/idrive7-custom-apps) (commit
`db900984c13e47f7be33c7b3c0ed92b1936c5026`), which is licensed under the **GNU General Public License v3**
(the same text as [`LICENSES/GPL-3.0-or-later.txt`](LICENSES/GPL-3.0-or-later.txt) and `apps/spotify/LICENSE`).
This repository's Korean edition is a modified version of that work and is distributed under the same GPL-3.0
terms, with its complete source in this repository.

스포티파이(Spotify 한국어판)는 hexlay/idrive7-custom-apps(GPL-3.0)의 Spotify를 한국어로 고친 판입니다.
수정본도 같은 GPL-3.0 조건으로 배포하며, 전체 소스는 이 저장소에 있습니다.

## What came from upstream (GPL-3.0)

| Here | Upstream | Changes in this repository |
|---|---|---|
| `apps/spotify/` | `apps/spotify/` | `main.js`: a line is translated before `fitText` measures and cuts it; song, artist, playlist and device names drawn untranslated (`literal`). `app.json`: `storeMguHmi`. `NOTICE`, `README.ko.md`, `screenshots/` added |
| Store template `store/runtime/spotify*` | the kit (`kit/`) and `kit/tools/build.py` | built with `--language ko`; `kit/runtime/fonts.js` picks the Korean atlas for Hangul; `kit/runtime/i18n.js` replaced by `tools/spotify-i18n.js` |

Written for this repository (GPL-3.0, as part of the modified work): `localization/spotify.ko.json`,
`tools/spotify-i18n.js`, `tools/prepare-spotify.py`, `store/apps/spotify_ko/`, `tests/spotify-ko.test.js`.

## Components by others (their own licenses, unchanged)

- Runtime kit in the Store template: hexlay/idrive7-custom-apps `kit/`, based on `cauliflowermossgrape/idrive7-apps`,
  MIT (`LICENSE.MIT` in the package).
- Korean font atlas `korean.json`: Noto Sans CJK KR, SIL Open Font License 1.1 (`OFL-NotoSansKR.txt`), as baked in
  `jaimeen77-cmyk/appsKOR` (`kit/localization/fonts/`).
- Spotify is a trademark of Spotify AB. This app is not made or endorsed by Spotify.
