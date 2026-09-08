import './style.css';
import './scoreboard.css';
import './mobile-hud.css';
import '@fontsource-variable/dm-sans';
import '@fontsource/dm-serif-display/latin-400.css';
import '@fontsource/dm-serif-display/latin-400-italic.css';
import {
  defaults,
  limits,
  loadSettings,
  normalizeSettings,
  saveSettings,
  styles,
  type Settings,
  type StyleId,
} from './config';
import { GameScene } from './game/scene';
import { ReplayRecorder } from './game/replay';
import { ReplayView } from './replay-view';
import { initialState, roadOffsetLimit, stepDriving } from './game/driving';
import { roadAt } from './game/route';
import { Controls } from './game/input';
import { Ambience } from './game/audio';
import { cars } from './config/cars';
import { Garage } from './garage';
import { WorldComposer } from './world-composer';
import { worldOptions } from './config/world';
import { QuickMenus } from './quick-menus';
import { FocusScope } from './focus-scope';
import { CarMenu } from './car-menu';
import { MusicPlayer } from './music';
import { freshRouteSeed } from './config/route-seed';
import { curveMixLabel } from './config/road-shape';
import { initialChallenge, stepChallenge } from './game/challenge';
import { challengeDefaults } from './config/challenge';
import { driftMultiplier, resetScoreEncounter, streakMultiplier } from './game/scoring';
import { OnlineScoreboard } from './online-scoreboard';
import { requestUnitCountry } from './unit-country';
import {
  completedScore,
  createScoreRun,
  ScoreboardStore,
  trackScoreSettings,
  type RunResult,
} from './scoreboard';
import { formatScore, resultsMarkup, ScoreboardView } from './scoreboard-view';
import {
  distanceValue,
  formatDistance,
  formatLength,
  formatSpeed,
  inferUnitSystem,
  configureUnitCountry,
  resolveUnitSystem,
  normalizeUnits,
  speedValue,
  unitLabels,
} from './config/units';
import {
  createWorldClock,
  stepWorldClock,
  syncWorldClock,
  worldClockTelemetry,
} from './game/world-clock';

const icons = {
  hill: '<path d="m1 20.5 7-12 5 8 4-6 6 10M5 20.5h13"/><circle cx="18" cy="5.5" r="2"/>',
  car: '<path d="m5 9 2-5h10l2 5M3 10l2-1h14l2 1v8H3v-8Zm2 8v2m14-2v2M6 13h2m8 0h2M9 16h6"/>',
  garage: '<path d="M3 21V8l9-5 9 5v13M7 21V11h10v10M7 15h10M7 18h10"/>',
  github:
    '<path d="M9 21v-3.5c-3.6.8-3.7-1.7-5-2.2M15 21v-3.7c0-1-.4-1.7-1-2.1 3.3-.4 6-1.8 6-5.5 0-1.3-.4-2.4-1.3-3.3.2-.9.2-2-.3-3.1-1.5 0-2.7.8-3.5 1.4a11.7 11.7 0 0 0-5.8 0C8.3 4.1 7.1 3.3 5.6 3.3c-.5 1.1-.5 2.2-.3 3.1C4.4 7.3 4 8.4 4 9.7c0 3.7 2.7 5.1 6 5.5-.6.4-1 1.1-1 2.1"/>',
  tune: '<path d="M4 7h7m4 0h5M4 17h3m4 0h9"/><circle cx="13" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  sound: '<path d="m11 5-6 4H2v6h3l6 4V5Zm4 3a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  play: '<path d="m8 5 11 7-11 7V5Z"/>',
  clapperboard:
    '<path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8ZM3 11 2 6l18-4 1 5-18 4ZM7 5l3 4m4-5.5 3 4"/>',
  reset: '<path d="M3 11a9 9 0 1 1 2 7M3 4v7h7"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 1v2m0 18v2M1 12h2m18 0h2M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/>',
  moon: '<path d="M20 14a8 8 0 0 1-10-10A8.5 8.5 0 1 0 20 14Z"/>',
  cloud: '<path d="M6 18a4 4 0 1 1 .4-8A6 6 0 0 1 18 9a4.5 4.5 0 0 1 0 9H6Z"/>',
  rain: '<path d="M6 14a4 4 0 1 1 .4-8A6 6 0 0 1 18 7a3.5 3.5 0 0 1 1 7M7 18l-1 3m7-3-1 3m7-3-1 3"/>',
  snow: '<path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9 4l3 3 3-3M9 20l3-3 3 3M4 10l4-.8-.7-4M20 14l-4 .8.7 4M4 14l4 .8-.7 4M20 10l-4-.8.7-4"/>',
};
const icon = (name: keyof typeof icons, className = '') =>
  `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
// Small roadside pictograms, drawn with the same soft linework as the HUD.
const drivingSigns = {
  cliff:
    '<path d="M3 29h19v12m-2-8 3 3-3 3M33 28l3 4m-1-7 4 4"/><g transform="rotate(24 23 18)"><path d="M10 20v-7l6-1 4-5h10l4 6 4 2v5h-3m-7 0H20m-7-7h21M25 8v5"/><circle cx="16" cy="20" r="3"/><circle cx="31" cy="20" r="3"/></g>',
  crash:
    '<path d="M3 30v-7l4-7h8l4 7v7h-3m-7 0H6M5 23h12m13 7v-7l4-7h7l4 7v7h-3m-7 0h-2m-1-7h11M21 18l3-5 3 5m-3-8V6m-7 5-3-3m17 3 3-3M21 27l3-4 3 4-3 5Z"/><circle cx="6" cy="30" r="2.5"/><circle cx="16" cy="30" r="2.5"/><circle cx="33" cy="30" r="2.5"/><circle cx="42" cy="30" r="2.5"/>',
  road: '<path d="M8 31V21l5-9h22l5 9v10H8Zm2-10h28M12 31v5m24-5v5M13 26h5m12 0h5M5 41h38"/>',
};
const drivingSign = (name: keyof typeof drivingSigns) =>
  `<svg class="driving-sign" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${drivingSigns[name]}</svg>`;
const slider = (
  key: keyof Settings,
  label: string,
  min: number,
  max: number,
  step: number,
  suffix = '',
) =>
  `<label class="slider-label" for="${key}"><span>${label}</span><output id="${key}-value"></output></label><input id="${key}" data-setting="${key}" data-suffix="${suffix}" type="range" min="${min}" max="${max}" step="${step}" />`;
const modePicker = (welcome = false) =>
  `<div class="mode-picker" role="group" aria-label="Start driving"><button class="mode-option" id="${welcome ? 'start' : 'resume'}" data-mode="cozy" data-current="true"><span><strong>Easy drive</strong><small>Just wander</small></span>${icon('arrow')}</button><button class="mode-option" id="${welcome ? 'start-challenge' : 'resume-challenge'}" data-mode="challenge" data-current="false"><span><strong>Drift king</strong><small>${challengeDefaults.lives} lives · traffic</small></span>${icon('arrow')}</button></div>`;

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <nav class="site-header" aria-label="Main navigation">
    <div class="nav-identity"><a class="brand" href="#drive" aria-label="chillhill home"><span class="brand-mark">${icon('hill')}</span><span class="brand-name">chillhill</span></a><span class="world-label" id="world-label"><span class="eyebrow" id="place"></span></span><h1 class="nav-title" id="garage-title" hidden>The garage<span>.</span></h1></div>
    <div class="header-actions">
      <a class="garage-nav back-drive" id="back-drive" href="#drive" aria-label="Back to the hillside" title="Back to the hillside" hidden>${icon('arrow')}<span>Back to the hillside</span></a>
      <div class="drive-toolbar" id="drive-toolbar" role="group" aria-label="Drive controls" hidden><button class="icon-button" id="pause" aria-label="Pause drive" title="Pause · Esc">${icon('pause')}</button><button class="icon-button" id="open-replay-toolbar" aria-label="Replay & save video" aria-haspopup="dialog" aria-controls="replay-view" title="Replay & save video">${icon('clapperboard')}</button><button class="icon-button" id="restart" aria-label="Restart drive" title="Back to the top · R">${icon('reset')}</button></div>
      <button class="icon-button" id="open-car-menu" data-quick-menu="car-menu" aria-label="Choose your car" aria-haspopup="dialog" aria-controls="car-menu" aria-expanded="false" title="Choose your car">${icon('car')}</button>
      <button class="icon-button" id="open-world-menu" data-quick-menu="world-menu" aria-label="Landscape & weather" aria-haspopup="dialog" aria-controls="world-menu" aria-expanded="false" title="Landscape & weather"><span id="weather-icon">${icon('sun')}</span></button>
      <button class="icon-button sound-button" id="sound" data-quick-menu="music-menu" aria-label="Music & ambience" aria-haspopup="dialog" aria-controls="music-menu" aria-expanded="false" title="Music & ambience">${icon('sound')}<span class="sound-slash"></span></button>
      <button class="icon-button" id="open-settings" aria-label="Advanced settings" aria-haspopup="dialog" aria-controls="settings-dialog" title="Advanced settings">${icon('tune')}</button>
      <a class="icon-button github-link" id="github-link" href="https://github.com/maurimura/chillhill" target="_blank" rel="noopener noreferrer" aria-label="View chillhill on GitHub (opens in a new tab)" title="chillhill on GitHub">${icon('github')}</a>
    </div>
  </nav>
  <main class="game-shell" id="game-shell">
    <div id="scene"></div>
    <section class="intro" id="intro">
      <div class="eyebrow intro-kicker"><span></span> LESS HURRY, MORE HORIZON</div>
      <h1>Take the<br/><em>scenic route.</em></h1>
      <p id="intro-copy">A winding road. A little car. A moment for yourself.<br class="desktop-break"/> Let the hill do the work.</p>
      ${modePicker(true)}
      <span class="start-note" id="start-note"><kbd>←</kbd> <kbd>→</kbd> choose your drive · <kbd>enter</kbd> to go</span>
    </section>
    <section class="pause-card" id="pause-card" role="dialog" aria-modal="false" aria-labelledby="pause-title" aria-describedby="pause-copy" tabindex="-1" hidden><div class="pause-summary"><span class="eyebrow" id="pause-kicker">THERE’S NO RUSH</span><h2 id="pause-title">Take a little breather.</h2><p id="pause-copy">The road will be right here.</p><div id="run-results" hidden></div>${modePicker()}<button class="text-button scoreboard-link" id="open-scoreboard" aria-haspopup="dialog" aria-controls="scoreboard-dialog" hidden>View scoreboard ↗</button></div><section id="run-leaderboard" aria-label="Leaderboard and worldwide name entry" hidden></section></section>
    <div class="challenge-hud" id="challenge-hud" hidden><span class="eyebrow">DRIFT KING</span><span class="score-category" id="score-category">Standard</span><button class="score-total" id="open-scoreboard-hud" aria-label="View score and scoreboard" aria-haspopup="dialog" aria-controls="scoreboard-dialog" title="View your scoreboard"><strong id="score">0</strong><span>pts ↗</span></button><span class="score-streak" id="score-streak" title="Multiplier for your next clean near miss">×1</span><div class="score-stats"><span><strong id="lives">3</strong> lives</span><span><strong id="overtakes">0</strong> near misses</span></div><div class="score-feedback" id="score-feedback" role="status" hidden></div></div>
    <div class="driving-feedback">
      <div class="challenge-message" id="challenge-message" role="status" hidden><span class="feedback-sign" id="incident-cliff-sign" hidden>${drivingSign('cliff')}</span><span class="feedback-sign" id="incident-crash-sign" hidden>${drivingSign('crash')}</span><span class="feedback-sign" id="incident-road-sign" hidden>${drivingSign('road')}</span><span id="incident-copy"></span></div>
      <div class="challenge-message recovery-warning" id="road-recovery-warning" hidden><span class="feedback-sign" id="recovery-cliff-sign">${drivingSign('cliff')}</span><span class="feedback-sign" id="recovery-road-sign" hidden>${drivingSign('road')}</span><div class="feedback-copy"><span id="road-recovery-instruction" role="status"></span><span id="road-recovery-time" aria-hidden="true"></span></div><div class="recovery-track" id="road-recovery-meter" role="meter" aria-label="Off-road recovery budget" aria-valuemin="0" aria-valuemax="100"><span id="road-recovery-fill"></span></div></div>
    </div>
    <aside class="collision-legend" id="collision-legend" aria-label="Collision debug legend" hidden><strong>Hitboxes · H to hide</strong><span class="debug-player">Mint: your car’s body</span><span class="debug-traffic">Amber: traffic bodies</span><span>White: asphalt edge</span><span class="debug-safe">Blue: safe car-position limit</span><span class="debug-limit">Pink: recovery limit</span><small>Planar body collisions in Drift king.<br/>Mirrors, trees, rocks & rails: non-colliding.</small></aside>
    <div class="bottom-hud">
      <div class="route-card"><div class="route-drawing"><svg viewBox="0 0 72 76" aria-label="The next stretch of road"><path d="M36 68L36 8" fill="none" stroke="currentColor" stroke-opacity=".25" stroke-width="3" stroke-linecap="round"/><circle id="route-dot" cx="36" cy="68" r="4" fill="currentColor"/></svg></div><div><span class="eyebrow">THE ROAD AHEAD</span><span class="route-distance"><span id="distance">0.00</span> <small id="distance-unit">km wandered</small></span><span class="route-note" id="route-note">Just you and the hillside.</span><span class="world-clock-label" id="world-clock-label"></span></div></div>
      <div class="speed-card"><span class="speed-number" id="speed">00</span><div><span class="speed-unit" id="speed-unit">KM/H</span><span class="speed-status" id="speed-status">NICE & EASY</span></div><div class="speed-track"><span id="speed-fill"></span></div></div>
    </div>
    <div id="touch-gesture" hidden aria-hidden="true"><span></span></div>
    <div class="touch-controls"><span class="thumb-hint">ONE THUMB. ALL YOU NEED.</span><div id="thumb-pad" role="group" aria-label="Drag anywhere on the game to drive, or use this pad: left or right to steer, up to accelerate, and hold down to brake"><span class="pad-up">GO ↑</span><span class="pad-left">←</span><span class="pad-right">→</span><span class="pad-down">BRAKE ↓</span><span class="pad-anywhere">DRAG<br>ANYWHERE</span><span class="pad-puck"></span></div></div>
    <aside class="driving-guide" aria-label="Driving controls"><div class="keyboard-guide"><span><kbd>A</kbd><kbd>D</kbd> steer</span><span><kbd>W</kbd> <span id="throttle-guide">a little faster</span></span><span><kbd>S</kbd> slow down & stop</span><span><kbd>V</kbd> hold for front view</span><span class="arrows-note">arrow keys work, too</span></div></aside>
    <div class="canvas-error" id="canvas-error" hidden><h2>The view couldn’t load.</h2><p>This game needs a browser with WebGL 2 and graphics acceleration enabled. Try an updated Chrome, Safari, or Firefox.</p><button class="start-button" id="reload">Try again</button></div>
  </main>
  <section class="quick-panel" id="car-menu" role="dialog" aria-modal="false" aria-labelledby="car-menu-title" hidden>
    <div class="quick-heading"><div><span class="eyebrow">A CHANGE OF PACE</span><h2 id="car-menu-title">Your ride.</h2></div><button class="icon-button" id="close-car-menu" data-close-quick aria-label="Close car selection">${icon('close')}</button></div>
    <div class="quick-scroll" id="car-options"></div>
    <a class="garage-link" id="open-garage" href="#garage">${icon('garage')}<span>Visit the garage<small>Paint, details & a closer look</small></span>${icon('arrow')}</a>
  </section>
  <section class="quick-panel" id="world-menu" role="dialog" aria-modal="false" aria-labelledby="world-menu-title" hidden>
    <div class="quick-heading"><div><span class="eyebrow">A DIFFERENT FEELING</span><h2 id="world-menu-title">The scenery.</h2><p id="weather">Clear · Daylight</p></div><button class="icon-button" id="close-world-menu" data-close-quick aria-label="Close scenery selection">${icon('close')}</button></div>
    <div class="quick-scroll" id="world-options"></div>
  </section>
  <dialog id="settings-dialog" aria-labelledby="settings-title"><div class="panel-header"><div><span class="eyebrow">THE FINER DETAILS</span><h2 id="settings-title">Advanced settings.</h2></div><button class="icon-button" id="close-settings" aria-label="Close settings">${icon('close')}</button></div><div class="panel-scroll">
    <p class="panel-intro">Fine-tune the look, the road, and the way you drift.</p>
    <fieldset class="units-picker"><legend>YOUR PREFERRED UNITS</legend><label for="units">Measurement system</label><select id="units" aria-describedby="units-note"><option value="auto">Auto · country</option><option value="metric">Metric · km/h, km, m</option><option value="imperial">Imperial · mph, mi, ft</option></select><p class="field-note" id="units-note">Use your country’s driving units, or choose your own. Country only—no GPS permission or location storage.</p></fieldset>
    <fieldset class="style-picker"><legend>THE ART PALETTE</legend>${Object.entries(styles)
      .map(
        ([key, style]) =>
          `<button class="style-option" data-style="${key}" aria-pressed="false"><span class="style-preview ${key}"><i></i><b></b></span><span>${style.name}</span><span class="style-check">✓</span></button>`,
      )
      .join('')}</fieldset>
    <fieldset><legend>SOFTEN THE EDGES</legend>${slider('roundness', 'Shape softness', 0, 1, 0.05)}<p class="field-note">From angular low poly to soft, rounded shapes. Changes the car, trees, rocks, mountains, and terrain in every atmosphere.</p></fieldset>
    <fieldset><legend>SHAPE THE HILLSIDE</legend>${slider('curveMix', 'Curve mix', limits.curveMix[0], limits.curveMix[1], 0.05)}<p class="field-note">Twisty ↔ Sweeping. In the middle: shorter bends, long arcs, flowing S-curves, and room to breathe.</p>${slider('curves', 'Curve tightness', 0.2, 1.7, 0.05)}${slider('curveLength', 'Curve length', limits.curveLength[0], limits.curveLength[1], 0.05)}<p class="field-note">Length stretches the curves; straights stay short. Tightness makes bends sharper or gentler. Curve mix changes how often you find each kind.</p>${slider('roadWidth', 'Road width', 7, 16, 0.5, ' m')}${slider('grade', 'Downhill slope', 0.03, 0.16, 0.01)}${slider('terrainHeight', 'Mountain height', 0.25, 2, 0.05)}${slider('treeDensity', 'Trees', 0, 2, 0.1)}${slider('fog', 'Misty distance', 0, 1, 0.05)}<div class="seed-row"><label for="seed">Landscape seed</label><input id="seed" type="number" data-setting="seed" min="1" max="99999" step="1"/><button class="icon-button" id="new-seed" aria-label="Generate another landscape" title="Another landscape">${icon('reset')}</button></div></fieldset>
    <fieldset><legend>FIND YOUR FLOW</legend>${slider('cruiseSpeed', 'Coasting speed', 15, 55, 1, ' km/h')}${slider('maxSpeed', 'Top speed', limits.maxSpeed[0], limits.maxSpeed[1], 1, ' km/h')}${slider('drift', 'Slide & drift', 0, 1, 0.05)}${slider('smoke', 'Tire smoke', 0, 1, 0.05)}<p class="field-note">Steer into a smooth rear-end slide. Release or countersteer to let the tail settle; you keep rolling forward. The brake still holds you completely still.</p></fieldset>
    <fieldset><legend>KEEP IT SMOOTH</legend>${slider('pixelRatio', 'Render quality', 0.75, 2, 0.25)}<p class="field-note">Lower this for a smoother drive on smaller devices.</p></fieldset>
    <fieldset><legend>UNDER THE HOOD</legend><label class="debug-toggle" for="debug-hitboxes"><input type="checkbox" id="debug-hitboxes"/> Show collision hitboxes <kbd>H</kbd></label><p class="field-note">Live body outlines and road/recovery limits. Uses the same geometry as collision detection. Scenery and mirrors do not cause crashes. Debug view is off on refresh.</p></fieldset>
    <div class="panel-bottom"><button class="text-button" id="reset-settings">Restore defaults</button><button class="text-button" id="export-settings">Export settings ↗</button></div><p class="saved-note" id="saved-note" role="status">Changes are saved on this device.</p>
  </div></dialog>
`;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
let settings = loadSettings();
configureUnitCountry(null, import.meta.env.PROD);
const automaticUnits = () => inferUnitSystem();
const selectedUnits = () => resolveUnitSystem(settings.units);
let unitSystem = selectedUnits();
settings.seed = freshRouteSeed(settings.seed);
let state = initialState();
let mode: 'cozy' | 'challenge' = 'cozy';
let challenge = initialChallenge(settings, state);
let scoreRun = createScoreRun(settings);
let runResult: RunResult | null = null;
const scoreStore = new ScoreboardStore();
const onlineScores = new OnlineScoreboard();
const worldClock = createWorldClock(settings);
const replayRecorder = new ReplayRecorder();
const controls = new Controls();
const ambience = new Ambience();
const dialog = $<HTMLDialogElement>('settings-dialog');
let started = false;
let paused = false;
let debugHitboxes = false;
let scene: GameScene | undefined;
let inGarage = false;
const music = new MusicPlayer(ambience);
const quickMenus = new QuickMenus(syncPlayUI);
const scoreboard = new ScoreboardView(syncPlayUI, onlineScores);
const garage = new Garage(settings, updateSettings);
const carMenu = new CarMenu(settings, updateSettings);
const composer = new WorldComposer(settings, updateSettings);
const replayView = new ReplayView((open) => {
  clearTimeout(rebuildTimer);
  if (open) {
    quickMenus.close(false);
    paused = started;
    controls.clear();
  } else {
    scene?.applySettings(settings);
    scene?.resetMotion();
  }
  syncPlayUI();
  updateHUD();
  if (!open) $('open-replay').focus({ preventScroll: true });
});
const replayButton = document.createElement('button');
replayButton.id = 'open-replay';
replayButton.className = 'replay-button';
replayButton.setAttribute('aria-haspopup', 'dialog');
replayButton.setAttribute('aria-controls', 'replay-view');
replayButton.innerHTML = `${icon('clapperboard')}<span>Replay & save video</span>`;
const runActions = $('pause-card').querySelector<HTMLElement>('.mode-picker')!;
runActions.setAttribute('aria-label', 'Run actions');
runActions.append(replayButton);
for (const id of ['open-replay', 'open-replay-toolbar'])
  $(id).addEventListener('click', () => {
    if (!scene) return;
    // Include the exact paused/game-over endpoint between regular samples.
    if (started)
      replayRecorder.capture(
        0,
        settings,
        state,
        controls.read(),
        mode === 'challenge' ? challenge : undefined,
        true,
      );
    replayView.show(replayRecorder.snapshot(mode));
  });
const pauseFocus = new FocusScope(
  $('pause-card'),
  () =>
    !$('pause-card').hidden && !inGarage && !dialog.open && !quickMenus.active && !scoreboard.open,
  () =>
    document.querySelector(
      matchMedia('(pointer: coarse)').matches
        ? '#pause-card .is-pending-run'
        : '#pause-card #leaderboard-name:not([readonly])',
    ) ?? document.querySelector('#pause-card #resume'),
);
let frameId = 0;
let rebuildTimer = 0;
let lastTime = performance.now();
let uiElapsed = 0;

function syncSettingsUI() {
  unitSystem = selectedUnits();
  scoreboard.syncUnits(unitSystem);
  $<HTMLSelectElement>('units').value = settings.units;
  const automatic = automaticUnits();
  $<HTMLSelectElement>('units').options[0].textContent =
    `Auto · ${automatic === 'metric' ? 'Metric' : 'Imperial'} (${unitLabels[automatic].speed})`;
  $('speed-unit').textContent = unitLabels[unitSystem].speed.toUpperCase();
  $('distance-unit').textContent = `${unitLabels[unitSystem].distance} wandered`;
  carMenu.sync(settings);
  composer.sync(settings);
  document.body.classList.toggle('is-night', settings.timeOfDay === 'night');
  document.body.classList.toggle('is-dusk', settings.timeOfDay === 'dusk');
  document.body.classList.toggle('in-forest', settings.landscape === 'forest');
  document.querySelectorAll<HTMLInputElement>('[data-setting]').forEach((input) => {
    const key = input.dataset.setting as keyof Settings;
    input.value = String(settings[key]);
    const output = document.getElementById(`${key}-value`);
    if (output)
      output.textContent =
        key === 'cruiseSpeed' || key === 'maxSpeed'
          ? formatSpeed(Number(settings[key]), unitSystem)
          : key === 'roadWidth'
            ? formatLength(settings.roadWidth, unitSystem)
            : key === 'grade'
              ? `${Math.round(settings.grade * 100)}%`
              : key === 'fog' || key === 'drift' || key === 'roundness' || key === 'smoke'
                ? `${Math.round(Number(settings[key]) * 100)}%`
                : key === 'curveMix'
                  ? curveMixLabel(settings.curveMix)
                  : `${settings[key]}${input.dataset.suffix || '×'}`;
    if (input.type === 'range') {
      if (output) input.setAttribute('aria-valuetext', output.textContent!);
      input.style.setProperty(
        '--range-progress',
        `${((Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min))) * 100}%`,
      );
    }
  });
  const selectedCar = cars[settings.car];
  $('open-car-menu').title = `Choose your car · ${selectedCar.name} ${selectedCar.variant}`;
  $('open-car-menu').setAttribute('aria-label', $('open-car-menu').title);
  document
    .querySelectorAll<HTMLButtonElement>('[data-style]')
    .forEach((button) =>
      button.setAttribute('aria-pressed', String(button.dataset.style === settings.style)),
    );
  $('place').textContent = {
    highlands: styles[settings.style].place,
    coast: 'THE SUNWASHED COAST',
    city: 'CITY AFTERGLOW',
    desert: 'DESERT QUIET',
    lakes: 'THE ALPINE LAKES',
    forest: 'TALLWOOD',
  }[settings.landscape];
  $('place').title = $('place').textContent!;
  $('weather').textContent =
    `${worldOptions.weather[settings.weather]} · ${worldOptions.timeOfDay[settings.timeOfDay]}`;
  $('open-world-menu').title =
    `Landscape & weather · ${worldOptions.landscape[settings.landscape]} · ${$('weather').textContent}`;
  $('open-world-menu').setAttribute('aria-label', $('open-world-menu').title);
  $('weather-icon').innerHTML = icon(
    settings.weather === 'clear'
      ? settings.timeOfDay === 'night'
        ? 'moon'
        : 'sun'
      : settings.weather === 'overcast'
        ? 'cloud'
        : settings.weather,
  );
  $('route-note').textContent = {
    highlands: styles[settings.style].caption,
    coast: 'Salt in the air. A little more horizon.',
    city: 'The city below. A little quiet up here.',
    desert: 'Wide skies. Warm stone. Time to wander.',
    lakes: 'Still water between the mountains.',
    forest: 'A quiet road beneath the canopy.',
  }[settings.landscape];
}

function updateSettings(patch: Partial<Settings>) {
  const previous = settings;
  settings = normalizeSettings(patch, settings);
  if (mode === 'challenge' && started && challenge.phase !== 'gameover')
    trackScoreSettings(scoreRun, previous, settings);
  syncWorldClock(worldClock, patch, settings);
  saveSettings(settings);
  syncSettingsUI();
  garage.applySettings(settings);
  if (Object.keys(patch).every((key) => key === 'units')) {
    // Display-only preferences must not clamp/restart the car or rebuild the world.
    syncModeUI();
    updateHUD();
    return;
  }
  // Apply world changes together so dragging a slider doesn't rebuild every frame.
  clearTimeout(rebuildTimer);
  rebuildTimer = window.setTimeout(() => {
    if (!inGarage && !replayView.open) scene?.applySettings(settings);
  }, 120);
  if (mode === 'cozy') {
    const edge = roadOffsetLimit(settings.roadWidth, state.slide, settings.car);
    state.offset = Math.max(-edge, Math.min(edge, state.offset));
  } else if (
    (['seed', 'curves', 'curveLength', 'curveMix', 'roadWidth', 'grade', 'car'] as const).some(
      (key) => previous[key] !== settings[key],
    ) &&
    challenge.phase === 'racing'
  ) {
    // A new road or a larger car must not materialize around the player and cost a life.
    const { distance, travelled } = state;
    state = { ...initialState(), distance, travelled, offset: settings.roadWidth / 4 };
    challenge = {
      ...initialChallenge(settings, state),
      lives: challenge.lives,
      overtakes: challenge.overtakes,
      score: challenge.score,
    };
    resetScoreEncounter(challenge.score);
    scene?.resetMotion();
  }
  state.speed = Math.min(state.speed, settings.maxSpeed / 3.6);
  updateHUD();
}

function syncModeUI() {
  const challenging = mode === 'challenge';
  const gameover = challenging && challenge.phase === 'gameover';
  document.body.classList.toggle('is-challenge', challenging);
  document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((button) => {
    const current = button.dataset.mode === mode;
    const name = button.dataset.mode === 'cozy' ? 'Easy drive' : 'Drift king';
    button.dataset.current = String(current);
    button.title = started && current && !gameover ? `Resume ${name}` : `Start ${name}`;
    if (button.closest('#pause-card')) {
      // The current mode is also the resume action; a second CTA is unnecessary.
      button.id = current ? 'resume' : `resume-${button.dataset.mode}`;
      if (current) button.setAttribute('aria-keyshortcuts', 'Enter');
      else button.removeAttribute('aria-keyshortcuts');
      button.querySelector('small')!.textContent = current
        ? gameover
          ? 'Try again'
          : challenging
            ? 'Keep driving'
            : 'Keep wandering'
        : 'Start a fresh drive';
    }
  });
  $('intro-copy').innerHTML = challenging
    ? 'Easy drifting. A road worth holding onto.<br class="desktop-break"/> Hold your drift. Pass close. Keep it clean.'
    : 'A winding road. A little car. A moment for yourself.<br class="desktop-break"/> Let the hill do the work.';
  $('throttle-guide').textContent = challenging ? 'accelerate' : 'a little faster';
  $('pause-kicker').textContent = gameover
    ? 'ONE MORE ROAD?'
    : challenging
      ? 'YOUR RUN IS SAFE'
      : 'THERE’S NO RUSH';
  $('pause-title').textContent = gameover ? 'That was a good run.' : 'Take a little breather.';
  $('pause-copy').textContent = gameover
    ? `${challenge.overtakes} near misses · ${formatDistance(state.travelled, unitSystem)} driven. Try again, or take an Easy drive.`
    : challenging
      ? 'Longer drifts earn more. Near misses reward speed and a clean streak. Shoulder contact costs points. Steer back before recovery time runs out.'
      : 'The road will be right here.';
  $<HTMLButtonElement>('pause').disabled = gameover;
  $('challenge-hud').hidden = !challenging || !started || inGarage;
  $('open-scoreboard').hidden = !challenging || gameover || !onlineScores.enabled;
  $<HTMLButtonElement>('open-scoreboard-hud').disabled = !onlineScores.enabled;
  $('open-scoreboard-hud').querySelector('span')!.textContent = onlineScores.enabled
    ? 'pts ↗'
    : 'pts';
  $('open-scoreboard-hud').title = onlineScores.enabled ? 'Worldwide leaderboard' : 'Your score';
  $('run-results').hidden = !gameover || !runResult;
  $('run-leaderboard').hidden = !gameover || !runResult || !onlineScores.enabled;
  $('pause-card').classList.toggle('has-results', gameover && !!runResult);
  $('pause-card').classList.toggle(
    'has-leaderboard',
    gameover && !!runResult && onlineScores.enabled,
  );
  if (gameover && runResult) {
    const detailsOpen =
      $('run-results').querySelector<HTMLDetailsElement>('.result-details')?.open ??
      !matchMedia('(max-width: 760px), (pointer: coarse)').matches;
    $('run-results').innerHTML = resultsMarkup(runResult, unitSystem, true);
    $('run-results').querySelector<HTMLDetailsElement>('.result-details')!.open = detailsOpen;
    if (onlineScores.enabled) scoreboard.embed($('run-leaderboard'), runResult, unitSystem);
  } else scoreboard.clearEmbedded();
}

function syncPlayUI() {
  syncModeUI();
  carMenu.setOpen(quickMenus.current === 'car-menu');
  controls.setEnabled(
    started &&
      !paused &&
      !inGarage &&
      !dialog.open &&
      !quickMenus.active &&
      !scoreboard.open &&
      !replayView.open,
  );
  $('intro').hidden = started || replayView.open;
  $('drive-toolbar').hidden = !started || inGarage;
  const wasPauseVisible = !$('pause-card').hidden;
  $('pause-card').hidden =
    !started ||
    !paused ||
    inGarage ||
    dialog.open ||
    quickMenus.active ||
    scoreboard.open ||
    replayView.open;
  if (!wasPauseVisible && !$('pause-card').hidden) pauseFocus.focus();
  $('game-shell').classList.toggle('is-driving', started);
  $('game-shell').classList.toggle('is-paused', paused);
  $('pause').innerHTML = icon(paused ? 'play' : 'pause');
  $('pause').setAttribute('aria-label', paused ? 'Resume drive' : 'Pause drive');
}

function resetRun() {
  replayRecorder.reset();
  state = initialState();
  if (mode === 'challenge') state.offset = settings.roadWidth / 4;
  challenge = initialChallenge(settings, state);
  scoreRun = createScoreRun(settings);
  runResult = null;
  onlineScores.reset();
  controls.clear();
  scene?.resetMotion();
}

function start() {
  if (!scene || scoreboard.open || replayView.open) return;
  if (mode === 'challenge' && challenge.phase === 'gameover') resetRun();
  if (mode === 'challenge') onlineScores.begin(scoreRun);
  started = true;
  paused = false;
  controls.clear();
  syncPlayUI();
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
}
function restart() {
  if (replayView.open) return;
  resetRun();
  start();
}
function togglePause() {
  if (replayView.open) return;
  if (started) {
    if (mode === 'challenge' && challenge.phase === 'gameover') return;
    paused = !paused;
    controls.clear();
    syncPlayUI();
  }
}

document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((button) =>
  button.addEventListener('click', () => {
    if (!scene) return;
    const selected = button.dataset.mode as typeof mode;
    if (selected !== mode) {
      mode = selected;
      resetRun();
    }
    start();
    updateHUD();
  }),
);

// Welcome choices stay native one-click actions. Focus previews a choice; only
// activation changes the driving mode, so settings refreshes cannot reset it.
const welcomeOptions = [...$('intro').querySelectorAll<HTMLButtonElement>('[data-mode]')];
let welcomeChoice = welcomeOptions[0]!;
$('intro').querySelector('.mode-picker')!.setAttribute('aria-describedby', 'start-note');
function selectWelcome(button: HTMLButtonElement) {
  welcomeChoice = button;
  for (const option of welcomeOptions) option.dataset.selected = String(option === button);
}
selectWelcome(welcomeChoice);
for (const button of welcomeOptions) {
  button.addEventListener('focus', () => selectWelcome(button));
  button.addEventListener('keydown', (event) => {
    if (
      started ||
      inGarage ||
      dialog.open ||
      quickMenus.active ||
      scoreboard.open ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.isComposing
    )
      return;
    const direction = ['ArrowRight', 'ArrowDown'].includes(event.key)
      ? 1
      : ['ArrowLeft', 'ArrowUp'].includes(event.key)
        ? -1
        : 0;
    if (!direction) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.repeat) return;
    const next =
      (welcomeOptions.indexOf(button) + direction + welcomeOptions.length) % welcomeOptions.length;
    welcomeOptions[next]!.focus({ preventScroll: true });
  });
}

$('pause').addEventListener('click', togglePause);
$('restart').addEventListener('click', restart);
for (const id of ['open-scoreboard', 'open-scoreboard-hud'])
  $(id).addEventListener('click', () => {
    quickMenus.close(false);
    controls.clear();
    scoreboard.show(runResult, unitSystem);
  });
$('reload').addEventListener('click', () => location.reload());
$('open-settings').addEventListener('click', () => {
  quickMenus.close(false);
  controls.clear();
  dialog.showModal();
  syncPlayUI();
});
$('close-settings').addEventListener('click', () => dialog.close());
$<HTMLInputElement>('debug-hitboxes').addEventListener('change', (event) => {
  debugHitboxes = (event.target as HTMLInputElement).checked;
  updateHUD();
});
$<HTMLSelectElement>('units').addEventListener('change', (event) =>
  updateSettings({ units: normalizeUnits((event.target as HTMLSelectElement).value) }),
);
window.addEventListener('languagechange', () => {
  syncSettingsUI();
  garage.applySettings(settings);
  syncModeUI();
  updateHUD();
});
dialog.addEventListener('close', () => {
  controls.clear();
  syncPlayUI();
});
dialog.addEventListener('click', (event) => {
  if (event.target === dialog) {
    const rect = dialog.getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    )
      dialog.close();
  }
});
document.querySelectorAll<HTMLInputElement>('[data-setting]').forEach((input) =>
  input.addEventListener('input', () => {
    if (input.value === '') return;
    updateSettings({ [input.dataset.setting!]: Number(input.value) });
  }),
);
document
  .querySelectorAll<HTMLButtonElement>('[data-style]')
  .forEach((button) =>
    button.addEventListener('click', () =>
      updateSettings({ style: button.dataset.style as StyleId }),
    ),
  );
$('new-seed').addEventListener('click', () =>
  updateSettings({ seed: freshRouteSeed(settings.seed) }),
);
$('reset-settings').addEventListener('click', () => updateSettings(defaults));
$('export-settings').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(settings, null, 2) + '\n'], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'chillhill.settings.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  $('saved-note').textContent = 'Your world settings have been exported.';
});
window.addEventListener('keydown', (event) => {
  const enter = event.key === 'Enter';
  if (
    replayView.open ||
    inGarage ||
    dialog.open ||
    scoreboard.open ||
    quickMenus.active ||
    (event.target instanceof HTMLElement &&
      (event.target.closest(
        '#run-leaderboard, input, select, textarea, [contenteditable]:not([contenteditable="false"])',
      ) ||
        (enter && event.target.closest('button, a, summary, [role="button"]'))))
  )
    return;
  if (event.repeat) return;
  if (
    event.code === 'KeyH' &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.isComposing
  ) {
    event.preventDefault();
    debugHitboxes = !debugHitboxes;
    $<HTMLInputElement>('debug-hitboxes').checked = debugHitboxes;
    updateHUD();
  }
  if (
    enter &&
    !event.isComposing &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    (!started || paused)
  ) {
    event.preventDefault();
    if (!started) welcomeChoice.click();
    else start();
  }
  if (event.code === 'Escape' || event.code === 'KeyP') {
    event.preventDefault();
    togglePause();
  }
  if (event.code === 'KeyR' && started) restart();
});
function pauseAway() {
  if (replayView.open) return;
  if (started) {
    paused = true;
    controls.clear();
    syncPlayUI();
  }
}
window.addEventListener('blur', pauseAway);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseAway();
});

const routePath = document.querySelector<SVGPathElement>('.route-drawing path')!;
function updateHUD() {
  const speed = Math.round(state.speed * 3.6);
  $('speed').textContent = String(Math.round(speedValue(state.speed * 3.6, unitSystem))).padStart(
    2,
    '0',
  );
  $('distance').textContent = distanceValue(state.travelled, unitSystem).toFixed(2);
  $('speed-fill').style.width = `${(speed / settings.maxSpeed) * 100}%`;
  $('world-clock-label').textContent =
    `${worldOptions.season[settings.season]} · ${worldOptions.timeOfDay[settings.timeOfDay]}`;
  $('lives').textContent = String(challenge.lives);
  // Only announce real score changes, not every HUD frame.
  const score = String(challenge.overtakes);
  if ($('overtakes').textContent !== score) $('overtakes').textContent = score;
  const scoreText = formatScore(challenge.score.points);
  if ($('score').textContent !== scoreText) $('score').textContent = scoreText;
  $('score-streak').textContent = `×${streakMultiplier(challenge.score.streak)}`;
  $('score-category').textContent = scoreRun.category;
  $('score-category').title =
    scoreRun.category === 'custom'
      ? 'Custom setup or mid-run changes. All driving setups share the leaderboard.'
      : 'Standard driving difficulty';
  const incident =
    mode === 'challenge' &&
    started &&
    !paused &&
    !inGarage &&
    !quickMenus.active &&
    !dialog.open &&
    !scoreboard.open;
  const feedback = challenge.score;
  $('score-feedback').hidden =
    !incident || challenge.phase !== 'racing' || feedback.noticeRemaining <= 0;
  const feedbackCopy =
    feedback.notice === 'near-miss'
      ? `+${formatScore(feedback.noticePoints)} · Near miss`
      : feedback.notice === 'shoulder'
        ? `${feedback.noticePoints < 0 ? `−${formatScore(-feedback.noticePoints)} · ` : ''}Shoulder · streak reset`
        : feedback.notice === 'drift'
          ? `+${formatScore(feedback.noticePoints)} · ${feedback.driftTime > 0 ? `Drift ×${driftMultiplier(feedback.driftTime).toFixed(1)}` : 'Drift complete'}`
          : '';
  if ($('score-feedback').textContent !== feedbackCopy)
    $('score-feedback').textContent = feedbackCopy;
  const notice = !incident
    ? ''
    : challenge.phase === 'falling'
      ? `Off the road · ${challenge.lives} ${challenge.lives === 1 ? 'life' : 'lives'} left`
      : challenge.phase === 'crashed'
        ? `Traffic collision · ${challenge.lives} ${challenge.lives === 1 ? 'life' : 'lives'} left`
        : challenge.graceRemaining > 0 && challenge.lastIncident
          ? 'Back on the road · take a breath, then accelerate'
          : '';
  if ($('incident-copy').textContent !== notice) $('incident-copy').textContent = notice;
  $('challenge-message').hidden = !notice;
  $('incident-cliff-sign').hidden = challenge.phase !== 'falling';
  $('incident-crash-sign').hidden = challenge.phase !== 'crashed';
  $('incident-road-sign').hidden = challenge.phase !== 'racing';
  $('collision-legend').hidden =
    !debugHitboxes || inGarage || dialog.open || !!quickMenus.active || scoreboard.open;
  const recovering =
    incident &&
    challenge.phase === 'racing' &&
    challenge.offRoad.active &&
    challenge.offRoad.excursion > 0;
  const restoring =
    incident &&
    !notice &&
    challenge.phase === 'racing' &&
    !recovering &&
    challenge.offRoad.exposure > 0;
  $('road-recovery-warning').hidden = !recovering && !restoring;
  if (recovering || restoring) {
    const cooldown = Math.max(
      0,
      challengeDefaults.offRoadCooldownSeconds - challenge.offRoad.rejoinTime,
    );
    $('road-recovery-warning').dataset.state = recovering
      ? 'offroad'
      : cooldown > 0
        ? 'cooldown'
        : 'refilling';
    $('recovery-cliff-sign').hidden = !recovering;
    $('recovery-road-sign').hidden = recovering;
    const instruction = recovering
      ? challenge.offRoad.side > 0
        ? 'Steer left back to the road'
        : 'Steer right back to the road'
      : cooldown > 0
        ? 'Stay on the road'
        : 'Recovery time refilling';
    if ($('road-recovery-instruction').textContent !== instruction)
      $('road-recovery-instruction').textContent = instruction;
    const remaining = Math.max(0.1, Math.ceil(challenge.offRoad.remaining * 10) / 10).toFixed(1);
    const reserve = ((1 - challenge.offRoad.exposure) * challengeDefaults.offRoadSeconds).toFixed(
      1,
    );
    $('road-recovery-time').textContent = recovering
      ? `${remaining}s to recover`
      : cooldown > 0
        ? `Refill in ${(Math.ceil(cooldown * 10) / 10).toFixed(1)}s · ${reserve}s saved`
        : `${reserve} / ${challengeDefaults.offRoadSeconds.toFixed(1)}s ready`;
    const budget = Math.max(0, Math.round((1 - challenge.offRoad.exposure) * 100));
    $('road-recovery-fill').style.width = `${budget}%`;
    $('road-recovery-meter').setAttribute('aria-valuenow', String(budget));
    $('road-recovery-meter').setAttribute(
      'aria-valuetext',
      recovering
        ? `${remaining} seconds remaining at this distance from the road`
        : `${reserve} seconds saved; ${cooldown > 0 ? `refill begins after ${Math.ceil(cooldown)} more seconds on the road` : 'refilling'}`,
    );
  }
  $('speed-status').textContent =
    paused || dialog.open || quickMenus.active || scoreboard.open
      ? 'TAKING A BREATHER'
      : mode === 'challenge' && challenge.phase === 'falling'
        ? 'OFF THE ROAD'
        : mode === 'challenge' && challenge.phase === 'crashed'
          ? 'TRAFFIC CONTACT'
          : recovering
            ? 'RETURN TO ROAD'
            : controls.read().brake
              ? speed === 0
                ? 'STILL IS GOOD, TOO'
                : 'EASING OFF'
              : speed > settings.cruiseSpeed + 3
                ? 'FEEL THE BREEZE'
                : mode === 'challenge'
                  ? speed === 0
                    ? 'ACCELERATE TO GO'
                    : 'KEEP IT CLEAN'
                  : 'NICE & EASY';
  const samples = Array.from({ length: 21 }, (_, i) => roadAt(state.distance + i * 12, settings).x);
  const min = Math.min(...samples),
    max = Math.max(...samples);
  const center = (min + max) / 2,
    scale = 48 / Math.max(50, max - min);
  const points = samples.map((x, i) => `${36 + (x - center) * scale},${68 - i * 3}`);
  routePath.setAttribute('d', `M${points.join(' L')}`);
  $('route-dot').setAttribute('cx', String(36 + (samples[0] - center) * scale));
  $('route-dot').setAttribute('cy', '68');
}

function frame(time: number) {
  const elapsed = Math.max(0, (time - lastTime) / 1000);
  const dt = Math.min(elapsed, 0.05);
  lastTime = time;
  if (replayView.open && scene) {
    replayView.render(scene, elapsed);
    ambience.update(0, true, settings);
    frameId = requestAnimationFrame(frame);
    return;
  }
  const active =
    started &&
    !paused &&
    !dialog.open &&
    !scoreboard.open &&
    !quickMenus.active &&
    !inGarage &&
    !document.hidden &&
    !(mode === 'challenge' && challenge.phase === 'gameover');
  const input = controls.read(mode, state.speed);
  if (active) {
    replayRecorder.capture(0, settings, state, input, mode === 'challenge' ? challenge : undefined);
    const worldPatch = stepWorldClock(worldClock, settings, elapsed);
    if (Object.keys(worldPatch).length) {
      // Transient world time is not a new saved preference or a manual timer reset.
      settings = normalizeSettings(worldPatch, settings);
      syncSettingsUI();
      scene?.applySettings(settings, true);
    }
    // Fixed substeps keep steering and braking consistent across display rates.
    let remaining = dt;
    while (remaining > 0.00001) {
      const step = Math.min(remaining, 1 / 120);
      if (mode === 'challenge') {
        const previousPhase = challenge.phase;
        stepChallenge(challenge, state, input, settings, step);
        replayRecorder.capture(
          step,
          settings,
          state,
          input,
          challenge,
          challenge.phase !== previousPhase,
        );
        if (challenge.phase !== previousPhase) {
          if (challenge.phase === 'racing') {
            controls.clear();
            scene?.resetMotion();
          }
          if (challenge.phase === 'gameover') {
            paused = true;
            controls.clear();
            const record = completedScore(scoreRun, challenge, state.travelled);
            if (record && !runResult) {
              runResult = scoreStore.save(record);
              void onlineScores.complete(record);
            }
          }
          syncPlayUI();
          updateHUD();
          // The input snapshot above belongs to the old life. Do not feed a
          // held pedal into a freshly stationary respawn in this same frame.
          if (challenge.phase === 'racing' || challenge.phase === 'gameover') break;
        }
      } else {
        const road = roadAt(state.distance, settings);
        stepDriving(state, input, settings, step, road.curvature, road.metric);
        replayRecorder.capture(step, settings, state, input);
      }
      remaining -= step;
    }
  }
  if (inGarage) garage.render(document.hidden ? 0 : dt);
  else
    scene?.render(
      state,
      dt,
      started,
      input.brake,
      active,
      active && input.frontView,
      mode === 'challenge' ? challenge : undefined,
      debugHitboxes,
    );
  ambience.update(
    state.speed,
    inGarage ||
      paused ||
      dialog.open ||
      quickMenus.active ||
      scoreboard.open ||
      document.hidden ||
      !started,
    settings,
  );
  uiElapsed += dt;
  if (uiElapsed > 0.08) {
    updateHUD();
    uiElapsed = 0;
  }
  frameId = requestAnimationFrame(frame);
}

function ensureDrivingScene() {
  if (scene) {
    scene.applySettings(settings);
    return;
  }
  try {
    scene = new GameScene($('scene'), settings);
    scene.render(
      state,
      0,
      started,
      false,
      false,
      false,
      mode === 'challenge' ? challenge : undefined,
      debugHitboxes,
    );
  } catch (error) {
    console.error('Unable to start the landscape:', error);
    $('canvas-error').hidden = false;
    $('intro').hidden = true;
    document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((button) => {
      button.disabled = true;
    });
  }
}

function syncLocation() {
  if (replayView.open) replayView.close();
  if (scoreboard.open) scoreboard.dialog.close();
  inGarage = location.hash === '#garage';
  quickMenus.close(false);
  document.body.classList.toggle('in-garage', inGarage);
  $('game-shell').hidden = inGarage;
  $('garage-title').hidden = !inGarage;
  $('world-label').hidden = inGarage;
  $('back-drive').hidden = !inGarage;
  $('open-car-menu').hidden = inGarage;
  $('open-world-menu').hidden = inGarage;
  if (inGarage) {
    if (dialog.open) dialog.close();
    garage.open();
  } else {
    garage.close();
    ensureDrivingScene();
  }
  syncPlayUI();
  if (!started && !inGarage && scene && !dialog.open && !quickMenus.active && !scoreboard.open)
    welcomeChoice.focus({ preventScroll: true });
}
window.addEventListener('hashchange', syncLocation);
syncSettingsUI();
const countryLookup = new AbortController();
if (import.meta.env.PROD)
  void requestUnitCountry().then((country) => {
    if (countryLookup.signal.aborted) return;
    configureUnitCountry(country);
    // Display-only refresh; never mutate handling, the route, score or saved choice.
    syncSettingsUI();
    garage.applySettings(settings);
    syncModeUI();
    updateHUD();
  });
syncLocation();
frameId = requestAnimationFrame(frame);

// Read-only telemetry for local development and browser verification.
if (import.meta.env.DEV)
  Object.defineProperty(window, '__chillhill', {
    configurable: true,
    get: () => ({
      state: { ...state },
      unitSystem,
      mode,
      challenge:
        mode === 'challenge'
          ? {
              ...challenge,
              offRoad: { ...challenge.offRoad },
              score: { ...challenge.score },
              traffic: challenge.traffic.map((car) => ({ ...car })),
            }
          : null,
      worldClock: worldClockTelemetry(worldClock, settings),
      settings: { ...settings, paint: { ...settings.paint } },
      view: inGarage ? 'garage' : 'drive',
      garage: garage.telemetry,
      driveReady: !!scene,
      paintColor: scene?.paintColor,
      started,
      paused,
      replay: { ...replayView.telemetry, available: replayRecorder.available },
      quickMenu: quickMenus.current,
      scoreRun: structuredClone(scoreRun),
      runResult: runResult ? structuredClone(runResult) : null,
      scoreboardOpen: scoreboard.open,
      cameraMode: scene?.cameraMode,
      drawCalls: scene?.renderer.info.render.calls,
      triangles: scene?.renderer.info.render.triangles,
      smokeParticles: scene?.smokeCount,
      environment: scene?.environment,
      collisionDebug: scene?.collisionDebug.telemetry,
      music: music.telemetry,
      carPreviews: carMenu.telemetry,
    }),
  });
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    countryLookup.abort();
    cancelAnimationFrame(frameId);
    clearTimeout(rebuildTimer);
    controls.dispose();
    replayView.dispose();
    pauseFocus.dispose();
    quickMenus.dispose();
    scoreboard.dispose();
    onlineScores.dispose();
    carMenu.dispose();
    window.removeEventListener('hashchange', syncLocation);
    garage.dispose();
    composer.dispose();
    music.dispose();
    ambience.dispose();
    scene?.dispose();
  });
