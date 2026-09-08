import assert from 'node:assert/strict';
import test from 'node:test';
import type { Settings } from '../src/config.ts';
import { worldDefaults } from '../src/config/world.ts';
import { emptyPaints } from '../src/config/paint.ts';
import { initialState } from '../src/game/driving.ts';
import { initialChallenge } from '../src/game/challenge.ts';
import {
  parseReplay,
  ReplayRecorder,
  replayDuration,
  sampleReplay,
  replaySampleRate,
} from '../src/game/replay.ts';

const settings: Settings = {
  ...worldDefaults,
  units: 'auto',
  style: 'coastal',
  car: 'astra',
  paint: emptyPaints(),
  seed: 42,
  curves: 1,
  curveLength: 1,
  curveMix: 0.5,
  roadWidth: 10,
  grade: 0.09,
  terrainHeight: 1,
  treeDensity: 1,
  roundness: 0.65,
  fog: 0.5,
  cruiseSpeed: 36,
  maxSpeed: 280,
  drift: 0.55,
  smoke: 0.65,
  pixelRatio: 1,
};
const input = { brake: false, frontView: false };
const normalize = (s: Partial<Settings>) => ({ ...settings, ...s });

function fixture() {
  const recorder = new ReplayRecorder();
  const state = initialState();
  const challenge = initialChallenge(settings, state);
  recorder.capture(0, settings, state, input, challenge);
  state.distance += 1;
  state.speed = 10;
  challenge.traffic[0].distance += 2;
  challenge.score.points = 25;
  recorder.capture(0.1, settings, state, { brake: true, frontView: true }, challenge);
  return { recorder, state, challenge, replay: recorder.snapshot('challenge')! };
}

test('replay snapshots preserve car, traffic, camera and points without retaining live state', () => {
  const { state, challenge, replay } = fixture();
  const first = sampleReplay(replay, 0);
  state.distance = 999;
  challenge.traffic[0].distance = 999;
  challenge.score.points = 999;
  assert.equal(first.state.distance, 20);
  assert.equal(first.challenge!.score.points, 0);
  const last = sampleReplay(replay, replayDuration(replay));
  assert.equal(last.state.distance, 21);
  assert.notEqual(last.challenge!.traffic[0].distance, 999);
  assert.equal(last.challenge!.score.points, 25);
  assert.equal(last.frontView, true);
  assert.equal(last.brake, true);
  last.state.distance = 500;
  last.challenge!.traffic[0].offset = 50;
  assert.equal(sampleReplay(replay, 0.1).state.distance, 21);
  assert.notEqual(sampleReplay(replay, 0.1).challenge!.traffic[0].offset, 50);
});

test('seek interpolates car and matching traffic but snaps across incidents, respawns and edits', () => {
  const { replay } = fixture();
  assert.equal(sampleReplay(replay, 0.05).state.distance, 20.5);
  assert.equal(
    sampleReplay(replay, 0.05).challenge!.traffic[0].distance,
    replay.frames[0].challenge!.traffic[0].distance + 1,
  );
  replay.frames[1].challenge!.phase = 'falling';
  assert.equal(sampleReplay(replay, 0.05).state.distance, 20);
  replay.frames[1].challenge!.phase = 'racing';
  replay.frames[1].state.distance = 100;
  assert.equal(sampleReplay(replay, 0.05).state.distance, 20);
  replay.frames[1].state.distance = 21;
  replay.setups.push({ ...settings, seed: 99 });
  replay.frames[1].setup = 1;
  assert.equal(sampleReplay(replay, 0.05).state.distance, 20);
  assert.equal(sampleReplay(replay, 0.1).settings.seed, 99);
});

test('endpoints replace equal timestamps; reset clears the previous run', () => {
  const { recorder, state, challenge } = fixture();
  state.distance = 22;
  recorder.capture(0, settings, state, input, challenge, true);
  const replay = recorder.snapshot('challenge')!;
  assert.equal(replay.frames.length, 2);
  assert.equal(replay.frames[1].state.distance, 22);
  assert.equal(replayDuration(replay), 0.1);
  recorder.reset();
  assert.equal(recorder.available, false);
  assert.equal(recorder.snapshot('challenge'), null);
});

test('an endpoint immediately after a regular sample still produces a loadable file', () => {
  const recorder = new ReplayRecorder();
  const state = initialState();
  recorder.capture(0, settings, state, input);
  recorder.capture(0.05, settings, state, input);
  recorder.capture(0.00002, settings, state, input);
  recorder.capture(0, settings, state, input, undefined, true);
  const replay = recorder.snapshot('cozy')!;
  assert.deepEqual(parseReplay(JSON.stringify(replay), normalize), replay);
});

test('long drives retain at most ten minutes with ordered times and reusable setups', () => {
  const recorder = new ReplayRecorder();
  const state = initialState();
  for (let i = 0; i < 45000; i++) {
    state.distance += 0.5;
    recorder.capture(1 / replaySampleRate, settings, state, input);
  }
  const replay = recorder.snapshot('cozy')!;
  assert.ok(replay.frames.length <= 36002);
  assert.equal(replay.setups.length, 1);
  assert.equal(replay.frames[0].time, 0);
  assert.ok(replay.frames[0].state.distance > 1000);
  assert.ok(replayDuration(replay) <= 600);
  assert.ok(replayDuration(replay) >= 599.9);
  assert.deepEqual(parseReplay(JSON.stringify(replay), normalize), replay);
});

test('new recordings retain sixty motion samples per second for smooth video export', () => {
  const recorder = new ReplayRecorder();
  const state = initialState();
  recorder.capture(0, settings, state, input);
  for (let i = 0; i < 120; i++) {
    state.distance += 0.1;
    recorder.capture(1 / 120, settings, state, input);
  }
  const replay = recorder.snapshot('cozy')!;
  assert.equal(replay.frames.length, 61);
  assert.equal(new Set(replay.frames.map((f) => f.state.distance)).size, 61);
});

test('slightly uneven display frames do not reduce the motion recording cadence', () => {
  const recorder = new ReplayRecorder();
  const state = initialState();
  recorder.capture(0, settings, state, input);
  // Substeps produced by 360 display frames of 16.6 ms: none lands exactly
  // on a 1/60-second boundary, which must not accumulate sampling drift.
  let elapsed = 0;
  for (let frame = 0; frame < 360; frame++) {
    for (const dt of [1 / 120, 0.0166 - 1 / 120]) {
      elapsed += dt;
      state.distance += dt * 10;
      recorder.capture(dt, settings, state, input);
    }
  }
  const replay = recorder.snapshot('cozy')!;
  assert.equal(replay.frames.length, Math.floor(elapsed * replaySampleRate) + 1);
  for (let i = 1; i < replay.frames.length; i++) {
    assert.ok(replay.frames[i].time - replay.frames[i - 1].time <= 1 / 60 + 1 / 120 + 1e-8);
  }
});

test('saved challenge replay round-trips and rejects malformed or unsafe renderer inputs', () => {
  const { replay } = fixture();
  assert.deepEqual(parseReplay(JSON.stringify(replay), normalize), replay);
  for (const mutate of [
    (r: any) => {
      r.version = 2;
    },
    (r: any) => {
      r.frames = [];
    },
    (r: any) => {
      r.frames[1].time = 0;
    },
    (r: any) => {
      r.frames[1].time = 601;
    },
    (r: any) => {
      r.frames[1].setup = 100;
    },
    (r: any) => {
      r.frames[1].state.speed = null;
    },
    (r: any) => {
      r.frames[1].state.distance = 1e100;
    },
    (r: any) => {
      r.frames[1].state.offset = 1000;
    },
    (r: any) => {
      r.frames[1].challenge = null;
    },
    (r: any) => {
      r.frames[1].challenge.phase = 'invented';
    },
    (r: any) => {
      r.frames[1].challenge.traffic[0].car = '__proto__';
    },
    (r: any) => {
      r.frames[1].challenge.traffic[0].color = '<script>';
    },
    (r: any) => {
      r.frames[1].challenge.traffic[0].lane = 0;
    },
    (r: any) => {
      r.frames[1].challenge.traffic.push(r.frames[1].challenge.traffic[0]);
    },
  ]) {
    const invalid = structuredClone(replay);
    mutate(invalid);
    assert.throws(() => parseReplay(JSON.stringify(invalid), normalize));
  }
});
