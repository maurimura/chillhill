import assert from 'node:assert/strict';
import { scoringDefaults } from '../src/config/scoring.ts';

// This script writes a few synthetic names to a disposable LOCAL D1 database.
// Never accept a remote hostname, HTTPS endpoint, redirect, or production URL.
const target = new URL(process.env.CLOUDFLARE_TEST_URL ?? 'http://127.0.0.1:8787');
assert.ok(
  target.protocol === 'http:' &&
    ['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) &&
    target.port !== '' &&
    !target.username &&
    !target.password &&
    target.pathname === '/' &&
    !target.search &&
    !target.hash,
  'Cloudflare smoke tests only run against a disposable localhost Worker on an explicit port.',
);
const testId = crypto.randomUUID();
const nickname = `Local ${testId.slice(0, 8)}`;
const started = performance.now();

async function check(label, run) {
  const began = performance.now();
  try {
    const result = await run();
    console.log(`API PASS: ${label} (${((performance.now() - began) / 1000).toFixed(2)}s)`);
    return result;
  } catch (cause) {
    throw new Error(`API FAIL: ${label}`, { cause });
  }
}
async function parallel(cases) {
  // Report every failure and finish all requests before moving to a dependent phase.
  const results = await Promise.allSettled(cases.map(([label, run]) => check(label, run)));
  const errors = results.filter((result) => result.status === 'rejected').map((r) => r.reason);
  if (errors.length) throw new AggregateError(errors, 'Independent API checks failed.');
  return results.map((result) => result.value);
}
async function request(path, { data, method, headers = {}, raw } = {}) {
  const url = new URL(path, target);
  assert.equal(url.origin, target.origin, 'Every smoke request must stay on the local preview.');
  const response = await fetch(url, {
    method: method ?? (data === undefined && raw === undefined ? 'GET' : 'POST'),
    headers: {
      Accept: 'application/json',
      // Local-only fixtures: separate normal API, burst and browser allowances.
      'CF-Connecting-IP': '192.0.2.10',
      ...(data === undefined && raw === undefined
        ? {}
        : { Origin: target.origin, 'Content-Type': 'application/json' }),
      ...headers,
    },
    body: raw ?? (data === undefined ? undefined : JSON.stringify(data)),
    redirect: 'manual',
    signal: AbortSignal.timeout(8000),
  });
  assert.ok(
    response.status < 300 || response.status >= 400,
    'Do not follow redirects to other hosts.',
  );
  return response;
}
async function api(path, options = {}, status = 200) {
  const response = await request(path, options);
  return readAPI(response, path, status);
}
async function readAPI(response, path, status = 200) {
  const expected = Array.isArray(status) ? status : [status];
  assert.ok(
    expected.includes(response.status),
    `${path}: expected ${expected}, got ${response.status}`,
  );
  assert.match(response.headers.get('content-type') ?? '', /application\/json/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.match(response.headers.get('content-security-policy') ?? '', /default-src 'none'/);
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  if (response.status === 429) assert.equal(response.headers.get('retry-after'), '60');
  const body = await response.json();
  if (response.status >= 400) {
    assert.deepEqual(Object.keys(body), ['error']);
    assert.equal(typeof body.error, 'string');
    assert.equal(/D1_ERROR|SQLITE|token_hash|SELECT |INSERT /i.test(body.error), false);
  }
  return body;
}
const [, before] = await parallel([
  [
    'built assets and security headers',
    async () => {
      const html = await request('/', { headers: { Accept: 'text/html' } });
      assert.equal(html.status, 200);
      assert.match(html.headers.get('content-type') ?? '', /text\/html/);
      assert.match(html.headers.get('content-security-policy') ?? '', /script-src 'self'/);
      assert.equal(html.headers.get('x-frame-options'), 'DENY');
      assert.equal(html.headers.get('x-content-type-options'), 'nosniff');
      const markup = await html.text();
      assert.match(markup, /chillhill/i);
      const script = /<script[^>]+src="([^"]+)"/.exec(markup)?.[1];
      assert.ok(script, 'Built game entry point is linked.');
      const built = await request(script);
      assert.equal(built.status, 200, 'Built JavaScript is served.');
      await built.arrayBuffer();
    },
  ],
  [
    'initial public board',
    async () => {
      const board = await api('/api/leaderboard');
      assert.deepEqual(Object.keys(board), ['entries']);
      assert.ok(
        Array.isArray(board.entries) && board.entries.length < 10,
        'Use an isolated local D1 state directory; its test board is full.',
      );
      return board;
    },
  ],
  [
    'country preferences expose only a country code',
    async () => {
      const preferences = await api('/api/preferences');
      assert.deepEqual(Object.keys(preferences), ['country']);
      assert.ok(preferences.country === null || /^[A-Z]{2}$/.test(preferences.country));
    },
  ],
]);

const settings = { version: scoringDefaults.version, car: 'astra', seed: 42, category: 'standard' };
const session = await check('create a run', () => api('/api/runs', { data: settings }, 201));
assert.match(session.token, /^[a-f0-9]{64}$/);
assert.ok(Date.parse(session.expiresAt) > Date.now());
const readyAt = performance.now() + 1050;
await parallel([
  ['unknown route', () => api('/api/not-a-real-route', {}, 404)],
  ['run method', () => api('/api/runs', {}, 405)],
  ['preferences method', () => api('/api/preferences', { method: 'POST' }, 405)],
  [
    'foreign origin',
    () => api('/api/runs', { data: settings, headers: { Origin: 'https://example.invalid' } }, 403),
  ],
  [
    'cross-site request',
    () => api('/api/runs', { data: settings, headers: { 'Sec-Fetch-Site': 'cross-site' } }, 403),
  ],
  [
    'wrong content type',
    () => api('/api/runs', { data: settings, headers: { 'Content-Type': 'text/plain' } }, 415),
  ],
  ['invalid car', () => api('/api/runs', { data: { ...settings, car: 'constructor' } }, 400)],
  ['malformed JSON', () => api('/api/runs', { raw: '{not json}' }, 400)],
  ['non-object JSON', () => api('/api/runs', { raw: '[]' }, 400)],
  [
    'oversized body',
    () => api('/api/runs', { raw: JSON.stringify({ text: 'x'.repeat(9000) }) }, 413),
  ],
]);
await api(
  `/api/runs/${session.runId}/name`,
  { data: { token: session.token, name: nickname } },
  409,
);

// Validation runs during the fixture's real one-second lifetime.
await new Promise((resolve) => setTimeout(resolve, Math.max(0, readyAt - performance.now())));
const record = {
  id: testId,
  version: scoringDefaults.version,
  finishedAt: new Date().toISOString(),
  car: 'astra',
  cars: ['astra'],
  category: 'standard',
  customReasons: [],
  seed: 42,
  score: 70,
  earned: 70,
  nearMissEarned: 50,
  driftEarned: 20,
  penalties: 0,
  nearMisses: 1,
  bestStreak: 1,
  shoulderTouches: 0,
  shoulderSeconds: 0,
  driftSeconds: 0.9,
  bestDriftSeconds: 0.9,
  duration: 1,
  distance: 5,
  topSpeed: 30,
  averageSpeed: 18,
};
const finish = `/api/runs/${session.runId}/finish`;
const name = `/api/runs/${session.runId}/name`;
await parallel([
  [
    'finish rejects a bad token',
    () => api(finish, { data: { token: '0'.repeat(64), record } }, 401),
  ],
  [
    'name rejects a bad token',
    () => api(name, { data: { token: '0'.repeat(64), name: nickname } }, 401),
  ],
  [
    'inconsistent score is rejected',
    () => api(finish, { data: { token: session.token, record: { ...record, score: 71 } } }, 400),
  ],
]);
const [qualification, duplicateFinish] = await parallel([
  ['finish request', () => api(finish, { data: { token: session.token, record } })],
  ['simultaneous finish retry', () => api(finish, { data: { token: session.token, record } })],
]);
assert.equal(qualification.qualified, true);
assert.ok(qualification.rank >= 1 && qualification.rank <= 10);
assert.deepEqual(duplicateFinish, qualification);
assert.deepEqual(await api(finish, { data: { token: session.token, record } }), qualification);
await parallel([
  [
    'finished scores are immutable',
    () =>
      api(
        finish,
        {
          data: {
            token: session.token,
            record: { ...record, score: 71, earned: 71, driftEarned: 21 },
          },
        },
        409,
      ),
  ],
  [
    'unsafe name is rejected',
    () => api(name, { data: { token: session.token, name: '<script>' } }, 400),
  ],
  [
    'unnamed runs stay private',
    async () => assert.deepEqual(await api('/api/leaderboard'), before),
  ],
]);
const [published, duplicateName] = await parallel([
  ['publish name', () => api(name, { data: { token: session.token, name: nickname } })],
  ['simultaneous name retry', () => api(name, { data: { token: session.token, name: nickname } })],
]);
assert.equal(published.qualified, true);
assert.deepEqual(duplicateName, published);
assert.deepEqual(await api(name, { data: { token: session.token, name: nickname } }), published);
await api(name, { data: { token: session.token, name: 'Other local name' } }, 409);

const after = await api('/api/leaderboard');
const entry = after.entries.find((entry) => entry.record.id === testId);
assert.equal(after.entries.filter((entry) => entry.record.id === testId).length, 1);
assert.equal(after.entries.length, before.entries.length + 1, 'Retries publish exactly one entry.');
assert.deepEqual(Object.keys(entry).sort(), ['name', 'record']);
assert.deepEqual(Object.keys(entry.record).sort(), Object.keys(record).sort());
assert.equal(entry?.name, nickname);
assert.equal(entry?.record.score, 70);
assert.ok(after.entries.length <= 10);
assert.equal(JSON.stringify(after).includes(session.token), false);
assert.equal(JSON.stringify(after).includes('token_hash'), false);
await parallel(
  ['category=custom', 'category=standard', 'version=1'].map((query) => [
    `legacy board query: ${query}`,
    async () => assert.deepEqual(await api(`/api/leaderboard?${query}`), after),
  ]),
);
await check('bounded parallel bursts are throttled without affecting other clients', async () => {
  const burstHeaders = { 'CF-Connecting-IP': '192.0.2.11' };
  // An already exhausted fixture must not make a broken limiter appear to pass.
  await api('/api/leaderboard', { headers: burstHeaders });
  let limited = false;
  // At most eight requests in flight; the probe has its own local-only identity.
  for (let offset = 0; offset < 65 && !limited; offset += 8) {
    const results = await Promise.allSettled(
      Array.from({ length: Math.min(8, 65 - offset) }, async (_, index) => {
        const attempt = offset + index;
        const path = `/api/leaderboard?category=${attempt % 2 ? 'custom' : 'standard'}&nonce=${attempt}`;
        const response = await request(path, {
          headers: { ...burstHeaders, 'X-Forwarded-For': `198.51.100.${attempt + 1}` },
        });
        await readAPI(response, path, [200, 429]);
        return response.status;
      }),
    );
    const failures = results.filter((r) => r.status === 'rejected').map((r) => r.reason);
    if (failures.length) throw new AggregateError(failures, 'Rate-limit burst failed.');
    limited = results.some((r) => r.value === 429);
  }
  assert.ok(
    limited,
    'The real edge binding limits reads despite query and forwarding-header changes.',
  );
  await parallel([
    [
      'burst client remains throttled',
      () => api('/api/leaderboard', { headers: burstHeaders }, 429),
    ],
    [
      'other API clients can still read',
      async () => assert.deepEqual(await api('/api/leaderboard'), after),
    ],
    [
      'throttled client can still load the game',
      async () => {
        const response = await request('/', { headers: burstHeaders });
        assert.equal(response.status, 200);
        await response.text();
      },
    ],
    [
      'throttled client can still read preferences',
      () => api('/api/preferences', { headers: burstHeaders }),
    ],
  ]);
});
console.log(
  `Cloudflare local smoke passed: assets, D1 ranking, name entry, retries, invalid requests and edge rate limits (${((performance.now() - started) / 1000).toFixed(1)}s).`,
);
console.log(
  'One synthetic nickname was written to the disposable local D1 database; production was not contacted.',
);
