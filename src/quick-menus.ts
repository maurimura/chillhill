import './quick-menus.css';

/** Non-modal in-game panels: no backdrop, no route change, no lost driving input. */
export class QuickMenus {
  private panel: HTMLElement | null = null;
  private trigger: HTMLButtonElement | null = null;
  private abort = new AbortController();

  constructor(private onChange: () => void) {
    const options = { signal: this.abort.signal };
    document.querySelectorAll<HTMLButtonElement>('[data-quick-menu]').forEach((button) => {
      button.addEventListener(
        'click',
        () => {
          if (this.trigger === button) return this.close();
          this.close(false);
          this.trigger = button;
          this.panel = document.getElementById(button.dataset.quickMenu!)!;
          this.panel.hidden = false;
          button.setAttribute('aria-expanded', 'true');
          document.body.classList.add('quick-open');
          this.onChange();
          this.panel
            .querySelector<HTMLElement>('button, select, a')
            ?.focus({ preventScroll: true });
        },
        options,
      );
    });
    document.querySelectorAll('[data-close-quick]').forEach((button) => {
      button.addEventListener('click', () => this.close(), options);
    });
    document.addEventListener(
      'pointerdown',
      (event) => {
        if (
          this.panel &&
          event.target instanceof Element &&
          !this.panel.contains(event.target) &&
          !event.target.closest('[data-quick-menu]')
        ) {
          this.close(false);
        }
      },
      options,
    );
    document.addEventListener(
      'focusin',
      (event) => {
        if (
          this.panel &&
          event.target instanceof Element &&
          !this.panel.contains(event.target) &&
          !event.target.closest('[data-quick-menu]')
        ) {
          this.close(false);
        }
      },
      options,
    );
    document.addEventListener(
      'keydown',
      (event) => {
        // Panels sit after the canvas in DOM order. Return to their toolbar origin
        // at either tab boundary, rather than sending focus into browser chrome.
        if (this.panel && event.key === 'Tab') {
          const stops = [
            ...this.panel.querySelectorAll<HTMLElement>(
              'button:not(:disabled), a[href], select:not(:disabled), input:not(:disabled)',
            ),
          ].filter((element) => element.getClientRects().length > 0);
          const boundary = event.shiftKey ? stops[0] : stops.at(-1);
          if (document.activeElement === boundary) {
            event.preventDefault();
            this.close();
            return;
          }
        }
        if (this.panel && event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          this.close();
        }
      },
      options,
    );
  }

  get active() {
    return this.panel !== null;
  }
  get current() {
    return this.panel?.id ?? null;
  }

  close(restoreFocus = true) {
    if (!this.panel) return;
    const trigger = this.trigger;
    this.panel.hidden = true;
    this.panel = null;
    this.trigger = null;
    trigger?.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('quick-open');
    this.onChange();
    if (restoreFocus) trigger?.focus({ preventScroll: true });
  }

  dispose() {
    this.abort.abort();
    this.close(false);
  }
}
