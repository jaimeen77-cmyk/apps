'use strict';
// 1.3.75: an icon's text in a turn's description (an exit / IC or road number sent as an icon) is shown; the route list
// asks for the main road's and passive junctions' events (up to 10) and leaves the passive ones out; an unknown kind
// first still makes the list unreadable (never skipped over).
const assert=require('assert');
const N=require('../../apps/cluster_redline/native-navigation'),R=require('../../apps/cluster_redline/route-events'),C=require('../../apps/cluster_redline/route-events-config');
const desc={elements:[{icon:{text:'14B'}},{spacer:'SPACE'},{text:'판교IC'}]};
const d=N.decodeDart({maneuver:{branch:{branchType:'HIGHWAY_OUT_RIGHT',formattedDistance:{distance:'400',unit:'METER'},description:desc,distanceToDestination:9000}}});
assert(d&&/14B/.test(d.description)&&/판교IC/.test(d.description),'the icon text kept: '+(d&&d.description));
const q=C.queryParams().viewConfigs[0].viewport;assert.strictEqual(q.maxElementCount,10);assert.deepStrictEqual(q.includedTypes,['INCLUDE_ACTIVE_MANEUVERS','INCLUDE_ALONG_MAIN_ROAD','INCLUDE_DESTINATIONS','INCLUDE_PASSIVE_MANEUVER_JCT']);
const turn=(dist,dtd,dir)=>({intersection:{direction:dir||'RIGHT',formattedDistance:{distance:String(dist),unit:'METER'},distanceToDestination:dtd,uid:1}});
const passive={passiveManeuver:{formattedDistance:{distance:'100',unit:'METER'},distanceToDestination:9900}};
let r=R.decodeReply({GuidanceEventListError:'NO_ERROR',viewContent:[{eventsInView:[passive,turn(300,9700),turn(400,9600,'LEFT')]}]});
assert.strictEqual(r.state,'maneuver_ready','a passive junction first: left out');assert(r.value&&r.value.maneuver==='RIGHT');assert(r.then&&r.then.maneuver==='LEFT'&&r.then.gap===100,'and the turn after it');
r=R.decodeReply({GuidanceEventListError:'NO_ERROR',viewContent:[{eventsInView:[{somethingNew:{x:1}},turn(300,9700)]}]});assert.strictEqual(r.state,'first_event_unreadable','an unknown kind first is never skipped');
const ten=[];for(let i=0;i<10;i++)ten.push(turn(100+i*100,9000-i*100));assert.strictEqual(R.decodeReply({GuidanceEventListError:'NO_ERROR',viewContent:[{eventsInView:ten}]}).state,'maneuver_ready','ten events: fine');
console.log('PASS: navigation: icon texts in descriptions, the route list with main-road / passive junction events (passive ones left out, unknown first never skipped)');
