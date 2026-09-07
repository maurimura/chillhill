import type { DrivingMode, Input } from './driving';
import { touchPedals, touchSteering } from './touch-input';

export class Controls {
  private enabled = true;
  private keys = new Set<string>();
  private thumb:
    { pointer: number; steer: number; accelerate: boolean; brake: boolean } | undefined;
  private abort = new AbortController();
  constructor() {
    const options = { signal: this.abort.signal };
    window.addEventListener(
      'keydown',
      (event) => {
        if (!this.enabled) return;
        if (
          event.target instanceof HTMLElement &&
          event.target.closest('input, select, textarea, dialog')
        )
          return;
        // Space activates focused toolbar buttons. Steering keys still work after
        // a quick menu returns focus to its trigger, without requiring a mouse click.
        if (
          event.code === 'Space' &&
          event.target instanceof HTMLElement &&
          event.target.closest('button, a, [role="button"]')
        )
          return;
        if (
          [
            'ArrowLeft',
            'ArrowRight',
            'ArrowUp',
            'ArrowDown',
            'KeyW',
            'KeyA',
            'KeyS',
            'KeyD',
            'Space',
            'KeyV',
          ].includes(event.code)
        ) {
          event.preventDefault();
          this.keys.add(event.code);
        }
      },
      options,
    );
    window.addEventListener('keyup', (event) => this.keys.delete(event.code), options);
    window.addEventListener('blur', () => this.clear(), options);
    // Rotating the device moves the pad. Never retain a pedal from its old position.
    window.addEventListener(
      'resize',
      () => {
        if (this.thumb) this.clear();
      },
      options,
    );
    const pad = document.getElementById('thumb-pad')!;
    const moveThumb = (event: PointerEvent) => {
      if (event.pointerId !== this.thumb?.pointer) return;
      const rect = pad.getBoundingClientRect();
      const x = Math.max(
        -1,
        Math.min(1, (event.clientX - rect.left - rect.width / 2) / (rect.width * 0.46)),
      );
      const y = Math.max(
        -1,
        Math.min(1, (event.clientY - rect.top - rect.height / 2) / (rect.height * 0.38)),
      );
      this.thumb.steer = x;
      Object.assign(this.thumb, touchPedals(y, this.thumb));
      pad.style.setProperty('--thumb-x', `${x * rect.width * 0.25}px`);
      pad.style.setProperty('--thumb-y', `${y * rect.height * 0.25}px`);
    };
    pad.addEventListener(
      'pointerdown',
      (event) => {
        if (!this.enabled) return;
        event.preventDefault();
        if (this.thumb) return;
        pad.setPointerCapture(event.pointerId);
        this.thumb = { pointer: event.pointerId, steer: 0, accelerate: false, brake: false };
        pad.classList.add('pressed');
        moveThumb(event);
      },
      options,
    );
    pad.addEventListener('pointermove', moveThumb, options);
    const releaseThumb = (event: PointerEvent) => {
      if (event.pointerId !== this.thumb?.pointer) return;
      this.thumb = undefined;
      pad.classList.remove('pressed');
      pad.style.setProperty('--thumb-x', '0px');
      pad.style.setProperty('--thumb-y', '0px');
    };
    pad.addEventListener('pointerup', releaseThumb, options);
    pad.addEventListener('pointercancel', releaseThumb, options);
    pad.addEventListener('lostpointercapture', releaseThumb, options);
    pad.addEventListener('contextmenu', (event) => event.preventDefault(), options);
  }
  read(mode: DrivingMode = 'cozy', speed = 0): Input & { frontView: boolean } {
    const left = this.keys.has('KeyA') || this.keys.has('ArrowLeft');
    const right = this.keys.has('KeyD') || this.keys.has('ArrowRight');
    return {
      frontView: this.keys.has('KeyV'),
      steer: this.thumb
        ? touchSteering(this.thumb.steer, mode, speed)
        : Number(right) - Number(left),
      accelerate: this.keys.has('KeyW') || this.keys.has('ArrowUp') || !!this.thumb?.accelerate,
      brake:
        this.keys.has('KeyS') ||
        this.keys.has('ArrowDown') ||
        this.keys.has('Space') ||
        !!this.thumb?.brake,
    };
  }
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    this.clear();
  }
  clear() {
    this.keys.clear();
    const pointer = this.thumb?.pointer;
    this.thumb = undefined;
    const pad = document.getElementById('thumb-pad');
    if (pointer !== undefined && pad?.hasPointerCapture(pointer))
      pad.releasePointerCapture(pointer);
    pad?.style.setProperty('--thumb-x', '0px');
    pad?.style.setProperty('--thumb-y', '0px');
    document.querySelectorAll('.pressed').forEach((button) => button.classList.remove('pressed'));
  }
  dispose() {
    this.abort.abort();
    this.clear();
  }
}
