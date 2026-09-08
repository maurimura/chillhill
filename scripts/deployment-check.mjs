import assert from 'node:assert/strict';

// Read-only production smoke check. This never starts a run or submits scores.
const origin = 'https://chillhill.maurimura.dev';
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function check() {
  const request = (path) =>
    fetch(new URL(path, origin), {
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
  const page = await request('/');
  assert.equal(page.status, 200, 'game HTML');
  assert.match(page.headers.get('content-security-policy') ?? '', /script-src 'self'/);
  assert.equal(page.headers.get('x-frame-options'), 'DENY');
  assert.equal(page.headers.get('x-content-type-options'), 'nosniff');
  const html = await page.text();
  assert.match(html, /<title>chillhill/);
  assert.match(html, /property="og:image"/);
  const imageURL = html.match(/property="og:image"\s+content="([^"]+)"/)?.[1];
  assert.ok(imageURL, 'social preview image');
  assert.equal(new URL(imageURL).origin, origin, 'same-site preview');
  const image = await request(imageURL);
  assert.equal(image.status, 200);
  assert.match(image.headers.get('content-type'), /image\/png/);
  const bytes = Buffer.from(await image.arrayBuffer());
  assert.equal(bytes.toString('hex', 0, 8), '89504e470d0a1a0a');
  assert.equal(bytes.readUInt32BE(16), 1200);
  assert.equal(bytes.readUInt32BE(20), 630);
  const response = await request('/api/leaderboard');
  assert.equal(response.status, 200, 'combined leaderboard');
  const board = await response.json();
  assert.equal(Object.hasOwn(board, 'version'), false);
  assert.ok(Array.isArray(board.entries) && board.entries.length <= 10);
  const preferences = await request('/api/preferences');
  assert.equal(preferences.status, 200);
  const data = await preferences.json();
  assert.deepEqual(Object.keys(data), ['country']);
  assert.ok(data.country === null || /^[A-Z]{2}$/.test(data.country));
}
for (let attempt = 1; ; attempt++) {
  try {
    await check();
    console.log(
      'PASS: deployed HTML, sharing image, the combined worldwide board and country preferences.',
    );
    break;
  } catch (error) {
    if (attempt >= 6) throw error;
    console.log(`Waiting for the new deployment (${attempt}/6)…`);
    await pause(5000);
  }
}
