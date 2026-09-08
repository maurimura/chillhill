import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { handleRequest, type Database, type Statement, type Env } from '../worker/index.ts';
import { scoringDefaults, standardDriving } from '../src/config/scoring.ts';
import { completedScore, createScoreRun, type ScoreRecord } from '../src/scoreboard.ts';
import { initialChallenge, stepChallenge } from '../src/game/challenge.ts';
import { initialState } from '../src/game/driving.ts';
import type { StartRunResponse } from '../src/leaderboard-api.ts';

/** Real SQLite SQL/transactions, wrapped in D1's small asynchronous interface. */
class SQLite implements Database {
  db = new DatabaseSync(':memory:');
  error: unknown;
  executions = new WeakMap<Statement, () => unknown[]>();
  constructor() {
    const migrations = new URL('../migrations/', import.meta.url);
    for (const file of readdirSync(migrations)
      .filter((name) => name.endsWith('.sql'))
      .sort())
      this.db.exec(readFileSync(new URL(file, migrations), 'utf8'));
  }
  prepare(sql: string): Statement {
    let values: (string | number | null)[] = [];
    const execute = <T>() => {
      try {
        return this.db.prepare(sql).all(...values) as T[];
      } catch (error) {
        this.error = error;
        throw error;
      }
    };
    const statement: Statement = {
      bind: (...next) => {
        values = next;
        return statement;
      },
      first: async <T>() => execute<T>()[0] ?? null,
      all: async <T>() => ({ results: execute<T>() }),
    };
    this.executions.set(statement, execute);
    return statement;
  }
  async batch<T>(statements: Statement[]): Promise<{ results: T[] }[]> {
    this.db.exec('BEGIN');
    try {
      // Execute synchronously, so another request cannot interleave SQL inside
      // this transaction. D1 provides the same batch serialization guarantee.
      const results = statements.map((statement) => ({
        results: this.executions.get(statement)!() as T[],
      }));
      this.db.exec('COMMIT');
      return results;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
}
const origin = 'https://chillhill.maurimura.dev';
const epoch = Date.parse('2026-09-07T12:00:00Z');

test('country preferences use edge metadata only, without requiring D1 or exposing location detail', async () => {
  for (const country of ['AR', 'US', 'GB', 'XX', undefined]) {
    const request = new Request(origin + '/api/preferences', { headers: { 'CF-IPCountry': 'US' } });
    Object.assign(request, { cf: { country, city: 'Never returned', latitude: 'Never returned' } });
    const response = await handleRequest(request, {} as Env);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), {
      country: country === 'XX' || country === undefined ? null : country,
    });
  }
  const response = await handleRequest(
    new Request(origin + '/api/preferences', { method: 'POST' }),
    {} as Env,
  );
  assert.equal(response.status, 405);
});
function setup() {
  const DB = new SQLite();
  const env: Env = {
    DB,
    ASSETS: { fetch: async () => new Response('game assets') },
    API_RATE_LIMITER: { limit: async () => ({ success: true }) },
  };
  async function call(
    path: string,
    data?: unknown,
    now = epoch,
    headers: Record<string, string> = {},
  ) {
    return handleRequest(
      new Request(origin + path, {
        method: data === undefined ? 'GET' : 'POST',
        headers:
          data === undefined
            ? headers
            : {
                origin,
                'content-type': 'application/json',
                'cf-connecting-ip': '192.0.2.1',
                ...headers,
              },
        body: data === undefined ? undefined : JSON.stringify(data),
      }),
      env,
      now,
    );
  }
  async function start(category = 'standard', version = scoringDefaults.version) {
    const response = await call('/api/runs', {
      version,
      car: 'astra',
      seed: 42,
      category,
    });
    assert.equal(response.status, 201, String(DB.error ?? 'start'));
    return response.json() as Promise<StartRunResponse>;
  }
  async function finish(session: StartRunResponse, row = record(), now = epoch + 100_000) {
    return call(`/api/runs/${session.runId}/finish`, { token: session.token, record: row }, now);
  }
  async function name(session: StartRunResponse, alias = 'Mauri', now = epoch + 100_001) {
    return call(`/api/runs/${session.runId}/name`, { token: session.token, name: alias }, now);
  }
  return { DB, env, call, start, finish, name };
}
function record(patch: Partial<ScoreRecord> = {}): ScoreRecord {
  return {
    id: crypto.randomUUID(),
    version: scoringDefaults.version,
    finishedAt: new Date(epoch + 100_000).toISOString(),
    category: 'standard',
    car: 'astra',
    cars: ['astra'],
    seed: 42,
    customReasons: [],
    score: 380,
    earned: 400,
    penalties: 20,
    nearMissEarned: 300,
    driftEarned: 100,
    nearMisses: 2,
    bestStreak: 1,
    shoulderTouches: 1,
    shoulderSeconds: 0.2,
    driftSeconds: 5,
    bestDriftSeconds: 5,
    distance: 1000,
    duration: 90,
    topSpeed: 80,
    averageSpeed: 45,
    ...patch,
  };
}

test('sessions use hashed capabilities; finishing/name flow is idempotent and public data is whitelisted', async () => {
  const { DB, call, start, finish, name } = setup();
  const session = await start();
  assert.match(session.token, /^[a-f0-9]{64}$/);
  const stored = DB.db.prepare('SELECT * FROM leaderboard_sessions').get()!;
  assert.notEqual(stored.token_hash, session.token);
  assert.equal(JSON.stringify(stored).includes(session.token), false);
  const row = record();
  const first = await finish(session, { ...row, token: 'malicious extra field' } as ScoreRecord);
  assert.equal(first.status, 200, String(DB.error));
  assert.deepEqual(await first.json(), { qualified: true, rank: 1 });
  assert.equal((await finish(session, row)).status, 200);
  assert.deepEqual(
    (await (await call('/api/leaderboard')).json()).entries,
    [],
    'unnamed is not public',
  );
  assert.equal((await name(session, '  José  Drift  ')).status, 200, String(DB.error));
  assert.equal((await name(session, 'José Drift')).status, 200);
  assert.equal((await name(session, 'Different')).status, 409);
  const list = await (await call('/api/leaderboard')).json();
  assert.equal(list.entries.length, 1);
  assert.equal(list.entries[0].name, 'José Drift');
  assert.equal(list.entries[0].record.score, row.score);
  assert.equal(JSON.stringify(list).includes('token'), false);
  assert.equal(JSON.stringify(list).includes('192.0.2.1'), false);
  assert.equal(
    JSON.stringify(DB.db.prepare('SELECT * FROM leaderboard_limits').all()).includes('192.0.2.1'),
    false,
  );
});

test('all setups and versions share ten positive named scores; late names are rechecked globally', async () => {
  const { DB, call, start, finish, name } = setup();
  const late = await start();
  assert.deepEqual(
    await (
      await finish(late, record({ score: 1, earned: 21, nearMissEarned: 21, driftEarned: 0 }))
    ).json(),
    { qualified: true, rank: 1 },
  );
  for (let i = 0; i < 12; i++) {
    const category = i % 2 ? 'custom' : 'standard';
    const version = (i % 3) + 1;
    const session = await start(category, version);
    const row = record({
      version,
      category,
      customReasons: category === 'custom' ? ['setup'] : [],
      score: 100 + i,
      earned: 120 + i,
      nearMissEarned: 120 + i,
      driftEarned: 0,
    });
    assert.equal((await finish(session, row, epoch + 100_000 + i)).status, 200, String(DB.error));
    assert.equal(
      (await name(session, `Driver ${i}`, epoch + 100_100 + i)).status,
      200,
      String(DB.error),
    );
  }
  assert.deepEqual(await (await name(late)).json(), { qualified: false, rank: null });
  const rows = (await (await call('/api/leaderboard')).json()).entries;
  assert.equal(rows.length, 10);
  assert.equal(rows[0].record.score, 111);
  assert.equal(rows[9].record.score, 102);
  const zero = await start();
  assert.deepEqual(
    await (
      await finish(
        zero,
        record({
          score: 0,
          earned: 0,
          penalties: 0,
          nearMissEarned: 0,
          driftEarned: 0,
          nearMisses: 0,
          bestStreak: 0,
        }),
      )
    ).json(),
    { qualified: false, rank: null },
  );
  assert.deepEqual(await (await name(zero)).json(), { qualified: false, rank: null });
  const custom = await start('custom');
  await finish(custom, record({ category: 'custom', customReasons: ['setup'] }));
  assert.deepEqual(await (await name(custom)).json(), { qualified: true, rank: 1 });
  const combined = await (await call('/api/leaderboard')).json();
  assert.equal(combined.entries.length, 10);
  assert.deepEqual(
    new Set(combined.entries.map((entry: { record: ScoreRecord }) => entry.record.category)),
    new Set(['standard', 'custom']),
  );
  for (const category of ['standard', 'custom', 'unknown'])
    assert.deepEqual(
      await (await call(`/api/leaderboard?category=${category}`)).json(),
      combined,
      'legacy query parameters cannot split the board',
    );
  assert.equal(DB.db.prepare('SELECT COUNT(*) AS count FROM leaderboard_entries').get()!.count, 10);
});

test('finish cannot change its score or replay a client record under another session', async () => {
  const { start, finish } = setup();
  const first = await start();
  const row = record();
  assert.equal((await finish(first, row)).status, 200);
  assert.equal(
    (await finish(first, { ...row, score: row.score + 1, penalties: row.penalties - 1 })).status,
    409,
  );
  const replay = await start();
  assert.equal((await finish(replay, row)).status, 409);
});

test('client version metadata does not restrict sessions or public ranking', async () => {
  const { start, finish, name, call } = setup();
  for (const version of [1, scoringDefaults.version, scoringDefaults.version + 1]) {
    const session = await start('standard', version);
    assert.equal((await finish(session, record({ version }))).status, 200);
    assert.equal((await name(session, `Driver ${version}`)).status, 200);
  }
  const board = await (await call('/api/leaderboard')).json();
  assert.equal(Object.hasOwn(board, 'version'), false);
  assert.equal(board.entries.length, 3);
});

test('existing boards from every version merge on read without deleting records', async () => {
  const { DB, call } = setup();
  const insert = DB.db.prepare(`INSERT INTO leaderboard_entries
    (run_id, record_id, version, category, name, score, near_misses, finished_at, record_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (let i = 0; i < 21; i++) {
    const category = i % 2 ? 'custom' : 'standard';
    const row = record({
      category,
      customReasons: category === 'custom' ? ['setup'] : [],
      version: (i % 3) + 1,
      score: 100 + i,
      earned: 120 + i,
      nearMissEarned: 120 + i,
      driftEarned: 0,
    });
    insert.run(
      crypto.randomUUID(),
      row.id,
      row.version,
      category,
      `Driver ${i}`,
      row.score,
      row.nearMisses,
      row.finishedAt,
      JSON.stringify(row),
    );
  }
  DB.db.exec(
    readFileSync(new URL('../migrations/0003_all_time_leaderboard.sql', import.meta.url), 'utf8'),
  );
  const board = await (await call('/api/leaderboard')).json();
  assert.deepEqual(
    board.entries.map((entry: { record: ScoreRecord }) => entry.record.score),
    [120, 119, 118, 117, 116, 115, 114, 113, 112, 111],
  );
  assert.equal(DB.db.prepare('SELECT COUNT(*) AS count FROM leaderboard_entries').get()!.count, 21);
});

test('simultaneous name admissions keep exactly ten rows and one immutable name per run', async () => {
  const { DB, call, start, finish, name } = setup();
  const candidates = await Promise.all(
    Array.from({ length: 15 }, (_, i) => start(i % 2 ? 'custom' : 'standard', (i % 3) + 1)),
  );
  await Promise.all(
    candidates.map((session, i) =>
      finish(
        session,
        record({
          version: (i % 3) + 1,
          category: i % 2 ? 'custom' : 'standard',
          customReasons: i % 2 ? ['setup'] : [],
          score: 100 + i,
          earned: 120 + i,
          nearMissEarned: 120 + i,
          driftEarned: 0,
        }),
      ),
    ),
  );
  const responses = await Promise.all(candidates.map((session, i) => name(session, `Driver ${i}`)));
  assert.ok(
    responses.every((response) => response.status === 200),
    String(DB.error),
  );
  const entries = (await (await call('/api/leaderboard')).json()).entries;
  assert.equal(entries.length, 10);
  assert.deepEqual(
    entries.map((entry: { record: ScoreRecord }) => entry.record.score),
    [114, 113, 112, 111, 110, 109, 108, 107, 106, 105],
  );
  const winner = await start();
  await finish(winner, record());
  const names = await Promise.all([name(winner, 'First name'), name(winner, 'Other name')]);
  assert.deepEqual(names.map((response) => response.status).sort(), [200, 409]);
  assert.equal(DB.db.prepare('SELECT COUNT(*) AS count FROM leaderboard_entries').get()!.count, 10);
});

test('ties use near misses then server time, not a forged client completion date', async () => {
  const { call, start, finish, name } = setup();
  const first = await start();
  await finish(first, record(), epoch + 100_000);
  await name(first, 'First');
  const second = await start('custom', 1);
  await finish(
    second,
    record({
      version: 1,
      category: 'custom',
      customReasons: ['setup'],
      finishedAt: '2000-01-01T00:00:00Z',
    }),
    epoch + 110_000,
  );
  await name(second, 'Second', epoch + 110_001);
  const third = await start();
  await finish(third, record({ nearMisses: 3 }), epoch + 120_000);
  await name(third, 'Third', epoch + 120_001);
  const rows = (await (await call('/api/leaderboard')).json()).entries;
  assert.deepEqual(
    rows.map((entry: { name: string }) => entry.name),
    ['Third', 'First', 'Second'],
  );
  assert.equal(rows[2].record.finishedAt, new Date(epoch + 110_000).toISOString());
});

test('same-origin JSON writes, size limits, methods and alias validation fail safely', async () => {
  const { call, start, finish, name } = setup();
  const settings = {
    version: scoringDefaults.version,
    car: 'astra',
    seed: 42,
    category: 'standard',
  };
  assert.equal(
    (await call('/api/runs', settings, epoch, { origin: 'https://elsewhere.test' })).status,
    403,
  );
  assert.equal((await call('/api/runs', settings, epoch, { origin: '' })).status, 403);
  assert.equal(
    (await call('/api/runs', settings, epoch, { 'content-type': 'text/plain' })).status,
    415,
  );
  assert.equal((await call('/api/runs', { text: 'x'.repeat(9000) })).status, 413);
  assert.equal((await call('/api/runs')).status, 405);
  assert.equal((await call('/api/missing')).status, 404);
  assert.equal((await call('/api/runs', { ...settings, car: '__proto__' })).status, 400);
  for (const version of [0, -1, 1.5, '1', null, Number.MAX_SAFE_INTEGER + 1])
    assert.equal((await call('/api/runs', { ...settings, version })).status, 400);
  const session = await start();
  assert.equal((await name(session)).status, 409);
  await finish(session);
  for (const alias of ['a', 'x'.repeat(21), '<script>', 'A\nB', 'A\u0000B'])
    assert.equal((await name(session, alias)).status, 400, alias);
});

test('bad tokens, expired sessions and category upgrades are rejected', async () => {
  const { call, start, finish } = setup();
  const session = await start('custom');
  assert.equal((await finish(session, record())).status, 400);
  assert.equal(
    (await call(`/api/runs/${session.runId}/finish`, { token: 'f'.repeat(64), record: record() }))
      .status,
    401,
  );
  assert.equal(
    (
      await call(
        `/api/runs/${session.runId}/finish`,
        { token: session.token, record: record() },
        epoch + 24 * 3_600_000,
      )
    ).status,
    410,
  );
  const standard = await start();
  assert.equal(
    (await finish(standard, record({ category: 'custom', customReasons: ['tuning'] }))).status,
    200,
    'downgrade is allowed',
  );
});

test('impossible totals, versions, elapsed time and physical stats cannot enter the board', async () => {
  const { start, finish } = setup();
  const patches: Partial<ScoreRecord>[] = [
    { version: 1 },
    { seed: 43 },
    { car: 'wagon' },
    { score: Infinity },
    { score: -1 },
    { duration: 116 },
    { topSpeed: standardDriving.maxSpeed + 2 },
    { averageSpeed: 90 },
    { distance: 100_000 },
    { shoulderSeconds: 100 },
    { shoulderTouches: 1000 },
    { nearMisses: 1000 },
    { nearMissEarned: 900, earned: 1000, score: 980 },
    { driftEarned: 1000, earned: 1300, score: 1280 },
    { driftSeconds: 100 },
    { bestDriftSeconds: 10 },
    { earned: 999 },
    { penalties: -1 },
  ];
  for (const patch of patches) {
    const session = await start();
    assert.equal((await finish(session, record(patch))).status, 400, JSON.stringify(patch));
  }
});

test('280 km/h runs can rank in both categories, but exceeding the cap is rejected', async () => {
  for (const category of ['standard', 'custom'] as const) {
    const { start, finish } = setup();
    const session = await start(category);
    const row = record({
      category,
      customReasons: category === 'custom' ? ['setup'] : [],
      topSpeed: 280,
      averageSpeed: 180,
      distance: 4500,
    });
    assert.equal((await finish(session, row)).status, 200);
    const tooFast = await start(category);
    assert.equal(
      (await finish(tooFast, { ...row, id: crypto.randomUUID(), topSpeed: 281 })).status,
      400,
    );
  }
});

test('a real three-fall game record passes server plausibility despite unscored recovery coasting', async () => {
  const { start, finish } = setup();
  const session = await start();
  const settings = {
    ...standardDriving,
    car: 'astra',
    seed: 42,
    cruiseSpeed: 36,
    terrainHeight: 1,
  };
  const driving = initialState();
  const challenge = initialChallenge(settings, driving);
  const run = createScoreRun(settings);
  let elapsed = 0;
  let falls = 0;
  let previous = challenge.phase;
  while (challenge.phase !== 'gameover' && elapsed < 90) {
    stepChallenge(
      challenge,
      driving,
      { steer: 1, accelerate: true, brake: false },
      settings,
      1 / 120,
    );
    elapsed += 1 / 120;
    if (challenge.phase === 'falling' && previous !== 'falling') falls++;
    previous = challenge.phase;
  }
  assert.equal(falls, 3);
  const row = completedScore(run, challenge, driving.travelled)!;
  assert.ok(row);
  assert.ok(row.duration < elapsed, 'recovery animation is excluded from scored driving time');
  assert.ok(
    row.distance > challenge.score.movingDistance,
    'the odometer includes forward fall coasting',
  );
  assert.equal((await finish(session, row, epoch + Math.ceil(elapsed * 1000))).status, 200);
});

test('new session creation prunes expired private data while preserving the public board', async () => {
  const { DB, call, start, finish, name } = setup();
  const session = await start();
  await finish(session);
  await name(session);
  const tomorrow = epoch + 25 * 3_600_000;
  await call(
    '/api/runs',
    { version: scoringDefaults.version, car: 'astra', seed: 42, category: 'standard' },
    tomorrow,
  );
  assert.equal(
    DB.db
      .prepare('SELECT COUNT(*) AS count FROM leaderboard_sessions WHERE run_id = ?')
      .get(session.runId)!.count,
    0,
  );
  assert.equal(DB.db.prepare('SELECT COUNT(*) AS count FROM leaderboard_entries').get()!.count, 1);
  assert.equal(
    DB.db
      .prepare('SELECT COUNT(*) AS count FROM leaderboard_limits WHERE expires_at < ?')
      .get(tomorrow)!.count,
    0,
  );
});

test('start requests are atomically rate-limited and static game assets remain independent', async () => {
  const { call, env } = setup();
  for (let i = 0; i < 120; i++)
    assert.equal(
      (
        await call('/api/runs', {
          version: scoringDefaults.version,
          car: 'astra',
          seed: 42,
          category: 'standard',
        })
      ).status,
      201,
    );
  assert.equal(
    (
      await call('/api/runs', {
        version: scoringDefaults.version,
        car: 'astra',
        seed: 42,
        category: 'standard',
      })
    ).status,
    429,
  );
  assert.equal(await (await handleRequest(new Request(origin + '/'), env)).text(), 'game assets');
  const disconnected = { ...env, DB: undefined } as unknown as Env;
  assert.equal(
    (await handleRequest(new Request(origin + '/api/leaderboard'), disconnected)).status,
    503,
  );
  assert.equal(
    await (await handleRequest(new Request(origin + '/'), disconnected)).text(),
    'game assets',
  );
});

test('edge limits reject reads and writes before any D1 access or body consumption', async () => {
  const { env } = setup();
  env.DB = {
    prepare: () => assert.fail('Rejected traffic must not query D1'),
    batch: async () => assert.fail('Rejected traffic must not write to D1'),
  };
  env.API_RATE_LIMITER = { limit: async () => ({ success: false }) };
  for (const path of [
    '/api/leaderboard',
    '/api/runs',
    `/api/runs/${crypto.randomUUID()}/finish`,
    `/api/runs/${crypto.randomUUID()}/name`,
  ]) {
    const request = new Request(origin + path, {
      method: path === '/api/leaderboard' ? 'GET' : 'POST',
    });
    const response = await handleRequest(request, env, epoch);
    assert.equal(response.status, 429, path);
    assert.equal(response.headers.get('retry-after'), '60');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
    assert.match(response.headers.get('content-security-policy')!, /default-src 'none'/);
    assert.equal(request.bodyUsed, false);
  }
  assert.equal((await handleRequest(new Request(origin + '/'), env)).status, 200);
  assert.equal((await handleRequest(new Request(origin + '/api/preferences'), env)).status, 200);
});

test('edge buckets cannot be reset by changing category, run ID or forwarding headers', async () => {
  const { env } = setup();
  const keys: string[] = [];
  env.API_RATE_LIMITER = {
    limit: async ({ key }) => {
      keys.push(key);
      return { success: false };
    },
  };
  async function limited(path: string, address = '192.0.2.1') {
    return handleRequest(
      new Request(origin + path, {
        method: path.startsWith('/api/leaderboard') ? 'GET' : 'POST',
        headers: { 'cf-connecting-ip': address, 'x-forwarded-for': crypto.randomUUID() },
      }),
      env,
      epoch,
    );
  }
  await limited('/api/leaderboard?category=standard');
  await limited('/api/leaderboard?category=custom&cachebust=123');
  assert.equal(keys[0], keys[1]);
  await limited(`/api/runs/${crypto.randomUUID()}/finish`);
  await limited(`/api/runs/${crypto.randomUUID()}/name`);
  assert.equal(keys[2], keys[3]);
  assert.notEqual(keys[0], keys[2], 'reading and writing have separate allowances');
  await limited('/api/runs');
  assert.notEqual(keys[4], keys[2], 'starting and finishing have separate allowances');
  await limited('/api/runs', '192.0.2.2');
  assert.notEqual(keys[4], keys[5]);
  assert.equal(
    keys.some((key) => key.includes('192.0.2.')),
    false,
  );
});

test('missing or broken edge limits fail closed without disabling the game', async () => {
  const { env } = setup();
  env.DB = {
    prepare: () => assert.fail('Unavailable limiter must not reach D1'),
    batch: async () => assert.fail('Unavailable limiter must not reach D1'),
  };
  for (const binding of [
    undefined,
    {
      limit: async () => {
        throw new Error('Private provider diagnostic');
      },
    },
  ]) {
    const unavailable = { ...env, API_RATE_LIMITER: binding } as Env;
    const response = await handleRequest(new Request(origin + '/api/leaderboard'), unavailable);
    assert.equal(response.status, 503);
    assert.equal((await response.text()).includes('Private provider diagnostic'), false);
    assert.equal((await handleRequest(new Request(origin + '/'), unavailable)).status, 200);
  }
});
