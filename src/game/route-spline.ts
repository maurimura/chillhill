interface Piece {
  seed: number;
  index: number;
  a: number;
  b: number;
  c: number;
  d: number;
}

/** Stateless control value in [-1, 1], shared by splines and stretch planning. */
export function seededRouteValue(index: number, seed: number, salt: number) {
  const high = Math.imul(Math.floor(index / 4294967296), 1597334677);
  let value = Math.imul(index ^ high ^ salt ^ Math.imul(seed, 374761393), 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return (((value ^ (value >>> 16)) >>> 0) / 4294967296) * 2 - 1;
}

/** Uniform cubic B-spline over independently seeded control points in [-1, 1].
 * Adjacent pieces share three points: position and both derivatives join exactly.
 * Random access is independent of generation order, including in the terrain worker.
 */
export class SeededSpline {
  // Fixed-size direct-mapped cache, not a history of the whole endless route.
  // Hot terrain/physics samples allocate nothing and do not reroll any randomness.
  private readonly cache: (Piece | undefined)[] = new Array(64);

  readonly spacing: number;
  private readonly salt: number;

  constructor(spacing: number, salt: number) {
    this.spacing = spacing;
    this.salt = salt;
  }

  at(distance: number, seed: number, derivative: 0 | 1 | 2 = 0) {
    const index = Math.floor(distance / this.spacing);
    const slot = index & 63;
    let piece = this.cache[slot];
    if (!piece || piece.index !== index || piece.seed !== seed) {
      const p0 = seededRouteValue(index - 1, seed, this.salt),
        p1 = seededRouteValue(index, seed, this.salt),
        p2 = seededRouteValue(index + 1, seed, this.salt),
        p3 = seededRouteValue(index + 2, seed, this.salt);
      piece = {
        index,
        seed,
        a: (p3 - p0) / 6 + (p1 - p2) / 2,
        b: (p0 + p2) / 2 - p1,
        c: (p2 - p0) / 2,
        d: (p0 + 4 * p1 + p2) / 6,
      };
      this.cache[slot] = piece;
    }
    const t = (distance - index * this.spacing) / this.spacing;
    const { a, b, c, d } = piece;
    if (derivative === 1) return ((3 * a * t + 2 * b) * t + c) / this.spacing;
    if (derivative === 2) return (6 * a * t + 2 * b) / (this.spacing * this.spacing);
    return ((a * t + b) * t + c) * t + d;
  }
}
