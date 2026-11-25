# Car layout pictures

The Cluster Redline Car layout's pictures (`apps/cluster_redline/car-meter-frames.js` for the cluster,
`car-meter-hud-frames.js` for the HUD) are made here: original low-poly 3D renders of a generic white-over-black
1980s hatchback at night (no logos or lettering). Python 3 only, no packages.

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
