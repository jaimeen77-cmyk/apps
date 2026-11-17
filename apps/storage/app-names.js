'use strict';
const fs=require('fs');
const DEFAULT_MAP='/dev/shm/mgu-monitor-names/apps.json';
function readMap(file,owner) {
    try {
        const st=fs.lstatSync(file||DEFAULT_MAP);
        if(!st.isFile()||st.isSymbolicLink()||st.size>262144||(st.mode&0o022)||st.uid!==(owner===undefined?0:owner))return {};
        const data=JSON.parse(fs.readFileSync(file||DEFAULT_MAP,'utf8'));
        if(data.schema!==1||!Array.isArray(data.apps))return {};
        const map={};
        data.apps.forEach(a=>{if(Number.isInteger(a.uid)&&typeof a.name==='string'&&a.name.trim())map[a.uid]={name:a.name.slice(0,96),id:a.id,titles:a.titles||{}};});
        return map;
    }catch(e){return {};}
}
module.exports={readMap,DEFAULT_MAP};
