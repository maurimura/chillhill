import { cars } from '../src/config/cars.ts';
import { normalizeCountry } from '../src/config/units.ts';
import { scoringDefaults, standardDriving } from '../src/config/scoring.ts';
import type { LeaderboardResponse, RankResponse } from '../src/leaderboard-api.ts';
import { validScoreRecord, type ScoreCategory, type ScoreRecord } from '../src/scoreboard.ts';

/** Structural subset of D1: usable in Workers and in our SQLite contract tests. */
export interface Statement {
  bind(...values: (string | number | null)[]): Statement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
}
export interface Database {
  prepare(sql: string): Statement;
  batch<T>(statements: Statement[]): Promise<{ results: T[] }[]>;
}
export interface Env {
  DB: Database;
  ASSETS: { fetch(request: Request): Promise<Response> };
}
interface Session {
  run_id: string;
  token_hash: string;
  version: number;
  car: string;
  seed: number;
  category: ScoreCategory;
  created_at: number;
  expires_at: number;
  record_json: string | null;
  record_hash: string | null;
  score: number | null;
  near_misses: number | null;
  finished_at: string | null;
  name: string | null;
}

const hour = 3_600_000;
const sessionLifetime = 24 * hour;
const bodyLimit = 8192;
const order = 'score DESC, near_misses DESC, finished_at ASC, run_id ASC';
// Parameter-free comparison so it is shared by qualification and atomic admission.
const ahead = `(e.score > s.score
  OR (e.score = s.score AND e.near_misses > s.near_misses)
  OR (e.score = s.score AND e.near_misses = s.near_misses AND e.finished_at < s.finished_at)
  OR (e.score = s.score AND e.near_misses = s.near_misses
    AND e.finished_at = s.finished_at AND e.run_id < s.run_id))`;
const rankQuery = `SELECT 1 + COUNT(*) AS rank FROM leaderboard_entries e
  JOIN leaderboard_sessions s ON s.run_id = ?
  WHERE e.version = s.version AND e.category = s.category AND e.run_id != s.run_id
  AND ${ahead}`;

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
    },
  });
}
function bytesHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
function randomSecret() {
  return bytesHex(crypto.getRandomValues(new Uint8Array(32)));
}
async function hash(value: string) {
  return bytesHex(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))),
  );
}
function category(value: unknown): value is ScoreCategory {
  return value === 'standard' || value === 'custom';
}
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Read a bounded stream, not request.text(): Content-Length is not trusted. */
async function body(request: Request): Promise<Record<string, unknown>> {
  if (
    request.headers.get('origin') !== new URL(request.url).origin ||
    request.headers.get('sec-fetch-site') === 'cross-site'
  )
    throw new ApiError(403, 'Use the game on this site to submit a run.');
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? ''))
    throw new ApiError(415, 'Send JSON.');
  if (Number(request.headers.get('content-length')) > bodyLimit)
    throw new ApiError(413, 'This submission is too large.');
  if (!request.body) throw new ApiError(400, 'A JSON body is required.');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > bodyLimit) {
        await reader.cancel();
        throw new ApiError(413, 'This submission is too large.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    const parsed: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!object(parsed)) throw new Error('Not an object');
    return parsed;
  } catch {
    throw new ApiError(400, 'The submission is not valid JSON.');
  }
}

/** Coarse cost guard, not identity or anti-cheat. No raw addresses are retained. */
async function rateLimit(request: Request, db: Database, now: number, starting: boolean) {
  const secret = randomSecret();
  const [, salts] = await db.batch<{ value: string }>([
    db
      .prepare("INSERT OR IGNORE INTO leaderboard_meta(key,value) VALUES('rate_salt',?)")
      .bind(secret),
    db.prepare("SELECT value FROM leaderboard_meta WHERE key = 'rate_salt'"),
  ]);
  const day = Math.floor(now / (24 * hour));
  const address = request.headers.get('cf-connecting-ip') ?? 'local-development';
  const identity = await hash(`${salts.results[0].value}:${day}:${address}`);
  const key = `${starting ? 'start' : 'write'}:${Math.floor(now / hour)}:${identity}`;
  const allowance = starting ? 120 : 600;
  const admitted = await db
    .prepare(
      `INSERT INTO leaderboard_limits(key,count,expires_at)
    VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count = count + 1
    WHERE count < ? RETURNING count`,
    )
    .bind(key, now + 2 * hour, allowance)
    .first<{ count: number }>();
  if (!admitted)
    throw new ApiError(429, 'Too many submissions. Take a breather and try again later.');
}

async function startRun(data: Record<string, unknown>, db: Database, now: number) {
  if (
    data.version !== scoringDefaults.version ||
    !category(data.category) ||
    typeof data.car !== 'string' ||
    !Object.hasOwn(cars, data.car) ||
    !Number.isInteger(data.seed) ||
    Number(data.seed) < 1 ||
    Number(data.seed) > 99999
  )
    throw new ApiError(400, 'The run settings are not supported. Refresh the game and try again.');
  const runId = crypto.randomUUID();
  const token = randomSecret();
  const expiry = now + sessionLifetime;
  await db.batch([
    db
      .prepare(
        `DELETE FROM leaderboard_sessions WHERE run_id IN (
      SELECT run_id FROM leaderboard_sessions WHERE expires_at <= ? LIMIT 128)`,
      )
      .bind(now),
    db
      .prepare(
        `DELETE FROM leaderboard_limits WHERE key IN (
      SELECT key FROM leaderboard_limits WHERE expires_at <= ? LIMIT 128)`,
      )
      .bind(now),
    db
      .prepare(
        `INSERT INTO leaderboard_sessions
      (run_id,token_hash,version,car,seed,category,created_at,expires_at)
      VALUES (?,?,?,?,?,?,?,?)`,
      )
      .bind(
        runId,
        await hash(token),
        data.version as number,
        data.car as string,
        data.seed as number,
        data.category as string,
        now,
        expiry,
      ),
  ]);
  return json({ runId, token, expiresAt: new Date(expiry).toISOString() }, 201);
}

async function authenticate(db: Database, id: string, token: unknown, now: number) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token))
    throw new ApiError(401, 'This run session is not valid.');
  const session = await db
    .prepare(
      `SELECT * FROM leaderboard_sessions
    WHERE run_id = ? AND token_hash = ?`,
    )
    .bind(id, await hash(token))
    .first<Session>();
  if (!session) throw new ApiError(401, 'This run session is not valid.');
  if (session.expires_at <= now) throw new ApiError(410, 'This run session has expired.');
  return session;
}

/** Plausibility bounds stop malformed/impossible totals, not a modified game client. */
function validateScore(value: unknown, session: Session, now: number): ScoreRecord {
  const row = validScoreRecord(value);
  if (
    !row ||
    row.version !== session.version ||
    row.car !== session.car ||
    row.seed !== session.seed ||
    (session.category === 'custom' && row.category !== 'custom') ||
    !row.cars.includes(row.car) ||
    row.duration <= 0 ||
    row.duration > sessionLifetime / 1000 ||
    row.duration > (now - session.created_at) / 1000 + 15 ||
    row.topSpeed > (row.category === 'standard' ? standardDriving.maxSpeed : 110) + 0.5 ||
    row.averageSpeed > row.topSpeed + 0.1 ||
    row.distance > (row.duration * row.topSpeed) / 3.6 + 5 ||
    row.shoulderSeconds > row.duration + 0.1 ||
    row.shoulderTouches > row.duration + 2 ||
    row.nearMisses > row.duration * 5 + 2 ||
    row.nearMissEarned > row.nearMisses * 400 ||
    row.driftSeconds > row.duration + 0.1 ||
    row.bestDriftSeconds > row.driftSeconds + 0.1 ||
    row.driftEarned > row.driftSeconds * 60 + 1
  )
    throw new ApiError(400, 'This run cannot be ranked. Your local score is still saved.');
  return row;
}
async function ranking(db: Database, session: Session): Promise<RankResponse> {
  if (!session.score || !session.record_json) return { qualified: false, rank: null };
  const row = await db.prepare(rankQuery).bind(session.run_id).first<{ rank: number }>();
  const rank = row?.rank ?? 11;
  return {
    qualified: rank <= scoringDefaults.leaderboardSize,
    rank: rank <= scoringDefaults.leaderboardSize ? rank : null,
  };
}
async function finishRun(
  data: Record<string, unknown>,
  db: Database,
  session: Session,
  now: number,
) {
  const record = validateScore(data.record, session, now);
  const fingerprint = await hash(JSON.stringify(record));
  // Server completion time determines tie order; backdating cannot improve rank.
  const completedAt = new Date(now).toISOString();
  const canonical = { ...record, finishedAt: completedAt };
  const [, selected] = await db.batch<Session>([
    db
      .prepare(
        `UPDATE leaderboard_sessions SET record_json = ?, record_hash = ?, score = ?,
      near_misses = ?, finished_at = ?, category = ?, record_id = ?
      WHERE run_id = ? AND record_json IS NULL
      AND NOT EXISTS (SELECT 1 FROM leaderboard_sessions WHERE record_id = ?)
      AND NOT EXISTS (SELECT 1 FROM leaderboard_entries WHERE record_id = ?)`,
      )
      .bind(
        JSON.stringify(canonical),
        fingerprint,
        record.score,
        record.nearMisses,
        completedAt,
        record.category,
        record.id,
        session.run_id,
        record.id,
        record.id,
      ),
    db.prepare('SELECT * FROM leaderboard_sessions WHERE run_id = ?').bind(session.run_id),
  ]);
  const finished = selected.results[0];
  if (finished.record_hash !== fingerprint)
    throw new ApiError(409, 'This run has already been finished with a different score.');
  return json(await ranking(db, finished));
}
async function nameRun(data: Record<string, unknown>, db: Database, session: Session) {
  if (!session.record_json)
    throw new ApiError(409, 'Finish your run before choosing a leaderboard name.');
  const name =
    typeof data.name === 'string' ? data.name.trim().normalize('NFC').replace(/ +/g, ' ') : '';
  if (
    Array.from(name).length < 2 ||
    Array.from(name).length > 20 ||
    !/^[\p{L}\p{N} _'\-]+$/u.test(name)
  )
    throw new ApiError(
      400,
      'Use 2–20 letters, numbers, spaces, apostrophes, hyphens or underscores.',
    );
  if (session.name && session.name !== name)
    throw new ApiError(409, 'This run already has a leaderboard name.');
  // The admission check, insert, and pruning happen in one D1 transaction.
  // Unnamed candidates do not reserve places or push other players off the board.
  const [, , , named] = await db.batch<Session>([
    db
      .prepare(
        `INSERT OR IGNORE INTO leaderboard_entries
      (run_id,record_id,version,category,name,score,near_misses,finished_at,record_json)
      SELECT s.run_id,s.record_id,s.version,s.category,?,s.score,s.near_misses,s.finished_at,s.record_json
      FROM leaderboard_sessions s WHERE s.run_id = ? AND s.score > 0
      AND (s.name IS NULL OR s.name = ?) AND (
        SELECT COUNT(*) FROM leaderboard_entries e WHERE e.version = s.version
        AND e.category = s.category AND e.run_id != s.run_id AND ${ahead}
      ) < ?`,
      )
      .bind(name, session.run_id, name, scoringDefaults.leaderboardSize),
    db
      .prepare(
        `DELETE FROM leaderboard_entries WHERE version = ? AND category = ? AND run_id NOT IN (
      SELECT run_id FROM leaderboard_entries WHERE version = ? AND category = ? ORDER BY ${order} LIMIT ?)`,
      )
      .bind(
        session.version,
        session.category,
        session.version,
        session.category,
        scoringDefaults.leaderboardSize,
      ),
    db
      .prepare(
        `UPDATE leaderboard_sessions SET name = (
      SELECT name FROM leaderboard_entries WHERE run_id = ?) WHERE run_id = ? AND name IS NULL
      AND EXISTS (SELECT 1 FROM leaderboard_entries WHERE run_id = ?)`,
      )
      .bind(session.run_id, session.run_id, session.run_id),
    db.prepare('SELECT * FROM leaderboard_sessions WHERE run_id = ?').bind(session.run_id),
  ]);
  if (named.results[0].name && named.results[0].name !== name)
    throw new ApiError(409, 'This run already has a leaderboard name.');
  return json(await ranking(db, named.results[0]));
}

export async function handleRequest(
  request: Request,
  env: Env,
  now = Date.now(),
): Promise<Response> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
  try {
    if (url.pathname === '/api/preferences') {
      if (request.method !== 'GET') throw new ApiError(405, 'Use GET for preferences.');
      const country = (request as Request & { cf?: { country?: unknown } }).cf?.country;
      return json({ country: normalizeCountry(country) });
    }
    if (!env.DB)
      throw new ApiError(
        503,
        'The shared leaderboard is not connected yet. Local scores still work.',
      );
    if (url.pathname === '/api/leaderboard' && request.method === 'GET') {
      const selected = url.searchParams.get('category') ?? 'standard';
      if (!category(selected)) throw new ApiError(400, 'Choose Standard or Custom.');
      const rows = await env.DB.prepare(
        `SELECT name,record_json FROM leaderboard_entries
        WHERE version = ? AND category = ? ORDER BY ${order} LIMIT ?`,
      )
        .bind(scoringDefaults.version, selected, scoringDefaults.leaderboardSize)
        .all<{ name: string; record_json: string }>();
      const response: LeaderboardResponse = {
        version: scoringDefaults.version,
        category: selected,
        entries: rows.results.map((row) => ({
          name: row.name,
          record: JSON.parse(row.record_json) as ScoreRecord,
        })),
      };
      return json(response);
    }
    const match = /^\/api\/runs\/([a-f0-9-]{36})\/(finish|name)$/.exec(url.pathname);
    const starting = url.pathname === '/api/runs';
    if (!starting && !match) throw new ApiError(404, 'This leaderboard endpoint does not exist.');
    if (request.method !== 'POST') throw new ApiError(405, 'Use POST for run submissions.');
    const data = await body(request);
    await rateLimit(request, env.DB, now, starting);
    if (starting) return await startRun(data, env.DB, now);
    const session = await authenticate(env.DB, match![1], data.token, now);
    return match![2] === 'finish'
      ? await finishRun(data, env.DB, session, now)
      : await nameRun(data, env.DB, session);
  } catch (error) {
    // Deliberately do not log request bodies, capabilities, IPs or D1 errors.
    return error instanceof ApiError
      ? json({ error: error.message }, error.status)
      : json({ error: 'The leaderboard is taking a breather. Please try again.' }, 503);
  }
}

export default { fetch: (request: Request, env: Env) => handleRequest(request, env) };
