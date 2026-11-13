'use strict';
const { Canvas } = require('./kit/canvas');
const { drawMark } = require('./m-mark');
const rpmColors = require('./rpm-colors');
const {part}=require('./component-canvas');
const {drawAux}=require('./aux-draw');
const {alertState}=require('./hud-draw');
const fonts=require('./kit/fonts'),RL=require('./redline-hud');
const W = 1088, H = 480;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const C = { track: '#1b212b', text: '#f4f7fb', red: '#ff2a2a' };
const L = { left: 220, right: 868, slant: 14, top: 112, bottom: 153,
    upperFrame: 31, alertTop: 59, alertBottom: 77, miniHeight: 26 };
function frame(cv, cfg, y, lower) {
    const key=lower?'MarkBottom':'MarkTop';
    part(cv,cfg,'cluster',key+'Line',{x:92,y:y-18,w:904,h:40},c=>{
        const side=lower?-12:12;
        if(!cfg['cluster'+key+'LineHidden']){c.polyline([[98,y+side],[124,y],[499,y]],1.5,'#8993a0');c.polyline([[589,y],[964,y],[990,y+side]],1.5,'#8993a0');}
    });
    part(cv,cfg,'cluster',key,{x:W/2-44,y:y-14,w:88,h:28},c=>{if(!cfg['cluster'+key+'Hidden'])drawMark(c,W/2,y-14);});
}
// Depth for the cluster RPM bar: whole-length translucent overlays on the flat bands,
// so the colour slices keep no seams (lit/gloss top and shaded bottom on the fill,
// inner shadow on the track). The HUD keeps its flat bar (dark overlays dim a HUD).
function shade(c,x0,x1,top,bottom,slant,t0,t1,col){if(x1<=x0)return;const h=bottom-top,a=slant*(1-t0),b=slant*(1-t1);c.quad([[x0+a,top+h*t0],[x1+a,top+h*t0],[x1+b,top+h*t1],[x0+b,top+h*t1]],col);}
function lit(c,x0,x1,top,bottom,slant){shade(c,x0,x1,top,bottom,slant,0,0.45,'#ffffff3a');shade(c,x0,x1,top,bottom,slant,0.06,0.2,'#ffffff3c');shade(c,x0,x1,top,bottom,slant,0.68,1,'#00000066');}
function recess(c,x0,x1,top,bottom,slant){shade(c,x0,x1,top,bottom,slant,0,0.32,'#00000070');shade(c,x0,x1,top,bottom,slant,0.85,1,'#ffffff14');}
// A Redline app layout chosen for the cluster replaces the cluster face: each element painted at its
// final size, placed by Whole layout (the RPM gauge part) and its own move, size and hide.
function drawRedline(state,target){
    const cfg=state.config,layout=RL.rect(cfg,{x:0,y:0,w:W,h:H},'cluster');
    if(target){if(!cfg.clusterRpmGaugeHidden)RL.paint(target,state,layout.w/RL.IW,layout.x,layout.y,0,'cluster');return target;}
    const cache=state.renderCache,cv=cache?(cache.begin(W,H),cache.surface):new Canvas(W,H);if(!cache)cv.clear([0,0,0,0]);
    if(!cfg.clusterRpmGaugeHidden){const key=RL.keys(state,'cluster');RL.scene(state,layout,'cluster',{x:0,y:0,w:W,h:H},key).forEach(({id,key:k,painter,r})=>{if(cache)cache.navigation('redline.'+id,k,painter,state,r);else{const {blitScaled}=require('./component-canvas');blitScaled(cv,painter.draw(state),r);}});}
    return cache?cache.finish():cv;
}
function draw(state,target) {
    if(RL.active(state.config,'cluster'))return drawRedline(state,target);
    if(!target&&state.renderCache){state.renderCache.begin(W,H);state.renderCache.face(module.exports,state,{x:0,y:0,w:W,h:H},'cluster');return state.renderCache.finish();}
    const cv=target||new Canvas(W,H),cfg=state.config,rpm=state.rpm;
    if(!target)cv.clear([0,0,0,0]);
    frame(cv,cfg,L.upperFrame,false);frame(cv,cfg,450,true);
    const span=L.right-L.left-L.slant;
    const gaugeBounds={x:204,y:L.top-5,w:680,h:90},band=(c,a,b,color)=>{if(b<=a)return;const xa=L.left+span*a/cfg.maxRpm,xb=L.left+span*b/cfg.maxRpm;c.quad([[xa+L.slant,L.top],[xb+L.slant,L.top],[xb,L.bottom],[xa,L.bottom]],color);};
    part(cv,cfg,'cluster','RpmGauge',gaugeBounds,c=>{band(c,0,cfg.maxRpm,C.track);band(c,cfg.redlineRpm,cfg.maxRpm,'#4c1621');recess(c,L.left,L.left+span,L.top,L.bottom,L.slant);},'track');
    part(cv,cfg,'cluster','RpmGauge',gaugeBounds,c=>{
        const polygon=(a,b,color)=>{if(b<=a)return;const xa=L.left+span*a/cfg.maxRpm,xb=L.left+span*b/cfg.maxRpm;c.quad([[xa+L.slant,L.top],[xb+L.slant,L.top],[xb,L.bottom],[xa,L.bottom]],color);};
        const top=clamp(rpm,0,cfg.maxRpm);
        for(let r=0;r<top;r+=50)polygon(r,Math.min(r+75,top),rpmColors.colorAt(r,cfg));
        if(top>0)lit(c,L.left,L.left+span*top/cfg.maxRpm,L.top,L.bottom,L.slant);
    },'fill');
    part(cv,cfg,'cluster','RpmGauge',gaugeBounds,c=>{
        for(let r=500;r<cfg.maxRpm;r+=500){const x=L.left+span*r/cfg.maxRpm;c.line(x+L.slant,L.top,x,L.bottom,0.7,'#05060a');}
        for(let r=0;r<=cfg.maxRpm;r+=500){const x=L.left+span*r/cfg.maxRpm,major=r%1000===0,color=r>=cfg.redlineRpm?C.red:'#b8c2d1';c.line(x,L.bottom+5,x,L.bottom+(major?13:9),1,color);if(major)c.text(String(r/1000),x,187,22,color,{align:'center',font:'num'});}
    },'ticks');
    part(cv,cfg,'cluster','RpmGauge',gaugeBounds,c=>{const top=clamp(rpm,0,cfg.maxRpm);if(top>0){const x=L.left+span*top/cfg.maxRpm;c.line(x+L.slant,L.top-2,x,L.bottom+2,3,C.text);}},'cursor');
    const gear=typeof state.gear==='string'&&/^(?:[DSM]?(?:[1-9]|10)|P|R|N|D|--)$/.test(state.gear)?state.gear:'--';
    const gearWidth=cv.textWidth(gear,74,{font:'bold',literal:true}),font=fonts.get('bold',74,gear),glyphs=font?Array.from(gear,c=>font.glyphs[c.codePointAt(0)]).filter(Boolean):[];
    const scale=font?74/font.size:1,top=glyphs.length?Math.min.apply(null,glyphs.map(g=>g[5]))*scale:-54,bottom=glyphs.length?Math.max.apply(null,glyphs.map(g=>g[5]+g[3]))*scale:0,diameter=(gear==='--'&&font&&font.glyphs[68]?font.glyphs[68][3]*scale:bottom-top)*0.7;
    const circleX=W/2-gearWidth/2-12-diameter/2,circleY=400+(top+bottom)/2,alert=alertState(state);
    part(cv,cfg,'cluster','Alert',cfg.clusterAlertStyle==='circle'?{x:circleX-diameter/2-3,y:circleY-diameter/2-3,w:diameter+6,h:diameter+6}:{x:L.left-2,y:L.alertTop-2,w:span+L.slant+4,h:24},c=>{
        if(cfg.clusterAlertStyle==='circle'){
            if(alert.visible&&(alert.stage!=='red'||state.flash))c.arc(circleX,circleY,0,diameter/2,0,360,alert.color);
        }else for(let i=0;i<12;i++){
            const a=L.left+span*i/12,b=L.left+span*(i+1)/12-0.5,color=alert.stage==='red'&&!state.flash?'#711318':alert.color;
            c.quad([[a+L.slant,L.alertTop],[b+L.slant,L.alertTop],[b,L.alertBottom],[a,L.alertBottom]],i<alert.lit?color:'#000000');
        }
    });
    part(cv,cfg,'cluster','RpmValue',{x:380,y:190,w:330,h:94},c=>{
        const num=String(Math.round(rpm/10)*10),size=78,nw=c.textWidth(num,size,{font:'num'}),sw=c.textWidth('RPM',22,{font:'bold',literal:true}),nx=(W-nw-10-sw)/2,tint=state.shift?C.red:C.text;
        c.text(num,nx,270,size,tint,{font:'num'});c.text('RPM',nx+nw+10,270,22,tint,{font:'bold',literal:true});
    });
    part(cv,cfg,'cluster','Gear',{x:W/2-gearWidth/2-4,y:320,w:gearWidth+8,h:96},c=>c.text(gear,W/2,400,74,C.text,{align:'center',font:'bold'}));
    drawAux(cv,state,'cluster');
    return cv;
}
// Four independent horizontal regions keep updates below the link budget.
function difference(previous, next) { return require('./component-canvas').dirtyRects(previous, next, W, H); }
module.exports = { draw, difference, W, H, layout: L, key:state=>require('./render-state').key(state,'cluster'),createCache:()=>new (require('./retained-scene').RetainedScene)() };
