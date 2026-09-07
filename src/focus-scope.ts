/** Keyboard focus stays in the open pause card. Pointer access to the toolbar
 * remains available so a paused driver can still open scenery, music or cars. */
export class FocusScope {
  private abort = new AbortController();

  constructor(
    private root: HTMLElement,
    private active: () => boolean,
    private preferred: () => HTMLElement | null,
  ) {
    const options = { signal: this.abort.signal };
    document.addEventListener(
      'focusin',
      (event) => {
        if (this.active() && event.target instanceof Node && !this.root.contains(event.target))
          this.focus();
      },
      options,
    );
    this.root.addEventListener(
      'keydown',
      (event) => {
        if (event.key !== 'Tab' || !this.active()) return;
        const stops = [
          ...this.root.querySelectorAll<HTMLElement>(
            'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), summary, [tabindex="0"]',
          ),
        ].filter((node) => node.getClientRects().length);
        const first = stops[0],
          last = stops.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus({ preventScroll: true });
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus({ preventScroll: true });
        }
      },
      options,
    );
  }

  focus() {
    if (this.active()) (this.preferred() ?? this.root).focus({ preventScroll: true });
  }
  dispose() {
    this.abort.abort();
  }
}
