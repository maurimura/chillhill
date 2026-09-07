import type { WorldSettings } from '../config/world.ts';

/** Blue hour remains a manual choice; its next automatic phase is moonlight. */
export const dayPhases = ['day', 'sunset', 'night', 'dawn'] as const;
export const yearSeasons = ['spring', 'summer', 'autumn', 'winter'] as const;

export interface WorldClock {
  elapsedSeconds: number;
  daySeconds: number;
  phaseSeconds: number;
  seasonSeconds: number;
  weatherSeconds: number;
  daysCompleted: number;
  phaseTransitions: number;
  weatherChanges: number;
}

export function createWorldClock(_settings?: WorldSettings): WorldClock {
  return {
    elapsedSeconds: 0,
    daySeconds: 0,
    phaseSeconds: 0,
    seasonSeconds: 0,
    weatherSeconds: 0,
    daysCompleted: 0,
    phaseTransitions: 0,
    weatherChanges: 0,
  };
}

/** Reset only the hand-picked ingredient's timer, even when its value is unchanged. */
export function syncWorldClock(
  clock: WorldClock,
  manualPatch: Partial<WorldSettings>,
  _settings?: WorldSettings,
) {
  if (Object.hasOwn(manualPatch, 'timeOfDay')) clock.phaseSeconds = 0;
  if (Object.hasOwn(manualPatch, 'season') || Object.hasOwn(manualPatch, 'seasonDays'))
    clock.seasonSeconds = 0;
  if (Object.hasOwn(manualPatch, 'weather') || Object.hasOwn(manualPatch, 'weatherDuration'))
    clock.weatherSeconds = 0;
  if (Object.hasOwn(manualPatch, 'dayDuration')) {
    clock.daySeconds = 0;
    clock.phaseSeconds = 0;
    clock.seasonSeconds = 0;
  }
}

function chooseWeather(settings: WorldSettings, random: () => number): WorldSettings['weather'] {
  const arid = settings.landscape === 'desert';
  const weights: [WorldSettings['weather'], number][] = [
    ['clear', arid ? 7 : 4],
    ['overcast', 3],
    [settings.season === 'winter' ? 'snow' : 'rain', arid ? 0.6 : 3],
  ];
  const choices = weights.filter(([weather]) => weather !== settings.weather);
  const raw = random();
  const sample = Number.isFinite(raw) ? Math.max(0, Math.min(1 - Number.EPSILON, raw)) : 0.5;
  let cursor = sample * choices.reduce((sum, [, weight]) => sum + weight, 0);
  for (const [weather, weight] of choices) {
    cursor -= weight;
    if (cursor < 0) return weather;
  }
  return choices[choices.length - 1][0];
}

/**
 * Feed active driving time only. Settings are never mutated; the returned patch
 * contains discrete boundaries only, so no per-frame saves or terrain rebuilds.
 * Time/seasons and weather have separate clocks and can be held independently.
 */
export function stepWorldClock(
  clock: WorldClock,
  settings: WorldSettings,
  dt: number,
  random: () => number = Math.random,
): Partial<WorldSettings> {
  const patch: Partial<WorldSettings> = {};
  if (!Number.isFinite(dt) || dt <= 0) return patch;
  clock.elapsedSeconds += dt;
  if (settings.autoTime) {
    const phaseDuration = settings.dayDuration / dayPhases.length;
    clock.daySeconds += dt;
    clock.phaseSeconds += dt;
    const days = Math.floor((clock.daySeconds + 1e-9) / settings.dayDuration);
    const phases = Math.floor((clock.phaseSeconds + 1e-9) / phaseDuration);
    clock.daysCompleted += days;
    clock.phaseTransitions += phases;
    clock.daySeconds = Math.max(0, clock.daySeconds - days * settings.dayDuration);
    clock.phaseSeconds = Math.max(0, clock.phaseSeconds - phases * phaseDuration);
    if (phases) {
      const index = settings.timeOfDay === 'dusk' ? 1 : dayPhases.indexOf(settings.timeOfDay);
      const next = dayPhases[(index + phases) % dayPhases.length];
      if (next !== settings.timeOfDay) patch.timeOfDay = next;
    }
    if (settings.autoSeasons) {
      const seasonDuration = settings.dayDuration * settings.seasonDays;
      clock.seasonSeconds += dt;
      const seasons = Math.floor((clock.seasonSeconds + 1e-9) / seasonDuration);
      clock.seasonSeconds = Math.max(0, clock.seasonSeconds - seasons * seasonDuration);
      if (seasons) {
        const next =
          yearSeasons[(yearSeasons.indexOf(settings.season) + seasons) % yearSeasons.length];
        if (next !== settings.season) patch.season = next;
      }
    }
  }
  if (settings.autoWeather) {
    clock.weatherSeconds += dt;
    const changes = Math.floor((clock.weatherSeconds + 1e-9) / settings.weatherDuration);
    clock.weatherSeconds = Math.max(0, clock.weatherSeconds - changes * settings.weatherDuration);
    if (changes) {
      let weather = settings.weather;
      // Long simulation steps need no unbounded catch-up loop: only the final
      // weather is visible. Normal driving always crosses at most one boundary.
      for (let i = 0; i < Math.min(changes, 64); i++)
        weather = chooseWeather({ ...settings, ...patch, weather }, random);
      clock.weatherChanges += changes;
      if (weather !== settings.weather) patch.weather = weather;
    }
  }
  return patch;
}

export function worldClockTelemetry(clock: WorldClock, settings: WorldSettings) {
  const phaseDuration = settings.dayDuration / dayPhases.length;
  const seasonDuration = settings.dayDuration * settings.seasonDays;
  return {
    elapsedSeconds: clock.elapsedSeconds,
    day: clock.daysCompleted + 1,
    daysCompleted: clock.daysCompleted,
    phase: settings.timeOfDay,
    phaseTransitions: clock.phaseTransitions,
    phaseSeconds: clock.phaseSeconds,
    phaseProgress: clock.phaseSeconds / phaseDuration,
    dayProgress: clock.daySeconds / settings.dayDuration,
    seasonProgress: clock.seasonSeconds / seasonDuration,
    weatherProgress: clock.weatherSeconds / settings.weatherDuration,
    nextPhaseIn: settings.autoTime ? Math.max(0, phaseDuration - clock.phaseSeconds) : null,
    nextSeasonIn:
      settings.autoTime && settings.autoSeasons
        ? Math.max(0, seasonDuration - clock.seasonSeconds)
        : null,
    nextWeatherIn: settings.autoWeather
      ? Math.max(0, settings.weatherDuration - clock.weatherSeconds)
      : null,
    weatherChanges: clock.weatherChanges,
  };
}
