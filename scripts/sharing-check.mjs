import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// A crawler does not execute the game. Verify the original HTML and public PNGs.
const origin = process.env.TEST_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({
  channel: process.env.CHROME_CHANNEL || 'chrome',
  headless: true,
});
try {
  const page = await browser.newPage({
    javaScriptEnabled: false,
    userAgent: 'Slackbot-LinkExpanding 1.0',
  });
  const response = await page.goto(origin);
  assert.equal(response.status(), 200);
  const value = (selector) => page.locator(selector).getAttribute('content');
  assert.equal(await value('meta[property="og:type"]'), 'website');
  assert.equal(await value('meta[property="og:site_name"]'), 'chillhill');
  assert.equal(await value('meta[name="twitter:card"]'), 'summary_large_image');
  assert.equal(
    await page.locator('link[rel="canonical"]').getAttribute('href'),
    'https://chillhill.maurimura.dev/',
  );
  for (const selector of [
    'meta[property="og:title"]',
    'meta[property="og:description"]',
    'meta[property="og:image:alt"]',
    'meta[name="twitter:title"]',
  ])
    assert.ok((await value(selector)).length > 10);
  const image = await value('meta[property="og:image"]');
  assert.ok(image.startsWith('https://chillhill.maurimura.dev/'));
  assert.equal(await value('meta[name="twitter:image"]'), image);
  for (const [path, width, height] of [
    [new URL(image).pathname, 1200, 630],
    ['/social/chillhill-icon.png', 180, 180],
  ]) {
    const asset = await page.request.get(new URL(path, origin).href);
    assert.equal(asset.status(), 200);
    assert.match(asset.headers()['content-type'], /image\/png/);
    const bytes = await asset.body();
    assert.equal(bytes.toString('hex', 0, 8), '89504e470d0a1a0a');
    assert.equal(bytes.readUInt32BE(16), width);
    assert.equal(bytes.readUInt32BE(20), height);
    assert.ok(bytes.length > 1000 && bytes.length < 5_000_000);
  }
  console.log(
    'PASS: no-JavaScript crawler sees complete sharing tags, canonical URL, 1200×630 game image and 180×180 logo.',
  );
} finally {
  await browser.close();
}
