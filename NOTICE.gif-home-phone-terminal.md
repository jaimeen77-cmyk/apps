# GIF Home / Phone Terminal (한국어판): licenses

These two apps and their native helpers come from
[NamelsMissing/mgu-apps](https://github.com/NamelsMissing/mgu-apps) (commit
`58d26d33520ae20826aad68e80122be64b40cf7f`), which is licensed under the
**GNU General Public License v3** (the same text as
[`LICENSES/GPL-3.0-or-later.txt`](LICENSES/GPL-3.0-or-later.txt)). This repository's
Korean editions are modified versions of that work and are distributed under the
same GPL-3.0 terms, with their complete source in this repository.

GIF Home과 폰 터미널은 NamelsMissing/mgu-apps(GPL-3.0)에서 가져와 한국어로 고친 판입니다.
수정본도 같은 GPL-3.0 조건으로 배포하며, 전체 소스는 이 저장소에 있습니다.

## What came from upstream (GPL-3.0)

| Here | Upstream | Changes in this repository |
|---|---|---|
| `apps/gif_home/` | `apps/gif_home/` | `app.json`: Korean dictionary (`translations.ko`), `storeSourceDirs`, `storeMguHmi`; `phone_page.js`: Korean phone page when the phone's language is Korean; `README.ko.md`, `NOTICE` added |
| `apps/mgu_phone_terminal/` | `apps/mgu_phone_terminal/` | `app.json`: Korean dictionary, `storeMguHmi`; `README.ko.md`, `NOTICE` added |
| `native/gif-net/` | `native/gif-net/` | unchanged (`mgu-gif-net` 0.1.0) |
| `native/phone-bridge/` | `native/phone-bridge/` | `server.js`: also serves the Korean edition's app id `mgu_phone_terminal_ko`; `public/client.js`: Korean page when the phone's language is Korean; version 0.1.7 |
| `tests/gif_home_*.test.js`, `tests/phone_terminal_*.test.js` | `tests/` | `phone_terminal_manifest.test.js` reads the Korean catalog entry |

Written for this repository (GPL-3.0, as part of the modified work): `tools/prepare-upstream-apps.py`,
`store/apps/gif_home_ko/`, `store/apps/mgu_phone_terminal_ko/`, the `store/runtime/gif_home*` and
`store/runtime/mgu_phone_terminal*` templates, `tests/gif-home-phone-terminal-ko.test.js`.

## Components by others (their own licenses, unchanged)

- `apps/gif_home/qr_vendor.js`, `apps/mgu_phone_terminal/qr.js`: QR Code generator by Kazuhiko Arase,
  MIT (`apps/gif_home/LICENSE`, `apps/mgu_phone_terminal/QR-LICENSE`).
- Runtime kit and RHMI generation in the Store templates: `jaimeen77-cmyk/appsKOR` kit
  (commit `87d450d2221f9e3a5846153ed8f5cd6557fe1201`), based on `cauliflowermossgrape/idrive7-apps`, MIT
  (`LICENSE.appsKOR`; shipped in each package as `LICENSE.idrive7-apps`).
- Korean font: Noto Sans CJK KR, SIL Open Font License 1.1 (shipped as `OFL-NotoSansKR.txt`).

No BMW SDK, oap-sdk or node_modules is included in the source or the templates.
