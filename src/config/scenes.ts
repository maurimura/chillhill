import type { Settings } from '../config';
import { worldOptions, type WorldChoice } from './world.ts';
import palettes from './styles.json' with { type: 'json' };

// A scene never changes the selected car, its paint, handling, or render quality.
export const sceneKeys = [
  'style',
  'landscape',
  'season',
  'timeOfDay',
  'weather',
  'weatherIntensity',
  'wind',
  'roadSurface',
  'roadMarkings',
  'roadside',
  'seed',
  'curves',
  'roadWidth',
  'grade',
  'terrainHeight',
  'treeDensity',
  'roundness',
  'fog',
] as const satisfies readonly (keyof Settings)[];
export type SceneSettings = Pick<Settings, (typeof sceneKeys)[number]>;
export interface SceneRecipe {
  name: string;
  settings: SceneSettings;
}

export function sceneSnapshot(settings: Settings): SceneSettings {
  return Object.fromEntries(sceneKeys.map((key) => [key, settings[key]])) as SceneSettings;
}

export function sceneName(value: unknown) {
  return typeof value === 'string'
    ? value
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .trim()
        .slice(0, 48) || 'My little escape'
    : 'My little escape';
}

export function serializeScene(name: string, settings: Settings) {
  return (
    JSON.stringify(
      {
        format: 'chillhill.scene',
        version: 1,
        name: sceneName(name),
        settings: sceneSnapshot(settings),
      },
      null,
      2,
    ) + '\n'
  );
}

export function readScene(text: string): { name: string; settings: Partial<Settings> } {
  if (text.length > 65536) throw new Error('Scene files must be smaller than 64 KB.');
  const file = JSON.parse(text);
  if (
    !file ||
    // Earlier exports remain importable; all new exports use the new name.
    (file.format !== 'chillhill.scene' && file.format !== 'chill-the-hill.scene') ||
    file.version !== 1 ||
    !file.settings ||
    typeof file.settings !== 'object' ||
    Array.isArray(file.settings)
  )
    throw new Error('Choose a chillhill scene file (version 1).');
  const entries = sceneKeys
    .filter((key) => Object.hasOwn(file.settings, key))
    .map((key) => [key, file.settings[key]]);
  if (!entries.length) throw new Error('This file has no scene ingredients.');
  for (const [key, value] of entries) {
    if (
      (typeof value !== 'string' && typeof value !== 'number') ||
      (typeof value === 'number' && !Number.isFinite(value))
    )
      throw new Error('A scene ingredient has an invalid value.');
    if (
      Object.hasOwn(worldOptions, key) &&
      (typeof value !== 'string' || !Object.hasOwn(worldOptions[key as WorldChoice], value))
    )
      throw new Error(`Unknown ${key} choice.`);
    if (key === 'style' && (typeof value !== 'string' || !Object.hasOwn(palettes, value)))
      throw new Error('Unknown art palette.');
    if (key !== 'style' && !Object.hasOwn(worldOptions, key) && typeof value !== 'number')
      throw new Error(`${key} must be a number.`);
  }
  return { name: sceneName(file.name), settings: Object.fromEntries(entries) };
}
