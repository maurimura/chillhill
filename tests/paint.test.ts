import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyPaints, normalizePaints } from '../src/config/paint.ts';
import { cars } from '../src/config/cars.ts';

test('older saves inherit original paint for each known car', () => {
  assert.deepEqual(
    normalizePaints(undefined),
    Object.fromEntries(Object.keys(cars).map((id) => [id, null])),
  );
  assert.deepEqual(normalizePaints(null), emptyPaints());
});

test('paint is normalized, saved independently, and reset one car at a time', () => {
  const original = normalizePaints({ astra: '#ABCDEF', wagon: '#102030' });
  assert.equal(original.astra, '#abcdef');
  const changed = normalizePaints({ astra: null, 'renault-12': '#445566' }, original);
  assert.deepEqual(changed, {
    ...emptyPaints(),
    astra: null,
    'renault-12': '#445566',
    wagon: '#102030',
  });
  assert.equal(original.astra, '#abcdef', 'validation must not mutate saved/default paint');
});

test('malformed colors and unknown or inherited vehicle keys are ignored', () => {
  const base = normalizePaints({ astra: '#123456' });
  for (const value of ['red', '#123', '#zzzzzz', '#1234567', 123, {}, []])
    assert.equal(normalizePaints({ astra: value }, base).astra, '#123456');
  assert.deepEqual(normalizePaints({ missing: '#123456' }), emptyPaints());
  assert.deepEqual(normalizePaints(Object.create({ astra: '#123456' })), emptyPaints());
});

test('retired sedan paint is not applied to its replacement or to other cars', () => {
  const colors = normalizePaints({ 'astra-sedan': '#123456', astra: '#abcdef', wagon: '#654321' });
  assert.equal(Object.hasOwn(colors, 'astra-sedan'), false);
  assert.equal(colors['peugeot-206'], null);
  assert.equal(colors.astra, '#abcdef');
  assert.equal(colors.wagon, '#654321');
});
