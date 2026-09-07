import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// A crawler does not execute the game. Verify the original HTML and public PNGs.
const origin = process.env.TEST_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({
  channel: process.env.CHROME_CHANNEL || 'chrome',
  headless: true,
});
try {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    userAgent: 'Slackbot-LinkExpanding 1.0',
  });
  const page = await context.newPage();
  const response = await page.goto(origin);
  assert.equal(response.status(), 200);
  const value = (selector) => page.locator(selector).getAttribute('content');
  const title = await page.title();
  const description = await value('meta[name="description"]');
  assert.match(title, /^chillhill — .+driving game$/);
  assert.match(description, /relaxing 3D driving game/);
  assert.match(description, /free in your browser/);
  assert.ok(description.length >= 80 && description.length <= 200);
  assert.equal(await value('meta[name="application-name"]'), 'chillhill');
  assert.equal(await value('meta[property="og:type"]'), 'website');
  assert.equal(await value('meta[property="og:site_name"]'), 'chillhill');
  assert.equal(await value('meta[property="og:locale"]'), 'en_US');
  assert.equal(await value('meta[property="og:url"]'), 'https://chillhill.maurimura.dev/');
  assert.equal(await value('meta[name="twitter:card"]'), 'summary_large_image');
  assert.equal(
    await page.locator('link[rel="canonical"]').getAttribute('href'),
    'https://chillhill.maurimura.dev/',
  );
  for (const selector of ['meta[property="og:title"]', 'meta[name="twitter:title"]'])
    assert.equal(await value(selector), title);
  for (const selector of ['meta[property="og:description"]', 'meta[name="twitter:description"]'])
    assert.equal(await value(selector), description);
  const image = await value('meta[property="og:image"]');
  assert.equal(image, 'https://chillhill.maurimura.dev/social/chillhill-coast-v2.png');
  assert.equal(await value('meta[property="og:image:secure_url"]'), image);
  assert.equal(await value('meta[property="og:image:type"]'), 'image/png');
  assert.equal(await value('meta[property="og:image:width"]'), '1200');
  assert.equal(await value('meta[property="og:image:height"]'), '630');
  assert.equal(await value('meta[name="twitter:image"]'), image);
  const alt = await value('meta[property="og:image:alt"]');
  assert.match(alt, /chillhill mountain logo/);
  assert.equal(await value('meta[name="twitter:image:alt"]'), alt);
  const touchIcon = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
  const favicon = await page.locator('link[rel="icon"][type="image/png"]').getAttribute('href');
  assert.equal(
    await page.locator('link[rel="icon"][type="image/png"]').getAttribute('sizes'),
    '32x32',
  );
  assert.equal(
    await page.locator('link[rel="icon"][type="image/svg+xml"]').getAttribute('href'),
    '/favicon.svg',
  );
  const assetPage = await context.newPage();
  for (const [path, width, height] of [
    [new URL(image).pathname, 1200, 630],
    [touchIcon, 180, 180],
    [favicon, 32, 32],
  ]) {
    const asset = await page.request.get(new URL(path, origin).href);
    assert.equal(asset.status(), 200);
    assert.match(asset.headers()['content-type'], /image\/png/);
    const bytes = await asset.body();
    assert.equal(bytes.toString('hex', 0, 8), '89504e470d0a1a0a');
    assert.equal(bytes.readUInt32BE(16), width);
    assert.equal(bytes.readUInt32BE(20), height);
    assert.ok(bytes.length > (width === 32 ? 100 : 1000) && bytes.length < 5_000_000);
    // Native image documents decode without JavaScript load handlers (disabled here).
    await assetPage.goto(new URL(path, origin).href);
    const decoded = await assetPage
      .locator('img')
      .evaluate((img) => [img.naturalWidth, img.naturalHeight]);
    assert.deepEqual(decoded, [width, height], 'preview and logo PNGs decode in the browser');
  }
  for (const agent of ['Discordbot/2.0', 'Twitterbot/1.0']) {
    const crawler = await page.request.get(origin, { headers: { 'User-Agent': agent } });
    assert.equal(crawler.status(), 200);
    const html = await crawler.text();
    assert.ok(html.includes(`<title>${title}</title>`));
    assert.ok(html.includes(description));
    assert.ok(html.includes(image));
  }
  console.log(
    'PASS: Slack, Discord and Twitter crawler requests receive matching sharing metadata; JavaScript-free HTML exposes a valid 1200×630 preview, 180×180 logo and 32×32 favicon.',
  );
} finally {
  await browser.close();
}
