'use strict';
// Spotify Korean edition (spotify_ko, jaimeen77-cmyk/apps): replaces the kit's i18n.js in the Store template
// (tools/prepare-spotify.py). The kit's own version also swaps English words found inside a longer line, which
// would change song, artist and playlist names ("Play That Funky Music"). Here a line is translated only
// when it is, as a whole, a string of locale.json "strings" or matches one of its "rules"; a line built from
// pieces joined with '  ·  ' is translated piece by piece. Names from Spotify stay as they are.
// Node 8 (the head unit). Never used on signal names, ids or stored settings.
const locale = require('./locale.json');
const dict = locale.strings || {};
const language = locale.language || 'en';
const SEP = '  ·  ';
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const folded = Object.create(null);
Object.keys(dict).forEach((key) => { folded[key.toLowerCase()] = dict[key]; });
const localizedValues = new Set(Object.keys(dict).map((k) => dict[k]));
const rules = (locale.rules || []).map((r) => [new RegExp('^(?:' + r[0] + ')$'), r[1]]);
const cache = new Map();

function getLanguage() { return language; }

function piece(s, fold) {
    const key = s.trim();
    if (!key || !/[A-Za-z]/.test(key) || localizedValues.has(key)) return s;
    const lead = s.slice(0, s.indexOf(key)), tail = s.slice(s.indexOf(key) + key.length);
    if (has(dict, key)) return lead + dict[key] + tail;
    // any letter case only inside a rule ('No connection to Spotify - play did not go through')
    if (fold && folded[key.toLowerCase()] !== undefined) return lead + folded[key.toLowerCase()] + tail;
    for (let i = 0; i < rules.length; i++) {
        const m = rules[i][0].exec(key);
        if (m) return lead + rules[i][1].replace(/\{(t?)(\d)\}/g, (_, tr, n) => (tr ? piece(m[n] || '', true) : (m[n] || ''))) + tail;
    }
    return s;
}

function t(value) {
    const s = String(value == null ? '' : value);
    if (language === 'en' || !/[A-Za-z]/.test(s)) return s;
    if (cache.has(s)) return cache.get(s);
    const whole = piece(s);
    const out = whole !== s || s.indexOf(SEP) < 0 ? whole : s.split(SEP).map(piece).join(SEP);
    if (cache.size >= 2048) cache.clear();
    cache.set(s, out);
    return out;
}

module.exports = { t, dict, getLanguage };
