# Changelog

Version history is kept here. For current usage, see [Cluster Redline](docs/CLUSTER-REDLINE.ko.md).

## Cluster Redline 1.3.100 (cut-in and pedestrian / cyclist warnings on the lane picture)

- **New: cut-in and pedestrian / cyclist warnings** on the HUD lane picture, **on by default**. HUD lamps → **Cut-in and pedestrian warnings** (끼어들기·보행자 경고) turns them off. They show with the lane lines (from the lead-car helper's camera objects and lane lines).
- **Cut-in**:
  - A vehicle that drove beside us in the next lane for at least 1 s, now coming into our lane at 0.5-2.5 m/s, 3-35 m ahead, with us at 20 km/h or more.
  - Bends and our own lane change are allowed for: the lane's angle is taken off the sideways place, and nothing is judged for 2 s while a line is under our car.
  - Cars crossing at junctions and cars overtaking beside us do not warn.
- **Pedestrian / cyclist**: reached within 2.5 s (from 5 km/h), and in our path then or now (within 1.3 m of the car's axis).
- **Shown**: that road user at its place on the picture, lit amber (red once it is on our line, and always red for a pedestrian or cyclist), with an arrow towards our lane; "Cut-in" / "Pedestrian" / "Cyclist" and the distance in the top corner away from it. One object warns again only after 3 s; a warning stays up to 2.5 s.
- **Where the rules come from**: the user's 32 recorded scenes (1.3.89 scene clips, 2026-11-27, city driving), worked out in another session and checked here again: on those they warn once, at the one real cut-in (35 m ahead, about 1 s before the car reached the middle of our lane), and never otherwise. The earlier idea (warn when the car ahead changes to a nearer one) missed that cut-in: the camera had already taken the car as the one ahead while it was still in the next lane. Missed cases could not be checked (only one real cut-in was recorded).
- Tests: `road-alerts` (a cut-in after driving beside us, red on the line, none for crossing, overtaking, our lane change or under 20 km/h, a pedestrian in our path, the lane picture, on by default); the replay of the 32 scenes gives the same single warning.

## Cluster Redline 1.3.99 (speed cameras from the public list, one new alert badge)

- **Speed camera alerts without the car navigation's guidance.** The car's own navigation sends camera events only while it guides a route. Cluster Redline now also uses the public camera list with the car's position from the lead-car helper (redline-lead 0.6.0+, checked on the user's car: about once a second, in Korea).
  - **The list**: 공공데이터포털 전국무인교통단속카메라표준데이터 (44,650 cameras, data as of 2026-10). Kept: the 22,488 that check speed and have a limit, plus signal cameras inside children's and elderly zones. Section cameras with their length. Built into the app (`speed-cams-data.js`, 360 KB, read only while the alerts run) by `tools/speed-cams/fetch.py` and `build.py`.
  - **Which camera**: ahead along the way the car is going, within 25 m to the side, getting nearer. From 300 m, or from 500 m at 80 km/h and up. Let go once passed. Between positions the distance is carried on with the speed.
  - **Section cameras**: after the section's start camera, the average speed (distance over time) and what is left of the section.
  - **A limit of the list**: it has no direction a camera faces. On a road with both directions close together, a camera for the other direction can show.
  - Nothing is written anywhere; positions are not kept.
- **One badge, the new design** (the user's choice), in the vehicle alerts' place (NAV Position / size):
  - The speed limit sign on the left. On the right: what it is, how far (or the section's average), and the speed now.
  - Cyan within the limit. Amber edge in a children's or elderly zone. Red over the limit, with "Slow down" (a section: by its average).
  - One alert at a time: a speed camera, then a children's zone, then speeding against a recognised sign.
- **The car navigation's own events come first**: while it sends a camera, that one shows (it knows the direction). The list fills in otherwise.
- **New option** (Navigation display settings): **Speed cameras**: Navigation + public camera list (default) / Navigation only.
- Tests: `speed-cams` (the list, ahead / passed / behind / to the side, zone, section average, range by speed, stale position, the worker's badge with the navigation first, Navigation only), `car-alerts` (one badge).

## Cluster Redline 1.3.98 (the Redline HUD hides Waze on Map's HUD map in Sport)

- **Fix: on the HUD, Waze on Map's map and the Redline HUD showed on top of each other.**
  - Both are layers of the same HUD picture (cluster-render). The Redline HUD's layer did not hide the ones under it, so Waze showed through its see-through parts.
  - The cluster was already fine: its layer hides the ones under it.
- **New option** (HUD display settings, last row): **HUD · hide Waze** (HUD · Waze 가리기).
  - **In Sport only** is the default.
  - **Whenever the Redline HUD shows** is the second choice.
  - **Do not hide** keeps it as before.
- While it applies, the Redline HUD's layer is set to hide the layers under it, in place (no new layer). Waze on Map's HUD map waits behind it and comes back when Sport ends.
  - Redline's own alerts (turn signals, lead car, lane lines) are above it and still show.
  - The car's own HUD content (speed, limit, ACC) is not affected.
  - Waze on Map itself is not touched (it has no command for this).
- Tests: `hud-hide-waze` (Sport by default, always, never; the cluster unchanged).

## Cluster Redline 1.3.97 (the cluster gives way to the cruise control display; lane picture of a fixed lane)

- **Fix: the car's cruise control (ACC) display was hidden behind Cluster Redline on some cars** (reported: shown with the original Redline, not with Cluster Redline).
  - Cluster Redline's cluster picture takes the cluster's centre from the car's own content there. On cars that show the ACC display in that centre, it was kept away.
- **The cluster now gives way while ACC shows**, the way it does for route guidance:
  - The car's own ACC display comes up.
  - Cluster Redline comes back 2 s after ACC goes off.
  - The status reads "Cruise control on · cluster released for the car display".
- **How it knows**: the lead-car helper **0.7.0** reads FASuS `displayDriverAssistenceSystemLongitudinalGuidance` (0xB50E, instance 1) as root, only while the app runs.
  - Checked on the user's car: bytes 3-5 are `00 00 00` with ACC off and `13 00 20` with it on.
  - Without the helper nothing changes.
- **New option** (Cluster display settings, last row): **Cluster · yield to cruise control** (계기판 · 크루즈(ACC)에 양보).
  - **Yield while the ACC display shows** is the default.
  - **Do not yield** keeps it as before; the helper is then not asked.
  - The option is kept in Favorites.
- **Lane lines picture redrawn** (the user's request and reference):
  - **One lane of a fixed width**, our car fitted in it (about half of it). The lines no longer move or widen with what the camera measures.
  - **A warning colours only its side**: near the right line, the lane's right half and the right line turn amber; on the line, red. The same on the left. No more both lines coloured, no red glow under the car.
  - **A line the camera does not see is drawn where it would be** (a white dashed line); the warnings come from the line that is seen.
  - **Always the same picture**: no fading when the lines are lost.
  - The lines (10 cm) and their glow are thinner, to suit the narrower lane.
  - Line kinds and colours as before: dashed, short dashed, solid, double, road edge; white or yellow.
- Cluster Redline requires redline-lead 0.7.0.
- Tests: `lane-lines` (no fading, the lane not widened by the measured lines, a virtual line, only the warned half coloured), `korean-ui` (ACC kept as a term), `redline-lead` (ACC off / on from the car's own messages), `acc-yield` (the cluster released while ACC shows, back 2 s after; the HUD untouched).

## Cluster Redline 1.3.96 (Position check gets the car's position through the helper)

- **Fix: the Position check showed nothing.** The car's position services are not given to the app's own account. Checked on the user's car (root, 2026-11-28):
  - **Positioning** (0xFB0C) is offered on instance 128 (Main_Instance) and sends `currentLocation` (326 bytes).
  - NavigationStatus and PositioningCAN are offered on no instance.
- **The lead-car helper 0.6.0 reads it** as root, the way it reads the camera and the lanes:
  - `currentLocation` (map matched) and `rawPositionData` (GNSS).
  - The latitude and longitude come out of each one's Wgs84Coordinate3D (`coordinatesValid`, `heightValid`, longitude, latitude as doubles).
  - It reads only while the Position check is on (the app asks every second; 5 s without asking and it stops).
  - Nothing is written to a file or a log.
- **Position check screen**: the two helper sources come first (`redline-lead.Positioning.currentLocation`, `rawPositionData`), with the helper's state when it is missing or older than 0.6.0.
- Cluster Redline requires redline-lead 0.6.0.
- Tests: `redline-lead` (the coordinate found inside a longer message, none in empty or random bytes), `position` (the helper's position used, the state shown).

## Cluster Redline 1.3.95 (lane lines calmer and kept; departure alert works at lights; log collection cleaned up)

- The user found the amber lane warning too frequent. It was shown at once whenever the car's side came within 15 cm of a line.
- **Amber now only when it lasts**: near a line for **0.7 s**, and off again only 10 cm further out (no flicker at the edge).
- **None under 30 km/h** (traffic jams, side streets, car parks).
- **New: Warning sensitivity** on the Lane lines screen (경고 민감도):
  - **Low (5 cm, the new default)**
  - **Normal** (15 cm, as before but with the 0.7 s)
  - **Off** (no amber)
- Red (over the line) and blue (a lane change with the turn signal) are shown at once, as before.
- **Lane lines drawn straight ahead.** The user found the lines swinging and bending right and left: the camera's heading of each line moved them about. They are now straight, at the line's place by the car, and that place is smoothed (a third of the way a frame; a jump over 0.8 m, another line, is taken at once).
- **Lane lines no longer vanish when the camera loses the lines** (38 % of the user's town driving had none: junctions, worn paint, a close car hiding them).
  - The last lines stay as they were for 3 s, without warnings.
  - After that the road and the lines are faint (a third of their strength), while the car ahead and our car stay as ever, until the lines come back.
  - With no lines seen yet, a usual 3.3 m lane is drawn faint.
- **Lead car departure: from the user's drive (none in 26 minutes before), two causes and quicker.**
  - At a light, the camera often says nothing of the lane, so no car followed. The car right in front is now taken from the helper's objects: the nearest within 1.2 m of our axis.
  - At rest the car sends no speed, which reset the check each time. A speed that stops coming while we stand still counts as a stand.
  - Quicker: 1 s standing, a car within 20 m, 1.5 m further for 0.3 s (or lost from within 12 m).
  - The same drive replayed: 6 alerts, each a car moving off while we stood.
- **Log collection cleaned up (the user's choice).** The scene recording (1.3.89) is gone: its screen, its commands and the helper's clips and `log-objects.js`. Clips already on the car stay in `/var/opt/public/redline-clips/`; delete them with `rm -rf` if not wanted. The Position check stays.
- **The nav-probe log** (Navigation display → Received turns → Record to a file) is switched off once by this update. It can be switched on again.
- **New: Download by QR** on the Received turns screen. While it is on, the lead-car helper (**0.5.0**) opens a small read-only page with `nav-probe.log`, and the screen shows its address as a QR code.
  - The page opens whether the engine runs or not, and the QR shows only while the page answers.
  - The car's own Wi-Fi address comes first; **Next address** steps through the others, for a Wi-Fi the car joined.
  - The firewall rule lets private addresses in on any interface.
  - Only that one file can be given.
  - The page is on port **18885**. 0.4.0 used 18884, which is also the port the GIF player uses to lend its GIFs to Cluster Redline. With the GIF player running, the page could not open: that is why the QR earlier showed but the page did not load.
- **Checked: settings and animations switched at random** (13,000+ random settings taps with the Animation layout, 5 own GIFs and the engine running; real drawing). No error, no growing memory, slowest step 0.2 s.
- Cluster Redline requires redline-lead 0.5.0.
- Tests: `lane-lines` covers the 0.7 s, the release, low / normal / off, low speed and red at once.

## Cluster Redline 1.3.94 (Animation: the M3 turns into the bend)

- **Fix: in a bend the Animation car leaned out of it** (a left bend tipped it to the right) instead of turning into it. Cornering steps 1-3 are now the owner's pictures of the M3 in a left bend, **its nose turned into the bend about the tail lamps**: 10° (step 1, from 0.10 G), 20° (step 2, from 0.25 G) and 30° (step 3, from 0.35 G). Step 4 (from 0.50 G) is the drift, as before.
  - Each picture's car is cut out (OpenCV GrabCut, its tyres added) and sways a little about its tail lamps over the road filled in under it, with tyre smoke from the rear growing with the step. A right bend is them mirrored. The HUD set has the car alone on black.
  - Pictures: `tools/car-meter/m3-turn10.png`, `m3-turn20.png`, `m3-turn30.png`; the M3 from behind (straight on, braking, accelerating, reversing, standing still) is unchanged.
- **Smaller sets**: only the left bends' pictures are kept; a right bend (steps 1-4) is them mirrored when drawn (`car-meter.js` look), and the palette has 128 colours (from 160). Cluster 320 x 180: about 1.26 MB (1.3.93: 1.48 MB), HUD 240 x 135: about 0.45 MB (0.60 MB). An unknown state draws the straight-on picture. The guides' moving pictures are redrawn.
- Step 4 (the drift) still starts at 0.50 G.
- Tests: `car-meter` (steps 1-3 each their own and not the straight-on picture; a right bend the left one mirrored; an unknown state).

## Cluster Redline 1.3.93 (Position check: does the app get the car's GPS position?)

- **New: Position check** (NAV tab → Navigation display → 위치 확인, off by default). The first step towards speed camera warnings from a Korean camera list without route guidance: it shows whether the app gets the car's GPS position, and from where. Nothing is warned yet.
  - **At install**, the Store build searches this unit's SOME/IP catalog for fields and events whose data type holds a latitude and a longitude (`position-config.js`), ranks them (the current / matched position first; destinations, POIs, routes and arrays down), and adds the best four to our manifest **read only** (only interfaces the app does not use yet: an existing proxy is never changed) (fields notified or read, events subscribed). The list goes into the package as `position-candidates.json`.
  - **While the check is on**, `position.js` watches every candidate, finds the latitude / longitude pair in whatever it sends (5 values a second at most; getter-only fields read once a second by a timer that stops with the check), works out its unit (degrees, 1e-6 / 1e-7 degrees, 2^32 per turn, radians, milliarcseconds…; the one that puts it in Korea first) and uses the candidate with fresh positions. The heading comes from fixes 12 m apart.
  - The screen: the position (4 decimals), in Korea or not, the heading; each candidate with what it received (count, per second, age, unit, "not offered", errors), the one in use marked `>`.
  - A position never goes to the log: only key names and counts.
  - The check is off again at every app start, so whatever a new interface does while it is on, the next start is as without it.
  - The search, ranking and decoding follow SpeedCam (Zakh294/bmw-sugar-apps, MIT), written anew for this app with Korea's bounds; see NOTICE.
- If the car does not give apps its position, the next step is the lead-car helper reading it as root, as it does for the car ahead.
- Tests: new `position` (the catalog search and ranking, the manifest entries, the units, the fresh source, the heading, nothing logged, off by default, the install with a catalog, the screen); `worker` and `worker-navigation` allow the new module.

## Cluster Redline 1.3.92 (English: the departure badge reads "Moving off")

- **Fix (English edition): the lead car departure badge showed "Mig"** instead of "Moving off". The badge's big place uses the thin figures' atlas, which holds the digits and units only, so the letters it lacked dropped out. A word there now goes in the bold face, which has every letter; the time gap and the distance ("1.6s", "6 m") stay in thin figures. The Korean edition drew "출발" from its Hangul atlas and looks as before.
- Tests: `headway` (the departure word in bold, the figures thin; run against the built package).

## Cluster Redline 1.3.91 (lead-car headway: distance from the bumper)

- **Fix: the lead-car distance read about 2 m too far** (issue appsKOR#5: right behind a car it showed 2 m). The car measures from its sensor behind the windscreen, not from the front bumper. HUD lamps → Lead-car headway now has a **Distance correction** (0 to −3 m in 0.5 m steps, **−2 m by default**) taken off the distance shown, never under 0 m; the time gap and its colour use the corrected distance. The car's own values at the bottom of the screen stay as sent.
- Tests: `headway` (the default, the steps and limits, the corrected distance and time gap, 0 m right behind a car).

## Spotify 2.0.0 (Korean edition): Hangul on the GPU renderer

- **Fix: no text at all on the car** (tabs, buttons and lines blank; the PC preview, drawn in software, was fine). The upstream kit sends a glyph atlas to the GPU renderer whole, and the Korean atlas (1024 x 2976) did not fit the renderer's shared atlas texture beside the other apps' atlases, so every Hangul line was dropped. The template now sends it in pieces of at most 512 rows, as appsKOR's kit does (`fonts.piece`, `record.js`); the software path is unchanged.
- The version stays 2.0.0 (upstream's); the Store offers the new revision of the branch.
- Tests: `spotify-ko` (the GPU recording uses pieces of at most 512 rows and draws the same pixels).

## Spotify 2.0.0 (Korean edition, new: 스포티파이)

- **New in the Store: Spotify (한국어), id `spotify_ko`.** hexlay/idrive7-custom-apps' Spotify 2.0.0 (GPL-3.0, commit `db900984c13e`) in Korean: tabs, buttons, notices, the car's menu and settings. iDrive 7 only, needs the internet, the GPU renderer and the controller gate (as the original). Installs beside the original `spotify`; pair once again on its Connect tab.
- **Korean song titles show**: the Hangul atlas of appsKOR (Noto Sans CJK KR, the 2,350 KS X 1001 syllables) is in the package and `fonts.js` draws Hangul from it (the original drew `?`).
- **Names from Spotify are not translated.** The kit's i18n also replaced English words found inside a line; the Korean edition's `tools/spotify-i18n.js` translates a line only when it is, as a whole, in `localization/spotify.ko.json` (or one of its rules), piece by piece for lines joined with `  ·  `. `main.js` draws song, artist, playlist and device names as they are and translates a line before `fitText` cuts it.
- The phone pairing page (hexlay.github.io) is the author's web page and stays in English.
- `tools/prepare-spotify.py` (import / template) takes a new upstream version again; `tests/spotify-ko.test.js`.

## GIF Home 0.4.8 (Korean edition)

- **No Widget settings page on the car.** The playback settings (mode, single GIF, group, interval, pause, playlist) are made on the phone page only, as the original GIF Home does; the widget's picture settings (fit, speed, frames, background, tone) stay on the kit's **Settings** button. Pages: Widget preview → Animation → Phone connection (Diagnostics by its button). The car's playlist picker went with the page.
- The Animation screen's orange note now says the order follows the playback settings made on the phone; without the GPU renderer its settings button opens the Phone connection page.
- `app.json` changes only its version; the new texts are kept in `main.js`, so the Store UI template stays valid.

## Cluster Redline 1.3.90 (Animation: the M3, four cornering steps)

- **The Animation layout's car is now the owner's BMW M3** (cluster and HUD), seen from behind on the night road: driving, standing still (exhaust vapour), braking (tail lamps and the third brake lamp, the tail lifting), accelerating (flames from the four pipes, the tail squatting), reversing (white lamps) and cornering.
- **Cornering in four steps** (sideways G): leaning out of the bend from 0.10 G, the tail stepping out from 0.25 G, sliding in smoke from 0.35 G, and **a drift from 0.50 G**: the owner's drift picture, the car swaying about its front wheels and its tyre smoke flowing. Steps 1-3 have each side drawn on its own, so a left bend's badge reads the right way round; the drift picture is a left bend and a right drift is it mirrored.
- The pictures are made by `tools/car-meter/m3.py` (from `tools/hud-art/vehicles/own.png` and `tools/car-meter/m3-drift.png`; numpy, Pillow, OpenCV). `car-meter-frames.js` (320 x 180) and `car-meter-hud-frames.js` (240 x 135) keep their format: 12 states of 8 frames, one palette a set (160 colours chosen by k-means, the yellow lines, lamps and flames kept; frames slightly smoothed). They are larger than before (about 1.5 MB and 0.6 MB, from 0.6 MB and 0.16 MB).
- Tests: `car-meter` (step 4, each side's pictures, the mirrored right drift, the new states).
## Cluster Redline 1.3.89 (scene recording, downloaded by QR; lead-car helper 0.4.0)

- **New: Scene recording** (HUD lamps → 앞차 간격 → 상황 기록, off by default). It records the scenes needed to set the pedestrian / cyclist warning, the cut-in warning and the road users around, without SSH.
  - The helper keeps the last 30 s of what the front camera measures (objects, the car followed, lane lines) with our speed and gear.
  - Clips (20 s before, 10 s after) are saved by themselves for:
    - a pedestrian or cyclist on our path within 30 m
    - a car beside us coming into our lane
    - the car ahead moving off
  - The driver can keep a scene with Save now on the screen.
  - The clips are numbered in order: `001-1127-1010-보행자자전거.jsonl`, `002-...-끼어들기`, `003-...-직접저장`. The number goes on after a clear.
  - **Delete all clips** asks once, then deletes on a second press within 5 s. Otherwise at most 50 clips / 5 MB are kept, the oldest going first.
- **Download by QR.** The screen shows a QR code with the head unit's address on the car's Wi-Fi. With the phone joined to the car's Wi-Fi (as for the GIF player's phone page), scanning it opens a page with each clip and "모두 받기".
  - The page is read only.
  - It and its firewall rule are there only while recording is on.
- **redline-lead 0.4.0** (`clips.js`, `share.js`, commands from the app on its socket). Cluster Redline requires it, so the Store updates it.
- Tests: `redline-lead` checks the clips: off keeps nothing; a pedestrian, a cut-in, the button and departure in one clip; 20 s before and 10 s after; numbering in order, kept through a clear.

## Cluster Redline 1.3.88 (lead-car helper 0.3.0: every camera object)

- **redline-lead 0.3.0** sends every object the front camera measures, not only the car followed, nearest first. Each object has its id, its class (pedestrian, cyclist, motorbike, car, truck / bus / van ...), its place (metres ahead, metres to the left) and its lane. It is the base for the pedestrian / cyclist warning, the cut-in warning and the road users around. This version shows nothing new yet.
- `log-objects.js` (installed with the helper) records the objects while driving, to set those warnings on the car: `node /var/opt/redline-lead/current/log-objects.js 20`.
- Cluster Redline (Korean and English) requires redline-lead 0.3.0, so the Store updates it (no head-unit restart).
- The headway screen's helper line counts the road users ("주변 물체 N"). With the older helper it says "도우미 0.2 (업데이트 필요)".
- Tests: the helper decode (`objectsOf`) and the store requirement.

## Cluster Redline 1.3.87 (the car ahead in the lane picture; lead car departure alert)

- **Lane lines: the car ahead on the road.**
  - It is drawn in our lane at its distance, with our car lower and a little smaller at the bottom. Our car is now the user's own, a BMW M3 seen from behind (`vehicles/own.png`, cut with `cut-vehicles.py <picture> own`).
  - It is a road user seen from behind, by the front camera's class: car, truck (the camera's truck / bus / van), motorbike, bicycle, pedestrian. These are cut from the user's road picture (`tools/hud-art/cut-vehicles.py`, `hud-art-veh.js`, read only once drawn).
  - Its width follows the class, and a tall one is kept inside the picture.
  - Its headway step glows on the road under it: cyan, amber or red, green pulling away.
  - The distance and the closing speed sit small in the picture's empty top right corner.
- **New: Lead car departure alert**, part of the headway badge with no setting of its own. It works like this:
  - We stand (under 1 km/h) for 2 s with a car ahead within 15 m.
  - The car then moves 3 m further than its nearest, or is lost having been within 10 m, for half a second.
  - The alert then shows for 3 s, once per stop. It does not run in P, or once we move.
  - The headway badge shows "출발" in green. With the lane lines on, the car ahead also turns green with an arrow, and "출발" appears in the corner.
  - The headway screen says so.
- The car ahead is read when the badge or the lane lines need it. The badge can be turned off while the lane picture still shows the car ahead (without the departure alert).
- Tests: new `lead-departure` covers the stop, the moving off, a car lost close by or far away, P, moving first and the next stop, plus the badge and the lane picture by class.

## Cluster Redline 1.3.86 (neon navigation colour; the pictures one file a set)

- **New navigation colour: Neon (형광)**, beside orange, green, blue and white, for the arrow and the text.
  - With the 3D style, neon uses the user's second icon sheet as it is: neon yellow-green with its glow, grey roads, orange arrival flags and its own highway exits.
  - The lanes come from the same sheet. The lane to take is lit neon. The drawn arrows use the neon colour.
- **The pictures are now one file per set:** the cars, the blue icons and the neon icons.
  - `hud-art.js` reads a set's file only the first time a picture of that set is drawn.
  - Someone not using neon never reads the neon set; someone using only the lane lines never reads the icons.
- Tools: `cut-nav.py <sheet> neon` cuts the second sheet into `tools/hud-art/neon/`. `make.py` writes `hud-art-cars.js`, `hud-art-nav.js` and `hud-art-neon.js`, and lights the lanes per set.
- The colour buttons are narrower so five fit.
- Tests: `nav-icons-art` covers both sets, the neon flag and lanes, and that nothing is read before it is drawn. `nav-colors` covers neon.

## Cluster Redline 1.3.85 (lane lines: lime green lane)

- **New: Lane colour** on the Lane lines screen (HUD lamps → 차선 표시 → 바닥색): **Default** (the dark road) or **Lime green**, as the user's reference.
  - The lane between the lines is lit green: bright yellow-green near the car, deeper and fainter far ahead.
  - It is painted row by row on the pixels, so the gradient has no bands.
  - A warned half takes its colour in the same gradient: amber within 15 cm, red over the line, cyan for a lane change.
- Tests: `lane-lines` checks the setting, green near the car and brighter there than far ahead, and that the default stays dark.

## Cluster Redline 1.3.84 (drive-mode display: per mode output and screen)

- **New: Drive-mode display** (HUD tab and Cluster tab, 주행 모드별 표시). It replaces the two rows "Sport mode RPM display" and "All modes RPM display".
  - Each group of drive modes has its own output: Redline app, stock display or BC mode. The groups are:
    - **Sport**: Sport, Sport+, Sport Individual, PHEV Sport, Boost
    - **Comfort**: Comfort, Comfort+, Comfort Individual, PHEV Hybrid; also the mode not known yet
    - **Eco**: Eco Pro, Eco Pro+, Eco Pro Individual, PHEV Hybrid Eco
    - **Other modes**: Adaptive, PHEV Electric, Battery control, off-road and the rest. These follow Comfort by default.
  - With the Redline app, each group has its screen: **Common** (the Design and Position / size rows) or **Own**.
    - An own screen is set up with the BC page's steps (design, auxiliary values, Position / size) and kept for that group.
    - Setting one up does not change the common screen, which is put back afterwards.
  - BC mode keeps one set of page screens for all drive modes.
- **Nothing changes until it is touched.** A group not saved follows the older rows exactly: All modes and Except Sport modes, BC mode, the Sport row. Once saved, every group is written out.
- Under the hood:
  - `display-config.js` adds `groupOf`, `modeSetup`, `modeEntry` and `screenValues`. `rpmOutput`, `allOutput`, `rpmOutputPossible` and `bcModeNow` now come from them.
  - `policy.screenSettings` gives a display's settings in a drive mode, kept per normalised settings. The outputs, the data demand (a mode's own screen reads what it needs) and the worker draw with it.
  - BC mode reads the setup too.
- Tests: new `drive-modes`. It checks that every older pair means the same as before, plus saved groups, the screen overlay, what is read, the outputs, and the editor (save, common screen back). `settings-ui`, `display-settings` and `controls-size` are updated for the new row.

## Cluster Redline 1.3.83

- The arrow style **Icons** is now named **3D** (Korean and English), on its button and in the Navigation tab's summary.

## Cluster Redline 1.3.82 (arrow style: icons or drawn arrows)

- **New: Arrow style** on the navigation colour screen (NAV tab → Arrow colour / Text colour: 화살표 모양): **Icons** (the user's sheet, the default) or **Drawn arrows** (as up to 1.3.80). It applies to the turn box, the "then" arrow, the lanes and Navigation focus. The screen's preview follows it.
- The colour buttons are narrower to make room for it. The Navigation tab's summary line names the style.

## Cluster Redline 1.3.81 (guidance icons from the user's sheet)

- **The HUD's guidance icons are cut from the user's icon sheet**, with their glow:
  - turns, slight turns and U-turns
  - straight on and roundabouts (the exit number drawn over the middle)
  - lane changes and arrivals (left / right)
  - highway entries and exits (left, straight, right)
  - The icons stand where the drawn arrows were: the turn box, the small "then" arrow and Navigation focus.
  - Forks and branches keep their drawn diagrams.
  - The chosen navigation colour (orange, green, white) turns the icons' blue; their greys stay.
- **Lane guidance uses the sheet's lane arrows.**
  - The other lanes' arrows are grey. The lane to take is lit in the navigation colour, with a glow.
  - Right turns are mirrored from the left ones. A lane's other directions are dimmer.
  - Directions without a picture fall back to the drawn arrows.
- Tools: `tools/hud-art/cut-nav.py` cuts the sheet into `tools/hud-art/nav/`. `make.py` embeds them in `hud-art.js`, which can also tint and mirror.
- Tests: `nav-icons-art`. `nav-colors` now checks the arrow's hue.

## Cluster Redline 1.3.80 (the cars from the user's picture)

- **The car in the lane-lines picture and the headway badge's car icons are cut from the user's own reference picture**, with their glow, instead of drawn.
  - The source PNGs are in `tools/hud-art/`. `make.py` embeds them as zlib'd RGBA in `hud-art.js`.
  - They are painted bilinear and alpha-blended at the layer's size.
  - The badge shows the cyan, amber or red car for its colour step (the red one recoloured from the cyan, so all three are the same car).
  - `rear-car.js` (the drawn car of 1.3.79) is removed.

## Cluster Redline 1.3.79 (lane lines and headway badge redrawn after the user's reference)

- **Lane lines, redrawn.**
  - A dark road in perspective, with a faint grid near the car. The lines glow in their colour (15 cm markings, double lines as two, dashes 3 m on and 5 m off).
  - Your car, seen from behind, sits in the middle of the lane. A line it drives over goes under it.
  - A warning (amber within 15 cm, red over the line) colours both lines and tints the half of the lane on its side. Red also glows under the car.
  - With the turn signal on towards a line (a lane change), only that line turns cyan, with a faint cyan tint.
  - The picture is 112 × 84, still just above the headway badge.
- **Headway badge, redrawn.**
  - The car ahead is seen from behind, filled in the colour step and glowing. The time gap sits beside it in thin figures.
  - A thin rule runs under them, with a short stroke of the colour. Below it, the distance and the closing speed (in the colour).
  - Red (under 1.0 s) adds the gap bars under the car.

## Cluster Redline 1.3.78 (lane lines checked on the user's car)

- Two captures of the camera's lane list on the user's car (in the lane, and turned slightly right) decode as expected: lane width 3.04 m; a double line on the left, a dashed line on the right, a solid line and a curb further out.
- **The lines are measured at the car now.** The camera gives each line's place 3 to 12 m ahead, along with its heading. The distance to the car is now carried back along that heading. The turned capture shows both lines at about +4°, and its right line under the car's right side (red), as it was.
- **Amber from 15 cm** (was 30 cm). In the centred capture the car sat 30 cm off the lane's centre, which 30 cm already showed amber.
- The picture follows each line's heading: turned, the lines lean. A double line is two lines side by side all the way up, and the car outline is closer to its true width.
- Tests: `lane-lines` uses the two captures (`fixtures/lanes-center.hex`, `lanes-ncenter.hex`).

## Cluster Redline 1.3.77 (lane lines on the HUD; lead-car helper 0.2.0)

- **New: Lane lines (HUD lamps → 차선 표시, off by default).** The two lines of the car's own lane as the front camera sees them, drawn small in perspective just above the headway badge (it moves and scales with the badge's Position / size). Dashed, solid, dotted, double and road edge as the camera reports, white or yellow. A line within 30 cm (15 cm from 1.3.78) of the car turns amber; a line under the car turns red. With the turn signal on towards that side the line turns blue instead (a lane change, no warning). Lines the camera has not seen for 1.2 s are hidden.
- The lane list (`de.bmw` LaneBoundaries, SOME/IP 0xD024 eventgroup 3, event 0x8003) is refused to the app's uid on the user's car, as the lead-car sources were, so it comes from the root helper. **redline-lead 0.2.0** subscribes it too and decodes the front lane recognition (ego lane width, visibility) and the four front boundaries (lateral offset, type, colour, existence; lines the camera marks not available or less than 30 % sure are left out). The layout is the car's catalog's, as BimmerVision's published schema lists it (facts only, written anew); its length (1193 + 8) matches what the car sends. Read only. Cluster Redline (Korean and English) now requires 0.2.0, so the Store updates the helper with the app (no head-unit restart: the tool has no hooks).
- The Lane lines screen shows what arrives: helper state, events received, lines seen, visibility, and the left / right lines (distance, type, colour, margin) with the lane width, to check on the car at a marked lane.
- Tests: `lane-lines` (the decode of a 1193-byte payload, the ego lines, the levels, the overlay above the badge, the settings default).

## Cluster Redline 1.3.76 (the lead-car helper installed with it)

- The Store does not list a tool on its own: tools come with the apps that require them (as the GIF player brings `mgu-gif-net`). Cluster Redline (Korean and English) now requires `redline-lead` 0.1.0 (Cluster Redline 앞차 도우미), so updating to 1.3.76 installs it.

## Cluster Redline 1.3.75 (navigation: icon texts, more of the route)

- **Exit / IC and road numbers sent as icons now show**: a turn's description can carry them as an icon with its own text (an exit badge, a road number on its shield) instead of text; the HUD's description (and the Received turns screen, in [brackets]) left those out. As cluster-metrics reads them on a G30 (facts only).
- **The route's turn list asks for more**: the main road's and passive junctions' events too, up to 10 (was active turns and destinations, up to 6), as cluster-metrics asks for them: more of the route for the next turn (the Received turns screen's Route turn list shows how many come). A passive junction (along the highway, nothing to do) is left out of the list; an unknown kind first is still never skipped over.
- Tests: `nav-icons-passive` (new).

## Cluster Redline 1.3.74 · Cluster Redline 앞차 도우미 0.1.0 (the car ahead through a root helper)

- **Why nothing came:** on the user's car the head unit's SOME/IP policy keeps the driving assistant's services from apps: Cluster Redline's uid saw the radar's GapVehicleAhead, the Drive assist view's sources and the front camera's object list all "not offered". Run as root (IterioDev's hmictl, by hand over SSH), the same car delivered the camera's object list (0xF139 0x8001 / 0x8002) and GapVehicleAhead (0x3539), as BimmerVision gets them.
- **New Store tool `redline-lead` (Cluster Redline 앞차 도우미, iDrive 7):** our own minimal SOME/IP subscriber (`redline-someip`, C++, MIT, read only; built for the unit's toolchain and checked against its libvsomeip3 ABI) run as root by `redline-lead.js`, which decodes the camera's objects (big endian; metres) and the radar's front vehicle, and serves the car followed on `/run/redline-lead/lead.sock`. It subscribes only while Cluster Redline is connected.
- **Cluster Redline:** the headway badge reads the helper first when it is installed (`lead-helper.js`): the camera's car in our lane, a valid radar reading over it (its parked "no car" values ignored). The Lead-car headway screen has a line for it (connected, camera received, the car followed, radar received and its raw gap), or "not installed (Store: Cluster Redline lead-car helper)". "This car does not give the app the car ahead" is no longer shown while the helper answers.
- Tests: `headway` (through the helper: camera car, valid radar first, parked radar ignored, reconnect after 10 s; the helper's decoders on the car's parked radar payload), `store` (the tool listed).

lead-car headway from the front camera's object list)

- On the user's car neither the radar's service nor the Drive assist view's sources are offered to apps, but the front camera's traffic sign recognition does reach the app. The headway badge now also reads the same camera's object list (`camera-objects.js`): `de.bmw.environmentalmodel.ObjectRecognitionFrontCamera2`, its ObjectRecognition (id, measured, class, driving-tube mapping) and ObjectPosition (metres ahead and to the side) broadcasts, paired object by object; the car followed is the nearest vehicle in our lane (pedestrians and cyclists left out). Metres as sent, so no unit to calibrate. The radar first, then the camera, then the Drive assist view. Added at install where the car's catalog has it. The layout as BimmerVision's published perception schema lists it (facts only; written anew).
- The Lead-car headway screen: a line for it (Front camera objects: offered or not, instance, received, cars, the car followed and its distance); "this car does not give the app the car ahead" now only when the camera's list is not offered either.
- Tests: `headway` (our lane, nearest vehicle, a pedestrian left out, before the Drive assist view, no data).

new layouts: Retro VU meters, Navigation focus, G-G trail)

- **Retro VU meters** (레트로 VU 미터, cluster): two lit cream meters as on a hi-fi amplifier, the rpm and the first readout chosen (without one the rpm alone, centred); in the red zone the needle's tip turns red and the PEAK lamp lights. Drive mode, gear and clock under them.
- **Navigation focus** (길안내 중심, cluster): the turn big in the middle (the HUD's own arrows, larger), its distance and description (highway exit / entry named), the lanes and the turn after it; a small rpm ring on the left, gear and speed on the right; without guidance the speed takes the middle. The cluster now receives the guidance with this layout (the same as the HUD's, in the drive modes navigation shows in). New Position / size part: Navigation.
- **G-G trail** (G-G 궤적, cluster and HUD): the sideways and forward G of the last 2.5 s as a fading tail over rings at 0.4 / 0.8 / 1.2 G, this drive's highest left, right and braking G, the G now; an rpm ring of segments around it, gear and speed on the left. Reads the G only while it is chosen.
- All three in the picker before Animation, which stays last. The speed (Navigation focus, G-G trail) as for Calm clock.
- Tests: `redline-layout-parts`, `redline-layouts` (23 layouts, 18 on the HUD), `korean-ui` (VU and km/h allowed as names / units).

new layout: Calm clock)

- **Calm clock** (차분한 시계), a new layout for the cluster and the HUD, in the picker just before Animation (which stays last): the time big and thin with its date (Korean time or the head unit's, as the Clock time setting), up to four readouts in quiet figures under it (the auxiliary items chosen next), the gear, the speed and the drive mode small at the top. The rpm stays out of sight until 1,500 rpm before the shift point, then a thin bar fills above the clock (sky blue, amber, red; flashing at the shift point). Cool or warm colours (Auxiliary information screen, both displays). Its clock and speed are new Position / size parts (Clock, Speed). The speed is the vehicle speed the alerts read, sent to the layout only while it is chosen.
- Tests: `redline-layout-parts`, `redline-layouts` (20 layouts, 17 on the HUD).

headway: this car does not give it to apps)

- On the user's car 1.3.69's screen showed the radar's service and both Drive assist view sources "not offered": the head unit does not get the driving assistant's data there (the cluster draws its Drive assist view from it directly). The Lead-car headway screen now says so plainly, 10 s after subscribing with nothing of the car ahead offered or received: "this car does not give the app the car ahead; the badge cannot show here". The raw lines stay underneath; a car that does offer one of them works as before.
- Tests: `headway` (not before 10 s; one source offered: not decided).

headway: is the Drive assist view's data offered?)

- On the user's car 1.3.68's Drive assist view sources received nothing (ACC 0, objects 0) while the cluster's own view showed the car followed with the cruise control set. The Lead-car headway screen now says for each of the two whether it is offered to the app and on which instance (or not in the car's catalog), as 1.3.65 does for the radar's service: if neither is offered, the head unit does not get the driving assistant's data on this car (the cluster draws its view from it directly).
- Tests: `headway`.

lead-car headway from the Drive assist view)

- On the user's car the radar's service for apps (`de.bmw.dass.GapVehicleAhead`) is not offered (1.3.65's screen: "not offered · instance 1"), yet the cluster's own Drive assist view shows the cars ahead and beside. The headway badge now also reads what that view is built from (`assist-view.js`): the cruise control's target (`AssistedDrivingViewFunctionInput`) and the object list (`ObjectListSuAAR`); the car followed is the cruise control's target, else the nearest in our lane. The radar's service, where offered, still comes first. Added at install where the car's catalog has them. The names as appsKOR's Cluster Layouts reads them (dap.js, MIT); written anew.
- Not yet seen on a car: the position's unit. A value over 300 is read as centimetres, otherwise metres; the Lead-car headway screen shows the raw values (Drive assist view: received, cars, the car followed #id x y, the cruise control's target and its distance, which source is in use) to check it against a car followed.
- Tests: `headway` (the Drive assist view: target, our lane, none; the old tests keep to the radar's service).

the GIF switch gone; the route's turn list on screen)

- **The Fast GIF layer switch is gone**: the GIF is always on its own layer, an Off stored by 1.3.64-1.3.66 included (1.3.66 only fixed the button; this was meant to go with it). A refused layer still falls back.
- **Received turns: the route's turn list** (why the next turn shows or not, without a log file): how many turns the last list held and the most so far, how many lists came, from which phone navigation, and the distance from its first turn to the second. "Only one turn: no next turn": the navigation sends just the next turn, so the HUD's next turn cannot show.
- Tests: `nav-probe` (the turn list), `picture-layer` (always on).

the GIF always on its own layer)

- **Fix: the GIF went back to the slow way and stayed there.** The My GIFs screen's Fast GIF layer button did not read its setting, so it always said On and each tap wrote Off. The button is gone: the GIF is always on its own layer (1.3.64's fast way), an Off stored by 1.3.64-1.3.65 included. A refused layer still falls back to painting it as before.
- Navigation display's Record to a file had the same gap (the screen did not read the setting): fixed.
- Tests: `picture-layer` (always on, an old Off ignored; no switch on the screen).

## Cluster Redline 1.3.65 (lead-car headway: is the radar's service offered?)

- On the user's car the headway badge showed "no car ahead" with **received 0**: subscribed, but not even the first read came back, so the radar's service (`de.bmw.dass.GapVehicleAhead`) was not offered to the app on that instance at that moment. The Lead-car headway screen now says whether it is offered and on which instance (Radar service: offered / not offered · instance N).
- Nothing received for 20 s on an instance other than 1: subscribed again on instance 1, the one cluster-metrics subscribes (once).
- Tests: `headway` (the instance fallback).

## Cluster Redline 1.3.64 (the GIF on a layer of its own: small GIFs run faster)

- **The Animation layout's GIF goes on an image layer of its own, at the GIF's own size, and cluster-render scales it up** (`picture-layer.js`). Before, the GIF was scaled up into the layout's image and that image's changed pixels sent: about 160 KB a frame on the cluster, 2-5 frames a second whatever the GIF's size. Now what goes is the GIF's own changed pixels, so a smaller GIF runs faster. Measured in a simulation of the shared 1 MB/s (cluster and HUD both showing it): 160 x 90 with the whole picture moving 9.5 frames a second on each (2.3 before), with part of it moving 20; 320 x 180 2.3-5.8. With the HUD not showing a GIF, the cluster has it all to itself (about twice as many).
- The layout's image leaves the picture out while the layer is shown, so it is not repainted or sent for the GIF's frames (less CPU). The same drawing as before (edges fading, HUD black see-through, mirrored turns, fades). Only an image layer, as the layout's own: no assets or shaders (1.3.62's GPU flipbook stays off).
- My GIFs screen: **Fast GIF layer** On / Off (on by default; off: painted into the layout's image as in 1.3.63), and how fast each size runs.
- Refused by the renderer, not yet shown, or no GIF: painted into the layout's image as before.
- Tests: `picture-layer` (new).

## Cluster Redline 1.3.63 (1.3.62's GPU GIFs off)

- **Back to 1.3.61's way of drawing the GIFs.** On the car 1.3.62 made things slower, and the GIF player's page no longer opened on the phone. The GPU flipbook (`flipbook.js`) is off; the picture is painted into the layout's image again, exactly as in 1.3.61. The code stays, off, for a test build.

## Cluster Redline 1.3.62 (GIFs at their own speed: the GPU flipbook)

- **The Animation layout's GIFs run at their own frame rate, 20 a second and more, on the cluster and the HUD.** Before, each new GIF frame was painted into the layout's image and its changed pixels sent (about 160 KB a frame on the cluster, against at most 1 MB/s shared with the HUD: 3-5 frames a second). Now every frame goes to cluster-render once, when the GIFs are loaded: an atlas of colour numbers (r8, the frames side by side, at most about 1.8 MB a display) and a palette (256 colours a GIF). A small effect layer over the picture draws the frame (fitted, bilinear, edges fading; on the HUD black see-through, the same pixels as before) and the renderer steps through the frames itself at the GIF's delays, so nothing is sent per frame. A change of scene sends the new GIF's steps and fades over 400 ms (smoothly now, not in 8 steps).
- The layout's image leaves the picture out while the effect layer is shown, so it is no longer repainted or sent for the GIF's frames either (less CPU and memory traffic).
- Fallback: until cluster-render shows the layer (the atlas written), or when it refuses it, the picture is painted into the image as in 1.3.61. Its pixel memory full: half the room tried (the frames thinned alike), then a quarter; anything else refused: not tried again for these GIFs. A GIF with more than 255 colours keeps its 255 most used ones (the others the nearest).
- The Car layout's own animated car (no GIF chosen) is still painted as before.
- Tests: `flipbook` (new). The shader was checked against the painted picture in WebGL (GLSL ES 1.00): identical on the cluster, on the HUD, mirrored and fading.

## Cluster Redline 1.3.61 · GIF 플레이어 0.4.7 (memory, CPU)

- **Cluster Redline**: a GIF from the GIF player is scaled down to the picture's box *while it is decoded* (`gif-decode.js` `box`): a 640 x 360, 90-frame GIF took about 41 MB at once when fetched, now about 10 MB. Drawing a GIF frame (the cluster and the HUD, twenty times a second) no longer makes arrays per pixel: sampling positions, weights and the edge fade are worked out once per size, buffers are reused and the last six results kept (the same frame drawn again costs nothing). Measured on the PC: 3.3 → 1.5 ms a frame, the same picture (at most 4 of 255 apart from rounding).
- **GIF 플레이어 0.4.7**: the playlist picker's preview decoded the whole GIF (up to 32 MB) to show its first picture, kept beside the GIF playing; now only the first picture is decoded (`gif.js` `firstOnly`).
- Tests: `gif-home-thumb` (new); the Cluster Redline and GIF player tests.

## Cluster Redline 1.3.60

- **Fix: the cluster's Animation picture stood still while the HUD's moved.** The cluster and the HUD share one upload allowance (at most 1 MB/s, less when cluster-render says so). With an animation the HUD sent its small changes twenty times a second and spent the credit as fast as it came, so the cluster's bigger changes (its picture) never went. Now an output refused for want of credit keeps what builds up for itself (up to 1 s) and the two take turns when both want more than there is (`upload.js`). Simulated: with 600 KB/s the cluster went from 0 to about 3 pictures a second (the HUD about 3 instead of 10); with 1 MB/s about 5 on the cluster and 9 on the HUD.
- Tests: `upload-fair` (new).

## MGU 모니터 1.1.10

- **Big home widget fitted**: on the car the graphs' labels and numbers were cut at the sides and the HMI's own text line and progress bar lay over them. Everything is now drawn inside the layout's safe area (`startWidget.safe`: 9 % each side, 10 % top and bottom; x 40..344 of 384), below the HMI's title row, a little smaller (labels 16, values 22, graphs 34 high); the app storage line shrinks to fit. The big widget turns the HMI's second text line and progress bar off (the small widget keeps them: "CPU · 메모리" and the memory bar).
- Tests: `storage` (big widget: text line and bar off; small widget: the text line).

## Cluster Redline 1.3.59

- **Your GIFs on the HUD too**: the Animation layout shows the same GIFs on the HUD as on the cluster (one copy in `my-pictures/`, so GIFs put in from either display show on both; on the HUD black is see-through). Choosing Animation on the HUD opens the same *Animation · My GIFs* screen. No GIF: the car, as before.
- Tests: `my-picture` (HUD frame and preview).

## GIF 플레이어 0.4.6 (Korean edition)

- **Smooth change on the Animation screen**: when the next (or previous) GIF comes, it fades in over the last picture of the one before, eased, in 0.6 s (op 16 opacity with the GPU renderer: about 36 frames). Without the GPU renderer the new GIF simply replaces the old one.
- Checked in the preview's renderer stream: the old picture's opacity goes 1 to 0 as the new one's goes 0 to 1, then only the new GIF is drawn. Not yet seen on the car.

## GIF 플레이어 0.4.5 (Korean edition)

- **Animation screen black on the car (fixed)**: on the GPU renderer's own dialect (mgu-render/1) the kit's renderer client dropped pixel images ("pixel images need the upstream dialect"), and op 18 went out in the upstream field order, so the GIF never showed and frames could be refused. The Store template's `kit/runtime/renderd.js` now sends them as pixmaps (`X_PIXMAP` once per size, `X_PIXELS` per new frame, RGBA, nearest) when the renderer offers pixmaps, and rewrites op 18 to `x y w h r id` in the frames sent there; the recording kept for the software path is unchanged (`tools/prepare-upstream-apps.py`, `patch_native_pixmaps`).
- Tests: `tests/gif-home-ko.test.js` drives the packaged client as on a renderer with pixmaps (pixmap, pixels, rewritten op 18, no re-upload of the same frame, a new pixmap at a new size).
- Not changed: the main pages are the HMI's own image, so their drawn buttons do not take touch; the bottom bar (다음 항목 / 선택) works them.

## Cluster Redline 1.3.58

- **Smoother Animation layout on the cluster.** The cluster is drawn 20 times a second, but its picture changed only 10 times a second: the Car layout's eight frames a state at 10 a second, and GIFs held to at least 100 ms a frame. Now the Car layout shows, in the second half of each frame's 100 ms, that frame mixed half and half with the next one (the same frames at the same speed, the picture changing every 50 ms); GIFs play at their own delays down to 50 ms a frame (20 a second; 0 or 10 ms still means 100 ms, as browsers play them).
- GIFs already copied from the GIF player keep their old 100 ms frames: choose **Fetch from GIF player** again to copy them at their own speed. At most 30 frames a GIF, as before (longer ones are thinned, their duration kept).
- Frame cost on the PC (Node 8.16.2, the car's version): about 3.8 ms a cluster frame in the Animation layout. Not yet checked on the car.
- Tests: `my-picture` (50 ms delays, the in-between frame).

## GIF Home 0.4.4 (Korean edition)

- **The GPU renderer is installed with it**: the Store entry now requires `idrive7-renderd` 2.1.18, `mgu-inputgate` 1.1.0 and `mgu-deploy` 0.7.17 (as 8게임즈 does), offered by the appsKOR source. Without the renderer the Animation screen was drawn in the HMI's own image: a few frames a second (4) and no touch, only the bottom buttons. With it the kit draws the screen up to one frame per screen refresh and its buttons take taps.
- The Widget preview / Widget settings / Phone pages stay the HMI's drawing (bottom buttons), as before.

## Cluster Redline 1.3.57, MGU Monitor 1.1.9 and Seats Easy Access 0.7.10

- **Cluster Redline**: the settings watermark no longer shows the cafe name "BMW Coding 배움터" or the blog address. The Korean edition keeps the profile picture and 서울II잼님; the English edition shows no watermark. The background photo is unchanged.
- **MGU Monitor**: the mark on the Disks and Apps pages no longer shows "코딩나눔터" or the blog address. The Korean edition keeps "동이/카자미/잼님"; the English edition shows no mark. The background photo is unchanged.
- **Seats Easy Access**: the mark beside the seat no longer shows "BMW Coding 배움터" or the blog address. The Korean edition keeps the profile picture and 서울II잼님; the English edition shows no mark. The background photo is unchanged.
- App code only (`settings-bg.js`, `bg.js`); the Store UI templates are unchanged.

## Cluster Redline 1.3.56

- BC mode screens (Cluster tab): the button and the page summary say **Waze map** (was Waze / Waze · stock map).
- BC defaults: **current media** (iDrive 7) and **media · radio** (iDrive 8) show the **Animation** layout with the clock, on the cluster (the car, or your GIFs) and on the HUD (the car). Pages already set up keep their own screen.
- Tests: `bc-follow`, `korean-ui` (Waze map).

## Cluster Redline 1.3.55

- **One layout: Animation** (the Car layout and My design merged; 애니메이션 in Korean). The design picker lists it once. On the cluster, choosing it opens its GIF screen (*Animation · My GIFs*): with no GIF the car of the Car layout shows (braking, three steps of drift each way, flames, reverse); with GIFs from the GIF player they show instead (driving required once any is chosen; standing still, reverse, turning left / right). On the HUD it is the car, as before.
- A cluster set to My design (`rl-mypic`) reads as the Animation layout, its GIFs kept.
- Tests: `my-picture`, `redline-layouts` (19 layouts, 16 on the HUD).

## Cluster Redline 1.3.54

- **My design without any GIF is the Car layout itself**: with no GIF fetched (or none usable) the picture is the Car layout's own car, braking, drifting, flaming and reversing with the car's G and gear, not one still picture per scene.
- **Back to the Car picture**: *Fetch from GIF player* with every scene left empty removes the copies ("No GIF: the Car layout's own car is shown."). With only some scenes chosen, the driving GIF is still required.
- Tests: `my-picture` (no GIF: the Car layout's states; clearing).

## Cluster Redline 1.3.53

- Final check (performance, errors): a damaged My design copy cut short reported zlib's own error code; it now reads as unreadable like any other damaged one (the driving GIF or the Car picture stands in). No other change.
- Checked: all 75 Cluster Redline tests, the Store builds; every app file parses as Node 8 code (ES2017) with no newer APIs; cluster frame cost (PC): default design 5.8 ms, Car layout 4.6 ms, My design 3.6 ms, My design while fading 6.9 ms a frame; error cases (GIF player off, its port taken, a read error, not a GIF, a GIF gone, damaged copies, no data folder, POST to the share) handled without a crash.

## Cluster Redline 1.3.52

- **My design: five scenes** — driving (required), standing still, reverse, and now **turning left** and **turning right**. A turn is the sideways G, as the Car layout reads it (positive to the left; not yet checked on the car): 0.12 G and up starts it, under 0.08 G ends it, a new scene lasts 300 ms and a shown one 400 ms. A turn without its own GIF shows the other turn's GIF mirrored, then the driving GIF. While My design's picture shows, the G is read every 200 ms even with its small G meter hidden.
- Tests: `my-picture` (turn scenes, hysteresis, mirrored fallback and drawing, G demand).

## Cluster Redline 1.3.51

- **My design: GIFs of any size.** A GIF is fitted to the picture's box (320 x 180, its shape kept, never made bigger) when it is copied from the GIF player, so any size the GIF player accepts (up to 640 x 360, 6 MB) can be used; more than 30 frames are thinned to 30, each kept one lasting as long as those it stands for (the GIF runs as long). Kept compressed as `my-pictures/<scene>.mpic` (1.3.50's `.gif` copies are still read).
- **The driving GIF is required**: *Fetch* does nothing without it ("choose the driving GIF first"); standing still and reverse without their own GIF show the driving GIF (no longer the Car picture). The rows list Driving first.
- **A change of scene fades** over 400 ms (8 steps), the old GIF still moving; when the scene shows the same GIF (the driving GIF standing in), nothing fades.
- Tests: `my-picture` (fitting a 640 x 360, 60-frame GIF, durations kept, drive required, fallback, fade).

## Cluster Redline 1.3.50 · GIF 플레이어 0.4.3

- **New cluster layout: My design** (계기판 표시 설정 → 디자인 변경 → 나의 디자인; the cluster only). The Car layout with your own GIFs in the picture's place, one for each scene: standing still, driving, reverse (from the gear and the speed, held 300 ms; reverse at once). A scene without a GIF shows the Car layout's own picture. Frames play at their own GIF delays, at most 10 a second.
- **The GIFs come from the GIF player.** Choosing My design opens its screen: the GIF player's GIFs (uploaded ones first, then the built-in ones), one picked for each scene with − / +, each shown with its canvas size and file size, red when it does not fit. *Fetch from GIF player* copies the chosen ones into this app's data folder (`my-pictures/`), each checked first (one that does not fit is not kept); then *Next: auxiliary information*. The GIF player is needed only while choosing.
- **The sizes shown on that screen**: recommended canvas 320 × 180 (the picture's box on the cluster), at most 400 × 225, at most 20 frames, at most 1 MB a file (three GIFs at most about 11 MB in memory).
- **GIF 플레이어 0.4.3**: lends its GIFs on this head unit only (`redline-share.js`: an HTTP server on 127.0.0.1:18884, GET `/list` and `/gif?id=`; nothing outside the head unit reaches it). Apps keep their data folders to themselves, hence this instead of reading its files. Update the GIF player and open it once before choosing.
- The layout and its GIF decoder are the parked My picture work (redline-my-picture branch: `gif-decode.js`, `my-picture.js`), now cluster only and fed by the GIF player; its PC copy tool is not used. In the layout picker on the car (the GPU recorder) the GIF goes as a pixel image.
- Tests: `my-picture` (the GIF player's share, fetch and checks, recorder path), `redline-layouts`.

## Cluster Redline 1.3.49

- **New layout: Car** (Redline app layouts, cluster and HUD; on the HUD the car is drawn alone on black, which is clear on the glass: no road, no frame round it, the lamps, flames, smoke and light trails still show). A big animated picture of a car seen from slightly above and behind at night fills the middle and does what your car does, from its own G and gear: reversing lamps in reverse; standing still (under 1 km/h from the car's speed, or in P when the speed is not known) the road stops and the engine idles with a slight shake and thin exhaust vapour; brake lamps and a dipping nose at 0.18 G of braking, cornering in three steps by the sideways G, left and right: from 0.10 G a lean into the bend, from 0.25 G the tail stepping out with a little smoke, from 0.35 G a full drift with thick tyre smoke and light trails; exhaust flames at 0.12 G of acceleration, otherwise driving straight on. A new state must last 150 ms and a shown one stays at least 400 ms, so one noisy sample does not flicker it; a new state fades in over the old one in 0.3 s (the old one still moving), so a change does not jump; 10 frames a second through the cluster render service. Under it a slim rpm bar; the gear on the left, the rpm on the right; along the bottom a small G meter and up to four readouts as chosen (power, torque, G, ...; two with bars in gauge mode). The drive mode colours it, as the Sport dial: in Sport a glowing red neon frame round the picture, a red rpm bar, rpm and GEAR label and **SPORT** (SPORT+) spelt out under the rpm; Comfort a thin blue frame and **COMFORT**; Eco Pro sky blue. Each element moves, sizes and hides on its own (Position / size: Car picture, RPM gauge, Gear, Drive mode, RPM number, G-force meter, Readouts 1-4, M mark).
- While the picture shows, the two G sources are read every 200 ms instead of every second. The vehicle speed (`Vehicle2.statusCarSpeed2`, already watched for the vehicle alerts) is kept for it too, whether the alerts are on or not.
- The pictures are original low-poly 3D renders (a generic white-over-black 1980s hatchback, no logos or lettering), so the body really turns in a drift: 8 states (standing still, driving on, flames, braking, reverse, three cornering steps) x 8 frames at 320 x 180 in one 256-colour palette (`car-meter-frames.js`, 610 KB; the HUD's set 240 x 135, `car-meter-hud-frames.js`, 155 KB), scaled to the element's size once per state; the left drift is the right one mirrored. Made by `tools/car-meter/render3d.py` (Python 3, no packages; see its README).
- Not yet checked on the car: which way round the lateral G is (taken as positive to the left, ISO 8855).
- Tests: `car-meter` (new); `redline-layouts`, `redline-layout-parts` (19 layouts, 16 on the HUD).
- Merged with 1.3.48's menus: the Car layout is in the design picker after the two Jam layouts (the picker's rows fit above Back). Fix: in the layout picker on the car (the settings screen recorded for the GPU renderer) the Car preview stopped the screen (`Recorder.blit: not a layer`); the picture now goes there as a pixel image. `redline-layout-parts`: the Car layout's parts overlap a little where they meet, so it allows up to 40 differing pixels there.

## MGU Monitor 1.1.8

- **Home widget: CPU and memory graphs.** The big widget now draws the whole head unit's CPU and memory (RAM) use over the last 30 minutes (the app's 10-second samples, 0 to 100 %), the current values on the right, orange on a CPU / memory rise or a suspected leak. The app storage line stays at the bottom (red at the warning threshold). The small widget shows `CPU · RAM` with a memory bar, and the storage text and bar during a storage warning.
- The big widget is redrawn only when a sample, the disks, the theme or the language changed (before: every second).
- Widget texts are kept in `main.js`, so `app.json` is unchanged apart from the version and the SDK-free UI templates stay valid.

## GIF Home 0.4.2 (Korean edition)

- **Full view (전체보기)** on the Animation screen: a new button under the speed shows the GIF alone across the whole screen, in the middle of the screen (aspect kept, black around it; without the GPU renderer in the largest part of the HMI's image centred on the 1920 x 720 screen, as that image sits 36 px left of and 18 px above the middle), without the tabs, the right-hand panel or the bottom bar (with the GPU renderer the screen is "chrome": false). A tap anywhere, or the controller's press (the whole screen is one target), brings the menu screen back with the tabs for 5 s. Without the GPU renderer the HMI still draws its bottom bar; any of its buttons leaves full view first. Opening the screen again starts on the menu screen.
- The label is kept in `main.js` (`app.json` only changes its version), so the Store UI template stays valid. `tests/gif-home-fullview.test.js` runs the packaged app and renders both views.
- Not yet checked on the car.

## GIF Home 0.4.1 (Korean edition)

- **Animation screen (애니메이션)**: the GIF across the screen at its own speed through the GPU renderer (mgu-renderd: up to one frame per screen refresh; without it a few frames a second, with a notice). Bottom buttons **이전 / 다음 / 애니메이션 설정**; Previous goes back to the GIF played before without changing the playback mode; the settings open over the animation (the kit's sheet: mode, single GIF, group, interval, pause, picture fit, speed), or the Widget settings page where the kit does not run the screen. Opened from page 3.
- **Five pages**: 위젯 미리보기 → 위젯 설정 (the phone page's playback settings, and each GIF in or out of the selected list; the Library page is merged into it) → 애니메이션 → 애니메이션 설정 (picture fit, speed, GPU renderer / without) → 휴대폰 연결. Diagnostics left the page cycle and opens with its button. Widget and animation share one playback setting.
- The **renderer** setting is now the Animation screen's (default GPU renderer); the main pages stay on the HMI's own drawing. The template's kit `display.js` serves the screen marked `"gpu": true` (`tools/prepare-upstream-apps.py`).
- The bullet before "재생 중" was a character the Korean font lacks (drawn as "?"): now `·`. `tests/gif-home-ko.test.js` checks every non-ASCII character `main.js` draws against the font; `tests/gif-home-animation.test.js` is new.
- **Playlist picker** (Widget settings → 재생 목록 · 목록 만들기): a window with every GIF; pressing GIFs numbers them in that order (again: out, the rest close up), with a preview of the GIF the focus is on; **확인** plays just those, in that order (Sequential), so two picked means two in turn; **페이지** jumps 6 rows. It replaces the long in-page order and add / remove lists.
- **Animation screen split, no Animation settings tab**: the GIF on the left (a 3:2 GIF, e.g. 540 x 360, fills its 1080 x 720 of the 1920 x 720 screen; others are fitted whole), on the right its name, big **< 이전 / 다음 >** buttons, **애니메이션 속도** (the Animation screen's own) and, in orange, that the order follows Widget settings. The buttons are page targets: a tap, or the iDrive controller's knob through them, with the GPU renderer. The tabs and the bottom bar are hidden (the screen switched to "chrome": false and placed again, as on a layout change); a tap on the GIF shows them for 5 s, as do the bottom buttons and opening the screen. Four pages; the GPU renderer choice is on the Animation page. Which GIFs play follows Widget settings; the widget's fit and speed are on Widget settings (위젯 그림 맞춤, 위젯 속도).
- **Page 3 is the Animation screen**: paging onto it opens the screen, with the page tabs still on top (Animation selected; in the kit's header with the GPU renderer, where a tapped tab goes to that page). BACK returns to page 3, Page goes on to 4. The **애니메이션** bar button is gone (six buttons again).
- **Renamed GIF 플레이어** (car menu, widget, phone page, Store listing).
- **New look for the pages** (`look.js`, GIF Home's own drawing code in the style of the owner's other apps' settings): the five pages as tabs on top with the version, rows as cards with a value button on the right, the row the controller is on lit with a red bar, the current GIF dimmed behind. **다음 항목** moves between the rows on every page but Phone connection and Diagnostics; **선택** presses the row's button.
- Not yet checked on the car: the GPU drawing of the Animation screen, its sheet and buttons.

## Phone Terminal removed

- **폰 터미널 (한국어)** (`mgu_phone_terminal_ko`) and its bridge (`mgu-phone-bridge` 0.1.7) are no longer offered by this source: the app, the bridge, their templates, tests and catalog entries are removed. GIF 홈 (한국어) and `mgu-gif-net` stay. A copy already installed on the car stays installed; uninstall it there if it is not wanted. Phone Terminal is still offered by its original source, NamelsMissing/mgu-apps.
- The license note is now `NOTICE.gif-home.md`; the test is `tests/gif-home-ko.test.js`.

## GIF Home 0.4.0 and Phone Terminal 0.1.7 (Korean editions, new)

- **GIF 홈 (한국어)** (`gif_home_ko`) and **폰 터미널 (한국어)** (`mgu_phone_terminal_ko`) added: GIF Home and Phone Terminal from NamelsMissing/mgu-apps @ `58d26d3` (GPL-3.0; see `NOTICE.gif-home-phone-terminal.md`). Every text on the car is Korean (`apps/<id>/app.json` `translations.ko`, through the kit's translation), and the phone pages are Korean when the phone's language is Korean (English otherwise). iDrive 7 only, as the originals. GIF 홈 has its own icon (a picture supplied by the repository owner), also as the home widget's preview image.
- Their native helpers come along under their upstream ids: **`mgu-gif-net` 0.1.0** (unchanged) and **`mgu-phone-bridge` 0.1.7** (serves the Korean app id `mgu_phone_terminal_ko` first, then `mgu_phone_terminal`; Korean phone page). Install one Phone Terminal edition at a time.
- The Korean templates are prepared with `tools/prepare-upstream-apps.py` from the appsKOR kit at `87d450d2` (the same kit as MGU Monitor), SDK-free. The tool refuses a CRLF `localization/ko-additions.tsv` (a Windows checkout), whose fingerprint the car would not match.
- Tests: upstream's GIF Home and Phone Terminal tests, and `tests/gif-home-phone-terminal-ko.test.js` (both Store packages built and unpacked, Korean text and font coverage, both phone pages as a Korean and an English phone, the bridge's app id).

## Parked Games 0.2.4 (Korean edition)

- Renamed **8게임즈** (it has eight games).

## Parked Games 0.2.3 (Korean edition)

- Renamed **6게임**, with the paddle-duel icon.
- Korean text now shows on the car. The GPU renderer (`mgu-renderd`) keeps every app's glyph atlases on one shared texture (two 1024 x 4096 shelves, first come, first served). The full Korean atlas (2,557 glyphs, 2976 px tall) was refused ("glyph atlas texture full") once the games' Latin atlases had filled the shelves past 1120 px, so every Korean text was left out. `tools/prepare-games.py` now cuts it to the glyphs the Korean catalog uses: 717 glyphs, 752 px, with its own cache key.

## Parked Games 0.2.2 (Korean edition, new)

- **주차 게임** added: MaxxxFoka's Parked Games (MIT, from `jaimeen77-cmyk/idrive7games_fork` @ `5c6ac21`), eight games for a parked car, every on-screen text in Korean (`apps/parked_games/app.json` `translations.ko`, 260 texts; the texts the games drew untranslated now go through the kit's translation). iDrive 7 only, as the original; needs the GPU renderer (`idrive7-renderd`) and the controller gate (`mgu-inputgate`) from a source that offers them (e.g. appsKOR). Its Korean template is prepared with `tools/prepare-games.py`; `tools/store-build.js` copies an app's `storeSourceDirs` (the `games/` folder) and takes `storeMguHmi` when an app names one (others unchanged).

## Cluster Redline 1.3.48

Menus reorganised as the user asked:
- **Basic**: *App operation* (Start = auto start too, Stop = no auto start; the separate App auto start row is gone), *Settings per driver*, *HUD lamps* (Lead-car headway, HUD turn signals, Door-open warning, each with its Position / size), *Vehicle preset* (vehicle type, power unit, torque unit, shift alert RPM Sport and Comfort / Eco). Menus inside a tab (`SUBMENUS`), Back to their row.
- **HUD and Cluster tabs**: Sport / All modes RPM display (BC mode on both), *Design* (a design, then its auxiliary values: gauges, text or none), Position / size, *BC mode screens*. The default design's top alert bar and circle beside the gear are the first two Redline layouts (*Jam top alert bar*, *Jam circle alert*). The separate Auxiliary information row is gone (it follows the design).
- **BC mode on the HUD**: the HUD's RPM rows can be BC mode; its pages (`bcHudPages`) are its own, Set screen / No change / This page now; the HUD shows the Redline HUD in BC mode. `setNow({cluster, hud})`; `bcModeNow(cfg, mode, 'Hud')`. Data demand counts BC mode as showing the face (the cluster's too).
- **BC pages**: no *Left out* (the stock cluster still shows such a page, so it put the count out of step; a saved one counts as No change; every page is counted). New defaults (iDrive 7): no display Waze (HUD no change); efficiency Analog needle / average speed, outside temperature text; trip Tyres & trip (HUD Jam top alert bar) / outside, battery voltage, average speed, average economy text; torque G-force + RPM rings / boost, oil gauges; G-meter Jam top alert bar / power, torque gauges; media Jam top alert bar / clock. Set screen: design, then auxiliary values, then Position / size.
- **Navigation tab**: no Vehicle alerts row; always all of them (set at the start), hidden only in Position / size.
- Tests: `bc-hud` (new), `bc-follow`, and the settings tests for the new menus.

## Cluster Redline 1.3.47

- **Favorites and settings per driver in BC mode**: loading a favorite, or a driver's settings at a driver change, set the cluster's design over the stock BC page's own screen until BC was pressed again. Now the page in step gets its screen back right after (the page count, `bcIndex`, was never in a favorite or a driver's settings, so it stays in step).
- Tests: `bc-follow` (favorite loaded in BC mode), `driver-profiles` (applied hook).

## Cluster Redline 1.3.46

- **Cluster (Kombi) values taken out.** The BC button check showed `KombiIF.statusKombiSelection` (1.3.39) and the All cluster (Kombi) values screen read every cluster value (1.3.44); on the user's car none of them follows the stock BC page (2026-11-23: 28 presses, 47 of 49 values received, only timers and clocks changed), and the cluster's diagnostic description (KOMB_G11) has no current-page status either. So they are no longer added at install (`traffic-config.js`: no Kombi input, no Kombi scan) and the screen is gone. The BC button check keeps the left stalk's value, now with the BC presses counted.
- Tests: `bc-diag` (stalk only, no Kombi at install).

## Cluster Redline 1.3.45

- **BC presses are counted whenever the app runs**, BC mode chosen or not. Until now the left stalk was read only while a cluster RPM row (Sport / All modes) was in BC mode, so a BC page changed while neither was would put the count out of step once BC mode was chosen. Only the screens (each page's Redline screen, Waze) still wait for BC mode. *Start: the first page* now resets the page only when the app starts, not when a setting changes.
- Tests: `bc-follow` (counted without BC mode, in step when BC mode is chosen again).

## Cluster Redline 1.3.44

- **All cluster (Kombi) values** (Cluster tab → BC mode → BC button check → All cluster (Kombi) values): the car does not say which stock BC page shows in `KombiIF.statusKombiSelection` (only "no value" on the user's car), so the page could only be followed by counting presses, which goes out of step when BC is pressed before the app starts. To find whether another value of the cluster follows the page:
  - at install (Store build on the head unit, from the car's own catalog) every field and event of the cluster's interfaces (a name with "Kombi") with a valid getter / notifier or eventId is added read only (`traffic-config.js` `scanKombi`, at most 80 per interface);
  - the screen reads them all while it is open (getters every 2 s), each one's changes counted, the ones that changed most first, with its last values, next to the BC presses counted since it opened; a value that changed as often as BC was pressed is shown blue (a candidate for the BC page). Nothing is sent to the car.
- Tests: `bc-diag` (scan, install-time scan, presses).

## Cluster Redline 1.3.43

- **Next turn is its own HUD part** (Navigation tab → Position / size → Next turn): the `Then [arrow] 120 m` line, until now drawn inside Direction under its distance, is moved, sized and hidden on its own. Its default place is where it was drawn (under Direction's distance), placed from Direction's own place so it follows Direction. Direction keeps its full-size distance.
- **Received turns** (Navigation tab → Navigation display → Received turns): to see what a phone navigation (T map, Kakao Navi through CarPlay / Android Auto) or BMW's own guidance sends, e.g. for a highway exit.
  - The screen shows the last 10 turns, newest first. Each line has the time, the source (guidance / route list / stock HUD, CarPlay / AA / BMW), the kind, every plain raw field as it came (`branchType=7`, `direction=6` ...), the distance, the description text and what the HUD drew (highway picture, arrow ...). The same turn again only updates its distance.
  - **Record to a file** (off by default) writes `nav-probe.log` in the app's data folder: one JSON line per new turn with the whole turn as received, and the route's event list when its first turn changes. At most 1 MB, then one older file `.1`. Read only; nothing is sent to the car.
- Tests: `nav-probe`, `next-turn` updated.

## Cluster Redline 1.3.42

- **BC mode** is now a choice of the Cluster tab's RPM rows (Sport mode / All modes RPM display: Redline app / Stock display / BC mode), instead of an on / off of its own: the drive modes set to it follow the BC button; in Sport its own row decides (Redline there over an All modes BC mode). The presses are counted in every drive mode while any row has BC mode, so the pages stay in step; a page's screen is applied only while the drive mode is in BC mode (and again on coming back to it). A "no change" page shows the Redline cluster as it is. 1.3.40–1.3.41's on becomes All modes: BC mode.
- The screen is now **BC mode screens** (iDrive 7 / 8, the pages, This page now, where to start, the BC button check).

## Cluster Redline 1.3.41

- Follow the BC button → **Set screen** has a third step: after the auxiliary values and the design, the Cluster tab's **Position / size**; leaving it (Back) keeps the page's setup with every cluster position, size and shown / hidden setting, applied again when BC comes to that page (after the design's own layout). Leaving Position / size untouched keeps the positions as they are. Pages not set up this way (the defaults) still change only the design, the auxiliary values and the alert style. The list marks a page with its own positions ("own position").

## Cluster Redline 1.3.40

- **Follow the BC button** (Cluster tab → Follow the BC button, off by default): each stock BC page of the cluster gets its own Redline cluster screen — its auxiliary values and its design (Set screen: the auxiliary picker, then the design picker) — or Waze / the stock map (the Redline cluster steps aside), or no change, or is left out of the round. iDrive 7 and iDrive 8 lists.
  - The car does not say which BC page shows: the BC button check on the user's car (1.3.39) showed the cluster's selection sending only "no value" (65535:4294967295) and the left stalk sending 64 while BC is held. So the pages are followed by counting the presses, in the cluster's own order as photographed (iDrive 7: no display → efficiency · consumption → trip data → torque · power → G-meter → current media).
  - The page reached is kept for the next drive (or the first page, a setting); "This page now" puts them back in step after the stock page was changed another way.
  - A Redline page shows the Redline cluster in every drive mode; Waze steps it aside; no change leaves the drive mode rules. A change made by hand on the Cluster tab stays until BC is pressed again. Positions and sizes stay the driver's own.
  - Defaults as the user asked: no display → no change; efficiency → Waze; trip data → tyre design + outside temperature, battery voltage, average economy, average speed; torque · power → G-force; G-meter → torque and power; current media → clock.
  - Saved in favourites (on / off, list, pages, where to start); the page in step is the car's.
- The BC button check moved into that screen (its button).

## Cluster Redline 1.3.39

- **BC button check** (Cluster tab → BC button check): what the car sends when BC is pressed — the cluster's own BC selection (`KombiIF.statusKombiSelection`) and the left stalk's switches (`Light.IndicatorSteeringColumn`), read only, added at install where the catalog has them (**reinstall / update from the Store**), read once the screen is opened. It shows each value now, how often it changed and the last ten, newest first: whether each stock BC page comes back with its own value decides how following the BC button can be built. The signals are those chyiz's idrive7-cluster-metrics reads (GPL; facts only, no code taken).
- Cluster tab: six rows, a little tighter.

## Cluster Redline 1.3.38

- Lead-car headway badge drawn as the user's reference: the car ahead seen from the front (the cabin an outline, the body filled) over two gap bars, the time gap beside it in thin figures (`1.8s`) in its colour step, and under them the distance (blue-grey) and the closing speed (amber when closing in). 112 x 60 at 100 %, a little higher (y 238).

## Cluster Redline 1.3.37

- **Lead-car headway on the HUD** (HUD tab → Lead-car headway: Off / Simple / Detailed, off by default; Position / size). The car ahead as the ACC / front radar measures it (`de.bmw.dass.GapVehicleAhead`: `GapVehicleDrivingAhead`, `DataFrontVehicle`, `DataFrontVehicleExtended`), added at install where the car's catalog has it (**reinstall / update from the Store**), subscribed only while the badge is on, read only. Shows the time gap at our speed (`distance ÷ speed`, from 12 km/h), the distance, and in Detailed how fast we close in (negative) or fall back, from the gap's change. Colour steps: under 1.0 s red, 1.0–1.5 s amber, 1.5 s and over cyan. Its own overlay layer between the turn arrows under the RPM face; nothing else gives way. The screen shows the raw values the car sends (status, gap, gapX, object, qualifier), since the signal has only been seen on a G30 (the field names, values and the 0.0625 m scale are those chyiz's idrive7-cluster-metrics found, GPL; facts only, no code taken). Cars without the signal: quietly nothing.
- HUD tab: seven rows, as tight as the Basic tab's, above its notes.

## Cluster Redline 1.3.36

- **Next turn on HUD moved into Navigation display**: Navigation tab → Navigation display opens its own screen, the drive modes (All drive modes / Except Sport / Stock display) and the next turn on the HUD on / off; the row reads e.g. `All drive modes · Next turn On`. The Navigation tab is back to five rows.

## Cluster Redline 1.3.35

- **Next turn on the HUD** (Navigation tab → Next turn on HUD, on by default): when the turn after the next one follows within 250 m, the HUD's direction part shows it under the distance: "Then", its small arrow and how far behind it is (e.g. `Then ↰ 120 m`). From the route's event list the app already reads every second (GuidanceEventList, up to six events): its second event, the gap from the two events' distances to the destination, never a turn already passed; shown only while the list's first turn is the one on the HUD. Now read with BMW's own guidance too (before: phone guidance only). HUD only; the cluster is unchanged. A phone may send its second turn only close by, so with CarPlay / Android Auto it shows only then. Written for this app; the way to tell the gap is the one the App Kit's Redline uses (MIT).
- Navigation tab: the two notes moved below the rows (they overlapped the sixth row).

## Cluster Redline 1.3.34

- **Basic → Settings per driver** opens its own screen: settings per driver, the greeting at the engine start and the goodbye when the engine is switched off, each on / off (both on by default), with whose settings are in use and what the greeting did last.

## Cluster Redline 1.3.33

- **The greeting on the cluster did not show** (1.3.28-1.3.32): the cluster's centre is the stock map's slot, and a layer there is seen only while it asks for the slot (contend), as the Redline cluster face does; the greeting's layer did not ask, so it stayed under the stock map. It now asks while shown and hands the slot back when it hides.

## Cluster Redline 1.3.32

Fixes from the 1.3.31 performance and bug check:
- **The goodbye never showed** (1.3.29-1.3.31): the background loop handed the gear to the greeting in the place of the time, so the engine switched off in P was never seen as such. Now the gear arrives where it belongs; a test drives the real loop from the engine start to the engine off in P.
- Turn signals → Position / size: selecting a blind spot part (both, left, right) forced the Redline HUD face on even in a mode set to the stock HUD; it now leaves the face as the mode has it, as the turn arrow parts do.
- Settings per driver row: auto start-stop restarts at the lights wrote "greeting skipped (restart within 3 min)" over the last greeting each time; only a stop of 1 to 3 minutes is noted now.

## Cluster Redline 1.3.31

- The driver greeting and the goodbye show for **5 s** (10 s in 1.3.29-1.3.30), on the HUD and the cluster.

## Cluster Redline 1.3.30

- The driver greeting came when a door was opened, not at the engine start: the head unit wakes with the door and the key's driver then replaces the account it woke with, which was greeted as a driver change. A driver change is now greeted at once only while the engine runs; otherwise the greeting comes at the engine start, as meant.

## Cluster Redline 1.3.29

- The door-open warning no longer moves the Redline cluster face aside for the car's own warning (the HUD picture is enough, user); the HUD picture is unchanged.
- The driver greeting shows for **10 s** (was 3), on the HUD and the cluster.
- **Goodbye when the engine is switched off**: `홍길동님 안녕히 가세요` (Goodbye, name) for 10 s on the HUD and the cluster when the engine stops in P, or is put in P within 5 s of stopping. An auto start-stop stop (in D) has none. Shown at once; dropped when no display is left within 8 s (the HUD goes dark with the ignition, the cluster a little later). The gear is read for it while settings per driver are on. Not for eDrive (plug-in hybrid) cars. The settings per driver row shows it too (goodbye shown / missed).

## Cluster Redline 1.3.28

- **Hood and trunk in the door-open warning**: an open hood or tailgate shows on the HUD picture in red (the hood lifted, the rear window and tailgate red) and the cluster gives way as for a door. Their switches come in the same door status, but their names have not been seen on a car yet: they are found by name (hood / bonnet / Motorhaube, tailgate / trunk / boot / Heckklappe; not their windows, locks or lights). Basic → Door-open warning shows the names found (or "not found") and the other items the car sends, to fix them if needed. The Position / size preview shows the hood and trunk open too.
- **Driver greeting on the cluster**: the same words on a dark card in the middle of the cluster's centre display, for the same 3 s; the Redline cluster face steps aside meanwhile, as the HUD one.
- **Driver greeting conditions**: when it was not shown, the reasons were a restart within 3 minutes of the engine stopping (taken for auto start-stop) and no display ready within a minute. Now a short stop counts as a new start when a door was opened while the engine was off, the greeting waits up to 3 minutes for the HUD or the cluster, and it is shown on whichever is ready. Basic → Settings per driver shows what the greeting did last (shown / skipped: restart within 3 min / missed: display not ready, with how long ago).

## Cluster Redline 1.3.27

- Door-open picture: the tail lights are two, one a side, apart in the middle of the tailgate as on a BMW, each an L round its corner (was one band across).

## Cluster Redline 1.3.26

- Door-open picture: only the open doors are red. The hood, roof and tailgate are no longer washed red while a door is open (red means open, and they are not).

## Cluster Redline 1.3.25

- The blind spot signs are placed in the turn signals' own **Position / size** screen, as three more parts after the arrows (both blind spot signs, left, right), instead of a separate Blind spot position / size button. They still move and size apart from the arrows. While any of these parts is selected the arrows and the signs show together as a preview.
- **Door-open picture redrawn** like the car's own door display: a silver car seen from above with soft shading, dark windscreen and rear window, a large panoramic roof and the mirrors; an open door is drawn swung out from its front hinge (dark trim, red frame) and, while any door is open, the hood, roof and tailgate are washed red. The picture is wider for the open doors (90 x 112 at the default 75 %, was 72 x 112), still centred.
- HUD display settings: the HUD turn signals row adds “Blind spot on” to its value while the blind spot warning is on.

## Cluster Redline 1.3.24

- **Blind spot warning: its own Position / size** (HUD turn signals screen → Blind spot position / size): both signs together, or the left or right one alone, moved, sized (20..200 %) and hidden apart from the turn arrows. Moving or sizing the turn arrows no longer moves the signs; by default they sit under the default place of the arrows, as before. While it is open both signs show as a preview, even with the warning off. Kept with favourites and settings per driver like the other turn signal settings.

## Cluster Redline 1.3.23

- **Blind spot warning picture redrawn**: seen from above like the car's own display, our car (blue, large) in its lane, the dashed lane line, and the car in the blind spot (smaller, its nose just below our car's middle) with detection waves between them; no time figure. Only the other car and the waves take the warning colour: amber while a car is there, red with the turn signal towards it. By default it now sits **under** each turn arrow, centred on it (51 x 54 at 100 %), instead of beside it; it still moves and sizes with the turn arrows.

## Cluster Redline 1.3.22

- **Blind spot warning** (HUD tab → HUD turn signals screen → Blind spot warning on / off, off by default): when a door mirror's lane change lamp is lit, an amber car sign shows beside that side's turn arrow on the HUD (outside it), red when the turn signal is on towards it or the lamp flashes. Its own overlay layers; they move and size with the turn arrows. Read from the body controller (BDC 0x40, identifier D347) every 300 ms while it is on and the engine runs, read only through the kit's ReadOnlyDiag (only 22 D3 47 is sent; writes cannot leave the head unit); stale after 3 s; a refusal stops the reading. Facts as akakingj's myapp-id7 Redline and mlurker's HUD signals found them; code written anew (`blind-spot.js`, `blind-spot-overlay.js`, credited in NOTICE).

## Cluster Redline 1.3.21

- The driver greeting moves up into the upper half of the part of the HUD the driver sees (iDrive 7: x 120..605, y 100..378, from car photos, as appsKOR's Redline measures it): y 140..204 instead of 286..350. While it shows (3 s), the Redline HUD face steps aside (reason `greeting`) so the words do not sit on the gauges; the other overlays (turn signals, door picture, alerts) stay.

## Cluster Redline 1.3.20

- The door-open picture now sits **in the middle of the HUD** below the RPM face and the turn arrows (75 % size), and has its own **Position / size** (Basic → Door-open warning → Position / size: move, size, hide; the preview shows every door open). The Basic row opens a door-open warning screen (on / off, what it does, the input state). The place and size go with settings per driver and favourites.

## Cluster Redline 1.3.19

- **Door-open HUD warning** (Basic tab, on by default): while any of the four doors is open, also standing still, the HUD shows the car from above left of the RPM face, open doors drawn open in red (`door-alert.js`, its own overlay; re-drawn only when the open doors change). From `DoorsWindowsRoofMirrors.CentralLockingSystemAndPanelStatus` (each door's switch, open = 1 or `..._OFFEN`, as appsKOR's Ambient Config reads it), added read-only at install when the car's catalog has it (`traffic-config.js`; desktop installer patch v17 the same). The row shows how many doors are open, or that the input is not installed.
- While a door is open the **cluster display gives way** (as for route guidance), so the car's own door-open warning is not covered; it comes back 2 s after the last door closes. The HUD is not affected. The row is now "Door-open warning".
- Basic tab rows are a little shorter so the ninth row fits.

## Cluster Redline 1.3.18

- The driver greeting now comes **when the engine starts** (RPM from stopped to running), not when the app starts: the first start since the app started, or after the engine was off for 3 minutes or more, so auto start-stop restarts are not greeted. A driver change while the app runs is greeted at once. An eDrive car (may start without its engine) is greeted when the driver is recognised, as before. When the engine starts before the driver is recognised, the greeting waits up to 15 s for the name, then says a plain hello. The worker reads the engine speed for it while settings per driver are on, whatever the faces show.

## Cluster Redline 1.3.17

- **Driver greeting**: with settings per driver on, a recognised driver (when the app starts, or on a change) is greeted on the HUD for 3 s: `홍길동님 안녕하세요` (English: `Hello, name`), a plain hello without a name. A cached name shows at once; a new driver's name once read (or a plain hello when it cannot be). Its own overlay layer in the middle below the RPM face; it waits for the HUD renderer, at most a minute (`driver-greeting.js`, `greeting-overlay.js`).

## Cluster Redline 1.3.16

- Settings per driver also keeps the **Position / size save slots** (HUD, cluster and NAV tabs, three each) per driver; drivers already kept start with the shared slots.
- Performance check (`docs/REDLINE-PERFORMANCE-1.3.16.ko.md`): HUD and cluster rendering measured next to 1.2.58 on the same machine and kit, three runs of 1,500 frames per case: within run-to-run noise (±10 %), the same memory. New `tools/cluster-redline-features-benchmark.js` measures the 1.3.x additions per worker frame: turn signals in the HUD image and on their overlay, the vehicle alert overlay, sign recognition and route event decoding, driver switches.
- The vehicle alert overlay re-sent its whole image (~100 KB) at every step of the car's distance text; the distance now shows in 50 m steps (0.1 km from 1 km): approaching a camera at 60 km/h, 30 uploads instead of 135, about 36 KB/s instead of 160.

## Cluster Redline 1.3.15

- Settings per driver now keeps the **favourites** (Favorites tab, five slots) per driver too; before, all drivers shared them. On the update, every driver already kept starts with the favourites they all shared, then each keeps their own (`driver-profiles.js` `migrate()`, also used for any key added to the per-driver set later).

## Cluster Redline 1.3.14

- Settings per driver shows the driver's **name**: `On · 홍길동 (2 / 3)`. The name is read from `personalization.UserAccount` (`name`, else `firstName`; the proxy is in the package from the kit template, all instances), asked on the instance the account reference names, once per driver change (given up after 15 s), and kept in `driver-profiles.json`. Without a name the number shows as before. Not yet seen on a car.

## Cluster Redline 1.3.13

- **Settings per driver** (Basic tab, off by default): the head unit's current user account (`personalization.SessionManager.currentUserAccountReference`, read every 5 s, as Cluster Info in appscluster_fork does) picks whose settings are in use. Each driver keeps the favourite-style whole setup (without the vehicle preset and auto-start, which belong to the car) in `driver-profiles.json`: a change is kept for the driver at the time, a driver seen again gets theirs back in one write, a driver seen for the first time keeps the current settings. The row shows `On · Driver 2 / 2`, or that the driver cannot be read. Read directly from the settings host (not through the worker's demand set), only while on; the package already carries the SessionManager proxy from the kit template.
- The Basic tab no longer shows the orange renderer / display-area notices (the user guide keeps them); every Basic row is the same height.

## Cluster Redline 1.3.12

- **Navigation colours**: the NAV tab's Navigation colour screen now sets both the **arrow colour** (turn arrow and the recommended lanes) and the **text colour** (distance, road name, exit name), each orange / green / blue / white, with a live preview. The text was always white before. Defaults are unchanged (blue arrow, white text); a saved grey arrow, no longer offered, becomes white. The text colour (`navTextColor`) is kept outside app.json, like the turn signal colour, and is part of favourites.

## Hangul in the apps again (Circuit 1.0.5, Cluster Redline 1.3.11, MGU Monitor 1.1.7, Seats Easy Access 0.6.16)

- On an iDrive 8 car, once appsKOR's GPU renderer (`idrive7-renderd`) was installed, every Korean text inside the apps came out blank (the HMI's own titles, Latin letters and numbers still showed), in Cluster Redline too. The runtime connects to that renderer before the Store's `mgu-render`, and it keeps every app's glyph atlases in one shared texture, two 1024 x 4096 columns, first come first served until it restarts. The Korean atlas needs one stretch of 2976 rows; after the HUD / cluster / number atlases took more than 1120 rows of each column it no longer fitted ("glyph atlas texture full").
- The kit runtime from appsKOR (appsKOR_fork 44b159e) sends an atlas taller than 512 rows as pieces of at most 512 rows (Korean: 6), each with its own id, and records one glyph run per piece; the text is drawn pixel for pixel as before. All eight runtime templates now carry those `kit/fonts.js` and `kit/record.js`; only these two files change.
- New versions so installed cars get it as an update.

## Cluster Redline 1.3.10

- **License: permission required.** From this version Cluster Redline's own code, drawings and screens are licensed by 잼님 (jaimeen77) under `apps/cluster_redline/LICENSE` (all rights reserved): installing it from this repository / its MGU Store source and using it privately in your own vehicle is allowed; copying, redistributing, modifying, putting it into other apps or commercial use needs prior permission. Versions up to 1.3.9 were MIT and stay so.
- Components by others keep their licenses (`apps/cluster_redline/NOTICE`, `NOTICE.cluster-redline.md`): `cluster_render_client.js` MPL-2.0 (its license text moved from `LICENSE` to `NOTICE`, still shipped in the package), the runtime kit, the Redline HUD drawing and the drive mode mappings MIT, the font OFL-1.1, the `patches/` GPL-3.0-or-later.
- No functional change; the version is raised so installed copies get the new license files.

## Cluster Redline 1.3.9

- Vehicle alerts now use the inputs the 2026-11-14 drive logs (speed-probe, speed-probe2) actually showed. In the first log the route event query passed only with an empty type list and returned no events; `speedLimitAssistInfo` was always `NO_VALUE`. In the second, the camera sign recognition delivered speed limits and 13 children signs. So:
  - **Speeding** and **children signs** come from the camera sign recognition again (`traffic-signs.js`, `traffic-live.js` restored from 1.2.57): the TSR class must agree with the camera's SPEED_LIMIT (2/6/8/10 = 10/30/40/50 km/h, the pairs in the log), speeding at limit +3 km/h for 1 s, children signs for 6 s with 30 s between alerts. Replaying speed-probe2 gives speeding in the 30 zone at 04:51:21, 04:52:02, 04:52:27 and children signs at 04:51:51, 04:52:39.
  - The three inputs (`Vehicle2.statusCarSpeed2`, `TrafficSignRecognition`, `SignRecognitionFrontCamera.TrafficSignRecognitionFrontCamera`) are added read-only at install when the car's catalog has them (`traffic-config.js`; desktop installer patch v16 does the same, parity tested).
  - **Speed cameras** stay on the route events; the empty type list (the one the car accepted) is the last fallback. No speed camera event was in either log, so this is still unverified; the status line shows it.
- NAV tab status line: sign recognition / camera / speed receive counts and the speed camera replies.

## Cluster Redline 1.3.8

- **Vehicle alerts on the HUD** (NAV tab → Vehicle alerts: off / speeding / school zone / speed camera / show all). Read from the car navigation's own route events with the existing read-only `GuidanceEventList.queryContent` (`INCLUDE_SPEED_CAMERA`, `INCLUDE_SCHOOL_ZONES`, `INCLUDE_SPEED_LIMIT_ASSIST`; if the car refuses the set, each kind is asked alone and only accepted ones are kept). Speeding is the car's own `speedingInfo: TOO_FAST`; school zones show from 300 m and inside; speed cameras from 1 km, section cameras with their average speed and while inside. Shown on an overlay layer of their own above the stock or Redline HUD; the speeding and children drawings are the 1.2.54-1.2.57 ones, the camera icon is new.
- The NAV tab's Position / size has a **Vehicle alerts** part (move, size, hide; the preview shows all three). The NAV tab shows the alert input: replies, alert kinds in the last reply, whether one is shown.
- Audit of registered vs. demanded signals: cluster yield to Waze now also subscribes the phone's guidance flags (`projectedGuidanceActive`, `projectedGuidanceMetadataAvailable`) when HUD navigation is off; before, only the guidance channel's provider was read. Every other registered input is in the demand set for the features that use it (lane guidance joins while CarPlay guides, by design).

## Cluster Redline 1.3.7

- HUD turn signals never appeared because the car's turn signal fields were never subscribed. The worker subscribes only to what `data-demand.js` lists for the current settings (`demand-signals.js`), and `de.bmw.body.Light` was not in that list, so no notification ever reached the app since 1.3.0 (the Position / size preview draws without the signal, so it looked fine). The two indicator fields are now in the demand set whenever HUD turn signals are on.
- The direction is no longer cleared every frame while the light module has not reported availability (only on an error, or when a provider that was available goes away), as Cluster Info does.
- The HUD turn signal screen shows the car's input: notifications received, the last direction, and whether the arrows are drawn in the Redline HUD or as the overlay.

## Cluster Redline 1.3.6

- HUD turn signals are drawn into the Redline HUD image while it is on screen (its layer shown and the HUD slot not held by the stock HUD or another app), so they are part of the same picture; otherwise the overlay layers of 1.3.5 show them above the stock HUD. The overlay steps aside only once a Redline HUD frame carrying the arrows has been sent, so there is no gap when the Redline HUD comes up.

## Cluster Redline 1.3.5

- HUD turn signals still did not appear with 1.3.4. They were drawn into the Redline HUD image, a content layer that gives way to the stock HUD, so with the stock HUD showing the arrows were behind it. They are now two small overlay layers of their own on the HUD (as Cluster Info shows them), above the stock or Redline HUD: each side is drawn once and a flash only switches its opacity; the layers go 1.2 s after the signal ends. The Position / size preview uses the same layers and no longer brings up the Redline RPM face.

## Cluster Redline 1.3.4

- Battery voltage no longer drops to `--` for half a minute at a time. One late reply was taken as "this ECU has no such value": the reader moved on to the next way of asking, tried the other two and waited 30 s before coming back. A transport turning the request away while busy (other apps such as car_vitals use the same diagnostic link) also meant 30 s, and another app's refusal of a `0x22` read to the DME counted as this request's answer. Now a way that answered is kept until four misses in a row, a missed or busy reply is asked again after 1-2 s, only "not supported" refusals move on, and the last good value stays on screen until the next good one (cleared only when the item is deselected, the engine has been off for 3 minutes or the app stops).
- HUD turn signals show whenever a turn signal or the hazards flash, also with the stock HUD (no Redline RPM face or guidance), as Cluster Info does. The HUD layer is held about 8 s after the signal ends so a lane change does not drop and re-upload it.
- The turn signal (and every other) Position / size preview stays only while the settings screen is drawn: a tab button now ends it, and it lapses within about 3 s when the screen is left by any route, even without a "screen hidden" event.

## MGU Monitor 1.1.6: Log history tab

- A fourth tab, **Log history** (로그 이력): the daily average of the head unit's CPU and memory over the last 30 days from the saved usage logs, and each app's average CPU and average / highest RAM, for all days or the day chosen (tap a day or Next app). A day's log is read once in the background and its summary kept in `usage-summary.json`; today's is read again at most once a minute. `app.json` is unchanged but for the version, so the runtime templates stay as they are.

## iDrive 8: the head unit's oap-sdk in the package, as the original apps (Circuit 1.0.4, Cluster Redline 1.3.3, MGU Monitor 1.1.5, Seats Easy Access 0.6.15)

- On an iDrive 8 car the original idrive7-apps (English) open while these apps, English editions included, stayed on "Loading". The one way the packages are made differently: the original's Store build has `"sdk": "oap-sdk"`, so the Store puts the oap-sdk module it makes from the unit's own donor into the build and the package carries it in `node_modules/oap-sdk`; these were built without it and left the module to the installer's module mode. Every Store entry now has `"sdk": "oap-sdk"` and `tools/store-build.js` puts that module into the package. It is never in this repository; without it (not on a head unit) the package is as before.

## iDrive 8: Korean editions start (Circuit 1.0.3, Cluster Redline 1.3.2, MGU Monitor 1.1.4, Seats Easy Access 0.6.14)

- On iDrive 8 the kit writes a setting's On / Off as text. Korean values are not ASCII, so the kit's `hmi-text.js` sent them through the component's HMI string bundle; where that bundle is missing it threw and the app's whole start failed, so the Korean editions stayed on "Loading" while the English ones ran. All eight runtime templates now carry the fixed `hmi-text.js` from appsKOR (plain Text when the bundle is missing or refuses; the start goes on). Only that file changes in the templates.

## iDrive 8: fit the manifest to the head unit (Circuit 1.0.2, Cluster Redline 1.3.1, MGU Monitor 1.1.3, Seats Easy Access 0.6.13)

- `tools/store-build.js` takes out of the app's SOME/IP manifest whatever the head unit's interface catalog lacks (missing fields, methods, broadcasts, named instances; r / s / w without a getter / notifier / setter; absent `_optional` interfaces), the same as the App Kit's `build.py` `fit_to_unit` does for the kit's own apps, and writes `javascript/kit/missing-interfaces.json`. iDrive 8 firmware has a different catalog from the iDrive 7 one the templates were prepared against; apps could install there and stay on "Loading". Without a catalog (not on a head unit) nothing changes.
- New versions for all eight Store entries (Korean and English), so cars that already installed them get the fitted package as an update.

## Cluster Redline 1.3.0

- CLUSTER and HUD display tabs: All modes RPM display has a third choice, **Redline app · except Sport modes**. Every drive mode but Sport (Sport, Sport+, Sport Individual and the plug-in hybrid Sport modes) shows the Redline display; Sport follows the Sport mode RPM display row.
- HUD display tab, last row: **Turn signals on HUD** (off by default), by default just under the RPM gauge. On / off, shape (default arrow; `<<< >>>`, which fills one, two, three chevrons in turn each flasher cycle instead of going dark; `< >`) and colour (green, blue, orange). Position / size moves both arrows together (and sizes them), or the left or right arrow on its own; each can be hidden. The arrows flash with the car's flasher (about 640 ms a cycle) from the light module's indicator fields (`de.bmw.body.Light` StatusFunctionsIndicators / StatusFunctionsIndicators2, optional and read-only). Only the lit arrow is in the HUD frame, so a flash uploads just its own rectangle. They show while the Redline HUD is on (RPM display or navigation).
- The settings are kept outside app.json (like the designs) and saved in favourites. All Store runtime templates are regenerated (new Korean strings in `localization/ko-additions.tsv`).

## iDrive 7 and iDrive 8 Store packages

- Rebuild every Store runtime template (Circuit, Cluster Redline, MGU Monitor, Seats Easy Access; Korean and English) with the latest appsKOR App Kit (2bb7902) through the existing overlay. Each package now carries the iDrive 7 and iDrive 8 RHMI descriptions, and `package.json` says `mguHmi: ["ID7", "ID8"]` like the catalog, so iDrive 8 no longer refuses the install.
- `tools/prepare-storage.py` writes the iDrive 8 description too and takes the kit commit for provenance (`--kit-commit`); `tools/store-build.js` stamps both HMIs.
- `mgu-monitor-names` is for iDrive 7 and iDrive 8 (it only reads installed app metadata).
- Versions: iDrive Circuit 1.0.1, Cluster Redline 1.2.59 (1.3.0 above), MGU Monitor 1.1.2, Seats Easy Access 0.6.12, so iDrive 7 installs update to the new packages too. iDrive 8 has not been tested on a car yet.

## Store listing visibility

- Remove the catalog's ID7-only visibility filter for all eight app listings and the name-map helper. Explicit `mguHmi: null` overrides manifest defaults, so ID8 sees compatibility as unknown and the Store lists the items.
- Label ID8 unverified in each listing. Preserve existing package ID7 restrictions and UI resources; this changes discovery only and does not claim or enable ID8 installation support.

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

## MGU Monitor (formerly Storage)

### 1.1.1

- Resolve installed app names from a read-only UID/title export instead of relying on other apps' protected folders. Bundle the mgu-monitor-names 0.1.0 dependency; preserve app permissions and use actual UID mappings rather than fixed UID guesses.
- Sample CPU/RAM and per-app usage every 10 seconds, retain 181 points/30 minutes and keep the five/fifteen-minute growth windows and one-minute confirmation.
- Preserve all 10-second records in three-sample gzip blocks, keeping the existing 30-day retention and storage bounds; flush buffered rows on graceful exit or recording disable.
- Keep storage/storage_en identities and existing settings/data. Test the actual Store parser/tool package, title export, UID movement, log batching and both packaged renderers. On-car verification of this fix remains pending.

### 1.1.0

- Rename the visible app, native entry and widget to MGU Monitor / MGU 모니터; preserve storage/storage_en IDs for existing installs.

- Add a CPU / Memory tab with per-app CPU, RSS, five-minute growth and selectable 30-minute graphs. Keep whole-unit CPU/RAM percentages visible on every tab.
- Read aggregate CPU counters and group readable processes/helpers by OAP UID every 30 seconds. Handle PID reuse, permissions and disappearing processes without inventing zero values.
- Add sustained CPU/memory growth and possible-leak indicators; require continuous valid history and document thresholds and RSS limitations.
- Write real whole-unit/per-app samples to daily compressed CSV every 30 seconds. Retain 30 days with startup/hourly expiry, file/total bounds, error reporting and no demo logging.
- Release both Korean and English editions as 1.1.0; keep existing IDs, settings and the background/watermark. Host package/renderer/process/retention tests pass; vehicle verification remains pending.

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

### 1.2.58

- Remove the hidden recording menu, persistent recording startup and all probe/archive runtime modules. Existing recordings remain untouched; no collector resumes from the old on flag.
- Remove the experimental traffic-sign HUD setting, diagnostic line, painter, decoder and subscriptions. Ignore saved traffic settings and old favorites. Remove probe-only install inputs in both desktop and Store filters, including cleanup of retired source files in older overlays.
- Cap periodic settings refresh at 2 fps even when a GPU host ticks faster; user actions remain immediate. Bound the in-memory error history to eight messages of at most 320 characters; it previously bounded only the displayed copy. Verify subscription lifecycle, shutdown, output backpressure, retained rendering and no-log behavior. Add a reproducible host CPU/memory rendering benchmark.

### 1.2.57

- Fix traffic events being discarded while a native binding has not reported provider availability. A recent received event can establish input liveness; explicit provider loss, input errors, stale data and the existing sign validation still hide invalid alerts. This reproduces a possible cause of missing alerts, not a confirmed diagnosis of the vehicle.
- Add a live HUD-settings status line with camera/combined-recognition receive counts and the reason for waiting (missing input, inactive HUD, unsupported speed class, expired data). It uses in-memory status without enabling file recording. The supported 10/30/40/50 km/h pairs and six-second children-sign popup are unchanged.
- Verify the actual worker with incoming speed/limit/children events while availability stays false, plus disconnect/recovery/freshness and bilingual Store rendering.

### 1.2.56

- Add **Save + new recording** to the hidden data-collection menu. The current file and older rotation are saved chronologically as `speed-probe-1.log`, `speed-probe-2.log`, etc. Numbering survives app restarts and existing archives are never replaced. A completed numbered snapshot is committed before the active capture is reset; storage failures are shown in the menu.
- Continue collecting with fresh version/catalog/input/availability/query metadata and reset per-file duplicate/raw-reply suppression without reopening live readers. Saving while stopped starts the next capture; no-data saves start recording without an empty numbered file.
- **Clear current records** leaves numbered archives and the sequence counter intact and re-emits metadata while recording. Diagnostic report collection also lists numbered archives (head/tail excerpts). No new traffic-data sources were added in this change. See [recording guide](docs/PROBE-RECORDING.ko.md).

### 1.2.55

- Bring traffic icons closer to the design sample: thicker red speed-sign ring, larger wide bold white numbers, a rounded overspeed triangle, and a thick rounded amber triangle with filled shirt/shorts/dress/ponytail silhouettes instead of stick figures. White headings and grey sublabels follow the sample's hierarchy.
- Keep icons as clean antialiased vector drawing; no generated-image background/noise or decoder is shipped. Add an enlarged preview drawn by the same painter and bilingual caption/font checks. Traffic inputs, timing and supported speeds are unchanged.

### 1.2.54

- Replace the traffic-alert text markers with HUD vector icons: red-ring speed sign, overspeed warning triangle, and an amber children-crossing triangle containing two walking children. Normal speed numbers stay white for contrast. There is no icon image upload or new vehicle command.
- Add actual settings-page, option-menu and each icon-state previews. The experimental input validation, defaults, timing and supported speeds from 1.2.53 are unchanged; enforcement cameras/section control/school-zone boundaries remain unsupported.

### 1.2.53

- Add opt-in **Traffic sign alerts · experimental** under HUD settings (off, recognised speed limit, children sign, both). Only the existing selected Redline HUD is used; stock guidance/yield rules remain in force.
- Validate the vehicle log's known TSR class/number pairs against a recent KM_H camera speed sign. Invalid, withdrawn, disagreeing, unsupported, supplementary, low-quality or stale inputs hide the limit. The prototype recognises only the observed 10/30/40/50 km/h pairs; this is not a complete road-speed-limit decoder.
- Highlight speed above the recognised limit +3 km/h for one second; clear at limit +1 km/h or on speed/source expiry. Show children-sign detection for six seconds, with a 30-second repeat cooldown. No audio, school-zone boundary, map distance or camera enforcement alert is inferred.
- Add input, freshness, demand, settings and retained-pixel erasure tests; replayed the supplied second probe locally without committing the vehicle log. Vehicle/HUD operation still needs validation. See [Korean guide](docs/HUD-TRAFFIC.ko.md).

### 1.2.52

From the first drive log (35 min, up to 74 km/h, 29 speed-limit names in the catalog; nothing arrived from the car's speed limit display; the route query accepted only an empty type list):
- **Install time: the inputs that can carry a speed limit come first**, ten at most: the car's speed limit display (`TrafficSignDisplayControl.displaySpeedLimitAndNoPassingRestriction`), the navigation's speed limit at the car position, which needs no route (`adasng.CCP` events `effectiveSpeedLimit`, `speedLimitUnit`, `variableSpeedLimitSign`; `navigation.ADAS` `speedLimitProfileNavGraph2`, `trafficSignNavGraph2`), `FASuS.statusNextSpeedLimitRecognition`, camera sign recognition events, then other speed-limit names that are values. Settings (`setting…`, `…Enabled`, NCAP) are no longer picked. Events are added as broadcasts with a valid eventId. Desktop installer patch v14 does the same.
- **Runtime**: events are subscribed too; each interface's availability is recorded (on change), so a silent input shows whether its provider answers at all.
- **Route events**: each `includedTypes` name is tried alone once (catalog names first, then ~26 guesses) and the result recorded (`route-types`: accepted / rejected); afterwards all accepted names are queried together. The HUD's own replies and the collection's are deduplicated separately (the first log had a line per poll).
- Tests: `optional-speed-probe.test.py` (priority, events, settings skipped, cap), `redline-1-2-51` (type discovery, per-source dedupe).

### 1.2.51

- **Speed limit data collection: route events of every kind.** The HUD's own route-event query asks only for turns and destinations, and only for a phone's guidance, so school zones, speed cameras and speed limits never arrived. While the collection is on it now queries `GuidanceEventList.queryContent` itself every 2 s (on the worker's proxy, BMW navigation or phone alike). `includedTypes`: the `INCLUDE_*` names found in the car's catalog first, then a few guesses; a rejected set moves on to the next and a working one is kept; each query result (types, error, event kinds) and the first raw reply with a speed event are recorded. The hidden menu shows the query state and the event kinds.
- School-zone names (`school zone`, `child zone`) count as speed-limit names in the catalog scan and the install-time inputs.
- Desktop installer patch v13: the same school-zone names.
- Tests: `redline-1-2-51`, `optional-speed-probe.test.py` (school zones).

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
