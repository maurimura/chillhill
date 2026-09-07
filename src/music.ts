import type { Ambience } from './game/audio';
import { defaultMusicVolume, soundtracks } from './config/music';
import './music.css';

const storageKey = 'chillhill.music.v1';
const playIcon = 'm9 5 11 7-11 7V5Z';
const pauseIcon = 'M9 5v14M15 5v14';
const icon = (path: string) =>
  `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg>`;

function loadVolume() {
  try {
    const volume: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '{}').volume;
    if (typeof volume === 'number' && Number.isFinite(volume)) {
      return Math.max(0, Math.min(1, volume));
    }
  } catch {
    // A blocked or damaged preference must not prevent listening.
  }
  return defaultMusicVolume;
}

/** A local, opt-in soundtrack. Playback is deliberately independent of the drive. */
export class MusicPlayer {
  private root = document.createElement('section');
  private audio = document.createElement('audio');
  private abort = new AbortController();
  private requested = false;
  private pending = false;
  private generation = 0;
  private disposed = false;
  private failure: string | null = null;
  private notice = 'Ready when you are.';
  private ambiencePending = false;
  private loadTimer?: number;
  private trackIndex = 0;

  private get track() {
    return soundtracks[this.trackIndex];
  }

  constructor(private ambience: Ambience) {
    this.root.id = 'music-menu';
    this.root.className = 'quick-panel music-panel';
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'false');
    this.root.setAttribute('aria-labelledby', 'music-menu-title');
    this.root.innerHTML = `
      <div class="quick-heading">
        <div><span class="eyebrow">SOMETHING SOFT TO DRIVE TO</span><h2 id="music-menu-title">A little soundtrack.</h2></div>
        <button class="icon-button" id="close-music-menu" data-close-quick aria-label="Close music & ambience">${icon('M6 6 18 18M6 18 18 6')}</button>
      </div>
      <div class="quick-scroll music-scroll">
        <div class="music-track"><div><strong id="music-title"></strong><span id="music-artist"></span></div><span class="music-loop" id="music-position"></span></div>
        <div class="music-transport"><button class="music-skip" id="music-previous" aria-label="Previous song">${icon('M6 5v14m12-14L8 12l10 7V5Z')}</button><button class="music-play" id="music-play" aria-pressed="false">${icon(playIcon)}<span>Play music</span></button><button class="music-skip" id="music-next" aria-label="Next song">${icon('M18 5v14M6 5l10 7-10 7V5Z')}</button></div>
        <div class="music-timeline"><progress id="music-progress" max="1" value="0" aria-label="Song progress"></progress><span id="music-time">0:00 / —</span></div>
        <label class="sr-only" for="music-track-select">Choose a song</label><select id="music-track-select">${soundtracks.map((track, index) => `<option value="${index}">${track.title} · ${track.mix}</option>`).join('')}</select>
        <p class="music-status" id="music-status" role="status">Ready when you are.</p>
        <label class="slider-label music-volume-label" for="music-volume">Music volume<output id="music-volume-value" for="music-volume"></output></label>
        <input id="music-volume" type="range" min="0" max="1" step="0.01" aria-label="Music volume">
        <div class="music-ambience"><div><strong>Sounds of the hillside</strong><span>Wind, rain & the world around you.</span></div><button class="music-ambience-toggle" id="ambience-toggle" aria-pressed="false">Off</button></div>
        <p class="music-status ambience-status" id="ambience-status" role="status"></p>
        <p class="quick-note music-note">${soundtracks.length} gentle songs, one unhurried playlist. The next song follows automatically; the playlist repeats. Not a live radio station.</p>
        <div class="music-credits">
          <p><span id="music-credit-title"></span> by <a id="music-credit-artist" target="_blank" rel="noopener noreferrer"></a>.<br>Released under <a id="music-credit-license" target="_blank" rel="noopener noreferrer"></a>. <span id="music-credit-mix"></span></p>
          <div><a id="music-source" target="_blank" rel="noopener noreferrer">Artist & download</a><a id="music-soundcloud" target="_blank" rel="noopener noreferrer">Listen on SoundCloud ↗</a></div>
        </div>
      </div>`;

    // No src exists until the explicit Play click: even metadata is not fetched early.
    this.audio.id = 'music-audio';
    this.audio.hidden = true;
    this.audio.preload = 'none';
    this.audio.loop = false;
    this.audio.volume = loadVolume();
    this.root.append(this.audio);
    document.getElementById('app')!.append(this.root);

    const options = { signal: this.abort.signal };
    this.$('music-previous').addEventListener(
      'click',
      () => this.selectTrack(this.trackIndex - 1),
      options,
    );
    this.$('music-next').addEventListener(
      'click',
      () => this.selectTrack(this.trackIndex + 1),
      options,
    );
    this.$<HTMLSelectElement>('music-track-select').addEventListener(
      'change',
      (event) => this.selectTrack(Number((event.target as HTMLSelectElement).value)),
      options,
    );
    this.audio.addEventListener(
      'ended',
      () => {
        if (this.requested && this.audio.ended && !this.disposed && !document.hidden)
          this.selectTrack(this.trackIndex + 1);
      },
      options,
    );
    this.audio.addEventListener('timeupdate', () => this.syncProgress(), options);
    this.audio.addEventListener('durationchange', () => this.syncProgress(), options);
    this.$('music-play').addEventListener(
      'click',
      () => {
        if (this.requested) this.pause();
        else void this.play();
      },
      options,
    );
    const volume = this.$<HTMLInputElement>('music-volume');
    volume.value = String(this.audio.volume);
    volume.addEventListener(
      'input',
      () => {
        this.audio.volume = Math.max(0, Math.min(1, Number(volume.value)));
        try {
          localStorage.setItem(storageKey, JSON.stringify({ volume: this.audio.volume }));
        } catch {
          // Listening still works when local storage is unavailable.
        }
        this.sync();
      },
      options,
    );
    this.$('ambience-toggle').addEventListener('click', () => void this.toggleAmbience(), options);
    this.audio.addEventListener(
      'playing',
      () => {
        if (!this.requested || this.disposed || document.hidden) {
          this.audio.pause();
          return;
        }
        this.pending = false;
        this.clearLoadTimer();
        this.sync();
      },
      options,
    );
    this.audio.addEventListener('pause', () => this.sync(), options);
    this.audio.addEventListener('loadeddata', () => this.sync(), options);
    this.audio.addEventListener(
      'waiting',
      () => {
        if (this.requested) {
          this.pending = true;
          this.watchLoading();
        }
        this.sync();
      },
      options,
    );
    this.audio.addEventListener(
      'error',
      () => {
        if (this.requested) this.fail('The track could not load. Please try again.');
      },
      options,
    );
    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.hidden && this.requested) {
          this.pause('Paused while you were away. Press play when you’re ready.');
        }
      },
      options,
    );
    this.syncTrack();
    this.sync();
  }

  private $<T extends HTMLElement = HTMLElement>(id: string) {
    return this.root.querySelector<T>(`#${id}`)!;
  }

  private selectTrack(index: number) {
    if (this.disposed || !Number.isInteger(index)) return;
    const resume = this.requested;
    this.pause('Ready when you are.');
    this.failure = null;
    this.trackIndex = ((index % soundtracks.length) + soundtracks.length) % soundtracks.length;
    this.audio.removeAttribute('src');
    this.audio.load();
    this.syncTrack();
    this.sync();
    if (resume) void this.play();
  }

  private syncTrack() {
    const track = this.track;
    this.$('music-title').textContent = track.title;
    this.$('music-artist').textContent = `${track.artist} · ${track.mix}`;
    this.$('music-position').textContent = `${this.trackIndex + 1} / ${soundtracks.length}`;
    this.$<HTMLSelectElement>('music-track-select').value = String(this.trackIndex);
    this.$('music-credit-title').textContent = `“${track.title}”`;
    this.$('music-credit-mix').textContent =
      this.trackIndex === 0 ? 'Piano-only mix.' : 'Original full mix.';
    for (const [id, href, label] of [
      ['music-credit-artist', track.artistUrl, track.artist],
      ['music-credit-license', track.licenseUrl, track.license],
      ['music-source', track.source, 'Artist & download'],
      ['music-soundcloud', track.soundcloud, 'Listen on SoundCloud ↗'],
    ]) {
      const link = this.$<HTMLAnchorElement>(id);
      link.href = href;
      link.textContent = label;
    }
    this.syncProgress();
  }

  private syncProgress() {
    if (this.disposed) return;
    const duration = this.audio.duration;
    const time = (seconds: number) =>
      `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
    this.$<HTMLProgressElement>('music-progress').value =
      Number.isFinite(duration) && duration > 0 ? this.audio.currentTime / duration : 0;
    this.$('music-time').textContent =
      `${time(this.audio.currentTime)} / ${Number.isFinite(duration) ? time(duration) : '—'}`;
  }

  private async play() {
    if (this.disposed || document.hidden) return;
    const generation = ++this.generation;
    const retry = this.failure !== null;
    this.requested = true;
    this.pending = true;
    this.failure = null;
    if (retry || !this.audio.hasAttribute('src') || this.audio.error) {
      this.audio.src = this.track.src;
      this.audio.load();
    }
    this.watchLoading();
    this.sync();
    try {
      await this.audio.play();
      if (this.disposed || generation !== this.generation) return;
      this.pending = false;
      this.clearLoadTimer();
      this.sync();
    } catch (error) {
      // Pausing, retrying, or disposal can reject an older play request. Ignore it.
      if (this.disposed || generation !== this.generation || !this.requested) return;
      this.fail(
        error instanceof DOMException && error.name === 'NotAllowedError'
          ? 'Your browser paused the music. Press retry to try again.'
          : 'The track could not load. Please try again.',
      );
    }
  }

  private pause(notice = 'Paused. Pick up whenever you like.') {
    const cancelLoad = this.pending && this.audio.readyState < HTMLMediaElement.HAVE_CURRENT_DATA;
    this.generation++;
    this.requested = false;
    this.pending = false;
    this.clearLoadTimer();
    this.notice = notice;
    this.audio.pause();
    if (cancelLoad) {
      this.audio.removeAttribute('src');
      this.audio.load();
    }
    this.sync();
  }

  private fail(message: string) {
    this.failure = message;
    this.pause();
  }

  private clearLoadTimer() {
    window.clearTimeout(this.loadTimer);
    this.loadTimer = undefined;
  }

  private watchLoading() {
    this.clearLoadTimer();
    const generation = this.generation;
    this.loadTimer = window.setTimeout(() => {
      if (!this.disposed && this.requested && this.pending && generation === this.generation) {
        this.fail('The track is taking too long to load. Please try again.');
      }
    }, 15000);
  }

  private async toggleAmbience() {
    if (this.ambiencePending || this.disposed) return;
    this.ambiencePending = true;
    const button = this.$<HTMLButtonElement>('ambience-toggle');
    button.setAttribute('aria-busy', 'true');
    this.$('ambience-status').textContent = '';
    try {
      await this.ambience.toggle();
    } catch {
      if (!this.disposed) {
        this.$('ambience-status').textContent = 'Ambience is unavailable. Music works separately.';
      }
    } finally {
      this.ambiencePending = false;
      if (!this.disposed) {
        button.removeAttribute('aria-busy');
        this.sync();
      }
    }
  }

  private sync() {
    if (this.disposed) return;
    const label = this.requested
      ? this.pending
        ? 'Cancel loading'
        : 'Pause music'
      : this.failure
        ? 'Retry music'
        : 'Play music';
    this.$('music-play').innerHTML =
      `${icon(this.requested ? pauseIcon : playIcon)}<span>${label}</span>`;
    this.$('music-play').setAttribute('aria-pressed', String(this.requested));
    this.$('music-status').textContent =
      this.failure ??
      (this.requested
        ? this.pending
          ? 'Loading a little calm…'
          : `Now playing · ${this.track.mix.toLowerCase()}`
        : this.notice);
    this.$('music-volume-value').textContent = `${Math.round(this.audio.volume * 100)}%`;
    this.$('music-volume').style.setProperty('--range-progress', `${this.audio.volume * 100}%`);
    this.$('ambience-toggle').textContent = this.ambience.enabled ? 'On' : 'Off';
    this.$('ambience-toggle').setAttribute('aria-pressed', String(this.ambience.enabled));
    const trigger = document.getElementById('sound');
    if (trigger) {
      const audible = (!this.audio.paused && this.audio.volume > 0) || this.ambience.enabled;
      trigger.dataset.audible = String(audible);
      trigger.setAttribute('aria-label', `Music & ambience${audible ? ' · sound on' : ''}`);
    }
  }

  get telemetry() {
    return {
      track: this.track.id,
      trackIndex: this.trackIndex,
      trackCount: soundtracks.length,
      playing: !this.audio.paused && !this.audio.ended,
      loaded: this.audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA,
      volume: this.audio.volume,
      currentTime: this.audio.currentTime,
      pending: this.pending,
      error: this.failure,
      ambience: this.ambience.enabled,
    };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.generation++;
    this.requested = false;
    this.clearLoadTimer();
    this.abort.abort();
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
    this.root.remove();
  }
}
