'use strict';
// A car seen from behind and a little above (1.3.79), for the HUD lane lines and the headway badge, as the user's
// reference: a rounded body, the cabin narrower on it with its rear window, the tail-lamp bar, the bumper, the wheels.
// cx: the middle, by: the ground under the wheels, cw: the body's width; o.paint: the body's colour (grey by default,
// the badge's colour step for its icon), o.lamp: the tail lamps' colour, o.glow: a soft halo of that colour behind it.
const mix = (a, b, t) => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t)).concat([a[3] === undefined ? 255 : a[3]]);
function rearCar(cv, cx, by, cw, o) {
    o = o || {};
    const base = o.paint || [128, 134, 144, 255], lite = mix(base, [255, 255, 255], 0.38), dark = mix(base, [0, 0, 0], 0.45), glass = mix(base, [10, 14, 20], 0.72);
    const u = cw, x = (f) => cx + f * u, y = (f) => by - f * u;
    // the halo: soft rounded layers just round the car, fading outwards
    if (o.glow) [[0.26, 14], [0.18, 22], [0.1, 34]].forEach(([p, a]) => cv.roundRect(x(-0.52 - p), y(0.9 + p), u * (1.04 + 2 * p), u * (0.92 + 2 * p), u * (0.3 + p), [o.glow[0], o.glow[1], o.glow[2], a]));
    cv.fill([[x(-0.56), y(-0.03)], [x(0.56), y(-0.03)], [x(0.5), y(0.05)], [x(-0.5), y(0.05)]], [0, 0, 0, 150]);              // the shadow
    cv.roundRect(x(-0.47), y(0.12), u * 0.17, u * 0.13, u * 0.03, [24, 26, 30, 255]);                                   // the wheels
    cv.roundRect(x(0.30), y(0.12), u * 0.17, u * 0.13, u * 0.03, [24, 26, 30, 255]);
    // the body: wider at the shoulders, its top lighter
    cv.fill([[x(-0.46), y(0.06)], [x(0.46), y(0.06)], [x(0.5), y(0.3)], [x(0.48), y(0.46)], [x(-0.48), y(0.46)], [x(-0.5), y(0.3)]], base);
    cv.fill([[x(-0.48), y(0.46)], [x(0.48), y(0.46)], [x(0.44), y(0.52)], [x(-0.44), y(0.52)]], lite);
    cv.fill([[x(-0.42), y(0.06)], [x(0.42), y(0.06)], [x(0.44), y(0.17)], [x(-0.44), y(0.17)]], dark);                  // the bumper
    // the cabin: narrower, the rear window dark with a glint, the roof light
    cv.fill([[x(-0.4), y(0.52)], [x(0.4), y(0.52)], [x(0.31), y(0.82)], [x(-0.31), y(0.82)]], mix(base, [255, 255, 255], 0.12));
    cv.fill([[x(-0.33), y(0.55)], [x(0.33), y(0.55)], [x(0.26), y(0.78)], [x(-0.26), y(0.78)]], glass);
    cv.fill([[x(-0.18), y(0.6)], [x(-0.08), y(0.6)], [x(-0.04), y(0.74)], [x(-0.12), y(0.74)]], [255, 255, 255, 34]);
    cv.fill([[x(-0.31), y(0.82)], [x(0.31), y(0.82)], [x(0.27), y(0.87)], [x(-0.27), y(0.87)]], lite);
    // the tail lamps: one bar across, brighter at its ends
    const lamp = o.lamp || [170, 36, 44, 255];
    cv.fill([[x(-0.46), y(0.36)], [x(0.46), y(0.36)], [x(0.46), y(0.4)], [x(-0.46), y(0.4)]], [lamp[0], lamp[1], lamp[2], 150]);
    cv.fill([[x(-0.47), y(0.33)], [x(-0.3), y(0.34)], [x(-0.3), y(0.41)], [x(-0.47), y(0.42)]], lamp);
    cv.fill([[x(0.3), y(0.34)], [x(0.47), y(0.33)], [x(0.47), y(0.42)], [x(0.3), y(0.41)]], lamp);
    return cv;
}
module.exports = { rearCar, mix };
