'use strict';
// The HUD greeting when a driver is recognised (settings per driver): the settings host (driver-profiles.js, in
// main.js) says hello; the worker, in the same process, shows it on the HUD for SHOW_MS as soon as the HUD can take
// it (the renderer may still be starting with the car), and drops it if that does not happen within WAIT_MS.
const SHOW_MS=3000,WAIT_MS=60000;
let pending=null,showing=null;
/** name: the driver's name, or null for a plain hello. */
function greet(name,now){pending={name:typeof name==='string'&&name?name:null,at:typeof now==='number'?now:Date.now()};showing=null;}
/** What to show now ({ name } or null); ready: the HUD overlay can be drawn. */
function read(ready,now){
 const t=typeof now==='number'?now:Date.now();
 if(pending&&t-pending.at>WAIT_MS)pending=null;
 if(pending&&ready){showing={name:pending.name,until:t+SHOW_MS};pending=null;}
 if(showing&&t>=showing.until)showing=null;
 return showing?{name:showing.name}:null;
}
function reset(){pending=null;showing=null;}
module.exports={greet,read,reset,SHOW_MS,WAIT_MS};
