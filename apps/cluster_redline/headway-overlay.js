'use strict';
// The HUD headway badge (lead-vehicle.js): the time gap to the car ahead, big, in its colour step (under 1.0 s red,
// under 1.5 s amber, else cyan), with its distance and (in Detailed) how fast we close in on it (negative) or fall back.
// Below 12 km/h the distance takes the big place (a time gap means little at a crawl). Its own overlay layer above
// whatever the HUD shows; nothing else gives way. Placed by display-config headwayRect (between the turn arrows, under
// the RPM face, by default; HUD tab → Lead-car headway → Position / size). Redrawn only when what it shows changes.
const W=132,H=46;
const COLORS={red:'#ff2b3a',amber:'#ff9a1f',ok:'#37d3e0'},INK='#f4f7fb',DIM='#b8c5d4';
const fmtClosing=(k)=>{const r=Math.round(k);return (r>0?'+':r<0?'-':'')+Math.abs(r)+' km/h';};
/** What the badge shows: { big, unit, lines: [..], color } (mode: 'simple' or 'detail'). */
function content(v,mode) {
    const color=COLORS[v.level]||COLORS.ok,gap=Math.round(v.gap)+' m',lines=[];
    let big,unit;
    if(v.headway!==null){big=v.headway.toFixed(1);unit='s';lines.push(gap);}
    else{big=String(Math.round(v.gap));unit='m';}
    if(mode==='detail'&&v.closing!==null&&Math.abs(v.closing)>=0.5)lines.push(fmtClosing(v.closing));
    return {big,unit,lines,color};
}
function paint(cv,v,mode) {
    const c=content(v,mode);
    // the car ahead: a small car seen from behind, in the colour step
    cv.roundRect(4,13,14,11,3,c.color);cv.fillRect(4,24,4,5,c.color);cv.fillRect(14,24,4,5,c.color);cv.roundRect(6,15,10,4,1.5,[5,7,11,255]);
    const bx=24;cv.text(c.big,bx,36,30,c.color,{font:'num',literal:true});
    const bw=cv.textWidth(c.big,30,{font:'num',literal:true});cv.text(c.unit,bx+bw+2,36,16,c.color,{font:'bold',literal:true});
    const rx=bx+bw+2+cv.textWidth(c.unit,16,{font:'bold',literal:true})+8;
    if(c.lines.length===1)cv.text(c.lines[0],rx,30,15,INK,{font:'bold',literal:true});
    else c.lines.forEach((l,i)=>cv.text(l,rx,21+i*17,14,i?DIM:INK,{font:'bold',literal:true}));
    return cv;
}
function draw(v,mode,w,h){const {ScaledCanvas}=require('./kit/canvas');const cv=new ScaledCanvas(W,H,Math.min((w||W)/W,(h||H)/H));cv.clear([0,0,0,0]);paint(cv,v,mode);return cv.canvas;}
// the Position / size preview
const SAMPLE={gap:36,headway:1.8,closing:-6,level:'ok'};
class HeadwayOverlay {
    constructor(client){this.client=client;this.layer=null;}
    // value: lead-vehicle read() or null; mode: 'simple' / 'detail'; preview: the sample, whatever the car says
    tick(value,cfg,mode,preview) {
        const v=preview?SAMPLE:value;
        if(!v||(cfg.hudHeadwayHidden&&!preview)){this.hide();return false;}
        const r=require('./display-config').headwayRect(cfg);let l=this.layer;
        if(l&&(l.w!==r.w||l.h!==r.h)){this.client.drop(l.ref);l=this.layer=null;}
        if(!l){const ref=this.client.image({target:'hud',klass:'overlay',z:12,x:r.x,y:r.y,w:r.w,h:r.h,iw:r.w,ih:r.h,visible:false});if(!ref)return false;l=this.layer={ref,x:r.x,y:r.y,w:r.w,h:r.h,key:null,visible:false};}
        const c=content(v,mode),key=[mode,c.big,c.unit,c.lines.join('|'),c.color].join('/');
        if(l.key!==key){const im=draw(v,mode,r.w,r.h),px=Buffer.alloc(r.w*r.h*4);
            for(let y=0;y<Math.min(r.h,im.h);y++)Buffer.from(im.d.buffer,im.d.byteOffset+y*im.w*4,Math.min(r.w,im.w)*4).copy(px,y*r.w*4);
            this.client.pixels(l.ref,null,px);l.key=key;}
        if(l.x!==r.x||l.y!==r.y){this.client.set(l.ref,{x:r.x,y:r.y});l.x=r.x;l.y=r.y;}
        if(!l.visible){this.client.set(l.ref,{visible:true});l.visible=true;}
        return true;
    }
    hide(){const l=this.layer;if(l&&l.visible){this.client.set(l.ref,{visible:false});l.visible=false;}}
    close(){if(this.layer)this.client.drop(this.layer.ref);this.layer=null;}
}
module.exports={HeadwayOverlay,content,draw,paint,SAMPLE,COLORS,W,H};
