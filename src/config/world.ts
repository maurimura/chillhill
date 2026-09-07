/** Independent ingredients. New combinations do not need new scene code. */
export const worldOptions = {
  landscape: {
    highlands: 'Highlands',
    coast: 'Coast',
    city: 'City overlook',
    desert: 'Desert',
    lakes: 'Alpine lakes',
    forest: 'Tall forest',
  },
  season: { spring: 'Spring', summer: 'Summer', autumn: 'Autumn', winter: 'Winter' },
  timeOfDay: {
    day: 'Daylight',
    sunset: 'Sunset',
    dusk: 'Blue hour',
    night: 'Moonlight',
    dawn: 'Dawn',
  },
  weather: { clear: 'Clear', overcast: 'Overcast', rain: 'Rain', snow: 'Snow' },
  roadSurface: { asphalt: 'Asphalt', gravel: 'Gravel' },
  roadMarkings: { dashed: 'Dashed center', double: 'Double center', none: 'No markings' },
  roadside: { posts: 'Guide posts', barriers: 'Guardrails' },
} as const;

export type WorldChoice = keyof typeof worldOptions;
export type WorldSettings = {
  [K in WorldChoice]: keyof (typeof worldOptions)[K];
} & {
  weatherIntensity: number;
  wind: number;
  autoTime: boolean;
  autoSeasons: boolean;
  autoWeather: boolean;
  dayDuration: number;
  seasonDays: number;
  weatherDuration: number;
};

/** Durations use seconds, except seasonDays. Public UI/env values are bounded. */
export const worldNumberLimits = {
  weatherIntensity: [0, 1],
  wind: [0, 1],
  dayDuration: [60, 3600],
  seasonDays: [1, 30],
  weatherDuration: [30, 1800],
} as const;

export const worldDefaults: WorldSettings = {
  landscape: 'coast',
  season: 'summer',
  timeOfDay: 'day',
  weather: 'clear',
  roadSurface: 'asphalt',
  roadMarkings: 'dashed',
  roadside: 'posts',
  weatherIntensity: 0.5,
  wind: 0.25,
  autoTime: true,
  autoSeasons: true,
  autoWeather: true,
  dayDuration: 600,
  seasonDays: 3,
  weatherDuration: 210,
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
  for (const key of Object.keys(worldNumberLimits) as (keyof typeof worldNumberLimits)[]) {
    const value: unknown = input[key];
    if ((typeof value === 'number' || typeof value === 'string') && value !== '') {
      const number = Number(value);
      const [min, max] = worldNumberLimits[key];
      if (Number.isFinite(number)) result[key] = Math.min(max, Math.max(min, number));
    }
  }
  result.seasonDays = Math.round(result.seasonDays);
  for (const key of ['autoTime', 'autoSeasons', 'autoWeather'] as const) {
    const value: unknown = input[key];
    if (value === true || value === 'true' || value === 1 || value === '1') result[key] = true;
    else if (value === false || value === 'false' || value === 0 || value === '0')
      result[key] = false;
  }
  return result;
}
