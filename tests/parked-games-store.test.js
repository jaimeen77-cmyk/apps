'use strict';
// Parked Games (Korean edition): the car's builder makes a package from the committed Korean template and the
// current source: the games/ folder too (storeSourceDirs), iDrive 7 only as the original, the Korean catalog with
// the games' texts, the NOTICE; the listing requires the GPU renderer and the controller gate.
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path'),cp=require('child_process');
const ROOT=path.join(__dirname,'..'),{build}=require('../tools/store-build');
const out=fs.mkdtempSync(path.join(os.tmpdir(),'pg-store-')),x=fs.mkdtempSync(path.join(os.tmpdir(),'pg-x-'));
try{
 const spec=JSON.parse(fs.readFileSync(path.join(ROOT,'apps/parked_games/app.json'),'utf8'));
 const file=build({template:'parked_games',id:'parked_games',version:spec.version,dir:'apps/parked_games',language:'ko',out});
 cp.execFileSync('tar',['-xzf',file,'-C',x]);const pkg=path.join(x,'package'),js=path.join(pkg,'javascript');
 assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(pkg,'package.json'),'utf8')).mguHmi,['ID7'],'iDrive 7 only, as the original');
 ['app.js','registry.js','style.js','controls.js','vehicle.js','NOTICE'].forEach(f=>assert(fs.existsSync(path.join(js,f)),f));
 const games=fs.readdirSync(path.join(js,'games')).sort();
 assert.deepStrictEqual(games,['block-drop','brick-breaker','canyon-glide','chess','lane-runner','paddle-duel','rev-keeper','sketchpad']);
 games.forEach(g=>{assert(fs.existsSync(path.join(js,'games',g,'index.js')),g);assert(!fs.existsSync(path.join(js,'games',g,'test.js')),g+': no tests');
  assert.strictEqual(fs.readFileSync(path.join(js,'games',g,'index.js'),'utf8'),fs.readFileSync(path.join(ROOT,'apps/parked_games/games',g,'index.js'),'utf8'),g+': current source');});
 assert(!fs.existsSync(path.join(pkg,'node_modules')),'no SDK in the repository build');
 const locale=JSON.parse(fs.readFileSync(path.join(js,'kit/locale.json'),'utf8'));assert.strictEqual(locale.language,'ko');
 Object.keys(spec.translations.ko).forEach(k=>assert.strictEqual(locale.strings[k],spec.translations.ko[k],'translated: '+k));
 assert(fs.existsSync(path.join(js,'kit/fonts/korean.json')),'the Korean glyphs');
 // the car's GPU renderer keeps all apps' glyph atlases on two shared 4096 px shelves: the full Korean atlas (2976 px) is
 // refused once Latin atlases fill them (Korean text missing on the car); this one has only the catalog's glyphs
 const ko=JSON.parse(fs.readFileSync(path.join(js,'kit/fonts/korean.json'),'utf8'));
 ko.sizes.forEach(s=>assert(s.atlasH<=1100,'small Korean atlas: '+s.atlasH));assert.notStrictEqual(ko.cacheKey,'f9dc9f90bed5a3d5','its own cache key');
 const glyphs=ko.sizes[0].glyphs,used=new Set();Object.values(locale.strings).forEach(v=>{for(const c of v)used.add(c.codePointAt(0));});
 used.forEach(c=>{if(c>=0xac00&&c<=0xd7a3)assert(glyphs[c],'glyph for '+String.fromCodePoint(c));});
 assert.strictEqual(spec.translations.ko['Parked Games'],'8게임즈');
 // no game text drawn past the translation any more (literal: true only on numbers)
 const walk=d=>fs.readdirSync(d).reduce((a,n)=>{const p=path.join(d,n);return fs.statSync(p).isDirectory()?a.concat(walk(p)):a.concat(p);},[]);
 walk(path.join(ROOT,'apps/parked_games')).filter(f=>f.endsWith('.js')).forEach(f=>fs.readFileSync(f,'utf8').split('\n').forEach((l,i)=>{
  if(/literal: *true/.test(l))assert(/String\(|font: 'num'/.test(l),path.relative(ROOT,f)+':'+(i+1)+' draws words untranslated');}));
 const entry=JSON.parse(fs.readFileSync(path.join(ROOT,'mgu-repo.json'),'utf8')).components.find(c=>c.id==='parked_games');
 assert.deepStrictEqual(entry.mguHmi,['ID7']);assert(entry.requires['idrive7-renderd']&&entry.requires['mgu-inputgate'],'needs the renderer and the controller gate');
 console.log('PASS: Parked Games Korean edition: package from the template and current source (games/ too), iDrive 7 only, '+Object.keys(spec.translations.ko).length+' Korean texts, NOTICE, renderer and controller gate required');
}finally{fs.rmSync(out,{recursive:true,force:true});fs.rmSync(x,{recursive:true,force:true});}
