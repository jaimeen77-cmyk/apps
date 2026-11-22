'use strict';
// The HUD headway badge (lead-vehicle.js): the time gap to the car ahead, big, in its colour step (under 1.0 s red,
// under 1.5 s amber, else cyan), with its distance and (in Detailed) how fast we close in on it (negative) or fall back.
// Below 12 km/h the distance takes the big place (a time gap means little at a crawl). Drawn as the user's reference
// (1.3.38): the car's front over two gap bars, the time gap in thin figures, the distance and the closing speed under. Its own overlay layer above
// whatever the HUD shows; nothing else gives way. Placed by display-config headwayRect (between the turn arrows, under
// the RPM face, by default; HUD tab → Lead-car headway → Position / size). Redrawn only when what it shows changes.
const W=112,H=60;
const COLORS={red:'#ff2b3a',amber:'#ff9a1f',ok:'#3ec8f5'},DIST='#a9c4e6',CLOSE='#f5a742',AWAY='#a9c4e6';
const fmtClosing=(k)=>{const r=Math.round(k);return (r>0?'+':r<0?'-':'')+Math.abs(r)+' km/h';};
/** What the badge shows: { big (with its unit), dist, closing, color } (mode: 'simple' or 'detail'). */
function content(v,mode) {
    const color=COLORS[v.level]||COLORS.ok,gap=Math.round(v.gap)+' m';
    const closing=mode==='detail'&&v.closing!==null&&Math.abs(v.closing)>=0.5?fmtClosing(v.closing):null;
    // below 12 km/h there is no time gap: the distance takes the big place
    return v.headway!==null?{big:v.headway.toFixed(1)+'s',dist:gap,closing,color}:{big:gap,dist:null,closing,color};
}
// As the reference: the car ahead seen from the front (the cabin drawn as its outline, the body filled) over two gap
// bars, the time gap beside it in thin figures; under them the distance and the closing speed.
function paint(cv,v,mode) {
    const c=content(v,mode),col=c.color;
    cv.polyline([[6,17],[9,7],[23,7],[26,17]],2.4,col);                 // the cabin, an outline
    cv.roundRect(3,16,26,10,2.5,col);                                  // the body
    cv.roundRect(5,19,5,3,1,[6,9,14,255]);cv.roundRect(22,19,5,3,1,[6,9,14,255]);   // its lamps
    cv.fillRect(5,26,4,3,col);cv.fillRect(23,26,4,3,col);              // the wheels
    cv.fillRect(6,31,20,2.4,col);cv.fillRect(4,36,24,2.4,col);         // the gap bars
    let size=30;while(size>18&&cv.textWidth(c.big,size,{font:'light',literal:true})>W-38)size--;
    cv.text(c.big,36,31,size,col,{font:'light',literal:true});
    let x=4;
    if(c.dist){cv.text(c.dist,x,55,15,DIST,{font:'bold',literal:true});x+=cv.textWidth(c.dist,15,{font:'bold',literal:true})+8;}
    if(c.closing)cv.text(c.closing,x,55,15,/^-/.test(c.closing)?CLOSE:AWAY,{font:'bold',literal:true});
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
        const c=content(v,mode),key=[mode,c.big,c.dist,c.closing,c.color].join('/');
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
