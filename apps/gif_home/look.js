'use strict';
// jaimeen77-cmyk/apps: GIF Home's pages in the look of the owner's other apps' settings screens: dark, a red
// accent, the pages as tabs on top with the version on the right, and rows as cards (title, a line below it,
// a value button on the right; the row the controller is on lit, with a red bar). GIF Home's own drawing code.
const { t } = require('./kit/i18n');

const C = {
    bg: '#090b0e', text: '#f3f5f7', dim: '#8d97a4', sub: '#b8c5d4', faint: '#6f7c8c', accent: '#f32b40',
    rule: '#51555c', line: '#292d34', button: '#252a31', buttonOn: '#57202d', badge: '#bdc6d2', warn: '#ffad45',
    tabFrom: '#170b10', tabTo: '#49202b', rowFrom: '#30131a', rowTo: '#090b0e',
};
const HEAD = 80, LEFT = 78, RIGHT = 1538, BOTTOM = 512;

/** Background: the current picture, dimmed (or plain). draw(x, y, w, h) draws it covering that area. */
function backdrop(cv, W, H, draw) {
    cv.clear(C.bg);
    if (draw && draw(0, 0, W, H)) cv.fillRect(0, 0, W, H, [9, 11, 14, 222]);
}

/** Tabs across the top (the selected one lit, underlined in red), the version badge on the right. */
function header(cv, W, tabs, selected, badge) {
    const opt = { font: 'bold', align: 'center', spacing: 1 };
    const names = tabs.map((s) => t(s));
    const badgeW = badge ? 156 : 0, room = W - 40 - badgeW;
    let size = 28, widths = names.map((s) => Math.max(200, cv.textWidth(s, size, opt) + 48));
    const sum = (a) => a.reduce((p, q) => p + q, 0);
    while (sum(widths) > room && size > 20) { size--; widths = names.map((s) => cv.textWidth(s, size, opt) + 32); }
    cv.fillRect(0, 0, W, HEAD, C.bg);
    cv.fillRect(0, HEAD - 2, W, 2, C.rule);
    let x = 20;
    names.forEach((name, i) => {
        const w = widths[i], on = i === selected;
        if (on) {
            cv.gradientRect(x, 0, w, HEAD, [[0, C.tabFrom], [1, C.tabTo]]);
            cv.fillRect(x, HEAD - 5, w, 5, C.accent);
        }
        cv.text(name, x + w / 2, HEAD / 2 + 10, size, on ? '#ffffff' : C.dim, opt);
        x += w;
    });
    if (badge) {
        const bx = W - 148;
        cv.roundRect(bx, (HEAD - 38) / 2, 136, 38, 6, C.button);
        cv.text(badge, bx + 68, HEAD / 2 + 7, 20, C.badge, opt);
    }
}

/** A value button: lit when on (the row the controller is on). */
function button(cv, x, y, w, h, label, on) {
    cv.roundRect(x, y, w, h, 6, on ? C.buttonOn : C.button);
    const text = t(String(label));
    let size = 28;
    while (size > 18 && cv.textWidth(text, size, { font: 'bold' }) > w - 24) size--;
    cv.text(text, x + w / 2, y + h / 2 + size * 0.36, size, C.text, { align: 'center', font: 'bold' });
}

/**
 * Rows as cards from y down to the bottom: [{ title, sub, value, note, dim }]; the focused one lit. Rows that don't
 * fit scroll with the focus. area: { x, y, w }; h: row height (76+ with a line below the title).
 */
function rows(cv, list, focus, area, h) {
    const x = area.x == null ? LEFT : area.x, w = area.w == null ? RIGHT - LEFT : area.w, top = area.y == null ? HEAD + 16 : area.y;
    const fit = Math.max(1, Math.floor((BOTTOM - top) / h));
    const first = focus >= fit ? focus - fit + 1 : 0;
    const two = h >= 76;
    list.slice(first, first + fit).forEach((r, k) => {
        const i = first + k, y = top + k * h, on = i === focus;
        if (on) {
            cv.gradientRect(x, y, w, h - 2, [[0, C.rowFrom], [1, C.rowTo]]);
            cv.fillRect(x, y + 10, 4, h - 22, C.accent);
        }
        const bw = r.value != null ? Math.min(400, Math.round(w * 0.34)) : 0;
        const tx = x + 22, maxText = w - bw - 60;
        cv.text(fitText(cv, r.title, two ? 30 : 27, maxText), tx, two ? y + 36 : y + h / 2 + 10, two ? 30 : 27, r.dim ? C.faint : C.text);
        if (two && r.sub) cv.text(fitText(cv, r.sub, 21, maxText), tx, y + 66, 21, r.subColor || C.sub);
        if (r.note) cv.text(r.note, x + w - bw - 24, y + (two ? 36 : h / 2 + 8), 22, C.warn, { align: 'right' });
        if (r.value != null) button(cv, x + w - bw - 8, y + 10, bw, h - 22, r.value, on);
        cv.line(x + 6, y + h - 1, x + w - 2, y + h - 1, 0.6, C.line);
    });
    if (list.length > fit) {
        // a thin scroll bar on the right edge
        const span = BOTTOM - top, bar = Math.max(30, span * fit / list.length);
        cv.fillRect(RIGHT + 30, top + (span - bar) * first / Math.max(1, list.length - fit), 4, bar, C.rule);
    }
}

/** label: value lines (status pages), smaller than rows. */
function lines(cv, list, area) {
    let y = area.y;
    list.forEach((l) => {
        cv.text(l[0], area.x, y, 24, C.dim);
        cv.text(fitText(cv, l[1], 24, area.w - area.split), area.x + area.split, y, 24, l[2] || C.text);
        y += area.step || 44;
    });
}

function fitText(cv, s, size, w) {
    let text = t(String(s == null ? '' : s));
    if (cv.textWidth(text, size) <= w) return text;
    while (text.length > 1 && cv.textWidth(text + '...', size) > w) text = text.slice(0, -1);
    return text + '...';
}

module.exports = { C, HEAD, LEFT, RIGHT, BOTTOM, backdrop, header, button, rows, lines };
