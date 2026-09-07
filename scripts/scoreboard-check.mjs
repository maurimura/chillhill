import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { checkContrast } from './readability-check.mjs';

// Local Vite intentionally has no leaderboard UI. Production worldwide view
// behavior is covered by online-scoreboard-check and run-leaderboard-check.
export async function checkScoreboard(browser, origin, errors) {
  await mkdir('artifacts', { recursive: true });
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
    { width: 320, height: 640 },
    { width: 844, height: 390 },
  ]) {
    const page = await browser.newPage({ viewport, locale: 'es-AR' });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      localStorage.setItem(
        'chillhill.settings.v1',
        JSON.stringify({ treeDensity: 0.2, autoTime: false, autoWeather: false }),
      );
      const request = requestAnimationFrame.bind(window),
        cancel = cancelAnimationFrame.bind(window);
      const callbacks = new Map();
      let serial = -1,
        time;
      window.requestAnimationFrame = (callback) => {
        if (callback.name !== 'frame') return request(callback);
        const id = serial--;
        callbacks.set(id, callback);
        return id;
      };
      window.cancelAnimationFrame = (id) => (id < 0 ? callbacks.delete(id) : cancel(id));
      window.__scoreAdvance = (seconds) => {
        for (let i = 0; i < Math.ceil(seconds * 30); i++) {
          time = (time ?? performance.now()) + 1000 / 30;
          const pending = [...callbacks.values()];
          callbacks.clear();
          pending.forEach((callback) => callback(time));
        }
      };
    });
    const snapshot = () => page.evaluate(() => window.__chillhill);
    const advance = (seconds) =>
      page.evaluate((seconds) => window.__scoreAdvance(seconds), seconds);
    try {
      await page.goto(origin);
      await page.waitForFunction(() => window.__chillhill?.driveReady);
      await page.locator('#start-challenge').click();
      await advance(3);
      assert.equal((await snapshot()).scoreRun.category, 'standard');
      assert.equal(await page.locator('#open-scoreboard-hud').isDisabled(), true);
      await page.locator('#pause').click();
      assert.equal(await page.locator('#open-scoreboard').isVisible(), false);
      await page.locator('#open-settings').click();
      const before = await snapshot();
      await page.locator('#units').selectOption('imperial');
      assert.deepEqual((await snapshot()).challenge, before.challenge);
      assert.equal((await snapshot()).scoreRun.category, 'standard');
      await page.locator('#close-settings').click();
      await page.locator('#resume').click();
      // A real three-life run using normal controls, never writable telemetry.
      for (let lives = 2; lives >= 0; lives--) {
        await page.keyboard.down('w');
        await page.keyboard.down('d');
        await advance(14);
        await page.keyboard.up('w');
        await page.keyboard.up('d');
        assert.equal((await snapshot()).challenge.lives, lives);
      }
      const finished = await snapshot();
      assert.equal(finished.challenge.phase, 'gameover');
      assert.equal(finished.runResult.record.score, Math.round(finished.challenge.score.points));
      assert.equal(finished.runResult.record.category, 'standard');
      assert.equal(await page.locator('#run-leaderboard').isVisible(), false);
      assert.equal(await page.locator('#scoreboard-dialog').isVisible(), false);
      assert.equal(await page.locator('#open-scoreboard').isVisible(), false);
      assert.match(await page.locator('#run-results').innerText(), /mi/);
      assert.doesNotMatch(
        await page.locator('#run-results').innerText(),
        /personal|browser|device|board/i,
      );
      const bounds = await page.locator('#pause-card').evaluate((card) => {
        const rect = card.getBoundingClientRect();
        return (
          rect.left >= 0 &&
          rect.top >= 0 &&
          rect.right <= innerWidth &&
          rect.bottom <= innerHeight &&
          card.scrollWidth <= card.clientWidth + 1
        );
      });
      assert.equal(bounds, true, `${viewport.width}: run summary fits`);
      await checkContrast(page, [
        '.result-score',
        '.result-stats dt',
        '.result-stats dd',
        '.result-heading .eyebrow',
      ]);
      await page.screenshot({ path: `artifacts/score-results-${viewport.width}.png` });
      await page.locator('#resume').click();
      assert.equal((await snapshot()).challenge.score.points, 0);
      assert.equal((await snapshot()).runResult, null);
      await page.locator('#open-car-menu').click();
      await page.locator('[data-car="renault-12"]').click();
      await page.locator('#close-car-menu').click();
      assert.equal((await snapshot()).scoreRun.category, 'custom');
      assert.equal(
        await page.evaluate(
          () => JSON.parse(localStorage.getItem('chillhill.scores.v3')).records.length,
        ),
        1,
        'unfinished runs never save',
      );
    } finally {
      await page.close();
    }
  }
  console.log(
    'PASS: local development shows scores but no leaderboard; real completed runs, replay, units/category invariance, private retention and responsive summaries.',
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const browser = await chromium.launch({
    channel: process.env.CHROME_CHANNEL || 'chrome',
    headless: true,
  });
  const errors = [];
  try {
    await checkScoreboard(browser, process.env.TEST_URL || 'http://127.0.0.1:5173', errors);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
}
