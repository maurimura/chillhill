import type { Settings } from '../config';
import { cars } from '../config/cars.ts';
import type { ChallengeState, TrafficVehicle } from './challenge.ts';
import type { DrivingMode, DrivingState } from './driving.ts';
import { initialScore } from './scoring.ts';

export const replaySeconds = 600;
export const replayFileLimit = 96 * 1024 * 1024;
export const replaySampleRate = 60;
const sampleInterval = 1 / replaySampleRate;
const capacity = replaySeconds * replaySampleRate + 2;
const stateKeys = [
  'distance',
  'travelled',
  'speed',
  'offset',
  'lateralSpeed',
  'slide',
  'yawVelocity',
  'driftAmount',
  'steering',
  'headingOffset',
] as const;
const rounded = (value: number) => Math.round(value * 10000) / 10000;

interface ReplayChallenge {
  phase: ChallengeState['phase'];
  recoveryProgress: number;
  lastIncident: ChallengeState['lastIncident'];
  offRoad: boolean;
  lives: number;
  points: number;
  traffic: TrafficVehicle[];
}
export interface ReplayFrame {
  time: number;
  setup: number;
  state: DrivingState;
  brake: boolean;
  frontView: boolean;
  challenge: ReplayChallenge | null;
}
export interface Replay {
  format: 'chillhill-replay';
  version: 1;
  mode: DrivingMode;
  setups: Settings[];
  frames: ReplayFrame[];
}
type RecordedFrame = Omit<ReplayFrame, 'setup'> & { settings: Settings };

/** Bounded snapshots of actual motion, independent of future physics changes.
 * Only active simulation time is supplied; menus and watching do not record. */
export class ReplayRecorder {
  private frames: RecordedFrame[] = [];
  private head = 0;
  private time = 0;
  private nextSample = 0;

  reset() {
    this.frames = [];
    this.head = this.time = this.nextSample = 0;
  }

  capture(
    dt: number,
    settings: Settings,
    state: DrivingState,
    input: { brake: boolean; frontView: boolean },
    challenge?: ChallengeState,
    force = false,
  ) {
    this.time += Math.max(0, dt);
    if (!force && this.time + 1e-8 < this.nextSample) return;
    // Keep a fixed sampling clock. Scheduling from the latest physics step
    // would drift down toward 40 Hz on displays running just below 60 fps.
    // Forced incident/end frames must not shift the regular sample cadence.
    if (this.time + 1e-8 >= this.nextSample)
      this.nextSample +=
        (Math.floor((this.time + 1e-8 - this.nextSample) / sampleInterval) + 1) * sampleInterval;
    const snapshot = Object.fromEntries(
      stateKeys.map((key) => [key, rounded(state[key] ?? 0)]),
    ) as unknown as DrivingState;
    const frame: RecordedFrame = {
      time: this.time,
      settings,
      state: snapshot,
      brake: input.brake,
      frontView: input.frontView,
      challenge: challenge
        ? {
            phase: challenge.phase,
            recoveryProgress: rounded(challenge.recoveryProgress),
            lastIncident: challenge.lastIncident,
            offRoad: challenge.offRoad.active,
            lives: challenge.lives,
            points: rounded(challenge.score.points),
            traffic: challenge.traffic.map((car) => ({
              id: car.id,
              car: car.car,
              color: car.color,
              lane: car.lane,
              passed: false,
              distance: rounded(car.distance),
              offset: rounded(car.offset),
              speed: rounded(car.speed),
            })),
          }
        : null,
    };
    const last = this.frames[(this.head + this.frames.length - 1) % capacity];
    // A pause/settings change can update the endpoint without adding elapsed time.
    if (last && Math.abs(last.time - frame.time) < 1e-8) {
      this.frames[(this.head + this.frames.length - 1) % capacity] = frame;
    } else if (this.frames.length < capacity) this.frames.push(frame);
    else {
      this.frames[this.head] = frame;
      this.head = (this.head + 1) % capacity;
    }
  }

  get available() {
    return this.frames.length > 1;
  }

  snapshot(mode: DrivingMode): Replay | null {
    if (!this.available) return null;
    const ordered = Array.from(
      { length: this.frames.length },
      (_, i) => this.frames[(this.head + i) % capacity],
    );
    const kept = ordered.filter((frame) => frame.time >= this.time - replaySeconds);
    if (kept.length < 2) return null;
    const setups: Settings[] = [];
    const indices = new Map<Settings, number>();
    const frames = kept.map(({ settings, ...frame }) => {
      let setup = indices.get(settings);
      if (setup === undefined) {
        setup = setups.length;
        indices.set(settings, setup);
        setups.push(structuredClone(settings));
      }
      // Preserve timestamp precision: an exact pause/incident endpoint can be
      // less than a rounding unit after the regular sample preceding it.
      return { ...frame, time: frame.time - kept[0].time, setup };
    });
    return { format: 'chillhill-replay', version: 1, mode, setups, frames };
  }
}

export const replayDuration = (replay: Replay) => replay.frames.at(-1)!.time;

/** Interpolate positions, but never bridge respawns, road edits or recycled cars. */
export function sampleReplay(replay: Replay, time: number) {
  const frames = replay.frames;
  let low = 0,
    high = frames.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (frames[mid].time <= time) low = mid;
    else high = mid - 1;
  }
  const a = frames[low],
    b = frames[Math.min(low + 1, frames.length - 1)];
  const continuous =
    a.setup === b.setup &&
    a.challenge?.phase === b.challenge?.phase &&
    Math.abs(b.state.distance - a.state.distance) <
      Math.max(3, a.state.speed * (b.time - a.time) * 2);
  const mix =
    continuous && b.time > a.time
      ? Math.max(0, Math.min(1, (time - a.time) / (b.time - a.time)))
      : 0;
  const lerp = (x: number, y: number) => x + (y - x) * mix;
  const state = { ...a.state };
  for (const key of stateKeys) state[key] = lerp(a.state[key] ?? 0, b.state[key] ?? 0);
  let challenge: ChallengeState | undefined;
  if (a.challenge) {
    const recorded = a.challenge;
    challenge = {
      phase: recorded.phase,
      lives: recorded.lives,
      overtakes: 0,
      score: { ...initialScore(), points: recorded.points },
      phaseTime: 0,
      recoveryProgress: lerp(
        recorded.recoveryProgress,
        b.challenge?.recoveryProgress ?? recorded.recoveryProgress,
      ),
      graceRemaining: 0,
      lastIncident: recorded.lastIncident,
      incidentSpeed: 0,
      incidentLateralSpeed: 0,
      nextTrafficId: 0,
      offRoad: {
        active: recorded.offRoad,
        side: 0,
        excursion: 0,
        exposure: 0,
        remaining: 0,
        rejoinTime: 0,
      },
      traffic: recorded.traffic.map((car) => {
        const next = b.challenge?.traffic.find(
          (other) => other.id === car.id && other.car === car.car,
        );
        return {
          ...car,
          distance: next ? lerp(car.distance, next.distance) : car.distance,
          offset: next ? lerp(car.offset, next.offset) : car.offset,
        };
      }),
    };
  }
  return {
    state,
    challenge,
    settings: replay.setups[a.setup],
    brake: a.brake,
    frontView: a.frontView,
  };
}

/** Validate the complete file before it reaches the renderer. No imported run
 * ever enters driving, score persistence or the leaderboard lifecycle. */
export function parseReplay(
  text: string,
  normalize: (settings: Partial<Settings>) => Settings,
): Replay {
  const fail = (): never => {
    throw new Error('This replay file is invalid or uses an unsupported version.');
  };
  if (new Blob([text]).size > replayFileLimit)
    throw new Error('Replay files must be smaller than 96 MB.');
  const value = JSON.parse(text);
  const object = (v: unknown): v is Record<string, any> =>
    !!v && typeof v === 'object' && !Array.isArray(v);
  const number = (v: unknown, min = -1e8, max = 1e8): v is number =>
    typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
  if (
    !object(value) ||
    value.format !== 'chillhill-replay' ||
    value.version !== 1 ||
    !['cozy', 'challenge'].includes(value.mode) ||
    !Array.isArray(value.setups) ||
    !value.setups.length ||
    value.setups.length > capacity ||
    !Array.isArray(value.frames) ||
    value.frames.length < 2 ||
    value.frames.length > capacity
  )
    fail();
  const setups = value.setups.map((s: unknown) => {
    if (!object(s)) return fail();
    return normalize(s);
  });
  let previous = -1;
  const frames = value.frames.map((f: unknown): ReplayFrame => {
    if (
      !object(f) ||
      !number(f.time, 0, replaySeconds) ||
      f.time <= previous ||
      !Number.isInteger(f.setup) ||
      f.setup < 0 ||
      f.setup >= setups.length ||
      typeof f.brake !== 'boolean' ||
      typeof f.frontView !== 'boolean' ||
      !object(f.state)
    )
      return fail();
    previous = f.time;
    for (const key of stateKeys) if (!number(f.state[key])) fail();
    if (
      !number(f.state.speed, 0, 100) ||
      !number(f.state.offset, -100, 100) ||
      !number(f.state.slide, -4, 4) ||
      !number(f.state.steering, -1.01, 1.01) ||
      !number(f.state.driftAmount, 0, 1.01)
    )
      fail();
    let challenge: ReplayChallenge | null = null;
    if (value.mode === 'challenge') {
      const c = f.challenge;
      if (
        !object(c) ||
        !['racing', 'crashed', 'falling', 'gameover'].includes(c.phase) ||
        ![null, 'bounds', 'traffic'].includes(c.lastIncident) ||
        typeof c.offRoad !== 'boolean' ||
        !number(c.recoveryProgress, 0, 1) ||
        !number(c.points, 0) ||
        !Number.isInteger(c.lives) ||
        c.lives < 0 ||
        c.lives > 3 ||
        !Array.isArray(c.traffic) ||
        c.traffic.length > 16
      )
        return fail();
      const ids = new Set<number>();
      const traffic = c.traffic.map((car: unknown): TrafficVehicle => {
        if (
          !object(car) ||
          !Number.isSafeInteger(car.id) ||
          car.id < 0 ||
          ids.has(car.id) ||
          typeof car.car !== 'string' ||
          !Object.hasOwn(cars, car.car) ||
          typeof car.color !== 'string' ||
          !/^#[\da-f]{6}$/i.test(car.color) ||
          !number(car.distance) ||
          !number(car.offset, -100, 100) ||
          !number(car.speed, 0, 100) ||
          ![-1, 1].includes(car.lane)
        )
          return fail();
        ids.add(car.id);
        return {
          id: car.id,
          car: car.car as TrafficVehicle['car'],
          color: car.color,
          distance: car.distance,
          offset: car.offset,
          speed: car.speed,
          lane: car.lane,
          passed: false,
        };
      });
      challenge = {
        phase: c.phase,
        recoveryProgress: c.recoveryProgress,
        lastIncident: c.lastIncident,
        offRoad: c.offRoad,
        lives: c.lives,
        points: c.points,
        traffic,
      };
    } else if (f.challenge !== null) fail();
    return {
      time: f.time,
      setup: f.setup,
      state: Object.fromEntries(
        stateKeys.map((key) => [key, f.state[key]]),
      ) as unknown as DrivingState,
      brake: f.brake,
      frontView: f.frontView,
      challenge,
    };
  });
  if (frames[0].time !== 0 || frames.at(-1)!.time <= 0) fail();
  return { format: 'chillhill-replay', version: 1, mode: value.mode, setups, frames };
}
