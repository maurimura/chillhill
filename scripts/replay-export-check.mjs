import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const origin = process.env.TEST_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
await mkdir('artifacts', { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem(
      'chillhill.settings.v1',
      JSON.stringify({
        car: 'mustang-fastback',
        treeDensity: 1,
        seed: 42,
        autoTime: false,
        autoWeather: false,
      }),
    );
  });
  await page.goto(origin);
  await page.waitForSelector('#scene canvas');
  await page.locator('#start').click();
  await page.waitForTimeout(16200);
  await page.locator('#open-replay-toolbar').click();
  await page.locator('#replay-play').click();
  assert.equal(await page.locator('#replay-portrait').isChecked(), true);
  assert.equal(await page.locator('#replay-quality').inputValue(), 'high');
  await page.locator('#replay-landscape').check();
  // Exercise the actual current run, without replay-file controls or mutation hooks.
  const recordedDuration = Number(await page.locator('#replay-seek').getAttribute('max'));
  assert.ok(recordedDuration > 15);
  const duration = 10;
  await page.locator('#replay-clip').selectOption('10');
  const positionBefore = await page.locator('#replay-seek').inputValue();
  const download = page.waitForEvent('download', { timeout: 60000 });
  await page.locator('#replay-video').click();
  assert.equal(
    await page.locator('#replay-seek').inputValue(),
    positionBefore,
    'export does not play the foreground timeline',
  );
  await page.locator('#close-replay').click();
  await page.locator('#resume').click();
  const before = await page.locator('#distance').innerText();
  await page.waitForFunction(
    (distance) => Number(document.querySelector('#distance').textContent) > Number(distance),
    before,
  );
  await page.setViewportSize({ width: 1300, height: 800 });
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.waitForFunction(
    () => {
      const status = document.querySelector('#video-export-status');
      return (
        !status.querySelector('a').hidden ||
        status.querySelector('button').textContent === 'Dismiss'
      );
    },
    undefined,
    { timeout: 60000 },
  );
  const message = await page.locator('#video-export-status span').innerText();
  assert.match(message, /Video ready/, message);
  // No second click: export completion starts this download automatically.
  const video = await download;
  const videoPath = `artifacts/background-${video.suggestedFilename()}`;
  await video.saveAs(videoPath);
  const buffer = await readFile(await video.path());
  const decoded = await page.evaluate(
    async ({ base64, type }) => {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type }));
      const video = document.createElement('video');
      video.src = url;
      video.muted = true;
      await new Promise((resolve, reject) => {
        video.onloadeddata = resolve;
        video.onerror = reject;
      });
      const images = [];
      for (const time of [0.1, 1.001, 1.001 + 1 / 60, 1.001 + 2 / 60, video.duration - 0.1]) {
        await new Promise((resolve) => {
          video.onseeked = resolve;
          video.currentTime = time;
        });
        const canvas = document.createElement('canvas');
        canvas.width = 160;
        canvas.height = 90;
        const context = canvas.getContext('2d');
        context.drawImage(video, 0, 0, 160, 90);
        const pixels = context.getImageData(0, 0, 160, 90).data;
        const colors = new Set();
        let hash = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          colors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
          hash = (hash * 31 + pixels[i]) | 0;
        }
        images.push({ colors: colors.size, hash });
      }
      const result = {
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
        images,
      };
      URL.revokeObjectURL(url);
      return result;
    },
    {
      base64: buffer.toString('base64'),
      type: video.suggestedFilename().endsWith('.mp4') ? 'video/mp4' : 'video/webm',
    },
  );
  assert.ok(Math.abs(decoded.duration - duration) < 0.05);
  assert.equal(decoded.width, 1920);
  assert.equal(decoded.height, 1080);
  assert.ok(decoded.images.every((frame) => frame.colors > 20));
  assert.ok(
    new Set(decoded.images.map((frame) => frame.hash)).size === decoded.images.length,
    'the video contains distinct motion even in adjacent 60 fps frames',
  );
  console.log(message, JSON.stringify(decoded), { before });
  await page.locator('#video-export-status button').click();
  await page.locator('#open-replay').click();
  await page.locator('#replay-portrait').check();
  await page.locator('#replay-video').click();
  await page.locator('#video-export-status button').click();
  assert.equal(
    await page.locator('#video-export-status').isVisible(),
    false,
    'cancel removes the job',
  );
  await page.locator('#close-replay').click();
  // A separate portrait export also exercises worker-side car badge textures.
  await page.setViewportSize({ width: 390, height: 700 });
  await page.locator('#open-replay').click();
  const portraitDuration = 15;
  await page.locator('#replay-clip').selectOption('15');
  const portraitDownload = page.waitForEvent('download');
  await page.locator('#replay-video').click();
  await page.waitForFunction(
    () => !document.querySelector('#video-export-status a').hidden,
    undefined,
    { timeout: 30000 },
  );
  const portrait = await portraitDownload;
  await portrait.saveAs(`artifacts/portrait-${portrait.suggestedFilename()}`);
  const dimensions = await page.evaluate(async () => {
    const video = document.createElement('video');
    video.src = document.querySelector('#video-export-status a').href;
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = reject;
    });
    return [video.videoWidth, video.videoHeight, video.duration];
  });
  assert.deepEqual(dimensions.slice(0, 2), [1080, 1920]);
  assert.ok(Math.abs(dimensions[2] - portraitDuration) < 0.05);
  await page.screenshot({ path: 'artifacts/replay-export-mobile.png' });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.locator('#video-export-status button').click();
  // Model a browser requiring another user gesture. Only synthetic anchor clicks
  // are prevented; the same visible link must still work with a pointer click.
  await page.evaluate(() => {
    window.automaticDownloadAttempts = 0;
    document.addEventListener(
      'click',
      (event) => {
        if (!event.isTrusted && event.target.closest?.('#video-export-status a')) {
          window.automaticDownloadAttempts++;
          event.preventDefault();
        }
      },
      true,
    );
  });
  await page.locator('#replay-quality').selectOption('compact');
  await page.locator('#replay-video').click();
  await page.waitForFunction(
    () => !document.querySelector('#video-export-status a').hidden,
    undefined,
    { timeout: 30000 },
  );
  assert.equal(await page.evaluate(() => window.automaticDownloadAttempts), 1);
  assert.match(await page.locator('#video-export-status span').innerText(), /Use Download video/);
  const compactDownload = page.waitForEvent('download');
  await page.locator('#video-export-status a').click();
  const compact = await compactDownload;
  await compact.saveAs(`artifacts/compact-${compact.suggestedFilename()}`);
  const compactDimensions = await page.evaluate(async () => {
    const video = document.createElement('video');
    video.src = document.querySelector('#video-export-status a').href;
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = reject;
    });
    return [video.videoWidth, video.videoHeight, video.duration];
  });
  assert.deepEqual(compactDimensions.slice(0, 2), [720, 1280]);
  assert.ok(Math.abs(compactDimensions[2] - portraitDuration) < 0.05);
  await page.locator('#video-export-status button').click();
  await page.evaluate(() => {
    window.VideoEncoder = undefined;
  });
  await page.locator('#replay-video').click();
  assert.match(await page.locator('#replay-status').innerText(), /Fast export is unavailable/);
  assert.equal(await page.locator('#replay-record').isEnabled(), true);
  assert.deepEqual(errors, []);
  console.log(
    '10- and 15-second clips, icon format toggle, automatic downloads, manual fallback, 1080p60 motion, compact, return to drive and cancellation passed.',
  );
} finally {
  await browser.close();
}
