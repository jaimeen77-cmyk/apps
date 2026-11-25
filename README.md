# iDrive 7 Jam Apps

Store listings are visible on ID8 with unspecified catalog compatibility.
the current install packages and UI resources retain
their ID7 restrictions. Listing visibility does not enable ID8 installation.

![BMW Coding Study Cafe](screenshots/banner.png)

**Cluster Redline 1.3.59** (now permission required, see License below): the Animation layout (the animated car, or on the cluster your own GIFs from the GIF player for driving, standing still, reverse, turning left and right; any size fitted; scenes fading into each other); a new Car layout for the cluster and the HUD (a big animated car that brakes, drifts, flames and reverses with your car, readouts under it); menus reorganised (HUD lamps / Vehicle preset menus, design then auxiliary values, Jam layouts), BC mode on the HUD too, new BC page defaults, vehicle alerts always on; BC presses counted whenever the app runs, BC mode or not, and a favorite or a driver's settings keep the BC page's screen; the next turn as its own HUD part (Position / size); Received turns (what the navigation sends, raw, on screen and optionally in nav-probe.log); BC mode on the cluster (a Redline screen per stock BC page); lead-car headway on the HUD (time gap, distance, closing speed); the next turn under the HUD arrow when it follows close behind; driver greeting on the cluster too, 5 s, and a goodbye when the engine is switched off; hood and trunk in the door-open warning (the cluster no longer gives way); blind spot warning on the HUD (top view under the turn arrows, its own position / size); door-open warning on the HUD (adjustable position); settings, favourites and layout slots per driver, shown by name, with a HUD greeting at engine start; navigation arrow and text colours (orange / green / blue / white); vehicle alerts on the HUD (speeding and children signs from the camera sign recognition, speed cameras); HUD turn signals work (the light module is now subscribed), in the Redline HUD while it shows, on their own overlay layers over the stock HUD, Position / size preview ends when the screen is left, battery voltage kept through missed replies; all modes RPM display can leave out Sport modes (cluster and HUD), turn signal arrows on the HUD (shape, colour, position); cluster released while guidance shows on the HUD (Waze included), tuned HUD layout defaults, outside temperature fix (1.2.8: Redline layouts element by element, Korean time for the clock). **iDrive Circuit 1.0.5** and **MGU Monitor 1.1.10** (home widget: CPU and memory graphs of the last 30 minutes, fitted to the widget) are also available.

[한국어](README.ko.md)

| Documentation | English | 한국어 |
|---|---|---|
| Install | [Installation](docs/INSTALL.md) | [설치 안내](docs/INSTALL.ko.md) |
| Use Redline | [User guide](docs/CLUSTER-REDLINE.md) | [사용 설명서](docs/CLUSTER-REDLINE.ko.md) |
| Use MGU Monitor | [MGU Monitor](apps/storage/README.md) | [MGU 모니터](apps/storage/README.ko.md) |
| Use Circuit | [Circuit](apps/idrive_circuit/README.md) | [회로 퍼즐](apps/idrive_circuit/README.ko.md) |
| Parked Games (Korean edition) | — | [8게임즈](apps/parked_games/README.ko.md) |
| GIF Home (Korean edition) | [GIF Home](apps/gif_home/README.md) | [GIF 플레이어](apps/gif_home/README.ko.md) |

Add MGU Store source **`jaimeen77-cmyk/apps`**, branch **`main`**, refresh and choose Korean or English. Redline requires **`cluster-render` 0.4.0+**. Update existing installs in Installed and check **v1.3.42** in the app. Stop and disable auto-start in an unused language edition if both are installed.

| HUD circle | HUD bar |
|---|---|
| ![HUD circle](screenshots/cluster_redline/hud-circle-en.png) | ![HUD bar](screenshots/cluster_redline/hud-bar-en.png) |

| Cluster circle | Cluster bar |
|---|---|
| ![Cluster circle](screenshots/cluster_redline/cluster-circle-en.png) | ![Cluster bar](screenshots/cluster_redline/cluster-bar-en.png) |

[All screenshots: metrics, navigation, settings and red alerts](screenshots/README.md). Images use the actual app renderer with example data; real-vehicle verification of this release remains pending.

[Source integration / 소스 통합](docs/JAM-INTEGRATION.ko.md) · [Changelog / 업데이트 이력](CHANGELOG.md) · [Licenses](NOTICE.cluster-redline.md)

**License**: Cluster Redline 1.3.10 and later is **permission required** ([apps/cluster_redline/LICENSE](apps/cluster_redline/LICENSE)): install and use it in your own vehicle freely; copying, redistributing, modifying or commercial use needs permission. Versions up to 1.3.9 were MIT. Components by others keep their licenses ([NOTICE.cluster-redline.md](NOTICE.cluster-redline.md)).

For the 15 localized upstream iDrive apps, use the separate [appsKOR repository](https://github.com/jaimeen77-cmyk/appsKOR). This repository offers Circuit, Cluster Redline, MGU Monitor and Seats Easy Access in Korean and English.

The 15 general Korean app listings and their latest compiled packages have moved to [appsKOR](https://github.com/jaimeen77-cmyk/appsKOR). Refresh both main sources in MGU Store. This source lists eight app entries: the Korean and English editions of Circuit, Cluster Redline, MGU Monitor and Seats Easy Access. Both MGU Monitor editions are version 1.1.9; they also require the app-name helper tool from this source.
