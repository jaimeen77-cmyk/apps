# Changelog

Version history is kept here. For current usage, see the [user guide](docs/USER-GUIDE.md) / [사용 설명서](docs/USER-GUIDE.ko.md).

## Storage

### 1.0.2

- New app icon: a memory card with a usage gauge, in the white line style of the other apps, replacing the clipped "storage" text icon. Used for the Store listing, the car's app list and the home widget in both editions; the runtime templates were regenerated from the same appsKOR kit commit (contents unchanged apart from the icon).

### 1.0.1

- Publish separate Korean (`storage`) and English (`storage_en`) MGU Store entries, both version 1.0.1, with offline SDK-free builds and independent RHMI identities.
- Localize disk/app/RAM screens, settings, usage warnings and home widgets; preserve setting keys and use StringBundle handles for Korean widget text.
- Keep storage measurement read-only. Force C-locale df parsing, skip symlink app roots and mark incomplete scans.
- Check both installed packages with host rendering and filesystem fixtures. Real-vehicle verification remains pending.

## Cluster Redline

### 1.2.7

- New cluster setting **Yield to Waze map**: all modes incl. Sport / all modes except Sport / don't yield (default). When yielding, the cluster map layer goes under other apps' map layers (Waze on cluster, content z 0) and is no longer exclusive, so a streamed map covers it; it switches with the drive mode without rebuilding the layer. HUD and panel output are unchanged.
- Outside temperature is now read exactly as the eDrive app reads it: subscribed only (also when the car's catalog lists a getter, which is never read) and the last value the car sends is kept. It is no longer cleared while the interface is not reported available (some bindings never report availability); only a failed subscription clears it. Other auxiliary items are unchanged.

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
