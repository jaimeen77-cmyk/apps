# GIF Home (한국어판): licenses

GIF Home and its network helper come from
[NamelsMissing/mgu-apps](https://github.com/NamelsMissing/mgu-apps) (commit
`58d26d33520ae20826aad68e80122be64b40cf7f`), which is licensed under the
**GNU General Public License v3** (the same text as
[`LICENSES/GPL-3.0-or-later.txt`](LICENSES/GPL-3.0-or-later.txt)). This repository's
Korean edition is a modified version of that work and is distributed under the
same GPL-3.0 terms, with its complete source in this repository.

GIF 홈은 NamelsMissing/mgu-apps(GPL-3.0)에서 가져와 한국어로 고친 판입니다.
수정본도 같은 GPL-3.0 조건으로 배포하며, 전체 소스는 이 저장소에 있습니다.

## What came from upstream (GPL-3.0)

| Here | Upstream | Changes in this repository |
|---|---|---|
| `apps/gif_home/` | `apps/gif_home/` | `app.json`: Korean dictionary (`translations.ko`), `storeSourceDirs`, `storeMguHmi`; `phone_page.js`: Korean phone page when the phone's language is Korean; `main.js`: five pages, the Animation screen (0.4.1); `animation.js`, `README.ko.md`, `NOTICE`, `icon.png` added |
| `native/gif-net/` | `native/gif-net/` | unchanged (`mgu-gif-net` 0.1.0) |
| `tests/gif_home_*.test.js` | `tests/` | unchanged |

Written for this repository (GPL-3.0, as part of the modified work): `tools/prepare-upstream-apps.py`,
`store/apps/gif_home_ko/`, the `store/runtime/gif_home*` templates, `tests/gif-home-ko.test.js`, `tests/gif-home-animation.test.js`.

## Components by others (their own licenses, unchanged)

- `apps/gif_home/qr_vendor.js`: QR Code generator by Kazuhiko Arase, MIT (`apps/gif_home/LICENSE`).
- Runtime kit and RHMI generation in the Store template: `jaimeen77-cmyk/appsKOR` kit
  (commit `87d450d2221f9e3a5846153ed8f5cd6557fe1201`), based on `cauliflowermossgrape/idrive7-apps`, MIT
  (`LICENSE.appsKOR`; shipped in the package as `LICENSE.idrive7-apps`).
- `apps/gif_home/icon.png` (also `store/apps/gif_home_ko/icon.png`): a picture supplied by the repository owner,
  cropped and scaled to 140 x 140. It is not part of the GPL-licensed code; its own rights stay with its owner.
- Korean font: Noto Sans CJK KR, SIL Open Font License 1.1 (shipped as `OFL-NotoSansKR.txt`).

No BMW SDK, oap-sdk or node_modules is included in the source or the template.
