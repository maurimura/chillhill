import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { checkContrast } from './readability-check.mjs';

const textSelectors = [
  '#scoreboard-title',
  '#online-run .eyebrow',
  '#online-run h3',
  '#online-run p',
  '#online-run label',
  '#leaderboard-name',
  '.leaderboard-name-row button:not(:disabled)',
  '.scoreboard-tabs button',
  '#scoreboard-category-note',
  '.scoreboard-ride > strong',
  '.scoreboard-ride > span',
  '.scoreboard-points',
  '.scoreboard-empty .text-button',
];

export async function checkOnlineScoreboard(browser, origin, errors = []) {
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
        JSON.stringify({ treeDensity: 0, autoTime: false, autoWeather: false }),
      );
    });
    const bounds = async () => {
      const layout = await page.locator('#scoreboard-dialog').evaluate((dialog) => {
        const rect = dialog.getBoundingClientRect();
        return {
          x: rect.left,
          y: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: innerWidth,
          height: innerHeight,
          overflow: [...dialog.querySelectorAll('.scoreboard-body, .scoreboard-ride')].map(
            (element) => ({
              name: element.className,
              content: element.scrollWidth,
              width: element.clientWidth,
            }),
          ),
        };
      });
      assert.ok(
        layout.x >= 0 &&
          layout.y >= 0 &&
          layout.right <= layout.width &&
          layout.bottom <= layout.height,
        `worldwide dialog fits ${viewport.width}×${viewport.height}: ${JSON.stringify(layout)}`,
      );
      for (const element of layout.overflow)
        assert.ok(
          element.content <= element.width + 1,
          `${viewport.width}: ${element.name} has no horizontal overflow (${element.content}/${element.width})`,
        );
    };
    const close = async () => {
      await page.locator('#close-scoreboard').click();
      await page.waitForFunction(() => !window.__onlineHarness.view.open);
    };
    const begin = (options) =>
      page.evaluate((options) => window.__onlineHarness.begin(options), options);
    try {
      await page.goto(origin);
      await page.waitForFunction(() => window.__chillhill?.driveReady);
      await page.evaluate(() => document.fonts.ready);
      // Isolated view/API harness, not a writable game telemetry shortcut. The
      // real game's unused dialog is closed/removed only inside this test page;
      // the harness is built from the production classes and actual styles.
      await page.evaluate(async () => {
        const { scoringDefaults } = await import('/src/config/scoring.ts');
        const [
          { OnlineScoreboard },
          { ScoreboardView, resultsMarkup },
          { ScoreboardStore, validScoreRecord },
        ] = await Promise.all([
          import('/src/online-scoreboard.ts'),
          import('/src/scoreboard-view.ts'),
          import('/src/scoreboard.ts'),
        ]);
        const old = document.querySelector('#scoreboard-dialog');
        if (old?.open) old.close();
        old?.remove();
        const memory = new Map();
        const store = new ScoreboardStore({
          getItem: (key) => memory.get(key) ?? null,
          setItem: (key, value) => memory.set(key, value),
        });
        const record = (id, category = 'standard', index = 0) => ({
          version: scoringDefaults.version,
          id,
          seed: 43112,
          car: 'astra',
          cars: ['astra'],
          category,
          customReasons: category === 'standard' ? [] : ['setup'],
          finishedAt: '2026-09-07T12:00:00.000Z',
          score: 1950 - index * 50,
          earned: 2000 - index * 50,
          nearMissEarned: 1600 - index * 50,
          driftEarned: 400,
          driftSeconds: 20,
          bestDriftSeconds: 8,
          penalties: 50,
          nearMisses: 8,
          bestStreak: 3,
          shoulderTouches: 1,
          shoulderSeconds: 2,
          distance: 1609.344,
          duration: 120,
          topSpeed: 80,
          averageSpeed: 48,
        });
        if (!validScoreRecord(record('fixture'))) throw new Error('Invalid online test fixture');
        const harness = {
          options: {},
          calls: [],
          serial: 0,
          store,
          memory,
          releaseFinish: null,
          releaseName: null,
        };
        const response = (data) =>
          new Response(JSON.stringify(data), {
            headers: { 'Content-Type': 'application/json' },
          });
        const requester = async (url, init) => {
          const data = init?.body ? JSON.parse(init.body) : null;
          harness.calls.push({ url, data });
          if (url === '/api/runs') {
            if (harness.options.startOffline) throw new TypeError('Network unavailable');
            return response({
              runId: `session-${harness.serial}`,
              token: 'test-only-capability-never-public',
              expiresAt: '2099-01-01T00:00:00.000Z',
            });
          }
          if (url.endsWith('/finish')) {
            const result = harness.options.finish ?? { qualified: true, rank: 3 };
            if (harness.options.holdFinish)
              return new Promise((resolve) => {
                harness.releaseFinish = () => resolve(response(result));
              });
            return response(result);
          }
          if (url.endsWith('/name')) {
            if (harness.options.nameError) {
              harness.options.nameError = false;
              return new Response(JSON.stringify({ error: 'Could not save. Please try again.' }), {
                status: 503,
                headers: { 'Content-Type': 'application/json' },
              });
            }
            const result = harness.options.name ?? { qualified: true, rank: 3 };
            if (harness.options.holdName)
              return new Promise((resolve) => {
                harness.releaseName = () => resolve(response(result));
              });
            return response(result);
          }
          if (url.startsWith('/api/leaderboard?')) {
            if (harness.options.listOffline) throw new TypeError('Network unavailable');
            const category = new URL(url, location.origin).searchParams.get('category');
            return response({
              version: scoringDefaults.version,
              category,
              entries: Array.from({ length: 10 }, (_, index) =>
                harness.options.inline &&
                online.result?.status === 'saved' &&
                index === 2 &&
                category === harness.lastResult.record.category
                  ? {
                      name: harness.calls.filter((call) => call.url.endsWith('/name')).at(-1).data
                        .name,
                      record: harness.lastResult.record,
                    }
                  : {
                      name:
                        index === 0
                          ? '<img src=x onerror=window.bad=1>'
                          : index === 1
                            ? 'WWWWWWWWWWWWWWWWWWWW'
                            : `Road pal ${index + 1}`,
                      record: record(`public-${category}-${index}`, category, index),
                    },
              ),
            });
          }
          throw new Error(`Unexpected request ${url}`);
        };
        const online = new OnlineScoreboard(true, requester);
        const pause = document.querySelector('#pause-card');
        const host = document.querySelector('#run-leaderboard');
        const view = new ScoreboardView(() => {
          pause.hidden = !harness.options.inline || view.open;
        }, online);
        // Keep this isolated modal's events out of the unused game's shortcuts.
        // Native form submission, native Escape, and FocusScope still run.
        view.dialog.addEventListener('keydown', (event) => event.stopPropagation());
        harness.online = online;
        harness.view = view;
        harness.begin = async (options = {}) => {
          harness.options = options;
          harness.serial++;
          harness.releaseFinish = harness.releaseName = null;
          view.clearEmbedded();
          pause.hidden = true;
          const row = record(
            `completed-${harness.serial}`,
            options.category ?? 'standard',
            options.inline ? 2 : 0,
          );
          online.begin(row);
          const result = store.save(row);
          harness.lastResult = result;
          if (options.inline) {
            pause.classList.add('has-results', 'has-leaderboard');
            pause.hidden = false;
            document.querySelector('#pause-title').textContent = 'That was a good run.';
            document.querySelector('#pause-kicker').textContent = 'ONE MORE ROAD?';
            document.querySelector('#pause-copy').textContent =
              '8 near misses · 1.61 km driven. Try again, or take an Easy drive.';
            const summary = document.querySelector('#run-results');
            summary.hidden = false;
            summary.innerHTML = resultsMarkup(result, 'metric', true);
            document.querySelector('#open-scoreboard').hidden = true;
            host.hidden = false;
            view.embed(host, result, 'metric');
          } else view.show(row.category, result, 'metric');
          const completion = online.complete(row);
          if (!options.holdFinish) await completion;
        };
        window.__onlineHarness = harness;
      });

      await begin({ holdFinish: true, holdName: true });
      assert.equal(
        await page.locator('#scoreboard-storage, #refresh-leaderboard, .scoring-rules').count(),
        0,
        'no extra leaderboard footer',
      );
      assert.match(await page.locator('#online-run').innerText(), /Checking your place/);
      assert.equal(
        await page.locator('#leaderboard-name').count(),
        0,
        'no name before qualification',
      );
      await page.waitForFunction(() => !!window.__onlineHarness.releaseFinish);
      await page.evaluate(() => window.__onlineHarness.releaseFinish());
      await page.waitForFunction(() => window.__onlineHarness.online.result.status === 'qualified');
      assert.equal(
        await page
          .locator('#scoreboard-dialog')
          .evaluate((el) => el.contains(document.activeElement)),
        true,
        'asynchronous qualification keeps focus inside the modal',
      );
      await close();
      await page.evaluate(() => {
        const harness = window.__onlineHarness;
        harness.view.show('standard', harness.lastResult, 'metric');
      });
      assert.equal(
        await page.evaluate(() => document.activeElement?.id),
        'leaderboard-name',
        'opening a qualified result focuses name entry',
      );
      await page.locator('#leaderboard-name').fill('Astra pal');
      await page.evaluate(() => window.__onlineHarness.online.refresh('standard'));
      await page.waitForFunction(() => !window.__onlineHarness.online.loading);
      assert.equal(await page.locator('#leaderboard-name').inputValue(), 'Astra pal');
      await page.locator('#leaderboard-name').focus();
      await checkContrast(page, textSelectors);
      await bounds();
      await page.screenshot({ path: `artifacts/online-scoreboard-name-${viewport.width}.png` });
      for (let i = 0; i < 28; i++) {
        await page.keyboard.press(i < 14 ? 'Tab' : 'Shift+Tab');
        assert.equal(
          await page
            .locator('#scoreboard-dialog')
            .evaluate((el) => el.contains(document.activeElement)),
          true,
          'focus stays in the worldwide modal',
        );
      }
      await page.locator('#leaderboard-name').focus();
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => !!window.__onlineHarness.releaseName);
      assert.equal(
        await page.locator('#leaderboard-name').evaluate((input) => input.readOnly),
        true,
      );
      assert.equal(await page.evaluate(() => document.activeElement?.id), 'leaderboard-name');
      assert.equal(await page.locator('.leaderboard-name-row button').isDisabled(), true);
      await page.keyboard.press('Enter');
      assert.equal(
        await page.evaluate(
          () => window.__onlineHarness.calls.filter((call) => call.url.endsWith('/name')).length,
        ),
        1,
        'Enter submits once while saving',
      );
      assert.equal(
        await page.evaluate(
          () => window.__onlineHarness.calls.find((call) => call.url.endsWith('/name')).data.name,
        ),
        'Astra pal',
      );
      await page.evaluate(() => window.__onlineHarness.releaseName());
      await page.waitForFunction(() => window.__onlineHarness.online.result.status === 'saved');
      assert.equal(await page.locator('#leaderboard-name').count(), 0);
      assert.match(await page.locator('#online-run').innerText(), /on the board/);
      assert.equal(await page.locator('.scoreboard-row').count(), 10);
      assert.equal(
        await page.locator('.scoreboard-ride > strong').first().innerText(),
        '<img src=x onerror=window.bad=1>',
      );
      assert.equal(
        await page.locator('#scoreboard-dialog img').count(),
        0,
        'public names are plain text',
      );
      assert.equal(await page.evaluate(() => window.bad), undefined);
      assert.equal(
        (await page.locator('#scoreboard-dialog').innerHTML()).includes('test-only-capability'),
        false,
      );
      await bounds();
      await page.screenshot({ path: `artifacts/online-scoreboard-saved-${viewport.width}.png` });

      assert.equal(
        await page.locator('[data-score-source]').count(),
        0,
        'worldwide is the only board',
      );
      await page.locator('[data-score-category="custom"]').click();
      await page.waitForFunction(() => !window.__onlineHarness.online.loading);
      assert.equal(await page.locator('.scoreboard-row').count(), 10);
      assert.match(await page.locator('#scoreboard-category-note').innerText(), /Custom setups/);
      await checkContrast(page, textSelectors);
      await bounds();
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !window.__onlineHarness.view.open);
      assert.equal(
        await page.locator('#scoreboard-dialog').isVisible(),
        false,
        'native Escape closes',
      );

      await begin({ finish: { qualified: false, rank: null } });
      assert.equal(await page.locator('#leaderboard-name').count(), 0, 'no prompt outside top ten');
      assert.match(await page.locator('#online-run').innerText(), /Not quite/);
      await close();

      await begin({ holdName: true, name: { qualified: false, rank: null } });
      await page.locator('#leaderboard-name').fill('Road friend');
      await page.locator('.leaderboard-name-row button').click();
      await page.waitForFunction(() => !!window.__onlineHarness.releaseName);
      await page.evaluate(() => window.__onlineHarness.releaseName());
      await page.waitForFunction(
        () => window.__onlineHarness.online.result.status === 'not-qualified',
      );
      assert.equal(
        await page.locator('#leaderboard-name').count(),
        0,
        'rank lost removes name form',
      );
      assert.match(await page.locator('#online-run').innerText(), /Another driver moved ahead/);
      assert.equal(await page.evaluate(() => window.__onlineHarness.store.records.length), 3);
      await close();

      await begin({ nameError: true });
      await page.locator('#leaderboard-name').fill('Patient driver');
      await page.locator('#leaderboard-name').evaluate((input) => {
        input.dataset.identity = 'retry-draft';
      });
      await page.locator('.leaderboard-name-row button').click();
      await page.waitForFunction(() =>
        window.__onlineHarness.online.result.message.includes('Could not save'),
      );
      assert.equal(await page.locator('#leaderboard-name').inputValue(), 'Patient driver');
      assert.equal(
        await page.locator('#leaderboard-name').getAttribute('data-identity'),
        'retry-draft',
      );
      assert.match(await page.locator('#leaderboard-name-status').innerText(), /Please try again/);
      assert.equal(await page.locator('.is-pending-run').count(), 1);
      // The failure message grows the row. Reveal it before clicking so the
      // narrow viewport's focus-reveal scroll does not move Save mid-click.
      await page.locator('.is-pending-run').scrollIntoViewIfNeeded();
      await page.locator('.leaderboard-name-row button').click();
      await page.waitForFunction(() => window.__onlineHarness.online.result.status === 'saved');
      await close();

      await begin({ startOffline: true, listOffline: true });
      assert.equal(await page.locator('#leaderboard-name').count(), 0);
      assert.match(
        await page.locator('#online-run').innerText(),
        /started offline.*saved locally/s,
      );
      assert.equal(await page.evaluate(() => window.__onlineHarness.store.records.length), 5);
      assert.equal(
        await page.locator('.scoreboard-row').count(),
        0,
        'offline never replaces worldwide scores with a local board',
      );
      assert.match(await page.locator('#scoreboard-list').innerText(), /Network unavailable/);
      await bounds();
      await page.screenshot({ path: `artifacts/online-scoreboard-offline-${viewport.width}.png` });
      assert.equal(await page.locator('[data-leaderboard-retry]').isVisible(), true);
      await page.evaluate(() => {
        window.__onlineHarness.options.listOffline = false;
      });
      await page.locator('[data-leaderboard-retry]').click();
      await page.waitForFunction(() => !window.__onlineHarness.online.loading);
      assert.equal(await page.locator('.scoreboard-row').count(), 10);
      assert.equal(
        await page.locator('[data-leaderboard-retry]').count(),
        0,
        'retry only appears on a failed load',
      );
      assert.equal(await page.evaluate(() => document.activeElement?.id), 'scoreboard-title');
      await close();

      // The finished-run panel uses the very same live view, without opening a
      // second modal or clicking a publish link. All API requests stay mocked.
      await begin({ inline: true, holdFinish: true, holdName: true, category: 'custom' });
      assert.equal(
        await page
          .locator(
            '#run-leaderboard #scoreboard-storage, #run-leaderboard #refresh-leaderboard, #run-leaderboard .scoring-rules',
          )
          .count(),
        0,
      );
      assert.equal(await page.locator('#run-leaderboard').isVisible(), true);
      assert.equal(await page.locator('#scoreboard-dialog').isVisible(), false);
      await page.waitForFunction(() => !window.__onlineHarness.online.loading);
      assert.equal(await page.locator('#run-leaderboard .scoreboard-row').count(), 10);
      assert.equal(
        await page.locator('[data-score-category="custom"]').getAttribute('aria-pressed'),
        'true',
      );
      assert.equal(await page.locator('#leaderboard-name').count(), 0);
      await page.waitForFunction(() => !!window.__onlineHarness.releaseFinish);
      await page.evaluate(() => window.__onlineHarness.releaseFinish());
      await page.waitForFunction(() => document.activeElement?.id === 'leaderboard-name');
      assert.equal(await page.locator('#run-leaderboard #leaderboard-name').count(), 1);
      const fieldIdentity = await page.locator('#leaderboard-name').evaluate((input) => {
        input.dataset.identity = 'original';
        return input.dataset.identity;
      });
      await page.keyboard.type('Coastal pal');
      await page.evaluate(() => window.__onlineHarness.online.refresh('custom'));
      await page.waitForFunction(() => !window.__onlineHarness.online.loading);
      assert.equal(await page.locator('#leaderboard-name').inputValue(), 'Coastal pal');
      assert.equal(
        await page.locator('#leaderboard-name').getAttribute('data-identity'),
        fieldIdentity,
      );
      await page.evaluate(() => window.__onlineHarness.view.syncUnits('imperial'));
      assert.match(await page.locator('#scoreboard-list').textContent(), /1.00 mi/);
      assert.equal(await page.locator('#leaderboard-name').inputValue(), 'Coastal pal');
      await page.locator('#leaderboard-name').focus();
      const inlineLayout = await page.locator('#pause-card').evaluate((card) => {
        const rect = card.getBoundingClientRect();
        const summary = card.querySelector('.pause-summary').getBoundingClientRect();
        const board = card.querySelector('#run-leaderboard').getBoundingClientRect();
        return {
          fits:
            rect.left >= 0 &&
            rect.top >= -1 &&
            rect.right <= innerWidth + 1 &&
            rect.bottom <= innerHeight + 1,
          horizontalOverflow: card.scrollWidth > card.clientWidth + 1,
          sideBySide: board.left >= summary.right,
          stacked: board.top >= summary.bottom,
          visibleRows: card.querySelectorAll('#scoreboard-list li').length,
        };
      });
      assert.equal(inlineLayout.fits, true, JSON.stringify({ viewport, inlineLayout }));
      assert.equal(inlineLayout.horizontalOverflow, false);
      assert.equal(viewport.width > 760 ? inlineLayout.sideBySide : inlineLayout.stacked, true);
      await checkContrast(page, textSelectors);
      await page.screenshot({ path: `artifacts/run-leaderboard-name-${viewport.width}.png` });
      for (let i = 0; i < 24; i++) {
        await page.keyboard.press(i < 12 ? 'Tab' : 'Shift+Tab');
        assert.equal(
          await page
            .locator('#pause-card')
            .evaluate((card) => card.contains(document.activeElement)),
          true,
        );
      }
      await page.locator('#leaderboard-name').focus();
      const nameCalls = await page.evaluate(
        () => window.__onlineHarness.calls.filter((call) => call.url.endsWith('/name')).length,
      );
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => !!window.__onlineHarness.releaseName);
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => document.activeElement?.id), 'leaderboard-name');
      assert.equal(
        await page.evaluate(() => window.__chillhill.started),
        false,
        'name submission never starts a drive',
      );
      assert.equal(
        await page.evaluate(
          () => window.__onlineHarness.calls.filter((call) => call.url.endsWith('/name')).length,
        ),
        nameCalls + 1,
      );
      await page.evaluate(() => window.__onlineHarness.releaseName());
      await page.waitForFunction(
        () =>
          window.__onlineHarness.online.result.status === 'saved' &&
          !window.__onlineHarness.online.loading,
      );
      assert.match(
        await page.locator('#run-leaderboard .is-current-run').innerText(),
        /Coastal pal/,
      );
      assert.equal(await page.locator('#leaderboard-name').count(), 0);
      await page.keyboard.press('Enter');
      assert.equal(
        await page.evaluate(() => window.__chillhill.started),
        false,
        'post-submit Enter does not restart',
      );
      await page.locator('#pause-card').evaluate((card) => {
        card.scrollTop = 0;
      });
      await page.screenshot({ path: `artifacts/run-leaderboard-saved-${viewport.width}.png` });

      await begin({ inline: true, finish: { qualified: false, rank: null } });
      assert.equal(await page.locator('#leaderboard-name').count(), 0);
      assert.match(await page.locator('#run-leaderboard #online-run').innerText(), /Not quite/);
      await begin({ inline: true, startOffline: true, listOffline: true });
      assert.equal(await page.locator('#leaderboard-name').count(), 0);
      assert.match(await page.locator('#online-run').innerText(), /started offline/);
      assert.equal(await page.locator('#run-leaderboard .scoreboard-row').count(), 0);
      assert.match(await page.locator('#scoreboard-list').innerText(), /Network unavailable/);
      await page.evaluate(() => {
        window.__onlineHarness.view.dispose();
        window.__onlineHarness.online.dispose();
        delete window.__onlineHarness;
      });
    } finally {
      await page.close();
    }
  }
  console.log(
    'PASS: worldwide-only top ten, inline automatic name entry, async focus/trap/Escape, draft retention, safe Enter, public-name escaping, rank races, offline states, matching categories and four responsive viewports.',
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const browser = await chromium.launch({
    channel: process.env.CHROME_CHANNEL || 'chrome',
    headless: true,
  });
  const errors = [];
  try {
    await checkOnlineScoreboard(browser, process.env.TEST_URL || 'http://127.0.0.1:5173', errors);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
}
