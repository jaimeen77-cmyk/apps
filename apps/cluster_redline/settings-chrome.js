'use strict';
const { t } = require('./kit/i18n');
const G = require('./kit/gauges');
// App-local chrome: larger targets without changing the shared renderer service.
function header(cv, theme, x, y, w, h, title, tabs, selected, badges, flat, compact) {
    const names = (tabs || []).map((s) => t(s).toUpperCase());
    const opt = { font: 'bold', align: 'center', spacing: 1 };
    const titleText = t(title), titleWidth = cv.textWidth(titleText, 32);
    const badgeWidth = (badges || []).length ? 156 : 0;
    // Tabs keep 28 px and roomy cells when they fit; otherwise (five long English names) the cells tighten and
    // then the text steps down, so the tabs and the version badge never overlap.
    let textSize = 28, widths = names.map((s) => Math.max(224, cv.textWidth(s, textSize, opt) + 56));
    const room = w - 40 - badgeWidth, sum = (a) => a.reduce((p, q) => p + q, 0);
    if (sum(widths) > room) widths = names.map((s) => cv.textWidth(s, textSize, opt) + 40);
    while (sum(widths) > room && textSize > 20) { textSize--; widths = names.map((s) => cv.textWidth(s, textSize, opt) + 32); }
    const showTitle = 40 + titleWidth + 32 + widths.reduce((a, b) => a + b, 0) + badgeWidth <= w;
    const contentWidth = 40 + (showTitle ? titleWidth + 32 : 0) + widths.reduce((a, b) => a + b, 0) + badgeWidth;
    const end = compact ? x + Math.min(w, contentWidth) : x + w;
    cv.fillRect(x, y, end - x, h, theme.bg);
    cv.fillRect(x, y + h - 2, end - x, 2, '#51555c');
    let left = x + 20;
    if (showTitle) { cv.text(titleText, left, y + h / 2 + 11, 32, theme.text); left += titleWidth + 32; }
    cv.tabRects = [];
    names.forEach((name, i) => {
        const width = widths[i], on = i === selected;
        cv.tabRects.push({ i, x: left, y, w: width, h });
        if (on) {
            cv.gradientRect(left, y, width, h, [[0, '#170b10'], [1, '#49202b']]);
            cv.fillRect(left, y + h - 5, width, 5, theme.sel || theme.accent);
        }
        cv.text(name, left + width / 2, y + h / 2 + 10, textSize, on ? '#ffffff' : theme.dim, opt);
        left += width;
    });
    if (badgeWidth) {
        const bx = compact ? left + 12 : end - 148;
        cv.roundRect(bx, y + (h - 38) / 2, 136, 38, 6, '#252a31');
        cv.text(badges[0].text, bx + 68, y + h / 2 + 7, 20, '#bdc6d2', opt);
    }
    return end;
}
function configure(ctx) {
    const display = ctx.display;
    if (!display || display.redlineLargeControls) return;
    display.redlineLargeControls = true;
    // Tabs already switch pages. Leave four roomy bottom controls for values.
    if(ctx.hideButton)['BTN_BASIC','BTN_HUD','BTN_CLUSTER','BTN_NAV'].forEach(k=>ctx.hideButton(k));
    const oldTheme = display.theme, oldHeight = display.barH, oldButtons = display.buttons;
    display.barH = function () { return this.ownable() ? 80 : oldHeight.call(this); };
    display.buttons = function () {
        const buttons = oldButtons.call(this);
        if (!this.ownable() || !buttons.length) return buttons;
        const width = (1920 - 84) / buttons.length;
        return buttons.map((b, i) => Object.assign({}, b, { x: 84 + i * width, w: width }));
    };
    display.theme = () => Object.assign({}, oldTheme.call(display), { redlineLargeControls: true, redlineBarHeight: display.barH() });
    if (!G.redlineLargeControls) {
        const oldHeader = G.header, oldMenu = G.menuBar;
        G.header = function () { return arguments[1].redlineLargeControls ? header.apply(null, arguments) : oldHeader.apply(null, arguments); };
        G.menuBar = function (cv, theme, x, y, w, h, buttons, focus, variant, flash) {
            if (!theme.redlineLargeControls || variant !== 'slim') return oldMenu.apply(null, arguments);
            const height = theme.redlineBarHeight || h, size = height >= 80 ? 28 : 20;
            cv.fillRect(x, y, w, height, '#11151b');
            buttons.forEach((b, i) => {
                if (i === focus || i === flash) cv.gradientRect(b.x, y, b.w, height, [[0, '#30151d'], [1, '#6a2337']]);
                cv.line(b.x, y + 12, b.x, y + height - 12, 1, '#565d66');
                cv.text(b.label, b.x + b.w / 2, y + height / 2 + size * 0.36, size, '#f3f5f7', { font: 'bold', align: 'center' });
            });
        };
        G.redlineLargeControls = true;
    }
    if (display.gpu && display.gpu.ready) display._place();
}
module.exports = { header, configure };
