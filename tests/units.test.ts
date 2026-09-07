import test from 'node:test';
import assert from 'node:assert/strict';
import {
  distanceValue,
  formatDistance,
  formatLength,
  formatSpeed,
  inferUnitSystem,
  lengthValue,
  metresPerFoot,
  metresPerMile,
  normalizeUnits,
  resolveUnitSystem,
  speedValue,
  normalizeCountry,
  configureUnitCountry,
} from '../src/config/units.ts';
import { requestUnitCountry } from '../src/unit-country.ts';

test('auto units use the regional locale, not English or Spanish alone', () => {
  for (const tag of [
    'es-AR',
    'es-ES',
    'en-CA',
    'fr-CA',
    'en-AU',
    'en-NZ',
    'de-DE',
    'ja-JP',
    'en-001',
    'en-LR',
    'my-MM',
  ])
    assert.equal(inferUnitSystem([tag]), 'metric', tag);
  for (const tag of ['en-US', 'es-US', 'en-GB'])
    assert.equal(inferUnitSystem([tag]), 'imperial', tag);
  assert.equal(inferUnitSystem(['es-AR', 'en-US']), 'metric');
  assert.equal(inferUnitSystem(['en-US', 'es-AR']), 'imperial');
  assert.equal(inferUnitSystem(['es']), 'metric');
  assert.equal(inferUnitSystem(['en']), 'metric', 'English alone is not a US location');
  assert.equal(inferUnitSystem(['en', 'es-AR']), 'metric');
  assert.equal(inferUnitSystem(['en', 'en-GB']), 'imperial');
});

test('edge country takes priority over language; manual units always win', () => {
  for (const country of ['AR', 'CA', 'AU', 'FR', 'ES', 'MM', 'LR'])
    assert.equal(inferUnitSystem(['en-US'], country), 'metric', country);
  for (const country of ['US', 'GB']) assert.equal(inferUnitSystem(['es-AR'], country), 'imperial');
  assert.equal(resolveUnitSystem('metric', ['en-US'], 'US'), 'metric');
  assert.equal(resolveUnitSystem('imperial', ['en-US'], 'AR'), 'imperial');
  for (const country of [null, undefined, 'XX', 'T1', {}, 'Argentina', ''])
    assert.equal(normalizeCountry(country), null);
  assert.equal(normalizeCountry('ar'), 'AR');
});

test('all display consumers share transient country and keep manual overrides', () => {
  try {
    configureUnitCountry(null, true);
    assert.equal(resolveUnitSystem('auto', ['en-US']), 'metric');
    assert.equal(resolveUnitSystem('imperial', ['es-AR']), 'imperial');
    configureUnitCountry('AR');
    assert.equal(resolveUnitSystem('auto', ['en-US']), 'metric');
    configureUnitCountry('US');
    assert.equal(resolveUnitSystem('auto', ['es-AR']), 'imperial');
  } finally {
    configureUnitCountry(null);
  }
});

test('country request returns only a validated country and fails safely', async () => {
  for (const [body, country] of [
    [{ country: 'AR', ip: 'ignored' }, 'AR'],
    [{ country: 'XX' }, null],
    [null, null],
    [{ country: 'T1' }, null],
  ] as const) {
    const request = (async (path, options) => {
      assert.equal(path, '/api/preferences');
      assert.equal(options?.cache, 'no-store');
      return Response.json(body);
    }) as typeof fetch;
    assert.equal(await requestUnitCountry(request), country);
  }
  assert.equal(await requestUnitCountry(async () => new Response('<html>offline</html>')), null);
  assert.equal(
    await requestUnitCountry(async () => Response.json({ country: 'US' }, { status: 503 })),
    null,
  );
  assert.equal(
    await requestUnitCountry(async () => {
      throw new Error('offline');
    }),
    null,
  );
});

test('locale measurement/region overrides are respected, but manual settings win', () => {
  assert.equal(inferUnitSystem(['en-US-u-ms-metric']), 'metric');
  assert.equal(inferUnitSystem(['es-AR-u-ms-ussystem']), 'imperial');
  assert.equal(inferUnitSystem(['en-GB-u-ca-gregory-ms-metric']), 'metric');
  assert.equal(inferUnitSystem(['es-AR-u-rg-uszzzz']), 'imperial');
  assert.equal(inferUnitSystem(['en-US-u-rg-arzzzz']), 'metric');
  assert.equal(
    inferUnitSystem(['en-US-x-u-ms-metric']),
    'imperial',
    'private-use text is not a Unicode preference',
  );
  assert.equal(resolveUnitSystem('metric', ['en-US']), 'metric');
  assert.equal(resolveUnitSystem('imperial', ['es-AR']), 'imperial');
  assert.equal(resolveUnitSystem('auto', ['en-GB']), 'imperial');
});

test('missing/corrupt locale and unit values have safe defaults', () => {
  assert.equal(inferUnitSystem([]), 'metric');
  assert.equal(inferUnitSystem(['bad_locale', '']), 'metric');
  assert.equal(inferUnitSystem(['bad_locale', 'en-US']), 'imperial');
  for (const value of [undefined, null, '', 'miles', 1, {}, []]) {
    assert.equal(normalizeUnits(value), 'auto');
    assert.equal(normalizeUnits(value, 'metric'), 'metric');
  }
  for (const value of ['auto', 'metric', 'imperial'] as const)
    assert.equal(normalizeUnits(value), value);
});

test('display conversions preserve exact international mile/foot definitions', () => {
  assert.equal(speedValue(80.4672, 'imperial'), 50);
  assert.equal(distanceValue(metresPerMile, 'imperial'), 1);
  assert.equal(lengthValue(metresPerFoot, 'imperial'), 1);
  assert.equal(speedValue(80, 'metric'), 80);
  assert.equal(distanceValue(1000, 'metric'), 1);
  assert.equal(lengthValue(10, 'metric'), 10);
  assert.equal(formatSpeed(80, 'imperial'), '49.7 mph');
  assert.equal(formatSpeed(80, 'metric'), '80 km/h');
  assert.equal(formatDistance(metresPerMile, 'imperial'), '1.00 mi');
  assert.equal(formatDistance(1000, 'metric'), '1.00 km');
  assert.equal(formatLength(10, 'imperial'), '32.8 ft');
  assert.equal(formatLength(4.199, 'metric', true), '4.199 m');
  assert.equal(formatLength(4.199, 'imperial', true), '13.78 ft');
  assert.equal(formatDistance(0, 'imperial'), '0.00 mi');
});
