import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyPaints, normalizePaints } from '../src/config/paint.ts';

test('older saves inherit original paint for each known car', () => {
  assert.deepEqual(normalizePaints(undefined), { astra: null, 'astra-sedan': null, wagon: null });
  assert.deepEqual(normalizePaints(null), emptyPaints());
});

test('paint is normalized, saved independently, and reset one car at a time', () => {
  const original = normalizePaints({ astra: '#ABCDEF', wagon: '#102030' });
  assert.equal(original.astra, '#abcdef');
  const changed = normalizePaints({ astra: null, 'astra-sedan': '#445566' }, original);
  assert.deepEqual(changed, { astra: null, 'astra-sedan': '#445566', wagon: '#102030' });
  assert.equal(original.astra, '#abcdef', 'validation must not mutate saved/default paint');
});

test('malformed colors and unknown or inherited vehicle keys are ignored', () => {
  const base = normalizePaints({ astra: '#123456' });
  for (const value of ['red', '#123', '#zzzzzz', '#1234567', 123, {}, []])
    assert.equal(normalizePaints({ astra: value }, base).astra, '#123456');
  assert.deepEqual(normalizePaints({ missing: '#123456' }), emptyPaints());
  assert.deepEqual(normalizePaints(Object.create({ astra: '#123456' })), emptyPaints());
});
