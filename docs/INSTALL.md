# Installation · MGU Store

[한국어](INSTALL.ko.md) · [The apps](../README.md)

Every app in this repository is installed from the car's **MGU Store**. No PC or USB stick is needed.
The Store builds the app on the head unit, with that car's own BMW SDK.

## 1. What you need

- A head unit (iDrive 7 or iDrive 8) with MGU Store installed, and an internet connection
  - To install MGU Store itself, follow the [MGU Store guide](https://github.com/robertnisipeanu/mgu-store).
- The car parked, with stable power (engine running or a charger), until the install is done

## 2. Add the sources

In MGU Store open **Settings → Add source** and add the sources below. The branch is **`main`** for all of them (not Releases).

| Source | Needed | What it offers |
|---|---|---|
| **`jaimeen77-cmyk/apps`** | Yes | This repository's apps: Cluster Redline, MGU Monitor, iDrive Circuit, Seats Easy Access, 8게임즈 (Parked Games), GIF 플레이어 (GIF player), 스포티파이 (Spotify, Korean edition), and the tools `redline-lead` (Cluster Redline lead-car helper), `mgu-gif-net`, `mgu-monitor-names` |
| **`jaimeen77-cmyk/appsKOR`** | For 8게임즈, the GIF player and Spotify | The GPU renderer (`idrive7-renderd`), the iDrive controller gate (`mgu-inputgate`), 15 Korean apps |
| The Store's default source (`robertnisipeanu/idrive-apps`) | For Cluster Redline | The cluster renderer (`cluster-render`), `mgu-deploy` |
| `IterioDev/car-apps` | For Seats Easy Access | Comfort (`iteriodev-comfort`) |

Then press **Check now**. If the Store says Offline, check the internet connection first.

## 3. Install an app

Choose the app in the list and press **Install**. When a tool it needs is missing or too old, the Store installs that tool first.
If no registered source offers the tool, the Store blocks the install and says why.

| Store listing | Version | iDrive 7 | iDrive 8 | Tools installed with it |
|---|---|:-:|:-:|---|
| Cluster Redline (English) / 계기판 레드라인 (한국어) | 1.3.92 | ✅ | ✅ | `cluster-render` 0.4.0+, `redline-lead` 0.4.0 (this source, the lead-car and lane helper), `mgu-deploy` 0.7.17+ |
| MGU Monitor (English) / MGU 모니터 (한국어) | 1.1.10 | ✅ | ✅ | `mgu-monitor-names` 0.1.0 (this source), `mgu-deploy` |
| iDrive Circuit (English) / 아이드라이브 회로 (한국어) | 1.0.5 | ✅ | ✅ | `mgu-deploy` |
| Seats Easy Access (English) / 시트 Easy Access (한국어) | 0.7.10 | ✅ | ✅ | `iteriodev-comfort` 0.6.1+, `mgu-deploy` 0.7.11+ |
| 8게임즈 (Korean only) | 0.2.4 | ✅ | — | `idrive7-renderd`, `mgu-inputgate`, `mgu-deploy` |
| GIF 플레이어 (한국어) (Korean only) | 0.4.8 | ✅ | — | `idrive7-renderd`, `mgu-inputgate`, `mgu-gif-net` 0.1.0 (this source), `mgu-deploy` |
| Spotify (한국어) (Korean only) | 2.0.0 | ✅ | — | `idrive7-renderd` 2.1.7+, `mgu-inputgate` 1.0.0+, `mgu-deploy` 0.7.17+ |

- 8게임즈, the GIF player and Spotify are **iDrive 7 only**, like the original apps. On iDrive 8 the Store refuses them.
- iDrive 8 installs are supported, but not every app has been checked on an iDrive 8 car yet.
- The English and Korean editions are separate apps. Do not use both editions of the same app; if both are installed, turn off or remove the one you do not use.
- If the Store asks for a restart after the install, do it (some tools take effect from the next HMI start).

## 4. First start

Open an installed app from the car's app list. What to do first is in each app's guide.

| App | Guide |
|---|---|
| Cluster Redline | [User guide](CLUSTER-REDLINE.md) — Basic settings → App operation → **Start app** |
| MGU Monitor | [Guide](../apps/storage/README.md) — place its widget on the home screen |
| iDrive Circuit | [Guide](../apps/idrive_circuit/README.md) |
| 8게임즈 | [Korean guide](../apps/parked_games/README.ko.md) |
| GIF player | [Guide](../apps/gif_home/README.md) — upload GIFs from your phone |
| Spotify | [Korean guide](../apps/spotify/README.ko.md) — connect your account by QR, needs the internet |
| Seats Easy Access | [Guide](../apps/seats_easy_access/README.md) |

### Placing a widget on the home screen (MGU Monitor, GIF player)

1. On the iDrive **HOME** screen push the controller **up** to open the top menu.
2. Choose **Customize main menu**.
3. Choose a slot and add **MGU Monitor** or **GIF 플레이어** from the list.
4. A **large tile** gives the large widget with the graphs or the GIF; a narrow tile gives the small widget with text only.
5. Save.

## 5. Update

1. In MGU Store press **Check now** for the source.
2. In **Installed** press **Update** on the app.
3. Open the app and check the version at the top right.

Settings are kept through updates.

## 6. Remove

MGU Store → **Installed** → the app → remove. The tools (renderers and so on) are shared with other apps; remove them separately only when nothing needs them.

## 7. Troubleshooting

| Symptom | Check |
|---|---|
| The app is not in the list | Source spelling `jaimeen77-cmyk/apps`, branch `main`, Check now, internet connection |
| The install is blocked by a missing tool | Whether a source offering that tool (table in 2.) is registered |
| "is for iDrive 7" on iDrive 8 | 8게임즈, the GIF player and Spotify are iDrive 7 only |
| Updated but nothing changed | The version at the top right; that the other language edition of the app is not running |
| The GIF player or 8게임즈 is slow and touch does nothing | Whether the GPU renderer (`idrive7-renderd`) is installed and the appsKOR source registered |
| Cluster Redline does not show on the cluster | [Troubleshooting in the Redline guide](CLUSTER-REDLINE.md#troubleshooting) |

The apps only **read** vehicle signals (Seats Easy Access moves the seats; Cluster Redline only draws on the cluster and the HUD).
Do not operate the apps while driving.
