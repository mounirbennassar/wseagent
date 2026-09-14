// Optional live integration check. Uses a synthetic microphone and incurs API usage.
const {chromium}=require('../frontend/node_modules/@playwright/test');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required']});
 try {
  const page=await browser.newPage({permissions:['microphone'],viewport:{width:390,height:844}});
  await page.addInitScript(()=>{
   window.__peers=[];window.__events=[];
   const Base=window.RTCPeerConnection;
   window.RTCPeerConnection=class extends Base{constructor(...args){super(...args);window.__peers.push(this)}createDataChannel(...args){const dc=super.createDataChannel(...args);dc.addEventListener('message',m=>{try{window.__events.push(JSON.parse(m.data))}catch{}});return dc;}};
  });
  page.on('pageerror',e=>console.log('Browser error:',e.message));
  page.on('response',async r=>{if(r.url().endsWith('/api/session'))console.log('Session HTTP:',r.status(),r.status()>=400?await r.text():'SDP received')});
  await page.goto(process.env.HALA_BASE_URL || 'http://127.0.0.1:3000');
  await page.getByRole('button',{name:'يلا، نتكلم'}).click();
  await page.waitForFunction(()=>window.__events.some(e=>e.type==='response.output_audio_transcript.done'),{},{timeout:60000});
  console.log('Voice greeting:',await page.evaluate(()=>window.__events.find(e=>e.type==='response.output_audio_transcript.done')?.transcript));
  console.log('Connection:',await page.evaluate(()=>window.__peers[0].connectionState));
  console.log('Received audio bytes:',await page.evaluate(async()=>{const stats=await window.__peers[0].getStats();let bytes=0;stats.forEach(s=>{if(s.type==='inbound-rtp'&&s.kind==='audio')bytes+=s.bytesReceived});return bytes}));
  await page.getByRole('button',{name:'كتم الميكروفون',exact:true}).click();
  console.log('Muted tracks:',await page.evaluate(()=>window.__peers[0].getSenders().filter(s=>s.track).every(s=>!s.track.enabled)));
  await page.getByRole('button',{name:'إنهاء',exact:true}).click();
  console.log('Closed:',await page.evaluate(()=>window.__peers[0].connectionState));
 }finally{await browser.close()}
})().catch(e=>{console.error(e.message);process.exit(1)});
