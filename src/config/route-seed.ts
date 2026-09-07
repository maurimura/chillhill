const historyKey = 'chillhill.route-history.v1';
const maxSeed = 99999;
const historyLimit = 64;
interface RouteStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
function browserStorage(): RouteStorage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}
function randomFraction() {
  try {
    return globalThis.crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
  } catch {
    return Math.random();
  }
}

/** Roll once per fresh page, not per chunk/frame. Saved world recipes stay reproducible. */
export function freshRouteSeed(
  previous: number,
  storage = browserStorage(),
  random = randomFraction,
) {
  let recent: number[] = [];
  try {
    const value: unknown = JSON.parse(storage?.getItem(historyKey) ?? '[]');
    if (Array.isArray(value))
      recent = value
        .filter((seed) => Number.isInteger(seed) && seed >= 1 && seed <= maxSeed)
        .slice(-historyLimit);
  } catch {
    /* Private mode, corrupt history or unavailable storage must not block driving. */
  }
  const excluded = new Set([...recent, previous]);
  const fraction = random();
  let seed =
    1 +
    Math.floor(
      (Number.isFinite(fraction) ? Math.max(0, Math.min(0.999999999, fraction)) : 0) * maxSeed,
    );
  // Bounded probing avoids repeat routes even if an RNG returns the previous seed.
  while (excluded.has(seed)) seed = (seed % maxSeed) + 1;
  try {
    storage?.setItem(historyKey, JSON.stringify([...recent, seed].slice(-historyLimit)));
  } catch {
    /* Best effort only. */
  }
  return seed;
}
