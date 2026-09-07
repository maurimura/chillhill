import test from 'node:test';
import assert from 'node:assert/strict';
import {
  peugeot206Cabin,
  peugeot206FrontWindow,
  peugeot206RearWindow,
  peugeot206Headlamp,
  peugeot206TailLamp,
} from '../src/game/models/peugeot206-profile.ts';

test('206 roof stays within the factory body envelope and extends over the rear doors', () => {
  assert.equal(Math.max(...peugeot206Cabin.map((p) => p.y)), 1.432);
  assert.ok(peugeot206Cabin.every((p) => Math.abs(p.z) < 3.835 / 2 && p.width < 1.652 / 2));
  assert.ok(
    peugeot206Cabin.find((p) => p.z === 1.12)!.y > 1.4,
    'roof does not taper into the hatch too early',
  );
  assert.ok(peugeot206Cabin.at(-1)!.y < 1.1, 'short steep hatch, no sedan trunk');
});
test('206 five-door rear glass has a tall rounded trailing edge, not triangular quarter glass', () => {
  const rear = peugeot206RearWindow;
  assert.ok(rear.find((p) => p.z === 1.1)!.y - rear.find((p) => p.z === 1.1)!.width > 0.28);
  assert.ok(rear.at(-1)!.z - rear.at(-3)!.z < 0.08, 'rounding is confined to the trailing corners');
  assert.ok(rear[0].z > peugeot206FrontWindow.at(-1)!.z, 'solid B-pillar separates the two panes');
});
test('206 window and continuous lamp outlines are ordered, finite and non-inverted', () => {
  for (const profile of [
    peugeot206FrontWindow,
    peugeot206RearWindow,
    peugeot206Headlamp,
    peugeot206TailLamp,
  ]) {
    profile.forEach((p, i) => {
      assert.ok([p.z, p.width, p.y].every(Number.isFinite));
      assert.ok(p.width < p.y);
      assert.ok(i === 0 || p.z > profile[i - 1].z);
    });
  }
  assert.equal(peugeot206TailLamp[0].z, 0);
  assert.equal(peugeot206TailLamp.at(-1)!.z, 1);
  assert.ok(
    peugeot206TailLamp.some((p) => p.z === 0.6),
    'one lens spans the rear-to-side corner',
  );
});
