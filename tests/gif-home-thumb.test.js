'use strict';
// GIF 플레이어 0.4.7: the picker's preview decodes only the first picture (a whole GIF is up to 32 MB, kept beside
// the one playing); the first picture is the same as a full decode's.
const assert=require('assert'),fs=require('fs'),path=require('path'),G=require('../apps/gif_home/gif');
const b=fs.readFileSync(path.join(__dirname,'cluster_redline/fixtures/pattern-64x36.gif'));
const all=G.decode(b),first=G.decode(b,{firstOnly:true});
assert.strictEqual(all.frames.length,4);assert.strictEqual(first.frames.length,1);
assert.deepStrictEqual(Buffer.from(first.frames[0].data),Buffer.from(all.frames[0].data));
assert(/firstOnly: true/.test(fs.readFileSync(path.join(__dirname,'../apps/gif_home/main.js'),'utf8')),'the preview asks for the first picture only');
console.log('PASS: GIF player preview decodes the first picture only');
