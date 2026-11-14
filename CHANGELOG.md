# Changelog

Version history is kept here. For current usage, see [Cluster Redline](docs/CLUSTER-REDLINE.ko.md).

## Seats Easy Access

### 0.6.11

- The Logs tab and the Comfort log line under the page are gone, and no vehicle or seat history is kept: no journal reads, no status-event history, no file. The history file older versions kept in the app data folder (`seats-diagnostics.json`) is deleted at start. The Logs tab's HMI bar buttons stay declared in app.json (the prepared Store UI) and are kept hidden.
- Ignition M1 (8 s, one retry 2 s after a short recall) and its arrival check are unchanged; they just no longer write anything.

### 0.6.10

- Ignition M1 waits 8 s after power-on (car: 10 s arrived at once in 0.6.9) and a short recall is retried 2 s after it ended (with 2 s of idle Comfort) instead of 8 s.

### 0.6.9

- Ignition M1 waits 10 s after power-on. Car test of 0.6.8: the call 6 s after power-on ended in 0.4 s without moving (the seat module not yet taking motor commands); 15 s after power-on had arrived in 0.6.7. The one retry stays 8 s after a short recall.

### 0.6.8

- Ignition M1 waits 6 s after power-on instead of 15 s (still only after 3 s of idle Comfort). Car test of 0.6.7: Comfort's own way back started at power-on and stopped after 3 s short of its target (seat module holding the motors), the M1 call 15 s later arrived in 6.6 s. The one retry stays 8 s after a short recall.

### 0.6.7

- Ignition M1 checks arrival: when Comfort's memory job ends, the driver's reported position is compared with the stored M1. More than 80 counts away on any axis (the seat module can hold its motors right after the engine starts: Comfort sees no progress, takes it for the end stop, and only a relay click is heard) calls M1 once more after 8 s and 2 s of idle Comfort, under the same guards; never a third time.
- The M1 trace logs how long the job took, how far each axis moved and how far each is from the target.
- The Logs tab opens on the app's events and Comfort's journal merged by time (journal lines marked `C`); Log source cycles to app-only and Comfort-only.
- The new Korean log phrases live in `i18n.js` (applied before the kit's translation), so the Store's prepared UI stays valid.

### 0.6.3

- Show Comfort's log at the bottom: under the page where the screen has room (the car's full-screen layout), else under the status line. It reads `journalctl -u iteriodev-comfort` where the app may; otherwise it lists the changes Seats sees in Comfort's status (car on/off, standing, a seat move starting and ending, the way back after easy exit waiting or done). Read only.
- Start the background photo where the menu does: on the full-screen layout the page's left edge lies under the HMI's back arrow column, which cut into the photo; it now begins at the column's edge and under the tab bar.

### 0.6.2

- Fix: automatic Easy Access did not bring the driver's seat back when the car was started. Leaving the Seats screen (or the app shutting down) sent Comfort a `stop`, which halts every move, Comfort's own way back too, and Comfort does not try that again until the door opens. The app now stops only a move it asked for (adjust, memory, Easy Access button, Make room); STOP still stops anything.

### 0.6.1

- Show the BMW Coding photo behind the controls with a lighter veil, as on Cluster Redline's settings screen.
- Add the Cluster Redline brand mark in the free space at the top: profile picture, 서울II잼님 · blog address and "BMW Coding 배움터" (English: address and "BMW Coding"). The picture is a gradient-only layer for native renderers.

## Storage

### 1.0.4

- Start the background photo where the menu does: on the car's full-screen layout the page's left edge (about 13 px) lies under the HMI's back arrow column, which only reaches part way down, so the photo stuck out below it like a step. It now begins at the column's edge and under the tab bar, scaled into that area.

### 1.0.3

- The mark reads "코딩나눔터 동이/카자미/잼님".

### 1.0.2

- New app icon (database with a usage ring).
- Background: the BMW Coding photo from Cluster Redline's settings screen, darkened behind the translucent panels (on the car recorded once as a layer).
- Mark "코딩나눔터 동이/카자미" and `Http://blog.naver.com/codingbmw` (English edition: "BMW Coding" and the address), bottom right only where the page has room: under the file-system list, and under the app list's second column when it is free.

### 1.0.1

- Publish separate Korean (`storage`) and English (`storage_en`) MGU Store entries, both version 1.0.1, with offline SDK-free builds and independent RHMI identities.
- Localize disk/app/RAM screens, settings, usage warnings and home widgets; preserve setting keys and use StringBundle handles for Korean widget text.
- Keep storage measurement read-only. Force C-locale df parsing, skip symlink app roots and mark incomplete scans.
- Check both installed packages with host rendering and filesystem fixtures. Real-vehicle verification remains pending.

## Cluster Redline

### 1.2.50

- **Hidden menu: speed limit data collection** (tap Basic settings three times within 2 s). Off by default; nothing is recorded otherwise. While on, it writes JSON lines to `speed-probe.log` in the app's data folder (at most 1 MB, then one older file `.1`), kept on across restarts until turned off:
  - once: every interface field / event / method in the car's SOME/IP catalog whose name looks like a speed limit (speed limit, traffic sign, sign recognition, no passing), and which of them this install can read;
  - the vehicle speed and each readable speed-limit field, on change, at most once a second;
  - route guidance (BMW navigation or phone): `speedLimitAssistInfo` and speed limit / speed camera / school zone events, on change.
  The screen shows the state, the catalog matches, current values, and Start / Stop, Clear and Close.
- **Install time** (Store and desktop installers alike, Cluster Redline only): read-only inputs for the collection — the vehicle speed (`Vehicle2.statusCarSpeed2`) and up to six speed-limit-named fields — each only when this car's catalog defines it with a valid getter or notifier and a known instance. Nothing is written to the car.
- `tools/collect-cluster-redline.ps1` also prints the collection log.
- Tests: `redline-1-2-50`, `optional-speed-probe.test.py` (desktop / Store parity, bounds, other apps untouched).

### 1.2.49

- **Classic dial is a clock**: an analogue clock in Korean time (UTC+9) in the same design (knurled chrome bezel, cream face, glass, embossed numerals, bronze hands on the chrome hub, a thin red seconds hand). Nothing else on the dial: no rpm scale, oil window, gear window or drive mode; the rpm alert lamp at the top stays. Only the hands repaint, once a second.
- Fix: the frame key includes the time, so the hands keep moving while nothing else changes.
- **No logs**: the app writes nothing to the system log, removes its rotating log file (and puts a folder in its place so nothing can be appended), and no longer writes `cluster-redline-status.json` every 0.5 s (the settings screen reads the status from memory).
- Tests: `redline-1-2-49` (Korean time, hands follow the time, rpm / gear / mode not shown, only the hands tile changes each second; system log silenced, log files removed and blocked, no status file); cached-draw tests run at a fixed time.

### 1.2.48

- **Tyres & trip**: 150 % by default with the car 110 % (shown as 100 % in Position / size; Reset returns here).
- **Temperatures as thermometers** in gauge mode on every Redline layout with gauges: oil and outside temperature are a glass bulb and tube with a rim, a glint and ticks, the liquid in the layout's colour. Upright on Hexagon (beside its box) and Classic dial (chrome thermometer); other items keep the layout's own gauge (Classic dial: the tube without a bulb).
- **Gauges filled faintly to the end of the scale**: unlit parts are a faint copy of the lit colour instead of grey.
- **The clock is a horizontal-gauge item only**: left out on Hexagon and Classic dial (upright gauges); in the picker it reads "Clock · Horizontal gauges only", dimmed with a note on those layouts (an earlier choice can still be removed).
- Fixes found in the samples: Ramp and M shift lights rows stay aligned when one item has no bar; Hexagon's single gauge box on the HUD keeps clear of the hexagon.
- Tests: Tyres & trip defaults, thermometers follow the value and cached tiles equal full draws on all gauge layouts, the clock rules in readouts and the picker; one-hour soak.

### 1.2.47

- **Gauge mode on eleven more layouts**, each bar drawn in the layout's own look: Standard (slanted segments like its rev bar), Vector arcade (the same in outline), 80s digital (thin LCD blocks), VFD glow (glowing blocks over ghosts), Ramp (the ramp's slanted blocks, rows spaced apart), M shift lights (green / yellow / red dots), Data logger (a 20-block strip with a scale), Mode ribbon (a slanted band in the drive mode's colour), Hexagon (one tall angled box each side with a vertical stack of hex cells, its own HUD size and place), Classic dial (a chrome-rimmed vertical thermometer each side) and Sport HUD (slanted white segments). Items without a range (clock, driving time) stay text. All are marked Gauge support in the pickers.
- Element bounds are measured with full bars in gauge mode, so moved or resized parts never clip a bar.
- Tests: bars drawn and following the values on every new layout (HUD and cluster), cached tiles equal full draws across values / gauges switches; soak with the mode switching every 10 s for an hour: no mismatches, memory as in values mode, gauge mode no slower than values mode.

### 1.2.46

- **New auxiliary items: Average speed and Driving time** (trip 1, from the cluster's board computer as the Live Data app reads them: average speed 0.1 a step in the car's unit, mph turned into km/h; driving time hours:minutes). Both modes; the driving time's gauge runs to 5 h.
- **New cluster-only layout: Tyres & trip.** The car from above, nose up, gear and drive mode in its middle, each tyre's temperature (°C, colour: blue below 20, green, yellow, red from 75) and pressure in psi beside it, and up to four auxiliary items underneath as text, or two with bars in gauge mode. The cheapest layout to draw (about 0.3 ms a frame on the PC: nothing in it follows the revs).
- Tyre data (TPMS temperature +40 offset and pressure 0.1 bar a step, invalid values dropped) and the driving time are read only while shown. They are not in the Store template's manifest, so the Store build (and the desktop installer patch, now v11) adds them at install, read-only, only when the car's catalog defines them with a getter (TPMS on instance 1); otherwise they show "--".
- The layout pickers show **Gauge support / Text only** on every layout (the two default designs, Sport dial and Tyres & trip draw bars in gauge mode). The cluster's picker fits its seventeen layouts in five rows.
- Tests: decoding (Live Data scales, invalid values), both auxiliary modes, cluster-only registration, what is read and when, worker reads of all eleven sources, desktop/Store parity for the install-time fields (five catalog variants); the end-to-end and soak runs include the new layout (no afterimage, stable memory).

### 1.2.45

- Settings screen: start the background photo where the menu does. On the car's full-screen layout the page's left edge (about 13 px) lies under the HMI's back arrow column, which only reaches part way down, so the photo stuck out below it like a step. It now begins at the column's edge and under the tab bar, scaled into that area.

### 1.2.44

- **The Load tab (1.2.43) is replaced by a Favorites tab.** Favorites 1–5, each with Register / Load / Check settings. Register keeps the whole setup (Basic, HUD and cluster designs, positions and auxiliary information, navigation; not the app's run state), only values that differ from the defaults (about 0.2 KB each); over a saved favourite the first press arms and a second within 4 s overwrites. Load sets it in one write of only the values that differ, nothing when already in use, at most once per 1.5 s. Check settings shows Basic / HUD (layout name, auxiliary information) / Cluster (layout name, auxiliary information) / Navigation, with a Load button. With the bar buttons, NAV pressed again on the navigation tab opens Favorites.
- The position slots are back to 1.2.42 (positions only).
- Tests: exact round trips of two different setups, overwrite confirm, empty / broken favourites, controller path, 200 presses in 2 s (at most 2 writes), cost (register / load about 0.3 ms, tab frame 2.2 ms, check-settings frame 1.2 ms), end-to-end loads into the running outputs with no afterimage; a 5-minute run with 1,200 presses gave 200 writes and stable memory.

### 1.2.43

- **New Load tab** (fifth settings tab; with the bar buttons, press NAV again on the navigation tab). It lists only the saved layouts, as "HUD · Luxury arc - Slot 1", "Cluster · Sport dial - Slot 1", "Navigation - Slot 3", each with a Load button.
- Slots now keep the design they were saved with (design, alert style, auxiliary information) besides the positions and sizes, so loading brings back the same picture; the design switch keeps the outgoing design's positions as choosing a design does. Slots saved before 1.2.43 (positions only) load onto the design in use and show "Design not recorded"; broken slots are not listed, and a design not offered on that display (a cluster-only layout on the HUD) is not applied.
- Loading writes only the values that differ, nothing when the layout is already in use, and at most once per 1.5 s for each of HUD / cluster / navigation (pressing faster shows "Wait a moment, then press again"), so repeated presses cannot pile up redraws. Loading from the Load tab also ends a position preview left on the HUD / cluster.
- Tests: save / load round trips, old / broken / wrong-display slots, 200 presses in 2 s (at most 2 writes), cost (a load about 0.5 ms, the Load tab frame about 0.7 ms and 1,700 drawing words with 9 slots), and an end-to-end run loading HUD and cluster layouts into the running outputs: what the renderer shows equals a fresh draw of each frame (no afterimage of the previous layout).

### 1.2.42

- Arrival sign: the dotted trail under the flag is removed; the red swallowtail flag stays.

### 1.2.41

- HUD guidance: the arrival sign is a red swallowtail flag (white outline, notched fly end) on the pole, reached by a short dotted trail; roadside position kept.

### 1.2.40

- HUD guidance: the arrival sign is a waving chequered finish flag (4 x 3 squares) on the pole, in place of the outlined flag; it keeps the roadside position (left / ahead / right).

### 1.2.39

- **Less to send to the renderer.** Each frame's changes were sent as one rectangle per band of rows, as wide as the outermost change (an arc's two ends took the whole width between them). Changed columns are now grouped into runs and the rectangles merged down to at most 12 (the renderer client sends a whole frame beyond 16). Bytes per frame while the revs move: cluster Luxury arc 80 → 33 KB, Sport dial 74 → 33 KB, 80s digital 68 → 10 KB; HUD Data logger 25 → 1.5 KB. In a 6-minute run through every design at 20 frames/s, traffic fell from about 795 to 480 KB/s and frames held back by the upload limit from 752 to 392 (of 7200).
- Settings are normalised once per frame instead of four times (the worker's result is marked and taken as it is by the outputs and both controllers).
- New end-to-end test: outputs → controllers → painters → a renderer that applies the rectangles, through every design with the default design between each; what the renderer shows must equal a fresh draw of the frame it was sent (fails on 1.2.37, which left the default design's afterimage).

### 1.2.38

- **Fix: afterimage of the default HUD design.** Since 1.2.27 the default design was drawn from a copy of the frame state made with `Object.assign`, which drops the render cache (the controller adds it as a hidden property). The design was then painted straight onto the cache's surface, which nothing ever cleared: its top alert bar and the circle beside the gear stayed on the HUD after choosing another design (and parts of it could linger as the revs fell). The copy now keeps the cache, so every part is a tracked tile that is cleared when it changes or goes away.

### 1.2.37

- **Fix: the Korean edition's settings watermark lost "서울II잼님" and "배움터".** The check for the Korean font called `kit/fonts.has()`, which the Store runtime's kit does not have; the call failed and the English watermark was drawn. The Korean atlas is now checked with `get()`.
- **Design screen:** the fill marks the design in use and a white outline the cursor (both were the same red fill, so a default design looked still selected after a Redline layout was chosen). The previews on the design and Redline layout screens are recorded once as layers on the car instead of being redrawn twice a second (the cluster design screen was about 55,000 drawing words a frame; now about 600 plus the cached layers), and a preview's images are drawn as runs of rectangles, not one per pixel.
- **Faster drawing:** each Redline element repaints only when what it shows changes (the mode, readouts, M mark, temperature and G-meter no longer repaint with every rpm change), elements paint straight into their cached tile, and tiles are composed and copied a pixel word at a time. A sweep through all layouts takes about half the time.
- Each design's saved positions keep only values changed from the defaults (trying every layout had grown the saved list to about 24 KB).

### 1.2.36

- **New layout: Sport HUD** (HUD only, not offered on the cluster): four yellow and three red pips as the rpm alert; a long slanted segment bar from 0 to the top revs, white then yellow towards the shift point and red at the redline, with the scale and RPM ×1000 under it; the gear big inside a stepped frame; the rpm big under it; the drive mode at the foot in the drive-mode colour (Sport red, Comfort blue, Eco sky blue); up to four readouts left and right.

### 1.2.35

- **New layout: Luxury arc** (made for the HUD, offered on the cluster too): a wide shallow gold arc across the top, finely ticked, lit up to the rpm with a glowing marker and an amber redline section; the rpm in big gold digits; the gear in a gold pill between fading rules; the drive mode spelt out; seven gold pips as the rpm alert (red, flashing, at the shift point); up to four readouts left and right; gold ribbons at the lower corners.

### 1.2.34

- Sport dial takes the drive mode's colour: Sport red, Comfort blue, Eco sky blue (glow, rim, trims and readout accents; the rpm alert too).

### 1.2.33

- Sport dial and Classic dial are cluster-only: the HUD picker offers the other 13 layouts, and a HUD set to one of them falls back to the default design.

### 1.2.32

- **New layout: Sport dial** (HUD and cluster): a big round tachometer in a lit metal bezel with a red glow strongest at the rim, a dark inner disc, red neon trims framing the side wings, numbers from the redline in yellow and a yellow needle; the rpm in big digits inside, the gear in a box under it, the drive mode below; up to four readouts left and right, each with a segmented bar when the readouts are gauges. RPM alert: the dial's rim lights red up to the rpm, flashing at the shift point.
- **New layout: Classic dial**: a cream dial in a knurled chrome bezel on black, lit from the top left (shaded bezel, face and needle shadows, domed hub, glass highlight); red band from the redline, a bronze needle, the gear in a window under the hub, an oil temperature dial (C 50 - H 150 °C) in a green window at the bottom (new element: Temperature gauge), up to four readouts left and right; RPM alert lamp at the top.
- Readouts on both stand without a box background.
- Both dials keep their still face in its own cached picture, so only the needle repaints with the rpm.

### 1.2.31

- **Ramp (G80 M3/M4) redrawn after the G80/G82 cluster**: a cream band climbing from 0 and bending round at 2000 rpm, solid up to the rpm with a red end mark and only its top line past it, notched every 1000 rpm, yellow / red dashes in the redline zone; square digits for the 0-8 scale, the gear and the rpm (with a line and "rpm"); readouts under 6 and 8.
- **RPM alert on the ramp**: 6 slanted blocks from the bend to the redline and 2 longer ones past it, lit yellow with the rpm and all red from the shift point. New elements in Position / size: RPM alert and RPM number.

### 1.2.30

- English edition: the settings watermark shows only "BMW Coding" and the Naver address (no Korean cafe name or profile picture).

### 1.2.29

- Settings background now shows on the car: the car's renderer takes no pixel images, so the photo is drawn once into a cached layer as thin vertical gradient columns (1.2.28 showed it only on the PC preview).
- Cafe watermark (profile picture, 서울II잼님, Http://blog.naver.com/codingbmw, BMW Coding 배움터) in the free bottom-right corner of the HUD, cluster and navigation tabs, never over a setting.

### 1.2.28

- Settings screen background: the BMW Coding Study Cafe photo (sky and car), darkened so every menu stays readable. Built into the app (no extra file).

### 1.2.27

- HUD defaults tuned on the car: the default design (top alert bar and circle beside gear) two steps lower with the gear two more down and two to the left; analog needle upper readouts one step lower; mode ribbon one step lower; hexagon upper readouts one step lower; vector arcade one step lower. Added to stored positions, so stored 0 is the new default.

### 1.2.26

- Cluster yield choices: Do not yield / Yield during Waze guidance · all modes / Yield during Waze guidance · except Sport (in Sport and Sport+ the cluster RPM display stays while guiding).

### 1.2.25

- Cluster yield setting has two choices: Do not yield / Yield while guidance (Waze) shows on the HUD. The former "Any route guidance" reads as on.

### 1.2.24

- HUD defaults: data logger three steps lower, G-force rings two steps lower, mode ribbon one step lower.

### 1.2.23

- **Cluster yield now reaches the background app**: the setting was saved and shown in Settings, but the background app reads its settings by a fixed key list that did not include it, so it always ran as Off (the check line showed HUD O yet "not now"). With guidance on the HUD the cluster is now released.

### 1.2.22

- Analog needle readouts three more steps closer to the centre (six in all). Released as a new version so the Store offers the update.

### 1.2.21

- **Cluster yield follows the HUD**: with "When guidance shows on the HUD", the cluster RPM display is released whenever route guidance shows (or would show) on the HUD, Waze included, as well as on the phone guidance flags. The Navigation tab check line shows HUD O / X.
- **HUD defaults per layout, tuned on the car**: Whole layout lower by Down presses (Standard, 80s digital, VFD glow, G80 ramp 1; E60 dial, analog needle, G-force rings 2; F80 arc, M shift lights, hexagon 3; data logger and mode ribbon unchanged); readouts larger by default (M shift lights and hexagon 200 %, analog needle 150 %, G-force rings and mode ribbon 120 %), hexagon RPM number 150 %. Enlarged readouts spread from their group centre so they do not overlap; analog needle's lower readouts six steps higher, upper readouts four steps lower, all three steps closer to the centre; G-force rings' readouts two steps higher; hexagon readouts five steps closer to the centre, boost and oil three steps higher and the lower two three steps higher; M shift lights' readouts four steps higher. These are the new 0 / 100 % (Reset returns to them).
- **Outside temperature**: subscribed whenever the installed interface config has the field, whatever its getter / notifier entries are called (1.2.20 skipped it when they were named otherwise, which showed "signal not installed"). The check line now says whether the interface config is missing, the field is missing, or what the config holds.

### 1.2.20

- **Cluster yield to navigation actually applied**: 1.2.19 passed the yield to the wrong object, so the cluster never released. The cluster output is now released by the output manager (status "Route guidance active · cluster released"), and phone guidance counts when CarPlay / Android Auto reports either guidance flag (some apps such as Waze set only the metadata flag) or the guidance channel names the phone as guiding provider; held 8 s against flicker. The Navigation tab shows a live line: released or not, and CarPlay / Android Auto available / guidance / metadata.
- **Redline layouts start lower and can move down**: placed at first in the band the default design uses with the top 15 % left free (no element, the M mark included, above it); Whole layout and element X / Y may then move anywhere on the HUD picture, so Down always moves them (the taller layouts filled the band and could not move at all).
- **Outside temperature check line** on the HUD / cluster tabs when Outside temperature is chosen: the live value, or why there is none (signal not installed for this app, interface unavailable, subscription error, subscribed but nothing from the car yet, or the raw value received). Errors loading the interface are now reported in the status file.

### 1.2.19

- **Cluster yields to navigation** (Navigation tab, new row "Cluster · yield to navigation"): Off / Phone navigation (Waze and other CarPlay / Android Auto guidance) / Any route guidance (BMW + phone). While that guidance runs the cluster RPM display steps aside for the stock map (status "Route guidance active · cluster released"); the HUD is not affected. Kept outside app.json.
- **Redline layouts stay in the area the default design uses on the HUD**: the windscreen shows the top and outer edges of the 600x180 window poorly, so layouts are fitted to its inner area (top 12 %, bottom 5 %, sides 4 % left free, as the default design does). The taller layouts are scaled slightly to fit; no size or position can leave that area.
- **All** button in Position / size for the default design: selects every part; Size then scales them as one picture (the same factor for width and height of each part, gaps between parts scaled about the group centre), so the shape no longer changes.
- **No edge dead zone**: a Redline layout or element held at the HUD / cluster edge no longer keeps counting offsets it cannot show, so it comes back on the first opposite press; an overshoot stored by an earlier version is skipped. A Size already at the largest the area allows is not stored either.
- **Outside temperature**: subscribed only (no getter read), exactly as the eDrive app does, and the last value is kept across a provider gap. Redline layouts request their readouts whatever the default design's Aux left / right hide settings are.
- New app icon.
- Performance checked: host render times per frame 0.7–2.1 ms (HUD) and 2.0–6.0 ms (cluster) for the default design and all 13 layouts with the retained scene.

### 1.2.18

- **Positions and sizes per layout**: each design (the Cluster Redline design and every Redline layout, on the HUD and on the cluster separately) keeps its own Whole layout and element positions, sizes and hidden elements. Switching design saves the current one's and brings back the new one's (its defaults the first time). Save / load slots and Reset act on the current design.
- **Every layout inside the visible area**: a layout is fitted at 100 % to the HUD's 600x180 window (or the cluster area) by its drawn extent, so the taller layouts no longer reach past the bottom; a larger Size is capped and X / Y are clamped so the layout never leaves the window, and a moved or enlarged element is kept inside it too. Before, 380 combinations of layout, size and offset left the window.
- **Whole layout has one Size control** on a Redline layout. It showed Width and Height, and Height did nothing.
- The Design page's two pictures (Top alert bar, Circle beside gear) show those designs again while a Redline layout is chosen, and the Redline layouts button is the focused one then.
- Mode ribbon's drive-mode name is measured at its longest, so it is no longer cut off.

### 1.2.17

- Minimal and Split wings are no longer offered: Standard with elements hidden in Position / size covers them. The picker holds thirteen layouts; a display set to either falls back to the Cluster Redline design.

### 1.2.16

- The M mark's default place is set per layout where it has room, so it no longer covers a light or a readout when added (bottom left on Standard, 80s digital dash, VFD glow, Vector arcade and Dial; top left on Split wings, Arc and Ramp; beside the gear on M shift lights; top centre on Analog needle; top right elsewhere). A mark already moved keeps its offset from the new place.

### 1.2.15

- **M mark on every layout**: each of the fifteen layouts, on the HUD and the cluster, has an M mark element (the Cluster Redline design's own procedural mark). It is off until added with **Add M mark** in Position / size; once added it is selected, and moves, sizes and hides like any element, and is saved, loaded and reset with the layout (Reset removes it). **Remove M mark** takes it off.
- Position / size uses six columns when a layout has ten or more parts, so every part and Save / load fit (Hexagon with the mark has eleven).

### 1.2.14

- The Five dials layout is removed; Hexagon stays. The picker holds fifteen layouts. A HUD or cluster set to Five dials falls back to the Cluster Redline design.

### 1.2.13

- **Two more layouts** for the HUD and the cluster (the picker now holds sixteen, 4 x 4):
  - **Hexagon**: an angular hexagonal tachometer filling yellow and red past the redline, the gear in a hexagonal cell, RPM, two chevrons as the shift light, and up to four readouts in angled side boxes.
  - **Five dials**: a large round tachometer with needle, red zone and a row of five shift lights, the gear and RPM inside it, and up to four readouts in smaller round dials either side.
- Both are original designs; readouts follow the auxiliary setting and every element is adjustable in Position / size.

### 1.2.12

- **Five new layouts**, for the HUD and the cluster, listed after the Redline app's nine (Design → Redline app layouts, now a 4 x 4 picker):
  - **M shift lights**: 15 lights across the top (green, yellow, red to the shift point, flashing at it), a large gear, RPM and the readouts in one row.
  - **Data logger**: a 40-segment RPM bar with a scale, the gear in a box, RPM, and up to four readout tiles.
  - **Analog needle**: a half dial with the red zone from the redline, a needle, the gear, and up to four readouts in the corners.
  - **G-force + RPM rings**: a G meter (dot and total G) beside a 270° RPM ring with the gear, RPM and the readouts between them. The G-force is read for the meter even when it is not a readout.
  - **Mode ribbon**: a curved ribbon filling with RPM in the drive mode's colour (Comfort blue, Sport orange, Eco green), the gear and the drive mode, and up to four readouts.
- Their readouts are the display's own auxiliary items, as in the other layouts. They use a taller 400x176 image (cluster 800x352 at 100 %); every element moves, sizes and hides on its own (the rings add a G-force meter element) and is saved, loaded and reset with the other parts.

### 1.2.11

- **Redline app layouts on the cluster**: Cluster display settings → Design now offers the nine Redline app layouts (Standard, Minimal, Split wings, 80s digital dash, VFD glow, Vector arcade, Arc, Ramp, Dial) beside Top alert bar and Circle beside gear. A layout replaces the cluster face: 800x260 at 100 %, centred in the cluster area, with the cluster's own auxiliary items. Position / size works as on the HUD: Whole layout, then each element moves, sizes and hides on its own and is saved, loaded and reset with the cluster's other parts. The HUD and the cluster choose their designs separately (stored outside `app.json` like the HUD design).

### 1.2.10

- The two shift alert rows in the Basic settings are named for the modes they apply to: **Shift alert RPM · Sport** and **Shift alert RPM · Comfort / Eco**, whose automatic choice reads *Automatic (90 % of Sport)*. Behaviour is unchanged.

### 1.2.9

- **Comfort / Eco shift alert RPM** (Basic settings, under Shift alert RPM): *Automatic* keeps today's comfort shift point, 90 % of the shift alert RPM (Petrol 5500 -> 5000, lights from 2500). A set RPM (2000 to 5000) becomes the shift point in every non-sport mode (Comfort, Comfort+, Eco Pro and the others): the alert turns red there, with lights from 50 % and yellow from 80 % of it. Sport modes keep the shift alert RPM. Like the HUD design, the setting is kept outside `app.json` so the Store's settings templates stay valid. The Basic tab's rows are slightly shorter so the seven rows fit.

### 1.2.8

- **Redline app layouts, element by element**: with a Redline app layout chosen as the HUD design, Position / size lists *Whole layout* (as before) and then each element of that layout: gear, drive mode, RPM alert, RPM number, RPM gauge and the readouts (one group on Standard, 80s digital dash, VFD glow and Vector arcade; each readout on its own on Arc, Ramp and Dial, Ramp's line over the first readout going with it). Each moves, sizes (one Size control: text keeps its proportions) and hides on its own, and is saved, loaded and reset with the other parts. Each element is painted at its own final size, so moved and enlarged elements stay sharp; at default positions the layout looks as before. Layouts only offer the elements they draw (Vector arcade has no RPM number; Minimal and Split wings no readouts).
- The element positions are stored with the app's other saved settings outside `app.json` (as the HUD design is), so the Store's settings templates stay valid. They are shared by the nine layouts.
- **Clock in Korean time**: the Korean version shows the clock readout in Korean time (UTC+9) unless *Head unit time* was chosen; the head unit's own clock is usually UTC. The English version keeps the head unit time by default.

### 1.2.7

- Outside temperature is read the way the eDrive app reads it: from `EnvironmentalInformation.ExteriorTemperature` notifications whenever the car sends them, no longer by polling the getter every 10 s on cars that offer both (some cars' getter answers without a usable value, so the HUD showed `--` while eDrive showed the temperature). An invalid reading (e.g. 255 while the sensor settles) keeps the last good value, as eDrive does; losing the interface still clears it. Cars with only a getter keep polling. Install-time access (`r` / `s` / `rs`) is unchanged.

### 1.2.6

- Outside temperature now shows on cars that publish `EnvironmentalInformation.ExteriorTemperature` only as a notification (no getter). The Store build used to drop a field without a getter and the worker only polled; the field is now subscribed (`s`) and the last notified value is kept while the interface is available, as the eDrive app does. Cars with a getter keep `r`/`rs` and polling. A fractional raw value (0.5 °C steps) is accepted.
- Position / size ends when the settings screen is left by any means (home button, another app, screen change), not only with Back: the layout editor closes and the moving-part preview is cleared. A preview left over from a previous start is cleared at start-up; the 2-minute expiry stays as a backstop.

### 1.2.5

- HUD design can be one of the Redline app's nine HUD layouts (Standard, Minimal, Split wings, 80s digital dash, VFD glow, Vector arcade, Arc after the F80 M3/M4, Ramp after the G80 M3/M4, Dial after the E60 M5), ported from appsKOR `apps/redline` (cauliflowermossgrape/idrive7-apps Redline, HUD output by @biscotit, MIT). Design → Redline app layouts, with live previews; Cluster Redline's own designs switch back.
- The layout replaces the RPM face and uses Cluster Redline's data: rpm, gear (mode letter), the drive-mode shift point (lights count the last 1500 rpm and flash at it), the red zone, and the selected auxiliary items as its readouts. Navigation, lanes and text stay alongside. Painted at HUD size (400x130 at the default HUD size); Position / size moves and scales it as the RPM gauge.
- Not ported: Redline's learning (rev limit, best upshift, reaction time), shift grades, downshift cue and peak hold. The Redline app itself is not needed.

### 1.2.4

- Redraw HUD lane guidance in the style of stock lane boards: fixed-size lanes with dashed dividers and solid outer edges, and arrows with filled heads built from straight lines, single-pass arcs and triangles. Arrow size no longer shrinks as the lane count grows; only a lane whose combined directions are too wide is narrowed. A U-turn sharing a lane with the same-side turn is drawn above it.
- Paint the lane row directly at its HUD size instead of resampling a 240x72 image to the selected scale, which dropped pixel rows/columns and broke thin strokes. Lane data, recommendation colours, freshness rules and positions are unchanged.
- Simplified road diagrams on the HUD for forks, branches, roundabouts (exit number), highway entries/exits, keep-on-main-road and lane changes; plain turns, U-turns and arrivals keep the large arrow. The vehicle data has no junction geometry, so shapes are generic (unused roads are faint). Direction and text tiles also paint at HUD size.
- Sharper small text: area-averaged glyph reduction and a thicker Korean face where bold is requested (the Korean atlas has one 36 px regular size). HUD auxiliary labels/units/scale numbers are larger (15.4/12.1/13.2 → 19/14/15 px) and a long label shrinks instead of colliding with its value.
- Cluster RPM bar gets depth (lit and glossy top, shaded bottom, recessed track) using whole-length overlays; the HUD bar stays flat because dark shading dims a HUD.
- Auxiliary gauges get depth (lit top, shaded bottom, gloss, shadow on the cluster); oil/outside temperature use a glass thermometer with a red liquid column and scale marks.
- New gauge-only Clock item (HH:MM) for HUD and cluster, one auxiliary slot; time from the head unit or a fixed UTC+9 choice in the gauge picker.
- Shift alert follows the drive mode: Sport (and unknown) keeps 65/85/100 % of the shift RPM; Comfort/Eco and other modes use 90 % of it (Petrol 5500 → 5000) with lights from 50 % (2500), yellow from 80 % (4000) and red at 100 % (5000).
- Position / size: Save / load with three slots per tab (HUD, CLUSTER, NAV) and a two-press reset to defaults. While a part is selected it is drawn even when hidden, unused in the drive mode or without guidance (sample arrow, text and lanes; lit RPM alert); the marker expires two minutes after the last edit and clears on Back.
- Status file records exterior-temperature diagnostics (missing interface, read failure, raw value and why it was rejected) to locate the missing outside temperature.
- New settings use keys outside the schema and Korean labels are carried in the app, so the Store runtime templates stay unchanged.

### 1.2.3

- Speed up scaled component blits used for moved/resized parts and navigation tiles: compute the source column table once per blit and copy opaque or uncovered pixels directly. Output stays bit-identical (new `blit-scaled` regression test); host measurements show about 2x faster translucent and about 7x faster opaque parts. No visual, setting or signal changes.

### 1.2.2

- Retain bounded per-output component rasters and projected tiles. Reuse static RPM tracks/ticks, M marks and unchanged auxiliary/navigation parts; clear/recompose only damaged regions when values, geometry or visibility change. Reuse the sent-frame buffer and cache projection lookups to avoid per-pixel allocation churn.
- Compare only visible per-display pixel inputs. Ignore navigation age/status metadata and values used only by the other display; direction, text and lanes have separate cache keys. Keep the existing native layer count, freshness/mode guards and stock-popup yielding.
- Keep RPM/core live sampling unchanged. Poll oil/SOC/economy at 5 seconds, outside temperature at 10 seconds and successful battery voltage at 5 seconds; consume fresh notifications immediately, align bounded slow-source freshness windows, and stop hidden streams as before.
- While the ordered image transport is blocked, skip intermediate raster work and render current live state when writable. Preserve the one latest image buffer and frame-before-show/contention order.
- Complete Korean display-tab, option and instruction labels, preserving signal IDs, app names, units and phone-supplied road text. Check the actual Korean settings renders for untranslated UI labels.

- Opt the app's custom settings page out of the unused generic HMI settings synchronizer. Two layout coordinate changes previously triggered 370 generic settings updates in the host reproduction; keep generic settings behavior unchanged for other apps.
- Persist multi-selection moves, resizes and visibility changes in one settings batch. Coalesce UI requests into the latest complete page, serialize image delivery, and write static native button labels only once.
- Reproduced the reported output loss in the supplied 1.2.1 logs with inactive navigation: the app PID stayed unchanged while HMI updates timed out, status updates paused for up to 7.949 seconds and stale RPM/mode checks hid both outputs. The fix is host-tested; real-vehicle and unattended-driving validation remain pending.

### 1.2.1

- Add per-component visibility and toggleable multi-selection to HUD/cluster/NAV position controls. Move selected elements together; resize a HUD/cluster group in both dimensions within the existing aspect limits, and retain separate width/height for one element. Give NAV direction, text and lanes independent position/size/visibility and add Stock NAV mode.
- Stop hidden-only field subscriptions and polling, re-open only the latest requested field mask and reject late hidden replies. Keep shared inputs only for visible dependents (e.g. RPM for power/voltage); NAV Stock/all-hidden stops app guidance reads, and lane-only guidance does not query turn/text/RPM inputs. Core polling is owned by the worker, without SDK intervals surviving shutdown.
- Use a Battery12V-style segmented charge icon, move HUD text auxiliary defaults down one 10px step and preserve full Hangul glyph bounds during transforms. Round the U-turn arch in both maneuver and lane arrows.
- Add optional CarPlay recommended-lane arrows below HUD turn guidance, highlighting only the supplied recommended lanes. Use independent lane position/scale/visibility and the selected navigation colour; clear absent/stale lanes independently, reject later/oversized lane groups, and stop lane polling outside active CarPlay NAV. Missing lane capability does not block installation or existing RPM/turn output.
- Poll optional auxiliary sources only when a selected, enabled RPM display uses them. Deselection rejects late getter replies and stops optional polling; retain shared subscriptions and core RPM/torque/mode reads.
- Keep the selected HUD RPM image alive when Android Auto/CarPlay maneuver data expires, is unavailable or is being refreshed. Clear unavailable arrows and downgrade native-slot contention instead of dropping and re-uploading the entire image. Navigation-only output still stops when no valid app maneuver remains.
- Change HUD contention on the existing image; acquire priority only after replacement pixels have been sent, and cancel queued acquisition on stale guidance, shutdown or disconnect. Preserve native stock-popup yielding and renderer safety checks. Host regression checks cover delayed/empty phone replies and socket backpressure; real-vehicle validation remains pending.

### 1.2.0

- Split HUD/cluster auxiliary placement into left and right groups, retaining ordered one-to-four text placement. HUD circle alerts transform together with gear; the top alert bar remains independent.
- Move the circle HUD face down two existing 10px source steps and default both cluster auxiliary groups to (0,50) in either style. Add independently positioned HUD M and cluster upper/lower M marks, each with separate line/mark visibility controls. Moving an M leaves its line anchored.
- Rename Light gray to Gray and use medium gray arrows. Default NAV text offsets to (180,10), 156×31px (65%); direction offsets (210,30), 168×78px (70%). Migrate once, then preserve later edits.
- Add optional 12V battery SOC, battery voltage and average fuel economy (km/L). Render SOC as a battery, lateral G as a filled dot in a rectangular track, and voltage/economy as text even in gauge mode. Battery voltage uses lazy bounded read-only OBD 01/PID42 or UDS22/F442 queries, only for a selected active display and within an engine-activity window; stop/deselect/provider/freshness guards retain -- for unavailable data.
- Expand capability filtering without dropping required RPM/torque/unit inputs; validate the optional voltage transport's service/version/instance/method/event and keep only the named request/response pair. Korean/English host and optional-installer checks pass; real-vehicle validation remains pending.

### 1.1.0

- Show selected component width × height in pixels alongside placement coordinates. Move default HUD navigation text/direction just beyond the RPM gauge right edge, migrate once and retain subsequent user positioning; bound long text to the right-hand column.

- Replace Advanced settings with independent HUD / CLUSTER / NAV tabs. Add ordered auxiliary metric drafts committed only by OK, six optional live metrics, two per-display alert designs, component placement and bounded aspect scaling, separate uniform direction/text navigation transforms and three arrow colours.
- Render the currently received maneuver description above HUD guidance; keep text bound to the same route/provider lifecycle and include Hangul glyphs in both language packages. Allow navigation-only HUD output with stock RPM selected and an All / Except Sport navigation choice.
- Default to a filled circle beside the gear, migrate once without resetting later choices, preserve shift thresholds/blinking and keep warnings legible when gear data is unavailable. Missing/stale auxiliary values display --; optional field filtering cannot remove core RPM/torque inputs.
- Preserve highway entry/exit branch types and show a localized entry/exit notification, supplied distance and direction diagram alongside HUD RPM. Reuse HUD navigation placement/size controls.
- Use the same blue for HUD turn, fork and highway arrows while keeping guidance labels and distances white.
- Refresh entry/exit changes at unchanged RPM/distance/direction, reject conflicting HUD branch identities, and retain existing route/provider freshness and stop behavior. Cover all six catalog entry/exit variants and bilingual composition with host tests; vehicle verification is pending.

### 1.0.10

- Add HUD appearance settings with native-vector RPM previews, top-bar or filled-circle shift alerts, and torque/power Gauges / Values only / Off modes.
- Remove the upper HUD M, use a 90%-height RPM bar and 10% larger text, move metrics upward, shrink auxiliary gauges by 10% in both dimensions and raise the lower M/frame with scale-label clearance. Align gear and warning beside the upper RPM bar.
- Preserve original alert thresholds and flash timing; hide the filled circle below the original first-green threshold. Repaint appearance changes even at constant RPM.
- Add optional, query-only GuidanceEventList route reads using the enum-name form confirmed by an Android Auto diagnostic. Guard source/lifecycle changes, stale values, unreadable first events and stop/reconnect races. Real-vehicle composition and CarPlay delivery remain unverified.

### 1.0.9

- Add optional read-only discovery of existing HUD/HIGH_GUIDING views and decode their associatedEvent when the common channel supplies an empty POI.
- Keep composed HUD stable across repeated common POI notifications; bind reads to live route/provider epochs and stop on ambiguous/stale/unavailable data.
- Strict optional interface filtering for Store/desktop, no new view/stream/config writes, and HUD-view status diagnostics. Schema/mock validation only; actual vehicle data delivery and coexistence remain unconfirmed.

### 1.0.8

- Add bounded diagnostics for the received POI category, formatted distance and resource icon handles; omit road/destination text, redact URL credentials and clear diagnostics on source/lifecycle loss.
- No extra vehicle getter or resource URL requests. This is a diagnostic release, not a confirmed HUD navigation coexistence fix;1.0.7 UI remains.

### 1.0.7

- Reduce cluster side-gauge labels/values to about90% (rounded pixel fonts), increase bar height22→26px, swap the upper M/frame and shift-light positions while preserving black unlit cells.

- Enlarge cluster torque/power bars and values; share a lavender-to-red RPM ramp from2500rpm to the preset maximum (7000rpm on G20 petrol).
- Separate next-launch auto-start preference from live worker Start/Stop controls. Stop tears down subscriptions/rendering while the settings host remains available.
- Move submenu Back controls to the bottom right. Keep two display selections: Sport and All, with all valid catalog modes recognized in All.
- Uploaded1.0.6 log confirms maneuver_unsupported while phone guidance is active. Add documented bend/lane-change/arrival decoding and last-maneuver-kind diagnostics; the received variant and real-car resolution remain unconfirmed. Ease RPM colours gently from2500 to purple at3500. Host decoder/worker, lifecycle, UI, rendering/delta and bilingual package checks cover this release; physical vehicle navigation coexistence remains unconfirmed.

### 1.0.6

- Separate Android Auto/CarPlay projected-guidance activation from native navigation state. Require a fresh matching provider, invalidate old arrows on route/source/lifecycle changes, and filter optional manager access against the vehicle catalog.

### 1.0.5

- Fix repeated state notifications starving guidance polling and old getter replies overwriting newer turns. Retain route/provider ordering and stock-HUD fallback.

### 1.0.4

- Restore the 800×240 HUD face with large side gauges and metallic M marks; share the cluster RPM palette.
- Compose supported turn arrows and supplied distances, with separate HUD navigation position/size controls. Unreadable guidance preserves stock HUD. Vehicle coexistence was not confirmed.

### 1.0.3

- Retain both output layers on fresh zero RPM after engine operation; restart updates the same image. Cold boot, invalid/stale data, OFF and mode/lifecycle release remain guarded.
- Render HUD from the cluster face with matching palette, positions, units and red shift-light pulse phase. Preserve aspect at800×353 and use actual painter geometry in the layout editor.
- Replace top/bottom line-drawn M with cached transparent tricolour/filled metallic marks.
- Add stop/start continuity, shared-face/alpha/delta and mark-render checks; retain1.0.2 named Guidance install fix. Vehicle readability and automatic stop/start still require car verification.

### 1.0.2

- Fix Guidance installation/runtime instance mismatch: declare Main_Instance instead of inherited default 1.
- Require the named catalog instance and a valid getter ID before retaining optional Guidance in Store and desktop installs; otherwise keep HUD released and allow the app to install without that proxy.
- Add named-instance/getter compatibility cases and assertions on both language artifacts. Actual vehicle generator success still needs confirmation.

### 1.0.1

- Read OEM navigation guidanceState (getter only) and release HUD during calculation/guidance, unknown/stale/provider-loss states; keep cluster independent. Omit unavailable optional getter at install time.
- Add compact torque/power HUD gauges flanking RPM with exact bounded placement, converted values/scales/peaks and independent deltas.
- Recover only verified transient image/protocol errors with three bounded backoff attempts; retain native ownership/guard policy and record recovery diagnostics.
- Provide a separately tested upstream native parked-recovery source patch. The app does not install it; reported Assist recovery still needs vehicle logs/renderer validation.

### 1.0.0

- Independent HUD/cluster Redline/Stock choices for Sport and all-mode configurations.
- Large live position/width/height controls and temporary bounded coordinate readout.
- Compact M-style HUD with right-side gear, yellow warning and red flashing shift alert.
- Move shift threshold to Basic; preset Petrol/eDrive/M 5500 rpm, retain Diesel 4200 and saved custom values.
- Fix HUD contend flag that could block newly arriving factory guidance. Require native renderer 0.4.0 and preserve its HUD yield policy. Same-slot concurrent OEM guidance/Redline composition remains unsupported.
- Host app/UI checks plus upstream 0.4.0 native slot suite (268 checks); no real-car validation.

### 0.9.2

- Return cluster output to the map target with content-class contention and map guide hold. Continue to yield to Assist/route-preview ownership; no immediate-takeover guarantee.

### 0.9.1

- Test a contending HUD request based on the upstream map-feed approach and add read-only HUD diagnostics. Later releases restrict HUD contention to valid composed navigation.

### 0.9.0

- Add an optional 800×240 HUD RPM, gear and shift-alert face, HUD target validation and aspect-preserving placement. Actual vehicle HUD coexistence remained unverified.

### 0.8.7

- Increase settings text, tab size and touch targets. Use two large tabs and four wide bottom controls while retaining native RHMI input.

### 0.8.5

- Fix installation failure on notifier-only gearbox-program fields by removing the unavailable getter request.

### 0.8.4

- Display the running app version on both GPU and software settings screens to distinguish stale installations.

### 0.8.3

- Add orange Cluster renderer installation guidance in English and Korean.
- Fix the requested refresh ceiling at 20fps and remove its settings selector.
- Ignore saved legacy frame rates and retain other settings and acquisition behavior.
- Update screen layout and both SDK-free Store language templates. Actual sustained frame rate remains car-dependent.

### 0.8.2

- Defer initial image visibility until queued pixels reach the ordered socket; cancel late visibility on hide/drop.
- Keep map acquisition requests alive while parked; test backpressure, delayed acquisition and cancellation.
- Tell map-target users to select Map view or Off; preserve front-center guidance.
- Include a read-only Windows SSH log collector. Native DCSM retry timing and Assist priority remain unchanged.

### 0.8.1

- Match the Live Data header: title and Basic/Advanced tabs in one strip.
- Use a plain black list, thin dividers, M color strip and subtle red selection.
- Keep orange setup guidance, setting behavior and native bar fallback controls.

### 0.8.0

- Add Basic/Advanced settings tabs and an orange Central display area Off instruction.
- Add a persisted output-worker switch, Sport/all-mode selection and Petrol/Diesel/eDrive/M display presets.
- Convert power/torque values, peaks and scales for PS/kW and Nm/kgf·m.
- Retire manual gearbox prefixes and RPM/torque/power scales; use received programmes and preset scales.
- Preserve legacy OFF and shift settings, shut down late subscriptions, and keep native RHMI controls.
- Document ongoing stock-map/Assisted Driving View overlay investigation; no claimed fix for scene priority.

### 0.7.0

- Merge received gear and programme signals without letting empty fields erase valid gear. Add optional MDrive programme handling, restore shift blinking, and enlarge gauges. Historical manual-prefix controls were later retired.

### 0.6.0

- Replace the opaque panel rectangle with transparent unused pixels and make widget sizing adjustable. Reuse the output layer for settings changes.

### 0.5.0

- Introduce the experimental front-center panel target and frame-rate choices for comparison with map output. Later releases retire panel selection and fix the request ceiling at 20 fps.

### 0.4.0

- Accept a 2000 rpm custom shift threshold for petrol/hybrid presets, highlight threshold RPM digits, show received gear and improve renderer discovery and diagnostics.

## Repository and initial app releases

### 1.3.1

- Cluster Redline 0.4.1: G20 330i petrol scale maximum 7000 rpm and red zone from 6000 rpm.
- Keep the shift alert independent of the red-zone start, and color filled red-zone segments red.
- Preserve saved custom settings and the diesel/hybrid presets.

### 1.3.0

- Cluster Redline 0.4.0 fixes the ignored 2000 rpm setting for petrol/hybrid profiles.
- Turn RPM digits red at the configured threshold; match M Tricolour styling and show real gear.
- Remove the cluster title and shift footer.
- Give Sport content precedence over lower map layers and report target holder/state.
- Discover renderer metadata in both deployed layouts and distinguish 0.3.1 from 0.3.10.
- Include a read-only-by-default renderer diagnostic with explicit reversible takeover setup in normal kits.

### 1.2.0

- Use the normal upstream build, --language ko, make-car-kit and push-to-car workflow.
- Make Cluster Redline 0.3.0 English by default, with Korean in the shared catalog.
- Preserve explicit autostart metadata through the standard builder and installer.
- Check cluster-render requirements before the cluster app is installed.
- Retain the normal backup/restore flow and manual startup for existing apps.
- Test the standard installer functions on a temporary OAP tree and build all 17 apps together.
- Retire the separate private-ZIP installer path.

### 1.1.0

- Place Cluster Redline 0.2.1 directly in apps/cluster_redline alongside Circuit.
- Separate English and Korean guides for both apps; make the root README an app index.
- Translate Cluster Redline renderer choices, mode and layer status labels.
- Build both Korean apps into one private kit, or select a single app.
- Preserve Circuit's manual startup and Cluster Redline's autostart metadata.
- Verify every selected artifact before sequential installation; ignore stray old bundles.
- Add combined-kit and isolated single-app release tests. No real-vehicle validation yet.

### 1.0.0

- Initial public source release.
- 30 deterministic puzzle levels.
- Touch, iDrive controller and software-renderer fallback controls.
- Undo, hints, PAR, star scores and persistent progress.
- Parked-only input guard and Korean localization overlay.
