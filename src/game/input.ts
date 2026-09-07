import type { DrivingMode, Input } from './driving';
import { touchPedals, touchSteering } from './touch-input';

export class Controls {
  private enabled = false;
  private keys = new Set<string>();
  // Retain the touch scheme after lift/cancel so its heading can settle. A
  // driving key immediately restores direct keyboard steering, even on a tablet.
  private touchScheme = false;
  private thumb:
    | {
        pointer: number;
        surface: HTMLElement;
        originX: number;
        originY: number;
        travelX: number;
        travelY: number;
        padSize: number;
        steer: number;
        accelerate: boolean;
        brake: boolean;
      }
    | undefined;
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
          if (event.code !== 'KeyV') {
            this.touchScheme = false;
            this.releaseThumb();
          }
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
    const game = document.getElementById('game-shell')!;
    const gesture = document.getElementById('touch-gesture')!;
    const moveThumb = (event: PointerEvent) => {
      if (event.pointerId !== this.thumb?.pointer) return;
      const thumb = this.thumb;
      const x = Math.max(-1, Math.min(1, (event.clientX - thumb.originX) / thumb.travelX));
      const y = Math.max(-1, Math.min(1, (event.clientY - thumb.originY) / thumb.travelY));
      thumb.steer = x;
      Object.assign(thumb, touchPedals(y, thumb));
      pad.style.setProperty('--thumb-x', `${x * thumb.padSize * 0.25}px`);
      pad.style.setProperty('--thumb-y', `${y * thumb.padSize * 0.25}px`);
      gesture.style.setProperty('--gesture-x', `${x * 20}px`);
      gesture.style.setProperty('--gesture-y', `${y * 20}px`);
    };
    game.addEventListener(
      'pointerdown',
      (event) => {
        if (!this.enabled || this.thumb || event.button !== 0) return;
        if (!(event.target instanceof Element)) return;
        // Listen before the document's outside-menu handler: dismissing a panel
        // must not also start a driving gesture on that same touch.
        if (
          event.target.closest(
            'button, a, input, select, textarea, label, dialog, [role="dialog"], [role="button"], [contenteditable]:not([contenteditable="false"]), [data-no-drive]',
          )
        )
          return;
        const onPad = pad.contains(event.target);
        if (!onPad && !['touch', 'pen'].includes(event.pointerType)) return;
        event.preventDefault();
        this.touchScheme = true;
        const rect = pad.getBoundingClientRect();
        // Keep the optional fixed pad's familiar coordinates. Everywhere else,
        // the initial contact is neutral, with travel measured in CSS pixels
        // (not a percentage of the whole screen or distance from the pad).
        const size = rect.width || 128;
        const surface = onPad ? pad : game;
        surface.setPointerCapture(event.pointerId);
        this.thumb = {
          pointer: event.pointerId,
          surface,
          originX: onPad ? rect.left + size / 2 : event.clientX,
          originY: onPad ? rect.top + rect.height / 2 : event.clientY,
          travelX: size * 0.46,
          travelY: size * 0.38,
          padSize: size,
          steer: 0,
          accelerate: false,
          brake: false,
        };
        gesture.hidden = onPad;
        gesture.style.left = `${event.clientX}px`;
        gesture.style.top = `${event.clientY}px`;
        pad.classList.add('pressed');
        moveThumb(event);
      },
      options,
    );
    game.addEventListener('pointermove', moveThumb, options);
    const releaseThumb = (event: PointerEvent) => {
      if (event.pointerId !== this.thumb?.pointer) return;
      this.releaseThumb();
    };
    game.addEventListener('pointerup', releaseThumb, options);
    game.addEventListener('pointercancel', releaseThumb, options);
    game.addEventListener('lostpointercapture', releaseThumb, options);
    game.addEventListener(
      'contextmenu',
      (event) => {
        if (this.thumb) event.preventDefault();
      },
      options,
    );
  }
  read(mode: DrivingMode = 'cozy', speed = 0): Input & { frontView: boolean } {
    const left = this.keys.has('KeyA') || this.keys.has('ArrowLeft');
    const right = this.keys.has('KeyD') || this.keys.has('ArrowRight');
    return {
      frontView: this.keys.has('KeyV'),
      touch: this.touchScheme,
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
    document.getElementById('game-shell')?.classList.toggle('touch-driving', enabled);
  }
  private releaseThumb() {
    const thumb = this.thumb;
    this.thumb = undefined;
    const pad = document.getElementById('thumb-pad');
    if (thumb?.surface.hasPointerCapture(thumb.pointer))
      thumb.surface.releasePointerCapture(thumb.pointer);
    const gesture = document.getElementById('touch-gesture');
    if (gesture) gesture.hidden = true;
    pad?.style.setProperty('--thumb-x', '0px');
    pad?.style.setProperty('--thumb-y', '0px');
    pad?.classList.remove('pressed');
  }
  clear() {
    this.keys.clear();
    this.releaseThumb();
  }
  dispose() {
    this.abort.abort();
    this.clear();
  }
}
