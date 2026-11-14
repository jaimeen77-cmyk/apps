'use strict';
const fs=require('fs'),os=require('os'),path=require('path'),assert=require('assert'),vm=require('vm');
const {chromium}=require('playwright'),html=require('../../apps/media_check/test-page');
new vm.Script(html.split('<script>')[1].split('</script>')[0]);
(async()=>{
 let browser,local;
 try{
  local=await require('../../apps/media_check/local-page').start();
  browser=await chromium.launch({headless:true,executablePath:process.env.MEDIA_CHECK_CHROMIUM||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined)});const page=await browser.newPage(),errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
  await page.goto(local.url);await page.click('#tap');assert((await page.textContent('#tap')).endsWith('1'));
  await page.click('#tone');assert((await page.textContent('#result')).includes('confirm sound by ear'));
  await page.evaluate(()=>{document.getElementById('video').muted=true;});await page.click('#play');
  await page.waitForFunction(()=>document.getElementById('video').currentTime>.4,null,{timeout:10000});
  assert((await page.textContent('#result')).includes('confirm moving picture'));
  await page.click('#stop');assert(await page.evaluate(()=>document.getElementById('video').paused));
  assert.deepEqual(errors,[]);assert(requests.every(u=>u.startsWith(local.url)),'local page must not send external requests');
  console.log('PASS host Chromium local-page touch, WebAudio request, H.264 moving frames, stop and no network; no vehicle/speaker claim');
 }finally{if(browser)await browser.close();if(local)local.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
