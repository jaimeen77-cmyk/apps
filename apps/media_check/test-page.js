'use strict';
// No external requests. The user starts each sound/video check explicitly.
module.exports=String.raw`<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; media-src 'self' file:">
<title>MGU browser compatibility check</title><style>
body{background:#10151e;color:#fff;font:24px sans-serif;margin:24px}button{font:inherit;padding:18px;margin:8px;background:#264c72;color:#fff;border:1px solid #7bd8ff;border-radius:8px}video{width:48%;max-height:260px;display:block}pre{white-space:pre-wrap;font-size:18px;color:#b7d9ec}#bars{display:flex;height:50px}#bars i{flex:1}
</style><h1>MGU Browser Check / 브라우저 점검</h1>
<div id="bars"><i style="background:white"></i><i style="background:yellow"></i><i style="background:cyan"></i><i style="background:lime"></i><i style="background:magenta"></i><i style="background:red"></i><i style="background:blue"></i></div>
<p>USB playback and browser playback use different software paths.<br>USB 재생과 브라우저 재생은 다른 경로입니다.</p>
<button id="tap">Touch / 터치: 0</button><button id="tone">Quiet tone / 작은 시험음</button>
<button id="play">Local video / 로컬 영상</button><button id="stop">Stop / 중지</button>
<video id="video" controls playsinline preload="metadata" src="media-check-sample.mp4"></video>
<pre id="info"></pre><pre id="result">No test passed automatically. / 자동 성공 판정 없음</pre>
<script>(function(){
var taps=0,audio=null,video=document.getElementById('video'),result=document.getElementById('result');
function say(s){result.textContent=s;}
document.getElementById('tap').onclick=function(){this.textContent='Touch / 터치: '+(++taps);};
document.getElementById('tone').onclick=function(){try{var A=window.AudioContext||window.webkitAudioContext;if(!A)return say('Web Audio unavailable / 오디오 API 없음');if(!audio)audio=new A();if(audio.resume)audio.resume();var o=audio.createOscillator(),g=audio.createGain();o.frequency.value=440;g.gain.value=.03;o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+.4);say('Tone requested; confirm sound by ear. / 시험음 요청 · 실제 소리를 확인하세요');}catch(e){say('Audio: '+e.message);}};
document.getElementById('play').onclick=function(){try{video.currentTime=0;var p=video.play();if(p&&p.catch)p.catch(function(e){say('Video: '+e.message);});}catch(e){say('Video: '+e.message);}};
document.getElementById('stop').onclick=function(){video.pause();if(audio&&audio.suspend)audio.suspend();say('Stopped / 중지');};
video.onerror=function(){say('Local video error: '+(video.error&&video.error.code));};
video.onplaying=function(){say('Browser reports playing; confirm moving picture and sound. / 재생 상태 · 실제 영상과 소리를 확인하세요');};
var gl=null;try{var c=document.createElement('canvas');gl=c.getContext('webgl')||c.getContext('experimental-webgl');}catch(e){}
document.getElementById('info').textContent='Browser: '+navigator.userAgent+'\nWebGL context: '+!!gl+'\nH.264/AAC declared support: '+(video.canPlayType('video/mp4; codecs="avc1.42E01E, mp4a.40.2"')||'none')+'\nCapabilities are not proof of accelerated playback. / 가속 재생 보장 아님';
window.addEventListener('pagehide',function(){video.pause();if(audio&&audio.close)audio.close();});
})();</script></html>`;
