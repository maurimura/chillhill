import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { selectGarageTool } from './garage-tools.mjs';

// Production build: tests the actual asynchronous country bootstrap, not DEV telemetry.
const origin = process.env.CLOUDFLARE_TEST_URL || 'http://127.0.0.1:8787';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const [locale, country, expected] of [
    ['en-US', 'AR', 'KM/H'],
    ['en-US', 'CA', 'KM/H'],
    ['es-AR', 'US', 'MPH'],
    ['es-AR', 'GB', 'MPH'],
    ['en', null, 'KM/H'],
  ]) {
    const page = await browser.newPage({ locale, viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/api/preferences', (route) => route.fulfill({ json: { country } }));
    await page.goto(origin);
    await page.waitForSelector('#scene canvas');
    await page.waitForFunction(
      (expected) => document.querySelector('#speed-unit')?.textContent === expected,
      expected,
    );
    assert.equal(await page.locator('#place').innerText(), 'THE SUNWASHED COAST');
    await page.locator('#open-settings').click();
    assert.equal(await page.locator('#maxSpeed').inputValue(), '110');
    assert.equal(await page.locator('#units').inputValue(), 'auto');
    assert.equal(
      await page.locator('#maxSpeed-value').innerText(),
      expected === 'KM/H' ? '110 km/h' : '68.4 mph',
    );
    await page.locator('#maxSpeed').fill('75');
    await page.reload();
    await page.waitForSelector('#scene canvas');
    await page.locator('#open-settings').click();
    assert.equal(
      await page.locator('#maxSpeed').inputValue(),
      '75',
      'saved choices survive new defaults',
    );
    await page.locator('#reset-settings').click();
    assert.equal(await page.locator('#maxSpeed').inputValue(), '110');
    await page.locator('#close-settings').click();
    await page.locator('#open-car-menu').click();
    assert.match(
      await page.locator('#car-spec').innerText(),
      expected === 'KM/H' ? /4.199 m long/ : /13.78 ft long/,
    );
    await page.locator('#open-garage').click();
    await selectGarageTool(page, 'details');
    assert.match(
      await page.locator('#garage-specs').innerText(),
      expected === 'KM/H' ? /4.199 m/ : /13.78 ft/,
    );
    assert.deepEqual(errors, []);
    await page.close();
  }
  const page = await browser.newPage({ locale: 'en-US' });
  let release;
  const wait = new Promise((resolve) => (release = resolve));
  await page.route('**/api/preferences', async (route) => {
    await wait;
    await route.fulfill({ json: { country: 'US' } });
  });
  await page.goto(origin);
  await page.waitForSelector('#scene canvas');
  await page.locator('#open-settings').click();
  await page.locator('#units').selectOption('metric');
  const received = page.waitForResponse((response) => response.url().endsWith('/api/preferences'));
  release();
  await received;
  await page.waitForFunction(() =>
    document.querySelector('#units option')?.textContent.includes('Imperial'),
  );
  assert.equal(
    await page.locator('#speed-unit').innerText(),
    'KM/H',
    'late country result cannot override manual choice',
  );
  await page.close();
  console.log(
    'PASS: production country beats browser language, shared HUD/menu/garage units, coast/110 defaults, saved choices, reset, and manual-choice race.',
  );
} finally {
  await browser.close();
}
