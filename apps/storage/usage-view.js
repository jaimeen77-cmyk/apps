'use strict';
const G = require('./kit/gauges');
const { t } = require('./kit/i18n');
const { WINDOW, INTERVAL, memoryPercent } = require('./usage');
const tr = (s, values) => Object.keys(values || {}).reduce((out,k) => out.split('{'+k+'}').join(String(values[k])),t(s));
const pct = (v) => G.isNum(v) ? v.toFixed(1)+'%' : '--';
const MB = 1048576;
class UsageView {
    constructor(onSelect) { this.selected = null; this.onSelect = onSelect; }
    next(usage) {
        const last=usage.history[usage.history.length-1], ids=[null].concat((last ? last.apps : []).map(a=>a.uid));
        this.selected=ids[(ids.indexOf(this.selected)+1)%ids.length];
    }
    draw(cv, theme, usage, top, bottom, fit) {
        const last=usage.history[usage.history.length-1], now=last ? last.time : Date.now();
        const apps=last ? last.apps.slice().sort((a,b)=>(b.cpu || 0)-(a.cpu || 0)) : [];
        const selected=apps.find(a=>a.uid===this.selected);
        if (!selected) this.selected=null;
        const height=bottom-top-64, left=24, width=610;
        G.panel(cv,theme,left,top,width,height,'App CPU / RAM');
        cv.text(tr('CPU %'),354,top+70,15,theme.dim,{align:'right'});
        cv.text('RAM MB',490,top+70,15,theme.dim,{align:'right'});
        cv.text(tr('5m MB'),616,top+70,15,theme.dim,{align:'right'});
        const rows=[{uid:null,name:tr('Whole head unit'),cpu:last&&last.cpu,rss:last&&last.memory?last.memory.used:null,trend:last?last.trend:{}}].concat(apps);
        const count=Math.max(1,Math.floor((height-104)/44));
        const index=rows.findIndex(a=>a.uid===this.selected), start=Math.max(0,Math.min(rows.length-count,index-Math.floor(count/2)));
        rows.slice(start,start+count).forEach((app,i)=>{
            const y=top+82+i*44, chosen=app.uid===this.selected, trend=app.trend||{};
            if(chosen)cv.roundRect(36,y,586,42,5,theme.track);
            const color=trend.leakSuspected||trend.memoryRising||trend.cpuRising?theme.warn:theme.text;
            cv.text(fit(cv,t(app.name),20,244,'label'),46,y+23,20,color);
            const tags=[];
            if(app.uid!==null)tags.push('UID '+app.uid);
            if(trend.cpuRising)tags.push(tr('CPU rising'));
            if(trend.leakSuspected)tags.push(tr('Memory leak suspected'));
            else if(trend.memoryRising)tags.push(tr('Memory rising'));
            cv.text(fit(cv,tags.join(' · '),12,270,'label'),46,y+39,12,color);
            cv.text(pct(app.cpu)+(app.partial?'*':''),354,y+25,18,color,{align:'right'});
            cv.text(G.isNum(app.rss)?(app.rss/MB).toFixed(1):'--',490,y+25,18,color,{align:'right'});
            const delta=app.uid===null ? null : trend.memoryDelta;
            cv.text(G.isNum(delta)?(delta>0?'+':'')+delta.toFixed(1):'--',616,y+25,17,color,{align:'right'});
            if(cv.target)cv.target(36,y,586,42,()=>{this.selected=app.uid;this.onSelect();},'usage-app-'+app.uid);
        });
        if(!apps.length)cv.text(tr('No readable app processes'),46,top+height-16,16,theme.dim);
        else cv.text(tr('CPU order - select a row or Next app'),46,top+height-16,15,theme.dim);
        const title=selected?t(selected.name):tr('Whole head unit'), trend=selected?selected.trend:(last?last.trend:{});
        const appOf=(sample)=>selected?(sample.apps||[]).find(a=>a.uid===selected.uid&&a.name===selected.name):null;
        const cpuOf=(sample)=>selected?(appOf(sample)?appOf(sample).cpu:null):sample.cpu;
        const memOf=(sample)=>selected?(appOf(sample)&&G.isNum(appOf(sample).rss)?appOf(sample).rss/MB:null):memoryPercent(sample);
        const memoryMax=selected?Math.max(64,Math.ceil(Math.max.apply(null,usage.history.map(s=>memOf(s)||0))/64)*64):100;
        const chartHeight=(height-16)/2;
        const chart=(y,label,color,value,max,delta,unit,rising)=>{
            const x=660,w=916;
            G.panel(cv,theme,x,y,w,chartHeight,label);
            const current=last?value(last):null;
            cv.text(G.isNum(current)?current.toFixed(1)+unit:'--',x+w-24,y+43,32,color,{align:'right',font:'num'});
            const change=G.isNum(delta)?tr('5m: {delta}',{delta:(delta>0?'+':'')+delta.toFixed(1)+(unit==='%'?' '+tr('pp'):' MB')}):tr('Collecting 5-minute trend');
            cv.text(fit(cv,title+' · '+change+(rising?' · '+tr('Rising'):''),17,w-48,'label'),x+24,y+68,17,rising?theme.warn:theme.dim);
            const px=x+54,py=y+86,pw=w-80,ph=Math.max(24,chartHeight-117);
            [0,max/2,max].forEach(v=>{const yy=py+ph*(1-v/max);cv.line(px,yy,px+pw,yy,1,theme.track);cv.text(v.toFixed(0),px-10,yy+4,13,theme.dim,{align:'right'});});
            [0,0.5,1].forEach(f=>cv.text(f===1?tr('Now'):tr('{minutes}m ago',{minutes:(1-f)*30}),px+pw*f,py+ph+20,13,theme.dim,{align:f===0?'left':f===1?'right':'center'}));
            let previous=null;
            usage.history.forEach(sample=>{
                const v=value(sample);if(!G.isNum(v)){previous=null;return;}
                const p={x:px+pw*(1-(now-sample.time)/WINDOW),y:py+ph*(1-Math.max(0,Math.min(max,v))/max),time:sample.time};
                if(previous&&p.time-previous.time<=INTERVAL*1.5)cv.line(previous.x,previous.y,p.x,p.y,2,color);
                else cv.fillRect(p.x-1,p.y-1,3,3,color);
                previous=p;
            });
        };
        chart(top,'CPU usage',theme.accent,cpuOf,100,trend.cpuDelta,'%',trend.cpuRising);
        chart(top+chartHeight+16,selected?'App memory (RSS)':'Memory usage (RAM)',theme.cold||theme.accent2,memOf,memoryMax,trend.memoryDelta,selected?' MB':'%',trend.memoryRising);
        const coverage=last?last.coverage:{};
        const limited=coverage.error||coverage.denied||coverage.skipped;
        cv.text(tr('30s - last 30m')+' · '+(limited?tr('Partial access: {count} unreadable',{count:coverage.denied||coverage.skipped||'?' }):tr('Readable processes; RSS can share pages')),48,bottom-32,16,limited?theme.warn:theme.dim);
        const status=usage.demo?tr('Demo data is not logged'):!usage.logging?tr('Usage logging off'):usage.logger.error?tr('Log error: {error}',{error:usage.logger.error}):tr('Compressed log: 30s / 30 days');
        cv.text(fit(cv,status,17,650,'label'),1552,bottom-32,17,usage.logger.error&&!usage.demo?theme.warn:theme.dim,{align:'right'});
        const note=trend.leakSuspected?tr('Memory keeps growing - possible leak; investigation needed'):tr('A usage increase alone does not prove a memory leak');
        cv.text(!last||(selected?selected.cpu:last.cpu)===null?tr('CPU: waiting for two valid samples'):note,48,bottom-8,16,trend.leakSuspected?theme.warn:theme.dim);
    }
}
module.exports={UsageView};
