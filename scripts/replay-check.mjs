import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { checkContrast } from './readability-check.mjs';

const origin = process.env.TEST_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
await mkdir('artifacts', { recursive: true });
const errors = [];
try {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 700 },
    { width: 320, height: 640 },
    { width: 844, height: 390 },
  ]) {
    const page = await browser.newPage({ viewport, acceptDownloads: true });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      localStorage.setItem(
        'chillhill.settings.v1',
        JSON.stringify({ treeDensity: 0, autoTime: false, autoWeather: false }),
      );
    });
    await page.goto(origin);
    await page.waitForFunction(() => window.__chillhill?.driveReady);
    assert.equal(
      await page.locator('#open-saved-replay, #replay-file, #replay-save, #replay-load').count(),
      0,
    );
    assert.equal(await page.locator('#open-replay-toolbar').isVisible(), false);
    await page.locator('#start-challenge').click();
    await page.keyboard.down('w');
    await page.waitForFunction(() => window.__chillhill.state.speed > 5);
    await page.keyboard.up('w');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#open-replay-toolbar svg').count(), 1);
    assert.equal(await page.locator('#open-replay svg').count(), 1);
    // The replay action must share both edges with the two drive choices,
    // including the wider completed-run card and leaderboard layout.
    const cardClass = await page.locator('#pause-card').getAttribute('class');
    for (const extra of ['', 'has-results', 'has-results has-leaderboard']) {
      await page
        .locator('#pause-card')
        .evaluate((node, value) => (node.className = value), `${cardClass} ${extra}`);
      const first = await page.locator('#pause-card [data-mode="cozy"]').boundingBox();
      const last = await page.locator('#pause-card [data-mode="challenge"]').boundingBox();
      const replay = await page.locator('#open-replay').boundingBox();
      assert.ok(Math.abs(replay.x - first.x) < 1, 'replay aligns with the left drive choice');
      assert.ok(
        Math.abs(replay.x + replay.width - last.x - last.width) < 1,
        'replay aligns with the right drive choice',
      );
    }
    await page
      .locator('#pause-card')
      .evaluate((node, value) => (node.className = value), cardClass);
    await checkContrast(page, ['#open-replay', '#open-replay-toolbar']);
    for (const button of await page.locator('.header-actions .icon-button').all()) {
      const box = await button.boundingBox();
      if (box) assert.ok(box.x >= 0 && box.x + box.width <= viewport.width, 'toolbar buttons fit');
    }
    await page.screenshot({ path: `artifacts/replay-pause-${viewport.width}.png` });
    const before = await page.evaluate(() => ({
      state: window.__chillhill.state,
      challenge: window.__chillhill.challenge,
      worldClock: window.__chillhill.worldClock,
      settings: window.__chillhill.settings,
      scoreRun: window.__chillhill.scoreRun,
      storage: JSON.stringify(localStorage),
    }));
    await page.locator('#open-replay').click();
    assert.equal(await page.locator('#replay-view details').count(), 0);
    for (const id of ['replay-format', 'replay-quality', 'replay-clip', 'replay-video'])
      assert.equal(
        await page.locator(`#${id}`).isVisible(),
        true,
        'video choices are immediately visible',
      );
    await checkContrast(page, ['#replay-video']);
    assert.equal(await page.locator('#replay-portrait').isChecked(), true);
    await page.locator('#replay-portrait').focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(
      await page.locator('#replay-landscape').isChecked(),
      true,
      'format toggle works with keyboard arrows',
    );
    await page.locator('#replay-portrait').check();
    assert.equal(await page.locator('#replay-landscape').isChecked(), false);
    await page.waitForFunction(() => window.__chillhill.replay.position > 0.1);
    await page.locator('#replay-play').click();
    const duration = await page.evaluate(() => window.__chillhill.replay.duration);
    assert.ok(duration > 1);
    await page.locator('#replay-seek').fill((duration * 0.5).toFixed(2));
    await page.locator('#replay-camera').selectOption('front');
    await page.waitForFunction(() => window.__chillhill.cameraMode === 'front');
    await page.locator('#replay-camera').selectOption('chase');
    await page.locator('#replay-speed').selectOption('2');
    await page.keyboard.press('r');
    await page.keyboard.press('w');
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('Tab');
      assert.equal(
        await page
          .locator('#replay-view')
          .evaluate((node) => node.contains(document.activeElement)),
        true,
      );
    }
    await page.locator('#replay-clip').selectOption('all');
    if (viewport.width === 1440) {
      const videoDownload = page.waitForEvent('download', { timeout: 20000 });
      await page.locator('#replay-record').click();
      assert.equal(await page.locator('#replay-portrait').isDisabled(), true);
      assert.equal(await page.locator('#replay-landscape').isDisabled(), true);
      const video = await videoDownload;
      assert.match(video.suggestedFilename(), /\.(mp4|webm)$/);
      const data = await readFile(await video.path());
      assert.ok(data.byteLength > 1000, 'a real encoded video was downloaded');
      await video.saveAs(`artifacts/${video.suggestedFilename()}`);
      const playback = await page.evaluate(
        async ({ base64, type }) => {
          const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
          const url = URL.createObjectURL(new Blob([bytes], { type }));
          const video = document.createElement('video');
          video.muted = true;
          video.src = url;
          await new Promise((resolve, reject) => {
            video.onloadeddata = resolve;
            video.onerror = reject;
          });
          await new Promise((resolve) => {
            video.onseeked = resolve;
            video.currentTime = Math.min(0.3, video.duration / 2);
          });
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const context = canvas.getContext('2d');
          context.drawImage(video, 0, 0);
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
          const colors = new Set();
          for (let i = 0; i < pixels.length; i += 400)
            colors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
          const result = {
            width: video.videoWidth,
            height: video.videoHeight,
            duration: video.duration,
            colors: colors.size,
          };
          URL.revokeObjectURL(url);
          return result;
        },
        {
          base64: data.toString('base64'),
          type: video.suggestedFilename().endsWith('.mp4') ? 'video/mp4' : 'video/webm',
        },
      );
      console.log('Encoded video:', playback);
      assert.ok(
        playback.width > 0 && playback.height > 0 && playback.colors > 20,
        'video decodes and contains the rendered landscape',
      );
      await page.locator('#replay-record').click();
      await page.locator('#replay-cancel-video').click();
      assert.equal(await page.evaluate(() => window.__chillhill.replay.exporting), false);
      await page.locator('#replay-record').click();
      await page.evaluate(() => window.dispatchEvent(new Event('blur')));
      assert.equal(await page.evaluate(() => window.__chillhill.replay.exporting), false);
      assert.match(await page.locator('#replay-status').textContent(), /left the tab/);
    } else {
      await page.evaluate(() => {
        window.MediaRecorder = undefined;
      });
      await page.locator('#replay-record').click();
      assert.match(await page.locator('#replay-status').textContent(), /unavailable/);
      assert.equal(await page.locator('#replay-play').isEnabled(), true);
    }
    await page.locator('.replay-panel').evaluate((node) => (node.scrollTop = 0));
    await page.screenshot({ path: `artifacts/replay-${viewport.width}.png` });
    const panel = await page.locator('.replay-panel').boundingBox();
    assert.ok(
      panel.x >= 0 &&
        panel.x + panel.width <= viewport.width + 1 &&
        panel.y + panel.height <= viewport.height + 1,
    );
    await page.locator('#close-replay').click();
    const after = await page.evaluate(() => ({
      state: window.__chillhill.state,
      challenge: window.__chillhill.challenge,
      worldClock: window.__chillhill.worldClock,
      settings: window.__chillhill.settings,
      scoreRun: window.__chillhill.scoreRun,
      storage: JSON.stringify(localStorage),
    }));
    assert.deepEqual(
      after,
      before,
      'watching, seeking and exporting do not change the live run or storage',
    );
    assert.equal(await page.evaluate(() => window.__chillhill.paused), true);
    assert.equal(
      await page.locator('#open-replay').evaluate((node) => node === document.activeElement),
      true,
    );
    await page.locator('#resume').click();
    await page.waitForFunction(
      (distance) => window.__chillhill.state.distance > distance,
      before.state.distance,
    );
    await page.locator('#open-replay-toolbar').click();
    assert.equal(await page.locator('#replay-view').isVisible(), true);
    assert.equal(
      await page.evaluate(() => window.__chillhill.paused),
      true,
      'toolbar pauses live driving',
    );
    const frozen = await page.evaluate(() => window.__chillhill.state);
    await page.waitForTimeout(150);
    assert.deepEqual(await page.evaluate(() => window.__chillhill.state), frozen);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#pause-card').isVisible(), true);
    await page.locator('#restart').click();
    await page.keyboard.press('Escape');
    await page.locator('#open-replay').click();
    assert.ok(
      await page.evaluate(() => window.__chillhill.replay.duration < 0.5),
      'restart clears the previous recording',
    );
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    'Clapperboard entry, visible video choices, no replay-file UI, video capture, isolation, contrast and responsive layout passed.',
  );
} finally {
  await browser.close();
}
