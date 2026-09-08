import assert from 'node:assert/strict';
import test from 'node:test';
import {
  exportFps,
  exportFrameCount,
  exportFrameTiming,
  exportProfile,
} from '../src/game/replay-export.ts';

test('export clocks preserve clip length regardless of processing speed', () => {
  for (const duration of [0.01, 1, 1.175, 30, 59.999, 600]) {
    const count = exportFrameCount(duration);
    let total = 0;
    for (let index = 0; index < count; index++) {
      const frame = exportFrameTiming(index, duration);
      assert.equal(frame.timestamp, index / exportFps);
      assert.ok(frame.duration > 0 && frame.duration <= 1 / exportFps);
      total += frame.duration;
    }
    assert.ok(Math.abs(total - duration) < 1e-8);
    const last = exportFrameTiming(count - 1, duration);
    assert.ok(Math.abs(last.timestamp + last.duration - duration) < 1e-10);
  }
});

test('invalid clip lengths cannot start an unbounded render loop', () => {
  for (const duration of [0, -1, 601, Infinity, NaN])
    assert.throws(() => exportFrameCount(duration));
});

test('social exports preserve 9:16 or 16:9 and encode sixty distinct timestamps each second', () => {
  assert.deepEqual(exportProfile('high', true), {
    width: 1080,
    height: 1920,
    fps: 60,
    bitrate: 12_000_000,
  });
  assert.deepEqual(exportProfile('high', false), {
    width: 1920,
    height: 1080,
    fps: 60,
    bitrate: 12_000_000,
  });
  assert.equal(exportFrameCount(30), 1800);
  assert.equal(
    new Set(Array.from({ length: 60 }, (_, i) => exportFrameTiming(i, 1).timestamp)).size,
    60,
  );
  const compact = exportProfile('compact', true);
  assert.equal(compact.width / compact.height, 9 / 16);
  assert.equal(exportFrameCount(30, compact.fps), 900);
  const last = exportFrameTiming(899, 30, compact.fps);
  assert.equal(last.timestamp + last.duration, 30);
  assert.throws(() => exportFrameCount(1, 0));
});
