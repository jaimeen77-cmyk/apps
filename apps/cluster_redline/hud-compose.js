'use strict';
const {Canvas}=require('./kit/canvas');
const face=require('./hud-draw'),nav=require('./nav-draw'),text=require('./nav-text');
const lanes=require('./lane-draw'),RL=require('./redline-hud');
const D=require('./display-config');
const {placement}=require('./layout');
const W=800,H=480;
const {blitScaled,drawWithParts}=require('./component-canvas');
// Default HUD design, tuned on the car (1.2.27): the whole design two presses (10 each) lower and the gear
// two more down and two to the left, for both the top alert bar and the circle beside the gear. Added to what
// Position / size stores, so stored 0 is this default.
const OWN_SHIFT={all:[0,20],Gear:[-20,20]};
function ownTuned(cfg){
    const out=Object.assign({},cfg);
    D.PARTS.concat(['MarkLine']).forEach(n=>{const extra=OWN_SHIFT[n]||[0,0],k='hud'+n;out[k+'OffsetX']=(cfg[k+'OffsetX']||0)+OWN_SHIFT.all[0]+extra[0];out[k+'OffsetY']=(cfg[k+'OffsetY']||0)+OWN_SHIFT.all[1]+extra[1];});
    return out;
}
function draw(state) {
    const cache=state.renderCache,cv=cache?(cache.begin(W,H),cache.surface):new Canvas(W,H);if(!cache)cv.clear([0,0,0,0]);
    if(state.renderRpm!==false){
        const at=placement(state.config,'hud',face);
        if(RL.active(state.config)){
            // A Redline app layout replaces the RPM face; painted at HUD size (no resampling).
            // "Whole layout" (the RPM gauge part) places it; each element then has its own move, size and hide.
            if(!state.config.hudRpmGaugeHidden){const key=RL.keys(state,'hud');RL.scene(state,RL.rect(state.config,at,'hud'),'hud',at,key).forEach(({id,key:k,painter,r})=>{if(cache)cache.navigation('redline.'+id,k,painter,state,r);else blitScaled(cv,painter.draw(state),r);});}
        }else{
            // The tuned copy keeps the render cache: the controller adds it as a hidden (non-enumerable)
            // property, which Object.assign does not copy. Without it the default design was painted straight
            // onto the cache's surface and never cleared, so its alert bar / circle stayed behind (1.2.27-1.2.37).
            const own=Object.assign({},state,{config:ownTuned(state.config)});
            if(cache)Object.defineProperty(own,'renderCache',{value:cache,enumerable:false});
            drawWithParts(face,own,cv,at,'hud');
        }
    }
    if(D.navAllowed(state.config,state.mode)&&state.navigation&&state.navigation.visible){
        const hasTurn=state.navigation.maneuverVisible!==false;
        // Painters with drawSized() paint at the final HUD size (1:1 copy, no resampling).
        const paintNav=(id,base,value)=>{const r=D.navRect(state.config,id),painter=base.drawSized?{W:r.w,H:r.h,draw:v=>base.drawSized(v,r.w,r.h)}:base;if(cache){const key=require('./render-state').navKey(state,id);if(key)cache.navigation(id,key,painter,value,r);}else blitScaled(cv,painter.draw(value),r);};
        if(hasTurn&&!state.config.hudNavHidden)paintNav('Direction',nav,Object.assign({},state.navigation,{color:state.config.navColor}));
        if(!state.config.hudLanesHidden&&state.navigation.lanes&&state.navigation.lanes.visible){
            paintNav('Lanes',lanes,Object.assign({},state.navigation.lanes,{color:state.config.navColor}));
        }
        if(hasTurn&&!state.config.hudTextHidden)paintNav('Text',text,state.navigation);
    }
    if(state.renderRpm!==false&&state.traffic&&state.traffic.visible){
        const p=require('./traffic-draw'),r={x:20,y:310,w:p.W,h:p.H};
        if(cache)cache.navigation('traffic',JSON.stringify([state.traffic.limit,state.traffic.children,state.traffic.over]),p,state,r);
        else blitScaled(cv,p.draw(state),r);
    }
    return cache?cache.finish():cv;
}
function difference(previous,next) { return require('./component-canvas').dirtyRects(previous,next,W,H); }
module.exports={draw,difference,W,H,fullTarget:true,key:state=>require('./render-state').key(state,'hud'),createCache:()=>new (require('./retained-scene').RetainedScene)()};
