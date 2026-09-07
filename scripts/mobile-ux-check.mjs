import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { checkContrast } from './readability-check.mjs';

const overlaps = (a, b) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

export async function checkMobileUX(browser, origin, errors = []) {
  assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
  await mkdir('artifacts', { recursive: true });
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 320, height: 640 },
    { width: 844, height: 390 },
    { width: 568, height: 320 },
    { width: 1024, height: 768 },
  ]) {
    const page = await browser.newPage({
      viewport,
      isMobile: true,
      hasTouch: true,
      locale: 'es-AR',
    });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      localStorage.setItem(
        'chillhill.settings.v1',
        JSON.stringify({
          seed: 42,
          curves: 0,
          roadWidth: 14,
          treeDensity: 0,
          autoTime: false,
          autoWeather: false,
        }),
      );
      const native = requestAnimationFrame.bind(window),
        cancel = cancelAnimationFrame.bind(window);
      const pending = new Map();
      let serial = -1,
        time;
      window.requestAnimationFrame = (callback) => {
        if (callback.name !== 'frame') return native(callback);
        const id = serial--;
        pending.set(id, callback);
        return id;
      };
      window.cancelAnimationFrame = (id) => (id < 0 ? pending.delete(id) : cancel(id));
      window.__mobileAdvance = (seconds) => {
        for (let i = 0; i < Math.ceil(seconds * 30); i++) {
          time = (time ?? performance.now()) + 1000 / 30;
          const callbacks = [...pending.values()];
          pending.clear();
          callbacks.forEach((callback) => callback(time));
        }
      };
    });
    const advance = async (seconds) =>
      page.evaluate((seconds) => {
        window.__mobileAdvance(seconds);
        return window.__chillhill.state;
      }, seconds);
    try {
      await page.goto(origin);
      await page.waitForFunction(() => window.__chillhill?.driveReady);
      await page.evaluate(() => document.fonts.ready);
      await page.locator('#start-challenge').tap();
      await advance(0.1);
      assert.equal(await page.locator('.route-card').isVisible(), false);
      assert.equal(await page.locator('.thumb-hint').isVisible(), false);
      const pad = await page.locator('#thumb-pad').boundingBox();
      assert.ok(pad.width >= 108 && pad.height >= 108, 'the touch target remains generous');
      const selectors = [
        '.nav-identity',
        '.header-actions',
        '#challenge-hud',
        '.speed-card',
        '#thumb-pad',
      ];
      const protectedRoad = {
        x: viewport.width * 0.3,
        y: viewport.height * 0.32,
        width: viewport.width * 0.4,
        height: viewport.height * 0.4,
      };
      for (const score of ['0', '999', '999,999']) {
        await page.locator('#score').evaluate((el, score) => {
          el.textContent = score;
        }, score);
        const boxes = [];
        let area = 0;
        for (const selector of selectors) {
          const box = await page.locator(selector).boundingBox();
          assert.ok(
            box.x >= 0 &&
              box.y >= 0 &&
              box.x + box.width <= viewport.width &&
              box.y + box.height <= viewport.height,
            `${selector} fits at ${viewport.width}×${viewport.height}`,
          );
          for (const other of boxes)
            assert.ok(!overlaps(box, other), `${selector} does not overlap another control`);
          assert.ok(!overlaps(box, protectedRoad), `${selector} leaves the central road clear`);
          boxes.push(box);
          area += box.width * box.height;
        }
        assert.ok(
          area / (viewport.width * viewport.height) < 0.25,
          'at least 75% of the scene is outside HUD/control rectangles',
        );
        assert.ok((await page.locator('#challenge-hud').boundingBox()).height <= 38);
        assert.ok((await page.locator('.speed-card').boundingBox()).height <= 38);
        assert.equal(
          await page.locator('#challenge-hud').evaluate((el) => el.scrollWidth <= el.clientWidth),
          true,
          'large scores still fit',
        );
      }
      // Presentation-only fixtures. Actual off-road transitions are covered by offroad-check.
      for (const incident of ['offroad', 'crash', 'points']) {
        await page.evaluate((incident) => {
          const get = (id) => document.getElementById(id);
          get('road-recovery-warning').hidden = incident !== 'offroad';
          get('road-recovery-warning').dataset.state = 'offroad';
          get('recovery-cliff-sign').hidden = false;
          get('recovery-road-sign').hidden = true;
          get('road-recovery-instruction').textContent = 'Steer right back to the road';
          get('road-recovery-time').textContent = '3.9s to recover';
          get('challenge-message').hidden = incident !== 'crash';
          get('incident-copy').textContent = 'Traffic collision · 2 lives left';
          get('incident-cliff-sign').hidden = true;
          get('incident-road-sign').hidden = true;
          get('incident-crash-sign').hidden = false;
          get('score-feedback').hidden = false;
          get('score-feedback').textContent = '+123 · Near miss';
        }, incident);
        const selector =
          incident === 'offroad'
            ? '#road-recovery-warning'
            : incident === 'crash'
              ? '#challenge-message'
              : '#score-feedback';
        const box = await page.locator(selector).boundingBox();
        assert.ok(box.x >= 0 && box.y + box.height <= viewport.height);
        assert.ok(box.x + box.width <= pad.x - 8, 'signs sit to the left of the pad');
        assert.ok(!overlaps(box, protectedRoad), 'signs never cover the central road');
        assert.equal(
          await page.locator('#score-feedback').isVisible(),
          incident === 'points',
          'safety warnings take priority over score popups',
        );
        await checkContrast(page, [selector, '.pad-up', '.pad-down', '#lives', '#score']);
        await page.screenshot({ path: `artifacts/mobile-ux-${incident}-${viewport.width}.png` });
      }
      await advance(0.1); // restore real HUD state
      const cdp = await page.context().newCDPSession(page);
      const touch = async (type, x = 0.5, y = 0.2) => {
        const ended = ['touchEnd', 'touchCancel'].includes(type);
        await cdp.send('Input.dispatchTouchEvent', {
          type,
          touchPoints: ended
            ? []
            : [{ id: 1, x: pad.x + pad.width * x, y: pad.y + pad.height * y }],
        });
        // Chromium may coalesce pointer moves until its next native frame;
        // wait for the real input event before advancing the simulated game.
        await page.waitForFunction(
          ({ ended, offset }) => {
            const element = document.getElementById('thumb-pad');
            return ended
              ? !element.classList.contains('pressed')
              : element.classList.contains('pressed') &&
                  Math.abs(parseFloat(element.style.getPropertyValue('--thumb-x')) - offset) < 0.1;
          },
          { ended, offset: Math.max(-1, Math.min(1, (x - 0.5) / 0.46)) * pad.width * 0.25 },
        );
      };
      await touch('touchStart');
      assert.ok((await advance(1)).speed > 3, 'one-thumb throttle starts Drift king');
      await touch('touchMove', 0.7, 0.2);
      const correction = await advance(0.3);
      assert.ok(
        correction.steering > 0.04 && correction.steering < 0.3,
        'small thumb moves produce gentle corrections',
      );
      await touch('touchMove', 0.99, 0.2);
      const full = await advance(0.5);
      assert.ok(
        full.steering > 0.85,
        `the pad edge retains full turning authority: ${JSON.stringify({ viewport, full })}`,
      );
      await touch('touchMove', 0.5, 0.9);
      assert.equal((await advance(1.5)).speed, 0, 'braking still stops completely');
      const stopped = await advance(0.3);
      assert.equal((await advance(0.3)).distance, stopped.distance);
      await touch('touchCancel');
      assert.equal((await advance(0.3)).speed, 0, 'cancelled input does not restart throttle');
      await touch('touchStart');
      const held = await advance(0.5);
      await page.setViewportSize({ width: viewport.height, height: viewport.width });
      await page.waitForTimeout(80);
      assert.ok((await advance(0.4)).speed < held.speed, 'rotation releases the old held pedal');
      await touch('touchCancel');
      await page.keyboard.down('d');
      assert.ok((await advance(0.5)).steering > 0.85, 'keyboard steering is not softened');
      await page.keyboard.up('d');
    } finally {
      await page.close();
    }
  }
  assert.deepEqual(errors, []);
  console.log(
    'PASS: forgiving touch corrections with full edge steering, throttle/brake/cancel/rotation, compact HUD, readable edge warnings, clear central road and five mobile/tablet viewports.',
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const browser = await chromium.launch({
    channel: process.env.CHROME_CHANNEL || 'chrome',
    headless: true,
  });
  try {
    await checkMobileUX(browser, process.env.TEST_URL || 'http://127.0.0.1:5173');
  } finally {
    await browser.close();
  }
}
