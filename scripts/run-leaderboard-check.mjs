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
    { width: 390, height: 700 },
    { width: 320, height: 568 },
    { width: 844, height: 300 },
    { width: 568, height: 260 },
  ]) {
    const mobile = viewport.width !== 1440;
    const rank =
      viewport.width === 390 ? 1 : viewport.width === 320 || viewport.width === 568 ? 10 : 5;
    const page = await browser.newPage({
      viewport,
      locale: 'es-AR',
      hasTouch: mobile,
      isMobile: mobile,
    });
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
        return route.fulfill({ json: { qualified: true, rank } });
      }
      if (url.pathname.endsWith('/name')) {
        nameCalls++;
        postedName = route.request().postDataJSON().name;
        await saving;
        return route.fulfill({ json: { qualified: true, rank } });
      }
      if (url.pathname === '/api/leaderboard') {
        const category = url.searchParams.get('category');
        return route.fulfill({
          json: {
            version: 3,
            category,
            entries: Array.from({ length: 10 }, (_, i) =>
              postedName && i === rank - 1
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
        (mobile) =>
          mobile
            ? document.activeElement?.classList.contains('is-pending-run')
            : document.activeElement?.id === 'leaderboard-name',
        mobile,
        { polling: 50 },
      );
      assert.equal(await page.locator('#scoreboard-dialog').isVisible(), false);
      assert.equal(await page.locator('[data-score-source]').count(), 0);
      assert.equal(await page.locator('#scoreboard-categories').isVisible(), false);
      await page.waitForFunction(
        () => document.querySelectorAll('#run-leaderboard .scoreboard-row').length === 10,
        undefined,
        { polling: 50 },
      );
      assert.equal(await page.locator('#run-leaderboard .scoreboard-row').count(), 10);
      assert.deepEqual(
        await page.locator('#scoreboard-list .scoreboard-rank').allTextContents(),
        Array.from({ length: 10 }, (_, index) => String(index + 1)),
      );
      assert.equal(await page.locator('#online-run form').count(), 0, 'no separate entry card');
      assert.equal(
        await page
          .locator('#scoreboard-list > li')
          .nth(rank - 1)
          .locator('#leaderboard-name')
          .count(),
        1,
      );
      assert.equal(
        await page.locator('.is-pending-run .scoreboard-rank').innerText(),
        String(rank),
      );
      const visibleEntry = async () =>
        page.locator('#scoreboard-list').evaluate((list) => {
          const board = list.getBoundingClientRect();
          const card = document.getElementById('pause-card').getBoundingClientRect();
          const input = document.getElementById('leaderboard-name').getBoundingClientRect();
          const button = list.querySelector('button[type="submit"]').getBoundingClientRect();
          return [input, button].every(
            (rect) =>
              rect.top >= board.top - 1 &&
              rect.bottom <= board.bottom + 1 &&
              rect.left >= card.left &&
              rect.right <= card.right,
          );
        });
      assert.equal(
        await visibleEntry(),
        true,
        `rank ${rank} input and Save fit without scrolling the whole dialog`,
      );
      assert.equal(
        await page.locator('#scoreboard-storage, #refresh-leaderboard, .scoring-rules').count(),
        0,
      );
      assert.doesNotMatch(
        await page.locator('#pause-card').innerText(),
        /On this device|personal board|Saved in this browser/i,
      );
      await page.locator('#leaderboard-name').fill('Coastal friend');
      // Same mounted draft survives a trip to settings and a display-only change.
      await page.locator('#open-settings').click();
      await page.locator('#units').selectOption('imperial');
      await page.locator('#close-settings').click();
      await page.waitForSelector('#pause-card.has-leaderboard', { state: 'visible' });
      assert.equal(await page.locator('#leaderboard-name').inputValue(), 'Coastal friend');
      assert.match(await page.locator('#run-results').textContent(), /mi/);
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
      assert.equal(
        viewport.width > 760 || viewport.width > viewport.height ? layout.columns : layout.stacked,
        true,
      );
      assert.equal(
        await page
          .locator('#pause-card')
          .evaluate((card) => card.scrollHeight <= card.clientHeight + 1),
        true,
        'the sheet itself does not crop or scroll',
      );
      if (mobile) {
        assert.equal(await page.locator('.touch-controls').isVisible(), false);
        assert.equal(
          await page.locator('.pause-summary').evaluate((summary) => {
            const box = summary.getBoundingClientRect();
            return [...summary.querySelectorAll('[data-mode]')].every((button) => {
              const rect = button.getBoundingClientRect();
              return (
                rect.bottom <= box.bottom + 1 &&
                rect.left >= box.left &&
                rect.right <= box.right + 1 &&
                button.scrollWidth <= button.clientWidth + 1
              );
            });
          }),
          true,
          'both replay buttons fit without a cropped bottom edge',
        );
        await page.locator('.result-details > summary').focus();
        await page.keyboard.press('Enter');
        assert.equal(
          await page.locator('#pause-card').isVisible(),
          true,
          'Enter on run details does not restart',
        );
        await page.waitForFunction(
          () => {
            const list = document.getElementById('scoreboard-list').getBoundingClientRect();
            const field = document.getElementById('leaderboard-name').getBoundingClientRect();
            return field.bottom <= list.bottom + 1 && field.top >= list.top - 1;
          },
          undefined,
          { polling: 50 },
        );
        assert.equal(await visibleEntry(), true, 'expanded details leave the board accessible');
        await page.locator('.result-details > summary').click();
      }
      await page.screenshot({ path: `artifacts/production-run-leaderboard-${viewport.width}.png` });
      if (viewport.width === 390 || viewport.width === 320) {
        await page.evaluate(() => {
          Object.defineProperty(visualViewport, 'height', { configurable: true, value: 330 });
          visualViewport.dispatchEvent(new Event('resize'));
        });
        assert.equal(
          await page.locator('.pause-summary').isVisible(),
          false,
          'keyboard leaves room for the editable board',
        );
        assert.equal(await visibleEntry(), true);
        assert.ok(
          await page
            .locator('#pause-card')
            .evaluate((el) => el.getBoundingClientRect().bottom <= 330),
        );
        await page.evaluate(() => {
          delete visualViewport.height;
          visualViewport.dispatchEvent(new Event('resize'));
        });
      }
      await page.locator('#leaderboard-name').focus();
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
      assert.equal(
        await page.locator('#scoreboard-list .is-current-run').evaluate((row) => {
          const box = row.getBoundingClientRect(),
            list = row.parentElement.getBoundingClientRect();
          return box.top >= list.top - 1 && box.bottom <= list.bottom + 1;
        }),
        true,
        'the saved name remains visible in its ranked row',
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
    'PASS: ranked inline name entry at #1/#5/#10, five desktop/mobile/short-landscape viewports, keyboard-sized viewport, expandable details, preserved drafts, safe Enter saving, updated rank and replay. All APIs mocked locally.',
  );
} finally {
  await browser.close();
}
