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
      await page.setViewportSize(viewport);
      await page.waitForTimeout(80);
      await page.locator('#restart').tap();
      await advance(0.1);
      const screenPad = await page.locator('#thumb-pad').boundingBox();
      const finger = async (type, x, y, dx = 0, dy = 0) => {
        const ended = ['touchEnd', 'touchCancel'].includes(type);
        await cdp.send('Input.dispatchTouchEvent', {
          type,
          touchPoints: ended ? [] : [{ id: 1, x, y }],
        });
        await page.waitForFunction(
          ({ ended, dx, dy, size }) => {
            const pad = document.getElementById('thumb-pad');
            const ring = document.getElementById('touch-gesture');
            const clamp = (value) => Math.max(-1, Math.min(1, value));
            return ended
              ? !pad.classList.contains('pressed') && ring.hidden
              : pad.classList.contains('pressed') &&
                  !ring.hidden &&
                  Math.abs(
                    parseFloat(pad.style.getPropertyValue('--thumb-x')) -
                      clamp(dx / (size * 0.46)) * size * 0.25,
                  ) < 0.1 &&
                  Math.abs(
                    parseFloat(pad.style.getPropertyValue('--thumb-y')) -
                      clamp(dy / (size * 0.38)) * size * 0.25,
                  ) < 0.1;
          },
          { ended, dx, dy, size: screenPad.width },
        );
      };
      // Both sides of the scene use a fresh, neutral origin, not the pad center.
      for (const fraction of [0.2, 0.78]) {
        const x = viewport.width * fraction,
          y = viewport.height * 0.55;
        await finger('touchStart', x, y);
        assert.equal((await advance(0.2)).speed, 0, 'contact alone never accelerates');
        await finger('touchMove', x + 20, y - 30, 20, -30);
        const right = await advance(0.5);
        assert.ok(right.speed > 1 && right.steering > 0.02 && right.steering < 0.4);
        await finger('touchMove', x - 20, y - 30, -20, -30);
        assert.ok(
          (await advance(0.5)).steering < -0.02,
          'relative left steering works from either side',
        );
        await finger('touchMove', x, y + 35, 0, 35);
        assert.equal((await advance(1)).speed, 0, 'screen drag can fully stop');
        const stopped = await advance(0.2);
        assert.equal(
          (await advance(0.3)).distance,
          stopped.distance,
          'holding the screen brake holds the car',
        );
        await finger('touchEnd');
      }
      assert.equal(await page.evaluate(() => scrollY), 0, 'driving never scrolls the page');
      assert.equal(
        await page.locator('#game-shell').evaluate((el) => getComputedStyle(el).touchAction),
        'none',
      );
      const x = viewport.width * 0.2,
        y = viewport.height * 0.55;
      await finger('touchStart', x, y);
      await finger('touchMove', x, y - 30, 0, -30);
      const powered = await advance(0.5);
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [
          { id: 1, x, y: y - 30 },
          { id: 2, x: viewport.width * 0.6, y },
        ],
      });
      // CDP touchEnd lists the lifted finger, not the contacts remaining down.
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [{ id: 2, x: viewport.width * 0.6, y }],
      });
      assert.equal(
        await page.locator('#touch-gesture').isVisible(),
        true,
        'a second finger cannot steal or release the gesture',
      );
      await finger('touchCancel');
      assert.ok(
        (await advance(0.4)).speed < powered.speed,
        'screen cancellation releases throttle',
      );

      // Captured gestures continue across controls without activating them.
      await finger('touchStart', x, y);
      const pause = await page.locator('#pause').boundingBox();
      const px = pause.x + pause.width / 2,
        py = pause.y + pause.height / 2;
      await finger('touchMove', px, py, px - x, py - y);
      await finger('touchEnd');
      assert.equal(await page.evaluate(() => window.__chillhill.paused), false);

      // Opening a menu or pausing releases the gesture. A dismissal touch is
      // consumed by the menu and must not restart driving midway through it.
      await page.locator('[data-quick-menu="car-menu"]').tap();
      assert.equal(
        await page.locator('#game-shell').evaluate((el) => getComputedStyle(el).touchAction),
        'auto',
      );
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ id: 1, x: 8, y: viewport.height - 8 }],
      });
      await page.waitForFunction(() => !window.__chillhill.quickMenu);
      assert.equal(
        await page.locator('#thumb-pad').evaluate((el) => el.classList.contains('pressed')),
        false,
      );
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

      await finger('touchStart', x, y);
      await finger('touchMove', x, y - 30, 0, -30);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#touch-gesture').isVisible(), false);
      const pausedState = await advance(0.1);
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ id: 1, x: x + 5, y: y - 35 }],
      });
      assert.equal((await advance(0.4)).distance, pausedState.distance);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      assert.equal(
        await page.locator('#game-shell').evaluate((el) => getComputedStyle(el).touchAction),
        'auto',
      );
      await page.locator('#pause-card [data-mode="challenge"]').tap();
      assert.equal(
        await page.locator('#thumb-pad').evaluate((el) => el.classList.contains('pressed')),
        false,
        'resuming never keeps an old gesture',
      );
      await finger('touchStart', x, y);
      await page.setViewportSize({ width: viewport.height, height: viewport.width });
      await page.waitForFunction(() => document.getElementById('touch-gesture').hidden);
      await finger('touchCancel');
      await page.setViewportSize(viewport);
      await page.waitForTimeout(80);
      await page.locator('#restart').tap();
      await finger('touchStart', x, y);
      await finger('touchMove', x + 20, y - 30, 20, -30);
      await page.screenshot({ path: `artifacts/mobile-ux-anywhere-${viewport.width}.png` });
      await finger('touchEnd');
    } finally {
      await page.close();
    }
  }
  assert.deepEqual(errors, []);
  console.log(
    'PASS: anywhere-on-screen neutral-origin steering, combined pedals, capture/cancel/rotation/pause/menu safety, optional fixed pad, compact HUD, readable edge warnings and five mobile/tablet viewports.',
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
