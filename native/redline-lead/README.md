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

Test by hand on the unit (root): `/var/opt/redline-lead/current/redline-someip 0xf139:1:2:1:0x8001,0x8002`
