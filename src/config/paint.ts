import { cars, type CarId } from './cars.ts';

export type CarPaints = Record<CarId, string | null>;
export const paintSwatches = [
  ['Chalk', '#ece8db'],
  ['Silver', '#a7b4b9'],
  ['Graphite', '#414b50'],
  ['Sage', '#87957a'],
  ['Forest', '#426453'],
  ['Ocean', '#537c96'],
  ['Terracotta', '#b96f53'],
  ['Cherry', '#943b42'],
  ['Honey', '#ceaa60'],
] as const;
export const emptyPaints = (): CarPaints =>
  Object.fromEntries(Object.keys(cars).map((id) => [id, null])) as CarPaints;

/** Null restores the catalog/palette color. Only six-digit RGB colors are saved. */
export function normalizePaints(input: unknown, base = emptyPaints()): CarPaints {
  const result = { ...base };
  if (!input || typeof input !== 'object') return result;
  for (const id of Object.keys(cars) as CarId[]) {
    if (!Object.hasOwn(input, id)) continue;
    const value = (input as Record<string, unknown>)[id];
    if (value === null) result[id] = null;
    else if (typeof value === 'string' && /^#[\da-f]{6}$/i.test(value))
      result[id] = value.toLowerCase();
  }
  return result;
}
