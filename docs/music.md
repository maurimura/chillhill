# A little soundtrack

chillhill's optional soundtrack is a three-song playlist by Scott Buckley, lasting approximately **12 minutes 44 seconds** before it repeats. It is locally served, **not a live radio stream**. Each recording is explicitly released under CC BY 4.0 for projects including commercial games, provided attribution is supplied.

| Song      | Mix                                 | Duration | Artist permission                                                 | SoundCloud                                                    |
| --------- | ----------------------------------- | -------- | ----------------------------------------------------------------- | ------------------------------------------------------------- |
| Sleep     | Piano only                          | 3:04     | [Artist page](https://www.scottbuckley.com.au/library/sleep/)     | [Listen](https://soundcloud.com/scottbuckley/sleep-cc-by)     |
| Moonlight | Full mix — piano and strings        | 4:14     | [Artist page](https://www.scottbuckley.com.au/library/moonlight/) | [Listen](https://soundcloud.com/scottbuckley/moonlight-cc-by) |
| Meanwhile | Full mix — piano, synth and strings | 5:26     | [Artist page](https://www.scottbuckley.com.au/library/meanwhile/) | [Listen](https://soundcloud.com/scottbuckley/meanwhile-cc-by) |

Natural track endings advance to the next song and wrap back to Sleep. Previous/next buttons and a song picker allow choosing another track. Selecting while paused stays paused and makes no media request. Credits, source links, progress and elapsed time follow the selected track. These are sequential original recordings, not a crossfaded or gapless remix.

The music control lives inside the existing sound toolbar button. Music playback and volume are independent of environmental ambience. Driving, pausing, opening menus, and visiting the garage do not reset the soundtrack. Hiding the browser tab pauses music and does not resume it automatically.

## Delivery and privacy

- The game does not request the MP3, even its metadata, until the player explicitly presses **Play music**.
- Audio is served from `public/music/`; all configured URLs respect Vite's base path. Only the current song loads, not the entire playlist on page load.
- There is no SoundCloud widget, API, third-party media request, analytics integration, stream scraping, or proxy. SoundCloud is an optional outbound listening link.
- Only music volume is saved, under `chillhill.music.v1`. Playback is never restored on reload. Broken or blocked storage does not prevent use.
- Failed media loads and a 15-second loading timeout show **Retry music**. Cancelling an initial load releases the media source and cannot later start playback unexpectedly.
- The source files are unmodified artist-provided MP3s. Playback volume and playlist repeat are runtime settings, not audio-file edits.

## Sources and attribution

“Sleep” by Scott Buckley — released under CC BY 4.0. www.scottbuckley.com.au

- [Artist's track page and permission](https://www.scottbuckley.com.au/library/sleep/)
- [Authorized piano-only MP3](https://www.scottbuckley.com.au/library/wp-content/uploads/2019/08/sb_sleep_pianoonly.mp3)
- [CC BY 4.0 license](https://creativecommons.org/licenses/by/4.0/)
- [Artist's SoundCloud page for the full mix](https://soundcloud.com/scottbuckley/sleep-cc-by)
- [Distributed credits](../public/music/CREDITS.md)

This is **copyrighted music with a reuse license**, not public-domain or “copyright-free” music. CC BY permits commercial use with its attribution and other conditions. The in-game credits and distributed credit file must remain with the recording. If publishing gameplay videos, include the artist's requested credit in the video description; the license does not guarantee freedom from automated Content ID claims.

## Extending the playlist

Add entries to `soundtracks` in `src/config/music.ts` with the authorized local asset, exact artist/title/mix, source URL, and license. Add the original file under `public/music/` and update the distributed credits. Confirm permission for use **inside a game**, not just for listening on a streaming service or use in a YouTube video. Download through the artist's authorized download route; do not extract audio from SoundCloud's player.

## Verification

`scripts/music-check.mjs` exports `checkMusic(browser, origin, errors)` for the browser suite. It checks all three actual MP3s, natural-end advance/wrap, skip/selection, matching credits, opt-in fetching, pause and volume behavior, ambience independence, reload privacy, cancelled playback requests, hidden-tab behavior, retry after HTTP errors and loading timeouts, and keyboard/mobile panel behavior. Desktop/mobile screenshots are saved under ignored `artifacts/`.
