import { cars, type CarId } from './cars.ts';

export type CarPaints = Record<CarId, string | null>;
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
