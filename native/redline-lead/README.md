# redline-lead (Cluster Redline lead-car helper)

The car ahead for Cluster Redline's HUD headway badge on cars whose head unit keeps the driving assistant's SOME/IP
services from apps. On the user's car (2026-11-26) Cluster Redline's uid saw the radar's `GapVehicleAhead`, the Drive
assist view's sources and the front camera's `ObjectRecognitionFrontCamera2` all "not offered", while a root process
received the camera's object list (0xF139, events 0x8001 / 0x8002) and `GapVehicleAhead` (0x3539).

- `redline-someip` (src/, MIT, our own): a minimal vsomeip client. It requests the services, subscribes the eventgroups
  and prints each notification as `ev 0xSVC 0xEVT HEX`. Read only: no requests, no field writes. Built by `build.sh`
  in Ubuntu 18.04 (the unit's gcc 7.5 / glibc 2.27) against a stub of the unit's libvsomeip3 3.1.34 and checked with
  idrive-apps' `abi.py` (glibc <= 2.27, libstdc++ <= 6.0.24, only symbols the unit's library exports).
- `redline-lead.js` (root, systemd): runs it while a client is connected, decodes the payloads (big endian; the
  catalog's layouts as BimmerVision's published schema lists them, the length fields checked against them) and
  serves `/run/redline-lead/lead.sock` (0666, JSON lines). The car followed: the nearest vehicle the camera puts in our
  lane (driving-tube mapping 1), metres as sent.
- 0.2.0: also the lane lines for Cluster Redline 1.3.77's HUD Lane lines: `LaneBoundaries` (0xD024, eventgroup 3,
  event 0x8003, 1193 bytes; open to root at about 16 Hz on the user's car). Sent as `lane: {rx, at, data: {width,
  visibility, lines: [{y, type, color, existence, ...}]}}`; y: metres to the left of the car's axis.

Test by hand on the unit (root): `/var/opt/redline-lead/current/redline-someip 0xf139:1:2:1:0x8001,0x8002`
- 0.3.0: also every object the camera measures, not only the car followed: `cam.objects` = [{id, type (0 pedestrian,
  1 cyclist, 2 motorbike, 3 car, 4 truck / bus / van, 5 other, 6 unknown), x (m ahead), y (m left), tube (1 our lane,
  2 / 4 beside), mv, lat}], nearest first. For Cluster Redline's pedestrian / cyclist and cut-in warnings and the road
  users around. `log-objects.js [seconds] [file]` records them from the socket (default 20 s to
  `/var/opt/public/redline-objects.log`), to see how they come while driving.
- 0.4.0 had scene clips (clips.js) and `log-objects.js`; **0.5.0 removes them** (the user's clean-up: the warnings'
  criteria are set from the clips already taken).
- 0.5.0: `share.js` gives Cluster Redline's `nav-probe.log` to a phone, read only, while the app's "Download by QR"
  is on (`{t: 'cmd', share: true, file}` on the socket; only `/var/opt/public/oap/oap_<n>/data/nav-probe.log` can be
  given). A page on port 18885 (18884 is the GIF player's own, for Cluster Redline's GIFs) and one firewall rule of its own (tag `redline-lead-share`, private senders, any
  interface: the car's own Wi-Fi or one it joined), both gone when the app stops asking or leaves.
- 0.6.0: the car's GPS position for Cluster Redline's Position check (and the speed camera warnings to come), while
  the app asks for it (`{t: 'cmd', position: true}` each second; 5 s without it and it stops). A second
  redline-someip subscribes `0xfb0c:128:4:1:0x8001:f` (Positioning.currentLocation, map matched) and
  `0xfb0c:128:4:4:0x8004:f` (rawPositionData, GNSS); `decodeWgs` finds the Wgs84Coordinate3D {coordinatesValid,
  heightValid, longitude double, latitude double} in each. Sent on the socket as `position: {on, child, rx, avail, map,
  raw}`; never written to a file or the log. Checked on the user's car (2026-11-28): Positioning is offered on instance
  128 to uid 0 (the app's uid gets nothing); NavigationStatus and PositioningCAN are not offered on any instance.
  Test by hand: `sleep 20 | /var/opt/redline-lead/current/redline-someip 0xfb0c:128:4:1:0x8001:f`
- 0.7.0: whether the cruise control (ACC) shows on the cluster, while Cluster Redline asks (`{t: 'cmd', acc: true}`
  each second; 5 s without it and it stops), so the app can give the cluster back to the car's own ACC display. A third
  redline-someip subscribes `0xb50e:1:1:2:0x8002:f` (FASuS displayDriverAssistenceSystemLongitudinalGuidance: crc,
  alive, chl, displayXCC u16, activeFunction...). On the user's car (2026-11-28, instance 1): bytes 3-5 `00 00 00` with
  ACC off, `13 00 20` with it on; `decodeAcc` reads on when any of them is not 0. Sent as `acc: {on, child, rx, avail,
  value: {on, xcc, active, at}}`.
