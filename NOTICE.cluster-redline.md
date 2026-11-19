# Cluster Redline: licenses

## From 1.3.10: permission required

Cluster Redline 1.3.10 and later is licensed by 잼님 (jaimeen77) under the **permission required** terms
in [`apps/cluster_redline/LICENSE`](apps/cluster_redline/LICENSE) (all rights reserved): installing it from
this repository / its MGU Store source and using it privately in your own vehicle is allowed; copying,
redistributing, modifying, putting it into other apps, or commercial use needs prior permission.

1.3.10부터 Cluster Redline은 **허락 필요** 라이선스입니다. 이 저장소(MGU Store 소스)에서 설치해 본인 차량에서
쓰는 것은 자유이고, 복사·재배포·수정·다른 앱에 넣기·상업적 이용은 미리 허락을 받아야 합니다.
1.3.9까지 공개된 버전은 MIT 라이선스였고, 그 버전에는 MIT가 그대로 적용됩니다.

It covers Cluster Redline's own files in this repository: `apps/cluster_redline/` (except the components
below), `store/apps/cluster_redline_en/`, Cluster Redline's screens and resources in
`store/runtime/cluster_redline*`, `tests/cluster_redline/`, `tools/cluster-redline-*.js`, and its guide
pictures and documents. The repository's root `LICENSE` (MIT, cauliflowermossgrape) is the runtime kit's and
the other apps'; it does not cover Cluster Redline 1.3.10 and later.

## Components by others (their own licenses, unchanged)

See [`apps/cluster_redline/NOTICE`](apps/cluster_redline/NOTICE) for the full list and license texts:

- `apps/cluster_redline/cluster_render_client.js`: Robert Nisipeanu, MPL-2.0 (`LICENSES/MPL-2.0.txt`),
  based on `robertnisipeanu/idrive-apps`; locally modified (deferred initial visibility).
- Runtime kit and build/install tooling: `cauliflowermossgrape/idrive7-apps`, MIT (`LICENSE`).
- `apps/cluster_redline/rl-hud-draw.js`, `rl-hud-m.js`: the Redline app's HUD drawing
  (`cauliflowermossgrape/idrive7-apps` Redline, HUD output by @biscotit), MIT.
- Drive mode field and mappings in `policy.js`: `cauliflowermossgrape/idrive7-apps`
  `apps/live_data/signals.js`, MIT.
- Korean font: Noto Sans CJK KR, OFL-1.1, supplied by the Korean-enabled kit.
- `patches/`: the optional native parked-recovery patch, a modification of the GPL-3.0-or-later
  cluster-render SlotManager from `robertnisipeanu/idrive-apps`, provided as corresponding source
  (`LICENSES/GPL-3.0-or-later.txt`); the app does not install it.

No BMW SDK is included in the source distribution.

To ask for permission: an issue on this repository, or blog.naver.com/jaimeen77.
