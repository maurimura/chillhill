import * as THREE from 'three';
import type { Settings } from '../config';

export interface TerrainData {
  position: Float32Array;
  normal: Float32Array;
  color: Float32Array;
}
export interface TerrainJob {
  id: number;
  generation: number;
  start: number;
  length: number;
  settings: Settings;
  ground: string;
  light: string;
}
export interface TerrainResult {
  id: number;
  generation: number;
  data: TerrainData | null;
}

export function preparedTerrain(data: TerrainData) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(data.position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(data.normal, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(data.color, 3));
  return geometry;
}

/** At most one running job and one completed mesh. No growing message queue.
 * Settings changes terminate old work; stale results can never enter a new world. */
export class TerrainPrefetch {
  private worker?: Worker;
  private wanted?: TerrainJob;
  private pending?: TerrainJob;
  private ready?: TerrainResult;
  private generation = 0;
  private failed = false;
  private disposed = false;
  private hits = 0;
  private misses = 0;
  private createWorker: () => Worker;

  constructor(
    createWorker: () => Worker = () =>
      new Worker(new URL('./terrain.worker.ts', import.meta.url), { type: 'module' }),
  ) {
    this.createWorker = createWorker;
  }

  request(
    id: number,
    start: number,
    length: number,
    settings: Settings,
    ground: string,
    light: string,
  ) {
    if (this.disposed || this.failed) return;
    if (this.wanted?.id === id) return;
    this.wanted = {
      id,
      generation: this.generation,
      start,
      length,
      settings: { ...settings },
      ground,
      light,
    };
    if (this.ready?.id !== id) this.ready = undefined;
    this.kick();
  }

  private kick() {
    if (
      this.disposed ||
      this.failed ||
      this.pending ||
      !this.wanted ||
      this.ready?.id === this.wanted.id
    )
      return;
    try {
      if (!this.worker) {
        this.worker = this.createWorker();
        this.worker.onmessage = (event: MessageEvent<TerrainResult>) => {
          const result = event.data;
          if (this.disposed || result.generation !== this.generation) return;
          this.pending = undefined;
          if (!result.data) {
            this.fail();
            return;
          }
          if (result.id === this.wanted?.id) this.ready = result;
          this.kick();
        };
        this.worker.onerror = (event) => {
          event.preventDefault();
          this.fail();
        };
        this.worker.onmessageerror = () => this.fail();
      }
      this.pending = this.wanted;
      this.worker.postMessage(this.pending);
    } catch {
      this.fail();
    }
  }

  take(id: number) {
    if (this.ready?.id === id && this.ready.data) {
      const data = this.ready.data;
      this.ready = undefined;
      this.wanted = undefined;
      this.hits++;
      return preparedTerrain(data);
    }
    this.misses++;
    // A synchronous fallback already supplies this mesh; discard its late copy.
    if (this.wanted?.id === id) this.wanted = undefined;
    return undefined;
  }

  private fail() {
    this.failed = true;
    this.worker?.terminate();
    this.worker = undefined;
    this.pending = this.wanted = this.ready = undefined;
  }

  reset() {
    this.generation++;
    this.worker?.terminate();
    this.worker = undefined;
    this.pending = this.wanted = this.ready = undefined;
    // A worker-blocking browser/CSP uses the safe synchronous path thereafter.
  }

  get telemetry() {
    return {
      hits: this.hits,
      fallbacks: this.misses,
      pending: Number(!!this.pending),
      ready: Number(!!this.ready),
      worker: !!this.worker,
      failed: this.failed,
    };
  }
  dispose() {
    this.disposed = true;
    this.reset();
  }
}
