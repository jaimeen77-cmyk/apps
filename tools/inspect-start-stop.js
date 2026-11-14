'use strict';
// Node 8 compatible. Inspect definitions only: no native binding, bus traffic or vehicle writes.
const fs = require('fs');
const PATTERN = /start[ _.-]*stop|stop[ _.-]*start|auto(?:matic)?[ _.-]*(?:engine|motor)[ _.-]*(?:start|stop)|idle[ _.-]*stop|motor[ _.-]*start[ _.-]*automatik|\bMSA\b|(?:status|setting|request|set|get)MSA(?:[A-Z_]|\b|$)/i;
function scan(catalog) {
    if (!catalog || !catalog.interfaces || typeof catalog.interfaces !== 'object' || Array.isArray(catalog.interfaces))
        throw new Error('Expected the vehicle SOME/IP master catalog with an interfaces object, not an app/store catalog.');
    const matches = []; let matched = 0;
    Object.keys(catalog.interfaces).sort().forEach(iface => {
        const def = catalog.interfaces[iface] || {};
        ['fields', 'methods', 'events', 'broadcasts'].forEach(kind => {
            const entries = def[kind] || {};
            Object.keys(entries).sort().forEach(name => {
                const entry = entries[name] || {};
                const description = typeof entry.description === 'string' ? entry.description : '';
                if (!PATTERN.test(iface + '.' + name + ' ' + description)) return;
                matched++;
                if (matches.length >= 100) return;
                const json = JSON.stringify(entry);
                matches.push({ interface: iface, serviceId: def.serviceId, version: def.version,
                    instances: (catalog.instanceIDs || {})[iface] || null, kind, name,
                    access: kind === 'fields' ? { getter: !!entry.getter, setter: !!entry.setter, notifier: !!entry.notifier } : null,
                    interpretation: kind === 'fields' && entry.setter || kind === 'methods'
                        ? 'UNVERIFIED control candidate; name alone does not establish semantics or permission'
                        : 'Definition only; no control capability established',
                    definition: json.length <= 65536 ? entry : { truncated: true, preview: json.slice(0, 65536) } });
            });
        });
    });
    return { format: 1, readOnly: true, interfacesExamined: Object.keys(catalog.interfaces).length,
        matched, truncated: matched > matches.length,
        verdict: 'No live requests sent. Matches are candidates, not verified commands. No matches does not rule out diagnostics or other interfaces.', matches };
}
if (require.main === module) {
    try {
        const file = process.argv[2] || '/etc/oap/someip/someip-interfaces.json';
        console.log(JSON.stringify(scan(JSON.parse(fs.readFileSync(file, 'utf8'))), null, 2));
    } catch (e) { console.error('START_STOP_INSPECTION_FAILED: ' + e.message); process.exitCode = 1; }
}
module.exports = { scan };
