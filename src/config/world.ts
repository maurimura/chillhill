/** Independent ingredients. New combinations do not need new scene code. */
export const worldOptions = {
  landscape: { highlands: 'Highlands', coast: 'Coast' },
  season: { summer: 'Summer', autumn: 'Autumn', winter: 'Winter' },
  timeOfDay: { day: 'Daylight', sunset: 'Sunset', dusk: 'Blue hour', night: 'Moonlight' },
  weather: { clear: 'Clear', overcast: 'Overcast', rain: 'Rain', snow: 'Snow' },
  roadSurface: { asphalt: 'Asphalt', gravel: 'Gravel' },
  roadMarkings: { dashed: 'Dashed center', double: 'Double center', none: 'No markings' },
  roadside: { posts: 'Guide posts', barriers: 'Guardrails' },
} as const;

export type WorldChoice = keyof typeof worldOptions;
export type WorldSettings = {
  [K in WorldChoice]: keyof (typeof worldOptions)[K];
} & { weatherIntensity: number; wind: number };

export const worldDefaults: WorldSettings = {
  landscape: 'highlands',
  season: 'summer',
  timeOfDay: 'day',
  weather: 'clear',
  roadSurface: 'asphalt',
  roadMarkings: 'dashed',
  roadside: 'posts',
  weatherIntensity: 0.5,
  wind: 0.25,
};

export function normalizeWorld(input: Partial<WorldSettings>, base: WorldSettings): WorldSettings {
  const result = { ...base };
  for (const key of Object.keys(worldOptions) as WorldChoice[]) {
    const value: unknown = input[key];
    if (
      Object.hasOwn(input, key) &&
      typeof value === 'string' &&
      Object.hasOwn(worldOptions[key], value)
    )
      Object.assign(result, { [key]: value });
  }
  for (const key of ['weatherIntensity', 'wind'] as const) {
    const value: unknown = input[key];
    if ((typeof value === 'number' || typeof value === 'string') && value !== '') {
      const number = Number(value);
      if (Number.isFinite(number)) result[key] = Math.min(1, Math.max(0, number));
    }
  }
  return result;
}
