import './style.css';
import '@fontsource-variable/dm-sans';
import '@fontsource/dm-serif-display/latin-400.css';
import '@fontsource/dm-serif-display/latin-400-italic.css';
import {
  defaults,
  loadSettings,
  normalizeSettings,
  saveSettings,
  styles,
  type Settings,
  type StyleId,
} from './config';
import { GameScene } from './game/scene';
import { initialState, roadOffsetLimit, stepDriving } from './game/driving';
import { roadAt } from './game/route';
import { Controls } from './game/input';
import { Ambience } from './game/audio';
import { cars, type CarId } from './config/cars';
import { Garage } from './garage';
import { WorldComposer } from './world-composer';
import { worldOptions } from './config/world';
import { QuickMenus } from './quick-menus';

const carProfile = (id: CarId) => {
  const roof =
    id === 'wagon'
      ? 'M8 30 13 22 27 21 34 10 75 10 83 23 88 26 88 36H8Z'
      : id === 'astra-sedan'
        ? 'M8 31 11 25 28 22 40 12 61 12 75 24 88 27 89 36H8Z'
        : 'M8 31 11 25 28 22 40 12 65 12 85 26 87 36H8Z';
  return `<svg class="car-profile" viewBox="0 0 96 48" aria-hidden="true"><path d="${roof}" fill="currentColor"/><path d="m32 23 10-8h18l12 9Z" fill="var(--car-window)"/><path d="M51 14v10" stroke="currentColor" stroke-width="2"/><path d="M10 32h76" stroke="var(--car-window)" stroke-width="1.5"/><circle cx="25" cy="35" r="7" fill="var(--car-tire)"/><circle cx="73" cy="35" r="7" fill="var(--car-tire)"/><circle cx="25" cy="35" r="3" fill="var(--car-window)"/><circle cx="73" cy="35" r="3" fill="var(--car-window)"/></svg>`;
};

const icons = {
  hill: '<path d="m2 19 7-12 5 8 4-6 6 10M6 19h13"/><circle cx="19" cy="4" r="2"/>',
  car: '<path d="m5 9 2-5h10l2 5M3 10l2-1h14l2 1v8H3v-8Zm2 8v2m14-2v2M6 13h2m8 0h2M9 16h6"/>',
  garage: '<path d="M3 21V8l9-5 9 5v13M7 21V11h10v10M7 15h10M7 18h10"/>',
  tune: '<path d="M4 7h7m4 0h5M4 17h3m4 0h9"/><circle cx="13" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  sound: '<path d="m11 5-6 4H2v6h3l6 4V5Zm4 3a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  play: '<path d="m8 5 11 7-11 7V5Z"/>',
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
const slider = (
  key: keyof Settings,
  label: string,
  min: number,
  max: number,
  step: number,
  suffix = '',
) =>
  `<label class="slider-label" for="${key}"><span>${label}</span><output id="${key}-value"></output></label><input id="${key}" data-setting="${key}" data-suffix="${suffix}" type="range" min="${min}" max="${max}" step="${step}" />`;

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <nav class="site-header" aria-label="Main navigation">
    <div class="nav-identity"><a class="brand" href="#drive" aria-label="chillhill home"><span class="brand-mark">${icon('hill')}</span><span class="brand-name">chillhill</span></a><span class="world-label" id="world-label"><span class="eyebrow" id="place"></span></span><h1 class="nav-title" id="garage-title" hidden>The garage<span>.</span></h1></div>
    <div class="header-actions">
      <a class="garage-nav back-drive" id="back-drive" href="#drive" aria-label="Back to the hillside" title="Back to the hillside" hidden>${icon('arrow')}<span>Back to the hillside</span></a>
      <div class="drive-toolbar" id="drive-toolbar" role="group" aria-label="Drive controls" hidden><button class="icon-button" id="pause" aria-label="Pause drive" title="Pause · Esc">${icon('pause')}</button><button class="icon-button" id="restart" aria-label="Restart drive" title="Back to the top · R">${icon('reset')}</button></div>
      <button class="icon-button" id="open-car-menu" data-quick-menu="car-menu" aria-label="Choose your car" aria-haspopup="dialog" aria-controls="car-menu" aria-expanded="false" title="Choose your car">${icon('car')}</button>
      <button class="icon-button" id="open-world-menu" data-quick-menu="world-menu" aria-label="Landscape & weather" aria-haspopup="dialog" aria-controls="world-menu" aria-expanded="false" title="Landscape & weather"><span id="weather-icon">${icon('sun')}</span></button>
      <button class="icon-button sound-button" id="sound" aria-label="Turn on ambience" aria-pressed="false" title="World ambience">${icon('sound')}<span class="sound-slash"></span></button>
      <button class="icon-button" id="open-settings" aria-label="Advanced settings" aria-haspopup="dialog" aria-controls="settings-dialog" title="Advanced settings">${icon('tune')}</button>
    </div>
  </nav>
  <main class="game-shell" id="game-shell">
    <div id="scene"></div>
    <section class="intro" id="intro">
      <div class="eyebrow intro-kicker"><span></span> LESS HURRY, MORE HORIZON</div>
      <h1>Take the<br/><em>scenic route.</em></h1>
      <p>A winding road. A little car. A moment for yourself.<br class="desktop-break"/> Let the hill do the work.</p>
      <button class="start-button" id="start">Let’s drift ${icon('arrow')}</button>
      <span class="start-note">or press <kbd>enter</kbd> to take a breath & go</span>
    </section>
    <section class="pause-card" id="pause-card" hidden><span class="eyebrow" id="pause-kicker">THERE’S NO RUSH</span><h2 id="pause-title">Take a little breather.</h2><p id="pause-copy">The road will be right here.</p><button class="start-button" id="resume">Keep wandering ${icon('arrow')}</button></section>
    <div class="bottom-hud">
      <div class="route-card"><div class="route-drawing"><svg viewBox="0 0 72 76" aria-label="The next stretch of road"><path d="M36 68L36 8" fill="none" stroke="currentColor" stroke-opacity=".25" stroke-width="3" stroke-linecap="round"/><circle id="route-dot" cx="36" cy="68" r="4" fill="currentColor"/></svg></div><div><span class="eyebrow">THE ROAD AHEAD</span><span class="route-distance"><span id="distance">0.00</span> <small>km wandered</small></span><span class="route-note" id="route-note">Just you and the hillside.</span></div></div>
      <div class="speed-card"><span class="speed-number" id="speed">00</span><div><span class="speed-unit">KM/H</span><span class="speed-status" id="speed-status">NICE & EASY</span></div><div class="speed-track"><span id="speed-fill"></span></div></div>
    </div>
    <div class="touch-controls"><span class="thumb-hint">ONE THUMB. ALL YOU NEED.</span><div id="thumb-pad" role="group" aria-label="Touch driving pad: slide left or right to steer, up to accelerate, and hold down to brake"><span class="pad-up">GO ↑</span><span class="pad-left">←</span><span class="pad-right">→</span><span class="pad-down">BRAKE ↓</span><span class="pad-puck"></span></div></div>
    <aside class="driving-guide" aria-label="Driving controls"><div class="keyboard-guide"><span><kbd>A</kbd><kbd>D</kbd> steer</span><span><kbd>W</kbd> a little faster</span><span><kbd>S</kbd> slow down & stop</span><span><kbd>V</kbd> hold for front view</span><span class="arrows-note">arrow keys work, too</span></div></aside>
    <div class="canvas-error" id="canvas-error" hidden><h2>The view couldn’t load.</h2><p>This game needs a browser with WebGL 2 and graphics acceleration enabled. Try an updated Chrome, Safari, or Firefox.</p><button class="start-button" id="reload">Try again</button></div>
  </main>
  <section class="quick-panel" id="car-menu" role="dialog" aria-modal="false" aria-labelledby="car-menu-title" hidden>
    <div class="quick-heading"><div><span class="eyebrow">A CHANGE OF PACE</span><h2 id="car-menu-title">Your ride.</h2></div><button class="icon-button" id="close-car-menu" data-close-quick aria-label="Close car selection">${icon('close')}</button></div>
    <div class="quick-scroll">
    <fieldset class="car-picker"><legend>CHOOSE YOUR RIDE</legend>${Object.entries(cars)
      .map(
        ([key, car]) =>
          `<button class="car-option" data-car="${key}" aria-pressed="false">${carProfile(key as CarId)}<span class="car-copy"><span class="car-name">${car.name}</span><span class="car-variant">${car.variant}</span></span><span class="car-check" aria-hidden="true">✓</span></button>`,
      )
      .join('')}<p class="field-note" id="car-spec"></p></fieldset>
    </div>
    <a class="garage-link" id="open-garage" href="#garage">${icon('garage')}<span>Visit the garage<small>Paint, details & a closer look</small></span>${icon('arrow')}</a>
  </section>
  <section class="quick-panel" id="world-menu" role="dialog" aria-modal="false" aria-labelledby="world-menu-title" hidden>
    <div class="quick-heading"><div><span class="eyebrow">A DIFFERENT FEELING</span><h2 id="world-menu-title">The scenery.</h2><p id="weather">Clear · Daylight</p></div><button class="icon-button" id="close-world-menu" data-close-quick aria-label="Close scenery selection">${icon('close')}</button></div>
    <div class="quick-scroll" id="world-options"></div>
  </section>
  <dialog id="settings-dialog" aria-labelledby="settings-title"><div class="panel-header"><div><span class="eyebrow">THE FINER DETAILS</span><h2 id="settings-title">Advanced settings.</h2></div><button class="icon-button" id="close-settings" aria-label="Close settings">${icon('close')}</button></div><div class="panel-scroll">
    <p class="panel-intro">Fine-tune the look, the road, and the way you drift.</p>
    <fieldset class="style-picker"><legend>THE ART PALETTE</legend>${Object.entries(styles)
      .map(
        ([key, style]) =>
          `<button class="style-option" data-style="${key}" aria-pressed="false"><span class="style-preview ${key}"><i></i><b></b></span><span>${style.name}</span><span class="style-check">✓</span></button>`,
      )
      .join('')}</fieldset>
    <fieldset><legend>SOFTEN THE EDGES</legend>${slider('roundness', 'Shape softness', 0, 1, 0.05)}<p class="field-note">From angular low poly to soft, rounded shapes. Changes the car, trees, rocks, mountains, and terrain in every atmosphere.</p></fieldset>
    <fieldset><legend>SHAPE THE HILLSIDE</legend>${slider('curves', 'Road curves', 0.2, 1.7, 0.05)}${slider('roadWidth', 'Road width', 7, 16, 0.5, ' m')}${slider('grade', 'Downhill slope', 0.03, 0.16, 0.01)}${slider('terrainHeight', 'Mountain height', 0.25, 2, 0.05)}${slider('treeDensity', 'Trees', 0, 2, 0.1)}${slider('fog', 'Misty distance', 0, 1, 0.05)}<div class="seed-row"><label for="seed">Landscape seed</label><input id="seed" type="number" data-setting="seed" min="1" max="99999" step="1"/><button class="icon-button" id="new-seed" aria-label="Generate another landscape" title="Another landscape">${icon('reset')}</button></div></fieldset>
    <fieldset><legend>FIND YOUR FLOW</legend>${slider('cruiseSpeed', 'Coasting speed', 15, 55, 1, ' km/h')}${slider('maxSpeed', 'Top speed', 40, 110, 1, ' km/h')}${slider('drift', 'Slide & drift', 0, 1, 0.05)}${slider('smoke', 'Tire smoke', 0, 1, 0.05)}<p class="field-note">Steer into a smooth rear-end slide. Release or countersteer to let the tail settle; you keep rolling forward. The brake still holds you completely still.</p></fieldset>
    <fieldset><legend>KEEP IT SMOOTH</legend>${slider('pixelRatio', 'Render quality', 0.75, 2, 0.25)}<p class="field-note">Lower this for a smoother drive on smaller devices.</p></fieldset>
    <div class="panel-bottom"><button class="text-button" id="reset-settings">Restore defaults</button><button class="text-button" id="export-settings">Export settings ↗</button></div><p class="saved-note" id="saved-note" role="status">Changes are saved on this device.</p>
  </div></dialog>
`;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
let settings = loadSettings();
let state = initialState();
const controls = new Controls();
const ambience = new Ambience();
const dialog = $<HTMLDialogElement>('settings-dialog');
let started = false;
let paused = false;
let scene: GameScene | undefined;
let inGarage = false;
const quickMenus = new QuickMenus(syncPlayUI);
const garage = new Garage(settings, updateSettings);
const composer = new WorldComposer(settings, updateSettings);
let frameId = 0;
let rebuildTimer = 0;
let lastTime = performance.now();
let uiElapsed = 0;

function syncSettingsUI() {
  composer.sync(settings);
  document.body.classList.toggle('is-night', settings.timeOfDay === 'night');
  document.querySelectorAll<HTMLInputElement>('[data-setting]').forEach((input) => {
    const key = input.dataset.setting as keyof Settings;
    input.value = String(settings[key]);
    const output = document.getElementById(`${key}-value`);
    if (output)
      output.textContent =
        key === 'grade'
          ? `${Math.round(settings.grade * 100)}%`
          : key === 'fog' || key === 'drift' || key === 'roundness' || key === 'smoke'
            ? `${Math.round(Number(settings[key]) * 100)}%`
            : `${settings[key]}${input.dataset.suffix || '×'}`;
    if (input.type === 'range')
      input.style.setProperty(
        '--range-progress',
        `${((Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min))) * 100}%`,
      );
  });
  document
    .querySelectorAll<HTMLButtonElement>('[data-car]')
    .forEach((button) =>
      button.setAttribute('aria-pressed', String(button.dataset.car === settings.car)),
    );
  const selectedCar = cars[settings.car];
  $('open-car-menu').title = `Choose your car · ${selectedCar.name} ${selectedCar.variant}`;
  $('open-car-menu').setAttribute('aria-label', $('open-car-menu').title);
  $('car-spec').textContent =
    `${selectedCar.length.toFixed(3)} m long · ${selectedCar.wheelbase.toFixed(3)} m wheelbase. Same easygoing drift. Your journey stays with you.`;
  document
    .querySelectorAll<HTMLButtonElement>('[data-style]')
    .forEach((button) =>
      button.setAttribute('aria-pressed', String(button.dataset.style === settings.style)),
    );
  $('place').textContent =
    settings.landscape === 'coast' ? 'THE SUNWASHED COAST' : styles[settings.style].place;
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
  $('route-note').textContent =
    settings.landscape === 'coast'
      ? 'Salt in the air. A little more horizon.'
      : styles[settings.style].caption;
}

function updateSettings(patch: Partial<Settings>) {
  settings = normalizeSettings(patch, settings);
  saveSettings(settings);
  syncSettingsUI();
  garage.applySettings(settings);
  // Apply world changes together so dragging a slider doesn't rebuild every frame.
  clearTimeout(rebuildTimer);
  rebuildTimer = window.setTimeout(() => {
    if (!inGarage) scene?.applySettings(settings);
  }, 120);
  const edge = roadOffsetLimit(settings.roadWidth, state.slide, settings.car);
  state.offset = Math.max(-edge, Math.min(edge, state.offset));
  state.speed = Math.min(state.speed, settings.maxSpeed / 3.6);
}

function syncPlayUI() {
  controls.setEnabled(!inGarage && !dialog.open && !quickMenus.active);
  $('intro').hidden = started;
  $('drive-toolbar').hidden = !started || inGarage;
  $('pause-card').hidden = !started || !paused || dialog.open || quickMenus.active;
  $('game-shell').classList.toggle('is-driving', started);
  $('game-shell').classList.toggle('is-paused', paused);
  $('pause').innerHTML = icon(paused ? 'play' : 'pause');
  $('pause').setAttribute('aria-label', paused ? 'Resume drive' : 'Pause drive');
}

function start() {
  if (!scene) return;
  started = true;
  paused = false;
  controls.clear();
  syncPlayUI();
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
}
function restart() {
  state = initialState();
  start();
}
function togglePause() {
  if (started) {
    paused = !paused;
    controls.clear();
    syncPlayUI();
  }
}

$('start').addEventListener('click', start);
$('resume').addEventListener('click', () => {
  paused = false;
  syncPlayUI();
});
$('pause').addEventListener('click', togglePause);
$('restart').addEventListener('click', restart);
$('reload').addEventListener('click', () => location.reload());
$('open-settings').addEventListener('click', () => {
  quickMenus.close(false);
  controls.clear();
  dialog.showModal();
  syncPlayUI();
});
$('close-settings').addEventListener('click', () => dialog.close());
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
  updateSettings({ seed: Math.floor(Math.random() * 99999) + 1 }),
);
document
  .querySelectorAll<HTMLButtonElement>('[data-car]')
  .forEach((button) =>
    button.addEventListener('click', () => updateSettings({ car: button.dataset.car as CarId })),
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
$('sound').addEventListener('click', async () => {
  try {
    const enabled = await ambience.toggle();
    $('sound').setAttribute('aria-pressed', String(enabled));
    $('sound').setAttribute('aria-label', enabled ? 'Turn off ambience' : 'Turn on ambience');
  } catch {
    $('sound').setAttribute('aria-label', 'Ambience unavailable in this browser');
  }
});
window.addEventListener('keydown', (event) => {
  if (
    inGarage ||
    dialog.open ||
    quickMenus.active ||
    (event.target instanceof HTMLElement && event.target.closest('input, select, textarea'))
  )
    return;
  if (event.repeat) return;
  if (event.code === 'Enter' && !started) {
    event.preventDefault();
    start();
  }
  if (event.code === 'Escape' || event.code === 'KeyP') {
    event.preventDefault();
    togglePause();
  }
  if (event.code === 'KeyR' && started) restart();
});
function pauseAway() {
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
  $('speed').textContent = String(speed).padStart(2, '0');
  $('distance').textContent = (state.travelled / 1000).toFixed(2);
  $('speed-fill').style.width = `${(speed / settings.maxSpeed) * 100}%`;
  $('speed-status').textContent =
    paused || dialog.open || quickMenus.active
      ? 'TAKING A BREATHER'
      : controls.read().brake
        ? speed === 0
          ? 'STILL IS GOOD, TOO'
          : 'EASING OFF'
        : speed > settings.cruiseSpeed + 3
          ? 'FEEL THE BREEZE'
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
  const dt = Math.min((time - lastTime) / 1000, 0.05);
  lastTime = time;
  const active = started && !paused && !dialog.open && !quickMenus.active && !inGarage;
  const input = controls.read();
  if (active) {
    // Fixed substeps keep steering and braking consistent across display rates.
    let remaining = dt;
    while (remaining > 0.00001) {
      const step = Math.min(remaining, 1 / 120);
      const road = roadAt(state.distance, settings);
      stepDriving(state, input, settings, step, road.curvature, road.metric);
      remaining -= step;
    }
  }
  if (inGarage) garage.render(document.hidden ? 0 : dt);
  else scene?.render(state, dt, started, input.brake, active, active && input.frontView);
  ambience.update(
    state.speed,
    inGarage || paused || dialog.open || quickMenus.active || document.hidden || !started,
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
    scene.render(state, 0, started, false, false);
  } catch (error) {
    console.error('Unable to start the landscape:', error);
    $('canvas-error').hidden = false;
    $('intro').hidden = true;
    $<HTMLButtonElement>('start').disabled = true;
  }
}

function syncLocation() {
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
}
window.addEventListener('hashchange', syncLocation);
syncSettingsUI();
syncLocation();
frameId = requestAnimationFrame(frame);

// Read-only telemetry for local development and browser verification.
if (import.meta.env.DEV)
  Object.defineProperty(window, '__chillhill', {
    configurable: true,
    get: () => ({
      state: { ...state },
      settings: { ...settings, paint: { ...settings.paint } },
      view: inGarage ? 'garage' : 'drive',
      garage: garage.telemetry,
      driveReady: !!scene,
      paintColor: scene?.paintColor,
      started,
      paused,
      quickMenu: quickMenus.current,
      cameraMode: scene?.cameraMode,
      drawCalls: scene?.renderer.info.render.calls,
      triangles: scene?.renderer.info.render.triangles,
      smokeParticles: scene?.smokeCount,
      environment: scene?.environment,
    }),
  });
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    cancelAnimationFrame(frameId);
    clearTimeout(rebuildTimer);
    controls.dispose();
    quickMenus.dispose();
    window.removeEventListener('hashchange', syncLocation);
    garage.dispose();
    composer.dispose();
    ambience.dispose();
    scene?.dispose();
  });
