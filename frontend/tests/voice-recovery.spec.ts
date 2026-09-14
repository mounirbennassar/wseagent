import { test, expect } from '@playwright/test';

declare global {
  interface Window {
    voiceHarness: {
      state: (value: RTCPeerConnectionState) => void;
      event: (value: Record<string, unknown>) => void;
      closed: boolean;
      micStopped: boolean;
    };
  }
}

test.beforeEach(async ({ page }) => {
  await page.clock.install();
  await page.addInitScript(() => {
    const mic = { enabled: true, stop: () => { window.voiceHarness.micStopped = true; } };
    navigator.mediaDevices.getUserMedia = async () => ({
      getTracks: () => [mic], getAudioTracks: () => [mic],
    }) as unknown as MediaStream;
    class Peer {
      connectionState: RTCPeerConnectionState = 'new';
      localDescription = { sdp: 'v=0\r\no=browser-recovery-test' };
      onconnectionstatechange = () => {};
      dc = { onopen: () => {}, onmessage: (_: { data: string }) => {}, onclose: () => {}, send: () => {}, close: () => {} };
      constructor() {
        window.voiceHarness = {
          closed: false, micStopped: false,
          state: value => { this.connectionState = value; this.onconnectionstatechange(); },
          event: value => this.dc.onmessage({ data: JSON.stringify(value) }),
        };
      }
      addTrack() {}
      createDataChannel() { return this.dc; }
      async createOffer() { return this.localDescription; }
      async setLocalDescription() {}
      async setRemoteDescription() { this.connectionState = 'connected'; this.onconnectionstatechange(); this.dc.onopen(); }
      close() { window.voiceHarness.closed = true; }
    }
    window.RTCPeerConnection = Peer as unknown as typeof RTCPeerConnection;
  });
  await page.route('**/api/session', route => route.fulfill({ status: 201, contentType: 'application/sdp', body: 'v=0\r\nanswer' }));
  await page.goto('/');
  await page.getByRole('button', { name: 'يلا، نتكلم' }).click();
  await expect(page.getByRole('button', { name: 'كتم الميكروفون', exact: true })).toBeEnabled();
});

test('brief network drop preserves the call and cancels the recovery deadline', async ({ page }) => {
  await page.evaluate(() => window.voiceHarness.state('disconnected'));
  await expect(page.getByRole('heading', { name: 'الاتصال ضعيف، لحظة ونرجع…' })).toBeVisible();
  await page.clock.runFor(5000);
  expect(await page.evaluate(() => window.voiceHarness.closed)).toBe(false);
  await page.evaluate(() => window.voiceHarness.state('connected'));
  await page.clock.runFor(15000);
  await expect(page.getByRole('button', { name: 'إنهاء', exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.voiceHarness.micStopped)).toBe(false);
  await page.getByRole('button', { name: 'إنهاء', exact: true }).click();
  expect(await page.evaluate(() => window.voiceHarness.micStopped)).toBe(true);
});

test('persistent disconnection closes the microphone and permits another call', async ({ page }) => {
  await page.evaluate(() => window.voiceHarness.state('disconnected'));
  await page.clock.runFor(13000);
  await expect(page.locator('.error-notice')).toContainText('انقطع الاتصال');
  expect(await page.evaluate(() => window.voiceHarness.micStopped && window.voiceHarness.closed)).toBe(true);
  await expect(page.getByRole('button', { name: 'يلا، نتكلم' })).toBeEnabled();
});

test('generation completion does not cut playback; incomplete output is surfaced', async ({ page }) => {
  await page.evaluate(() => {
    window.voiceHarness.event({ type: 'output_audio_buffer.started' });
    window.voiceHarness.event({ type: 'response.done', response: { status: 'completed' } });
  });
  await expect(page.getByRole('heading', { name: 'هلا تتكلم…' })).toBeVisible();
  await page.evaluate(() => window.voiceHarness.event({ type: 'response.done', response: { status: 'incomplete' } }));
  await expect(page.locator('.error-notice')).toContainText('الرد ما اكتمل');
  await expect(page.getByRole('heading', { name: 'هلا تتكلم…' })).toBeVisible();
  expect(await page.evaluate(() => window.voiceHarness.closed)).toBe(false);
  await page.evaluate(() => window.voiceHarness.event({ type: 'output_audio_buffer.stopped' }));
  await expect(page.getByRole('heading', { name: 'أسمعك… خذ راحتك' })).toBeVisible();
});
