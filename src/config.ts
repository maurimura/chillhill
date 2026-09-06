import palettes from './config/styles.json';
import { cars, defaultCar, type CarId } from './config/cars';
import { emptyPaints, normalizePaints, type CarPaints } from './config/paint';
import { normalizeWorld, worldDefaults, type WorldSettings } from './config/world';
import recipes from './config/scenes.json';
import { readStored, storageKeys } from './config/storage';

export type StyleId = keyof typeof palettes;
export type Palette = (typeof palettes)[StyleId];
export const styles = palettes;

export interface Settings extends WorldSettings {
  style: StyleId;
  car: CarId;
  paint: CarPaints;
  seed: number;
  curves: number;
  roadWidth: number;
  grade: number;
  terrainHeight: number;
  treeDensity: number;
  roundness: number;
  fog: number;
  cruiseSpeed: number;
  maxSpeed: number;
  drift: number;
  smoke: number;
  pixelRatio: number;
}

export const limits = {
  seed: [1, 99999],
  curves: [0.2, 1.7],
  roadWidth: [7, 16],
  grade: [0.03, 0.16],
  terrainHeight: [0.25, 2],
  treeDensity: [0, 2],
  roundness: [0, 1],
  fog: [0, 1],
  cruiseSpeed: [15, 55],
  maxSpeed: [40, 110],
  drift: [0, 1],
  smoke: [0, 1],
  pixelRatio: [0.75, 2],
} satisfies Record<
  Exclude<keyof Settings, 'style' | 'car' | 'paint' | keyof WorldSettings>,
  [number, number]
>;

export function normalizeSettings(input: Partial<Settings>, base: Settings): Settings {
  const result = { ...base, ...normalizeWorld(input, base) };
  for (const key of Object.keys(limits) as (keyof typeof limits)[]) {
    const value = Number(input[key] ?? base[key]);
    const [min, max] = limits[key];
    result[key] = Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : base[key];
  }
  result.seed = Math.round(result.seed);
  result.style = input.style && Object.hasOwn(styles, input.style) ? input.style : base.style;
  result.car = input.car && Object.hasOwn(cars, input.car) ? input.car : base.car;
  result.paint = normalizePaints(input.paint, base.paint);
  result.cruiseSpeed = Math.min(result.cruiseSpeed, result.maxSpeed);
  return result;
}

export const baseline: Settings = {
  ...worldDefaults,
  style: 'alpine',
  car: defaultCar,
  paint: emptyPaints(),
  seed: 42,
  curves: 1,
  roadWidth: 10,
  grade: 0.09,
  terrainHeight: 1,
  treeDensity: 1,
  roundness: 0.65,
  fog: 0.5,
  cruiseSpeed: 36,
  maxSpeed: 80,
  drift: 0.55,
  smoke: 0.65,
  pixelRatio: 1.75,
};

const env = import.meta.env;
const startupScene =
  env.VITE_SCENE && Object.hasOwn(recipes, env.VITE_SCENE)
    ? (recipes[env.VITE_SCENE as keyof typeof recipes].settings as Partial<Settings>)
    : {};
export const defaults = normalizeSettings(
  {
    style: env.VITE_STYLE,
    landscape: env.VITE_LANDSCAPE,
    season: env.VITE_SEASON,
    timeOfDay: env.VITE_TIME_OF_DAY,
    weather: env.VITE_WEATHER,
    weatherIntensity: env.VITE_WEATHER_INTENSITY,
    wind: env.VITE_WIND,
    roadSurface: env.VITE_ROAD_SURFACE,
    roadMarkings: env.VITE_ROAD_MARKINGS,
    roadside: env.VITE_ROADSIDE,
    car: env.VITE_CAR,
    seed: env.VITE_WORLD_SEED,
    curves: env.VITE_ROAD_CURVES,
    roadWidth: env.VITE_ROAD_WIDTH,
    grade: env.VITE_HILL_GRADE,
    terrainHeight: env.VITE_TERRAIN_HEIGHT,
    treeDensity: env.VITE_TREE_DENSITY,
    roundness: env.VITE_SHAPE_SOFTNESS,
    fog: env.VITE_FOG,
    cruiseSpeed: env.VITE_CRUISE_SPEED,
    maxSpeed: env.VITE_MAX_SPEED,
    drift: env.VITE_DRIFT,
    smoke: env.VITE_TIRE_SMOKE,
    pixelRatio: env.VITE_PIXEL_RATIO,
  },
  normalizeSettings(startupScene, baseline),
);

export function loadSettings(): Settings {
  try {
    const value = JSON.parse(readStored(localStorage, 'settings') ?? '{}');
    return normalizeSettings(value && typeof value === 'object' ? value : {}, defaults);
  } catch {
    return { ...defaults };
  }
}
export function saveSettings(settings: Settings) {
  try {
    localStorage.setItem(storageKeys.settings, JSON.stringify(settings));
  } catch {
    /* Storage may be disabled. */
  }
}
