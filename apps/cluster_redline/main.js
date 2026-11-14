'use strict';
const fs = require('fs');
const path = require('path');
const mgu = require('./kit/mgu');
const { t } = require('./kit/i18n');
const { SettingsPage, W, H } = require('./settings-ui');
const { configure } = require('./settings-chrome');
const worker = require('./worker');
const { migrate } = require('./migrate');
const { mapStatus } = require('./output-status');
const { RenderQueue } = require('./render-queue');
const REASONS = {
    disabled: 'Automatic display off', renderer_unavailable: 'Waiting for cluster renderer',
    profile_unknown: 'Check engine profile', hybrid_engine_stopped: 'Hybrid engine stopped · hidden',
    renderer_refused: 'Renderer refused display', target_unavailable: 'Selected display target unavailable',
    mode_unknown: 'Waiting for drive mode', not_sport: 'Normal mode · hidden', rpm_unknown: 'Waiting for engine RPM',
    rpm_invalid: 'Check engine RPM', engine_stopped: 'Engine stopped · hidden', stabilizing: 'Confirming drive mode',
    recovering: 'Waiting for stable live signals', sport: 'Sport mode · display requested',
    comfort_plus: 'Comfort Plus · display requested',
    all_modes: 'All drive modes · display requested', stopped: 'Background app stopped',
    stock: 'Stock display',
    hud_safety: 'Check HUD guidance-yield settings',
    guidance_active: 'Stock navigation active · HUD released',
    guidance_calculating: 'Calculating route · HUD released',
    guidance_unknown: 'Waiting for navigation state · HUD released',
    guidance_stale: 'Navigation state stale · HUD released',
    guidance_unavailable: 'Navigation state unavailable · HUD released',
    navigation_maneuver_unknown: 'Waiting for navigation data · stock HUD preserved',
    navigation_provider_unknown: 'Waiting for navigation data · stock HUD preserved',
    navigation_calculating: 'Calculating route · HUD released',
    projection_unavailable: 'Waiting for phone guidance state · stock HUD preserved',
    projection_unknown: 'Waiting for phone guidance state · stock HUD preserved',
    projection_stale: 'Phone guidance state stale · stock HUD preserved',
    navigation_provider_mismatch: 'Waiting for phone guidance state · stock HUD preserved',
    renderer_recovering: 'Recovering renderer layer',
    cluster_yield: 'Route guidance active · cluster released',
};
// No logs: nothing goes to the system log or a log file. The kit's rotating log file (<id>.log) is removed
// and a folder put in its place so nothing can be appended to it; an earlier status file is removed too.
function quiet(ctx) {
    if (ctx.log) ['error', 'warn', 'info', 'debug'].forEach((level) => { ctx.log[level] = () => {}; });
    const file = path.join(ctx.dataDir, ((ctx.spec && ctx.spec.id) || 'cluster_redline') + '.log');
    [file, file + '.1', path.join(ctx.dataDir, 'cluster-redline-status.json')].forEach((p) => { try { if (fs.statSync(p).isFile()) fs.unlinkSync(p); } catch (e) {} });
    try { fs.mkdirSync(file); } catch (e) {}
}
mgu.run({ settingsUI: 'custom', async start(ctx) {
    quiet(ctx);
    configure(ctx);
    let old = {};
    try { old = JSON.parse(fs.readFileSync(path.join(ctx.dataDir, 'settings.json'), 'utf8')); } catch (e) {}
    migrate(ctx.settings, old);
    // A new app process applies auto-start once; manual operation is independent.
    ctx.settings.set('appEnabled', ctx.settings.get('autoStart') === true);
    let background = null;
    const queue = new RenderQueue(render, report);
    const page = new SettingsPage(ctx.settings, () => queue.request(), ctx.spec.version);
    // A preview left by an earlier process ends now; leaving the settings screen ends Position / size.
    if (ctx.settings.get('layoutPreview')) ctx.settings.set('layoutPreview', '');
    if (ctx.ui && typeof ctx.ui.onVisible === 'function') ctx.ui.onVisible((name, visible) => { if (name === 'MAIN' && !visible) page.leave(); });
    if (ctx.app && ctx.app.once) ctx.app.once('shutdown', () => queue.stop());
    function report() {}   // no logs
    function syncWorker() {
        if (ctx.settings.get('appEnabled') === true && !background) background = worker.start(ctx);
        else if (ctx.settings.get('appEnabled') !== true && background) { background.stop(); background = null; }
    }
    ctx.settings.onChange((key) => {
        if (key === 'engineProfile') ctx.settings.set('shiftRpm', 0);
        if (key === 'appEnabled') syncWorker();
        queue.request();
    });
    // MainApp starts a lightweight settings host; OFF stops live subscriptions and cluster output.
    syncWorker();
    async function render() {
        let state = background && background.status ? background.status() : null;
        if (state && (!isFinite(Date.parse(state.at)) || Date.now() - Date.parse(state.at) > 5000)) state = null;
        const reason = !ctx.settings.get('appEnabled') ? 'disabled' : state && state.reason;
        let status=t(REASONS[reason] || 'Waiting for background app');
        if (reason !== 'disabled' && state && state.outputs) status=['cluster','hud'].map((name)=>{
            const out=state.outputs[name];
            let message=REASONS[out.reason] || 'Waiting for status';
            if(out.requested) message=name==='cluster' ? mapStatus(out) : out.targetState==='shown' ? 'HUD area acquired' : 'Waiting for HUD area';
            return t(name==='cluster'?'Cluster':'HUD')+': '+t(message);
        });
        const cv = page.draw(ctx.canvas(W, H), status, state);
        page.targets = cv.targets;
        await ctx.ui.image('MAIN_GFX', cv);
    }
    ctx.ui.onClick('BTN_BASIC', () => page.selectTab(0));
    ctx.ui.onClick('BTN_HUD',()=>page.selectTab(1));
    ctx.ui.onClick('BTN_CLUSTER',()=>page.selectTab(2));
    // NAV pressed again (on the navigation tab) opens Favorites, so the bar buttons reach it without a new button.
    ctx.ui.onClick('BTN_NAV',()=>page.selectTab(page.tab===3&&!page.open?4:3));
    ctx.ui.onClick('BTN_PREVIOUS', () => page.move(-1));
    ctx.ui.onClick('BTN_NEXT', () => page.move(1));
    ctx.ui.onClick('BTN_VALUE_DOWN',()=>page.back());
    ctx.ui.onClick('BTN_VALUE_UP',()=>page.open?page.choose(page.choice):page.activate());
    // Native RHMI bar buttons remain usable without a GPU/touch renderer.
    ctx.onTap((x, y) => {
        const target = (page.targets || []).find((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
        if (target) target.act();
    });
    ctx.onTab((i) => page.selectTab(i));
    ctx.onLayout(() => queue.request());
    // GPU hosts can tick at their own refresh rate despite the requested 2 fps.
    // Only the periodic status refresh is throttled; menu actions still redraw immediately.
    let periodicAt = -Infinity;
    ctx.loop('MAIN', 2, () => {
        const now = Date.now();
        if (now < periodicAt || now - periodicAt >= 500) { periodicAt = now; queue.request(); }
    });
    // Static native button labels are set once, not on every position update.
    await Promise.all([ctx.ui.text('BTN_VALUE_DOWN','Back'),ctx.ui.text('BTN_VALUE_UP','Select')]);
    await queue.flush();
} });
