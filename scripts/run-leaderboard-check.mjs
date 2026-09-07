import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

// The real production bootstrap, controls and game-over lifecycle, with all
// API calls intercepted. Never submit test names to the deployed leaderboard.
const origin = process.env.CLOUDFLARE_TEST_URL || 'http://127.0.0.1:8787';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
await mkdir('artifacts', { recursive: true });
try {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
    { width: 320, height: 640 },
    { width: 844, height: 390 },
  ]) {
    const page = await browser.newPage({ viewport, locale: 'es-AR' });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    let finished,
      postedName,
      nameCalls = 0,
      releaseName;
    const saving = new Promise((resolve) => {
      releaseName = resolve;
    });
    const record = {
      version: 3,
      id: 'public-fixture',
      seed: 42,
      car: 'astra',
      cars: ['astra'],
      category: 'standard',
      customReasons: [],
      finishedAt: '2026-09-07T12:00:00.000Z',
      score: 800,
      earned: 825,
      nearMissEarned: 600,
      driftEarned: 225,
      driftSeconds: 8,
      bestDriftSeconds: 4,
      penalties: 25,
      nearMisses: 4,
      bestStreak: 2,
      shoulderTouches: 1,
      shoulderSeconds: 1,
      distance: 1609.344,
      duration: 120,
      topSpeed: 100,
      averageSpeed: 50,
    };
    await page.route('**/api/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/preferences') return route.fulfill({ json: { country: 'AR' } });
      if (url.pathname === '/api/runs')
        return route.fulfill({
          json: { runId: 'test-run', token: 'test-only', expiresAt: '2099-01-01T00:00:00Z' },
        });
      if (url.pathname.endsWith('/finish')) {
        finished = route.request().postDataJSON().record;
        return route.fulfill({ json: { qualified: true, rank: 2 } });
      }
      if (url.pathname.endsWith('/name')) {
        nameCalls++;
        postedName = route.request().postDataJSON().name;
        await saving;
        return route.fulfill({ json: { qualified: true, rank: 2 } });
      }
      if (url.pathname === '/api/leaderboard') {
        const category = url.searchParams.get('category');
        return route.fulfill({
          json: {
            version: 3,
            category,
            entries: Array.from({ length: 10 }, (_, i) =>
              postedName && i === 1
                ? { name: postedName, record: finished }
                : {
                    name: `Road friend ${i + 1}`,
                    record: {
                      ...record,
                      id: `public-${i}`,
                      category,
                      customReasons: category === 'standard' ? [] : ['setup'],
                    },
                  },
            ),
          },
        });
      }
      throw new Error(`Unexpected test request ${url.pathname}`);
    });
    await page.addInitScript(() => {
      localStorage.setItem(
        'chillhill.settings.v1',
        JSON.stringify({ treeDensity: 0, autoTime: false, autoWeather: false }),
      );
      const callbacks = new Map();
      let serial = 0,
        time;
      window.requestAnimationFrame = (callback) => {
        const id = ++serial;
        callbacks.set(id, callback);
        return id;
      };
      window.cancelAnimationFrame = (id) => callbacks.delete(id);
      window.__productionAdvance = (seconds) => {
        for (let i = 0; i < Math.ceil(seconds * 30); i++) {
          time = (time ?? performance.now()) + 1000 / 30;
          const pending = [...callbacks.values()];
          callbacks.clear();
          pending.forEach((callback) => callback(time));
        }
      };
    });
    try {
      await page.goto(origin);
      await page.waitForSelector('#scene canvas');
      assert.equal(
        await page.evaluate(() => window.__chillhill),
        undefined,
        'production has no developer telemetry',
      );
      await page.locator('#start-challenge').click();
      assert.equal(await page.locator('#open-scoreboard-hud').isEnabled(), true);
      for (let life = 0; life < 3; life++) {
        await page.keyboard.down('w');
        await page.keyboard.down('d');
        await page.evaluate(() => window.__productionAdvance(14));
        await page.keyboard.up('w');
        await page.keyboard.up('d');
      }
      await page.waitForSelector('#pause-card.has-leaderboard');
      await page.waitForFunction(
        () => document.activeElement?.id === 'leaderboard-name',
        undefined,
        { polling: 50 },
      );
      assert.equal(await page.locator('#scoreboard-dialog').isVisible(), false);
      assert.equal(await page.locator('[data-score-source]').count(), 0);
      assert.equal(await page.locator('#scoreboard-categories').isVisible(), false);
      assert.equal(await page.locator('#run-leaderboard .scoreboard-row').count(), 10);
      assert.equal(
        await page.locator('#scoreboard-storage, #refresh-leaderboard, .scoring-rules').count(),
        0,
      );
      assert.doesNotMatch(
        await page.locator('#pause-card').innerText(),
        /On this device|personal board|Saved in this browser/i,
      );
      await page.keyboard.type('Coastal friend');
      // Same mounted draft survives a trip to settings and a display-only change.
      await page.locator('#open-settings').click();
      await page.locator('#units').selectOption('imperial');
      await page.locator('#close-settings').click();
      assert.equal(await page.locator('#leaderboard-name').inputValue(), 'Coastal friend');
      assert.match(await page.locator('#run-results').innerText(), /mi/);
      await page.locator('#leaderboard-name').focus();
      const layout = await page.locator('#pause-card').evaluate((card) => {
        const a = card.getBoundingClientRect(),
          left = card.querySelector('.pause-summary').getBoundingClientRect(),
          right = card.querySelector('#run-leaderboard').getBoundingClientRect();
        return {
          fits:
            a.left >= 0 && a.top >= -1 && a.right <= innerWidth + 1 && a.bottom <= innerHeight + 1,
          overflow: card.scrollWidth > card.clientWidth + 1,
          columns: right.left >= left.right,
          stacked: right.top >= left.bottom,
        };
      });
      assert.equal(layout.fits, true, JSON.stringify({ viewport, layout }));
      assert.equal(layout.overflow, false);
      assert.equal(viewport.width > 760 ? layout.columns : layout.stacked, true);
      await page.screenshot({ path: `artifacts/production-run-leaderboard-${viewport.width}.png` });
      await page.keyboard.press('Enter');
      await page.waitForFunction(
        () => document.querySelector('#leaderboard-name')?.readOnly,
        undefined,
        { polling: 50 },
      );
      await page.keyboard.press('Enter');
      assert.equal(nameCalls, 1);
      assert.equal(postedName, 'Coastal friend');
      assert.equal(await page.locator('#pause-card').isVisible(), true);
      releaseName();
      await page.waitForFunction(
        () => document.querySelector('#online-run')?.textContent.includes('on the board'),
        undefined,
        { polling: 50 },
      );
      await page.waitForSelector('#scoreboard-list .is-current-run');
      assert.match(
        await page.locator('#scoreboard-list .is-current-run').innerText(),
        /Coastal friend/,
      );
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#pause-card').isVisible(), true, 'submit does not replay');
      await page.locator('#resume').click();
      assert.equal(await page.locator('#pause-card').isVisible(), false);
      assert.equal(await page.locator('#run-leaderboard').isVisible(), false);
      assert.equal(nameCalls, 1);
      assert.deepEqual(errors, []);
    } catch (error) {
      console.error({
        viewport,
        finished: !!finished,
        focus: await page.evaluate(() => document.activeElement?.id),
        status: await page.locator('#online-run').textContent(),
        errors,
      });
      await page.screenshot({ path: `artifacts/production-run-error-${viewport.width}.png` });
      throw error;
    } finally {
      releaseName();
      await page.close();
    }
  }
  console.log(
    'PASS: production game-over automatically shows worldwide top ten and name entry; no local/source UI; draft/unit preservation, safe Enter submission, updated rank, replay and four responsive viewports.',
  );
} finally {
  await browser.close();
}
