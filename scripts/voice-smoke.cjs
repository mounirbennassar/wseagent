// Optional live integration check. Uses a synthetic microphone and incurs API usage.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
// Chromium's default fake microphone emits a tone. Use real silence so the
// waiting check measures the advisor rather than artificial VAD triggers.
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'hala-voice-check-'));
const silence=path.join(temp,'silence.wav');
const samples=48000*30;
const wav=Buffer.alloc(44+samples*2);
wav.write('RIFF',0);wav.writeUInt32LE(36+samples*2,4);wav.write('WAVEfmt ',8);
wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);
wav.writeUInt32LE(48000,24);wav.writeUInt32LE(96000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);
wav.write('data',36);wav.writeUInt32LE(samples*2,40);fs.writeFileSync(silence,wav);
const {chromium}=require('../frontend/node_modules/@playwright/test');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream',`--use-file-for-fake-audio-capture=${silence}`,'--autoplay-policy=no-user-gesture-required']});
 try {
  const page=await browser.newPage({permissions:['microphone'],viewport:{width:390,height:844}});
  await page.addInitScript(()=>{
   window.__peers=[];window.__events=[];
   const Base=window.RTCPeerConnection;
   window.RTCPeerConnection=class extends Base{constructor(...args){super(...args);window.__peers.push(this)}createDataChannel(...args){const dc=super.createDataChannel(...args);window.__channel=dc;dc.addEventListener('message',m=>{try{window.__events.push(JSON.parse(m.data))}catch{}});return dc;}};
  });
  page.on('pageerror',e=>console.log('Browser error:',e.message));
  page.on('response',async r=>{if(r.url().endsWith('/api/session'))console.log('Session HTTP:',r.status(),r.status()>=400?await r.text():'SDP received')});
  await page.goto(process.env.HALA_BASE_URL || 'http://127.0.0.1:3000');
  await page.getByRole('button',{name:'يلا، نتكلم'}).click();
  await page.waitForFunction(()=>window.__events.some(e=>e.type==='response.output_audio_transcript.done'),{},{timeout:60000});
  const greeting=await page.evaluate(()=>window.__events.find(e=>e.type==='response.output_audio_transcript.done')?.transcript);
  console.log('Voice greeting:',greeting);
  assert.match(greeting,/وول ستريت/);
  assert.doesNotMatch(greeting,/الذكاء الاصطناعي|AI/i);
  assert.ok(greeting.split(/\s+/).length<=25,'Opening must stay short');
  await page.waitForTimeout(4000);
  assert.equal(await page.evaluate(()=>window.__events.filter(e=>e.type==='response.created').length),1,'Wait silently after the opening question');
  console.log('Waits for visitor: PASS');
  if(process.env.HALA_ADVISOR_EVAL==='1'){
   for(const text of ['أبي أتعلم إنجليزي','هدفي أطور نفسي بالشغل، دوامي يتغيّر وأبغى أونلاين مع إمكانية الحضور للمركز']){
    const count=await page.evaluate(()=>window.__events.filter(e=>e.type==='response.output_audio_transcript.done').length);
    await page.evaluate(text=>{window.__channel.send(JSON.stringify({type:'conversation.item.create',item:{type:'message',role:'user',content:[{type:'input_text',text}]}}));window.__channel.send(JSON.stringify({type:'response.create'}));},text);
    await page.waitForFunction(count=>window.__events.filter(e=>e.type==='response.output_audio_transcript.done').length>count,count,{timeout:45000});
    const reply=await page.evaluate(()=>window.__events.filter(e=>e.type==='response.output_audio_transcript.done').at(-1).transcript);
    console.log('Advisor voice reply:',reply);
    assert.ok((reply.match(/[؟?]/g)||[]).length<=1,'At most one advisor question');
    await page.waitForFunction(()=>window.__events.filter(e=>e.type==='output_audio_buffer.stopped').length>=window.__events.filter(e=>e.type==='response.output_audio_transcript.done').length,{},{timeout:30000});
   }
  }
  assert.ok(await page.evaluate(()=>window.__events.filter(e=>e.type==='response.done').every(e=>e.response.status==='completed')),'All generated replies must finish without truncation');
  console.log('Connection:',await page.evaluate(()=>window.__peers[0].connectionState));
  console.log('Received audio bytes:',await page.evaluate(async()=>{const stats=await window.__peers[0].getStats();let bytes=0;stats.forEach(s=>{if(s.type==='inbound-rtp'&&s.kind==='audio')bytes+=s.bytesReceived});return bytes}));
  await page.getByRole('button',{name:'كتم الميكروفون',exact:true}).click();
  console.log('Muted tracks:',await page.evaluate(()=>window.__peers[0].getSenders().filter(s=>s.track).every(s=>!s.track.enabled)));
  await page.getByRole('button',{name:'إنهاء',exact:true}).click();
  console.log('Closed:',await page.evaluate(()=>window.__peers[0].connectionState));
 }finally{await browser.close();fs.rmSync(temp,{recursive:true,force:true})}
})().catch(e=>{console.error(e.message);process.exit(1)});
