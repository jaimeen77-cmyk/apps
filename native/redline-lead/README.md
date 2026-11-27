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
- 0.4.0: scene clips (`clips.js`) while Cluster Redline's "Scene recording" is on (it sends `{t: 'cmd', rec, speed,
  gear, save}` lines on the socket). The last 30 s of the camera's objects, the car followed, the lane lines, the
  speed and gear are kept at 10 frames a second. A clip (20 s before, 10 s after) is saved for a pedestrian / cyclist
  within 30 m and 2.5 m of our path, a vehicle beside us coming 0.6 m nearer our lane in a second, the app's lead car
  departure alert, or the driver (BC three times, Save now). Clips go to `/var/opt/public/redline-clips/`, at most 50
  files / 5 MB, the oldest go first. `share.js` serves them read-only to a phone on the car's Wi-Fi (`wlan_bridge`,
  port 18884: the list, each clip, all in one file) with a firewall rule of its own (tag `redline-lead-clips`), both
  only while recording is on.
