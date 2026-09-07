import assert from 'node:assert/strict';
import { scoringDefaults } from '../src/config/scoring.ts';

// This script writes a few synthetic names to a disposable LOCAL D1 database.
// Never accept a remote hostname, HTTPS endpoint, redirect, or production URL.
const target = new URL(process.env.CLOUDFLARE_TEST_URL ?? 'http://127.0.0.1:8787');
assert.ok(
  target.protocol === 'http:' &&
    ['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) &&
    target.port === '8787' &&
    !target.username &&
    !target.password &&
    target.pathname === '/' &&
    !target.search &&
    !target.hash,
  'Cloudflare smoke tests only run against a disposable localhost:8787 Worker.',
);
const testId = crypto.randomUUID();
const nickname = `Local ${testId.slice(0, 8)}`;
const started = performance.now();

async function request(path, { data, method, headers = {}, raw } = {}) {
  const response = await fetch(new URL(path, target), {
    method: method ?? (data === undefined && raw === undefined ? 'GET' : 'POST'),
    headers: {
      Accept: 'application/json',
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
  assert.equal(response.status, status, `${options.method ?? 'request'} ${path}`);
  assert.match(response.headers.get('content-type') ?? '', /application\/json/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json();
  if (status >= 400) {
    assert.equal(typeof body.error, 'string');
    assert.equal(/D1_ERROR|SQLITE|token_hash|SELECT |INSERT /i.test(body.error), false);
  }
  return body;
}
const html = await request('/', { headers: { Accept: 'text/html' } });
assert.equal(html.status, 200);
assert.match(html.headers.get('content-type') ?? '', /text\/html/);
const markup = await html.text();
assert.match(markup, /chillhill/i);
const script = /<script[^>]+src="([^"]+)"/.exec(markup)?.[1];
assert.ok(script, 'Built game entry point is linked.');
assert.equal((await request(script)).status, 200, 'Built JavaScript is served.');
await api('/api/not-a-real-route', {}, 404);
await api('/api/leaderboard?category=toString', {}, 400);
await api('/api/runs', {}, 405);
const before = await api('/api/leaderboard?category=standard');
assert.equal(before.version, scoringDefaults.version);
assert.ok(
  before.entries.length < 10,
  'Use an isolated local D1 state directory; its test board is full.',
);

const settings = { version: scoringDefaults.version, car: 'astra', seed: 42, category: 'standard' };
await api('/api/runs', { data: settings, headers: { Origin: 'https://example.invalid' } }, 403);
await api('/api/runs', { data: { ...settings, car: 'constructor' } }, 400);
await api('/api/runs', { raw: '{not json}' }, 400);
await api('/api/runs', { raw: JSON.stringify({ text: 'x'.repeat(9000) }) }, 413);
const session = await api('/api/runs', { data: settings }, 201);
assert.match(session.token, /^[a-f0-9]{64}$/);
assert.ok(Date.parse(session.expiresAt) > Date.now());
await api(
  `/api/runs/${session.runId}/name`,
  { data: { token: session.token, name: nickname } },
  409,
);

// A plausible one-second fixture; wait in real wall time instead of inventing
// a many-minute run that a real Worker correctly refuses to rank.
await new Promise((resolve) => setTimeout(resolve, 1050));
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
await api(finish, { data: { token: '0'.repeat(64), record } }, 401);
const qualification = await api(finish, { data: { token: session.token, record } });
assert.equal(qualification.qualified, true);
assert.ok(qualification.rank >= 1 && qualification.rank <= 10);
assert.deepEqual(await api(finish, { data: { token: session.token, record } }), qualification);
await api(
  finish,
  { data: { token: session.token, record: { ...record, score: 71, earned: 71, driftEarned: 21 } } },
  409,
);
await api(name, { data: { token: session.token, name: '<script>' } }, 400);
const published = await api(name, { data: { token: session.token, name: nickname } });
assert.equal(published.qualified, true);
assert.deepEqual(await api(name, { data: { token: session.token, name: nickname } }), published);
await api(name, { data: { token: session.token, name: 'Other local name' } }, 409);

const after = await api('/api/leaderboard?category=standard');
const entry = after.entries.find((entry) => entry.record.id === testId);
assert.equal(entry?.name, nickname);
assert.equal(entry?.record.score, 70);
assert.ok(after.entries.length <= 10);
assert.equal(JSON.stringify(after).includes(session.token), false);
assert.equal(JSON.stringify(after).includes('token_hash'), false);
const custom = await api('/api/leaderboard?category=custom');
assert.equal(
  custom.entries.some((entry) => entry.record.id === testId),
  false,
);
console.log(
  `Cloudflare local smoke passed: assets, D1 ranking, name entry, retries and invalid requests (${((performance.now() - started) / 1000).toFixed(1)}s).`,
);
console.log(
  'One synthetic nickname was written to the disposable local D1 database; production was not contacted.',
);
