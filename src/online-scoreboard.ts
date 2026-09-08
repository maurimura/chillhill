import { scoringDefaults } from './config/scoring.ts';
import { validScoreRecord, type ScoreRecord, type ScoreRun } from './scoreboard.ts';
import type { LeaderboardResponse, RankResponse, StartRunResponse } from './leaderboard-api.ts';

export interface OnlineResult {
  recordId: string;
  status: 'checking' | 'qualified' | 'not-qualified' | 'offline' | 'saving' | 'saved';
  rank: number | null;
  message: string;
  retryable: boolean;
}
type Requester = (url: string, init?: RequestInit) => Promise<Response>;

/** Network work only at run boundaries and explicit menu actions, never per frame.
 * Session tokens deliberately never enter localStorage, telemetry, URLs or markup. */
export class OnlineScoreboard {
  readonly enabled: boolean;
  result: OnlineResult | null = null;
  entries: LeaderboardResponse['entries'] = [];
  loading = false;
  error = '';
  private listeners = new Set<() => void>();
  private session: Promise<StartRunResponse | null> | null = null;
  private runId = '';
  private record: ScoreRecord | null = null;
  private generation = 0;
  private listGeneration = 0;
  private request: Requester;

  constructor(
    enabled = !!import.meta.env?.PROD,
    request: Requester = globalThis.fetch.bind(globalThis),
  ) {
    this.enabled = enabled;
    this.request = request;
  }
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private changed() {
    for (const listener of this.listeners) listener();
  }
  private async json<T>(path: string, data?: unknown): Promise<T> {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 8000);
    try {
      const response = await this.request(`/api/${path}`, {
        method: data === undefined ? 'GET' : 'POST',
        headers:
          data === undefined
            ? { Accept: 'application/json' }
            : { Accept: 'application/json', 'Content-Type': 'application/json' },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }),
        credentials: 'same-origin',
        cache: 'no-store',
        signal: abort.signal,
      });
      if (!response.headers.get('content-type')?.includes('application/json'))
        throw new Error('Online leaderboard is unavailable. Your local score is safe.');
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          typeof result.error === 'string'
            ? result.error.slice(0, 200)
            : 'The leaderboard could not be reached.',
        );
      return result as T;
    } finally {
      clearTimeout(timer);
    }
  }
  reset() {
    this.generation++;
    this.runId = '';
    this.session = null;
    this.record = null;
    this.result = null;
    this.changed();
  }
  begin(run: ScoreRun) {
    if (this.runId === run.id) return;
    this.reset();
    this.runId = run.id;
    if (!this.enabled) return;
    this.session = this.json<StartRunResponse>('runs', {
      version: scoringDefaults.version,
      car: run.car,
      seed: run.seed,
      category: run.category,
    }).catch(() => null);
  }
  async complete(record: ScoreRecord) {
    if (this.runId !== record.id) return;
    if (this.result && this.result.status !== 'offline') return;
    this.record = structuredClone(record);
    const snapshot = this.record;
    const generation = this.generation;
    this.result = {
      recordId: record.id,
      status: 'checking',
      rank: null,
      message: '',
      retryable: false,
    };
    this.changed();
    const session = await this.session;
    if (generation !== this.generation) return;
    if (!session) {
      this.result = {
        recordId: record.id,
        status: 'offline',
        rank: null,
        retryable: false,
        message: this.enabled
          ? 'This run started offline. It is saved locally; a new online run can enter the worldwide board.'
          : 'Personal scores work here. The worldwide board connects in the Cloudflare preview or deployed game.',
      };
      this.changed();
      return;
    }
    try {
      const rank = await this.json<RankResponse>(`runs/${session.runId}/finish`, {
        token: session.token,
        record: snapshot,
      });
      if (generation !== this.generation) return;
      this.result = {
        recordId: record.id,
        status: rank.qualified ? 'qualified' : 'not-qualified',
        rank: rank.rank,
        message: '',
        retryable: false,
      };
    } catch (error) {
      if (generation !== this.generation) return;
      this.result = {
        recordId: record.id,
        status: 'offline',
        rank: null,
        retryable: true,
        message:
          error instanceof Error
            ? error.message
            : 'Could not check the online top ten. Your local score is safe.',
      };
    }
    this.changed();
  }
  retry() {
    if (this.result?.retryable && this.record) return this.complete(this.record);
  }
  async submitName(name: string) {
    if (!this.result || this.result.status !== 'qualified') return;
    const generation = this.generation;
    this.result = { ...this.result, status: 'saving', message: '' };
    this.changed();
    const session = await this.session;
    if (!session || generation !== this.generation || !this.result) return;
    try {
      const rank = await this.json<RankResponse>(`runs/${session.runId}/name`, {
        token: session.token,
        name,
      });
      if (generation !== this.generation || !this.result) return;
      this.result = {
        ...this.result,
        status: rank.qualified ? 'saved' : 'not-qualified',
        rank: rank.rank,
        message: rank.qualified
          ? 'Your name is on the board.'
          : 'Another driver moved ahead. Your personal record is still saved.',
      };
      void this.refresh();
    } catch (error) {
      if (generation !== this.generation || !this.result) return;
      this.result = {
        ...this.result,
        status: 'qualified',
        message: error instanceof Error ? error.message : 'Could not publish. Please try again.',
      };
    }
    this.changed();
  }
  async refresh() {
    const generation = ++this.listGeneration;
    this.entries = [];
    this.error = '';
    if (!this.enabled) {
      this.error =
        'The worldwide leaderboard is available in the deployed game or Cloudflare preview.';
      this.changed();
      return;
    }
    this.loading = true;
    this.changed();
    try {
      const data = await this.json<LeaderboardResponse>('leaderboard');
      if (generation !== this.listGeneration) return;
      if (!data || !Array.isArray(data.entries) || data.entries.length > 10)
        throw new Error('The leaderboard returned an incompatible response.');
      this.entries = data.entries.flatMap((entry) => {
        const record = validScoreRecord(entry.record);
        return record && typeof entry.name === 'string' && entry.name.length <= 40
          ? [{ name: entry.name, record }]
          : [];
      });
    } catch (error) {
      if (generation !== this.listGeneration) return;
      this.error =
        error instanceof Error ? error.message : 'The worldwide board is temporarily unavailable.';
    } finally {
      if (generation === this.listGeneration) {
        this.loading = false;
        this.changed();
      }
    }
  }
  dispose() {
    this.generation++;
    this.listGeneration++;
    this.listeners.clear();
  }
}
