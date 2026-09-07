/** Artist-authorized files served by the game, never a third-party streaming endpoint. */
const artist = {
  artist: 'Scott Buckley',
  artistUrl: 'https://www.scottbuckley.com.au',
  license: 'CC BY 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
} as const;

export const soundtracks = [
  {
    ...artist,
    id: 'sleep-piano',
    title: 'Sleep',
    mix: 'Piano only',
    src: `${import.meta.env.BASE_URL}music/sleep-piano-scott-buckley.mp3`,
    source: 'https://www.scottbuckley.com.au/library/sleep/',
    soundcloud: 'https://soundcloud.com/scottbuckley/sleep-cc-by',
  },
  {
    ...artist,
    id: 'moonlight',
    title: 'Moonlight',
    mix: 'Piano & strings',
    src: `${import.meta.env.BASE_URL}music/moonlight-scott-buckley.mp3`,
    source: 'https://www.scottbuckley.com.au/library/moonlight/',
    soundcloud: 'https://soundcloud.com/scottbuckley/moonlight-cc-by',
  },
  {
    ...artist,
    id: 'meanwhile',
    title: 'Meanwhile',
    mix: 'Piano, synth & strings',
    src: `${import.meta.env.BASE_URL}music/meanwhile-scott-buckley.mp3`,
    source: 'https://www.scottbuckley.com.au/library/meanwhile/',
    soundcloud: 'https://soundcloud.com/scottbuckley/meanwhile-cc-by',
  },
] as const;

export const defaultMusicVolume = 0.32;
