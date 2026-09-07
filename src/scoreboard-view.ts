import { cars } from './config/cars.ts';
import { FocusScope } from './focus-scope.ts';
import { formatDistance, formatLength, formatSpeed, type UnitSystem } from './config/units.ts';
import { standardDriving } from './config/scoring.ts';
import type { OnlineScoreboard } from './online-scoreboard.ts';
import {
  customReasonLabel,
  type RunResult,
  type ScoreCategory,
  type ScoreRecord,
} from './scoreboard.ts';

const escape = (value: string | number) =>
  String(value).replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );
export const formatScore = (score: number) => Math.max(0, Math.round(score)).toLocaleString();
const ride = (row: ScoreRecord) => (row.cars.length > 1 ? 'Mixed cars' : cars[row.car].name);
const cell = (label: string, value: string) =>
  `<div><dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>`;

export function resultsMarkup(result: RunResult, units: UnitSystem, compact = false) {
  const row = result.record;
  return `<div class="result-heading"><span class="eyebrow">RUN COMPLETE · ${row.category.toUpperCase()}</span><strong class="result-score">${escape(formatScore(row.score))}<small>points</small></strong></div>
    ${compact ? '<details class="result-details"><summary>Run details</summary>' : ''}<dl class="result-stats">${cell('Near-miss points', `+${formatScore(row.nearMissEarned)}`)}${cell('Drift points', `+${formatScore(row.driftEarned)}`)}${cell('Shoulder penalties', `−${formatScore(row.penalties)}`)}${cell('Near misses', String(row.nearMisses))}${cell('Best clean streak', String(row.bestStreak))}${cell('Best drift', `${row.bestDriftSeconds.toFixed(1)}s`)}${cell('Distance', formatDistance(row.distance, units))}${cell('Shoulder touches', String(row.shoulderTouches))}${cell('Drifting time', `${row.driftSeconds.toFixed(1)}s`)}</dl>${compact ? '</details>' : ''}
    `;
}

export class ScoreboardView {
  readonly dialog: HTMLDialogElement;
  private content: HTMLDivElement;
  private embeddedHost: HTMLElement | null = null;
  private category: ScoreCategory = 'standard';
  private result: RunResult | null = null;
  private units: UnitSystem = 'metric';
  private opener: HTMLElement | null = null;
  // Native dialog.open becomes false before its queued close event. Keep the
  // game gated until focus and controls have been restored together.
  private showing = false;
  private abort = new AbortController();
  private focus: FocusScope;
  private alias = '';
  private pendingRow: HTMLLIElement | null = null;
  private resize: ResizeObserver;
  private unsubscribe: () => void;

  constructor(
    private onChange: () => void,
    private online: OnlineScoreboard,
  ) {
    this.dialog = document.createElement('dialog');
    this.dialog.id = 'scoreboard-dialog';
    this.dialog.setAttribute('aria-labelledby', 'scoreboard-title');
    this.content = document.createElement('div');
    this.content.className = 'scoreboard-content';
    this.content.innerHTML = `<div class="scoreboard-heading"><div><span class="eyebrow">DRIFT KING · TOP TEN</span><h2 id="scoreboard-title" tabindex="-1">The best roads.</h2></div><button class="icon-button" id="close-scoreboard" aria-label="Close scoreboard">×</button></div>
      <div class="scoreboard-body"><section id="scoreboard-result" aria-label="Last completed run" hidden></section>
      <section id="online-run" class="online-run" aria-label="Worldwide score entry" hidden></section>
      <div class="scoreboard-tabs" id="scoreboard-categories" role="group" aria-label="Score category"><button data-score-category="standard" aria-pressed="true">Standard</button><button data-score-category="custom" aria-pressed="false">Custom</button></div>
      <p id="scoreboard-category-note"></p><ol id="scoreboard-list" aria-label="Top ten runs"></ol><p class="online-privacy" id="leaderboard-privacy" hidden>2–20 characters. Your nickname and run stats will be public.</p></div>`;
    this.dialog.append(this.content);
    document.body.append(this.dialog);
    this.focus = new FocusScope(
      this.dialog,
      () => this.open,
      () => this.dialog.querySelector('#close-scoreboard'),
    );
    const options = { signal: this.abort.signal };
    this.unsubscribe = online.subscribe(() => {
      if (!this.open && !this.embeddedHost) return;
      this.renderClaim();
      this.renderRows();
    });
    this.content.querySelector('#scoreboard-list')!.addEventListener(
      'click',
      (event) => {
        if (!(event.target as HTMLElement).closest('[data-leaderboard-retry]')) return;
        void this.online.refresh(this.category);
        // The failed-load button disappears while retrying. Keep keyboard focus
        // in the leaderboard instead of dropping it onto the game's shortcuts.
        this.content
          .querySelector<HTMLElement>('#scoreboard-title')!
          .focus({ preventScroll: true });
      },
      options,
    );
    this.content.addEventListener(
      'input',
      (event) => {
        if (event.target instanceof HTMLInputElement && event.target.id === 'leaderboard-name')
          this.alias = event.target.value;
      },
      options,
    );
    this.content.addEventListener(
      'submit',
      (event) => {
        event.preventDefault();
        void this.online.submitName(this.alias);
      },
      options,
    );
    // Mobile keyboards can shrink only the visual viewport, not 100dvh. Keep
    // the results sheet inside that visible area without changing game sizing.
    const fitViewport = () => {
      const viewport = window.visualViewport;
      const card = document.getElementById('pause-card');
      if (!card) return;
      card.style.setProperty('--results-viewport-height', `${viewport?.height ?? innerHeight}px`);
      card.style.setProperty('--results-viewport-top', `${viewport?.offsetTop ?? 0}px`);
      card.classList.toggle('keyboard-visible', !!viewport && viewport.height < innerHeight * 0.75);
      this.revealEntry();
    };
    window.visualViewport?.addEventListener('resize', fitViewport, options);
    window.visualViewport?.addEventListener('scroll', fitViewport, options);
    window.addEventListener('resize', fitViewport, options);
    fitViewport();
    this.resize = new ResizeObserver(() => this.revealEntry());
    this.resize.observe(this.content.querySelector('#scoreboard-list')!);
    this.resize.observe(this.content.querySelector('.scoreboard-body')!);
    this.content.addEventListener(
      'focusin',
      () => {
        if (this.pendingRow?.contains(document.activeElement)) this.revealEntry();
      },
      options,
    );
    this.content.querySelector('#online-run')!.addEventListener(
      'click',
      (event) => {
        if ((event.target as HTMLElement).closest('[data-online-retry]')) void this.online.retry();
      },
      options,
    );
    this.content
      .querySelector('#close-scoreboard')!
      .addEventListener('click', () => this.dialog.close(), options);
    this.dialog.addEventListener(
      'close',
      () => {
        this.showing = false;
        if (this.embeddedHost) {
          this.embeddedHost.append(this.content);
          this.render();
        }
        this.onChange();
        if (this.opener?.checkVisibility()) this.opener.focus({ preventScroll: true });
      },
      options,
    );
    this.content.querySelectorAll<HTMLButtonElement>('[data-score-category]').forEach((button) =>
      button.addEventListener(
        'click',
        () => {
          this.category = button.dataset.scoreCategory as ScoreCategory;
          this.render();
          void this.online.refresh(this.category);
        },
        options,
      ),
    );
    this.dialog.addEventListener(
      'click',
      (event) => {
        if (event.target !== this.dialog) return;
        const rect = this.dialog.getBoundingClientRect();
        if (
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom
        )
          this.dialog.close();
      },
      options,
    );
  }
  get open() {
    return this.showing;
  }
  /** The same live panel moves between the finished-run column and the dialog.
   * There is only one name form, one draft and one subscription. */
  embed(host: HTMLElement, result: RunResult, units: UnitSystem) {
    if (!this.online.enabled) return;
    const changed = this.embeddedHost !== host || this.result?.record.id !== result.record.id;
    const unitsChanged = this.units !== units;
    this.embeddedHost = host;
    this.result = result;
    this.units = units;
    if (!this.open && this.content.parentElement !== host) host.append(this.content);
    if (changed) {
      this.category = result.record.category;
    }
    if (changed || unitsChanged) this.render();
    if (changed) void this.online.refresh(this.category);
  }
  clearEmbedded() {
    if (!this.embeddedHost) return;
    this.embeddedHost = null;
    if (!this.open) this.dialog.append(this.content);
  }
  show(category: ScoreCategory, result: RunResult | null, units: UnitSystem) {
    if (!this.online.enabled) return;
    this.opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.category = category;
    this.result = result;
    this.units = units;
    this.dialog.append(this.content);
    this.showing = true;
    this.render();
    this.dialog.showModal();
    this.onChange();
    (
      this.dialog.querySelector<HTMLElement>(
        matchMedia('(pointer: coarse)').matches
          ? '.is-pending-run'
          : '#leaderboard-name:not(:disabled)',
      ) ?? this.dialog.querySelector<HTMLButtonElement>('#close-scoreboard')!
    ).focus();
    void this.online.refresh(category);
  }
  syncUnits(units: UnitSystem) {
    if (this.units === units) return;
    this.units = units;
    if (this.open || this.embeddedHost) this.render();
  }
  private revealEntry() {
    if (!this.pendingRow?.isConnected || !this.pendingRow.checkVisibility()) return;
    const scroller = this.content.querySelector<HTMLElement>(
      this.embeddedHost && !this.open ? '#scoreboard-list' : '.scoreboard-body',
    )!;
    const area = scroller.getBoundingClientRect();
    const fullRow = this.pendingRow.getBoundingClientRect();
    const row =
      fullRow.height <= area.height
        ? fullRow
        : this.pendingRow.querySelector('.leaderboard-name-row')!.getBoundingClientRect();
    if (row.bottom > area.bottom) scroller.scrollTop += row.bottom - area.bottom + 2;
    if (row.top < area.top) scroller.scrollTop -= area.top - row.top + 2;
  }
  private render() {
    const get = (id: string) => this.content.querySelector<HTMLElement>(`#${id}`)!;
    const inline = !!this.embeddedHost && !this.open;
    get('close-scoreboard').hidden = inline;
    get('scoreboard-title').textContent = inline ? 'The leaderboard.' : 'The best roads.';
    get('scoreboard-result').hidden = !this.result || inline;
    if (this.result) get('scoreboard-result').innerHTML = resultsMarkup(this.result, this.units);
    this.renderClaim();
    get('scoreboard-categories').hidden = inline;
    this.content
      .querySelectorAll<HTMLButtonElement>('[data-score-category]')
      .forEach((button) =>
        button.setAttribute('aria-pressed', String(button.dataset.scoreCategory === this.category)),
      );
    get('scoreboard-category-note').textContent = inline
      ? `Worldwide top ten · ${this.category === 'standard' ? 'Standard' : 'Custom'} driving`
      : this.category === 'standard'
        ? `Default driving difficulty: ${formatSpeed(standardDriving.maxSpeed, this.units)} cap, ${formatLength(standardDriving.roadWidth, this.units)} road, standard curves, slope and drift. Any starting car and scenery. Changing driving settings, route, or cars mid-run makes it Custom.`
        : 'Custom setups and mid-run changes live here. Their difficulty varies, so these scores are kept separate from Standard.';
    this.renderRows();
  }
  private renderRows() {
    const get = (id: string) => this.content.querySelector<HTMLElement>(`#${id}`)!;
    const list = get('scoreboard-list');
    const claim = this.online.result;
    const pending =
      claim?.recordId === this.result?.record.id &&
      this.result?.record.category === this.category &&
      (claim?.status === 'qualified' || claim?.status === 'saving');
    const rows = this.online.entries.filter(
      (entry) =>
        entry.record.category === this.category &&
        (!pending || entry.record.id !== claim!.recordId),
    );
    const nodes: HTMLElement[] = [];
    let fresh = false;
    const heldFocus = list.contains(document.activeElement);
    if (pending) {
      fresh = this.pendingRow?.dataset.recordId !== claim!.recordId;
      if (fresh) {
        this.pendingRow = document.createElement('li');
        this.pendingRow.className = 'scoreboard-row is-current-run is-pending-run';
        this.pendingRow.dataset.recordId = claim!.recordId;
        this.pendingRow.tabIndex = -1;
        this.pendingRow.innerHTML = `<span class="scoreboard-rank"></span><form class="leaderboard-entry"><div class="leaderboard-name-row"><input id="leaderboard-name" name="nickname" aria-label="Your nickname" placeholder="Your nickname" autocomplete="nickname" enterkeyhint="done" minlength="2" maxlength="20" required aria-describedby="leaderboard-privacy leaderboard-name-status" value="${escape(this.alias)}"/><button type="submit">Save</button></div><p id="leaderboard-name-status" role="status"></p></form><strong class="scoreboard-points"></strong>`;
      }
      const row = this.pendingRow!;
      const saving = claim!.status === 'saving';
      row.querySelector('.scoreboard-rank')!.textContent = String(claim!.rank ?? 10);
      row.setAttribute('aria-label', `Your run · provisional rank ${claim!.rank ?? 10}`);
      row.querySelector('.scoreboard-points')!.textContent = formatScore(this.result!.record.score);
      row.querySelector<HTMLInputElement>('input')!.readOnly = saving;
      row.querySelector('form')!.setAttribute('aria-busy', String(saving));
      const button = row.querySelector('button')!;
      button.disabled = saving;
      button.textContent = saving ? 'Saving…' : 'Save';
      row.querySelector('#leaderboard-name-status')!.textContent = claim!.message;
    }
    rows.forEach(({ record: row, name }, index) => {
      const rank = index + 1 + (pending && index + 1 >= (claim!.rank ?? 10) ? 1 : 0);
      if (rank > 10) return;
      const node =
        ([...list.children].find(
          (element) => element instanceof HTMLElement && element.dataset.entryId === row.id,
        ) as HTMLElement) ?? document.createElement('li');
      node.dataset.entryId = row.id;
      node.className = `scoreboard-row${row.id === this.result?.record.id ? ' is-current-run' : ''}`;
      const markup = `<span class="scoreboard-rank">${rank}</span><div class="scoreboard-ride"><strong>${escape(name || ride(row))}</strong><span>${name ? `${escape(ride(row))} · ` : ''}${escape(row.nearMisses)} near misses · ${escape(formatDistance(row.distance, this.units))}</span><time datetime="${escape(row.finishedAt)}">${escape(new Date(row.finishedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }))}</time><details><summary>Run details</summary><p>${escape(`Top ${formatSpeed(row.topSpeed, this.units)} · average ${formatSpeed(row.averageSpeed, this.units)} while moving. ${row.shoulderTouches} shoulder touches · ${row.shoulderSeconds.toFixed(1)}s outside. Best streak ${row.bestStreak}. Drift points ${formatScore(row.driftEarned)} · best drift ${row.bestDriftSeconds.toFixed(1)}s. Starting seed ${row.seed}.`)}</p>${row.customReasons.length ? `<p>${escape(row.customReasons.map(customReasonLabel).join(' · '))}</p>` : ''}</details></div><strong class="scoreboard-points">${escape(formatScore(row.score))}<small>pts</small></strong>`;
      if (node.innerHTML !== markup) node.innerHTML = markup;
      nodes.push(node);
    });
    if (pending) nodes.splice(Math.min((claim!.rank ?? 10) - 1, nodes.length), 0, this.pendingRow!);
    if (!rows.length && (!pending || this.online.loading || this.online.error)) {
      const empty = document.createElement('li');
      empty.className = 'scoreboard-empty';
      empty.innerHTML = this.online.loading
        ? 'Looking down the road…'
        : this.online.error
          ? `${escape(this.online.error)}<br/><button class="text-button" data-leaderboard-retry>Try again ↻</button>`
          : 'No finished runs here yet.<br/>Your next road could be the first.';
      nodes.push(empty);
    }
    // Reconcile in place: never unmount the focused draft during list refresh,
    // saving, or unit changes. Selection and the mobile keyboard stay intact.
    [...list.children].forEach((node) => {
      if (!nodes.includes(node as HTMLElement)) node.remove();
    });
    nodes.forEach((node, index) => {
      if (list.children[index] !== node) list.insertBefore(node, list.children[index] ?? null);
    });
    get('leaderboard-privacy').hidden = !pending;
    if (fresh && (this.open || this.embeddedHost?.checkVisibility())) {
      const input = this.pendingRow!.querySelector('input')!;
      // Show the board first on phones; tapping the already-visible field opens
      // the keyboard. Desktop retains automatic typing focus.
      (matchMedia('(pointer: coarse)').matches ? this.pendingRow! : input).focus({
        preventScroll: true,
      });
      if (!matchMedia('(pointer: coarse)').matches) input.select();
      this.revealEntry();
    } else if (heldFocus && !list.contains(document.activeElement)) {
      get('scoreboard-title').focus({ preventScroll: true });
    }
    if (pending && this.pendingRow?.contains(document.activeElement)) this.revealEntry();
  }
  private renderClaim() {
    const element = this.content.querySelector<HTMLElement>('#online-run')!;
    const claim = this.online.result;
    element.hidden = !claim || claim.recordId !== this.result?.record.id;
    if (element.hidden || !claim) return;
    const heldFocus = element.contains(document.activeElement);
    const visible = this.open || !!this.embeddedHost?.checkVisibility();
    if (claim.status === 'qualified' || claim.status === 'saving') {
      element.hidden = true;
    } else {
      const copy =
        claim.status === 'checking'
          ? 'Checking your place in the worldwide top ten…'
          : claim.status === 'saved'
            ? `You’re on the board${claim.rank ? ` at #${claim.rank}` : ''}. See you on the next road.`
            : claim.status === 'not-qualified'
              ? claim.message ||
                'Not quite in the worldwide top ten this time. Another road awaits.'
              : claim.message;
      element.innerHTML = `<p role="status">${escape(copy)}</p>${claim.retryable ? '<button class="text-button" data-online-retry>Try checking again ↻</button>' : ''}`;
      if (heldFocus && visible)
        this.content
          .querySelector<HTMLElement>('#scoreboard-title')!
          .focus({ preventScroll: true });
    }
  }
  dispose() {
    this.resize.disconnect();
    this.unsubscribe();
    this.abort.abort();
    this.focus.dispose();
    this.content.remove();
    this.dialog.remove();
  }
}
