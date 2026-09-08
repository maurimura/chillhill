import './replay.css';
import type { Settings } from './config';
import { FocusScope } from './focus-scope';
import { replayDuration, sampleReplay, type Replay } from './game/replay';
import type { GameScene } from './game/scene';
import { ReplayVideoExport } from './replay-video-export';
import { exportProfile, type ReplayExportRequest } from './game/replay-export';

const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

/** A separate viewing lifecycle: it only sends recorded poses to the scene. */
export class ReplayView {
  readonly root = document.createElement('section');
  open = false;
  private replay: Replay | null = null;
  private position = 0;
  private playing = false;
  private applied?: Settings;
  private resetCamera = true;
  private recorder?: MediaRecorder;
  private stream?: MediaStream;
  private exportEnd = 0;
  private videoURL?: string;
  private exporting = false;
  private videoStarted = false;
  private abort = new AbortController();
  private focus: FocusScope;
  private background: ReplayVideoExport;

  constructor(private changed: (open: boolean) => void) {
    this.root.id = 'replay-view';
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-label', 'Run replay');
    this.root.innerHTML = `
      <div class="replay-heading"><strong>Run replay</strong><button id="close-replay" type="button">Back to drive</button></div>
      <div class="replay-panel" data-no-drive>
        <p id="replay-empty">Drive a little to record a replay, then come back to watch or save a video.</p>
        <div id="replay-playback" hidden>
          <div class="replay-timeline"><label for="replay-seek">Replay position</label><output id="replay-time">0:00 / 0:00</output></div>
          <input id="replay-seek" type="range" min="0" max="1" step="0.01" value="0"/>
          <div class="replay-actions"><button id="replay-play">Play</button><label>Speed <select id="replay-speed"><option value="0.5">½×</option><option value="1" selected>1×</option><option value="2">2×</option></select></label><label>Camera <select id="replay-camera"><option value="recorded">As driven</option><option value="chase">Chase</option><option value="front">Front</option></select></label></div>
        </div>
        <section id="replay-video-options" aria-labelledby="replay-video-title">
          <h3 id="replay-video-title">Save a video</h3>
          <div class="replay-export-fields">
            <fieldset id="replay-format"><legend>Format</legend><div class="replay-format-toggle">
              <label title="Portrait · 9:16"><input id="replay-portrait" type="radio" name="replay-format" value="portrait" aria-label="Portrait · 9:16" checked/><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="7" y="3" width="10" height="18" rx="2"/></svg></label>
              <label title="Landscape · 16:9"><input id="replay-landscape" type="radio" name="replay-format" value="landscape" aria-label="Landscape · 16:9"/><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="3" y="7" width="18" height="10" rx="2"/></svg></label>
            </div></fieldset>
            <label>Quality <select id="replay-quality"><option value="high">1080p · 60 fps</option><option value="compact">720p · 30 fps</option></select></label>
            <label>Video length <select id="replay-clip"><option value="10">Last 10 seconds</option><option value="15">Last 15 seconds</option><option value="30" selected>Last 30 seconds</option><option value="60">Last minute</option><option value="all">Full replay</option></select></label>
          </div>
          <div class="replay-actions replay-save-actions"><button id="replay-video">Save video</button><button id="replay-cancel-video" hidden>Cancel recording</button><a id="replay-download-video" hidden>Download video</a><button id="replay-record" title="Record the on-screen view while the replay plays">Record in real time</button></div>
          <p class="replay-note">Silent video. You can return to driving while it exports. Keep this page open until it’s ready.</p>
        </section>
        <p id="replay-status" role="status"></p>
      </div>`;
    document.body.append(this.root);
    this.background = new ReplayVideoExport(() => this.sync());
    this.focus = new FocusScope(
      this.root,
      () => this.open,
      () => this.$('close-replay'),
    );
    const options = { signal: this.abort.signal };
    this.$('close-replay').addEventListener('click', () => this.close(), options);
    this.$('replay-play').addEventListener('click', () => this.togglePlay(), options);
    this.$('replay-seek').addEventListener(
      'input',
      () => {
        if (this.exporting) return;
        this.position = Number(this.$<HTMLInputElement>('replay-seek').value);
        this.resetCamera = true;
        this.sync();
      },
      options,
    );
    this.$('replay-camera').addEventListener(
      'change',
      () => {
        this.resetCamera = true;
      },
      options,
    );
    this.$('replay-video').addEventListener('click', () => this.startBackgroundVideo(), options);
    this.$('replay-record').addEventListener('click', () => this.startVideo(), options);
    this.$('replay-cancel-video').addEventListener(
      'click',
      () => this.cancelVideo('Video export canceled.'),
      options,
    );
    this.root.addEventListener(
      'keydown',
      (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          this.close();
        }
        // Driving shortcuts must never reach the live game from this dialog.
        event.stopPropagation();
      },
      options,
    );
    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.hidden) this.pauseAway();
      },
      options,
    );
    window.addEventListener('blur', () => this.pauseAway(), options);
    window.addEventListener(
      'resize',
      () => {
        if (this.exporting)
          this.cancelVideo('The view resized. Start the video export again at this size.');
      },
      options,
    );
  }

  private $<T extends HTMLElement = HTMLElement>(id: string) {
    return this.root.querySelector<T>(`#${id}`)!;
  }
  private status(message: string) {
    this.$('replay-status').textContent = message;
  }

  show(replay: Replay | null) {
    this.replay = replay;
    this.position = 0;
    this.playing = !!replay;
    this.applied = undefined;
    this.resetCamera = true;
    this.open = true;
    this.root.hidden = false;
    this.root.append(this.background.root);
    document.body.classList.add('is-replaying');
    document.querySelector<HTMLElement>('.site-header')!.inert = true;
    document.querySelector<HTMLElement>('#game-shell')!.inert = true;
    this.status('');
    this.changed(true);
    this.sync();
    this.focus.focus();
  }

  close() {
    if (!this.open) return;
    this.cancelVideo('');
    document.body.append(this.background.root);
    this.open = false;
    this.playing = false;
    this.root.hidden = true;
    this.replay = null;
    this.applied = undefined;
    document.body.classList.remove('is-replaying');
    document.querySelector<HTMLElement>('.site-header')!.inert = false;
    document.querySelector<HTMLElement>('#game-shell')!.inert = false;
    this.clearVideo();
    this.changed(false);
  }

  private togglePlay() {
    if (!this.replay || this.exporting) return;
    if (this.position >= replayDuration(this.replay)) {
      this.position = 0;
      this.resetCamera = true;
    }
    this.playing = !this.playing;
    if (this.playing) this.status('');
    this.sync();
  }

  private pauseAway() {
    if (!this.open) return;
    if (this.exporting)
      this.cancelVideo(
        'Video export stopped when you left the tab. Keep this tab open and try again.',
      );
    this.playing = false;
    this.sync();
  }

  render(scene: GameScene, elapsed: number) {
    if (!this.replay) return;
    const duration = replayDuration(this.replay);
    const speed = this.exporting ? 1 : Number(this.$<HTMLSelectElement>('replay-speed').value);
    const dt = this.playing && !document.hidden ? Math.min(elapsed, 0.1) * speed : 0;
    // Render the initial pose before advancing, including the first video frame.
    if (!this.resetCamera)
      this.position = Math.min(this.exporting ? this.exportEnd : duration, this.position + dt);
    const pose = sampleReplay(this.replay, this.position);
    if (pose.settings !== this.applied) {
      scene.applySettings(pose.settings);
      this.applied = pose.settings;
    }
    if (this.resetCamera) {
      scene.resetMotion();
      this.resetCamera = false;
    }
    const camera = this.$<HTMLSelectElement>('replay-camera').value;
    scene.render(
      pose.state,
      dt,
      true,
      pose.brake,
      dt > 0,
      camera === 'recorded' ? pose.frontView : camera === 'front',
      pose.challenge,
    );
    if (this.exporting && this.recorder && !this.videoStarted) {
      try {
        this.recorder.start(1000);
        this.videoStarted = true;
      } catch {
        this.cancelVideo('Unable to start video export. Try again.');
      }
    }
    if (this.exporting && this.position >= this.exportEnd) this.finishVideo();
    else if (this.position >= duration) this.playing = false;
    this.sync();
  }

  private sync() {
    const duration = this.replay ? replayDuration(this.replay) : 0;
    this.$('replay-empty').hidden = !!this.replay;
    this.$('replay-playback').hidden = !this.replay;
    this.$('replay-video-options').hidden = !this.replay;
    this.$<HTMLInputElement>('replay-seek').max = String(duration);
    this.$<HTMLInputElement>('replay-seek').value = String(this.position);
    const time = `${clock(this.position)} / ${clock(duration)}`;
    this.$('replay-time').textContent = time;
    this.$('replay-seek').setAttribute('aria-valuetext', time);
    this.$('replay-play').textContent = this.playing ? 'Pause' : 'Play';
    for (const id of [
      'replay-play',
      'replay-seek',
      'replay-speed',
      'replay-camera',
      'replay-clip',
      'replay-format',
      'replay-quality',
    ])
      this.$<HTMLButtonElement>(id).disabled = this.exporting;
    this.$('replay-video').hidden = this.exporting;
    this.$<HTMLButtonElement>('replay-video').disabled = this.background.active;
    this.$<HTMLButtonElement>('replay-record').disabled = this.exporting || this.background.active;
    this.$('replay-cancel-video').hidden = !this.exporting;
  }

  private startBackgroundVideo() {
    if (!this.replay || this.exporting || this.background.active) return;
    if (!this.background.supported) {
      this.status('Fast export is unavailable in this browser. Use Record in real time.');
      return;
    }
    const end = replayDuration(this.replay);
    const clip = this.$<HTMLSelectElement>('replay-clip').value;
    this.playing = false;
    this.status('Export started. Back to drive keeps the export running.');
    this.background.start({
      replay: this.replay,
      start: clip === 'all' ? 0 : Math.max(0, end - Number(clip)),
      end,
      camera: this.$<HTMLSelectElement>('replay-camera').value as ReplayExportRequest['camera'],
      portrait: this.$<HTMLInputElement>('replay-portrait').checked,
      quality: this.$<HTMLSelectElement>('replay-quality').value as ReplayExportRequest['quality'],
    });
    this.sync();
  }

  private startVideo() {
    if (!this.replay || this.exporting) return;
    const canvas = document.querySelector<HTMLCanvasElement>('#scene canvas');
    if (!canvas?.captureStream || typeof MediaRecorder === 'undefined')
      return this.status(
        'Video export is unavailable in this browser. You can still watch your replay here.',
      );
    const mimeType = [
      'video/mp4;codecs=avc1.42001E',
      'video/mp4',
      'video/webm;codecs=vp8',
      'video/webm',
    ].find((type) => MediaRecorder.isTypeSupported(type));
    if (!mimeType)
      return this.status(
        'This browser has no supported video encoder. You can still watch your replay here.',
      );
    this.clearVideo();
    try {
      const profile = exportProfile(
        this.$<HTMLSelectElement>('replay-quality').value as ReplayExportRequest['quality'],
        false,
      );
      this.stream = canvas.captureStream(profile.fps);
      const recorder = new MediaRecorder(this.stream, {
        mimeType,
        videoBitsPerSecond: profile.bitrate,
      });
      this.recorder = recorder;
      const chunks: Blob[] = [];
      let bytes = 0;
      recorder.ondataavailable = (event) => {
        if (this.recorder !== recorder || !event.data.size) return;
        chunks.push(event.data);
        bytes += event.data.size;
        if (bytes > 200 * 1024 * 1024)
          this.cancelVideo('This video is too large. Choose a shorter video length and try again.');
      };
      recorder.onerror = () => {
        if (this.recorder === recorder) this.cancelVideo('Video export failed. Try again.');
      };
      recorder.onstop = () => {
        if (this.recorder !== recorder) return;
        this.stopTracks();
        this.recorder = undefined;
        this.exporting = false;
        if (!bytes) {
          this.status('No video frames were captured. Try again.');
          this.sync();
          return;
        }
        const type = recorder.mimeType || mimeType;
        this.videoURL = URL.createObjectURL(new Blob(chunks, { type }));
        const link = this.$<HTMLAnchorElement>('replay-download-video');
        link.href = this.videoURL;
        link.download = `chillhill.replay.${type.includes('mp4') ? 'mp4' : 'webm'}`;
        link.hidden = false;
        link.click();
        this.status('Video ready. Use Download video if the download did not start.');
        this.sync();
      };
      this.exportEnd = replayDuration(this.replay);
      const clip = this.$<HTMLSelectElement>('replay-clip').value;
      this.position = clip === 'all' ? 0 : Math.max(0, this.exportEnd - Number(clip));
      this.resetCamera = true;
      this.applied = undefined;
      this.playing = this.exporting = true;
      this.videoStarted = false;
      this.status('Exporting video… Your drive is paused. Keep this tab open.');
      this.sync();
    } catch {
      this.cancelVideo(
        'Unable to start video export in this browser. You can still watch your replay here.',
      );
    }
  }

  private finishVideo() {
    this.playing = false;
    if (this.recorder?.state === 'recording') {
      this.status('Finishing video…');
      this.recorder.stop();
    }
  }
  private cancelVideo(message: string) {
    const recorder = this.recorder;
    this.recorder = undefined;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    this.stopTracks();
    this.exporting = false;
    this.playing = false;
    this.status(message);
    this.sync();
  }
  private stopTracks() {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = undefined;
  }
  private clearVideo() {
    if (this.videoURL) URL.revokeObjectURL(this.videoURL);
    this.videoURL = undefined;
    this.$('replay-download-video').hidden = true;
    this.$('replay-download-video').removeAttribute('href');
  }
  get telemetry() {
    return {
      open: this.open,
      playing: this.playing,
      position: this.position,
      duration: this.replay ? replayDuration(this.replay) : 0,
      exporting: this.exporting,
      backgroundExport: this.background.telemetry,
    };
  }
  dispose() {
    this.close();
    this.background.dispose();
    this.abort.abort();
    this.focus.dispose();
    this.root.remove();
  }
}
