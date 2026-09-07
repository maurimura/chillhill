import { terrainGeometry } from './art';
import type { TerrainData, TerrainJob, TerrainResult } from './terrain-prefetch';

const scope = globalThis as unknown as Pick<Worker, 'onmessage' | 'postMessage'>;
scope.onmessage = (event: MessageEvent<TerrainJob>) => {
  const job = event.data;
  try {
    // The same authored geometry as the synchronous path: no visual/seed drift.
    const geometry = terrainGeometry(job.start, job.length, job.settings, job.ground, job.light);
    const data: TerrainData = {
      position: geometry.getAttribute('position').array as Float32Array,
      normal: geometry.getAttribute('normal').array as Float32Array,
      color: geometry.getAttribute('color').array as Float32Array,
    };
    const result: TerrainResult = { id: job.id, generation: job.generation, data };
    scope.postMessage(result, [
      data.position.buffer as ArrayBuffer,
      data.normal.buffer as ArrayBuffer,
      data.color.buffer as ArrayBuffer,
    ]);
    geometry.dispose();
  } catch {
    scope.postMessage({
      id: job.id,
      generation: job.generation,
      data: null,
    } satisfies TerrainResult);
  }
};
