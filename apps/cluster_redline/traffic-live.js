'use strict';
// A fresh native event is evidence of liveness even when an older binding never sets availability.
// An observed connected->disconnected transition still invalidates cached events immediately.
function live(entry,now){
 if(!entry.configured||entry.error||entry.sub&&entry.sub.error)return false;
 const connected=!!(entry.sub&&entry.sub.available===true);
 if(entry.wasAvailable&&!connected){entry.lostReceived=entry.received;entry.wasAvailable=false;return false;}
 entry.wasAvailable=connected;
 const ttl=entry.field==='statusCarSpeed2'?2000:30000;
 return connected||entry.at!==null&&now>=entry.at&&now-entry.at<=ttl&&entry.received>(entry.lostReceived||0);
}
module.exports={live};
