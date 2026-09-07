import test from 'node:test';
import assert from 'node:assert/strict';
import type { Settings } from '../src/config.ts';
import {
  TerrainPrefetch,
  type TerrainJob,
  type TerrainResult,
} from '../src/game/terrain-prefetch.ts';

class FakeWorker {
  messages: TerrainJob[] = [];
  terminated = false;
  onmessage?: (event: { data: TerrainResult }) => void;
  onerror?: (event: { preventDefault(): void }) => void;
  postMessage(job: TerrainJob) {
    this.messages.push(job);
  }
  terminate() {
    this.terminated = true;
  }
  complete(index = this.messages.length - 1) {
    const job = this.messages[index];
    this.onmessage?.({
      data: {
        id: job.id,
        generation: job.generation,
        data: {
          position: new Float32Array([1, 2, 3]),
          normal: new Float32Array([0, 1, 0]),
          color: new Float32Array([1, 0, 0]),
        },
      },
    });
  }
}
const settings = { seed: 42 } as Settings;
const fixture = () => {
  const workers: FakeWorker[] = [];
  const prefetch = new TerrainPrefetch(() => {
    const worker = new FakeWorker();
    workers.push(worker);
    return worker as unknown as Worker;
  });
  const request = (id: number) =>
    prefetch.request(id, id * 180, 180, settings, '#123456', '#aabbcc');
  return { prefetch, workers, request };
};

test('terrain prefetch keeps one running job, not a growing queue of old destinations', () => {
  const { prefetch, workers, request } = fixture();
  request(6);
  for (let i = 7; i < 100; i++) request(i);
  assert.equal(workers[0].messages.length, 1);
  assert.equal(prefetch.telemetry.pending, 1);
  workers[0].complete();
  assert.equal(workers[0].messages.length, 2);
  assert.equal(workers[0].messages[1].id, 99);
  workers[0].complete();
  assert.equal(prefetch.telemetry.ready, 1);
  assert.equal(prefetch.telemetry.pending, 0);
  const geometry = prefetch.take(99)!;
  assert.deepEqual(Array.from(geometry.getAttribute('position').array), [1, 2, 3]);
  assert.equal(prefetch.telemetry.ready, 0);
  geometry.dispose();
  prefetch.dispose();
});

test('repeated render requests neither clone settings nor requeue a ready chunk', () => {
  const { prefetch, workers, request } = fixture();
  for (let i = 0; i < 500; i++) request(6);
  assert.equal(workers[0].messages.length, 1);
  workers[0].complete();
  for (let i = 0; i < 500; i++) request(6);
  assert.equal(workers[0].messages.length, 1);
  prefetch.dispose();
});

test('changing a world cancels pending work and rejects late old-seed data', () => {
  const { prefetch, workers, request } = fixture();
  request(6);
  prefetch.reset();
  request(6);
  assert.equal(workers[0].terminated, true);
  workers[0].complete();
  assert.equal(prefetch.telemetry.ready, 0);
  assert.equal(prefetch.telemetry.pending, 1);
  workers[1].complete();
  assert.equal(prefetch.telemetry.ready, 1);
  prefetch.dispose();
});

test('a fallback consumes no stale future copy; blocked workers fail safely without retry storms', () => {
  const { prefetch, workers, request } = fixture();
  request(6);
  assert.equal(prefetch.take(6), undefined);
  workers[0].complete();
  assert.equal(prefetch.telemetry.ready, 0);
  workers[0].onerror?.({ preventDefault() {} });
  for (let i = 0; i < 100; i++) request(i);
  assert.equal(workers.length, 1);
  assert.equal(prefetch.telemetry.failed, true);
  assert.equal(prefetch.telemetry.worker, false);
  prefetch.dispose();
  const blocked = new TerrainPrefetch(() => {
    throw Error('Worker unavailable');
  });
  blocked.request(6, 1080, 180, settings, '#000', '#fff');
  assert.equal(blocked.telemetry.failed, true);
  assert.equal(blocked.take(6), undefined);
  blocked.dispose();
});

test('dispose releases pending/ready data and permanently prevents new worker jobs', () => {
  const { prefetch, workers, request } = fixture();
  request(6);
  workers[0].complete();
  prefetch.dispose();
  request(7);
  workers[0].complete();
  assert.equal(prefetch.telemetry.ready, 0);
  assert.equal(prefetch.telemetry.pending, 0);
  assert.equal(prefetch.telemetry.worker, false);
  assert.equal(workers.length, 1);
});
