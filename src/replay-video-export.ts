import type { ReplayExportMessage, ReplayExportRequest } from './game/replay-export';

/** Export status outlives the replay viewer so the player can return to driving. */
export class ReplayVideoExport {
  readonly root = document.createElement('aside');
  private worker?: Worker;
  private url?: string;
  private progress = 0;
  private result?: { seconds: number; elapsed: number };
  private error?: string;
  constructor(private changed: () => void) {
    this.root.id = 'video-export-status';
    this.root.hidden = true;
    this.root.setAttribute('aria-label', 'Video export');
    this.root.innerHTML = `<span role="status"></span><progress max="1" value="0" aria-label="Video export progress"></progress><div><a hidden>Download video</a><button type="button">Cancel</button></div>`;
    this.root.querySelector('button')!.addEventListener('click', () => {
      this.cancel();
      this.clear();
      this.root.hidden = true;
    });
    document.body.append(this.root);
  }
  get active() {
    return !!this.worker;
  }
  get supported() {
    return (
      typeof Worker !== 'undefined' &&
      typeof OffscreenCanvas !== 'undefined' &&
      typeof VideoEncoder !== 'undefined'
    );
  }
  start(request: ReplayExportRequest) {
    if (this.active) return;
    this.clear();
    this.progress = 0;
    this.result = undefined;
    this.error = undefined;
    this.root.hidden = false;
    this.root.querySelector('span')!.textContent = 'Preparing video… You can return to driving.';
    this.root.querySelector('button')!.textContent = 'Cancel';
    const meter = this.root.querySelector('progress')!;
    meter.hidden = false;
    meter.value = 0;
    try {
      const worker = new Worker(new URL('./game/replay-export.worker.ts', import.meta.url), {
        type: 'module',
      });
      this.worker = worker;
      worker.onmessage = ({ data }: MessageEvent<ReplayExportMessage>) => {
        if (this.worker !== worker) return;
        if (data.type === 'progress') {
          this.progress = data.progress;
          meter.value = data.progress;
          this.root.querySelector('span')!.textContent =
            data.progress === 1
              ? 'Finishing video…'
              : 'Exporting video. You can return to driving.';
        } else if (data.type === 'error') this.fail(data.message);
        else {
          this.worker = undefined;
          worker.terminate();
          this.result = { seconds: data.seconds, elapsed: data.elapsed };
          this.progress = 1;
          this.url = URL.createObjectURL(data.blob);
          const link = this.root.querySelector('a')!;
          link.href = this.url;
          link.download = `chillhill.replay.${data.extension}`;
          link.hidden = false;
          meter.hidden = true;
          this.root.querySelector('button')!.textContent = 'Dismiss';
          this.root.querySelector('span')!.textContent =
            `Video ready · exported in ${data.elapsed.toFixed(1)}s. Use Download video if the download hasn’t started.`;
          // Browsers can require a fresh user gesture after asynchronous work.
          // Keep the same link available whether this automatic click succeeds.
          try {
            link.click();
          } catch {
            // The visible download link remains available for a manual click.
          }
        }
        this.changed();
      };
      worker.onerror = (event) => {
        event.preventDefault();
        if (this.worker === worker)
          this.fail('Fast export could not start. Try Record in real time.');
      };
      worker.onmessageerror = () =>
        this.fail('The exported video could not be received. Try again.');
      worker.postMessage(request);
    } catch {
      this.fail('Fast export could not start. Try Record in real time.');
    }
    this.changed();
  }
  private fail(message: string) {
    this.worker?.terminate();
    this.worker = undefined;
    this.error = message;
    this.root.querySelector('span')!.textContent = message;
    this.root.querySelector('progress')!.hidden = true;
    this.root.querySelector('button')!.textContent = 'Dismiss';
    this.changed();
  }
  cancel() {
    this.worker?.terminate();
    this.worker = undefined;
    this.changed();
  }
  private clear() {
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = undefined;
    const link = this.root.querySelector('a')!;
    link.hidden = true;
    link.removeAttribute('href');
  }
  get telemetry() {
    return { active: this.active, progress: this.progress, result: this.result, error: this.error };
  }
  dispose() {
    this.cancel();
    this.clear();
    this.root.remove();
  }
}
