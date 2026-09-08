import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { scoringDefaults } from '../src/config/scoring.ts';
import { OnlineScoreboard } from '../src/online-scoreboard.ts';
import type { ScoreCategory, ScoreRecord, ScoreRun } from '../src/scoreboard.ts';

const capability = 'private-run-capability';
const session = {
  runId: 'c00feeed-0000-4000-8000-000000000001',
  token: capability,
  expiresAt: '2026-09-08T12:00:00.000Z',
};
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
function record(id = 'run-1', category: ScoreCategory = 'standard'): ScoreRecord {
  return {
    version: scoringDefaults.version,
    id,
    category,
    car: 'astra',
    cars: ['astra'],
    customReasons: category === 'custom' ? ['setup'] : [],
    seed: 42,
    score: 180,
    earned: 200,
    nearMissEarned: 100,
    driftEarned: 100,
    penalties: 20,
    nearMisses: 1,
    bestStreak: 1,
    driftSeconds: 4,
    bestDriftSeconds: 2,
    shoulderTouches: 1,
    shoulderSeconds: 0.2,
    distance: 1000,
    duration: 90,
    topSpeed: 80,
    averageSpeed: 40,
    finishedAt: '2026-09-07T12:00:00.000Z',
  };
}
function run(row: ScoreRecord = record()): ScoreRun {
  return {
    id: row.id,
    seed: row.seed,
    car: row.car,
    cars: [...row.cars],
    category: row.category,
    customReasons: [...row.customReasons],
  };
}
function board(entries: unknown[] = []) {
  return { entries };
}

function setup(t: TestContext, enabled = true) {
  const calls: {
    url: string;
    init?: RequestInit;
    resolve: (response: Response) => void;
    reject: (reason: Error) => void;
    settled: boolean;
  }[] = [];
  let closed = false;
  const client = new OnlineScoreboard(
    enabled,
    (url, init) =>
      new Promise<Response>((resolve, reject) => {
        if (closed) {
          reject(new Error('Test finished'));
          return;
        }
        calls.push({ url, init, resolve, reject, settled: false });
      }),
  );
  function respond(index: number, data: unknown, status = 200, type = 'application/json') {
    const call = calls[index];
    assert.ok(call, `request ${index} exists`);
    assert.equal(call.settled, false, `request ${index} is pending`);
    call.settled = true;
    call.resolve(
      new Response(type === 'application/json' ? JSON.stringify(data) : String(data), {
        status,
        headers: { 'content-type': type },
      }),
    );
  }
  function reject(index: number, message = 'Network is offline') {
    const call = calls[index];
    assert.ok(call, `request ${index} exists`);
    call.settled = true;
    call.reject(new Error(message));
  }
  t.after(() => {
    closed = true;
    client.dispose();
    for (const call of calls) if (!call.settled) call.reject(new Error('Test finished'));
  });
  const body = (index: number) => JSON.parse(String(calls[index].init?.body));
  async function qualified(row = record()) {
    client.begin(run(row));
    respond(0, session);
    const complete = client.complete(row);
    await flush();
    respond(1, { qualified: true, rank: 3 });
    await complete;
    assert.equal(client.result?.status, 'qualified');
  }
  return { client, calls, respond, reject, body, qualified };
}

test('disabled online board remains local-only with no session or leaderboard requests', async (t) => {
  const { client, calls } = setup(t, false);
  client.begin(run());
  client.begin(run());
  await client.complete(record());
  assert.equal(client.result?.status, 'offline');
  assert.equal(client.result?.retryable, false);
  assert.match(client.result!.message, /personal|locally/i);
  await client.refresh();
  assert.equal(client.loading, false);
  assert.match(client.error, /deployed game/i);
  await client.submitName('Mauri');
  await client.retry();
  assert.equal(calls.length, 0);
});

test('one session per run; finish waits for it and never publishes a name before qualification', async (t) => {
  const { client, calls, respond, body } = setup(t);
  client.begin(run());
  client.begin(run());
  assert.equal(calls.length, 1);
  assert.deepEqual(body(0), {
    version: scoringDefaults.version,
    car: 'astra',
    seed: 42,
    category: 'standard',
  });
  assert.equal(calls[0].url, '/api/runs');
  assert.equal(calls[0].init?.method, 'POST');
  assert.equal(calls[0].init?.credentials, 'same-origin');
  assert.equal(calls[0].init?.cache, 'no-store');
  assert.ok(calls[0].init?.signal instanceof AbortSignal);
  assert.deepEqual(calls[0].init?.headers, {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  });
  const complete = client.complete(record());
  await client.complete(record());
  await client.submitName('Too early');
  assert.equal(client.result?.status, 'checking');
  assert.equal(calls.length, 1);
  respond(0, session);
  await flush();
  assert.equal(calls.length, 2);
  assert.equal(calls[1].url, `/api/runs/${session.runId}/finish`);
  assert.deepEqual(body(1), { token: capability, record: record() });
  respond(1, { qualified: false, rank: null });
  await complete;
  assert.equal(client.result?.status, 'not-qualified');
  await client.submitName('Not qualified');
  await client.complete(record());
  assert.equal(calls.length, 2);
});

test('finish snapshots the completed record before waiting for its session', async (t) => {
  const { client, calls, respond, body } = setup(t);
  const row = record();
  client.begin(run(row));
  const complete = client.complete(row);
  row.score = 0;
  row.cars.push('renault-12');
  respond(0, session);
  await flush();
  assert.equal(calls.length, 2);
  assert.deepEqual(body(1).record, record(), 'async boundaries must not mutate a submitted run');
  respond(1, { qualified: true, rank: 1 });
  await complete;
});

test('a failed session keeps the score local and cannot create a retroactive online run', async (t) => {
  const { client, calls, reject } = setup(t);
  client.begin(run());
  const complete = client.complete(record());
  reject(0);
  await complete;
  assert.equal(client.result?.status, 'offline');
  assert.equal(client.result?.retryable, false);
  assert.match(client.result!.message, /started offline.*saved locally/i);
  await client.retry();
  assert.equal(calls.length, 1);
});

test('finish failure offers an idempotent retry using the same session and exact record', async (t) => {
  const { client, calls, respond, reject, body } = setup(t);
  client.begin(run());
  respond(0, session);
  const complete = client.complete(record());
  await flush();
  reject(1);
  await complete;
  assert.equal(client.result?.status, 'offline');
  assert.equal(client.result?.retryable, true);
  const retry = client.retry();
  await client.retry();
  await flush();
  assert.equal(calls.length, 3, 'duplicate retry clicks send only one request');
  assert.equal(calls[2].url, calls[1].url);
  assert.deepEqual(body(2), body(1));
  respond(2, { qualified: true, rank: 10 });
  await retry;
  assert.equal(client.result?.status, 'qualified');
  assert.equal(client.result?.rank, 10);
});

test('reset and a newer run suppress stale session and finish completions', async (t) => {
  const { client, calls, respond } = setup(t);
  client.begin(run());
  const old = client.complete(record());
  client.reset();
  client.begin(run(record('run-2')));
  respond(0, session);
  await old;
  assert.equal(client.result, null);
  assert.equal(calls.length, 2, 'old pending session never sends finish');
  const second = client.complete(record('run-2'));
  respond(1, { ...session, runId: 'c00feeed-0000-4000-8000-000000000002' });
  await flush();
  client.begin(run(record('run-3')));
  respond(2, { qualified: true, rank: 1 });
  await second;
  assert.equal(client.result, null, 'old finish cannot open a name prompt over another run');
  await client.complete(record('run-2'));
  assert.equal(client.result, null);
});

test('name saving rechecks current rank, publishes only once, and refreshes the combined board', async (t) => {
  const { client, calls, respond, body, qualified } = setup(t);
  await qualified(record('run-1', 'custom'));
  const first = client.submitName('José Drift');
  const second = client.submitName('José Drift');
  await flush();
  assert.equal(calls.length, 3, 'rapid double-submit must not publish the same name twice');
  assert.equal(client.result?.status, 'saving');
  assert.equal(calls[2].url, `/api/runs/${session.runId}/name`);
  assert.deepEqual(body(2), { token: capability, name: 'José Drift' });
  respond(2, { qualified: true, rank: 5 });
  await Promise.all([first, second]);
  assert.equal(client.result?.status, 'saved');
  assert.equal(client.result?.rank, 5, 'rank may move between finishing and naming');
  assert.equal(calls[3].url, '/api/leaderboard');
  respond(3, board([{ name: 'José Drift', record: record('run-1', 'custom') }]));
  await flush();
  assert.equal(client.entries[0].name, 'José Drift');
  await client.submitName('Another name');
  assert.equal(calls.length, 4);
});

test('losing the tenth place before naming closes the prompt without losing the local record', async (t) => {
  const { client, calls, respond, qualified } = setup(t);
  await qualified();
  const save = client.submitName('Mauri');
  await flush();
  respond(2, { qualified: false, rank: null });
  await save;
  assert.equal(client.result?.status, 'not-qualified');
  assert.equal(client.result?.recordId, 'run-1');
  assert.equal(client.result?.rank, null);
  assert.match(client.result!.message, /personal record.*saved/i);
  respond(3, board());
  await flush();
  await client.submitName('Mauri');
  assert.equal(calls.length, 4);
});

test('name errors preserve qualification, present a bounded error, and allow retry', async (t) => {
  const { client, calls, respond, qualified } = setup(t);
  await qualified();
  const first = client.submitName('!');
  await flush();
  respond(2, { error: 'Choose a different name. '.repeat(20) }, 400);
  await first;
  assert.equal(client.result?.status, 'qualified');
  assert.equal(client.result?.message.length, 200);
  const retry = client.submitName('Mauri');
  await flush();
  assert.equal(calls.length, 4);
  respond(3, { qualified: true, rank: 3 });
  await retry;
  assert.equal(client.result?.status, 'saved');
  respond(4, board());
});

test('stale name completion cannot replace a newly reset run or refresh its board', async (t) => {
  const { client, calls, respond, qualified } = setup(t);
  await qualified();
  const save = client.submitName('Mauri');
  await flush();
  client.reset();
  respond(2, { qualified: true, rank: 1 });
  await save;
  assert.equal(client.result, null);
  assert.equal(calls.length, 3);
});

test('finishing a name submission refreshes the combined board after a pending refresh', async (t) => {
  const { client, calls, respond, qualified } = setup(t);
  await qualified();
  const save = client.submitName('Mauri');
  await flush();
  const custom = client.refresh();
  respond(3, board([{ name: 'Custom driver', record: record('custom', 'custom') }]));
  await custom;
  respond(2, { qualified: true, rank: 3 });
  await save;
  for (let index = 4; index < calls.length; index++) {
    assert.equal(calls[index].url, '/api/leaderboard');
    respond(index, board([{ name: 'Custom driver', record: record('custom', 'custom') }]));
  }
  await flush();
  assert.deepEqual(
    client.entries.map((entry) => entry.record.category),
    ['custom'],
  );
});

test('overlapping refreshes keep only the latest result and loading state', async (t) => {
  const { client, calls, respond } = setup(t);
  const standard = client.refresh();
  const custom = client.refresh();
  assert.equal(client.loading, true);
  respond(0, board([{ name: 'Old', record: record() }]));
  await standard;
  assert.equal(client.loading, true, 'an old request cannot clear the new loading state');
  assert.deepEqual(client.entries, []);
  respond(1, board([{ name: 'Current', record: record('custom', 'custom') }]));
  await custom;
  assert.equal(client.loading, false);
  assert.equal(client.error, '');
  assert.deepEqual(
    client.entries.map((entry) => entry.name),
    ['Current'],
  );
  const older = client.refresh();
  const newer = client.refresh();
  respond(3, board([{ name: 'Latest', record: record() }]));
  await newer;
  respond(2, { error: 'Stale failure' }, 503);
  await older;
  assert.equal(client.error, '');
  assert.equal(client.entries[0].name, 'Latest');
  assert.equal(calls[3].init?.method, 'GET');
  assert.equal(calls[3].init?.body, undefined);
});

test('list transport failures and incompatible responses are recoverable and never show stale rows', async (t) => {
  const { client, respond } = setup(t);
  const first = client.refresh();
  respond(0, '<html>Vite fallback page</html>', 200, 'text/html');
  await first;
  assert.equal(client.loading, false);
  assert.match(client.error, /unavailable/i);
  assert.deepEqual(client.entries, []);
  for (const [i, invalid] of [
    null,
    { ...board(), entries: null },
    board(Array.from({ length: 11 }, () => ({ name: 'Driver', record: record() }))),
  ].entries()) {
    const pending = client.refresh();
    respond(i + 1, invalid);
    await pending;
    assert.match(client.error, /incompatible/i);
  }
  const recovered = client.refresh();
  respond(4, board([{ name: 'Driver', record: record() }]));
  await recovered;
  assert.equal(client.error, '');
  assert.equal(client.entries.length, 1);
});

test('public rows whitelist score fields; session tokens stay in request bodies and never touch storage', async (t) => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  let storageReads = 0;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() {
      storageReads++;
      throw new Error('The online client must not touch local storage');
    },
  });
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  });
  const { client, calls, respond, qualified } = setup(t);
  await qualified();
  const list = client.refresh();
  respond(
    2,
    board([
      {
        name: 'Driver',
        token: capability,
        record: { ...record(), token: capability, html: '<script>' },
      },
      { name: 'Custom driver', record: record('custom', 'custom') },
      { name: 'Invalid score', record: { ...record(), score: Infinity } },
      { name: 'x'.repeat(41), record: record('long') },
    ]),
  );
  await list;
  assert.deepEqual(client.entries, [
    { name: 'Driver', record: record() },
    { name: 'Custom driver', record: record('custom', 'custom') },
  ]);
  assert.equal(
    JSON.stringify({ result: client.result, entries: client.entries }).includes(capability),
    false,
  );
  assert.ok(calls.every((call) => !call.url.includes(capability)));
  assert.equal(storageReads, 0);
});

test('subscriptions unsubscribe cleanly and disposal suppresses deferred async updates', async (t) => {
  const { client, respond } = setup(t);
  let changes = 0;
  const unsubscribe = client.subscribe(() => changes++);
  client.begin(run());
  assert.ok(changes > 0);
  const beforeUnsubscribe = changes;
  unsubscribe();
  const complete = client.complete(record());
  assert.equal(changes, beforeUnsubscribe);
  const pending = client.refresh();
  const snapshot = structuredClone(client.result);
  client.dispose();
  respond(0, session);
  respond(1, board([{ name: 'Too late', record: record() }]));
  await Promise.all([complete, pending]);
  assert.deepEqual(client.result, snapshot);
  assert.deepEqual(client.entries, []);
  assert.equal(changes, beforeUnsubscribe);
});

test('the all-time board displays old and new records without a matching response version', async (t) => {
  const { client, respond } = setup(t);
  const entries = [
    { name: 'Older driver', record: { ...record('older', 'custom'), version: 1 } },
    { name: 'Current driver', record: record('current') },
    {
      name: 'Future driver',
      record: { ...record('future'), version: scoringDefaults.version + 1 },
    },
  ];
  const list = client.refresh();
  respond(0, board(entries));
  await list;
  assert.equal(client.error, '');
  assert.deepEqual(client.entries, entries);
});
