export type UnitSystem = 'metric' | 'imperial';
export type UnitPreference = 'auto' | UnitSystem;

let detectedCountry: string | null = null;
let countryPending = false;
/** One transient country decision shared by HUD, car menu and garage. */
export function configureUnitCountry(country: unknown, pending = false) {
  detectedCountry = normalizeCountry(country);
  countryPending = pending;
}

export const metresPerMile = 1609.344;
export const metresPerFoot = 0.3048;

export function normalizeUnits(value: unknown, fallback: UnitPreference = 'auto'): UnitPreference {
  return value === 'auto' || value === 'metric' || value === 'imperial' ? value : fallback;
}

/** Fallback only: language preferences are not a reliable physical location. */
export function browserLocales(): readonly string[] {
  if (typeof navigator === 'undefined') return [];
  return navigator.languages?.length
    ? navigator.languages
    : navigator.language
      ? [navigator.language]
      : [];
}

function unicodePreference(locale: Intl.Locale, key: string) {
  const parts = locale.toString().toLowerCase().split('-');
  const unicode = parts.indexOf('u');
  const privateUse = parts.indexOf('x');
  if (unicode < 0 || (privateUse >= 0 && privateUse < unicode)) return;
  for (let i = unicode + 1; i < parts.length && parts[i].length > 1; i++) {
    if (parts[i] === key && parts[i + 1]?.length > 2) return parts[i + 1];
  }
}

export function normalizeCountry(value: unknown): string | null {
  if (typeof value !== 'string' || !/^[a-z]{2}$/i.test(value)) return null;
  const country = value.toUpperCase();
  return country === 'XX' ? null : country;
}

/** Driving speed preferences, not the territory's general measurement system.
 * Unicode CLDR units.xml specifies mph for GB/US, km/h as the worldwide default. */
export function countryUnitSystem(country: string): UnitSystem {
  return ['US', 'GB'].includes(country.toUpperCase()) ? 'imperial' : 'metric';
}

export function inferUnitSystem(
  locales: readonly string[] = browserLocales(),
  country: string | null = detectedCountry,
): UnitSystem {
  if (countryPending && !country) return 'metric';
  const detected = normalizeCountry(country);
  if (detected) return countryUnitSystem(detected);
  for (const tag of locales) {
    try {
      const locale = new Intl.Locale(tag);
      const measurement = unicodePreference(locale, 'ms');
      if (measurement === 'metric') return 'metric';
      if (measurement === 'ussystem' || measurement === 'uksystem') return 'imperial';
      const regionOverride = unicodePreference(locale, 'rg');
      const region =
        regionOverride?.match(/^([a-z]{2}|\d{3})zzzz$/)?.[1].toUpperCase() ?? locale.region;
      if (!region) continue;
      // Never maximize a language into an invented country (e.g. en -> US).
      return countryUnitSystem(region);
    } catch {
      // Ignore malformed/unavailable locales and fall back safely to metric.
    }
  }
  return 'metric';
}

export function resolveUnitSystem(
  preference: UnitPreference,
  locales?: readonly string[],
  country: string | null = detectedCountry,
): UnitSystem {
  return preference === 'auto' ? inferUnitSystem(locales, country) : preference;
}

export const unitLabels = {
  metric: { speed: 'km/h', distance: 'km', length: 'm' },
  imperial: { speed: 'mph', distance: 'mi', length: 'ft' },
} as const;

// All physics, configuration values and scene exports remain in canonical metric units.
export const speedValue = (kmh: number, units: UnitSystem) =>
  units === 'imperial' ? kmh / (metresPerMile / 1000) : kmh;
export const distanceValue = (metres: number, units: UnitSystem) =>
  metres / (units === 'imperial' ? metresPerMile : 1000);
export const lengthValue = (metres: number, units: UnitSystem) =>
  units === 'imperial' ? metres / metresPerFoot : metres;

export const formatDistance = (metres: number, units: UnitSystem) =>
  `${distanceValue(metres, units).toFixed(2)} ${unitLabels[units].distance}`;
export const formatSpeed = (kmh: number, units: UnitSystem) =>
  `${Number(speedValue(kmh, units).toFixed(1))} ${unitLabels[units].speed}`;
export const formatLength = (metres: number, units: UnitSystem, detailed = false) =>
  `${detailed ? lengthValue(metres, units).toFixed(units === 'metric' ? 3 : 2) : Number(lengthValue(metres, units).toFixed(1))} ${unitLabels[units].length}`;
