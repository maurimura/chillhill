import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWorld, worldDefaults, type WorldSettings } from '../src/config/world.ts';
import {
  createWorldClock,
  stepWorldClock,
  syncWorldClock,
  worldClockTelemetry,
} from '../src/game/world-clock.ts';

function simulation(patch: Partial<WorldSettings> = {}) {
  let settings = { ...worldDefaults, ...patch };
  const clock = createWorldClock(settings);
  return {
    clock,
    get settings() {
      return settings;
    },
    step(dt: number, random = () => 0.5) {
      const next = stepWorldClock(clock, settings, dt, random);
      settings = { ...settings, ...next };
      return next;
    },
    choose(patch: Partial<WorldSettings>) {
      settings = normalizeWorld(patch, settings);
      syncWorldClock(clock, patch, settings);
    },
  };
}

test('ten-minute days contain four 150-second phases and wrap without timer drift', () => {
  const world = simulation({ autoWeather: false });
  for (const next of ['sunset', 'night', 'dawn', 'day']) {
    assert.deepEqual(world.step(149.9), {});
    assert.equal(world.step(0.1).timeOfDay, next);
    assert.equal(world.clock.phaseSeconds, 0);
  }
  assert.equal(world.clock.daysCompleted, 1);
  assert.equal(world.clock.phaseTransitions, 4);
  assert.equal(world.clock.daySeconds, 0);
  assert.equal(world.clock.elapsedSeconds, 600);
});

test('all four seasons advance every three complete driving days', () => {
  const world = simulation({ autoWeather: false });
  for (const next of ['autumn', 'winter', 'spring', 'summer']) {
    assert.equal(world.step(1799).season, undefined);
    assert.equal(world.step(1).season, next);
    assert.equal(world.settings.timeOfDay, 'day');
    assert.equal(world.clock.seasonSeconds, 0);
  }
  assert.equal(world.clock.daysCompleted, 12);
});

test('blue hour stays selectable and advances to moonlight on its next interval', () => {
  const world = simulation({ timeOfDay: 'dusk', autoWeather: false });
  assert.equal(world.step(150).timeOfDay, 'night');
  assert.equal(world.step(150).timeOfDay, 'dawn');
});

test('weather runs on its own interval, even while daylight and seasons are held', () => {
  const world = simulation({ autoTime: false });
  assert.deepEqual(world.step(150), {});
  assert.equal(world.step(60).weather, 'rain');
  assert.equal(world.settings.timeOfDay, 'day');
  assert.equal(world.settings.season, 'summer');
  assert.equal(world.clock.phaseSeconds, 0);
  assert.equal(world.clock.daysCompleted, 0);
  assert.equal(world.clock.weatherChanges, 1);
  assert.equal(world.step(210).weather, 'clear');
});

test('changing phases never forces a weather event', () => {
  const world = simulation();
  assert.deepEqual(world.step(150), { timeOfDay: 'sunset' });
  assert.deepEqual(world.step(60), { weather: 'rain' });
  assert.equal(world.settings.timeOfDay, 'sunset');
  assert.equal(world.clock.phaseSeconds, 60);
});

test('winter weather can snow without coupling weather changes to season boundaries', () => {
  const world = simulation({ season: 'autumn', weatherDuration: 200, autoTime: true });
  for (let i = 0; i < 8; i++) world.step(200, () => 0.99);
  assert.equal(world.settings.season, 'autumn');
  const boundary = world.step(200, () => 0.99);
  assert.equal(boundary.season, 'winter');
  assert.equal(boundary.weather, 'snow');
  assert.equal(world.settings.season, 'winter');
  world.choose({ season: 'summer', weather: 'clear' });
  assert.equal(world.step(200, () => 0.99).weather, 'rain');
});

test('holding seasons or weather leaves the other clock working and resumes its own progress', () => {
  const world = simulation({ autoSeasons: false, autoWeather: false });
  world.step(1800);
  assert.equal(world.settings.season, 'summer');
  assert.equal(world.clock.daysCompleted, 3);
  assert.equal(world.clock.seasonSeconds, 0);
  assert.equal(world.clock.weatherSeconds, 0);
  world.choose({ autoSeasons: true, autoWeather: true });
  world.step(100);
  world.choose({ autoSeasons: false, autoWeather: false });
  world.step(50);
  assert.equal(world.clock.seasonSeconds, 100);
  assert.equal(world.clock.weatherSeconds, 100);
  world.choose({ autoSeasons: true, autoWeather: true });
  world.step(110);
  assert.equal(world.clock.seasonSeconds, 210);
  assert.equal(world.clock.weatherChanges, 1);
});

test('manual picks rebase only their ingredient, including choosing the current value', () => {
  const world = simulation();
  world.step(140);
  world.choose({ timeOfDay: 'day' });
  assert.equal(world.clock.phaseSeconds, 0);
  assert.equal(world.clock.daySeconds, 140);
  assert.equal(world.clock.seasonSeconds, 140);
  assert.equal(world.clock.weatherSeconds, 140);
  assert.equal(world.step(10).timeOfDay, undefined);
  world.choose({ weather: 'snow' });
  assert.equal(world.clock.phaseSeconds, 10);
  assert.equal(world.clock.weatherSeconds, 0);
  world.choose({ season: 'winter' });
  assert.equal(world.clock.seasonSeconds, 0);
  assert.equal(world.clock.daySeconds, 150);
  world.step(140);
  assert.equal(world.settings.timeOfDay, 'sunset');
  assert.equal(world.settings.weather, 'snow');
});

test('stopped/paused callers can feed zero time without advancing any world state', () => {
  const world = simulation();
  world.step(149);
  const before = structuredClone(world.clock);
  for (const dt of [0, -1, NaN, Infinity, -Infinity]) assert.deepEqual(world.step(dt), {});
  assert.deepEqual(world.clock, before);
  assert.equal(world.step(1).timeOfDay, 'sunset');
});

test('timing controls support short test cycles and duration edits start fresh intervals', () => {
  const world = simulation({ dayDuration: 60, seasonDays: 1, weatherDuration: 30 });
  assert.equal(world.step(15).timeOfDay, 'sunset');
  assert.equal(world.step(45).season, 'autumn');
  world.step(7);
  world.choose({ dayDuration: 120 });
  assert.equal(world.clock.phaseSeconds, 0);
  assert.equal(world.clock.daySeconds, 0);
  assert.equal(world.clock.seasonSeconds, 0);
  assert.equal(world.clock.weatherSeconds, 7);
  world.choose({ weatherDuration: 60 });
  assert.equal(world.clock.weatherSeconds, 0);
  assert.equal(world.step(30).timeOfDay, 'sunset');
});

test('large steps and small fixed steps agree for calendar progression', () => {
  const whole = simulation({ autoWeather: false });
  const tiny = simulation({ autoWeather: false });
  whole.step(7521.25);
  for (let i = 0; i < 30085; i++) tiny.step(0.25);
  assert.deepEqual(whole.settings, tiny.settings);
  assert.deepEqual(whole.clock, tiny.clock);
});

test('telemetry exposes active elapsed time, counts, remaining time, and held clocks', () => {
  const world = simulation({ autoWeather: false });
  world.step(650);
  const info = worldClockTelemetry(world.clock, world.settings);
  assert.equal(info.elapsedSeconds, 650);
  assert.equal(info.day, 2);
  assert.equal(info.daysCompleted, 1);
  assert.equal(info.phaseTransitions, 4);
  assert.equal(info.phaseSeconds, 50);
  assert.equal(info.phaseProgress, 1 / 3);
  assert.equal(info.nextPhaseIn, 100);
  assert.equal(info.nextSeasonIn, 1150);
  assert.equal(info.nextWeatherIn, null);
  world.choose({ autoTime: false });
  assert.equal(worldClockTelemetry(world.clock, world.settings).nextPhaseIn, null);
  assert.equal(worldClockTelemetry(world.clock, world.settings).nextSeasonIn, null);
});

test('cycle defaults migrate old saves and normalize numeric and boolean environment values', () => {
  assert.deepEqual(normalizeWorld({}, worldDefaults), worldDefaults);
  const env = normalizeWorld(
    {
      dayDuration: '120',
      seasonDays: '2',
      weatherDuration: '90',
      autoTime: 'false',
      autoSeasons: '0',
      autoWeather: 'true',
    } as never,
    worldDefaults,
  );
  assert.equal(env.dayDuration, 120);
  assert.equal(env.seasonDays, 2);
  assert.equal(env.weatherDuration, 90);
  assert.equal(env.autoTime, false);
  assert.equal(env.autoSeasons, false);
  assert.equal(env.autoWeather, true);
  const invalid = normalizeWorld(
    { dayDuration: Infinity, seasonDays: NaN, weatherDuration: {}, autoTime: 'maybe' } as never,
    worldDefaults,
  );
  assert.deepEqual(invalid, worldDefaults);
  const clamped = normalizeWorld(
    { dayDuration: -500, seasonDays: 1000, weatherDuration: 10000 },
    worldDefaults,
  );
  assert.equal(clamped.dayDuration, 60);
  assert.equal(clamped.seasonDays, 30);
  assert.equal(clamped.weatherDuration, 1800);
  assert.equal(normalizeWorld({ seasonDays: 2.7 }, worldDefaults).seasonDays, 3);
});

test('random weather inputs remain safe at endpoints and invalid samples', () => {
  for (const random of [() => 0, () => 1, () => -1, () => NaN, () => Infinity]) {
    const world = simulation();
    const next = world.step(210, random).weather;
    assert.ok(next === 'overcast' || next === 'rain');
  }
});
