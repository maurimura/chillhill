import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';

/** Advance the actual application's RAF clock without waiting half an hour. */
export async function checkWorldClock(browser, origin, errors) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem(
      'chillhill.settings.v1',
      JSON.stringify({
        timeOfDay: 'day',
        season: 'summer',
        weather: 'clear',
        autoTime: true,
        autoSeasons: true,
        autoWeather: true,
        dayDuration: 600,
        seasonDays: 3,
        weatherDuration: 210,
      }),
    );
    const request = window.requestAnimationFrame.bind(window);
    const cancel = window.cancelAnimationFrame.bind(window);
    const callbacks = new Map();
    let serial = -1;
    let time;
    window.requestAnimationFrame = (callback) => {
      if (callback.name !== 'frame') return request(callback);
      const id = serial--;
      callbacks.set(id, callback);
      return id;
    };
    window.cancelAnimationFrame = (id) => {
      if (id < 0) callbacks.delete(id);
      else cancel(id);
    };
    window.__stepWorldFrame = (seconds) => {
      if (!callbacks.size) throw new Error('The app frame was not captured');
      time = (time ?? performance.now()) + seconds * 1000;
      const pending = [...callbacks.values()];
      callbacks.clear();
      pending.forEach((callback) => callback(time));
    };
  });
  const advance = async (seconds) => {
    await page.evaluate((seconds) => window.__stepWorldFrame(seconds), seconds);
    return page.evaluate(() => window.__chillhill);
  };
  const saved = () => page.evaluate(() => localStorage.getItem('chillhill.settings.v1'));
  const snapshot = () => page.evaluate(() => window.__chillhill);
  const clock = () => page.evaluate(() => window.__chillhill.worldClock);
  const openTiming = async () => {
    await page.locator('#open-settings').click();
    await page
      .locator('#world-autoTime')
      .evaluate((input) => (input.closest('details').open = true));
  };
  const duration = async (id, value) => {
    const input = page.locator(`#world-${id}`);
    await input.fill(String(value));
    await input.dispatchEvent('change');
  };
  try {
    await page.goto(origin);
    await page.waitForFunction(() => window.__chillhill?.driveReady);
    await advance(0);
    const originalSave = await saved();
    await advance(600);
    assert.equal((await clock()).elapsedSeconds, 0, 'the intro does not age the world');
    await page.locator('#start').click();
    assert.equal((await advance(149)).settings.timeOfDay, 'day');
    assert.equal((await advance(1)).settings.timeOfDay, 'sunset');
    assert.equal((await snapshot()).settings.weather, 'clear', 'daylight does not force weather');
    const weather = await advance(60);
    assert.notEqual(weather.settings.weather, 'clear');
    assert.equal(weather.settings.timeOfDay, 'sunset');
    assert.equal(weather.worldClock.weatherChanges, 1);
    assert.equal(await saved(), originalSave, 'automatic world changes do not rewrite preferences');

    await page.locator('#pause').click();
    const paused = await clock();
    await advance(2000);
    assert.deepEqual(await clock(), paused, 'pause freezes every world clock');
    await page.keyboard.press('Enter');
    assert.equal((await advance(10)).worldClock.elapsedSeconds, 220);
    await page.locator('#open-world-menu').click();
    const menuClock = await clock();
    await advance(1000);
    assert.deepEqual(await clock(), menuClock, 'quick menus freeze every world clock');
    await page.locator('#world-timeOfDay').selectOption('day');
    await page.locator('#world-season').selectOption('winter');
    await page.locator('#world-weather').selectOption('clear');
    assert.equal((await clock()).phaseSeconds, 0, 'manual phase starts a fresh interval');
    assert.equal((await clock()).seasonProgress, 0, 'manual season starts a fresh interval');
    assert.equal((await clock()).weatherProgress, 0, 'manual weather starts a fresh interval');

    await openTiming();
    await page.locator('#world-autoWeather').selectOption('false');
    await duration('dayDuration', 10);
    const settingsClock = await clock();
    const handPickedSave = await saved();
    await advance(2000);
    assert.deepEqual(await clock(), settingsClock, 'advanced settings freeze world time');
    await page.locator('#close-settings').click();
    for (const phase of ['sunset', 'night', 'dawn', 'day']) {
      const next = await advance(150);
      assert.equal(next.settings.timeOfDay, phase);
      assert.equal(next.settings.season, 'winter');
      assert.equal(next.settings.weather, 'clear', 'weather can be held while time moves');
    }
    assert.equal((await clock()).daysCompleted, 1);
    const season = await advance(1200);
    assert.equal(season.worldClock.daysCompleted, 3);
    assert.equal(season.settings.season, 'spring');
    assert.equal(season.settings.timeOfDay, 'day');
    assert.equal(await saved(), handPickedSave, 'automatic seasons also stay transient');

    await page.locator('#open-car-menu').click();
    await page.locator('#open-garage').click();
    await page.waitForFunction(() => window.__chillhill.view === 'garage');
    const garageClock = await clock();
    await advance(2000);
    assert.deepEqual(await clock(), garageClock, 'garage work never ages the driving world');
    await page.locator('#back-drive').click();
    await page.waitForFunction(() => window.__chillhill.view === 'drive');
    await advance(10);
    assert.equal((await clock()).elapsedSeconds, garageClock.elapsedSeconds + 10);

    await openTiming();
    await page.locator('#world-autoTime').selectOption('false');
    await page.locator('#world-autoWeather').selectOption('true');
    await duration('weatherDuration', 3.5);
    await page.locator('#close-settings').click();
    const heldPhase = await clock();
    const independently = await advance(210);
    assert.equal(independently.worldClock.phaseSeconds, heldPhase.phaseSeconds);
    assert.equal(independently.worldClock.daysCompleted, heldPhase.daysCompleted);
    assert.equal(independently.worldClock.weatherChanges, heldPhase.weatherChanges + 1);
    assert.equal(independently.worldClock.nextPhaseIn, null);

    await page.locator('#open-world-menu').click();
    await page.locator('#world-weather').selectOption('clear');
    await page.locator('#world-timeOfDay').selectOption('dawn');
    await page.locator('#close-world-menu').click();
    assert.equal((await advance(209)).settings.weather, 'clear');
    assert.notEqual((await advance(1)).settings.weather, 'clear');
    assert.equal((await snapshot()).settings.timeOfDay, 'dawn');

    await openTiming();
    await page.locator('#world-autoWeather').selectOption('false');
    await page.locator('#world-autoTime').selectOption('true');
    await duration('dayDuration', 1);
    await duration('seasonDays', 1);
    await page.locator('#close-settings').click();
    const beforeShortDay = await snapshot();
    const shortDay = await advance(60);
    assert.equal(shortDay.settings.dayDuration, 60, 'UI minutes become stored seconds');
    assert.equal(shortDay.settings.timeOfDay, 'dawn');
    assert.equal(shortDay.settings.season, 'summer');
    assert.equal(shortDay.worldClock.daysCompleted, beforeShortDay.worldClock.daysCompleted + 1);
    assert.equal(shortDay.worldClock.weatherChanges, beforeShortDay.worldClock.weatherChanges);
    assert.ok(Number.isFinite(shortDay.environment.headlight), 'dawn lighting remains finite');
  } finally {
    await page.close();
  }
  console.log(
    'PASS: actual app clock cycles every 150s/600s, changes seasons after 3 days, independent weather, intro/pause/menu/garage freezing, manual timer rebasing, duration controls, held clocks, and transient save behavior.',
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const browser = await chromium.launch({
    channel: process.env.CHROME_CHANNEL || 'chrome',
    headless: true,
  });
  try {
    const errors = [];
    await checkWorldClock(browser, process.env.TEST_URL || 'http://127.0.0.1:5173', errors);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
}
