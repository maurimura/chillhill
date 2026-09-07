import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { checkContrast } from './readability-check.mjs';

export async function checkOffRoad(browser, origin, errors) {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
    { width: 320, height: 640 },
    { width: 844, height: 390 },
  ]) {
    const page = await browser.newPage({
      viewport,
      hasTouch: viewport.width < 650 || viewport.height < 600,
    });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      localStorage.setItem(
        'chillhill.settings.v1',
        JSON.stringify({
          landscape: 'desert',
          timeOfDay: 'sunset',
          weather: 'clear',
          roadWidth: 14,
          maxSpeed: 40,
          curves: 0.2,
          treeDensity: 0.2,
          autoTime: false,
          autoWeather: false,
        }),
      );
      const request = window.requestAnimationFrame.bind(window);
      const cancel = window.cancelAnimationFrame.bind(window);
      const pending = new Map();
      let serial = -1,
        time;
      window.requestAnimationFrame = (callback) => {
        if (callback.name !== 'frame') return request(callback);
        const id = serial--;
        pending.set(id, callback);
        return id;
      };
      window.cancelAnimationFrame = (id) => (id < 0 ? pending.delete(id) : cancel(id));
      window.__recoveryFrame = (dt = 1 / 30) => {
        time = (time ?? performance.now()) + dt * 1000;
        const callbacks = [...pending.values()];
        pending.clear();
        callbacks.forEach((callback) => callback(time));
      };
    });
    const snapshot = () => page.evaluate(() => window.__chillhill);
    const advance = (seconds) =>
      page.evaluate((seconds) => {
        for (let i = 0; i < Math.ceil(seconds * 30); i++) window.__recoveryFrame();
      }, seconds);
    const steerTo = (target, condition, seconds = 12) =>
      page.evaluate(
        async ({ target, condition, seconds }) => {
          const { roadAt } = await import('/src/game/route.ts');
          const press = (key, down) =>
            window.dispatchEvent(
              new KeyboardEvent(down ? 'keydown' : 'keyup', {
                code: `Key${key.toUpperCase()}`,
                key,
                bubbles: true,
              }),
            );
          press('w', true);
          for (let i = 0; i < seconds * 30; i++) {
            const game = window.__chillhill;
            const heading = game.state.headingOffset ?? 0;
            const desired = Math.max(-0.2, Math.min(0.2, (target - game.state.offset) * 0.18));
            const turn =
              (desired - heading) * 3 +
              roadAt(game.state.distance, game.settings).curvature * game.state.speed;
            press('a', turn < -0.025);
            press('d', turn > 0.025);
            window.__recoveryFrame();
            const next = window.__chillhill;
            if (
              next.challenge.phase !== 'racing' ||
              (condition === 'warning' && next.challenge.offRoad.excursion > 0.4) ||
              (condition === 'safe' && !next.challenge.offRoad.active)
            )
              break;
          }
          for (const key of ['w', 'a', 'd']) press(key, false);
          return window.__chillhill;
        },
        { target, condition, seconds },
      );
    try {
      await page.goto(origin);
      await page.waitForFunction(() => window.__chillhill?.driveReady);
      await page.locator('#start-challenge').click();
      await advance(3);
      let warning = await steerTo(7.2, 'warning');
      assert.equal(warning.challenge.phase, 'racing');
      assert.equal(warning.challenge.lives, 3, 'crossing the edge is recoverable');
      assert.ok(warning.challenge.offRoad.active);
      await advance(0.1);
      assert.equal(await page.locator('#road-recovery-warning').isVisible(), true);
      assert.equal(await page.locator('#recovery-cliff-sign').isVisible(), true);
      assert.equal(await page.locator('#recovery-road-sign').isVisible(), false);
      assert.equal(
        await page.locator('#road-recovery-warning').getAttribute('data-state'),
        'offroad',
      );
      assert.match(await page.locator('#road-recovery-instruction').innerText(), /Steer left/);
      assert.match(await page.locator('#road-recovery-time').innerText(), /\d\.\ds to recover/);
      assert.equal(await page.locator('#challenge-message').isVisible(), false);
      await checkContrast(page, [
        '#road-recovery-instruction',
        '#road-recovery-time',
        '#recovery-cliff-sign',
      ]);
      const box = await page.locator('#road-recovery-warning').boundingBox();
      assert.ok(
        box.x >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height,
      );
      const legend = (await page.locator('.driving-guide').isVisible())
        ? await page.locator('.driving-guide').boundingBox()
        : await page.locator('.touch-controls').boundingBox();
      if (await page.locator('.driving-guide').isVisible()) {
        assert.ok(box.y + box.height <= legend.y - 8, 'desktop indicators sit above the keys');
        assert.ok(Math.abs(box.x + box.width / 2 - viewport.width / 2) < 1);
      } else {
        assert.ok(
          box.x + box.width <= legend.x - 8,
          'touch warnings sit beside the pad, away from the road',
        );
        assert.ok(box.y >= viewport.height * 0.7, 'touch warnings stay at the bottom edge');
      }
      assert.notEqual(
        await page.locator('#road-recovery-meter').getAttribute('aria-valuenow'),
        '0',
      );
      await page.screenshot({
        path: `artifacts/offroad-warning-${viewport.width}.png`,
        animations: 'disabled',
      });

      await page.locator('#open-world-menu').click();
      const menu = await snapshot();
      await advance(8);
      assert.deepEqual(
        (await snapshot()).challenge.offRoad,
        menu.challenge.offRoad,
        'menus freeze the remaining budget',
      );
      await page.locator('#close-world-menu').click();
      await page.locator('#pause').click();
      const paused = await snapshot();
      await advance(8);
      assert.deepEqual(
        (await snapshot()).challenge.offRoad,
        paused.challenge.offRoad,
        'pause freezes the remaining budget',
      );
      await page.locator('#resume').click();
      const recovered = await steerTo(0, 'safe');
      assert.equal(recovered.challenge.phase, 'racing');
      assert.equal(recovered.challenge.lives, 3);
      assert.equal(recovered.challenge.offRoad.active, false, 'real steering saves the run');
      await advance(0.1);
      assert.equal(
        await page.locator('#road-recovery-warning').getAttribute('data-state'),
        'cooldown',
      );
      assert.equal(await page.locator('#recovery-cliff-sign').isVisible(), false);
      const compact = await page.evaluate(
        () => matchMedia('(max-width: 650px), (pointer: coarse)').matches,
      );
      assert.equal(
        await page.locator('#recovery-road-sign').isVisible(),
        !compact,
        'mobile cooldown uses a compact meter instead of a second sign',
      );
      assert.match(await page.locator('#road-recovery-time').innerText(), /Refill in/);
      assert.ok(
        (await snapshot()).challenge.offRoad.exposure > 0,
        'rejoining does not erase the spent budget',
      );
      await page.screenshot({ path: `artifacts/offroad-recovered-${viewport.width}.png` });

      await page.keyboard.down('s');
      await advance(1.5);
      await page.keyboard.up('s');
      await page.locator('#pause').click();
      const cooldownPaused = (await snapshot()).challenge.offRoad;
      await advance(8);
      assert.deepEqual(
        (await snapshot()).challenge.offRoad,
        cooldownPaused,
        'pause freezes the refill cooldown',
      );
      await page.locator('#resume').click();
      await advance(Math.max(0, 5 - cooldownPaused.rejoinTime) + 0.1);
      assert.equal(
        await page.locator('#road-recovery-warning').getAttribute('data-state'),
        'refilling',
      );
      assert.match(await page.locator('#road-recovery-time').innerText(), /4.0s ready/);
      assert.ok((await snapshot()).challenge.offRoad.exposure < cooldownPaused.exposure);
      await checkContrast(page, [
        '#road-recovery-instruction',
        '#road-recovery-time',
        '#recovery-road-sign',
      ]);
      await page.screenshot({ path: `artifacts/offroad-refilling-${viewport.width}.png` });
      await page.locator('#open-world-menu').click();
      const refillPaused = (await snapshot()).challenge.offRoad;
      await advance(8);
      assert.deepEqual(
        (await snapshot()).challenge.offRoad,
        refillPaused,
        'menus freeze gradual refill',
      );
      await page.locator('#close-world-menu').click();
      await advance(4);
      assert.equal((await snapshot()).challenge.offRoad.exposure, 0);
      assert.equal(await page.locator('#road-recovery-warning').isVisible(), false);

      // After the cooldown and full refill, a fresh excursion has a full budget. Stop on the verge and let it
      // expire: brake is not a way to pause the off-road rule.
      warning = await steerTo(7.2, 'warning');
      assert.equal(warning.challenge.phase, 'racing');
      assert.ok(warning.challenge.offRoad.remaining > 2);
      await page.keyboard.down('s');
      await page.evaluate(() => {
        for (let i = 0; i < 180 && window.__chillhill.challenge.phase === 'racing'; i++)
          window.__recoveryFrame();
      });
      await page.keyboard.up('s');
      const lost = await snapshot();
      assert.equal(lost.challenge.phase, 'falling');
      assert.equal(lost.challenge.lives, 2);
      assert.equal(lost.challenge.lastIncident, 'bounds');
      await advance(0.1);
      assert.equal(await page.locator('#incident-cliff-sign').isVisible(), true);
      assert.equal(await page.locator('#incident-crash-sign').isVisible(), false);
      await advance(2);
      assert.equal((await snapshot()).challenge.lives, 2);
      assert.equal((await snapshot()).challenge.offRoad.active, false);
    } finally {
      await page.close();
    }
  }
  console.log(
    'PASS: cliff signs above desktop keys / beside touch controls, live recovery, shared budget, compact mobile cooldown, five-second refill delay, pause/menu freeze, timeout and safe respawn across desktop/mobile/landscape.',
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await mkdir('artifacts', { recursive: true });
  const browser = await chromium.launch({
    channel: process.env.CHROME_CHANNEL || 'chrome',
    headless: true,
  });
  const errors = [];
  try {
    await checkOffRoad(browser, process.env.TEST_URL || 'http://127.0.0.1:5173', errors);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
}
