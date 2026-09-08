import test from 'node:test';
import assert from 'node:assert/strict';
import { scoringDefaults, standardDriving } from '../src/config/scoring.ts';
import { initialChallenge } from '../src/game/challenge.ts';
import { initialState } from '../src/game/driving.ts';
import { awardNearMiss } from '../src/game/scoring.ts';
import {
  completedScore,
  createScoreRun,
  rankScores,
  readScores,
  ScoreboardStore,
  scoreStorageKey,
  trackScoreSettings,
  type ScoreRecord,
} from '../src/scoreboard.ts';

const settings = {
  ...standardDriving,
  car: 'astra' as const,
  cruiseSpeed: 36,
  terrainHeight: 1,
  seed: 42,
};
function record(
  id = 'test-1',
  score = 100,
  category: 'standard' | 'custom' = 'standard',
): ScoreRecord {
  return {
    version: scoringDefaults.version,
    id,
    score,
    earned: score + 10,
    nearMissEarned: score + 10,
    driftEarned: 0,
    driftSeconds: 0,
    bestDriftSeconds: 0,
    penalties: 10,
    category,
    car: 'astra',
    cars: ['astra'],
    customReasons: category === 'custom' ? ['setup'] : [],
    seed: 42,
    nearMisses: 3,
    bestStreak: 2,
    shoulderTouches: 1,
    shoulderSeconds: 0.2,
    distance: 1000,
    duration: 90,
    topSpeed: 80,
    averageSpeed: 40,
    finishedAt: '2026-09-07T12:00:00.000Z',
  };
}
function storage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

test('Standard uses canonical physics, allowing any starting car/seed and visual preferences', () => {
  assert.equal(standardDriving.maxSpeed, 280);
  assert.equal(scoringDefaults.version, 6);
  assert.equal(createScoreRun({ ...settings, maxSpeed: 110 }).category, 'custom');
  const run = createScoreRun(settings, 'run');
  assert.equal(run.category, 'standard');
  const visual = {
    ...settings,
    units: 'imperial',
    style: 'alpine',
    paint: {},
    terrainHeight: 2,
    landscape: 'city',
  };
  trackScoreSettings(run, settings, visual);
  assert.equal(run.category, 'standard');
  assert.equal(
    createScoreRun({ ...settings, seed: 9856, car: 'peugeot-206' }).category,
    'standard',
  );
  for (const [key, value] of Object.entries(standardDriving)) {
    assert.equal(
      createScoreRun({ ...settings, [key]: value * 0.9 }, 'run').category,
      'custom',
      key,
    );
  }
});

test('legacy settings inherit default curve length without a false mid-run tuning change', () => {
  const legacy = { ...settings, curveLength: undefined };
  const run = createScoreRun(legacy);
  trackScoreSettings(run, legacy, { ...settings, curveLength: 1 });
  assert.equal(run.category, 'standard');
  trackScoreSettings(run, { ...settings, curveLength: 1 }, { ...settings, curveLength: 1.4 });
  assert.equal(run.category, 'custom');
  assert.deepEqual(run.customReasons, ['tuning']);
});

test('older saves inherit balanced curve mix and manual mix changes are Custom', () => {
  const legacy = { ...settings, curveMix: undefined };
  const run = createScoreRun(legacy);
  trackScoreSettings(run, legacy, { ...settings, curveMix: 0.5 });
  assert.equal(run.category, 'standard');
  trackScoreSettings(run, { ...settings, curveMix: 0.5 }, { ...settings, curveMix: 0.8 });
  assert.equal(run.category, 'custom');
  assert.deepEqual(run.customReasons, ['tuning']);
});

test('mid-run difficulty/car/route changes permanently classify Custom without growing metadata', () => {
  for (const patch of [
    { car: 'peugeot-206' },
    { seed: 73 },
    { roadWidth: 14 },
    { curveLength: 1.5 },
    { curveMix: 0.8 },
  ]) {
    const run = createScoreRun(settings, 'run');
    const changed = { ...settings, ...patch };
    for (let i = 0; i < 50; i++) {
      trackScoreSettings(run, settings, changed);
      trackScoreSettings(run, changed, settings);
    }
    assert.equal(run.category, 'custom');
    assert.equal(run.customReasons.length, 1);
    assert.ok(run.cars.length <= 2);
    assert.equal(run.seed, 42, 'retain the starting route');
  }
});

test('only game over creates a detached record with a consistent score breakdown', () => {
  const run = createScoreRun(settings, 'run');
  const challenge = initialChallenge(settings, initialState());
  awardNearMiss(challenge.score, 90);
  challenge.overtakes = 1;
  assert.equal(completedScore(run, challenge, 100), null);
  challenge.phase = 'falling';
  assert.equal(completedScore(run, challenge, 100), null);
  challenge.phase = 'gameover';
  challenge.score.points -= 12.6;
  challenge.score.penalties += 12.6;
  const row = completedScore(run, challenge, 1234)!;
  assert.equal(row.score, 137);
  assert.equal(row.earned - row.penalties, row.score);
  assert.equal(row.averageSpeed, 0, 'zero moving time stays finite');
  trackScoreSettings(run, settings, { ...settings, car: 'peugeot-206' });
  assert.equal(row.category, 'standard');
  assert.deepEqual(row.cars, ['astra']);
});

test('one combined top ten is sorted, deduplicated, and ties use misses then earlier completion', () => {
  const rows = Array.from({ length: 30 }, (_, i) =>
    record(`id-${i}`, i * 10, i % 2 ? 'standard' : 'custom'),
  );
  const ranked = rankScores([...rows, ...rows]);
  assert.equal(ranked.length, 10);
  assert.equal(ranked.filter((row) => row.category === 'standard').length, 5);
  assert.deepEqual(
    ranked.map((row) => row.score),
    [290, 280, 270, 260, 250, 240, 230, 220, 210, 200],
  );
  assert.deepEqual(
    rankScores([
      { ...record('late'), finishedAt: '2026-09-08T12:00:00Z' },
      record('early'),
      { ...record('misses', 100, 'custom'), nearMisses: 4 },
    ]).map((row) => row.id),
    ['misses', 'early', 'late'],
  );
});

test('local records survive reload, merge across tabs, and do not duplicate on save', () => {
  const disk = storage();
  const a = new ScoreboardStore(disk),
    b = new ScoreboardStore(disk);
  assert.equal(a.save(record('first')).personalBest, true);
  assert.equal(b.save(record('second', 120)).personalBest, true);
  const custom = a.save(record('custom', 50, 'custom'));
  assert.equal(custom.personalBest, false);
  assert.equal(custom.rank, 3);
  assert.equal(a.save(record('first')).personalBest, false);
  const reload = new ScoreboardStore(disk);
  assert.equal(reload.records.length, 3);
  assert.equal(reload.records[0].score, 120);
  assert.equal(a.save(record('tie', 120)).personalBest, false);
  assert.equal(new ScoreboardStore(disk).records.length, 4);
  assert.equal(new ScoreboardStore(storage()).save(record('zero', 0)).personalBest, false);
});

test('blocked storage and quota failures retain a bounded session board without throwing', () => {
  const store = new ScoreboardStore({
    getItem() {
      throw new Error('blocked');
    },
    setItem() {
      throw new Error('quota');
    },
  });
  for (let i = 0; i < 100; i++) assert.equal(store.save(record(`id-${i}`, i)).persisted, false);
  assert.equal(store.records.length, 10);
  assert.equal(store.records[0].score, 99);
});

test('existing private category boards load as one top ten under the same storage key', () => {
  const disk = storage();
  disk.setItem(
    scoreStorageKey,
    JSON.stringify({
      version: scoringDefaults.version,
      records: Array.from({ length: 20 }, (_, i) =>
        record(`old-${i}`, i * 10, i % 2 ? 'custom' : 'standard'),
      ),
    }),
  );
  const store = new ScoreboardStore(disk);
  assert.deepEqual(
    store.records.map((row) => row.score),
    [190, 180, 170, 160, 150, 140, 130, 120, 110, 100],
  );
});

test('corrupt, oversized or forged-shape records are discarded safely', () => {
  const disk = storage();
  for (const raw of ['{', 'null', '[]', '{"version":1,"records":null}', ' '.repeat(100001)]) {
    disk.setItem(scoreStorageKey, raw);
    assert.deepEqual(readScores(disk), []);
  }
  const invalid = [
    { ...record(), version: 0 },
    { ...record(), score: NaN },
    { ...record(), score: -1 },
    { ...record(), car: '__proto__' },
    { ...record(), id: '<img onerror=alert(1)>' },
    { ...record(), finishedAt: 'invalid' },
    { ...record(), earned: 0 },
    { ...record(), cars: Array(100).fill('astra') },
    { ...record(), customReasons: ['car'] },
    { ...record(), car: ['astra'] },
    { ...record(), car: { toString: null } },
    { ...record('invalid-custom', 100, 'custom'), customReasons: [['tuning']] },
  ];
  assert.deepEqual(rankScores(invalid), []);
  disk.setItem(scoreStorageKey, JSON.stringify({ version: 1, records: [record()] }));
  assert.deepEqual(readScores(disk), [record()]);
  disk.setItem(
    scoreStorageKey,
    JSON.stringify({ version: scoringDefaults.version, records: [record(), ...invalid] }),
  );
  assert.equal(readScores(disk).length, 1);
});

test('private scores merge across versions and persist under one permanent key', () => {
  const disk = storage();
  const originals = new Map<string, string>();
  for (let version = 1; version <= scoringDefaults.version; version++) {
    const key = `chillhill.scores.v${version}`;
    const value = JSON.stringify({
      version,
      records: [{ ...record(`old-${version}`, 1000 - version), version }],
    });
    originals.set(key, value);
    disk.setItem(key, value);
  }
  const store = new ScoreboardStore(disk);
  assert.equal(scoreStorageKey, 'chillhill.scores');
  assert.equal(store.records[0].version, 1);
  assert.equal(store.save(record('new-game', 10)).personalBest, false);
  for (const [key, value] of originals) assert.equal(disk.getItem(key), value);
  const saved = JSON.parse(disk.getItem(scoreStorageKey)!);
  assert.equal(Object.hasOwn(saved, 'version'), false);
  assert.deepEqual(new ScoreboardStore(disk).records, store.records);
});

test('records with older or future version metadata still compete while malformed scores stay invalid', () => {
  const rows = [
    { ...record('older', 200), version: 1 },
    record('current', 150),
    { ...record('future', 250), version: scoringDefaults.version + 1 },
  ];
  assert.deepEqual(
    rankScores(rows).map((row) => row.id),
    ['future', 'older', 'current'],
  );
  for (const version of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
    assert.deepEqual(rankScores([{ ...record(), version }]), []);
});

test('corrupt saves do not hide valid scores in other versioned keys', () => {
  const disk = storage();
  disk.setItem(scoreStorageKey, '{');
  disk.setItem('chillhill.scores.v1', 'null');
  const older = { ...record('older'), version: 2 };
  disk.setItem('chillhill.scores.v2', JSON.stringify({ version: 2, records: [older] }));
  assert.deepEqual(readScores(disk), [older]);
});
