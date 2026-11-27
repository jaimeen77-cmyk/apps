# Car layout pictures

Since Cluster Redline 1.3.90 the pictures (`apps/cluster_redline/car-meter-frames.js` for the cluster,
`car-meter-hud-frames.js` for the HUD) are the owner's BMW M3, made by `m3.py`:

- driving, standing still, braking, accelerating and reversing: the M3 from behind (`../hud-art/vehicles/own.png`)
  over `render3d.py`'s night road;
- cornering steps 1-3 (1.3.94, `turn1_left`..`turn3_left`): the owner's pictures of the M3 in a left bend, its nose
  turned 10, 20 and 30 degrees about the tail lamps (`m3-turn10.png`, `m3-turn20.png`, `m3-turn30.png`), cut out with
  OpenCV's GrabCut and swaying over the road filled in under it; `turn1`..`turn3` (a right bend) are them mirrored;
- cornering step 4 (`drift`): the owner's drift picture (`m3-drift.png`, a left bend), the car swaying about its front
  wheels and its tyre smoke flowing; `car-meter.js` mirrors it for a right drift.

It needs numpy, Pillow and opencv-python-headless. Run from this folder:

```sh
python m3.py preview ../../preview/car-meter                 # 540 x 304 webp loops, every state
python m3.py preview ../../preview/car-meter drift stop       # only some states
python m3.py sprites ../../apps/cluster_redline/car-meter-frames.js 320 180 8
python m3.py sprites ../../apps/cluster_redline/car-meter-hud-frames.js 240 135 8 hud
```

A new state needs its scene in `m3.py` (`STATES`), its name in `car-meter.js` (`want` / `look`) and the tests in
`tests/cluster_redline/car-meter.test.js`. The HUD set draws no road (black is clear on the glass).

## Before 1.3.90: the hatchback

Up to 1.3.88 the pictures were original low-poly 3D renders of a generic white-over-black 1980s hatchback at night
(no logos or lettering), eight states with a left bend the right one mirrored. Python 3 only, no packages; `m3.py`
still uses `render3d.py`'s road.

- `render3d.py`: the car model, camera, road and effects (smoke, flames, light trails, lamps), one scene per
  state: `stop`, `cruise`, `accel`, `brake`, `reverse`, `turn1`, `turn2`, `turn3` (`SCENES`).
- `make_set.py`: drawing helpers (polygons, glows, smoke, palette, GIF writer); on its own, the first 2D drawings.
- `make_sprites.py`: frames to the app's palette indices.

Run from this folder:

```sh
# preview GIFs (540 x 304, 16 frames each; turn*_left.gif mirrored)
python render3d.py gif ../../preview/car-meter
python render3d.py gif ../../preview/car-meter turn3 stop      # only some states

# the app's two picture files (cluster 320 x 180, HUD 240 x 135; 8 frames a state)
python render3d.py sprites ../../apps/cluster_redline/car-meter-frames.js 320 180 8
python render3d.py sprites ../../apps/cluster_redline/car-meter-hud-frames.js 240 135 8 hud
```

A new state needs its scene in `SCENES`, the name in `car-meter.js` (`want` / `look`) and the tests in
`tests/cluster_redline/car-meter.test.js`. The HUD set draws no sky or road (black is clear on the glass).
