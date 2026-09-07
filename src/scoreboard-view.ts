import { cars } from './config/cars.ts';
import { FocusScope } from './focus-scope.ts';
import { formatDistance, formatLength, formatSpeed, type UnitSystem } from './config/units.ts';
import { scoringDefaults, standardDriving } from './config/scoring.ts';
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

export function resultsMarkup(result: RunResult, units: UnitSystem) {
  const row = result.record;
  return `<div class="result-heading"><span class="eyebrow">RUN COMPLETE · ${row.category.toUpperCase()}</span><strong class="result-score">${escape(formatScore(row.score))}<small>points</small></strong></div>
    <dl class="result-stats">${cell('Near-miss points', `+${formatScore(row.nearMissEarned)}`)}${cell('Drift points', `+${formatScore(row.driftEarned)}`)}${cell('Shoulder penalties', `−${formatScore(row.penalties)}`)}${cell('Near misses', String(row.nearMisses))}${cell('Best clean streak', String(row.bestStreak))}${cell('Best drift', `${row.bestDriftSeconds.toFixed(1)}s`)}${cell('Distance', formatDistance(row.distance, units))}${cell('Shoulder touches', String(row.shoulderTouches))}${cell('Drifting time', `${row.driftSeconds.toFixed(1)}s`)}</dl>
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
  private claimKey = '';
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
      <p id="scoreboard-category-note"></p><ol id="scoreboard-list" aria-label="Top ten runs"></ol>
      <p class="scoreboard-storage" id="scoreboard-storage"></p>
      <button class="text-button" id="refresh-leaderboard">Refresh scores ↻</button>
      <details class="scoring-rules"><summary>How points work</summary><p id="scoring-formula"></p><p id="scoring-drifts"></p><p id="scoring-penalties"></p><p>Only completed runs are recorded. Restarting or switching modes abandons the current run. Worldwide scores are community submissions with basic validation, not cheat-proof rankings.</p></details></div>`;
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
    this.content
      .querySelector('#refresh-leaderboard')!
      .addEventListener('click', () => void this.online.refresh(this.category), options);
    this.content.querySelector('#online-run')!.addEventListener(
      'input',
      (event) => {
        if (event.target instanceof HTMLInputElement) this.alias = event.target.value;
      },
      options,
    );
    this.content.querySelector('#online-run')!.addEventListener(
      'submit',
      (event) => {
        event.preventDefault();
        void this.online.submitName(this.alias);
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
      this.dialog.querySelector<HTMLInputElement>('#leaderboard-name:not(:disabled)') ??
      this.dialog.querySelector<HTMLButtonElement>('#close-scoreboard')!
    ).focus();
    void this.online.refresh(category);
  }
  syncUnits(units: UnitSystem) {
    if (this.units === units) return;
    this.units = units;
    if (this.open || this.embeddedHost) this.render();
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
    get('scoring-drifts').textContent =
      `On-road drifting earns ${scoringDefaults.driftPointsPerSecond} points per second, ramping to ${scoringDefaults.driftPointsPerSecond * scoringDefaults.driftMaxMultiplier} after ${scoringDefaults.driftRampSeconds} uninterrupted seconds. Straightening, stopping, touching a shoulder or crashing resets the drift multiplier. Turning smoke off does not affect points.`;
    get('scoring-formula').textContent =
      `Near miss = ${scoringDefaults.nearMissPoints} × speed multiplier × clean-streak multiplier. Speed multiplier is your speed ÷ ${formatSpeed(scoringDefaults.speedReference, this.units)}, limited to ${scoringDefaults.speedMinMultiplier}×–${scoringDefaults.speedMaxMultiplier}×. Speed is captured when the close pass first qualifies; points arrive only after you safely clear the car.`;
    get('scoring-penalties').textContent =
      `Clean streak: +${scoringDefaults.streakStep}× for each near miss, up to ${scoringDefaults.streakMaxMultiplier}×. There’s no combo timer. A shoulder departure costs ${scoringDefaults.shoulderEntryPenalty} points and resets the streak; staying outside drains ${scoringDefaults.shoulderMinRate}–${scoringDefaults.shoulderMaxRate} points per second. Scores never go below zero. Crashes cost a life and reset the streak.`;
  }
  private renderRows() {
    const get = (id: string) => this.content.querySelector<HTMLElement>(`#${id}`)!;
    const rows = this.online.entries.filter((entry) => entry.record.category === this.category);
    const markup = rows.length
      ? rows
          .map(
            ({ record: row, name }, index) =>
              `<li class="scoreboard-row${row.id === this.result?.record.id ? ' is-current-run' : ''}"><span class="scoreboard-rank">${index + 1}</span><div class="scoreboard-ride"><strong>${escape(name || ride(row))}</strong><span>${name ? `${escape(ride(row))} · ` : ''}${escape(row.nearMisses)} near misses · ${escape(formatDistance(row.distance, this.units))}</span><time datetime="${escape(row.finishedAt)}">${escape(new Date(row.finishedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }))}</time><details><summary>Run details</summary><p>${escape(`Top ${formatSpeed(row.topSpeed, this.units)} · average ${formatSpeed(row.averageSpeed, this.units)} while moving. ${row.shoulderTouches} shoulder touches · ${row.shoulderSeconds.toFixed(1)}s outside. Best streak ${row.bestStreak}. Drift points ${formatScore(row.driftEarned)} · best drift ${row.bestDriftSeconds.toFixed(1)}s. Starting seed ${row.seed}.`)}</p>${row.customReasons.length ? `<p>${escape(row.customReasons.map(customReasonLabel).join(' · '))}</p>` : ''}</details></div><strong class="scoreboard-points">${escape(formatScore(row.score))}<small>pts</small></strong></li>`,
          )
          .join('')
      : `<li class="scoreboard-empty">${this.online.loading ? 'Looking down the road…' : this.online.error ? escape(this.online.error) : 'No finished runs here yet.<br/>Your next road could be the first.'}</li>`;
    if (get('scoreboard-list').innerHTML !== markup) get('scoreboard-list').innerHTML = markup;
    (get('refresh-leaderboard') as HTMLButtonElement).disabled = this.online.loading;
    get('scoreboard-storage').textContent = `Community scores · rules v${scoringDefaults.version}`;
  }
  private renderClaim() {
    const element = this.content.querySelector<HTMLElement>('#online-run')!;
    const claim = this.online.result;
    element.hidden = !claim || claim.recordId !== this.result?.record.id;
    if (element.hidden || !claim) return;
    const key = `${claim.recordId}:${claim.status}:${claim.rank}:${claim.message}`;
    if (key === this.claimKey) return; // Never replace a name field while typing.
    this.claimKey = key;
    const heldFocus = element.contains(document.activeElement);
    const visible = this.open || !!this.embeddedHost?.checkVisibility();
    if (claim.status === 'qualified' || claim.status === 'saving') {
      const fresh = element.querySelector('form')?.dataset.recordId !== claim.recordId;
      if (fresh)
        element.innerHTML = `<span class="eyebrow">WORLDWIDE TOP TEN · ${escape(this.result!.record.category)}</span><h3>You made the board.</h3><p data-claim-rank></p><form data-record-id="${escape(claim.recordId)}"><label for="leaderboard-name">Your nickname</label><div class="leaderboard-name-row"><input id="leaderboard-name" name="nickname" autocomplete="nickname" minlength="2" maxlength="20" required aria-describedby="leaderboard-privacy leaderboard-name-status" value="${escape(this.alias)}"/><button type="submit">Join the board</button></div><p class="online-privacy" id="leaderboard-privacy">2–20 characters. Your nickname and run stats will be public. No account needed.</p><p id="leaderboard-name-status" role="status"></p></form>`;
      const input = element.querySelector<HTMLInputElement>('input')!;
      const button = element.querySelector<HTMLButtonElement>('button[type="submit"]')!;
      const saving = claim.status === 'saving';
      // Keep the focused field mounted/read-only during the request. Replacing
      // or disabling it would send a repeated Enter to the game's restart key.
      input.readOnly = saving;
      button.disabled = saving;
      button.textContent = saving ? 'Saving…' : 'Join the board';
      element.querySelector('form')!.setAttribute('aria-busy', String(saving));
      element.querySelector('[data-claim-rank]')!.textContent =
        `Your run qualifies at #${claim.rank ?? 10}. Leave your mark?`;
      element.querySelector('#leaderboard-name-status')!.textContent = claim.message;
      if (fresh && !saving && visible) {
        input.focus();
        input.select();
      } else if (saving && heldFocus && visible) input.focus({ preventScroll: true });
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
    this.unsubscribe();
    this.abort.abort();
    this.focus.dispose();
    this.content.remove();
    this.dialog.remove();
  }
}
