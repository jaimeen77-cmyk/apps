'use strict';
// GIF 플레이어 0.4.7: decode(..., {firstOnly: true}) reads only the first picture (a whole GIF is up to 32 MB); the
// first picture is the same as a full decode's. (0.4.8: the car's playlist picker that used it is gone with the
// Widget settings page; the decoder option stays.)
const assert=require('assert'),fs=require('fs'),path=require('path'),G=require('../apps/gif_home/gif');
const b=fs.readFileSync(path.join(__dirname,'cluster_redline/fixtures/pattern-64x36.gif'));
const all=G.decode(b),first=G.decode(b,{firstOnly:true});
assert.strictEqual(all.frames.length,4);assert.strictEqual(first.frames.length,1);
assert.deepStrictEqual(Buffer.from(first.frames[0].data),Buffer.from(all.frames[0].data));
console.log('PASS: GIF player decoder: the first picture only');
