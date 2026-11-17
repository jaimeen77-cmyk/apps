'use strict';
// Export app identity metadata only. Never read app data/settings or change OAP permissions.
const fs=require('fs'),path=require('path');
const DEFAULT_ROOT='/var/opt/public/oap',DEFAULT_OUT='/dev/shm/mgu-monitor-names/apps.json';
function json(home,relative) {
    try {
        const base=fs.realpathSync(home),file=fs.realpathSync(path.join(home,relative));
        if(file.indexOf(base+path.sep)!==0)return null;
        const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
        try {const st=fs.fstatSync(fd);if(!st.isFile()||st.size>262144)return null;const data=Buffer.alloc(st.size);fs.readSync(fd,data,0,data.length,0);return JSON.parse(data.toString('utf8'));}
        finally {fs.closeSync(fd);}
    } catch(e) {return null;}
}
const text=(s)=>typeof s==='string'&&s.trim()?s.replace(/[\r\n\0]/g,' ').trim().slice(0,96):null;
function collect(root,now) {
    const manager=path.join(root,'oap_12201'),ids={};
    try {fs.readFileSync(path.join(manager,'security/uids.txt'),'utf8').split('\n').forEach(line=>{const m=/^\s*(\d+)\s*=\s*([A-Za-z0-9_.-]+)\s*$/.exec(line);if(m)ids[Number(m[1])]=m[2];});}catch(e){}
    try {fs.readdirSync(path.join(manager,'data/apps')).filter(n=>/^[A-Za-z0-9_.-]+\.json$/.test(n)).forEach(n=>{const data=json(manager,'data/apps/'+n);if(data&&Number.isInteger(data.userId))ids[data.userId]=n.slice(0,-5);});}catch(e){}
    const apps=[];
    fs.readdirSync(root).filter(n=>/^oap_\d+$/.test(n)).forEach(folder=>{
        const uid=Number(folder.slice(4)),home=path.join(root,folder);
        try {const stat=fs.lstatSync(home);if(!stat.isDirectory()||stat.isSymbolicLink())return;}catch(e){return;}
        const pkg=json(home,'source/package.json')||json(home,'package.json')||{};
        const spec=json(home,'source/javascript/kit/app-spec.json')||json(home,'source/app.json')||{};
        const app=(json(home,'rhmiData/application.json')||{}).application||{};
        const sid=app.entryPoints&&app.entryPoints[0]&&app.entryPoints[0].textId;
        const titles={};
        ['ko_KR','en_GB'].forEach(lang=>{const bundle=json(home,'rhmiData/strings/'+lang+'.json')||json(home,'rhmiData/variantGroups/Common/texts/'+lang+'.json');if(sid&&bundle&&text(bundle[sid]))titles[lang]=text(bundle[sid]);});
        const id=text(pkg.name)||text(ids[uid]);
        const name=text(pkg.displayName)||text(spec.title)||titles.en_GB||id||(uid===12201?'App platform (MainApp)':null);
        if(name)apps.push({uid,id:id||null,name,titles});
    });
    return {schema:1,generatedAt:now,apps:apps.sort((a,b)=>a.uid-b.uid)};
}
function publish(root,out,now) {
    const data=collect(root,now),dir=path.dirname(out);
    try {fs.mkdirSync(dir,0o755);}catch(e){if(e.code!=='EEXIST')throw e;}
    const st=fs.lstatSync(dir);
    if(!st.isDirectory()||st.isSymbolicLink()||st.uid!==process.getuid()||(st.mode&0o022))throw Error('Name-map directory is not private to its owner');
    fs.chmodSync(dir,0o755);
    const tmp=out+'.'+process.pid+'.tmp';
    fs.writeFileSync(tmp,JSON.stringify(data)+'\n',{flag:'wx',mode:0o644});
    try {fs.chmodSync(tmp,0o644);fs.renameSync(tmp,out);}catch(e){try{fs.unlinkSync(tmp);}catch(ignore){}throw e;}
    return data;
}
if(require.main===module) {
    if(process.getuid()!==0)throw Error('This metadata exporter runs through mgu-deploy as root');
    if(process.argv[2]==='--check') {
        const s=fs.lstatSync(DEFAULT_OUT),data=JSON.parse(fs.readFileSync(DEFAULT_OUT,'utf8'));
        if(!s.isFile()||s.isSymbolicLink()||s.uid!==0||data.schema!==1||!Array.isArray(data.apps)||!data.apps.length)throw Error('App name map unavailable');
    } else publish(DEFAULT_ROOT,DEFAULT_OUT,Date.now());
}
module.exports={collect,publish};
