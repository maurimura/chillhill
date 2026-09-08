import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// Exercise the built site through Wrangler, which applies public/_headers.
const target = new URL(process.env.CLOUDFLARE_TEST_URL || 'http://127.0.0.1:8787');
assert.ok(
  target.protocol === 'http:' &&
    ['localhost', '127.0.0.1'].includes(target.hostname) &&
    target.port &&
    !target.username &&
    !target.password,
  'Use a local Cloudflare preview for security checks.',
);
const browser = await chromium.launch({
  channel: process.env.CHROME_CHANNEL || 'chrome',
  headless: true,
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.securityViolations = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      window.securityViolations.push(event.effectiveDirective);
    });
  });
  const terrainWorker = page.waitForEvent('worker');
  const response = await page.goto(target.origin);
  assert.equal(response.status(), 200);
  const headers = await response.allHeaders();
  assert.match(headers['content-security-policy'], /script-src 'self'/);
  assert.equal(headers['x-frame-options'], 'DENY');
  assert.equal(headers['x-content-type-options'], 'nosniff');
  await page.locator('#open-car-menu').click();
  await page.locator('[data-car-thumbnail="astra"]:visible').waitFor();
  await page.locator('#open-garage').click();
  await page.locator('#garage-canvas canvas').waitFor();
  await page.locator('#back-drive').click();
  await page.locator('#start').click();
  await page.locator('#scene canvas').waitFor();
  assert.match((await terrainWorker).url(), /terrain\.worker/);
  await page.evaluate(() => document.fonts.ready);
  await page.locator('#sound').click();
  await page.locator('#music-play').click();
  await page.waitForFunction(() => {
    const audio = document.querySelector('#music-audio');
    return audio && !audio.paused && audio.currentTime > 0;
  });
  await page.locator('#music-play').click();
  assert.deepEqual(await page.evaluate(() => window.securityViolations), []);
  assert.deepEqual(errors, []);

  // These probes must be blocked by the browser, not just by an HTML sanitizer.
  await page.evaluate(() => {
    const script = document.createElement('script');
    script.textContent = 'window.securityProbeRan = true';
    document.body.append(script);
  });
  await page.waitForFunction(() => window.securityViolations.includes('script-src-elem'));
  assert.equal(await page.evaluate(() => window.securityProbeRan), undefined);
  assert.equal(
    await page.evaluate(() =>
      fetch('https://example.invalid/security-probe').then(
        () => false,
        () => true,
      ),
    ),
    true,
  );
  await page.waitForFunction(() => window.securityViolations.includes('connect-src'));
  console.log(
    'PASS: game, garage, terrain worker, fonts and music work under CSP; inline scripts and external connections are blocked.',
  );
} finally {
  await browser.close();
}
