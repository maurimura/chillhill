import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const musicPattern = '**/music/sleep-piano-scott-buckley.mp3';
const isMusic = (url) => /\/music\/.+\.mp3$/.test(new URL(url).pathname);
const ready = (page) => page.waitForFunction(() => window.__chillhill?.music);
const playing = (page) =>
  page.waitForFunction(() => {
    const audio = document.querySelector('#music-audio');
    return audio && !audio.paused && audio.currentTime > 0.1;
  });

/** An actual MP3 playback check, plus deliberately failed/delayed requests for safe fallback. */
export async function checkMusic(browser, origin, errors) {
  await mkdir('artifacts', { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (error) => errors.push(error.message));
  const requests = [];
  const mediaRequests = [];
  page.on('request', (request) => {
    if (isMusic(request.url())) requests.push(request.url());
    if (request.resourceType() === 'media') mediaRequests.push(request.url());
  });
  let releaseRequest = () => {};
  try {
    await page.goto(origin);
    await ready(page);
    assert.equal(await page.locator('#music-audio').getAttribute('src'), null);
    assert.equal(await page.evaluate(() => window.__chillhill.music.playing), false);
    assert.equal(await page.evaluate(() => window.__chillhill.music.loaded), false);
    await page.locator('#sound').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#music-menu').isVisible(), true);
    assert.equal(await page.locator('#sound').getAttribute('aria-expanded'), 'true');
    assert.equal(
      await page.evaluate(() => document.activeElement?.id),
      'close-music-menu',
      'keyboard opening moves focus into the non-modal panel',
    );
    await page.waitForTimeout(150);
    assert.equal(requests.length, 0, 'even opening the panel does not fetch the track');

    await page.locator('#music-play').click();
    await playing(page);
    assert.equal(await page.evaluate(() => window.__chillhill.music.loaded), true);
    assert.equal(
      await page.locator('#music-audio').evaluate((audio) => audio.loop),
      false,
      'the playlist advances, not the same song on repeat',
    );
    assert.ok(requests.length > 0);
    assert.ok(mediaRequests.every((url) => new URL(url).origin === new URL(origin).origin));
    assert.match(await page.locator('#music-status').innerText(), /Now playing/);
    await page.screenshot({ path: 'artifacts/music-panel-desktop.png' });
    assert.equal(await page.locator('#music-track-select option').count(), 3);
    for (const [index, id] of [
      [1, 'moonlight'],
      [2, 'meanwhile'],
    ]) {
      // Seek near the real media end, then let the browser emit its natural ended event.
      await page.locator('#music-audio').evaluate((audio) => {
        audio.currentTime = audio.duration - 0.15;
      });
      await page.waitForFunction(
        (id) => window.__chillhill.music.track === id && window.__chillhill.music.playing,
        id,
      );
      await playing(page);
      assert.equal(await page.locator('#music-track-select').inputValue(), String(index));
      assert.match(await page.locator('#music-soundcloud').getAttribute('href'), new RegExp(id));
      assert.match(await page.locator('#music-source').getAttribute('href'), new RegExp(id));
      assert.equal(
        await page.locator('#music-credit-title').innerText(),
        `“${index === 1 ? 'Moonlight' : 'Meanwhile'}”`,
      );
      assert.ok(await page.locator('#music-audio').evaluate((audio) => audio.duration > 240));
    }
    await page.locator('#music-audio').evaluate((audio) => {
      audio.currentTime = audio.duration - 0.15;
    });
    await page.waitForFunction(
      () => window.__chillhill.music.track === 'sleep-piano' && window.__chillhill.music.playing,
    );
    await page.locator('#music-next').click();
    await playing(page);
    assert.equal(await page.evaluate(() => window.__chillhill.music.track), 'moonlight');
    await page.locator('#music-previous').click();
    await playing(page);
    assert.equal(await page.evaluate(() => window.__chillhill.music.track), 'sleep-piano');
    await page.locator('#music-volume').fill('0');
    assert.equal(await page.locator('#sound').getAttribute('data-audible'), 'false');

    await page.locator('#music-volume').fill('0.24');
    assert.equal(await page.evaluate(() => window.__chillhill.music.volume), 0.24);
    assert.equal(await page.locator('#music-volume-value').innerText(), '24%');
    assert.equal(
      await page
        .locator('#music-volume')
        .evaluate((input) => input.style.getPropertyValue('--range-progress')),
      '24%',
    );
    await page.locator('#ambience-toggle').click();
    await page.waitForFunction(() => window.__chillhill.music.ambience);
    assert.equal(await page.evaluate(() => window.__chillhill.music.playing), true);
    assert.equal(await page.evaluate(() => window.__chillhill.music.volume), 0.24);
    await page.locator('#music-play').click();
    assert.equal(await page.evaluate(() => window.__chillhill.music.playing), false);
    assert.equal(await page.evaluate(() => window.__chillhill.music.ambience), true);
    assert.equal(await page.locator('#sound').getAttribute('data-audible'), 'true');
    await page.locator('#ambience-toggle').click();
    await page.waitForFunction(() => !window.__chillhill.music.ambience);
    assert.equal(await page.locator('#sound').getAttribute('data-audible'), 'false');

    const beforeSelection = requests.length;
    await page.locator('#music-track-select').selectOption('2');
    await page.waitForTimeout(150);
    assert.equal(
      requests.length,
      beforeSelection,
      'choosing a song while paused does not load or play it',
    );
    assert.equal(await page.locator('#music-audio').getAttribute('src'), null);
    assert.equal(await page.evaluate(() => window.__chillhill.music.playing), false);
    await page.locator('#music-track-select').selectOption('0');

    await page.locator('#music-play').click();
    await playing(page);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#music-menu').isVisible(), false);
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'sound');
    await page.locator('#start').click();
    await page.waitForFunction(() => window.__chillhill.state.speed > 1);
    await page.locator('#pause').click();
    assert.equal(await page.evaluate(() => window.__chillhill.paused), true);
    assert.equal(await page.evaluate(() => window.__chillhill.music.playing), true);
    await page.locator('#open-car-menu').click();
    await page.locator('#open-garage').click();
    await page.waitForFunction(() => window.__chillhill.view === 'garage');
    assert.equal(await page.evaluate(() => window.__chillhill.music.playing), true);
    await page.locator('#back-drive').click();
    await page.waitForFunction(() => window.__chillhill.view === 'drive');

    // Deterministic visibility-event coverage; headless Chrome need not hide a background tab.
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
      delete document.hidden;
      document.dispatchEvent(new Event('visibilitychange'));
    });
    assert.equal(await page.evaluate(() => window.__chillhill.music.playing), false);
    assert.match(await page.locator('#music-status').innerText(), /away/);
    await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => window.__chillhill.music.playing), false);

    const beforeReload = requests.length;
    await page.reload();
    await ready(page);
    await page.waitForTimeout(150);
    assert.equal(requests.length, beforeReload, 'reload does not restore playback or fetch audio');
    assert.equal(await page.locator('#music-audio').getAttribute('src'), null);
    assert.equal(await page.evaluate(() => window.__chillhill.music.volume), 0.24);
    assert.equal(await page.evaluate(() => window.__chillhill.music.playing), false);

    const gate = new Promise((resolve) => {
      releaseRequest = resolve;
    });
    let delayed = false;
    await page.route(musicPattern, async (route) => {
      delayed = true;
      await gate;
      await route.continue();
    });
    await page.locator('#sound').click();
    await page.locator('#music-play').click();
    for (let count = 0; count < 30 && !delayed; count++) await page.waitForTimeout(50);
    assert.equal(delayed, true, 'play issued a deferred request');
    await page.locator('#music-play').click();
    assert.equal(await page.locator('#music-audio').getAttribute('src'), null);
    releaseRequest();
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => window.__chillhill.music.playing), false);
    assert.equal(await page.evaluate(() => window.__chillhill.music.error), null);
    await page.unroute(musicPattern);

    await page.evaluate(() => localStorage.setItem('chillhill.music.v1', '{broken'));
    await page.reload();
    await ready(page);
    assert.equal(await page.evaluate(() => window.__chillhill.music.volume), 0.32);
    await page.evaluate(() => {
      Storage.prototype.setItem = () => {
        throw new DOMException('Storage blocked', 'SecurityError');
      };
    });
    await page.locator('#sound').click();
    await page.locator('#music-volume').fill('0.4');
    assert.equal(await page.evaluate(() => window.__chillhill.music.volume), 0.4);
  } finally {
    releaseRequest();
    await page.close();
  }

  const failed = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  failed.on('pageerror', (error) => errors.push(error.message));
  let releaseTimeoutRequest = () => {};
  try {
    await failed.route(musicPattern, (route) =>
      route.fulfill({ status: 503, contentType: 'text/plain', body: 'Temporarily unavailable' }),
    );
    await failed.goto(origin);
    await ready(failed);
    await failed.locator('#sound').click();
    await failed.locator('#music-play').click();
    await failed.waitForFunction(() => window.__chillhill.music.error);
    assert.equal(await failed.locator('#music-play').innerText(), 'Retry music');
    assert.equal(await failed.evaluate(() => window.__chillhill.music.playing), false);
    await failed.unroute(musicPattern);
    await failed.locator('#music-play').click();
    await playing(failed);
    assert.equal(await failed.evaluate(() => window.__chillhill.music.error), null);

    await failed.reload();
    await ready(failed);
    const timeoutGate = new Promise((resolve) => {
      releaseTimeoutRequest = resolve;
    });
    await failed.route(musicPattern, async (route) => {
      await timeoutGate;
      await route.continue();
    });
    await failed.locator('#sound').click();
    await failed.locator('#music-play').click();
    await failed.waitForFunction(
      () => window.__chillhill.music.error?.includes('too long'),
      undefined,
      { timeout: 20000 },
    );
    assert.equal(await failed.locator('#music-play').innerText(), 'Retry music');
    assert.equal(await failed.evaluate(() => window.__chillhill.music.playing), false);
    releaseTimeoutRequest();
    assert.equal(await failed.locator('#music-audio').getAttribute('src'), null);
    await failed.unroute(musicPattern);
    await failed.locator('#music-play').click();
    await playing(failed);
    assert.equal(await failed.evaluate(() => window.__chillhill.music.error), null);
  } finally {
    releaseTimeoutRequest();
    await failed.close();
  }

  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  mobile.on('pageerror', (error) => errors.push(error.message));
  try {
    await mobile.goto(origin);
    await ready(mobile);
    await mobile.locator('#sound').tap();
    const rect = await mobile.locator('#music-menu').boundingBox();
    assert.ok(rect.x >= 0 && rect.x + rect.width <= 390);
    assert.ok(rect.y >= 0 && rect.y + rect.height <= 844);
    await mobile.locator('#music-play').tap();
    await playing(mobile);
    await mobile.screenshot({ path: 'artifacts/music-panel-mobile.png' });
    await mobile.locator('#music-play').tap();
    assert.equal(await mobile.evaluate(() => window.__chillhill.music.playing), false);
    await mobile.locator('#music-volume').fill('0.18');
    assert.equal(await mobile.locator('#music-volume-value').innerText(), '18%');
    await mobile.locator('#close-music-menu').focus();
    await mobile.keyboard.press('Shift+Tab');
    assert.equal(await mobile.locator('#music-menu').isVisible(), false);
    assert.equal(await mobile.evaluate(() => document.activeElement?.id), 'sound');
  } finally {
    await mobile.close();
  }

  console.log(
    'PASS: three actual MP3s, natural-end playlist advance/wrap, skip/select/credits, opt-in playback, independent volume/ambience, garage continuity, hidden-tab pause, reload privacy, cancellation, error/timeout retry, and keyboard/mobile music panel.',
  );
}
