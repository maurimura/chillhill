import './world-composer.css';
import { defaults, normalizeSettings, type Settings } from './config';
import recipes from './config/scenes.json';
import { worldOptions, type WorldChoice } from './config/world';
import { readStored, storageKeys } from './config/storage';
import {
  readScene,
  sceneKeys,
  sceneName,
  sceneSnapshot,
  serializeScene,
  type SceneRecipe,
} from './config/scenes';

const select = (key: WorldChoice, title: string) =>
  `<label class="composer-field" for="world-${key}"><span>${title}</span><select id="world-${key}" data-world-setting="${key}">${Object.entries(
    worldOptions[key],
  )
    .map(([value, name]) => `<option value="${value}">${name}</option>`)
    .join('')}</select></label>`;
const range = (key: 'weatherIntensity' | 'wind', title: string) =>
  `<label class="slider-label" for="world-${key}"><span>${title}</span><output id="world-${key}-value"></output></label><input id="world-${key}" data-world-setting="${key}" type="range" min="0" max="1" step="0.05"/>`;
const cycleToggle = (key: 'autoTime' | 'autoSeasons' | 'autoWeather', title: string) =>
  `<label class="composer-field" for="world-${key}"><span>${title}</span><select id="world-${key}" data-world-setting="${key}"><option value="true">Let it change</option><option value="false">Keep it here</option></select></label>`;
const cycleDuration = (
  key: 'dayDuration' | 'seasonDays' | 'weatherDuration',
  title: string,
  min: number,
  max: number,
  step: number,
  unit = 1,
) =>
  `<label class="composer-field" for="world-${key}"><span>${title}</span><input id="world-${key}" data-world-setting="${key}" data-world-unit="${unit}" type="number" min="${min}" max="${max}" step="${step}" inputmode="decimal"/></label>`;

export class WorldComposer {
  private root = document.createElement('div');
  private quickRoot = document.createElement('div');
  private settings: Settings;
  private saved: SceneRecipe[] = [];
  private abort = new AbortController();

  constructor(
    settings: Settings,
    private onChange: (patch: Partial<Settings>) => void,
  ) {
    this.settings = settings;
    this.root.className = 'world-composer';
    this.quickRoot.className = 'world-composer';
    this.quickRoot.innerHTML = `
      <fieldset class="scene-picker"><legend>START SOMEWHERE <span id="scene-mix">Your mix</span></legend>${Object.entries(
        recipes,
      )
        .map(
          ([id, recipe]) =>
            `<button class="scene-recipe" data-scene="${id}" aria-pressed="false"><span class="recipe-preview ${recipe.settings.landscape} ${recipe.settings.weather}" aria-hidden="true"><i></i></span><span><strong>${recipe.name}</strong><small>${recipe.description}</small></span><span class="recipe-check" aria-hidden="true">✓</span></button>`,
        )
        .join('')}</fieldset>
      <div class="composer-fields">${select('landscape', 'Landscape')}${select('season', 'Season')}${select('timeOfDay', 'Time of day')}${select('weather', 'Weather')}</div>
      <p class="quick-note" id="world-clock-summary"></p>
      <p class="quick-note" id="world-status" role="status">Mix a place, a season, a little weather. Your journey stays yours.</p>`;
    document.getElementById('world-options')!.append(this.quickRoot);
    this.root.innerHTML = `
      <details class="composer-section" open><summary>Wind & weather details</summary>${range('weatherIntensity', 'Weather intensity')}${range('wind', 'Wind & waves')}<p class="field-note">A change of mood, not grip. Braking and drifting stay just as forgiving.</p></details>
      <details class="composer-section"><summary>The passing of time</summary><div class="composer-fields">${cycleToggle('autoTime', 'Day & night')}${cycleDuration('dayDuration', 'A day (minutes)', 1, 60, 1, 60)}${cycleToggle('autoSeasons', 'Seasons')}${cycleDuration('seasonDays', 'Days in a season', 1, 30, 1)}${cycleToggle('autoWeather', 'Weather')}${cycleDuration('weatherDuration', 'Weather interval (minutes)', 0.5, 30, 0.5, 60)}</div><p class="field-note">Daylight → sunset → moonlight → dawn, with four equal phases. Seasons follow the day clock; weather has its own rhythm. Time rests while you pause, browse a menu, or visit the garage. Picking an ingredient gives it a fresh interval.</p></details>
      <details class="composer-section"><summary>The road</summary><div class="composer-fields">${select('roadSurface', 'Surface')}${select('roadside', 'Roadside')}</div>${select('roadMarkings', 'Markings')}<p class="field-note">Keep your favorite curves and width, or adjust them in Shape the hillside below.</p></details>
      <details class="composer-section"><summary>Keep this little world</summary><label class="composer-field" for="scene-name"><span>Scene name</span><input id="scene-name" type="text" maxlength="48" value="My little escape" autocomplete="off"/></label><div class="scene-file-actions"><button id="save-scene" class="text-button">Save a copy</button><button id="export-scene" class="text-button">Export scene ↗</button><button id="import-scene" class="text-button">Import scene</button></div><input id="scene-file" type="file" accept=".json,application/json" hidden/><label class="composer-field" for="saved-scenes"><span>Saved on this device</span><select id="saved-scenes"><option value="">Choose a saved scene…</option></select></label><div class="scene-file-actions"><button id="load-scene" class="text-button" disabled>Load scene</button><button id="delete-scene" class="text-button" disabled>Remove saved copy</button></div><p class="field-note">Scenes save the scenery only. Your car, paint, handling, and journey stay yours.</p></details>
      <p class="composer-status" id="scene-status" role="status">Pick a place, then make it your own.</p>`;
    document.querySelector('.panel-intro')!.after(this.root);
    const options = { signal: this.abort.signal };
    this.quickRoot.querySelectorAll<HTMLButtonElement>('[data-scene]').forEach((button) =>
      button.addEventListener(
        'click',
        () => {
          const recipe = recipes[button.dataset.scene as keyof typeof recipes];
          this.$<HTMLInputElement>('scene-name').value = recipe.name;
          this.onChange({ ...recipe.settings, seed: this.settings.seed } as Partial<Settings>);
          this.status(`${recipe.name}. Adjust any ingredient to make a new mix.`);
        },
        options,
      ),
    );
    this.inputs().forEach((input) =>
      input.addEventListener(
        input.type === 'number' ? 'change' : 'input',
        () => {
          this.onChange({
            [input.dataset.worldSetting!]:
              input.type === 'range' || input.type === 'number'
                ? Number(input.value) * Number(input.dataset.worldUnit ?? 1)
                : input.value,
          });
        },
        options,
      ),
    );
    this.$('save-scene').addEventListener(
      'click',
      () => {
        if (this.saved.length >= 24) {
          this.status('Your shelf is full. Export a scene, then remove a saved copy to make room.');
          return;
        }
        const recipe = {
          name: sceneName(this.$<HTMLInputElement>('scene-name').value),
          settings: sceneSnapshot(this.settings),
        };
        const next = [...this.saved, recipe];
        if (this.store(next)) {
          this.saved = next;
          this.savedOptions();
          this.status(`Saved “${recipe.name}” as a new copy.`);
        }
      },
      options,
    );
    this.$('export-scene').addEventListener(
      'click',
      () => {
        const text = serializeScene(this.$<HTMLInputElement>('scene-name').value, this.settings);
        const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = 'chillhill.scene.json';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        this.status('Scene exported. Import it here whenever you want to return.');
      },
      options,
    );
    this.$('import-scene').addEventListener(
      'click',
      () => this.$<HTMLInputElement>('scene-file').click(),
      options,
    );
    this.$<HTMLInputElement>('scene-file').addEventListener(
      'change',
      async (event) => {
        const input = event.target as HTMLInputElement,
          file = input.files?.[0];
        if (!file) return;
        try {
          if (file.size > 65536) throw new Error('Scene files must be smaller than 64 KB.');
          const recipe = readScene(await file.text());
          if (this.abort.signal.aborted) return;
          this.onChange(recipe.settings);
          this.$<HTMLInputElement>('scene-name').value = recipe.name;
          this.status(`Loaded “${recipe.name}”. Save a copy to keep it on this device.`);
        } catch (error) {
          this.status(
            error instanceof SyntaxError
              ? 'That file is not valid JSON. Your scene has not changed.'
              : `${(error as Error).message} Your scene has not changed.`,
          );
        } finally {
          input.value = '';
        }
      },
      options,
    );
    this.$('saved-scenes').addEventListener('change', () => this.syncSavedButtons(), options);
    this.$('load-scene').addEventListener(
      'click',
      () => {
        const recipe = this.selectedScene();
        if (!recipe) return;
        this.onChange(recipe.settings);
        this.$<HTMLInputElement>('scene-name').value = recipe.name;
        this.status(`Back in “${recipe.name}”.`);
      },
      options,
    );
    this.$('delete-scene').addEventListener(
      'click',
      () => {
        const recipe = this.selectedScene();
        if (!recipe) return;
        const index = Number(this.$<HTMLSelectElement>('saved-scenes').value);
        const next = this.saved.filter((_, i) => i !== index);
        if (this.store(next)) {
          this.saved = next;
          this.savedOptions();
          this.status(
            `Removed the saved copy of “${recipe.name}”. The current world is unchanged; Save a copy keeps it again.`,
          );
        }
      },
      options,
    );
    try {
      const saved: unknown = JSON.parse(readStored(localStorage, 'scenes') ?? '[]');
      if (Array.isArray(saved))
        for (const item of saved.slice(0, 24)) {
          try {
            const recipe = readScene(
              JSON.stringify({ format: 'chillhill.scene', version: 1, ...item }),
            );
            this.saved.push({
              name: recipe.name,
              settings: sceneSnapshot(normalizeSettings(recipe.settings, defaults)),
            });
          } catch {
            /* A corrupt saved copy must not prevent the game from loading. */
          }
        }
    } catch {
      /* Storage may be unavailable. Export is still usable. */
    }
    this.savedOptions();
    this.sync(settings);
  }
  private $<T extends HTMLElement = HTMLElement>(id: string) {
    return (this.root.querySelector<T>(`#${id}`) ?? this.quickRoot.querySelector<T>(`#${id}`))!;
  }
  private inputs() {
    return [this.root, this.quickRoot].flatMap((root) => [
      ...root.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-world-setting]'),
    ]);
  }
  private status(message: string) {
    this.$('scene-status').textContent = message;
    this.$('world-status').textContent = message;
  }
  private store(recipes: SceneRecipe[]) {
    try {
      localStorage.setItem(storageKeys.scenes, JSON.stringify(recipes));
      return true;
    } catch {
      this.status('This browser could not save the scene. Export it to keep a copy.');
      return false;
    }
  }
  private selectedScene() {
    const value = this.$<HTMLSelectElement>('saved-scenes').value;
    return value === '' ? undefined : this.saved[Number(value)];
  }
  private syncSavedButtons() {
    for (const id of ['load-scene', 'delete-scene'])
      this.$<HTMLButtonElement>(id).disabled = !this.selectedScene();
  }
  private savedOptions() {
    const select = this.$<HTMLSelectElement>('saved-scenes');
    select.replaceChildren(new Option('Choose a saved scene…', ''));
    this.saved.forEach((recipe, i) => select.add(new Option(recipe.name, String(i))));
    this.syncSavedButtons();
  }
  sync(settings: Settings) {
    this.settings = settings;
    this.inputs().forEach((input) => {
      const key = input.dataset.worldSetting as keyof Settings;
      input.value =
        input.type === 'number'
          ? String(Number(settings[key]) / Number(input.dataset.worldUnit ?? 1))
          : String(settings[key]);
      if (input.type === 'range') {
        this.$(`world-${key}-value`).textContent = `${Math.round(Number(settings[key]) * 100)}%`;
        input.style.setProperty('--range-progress', `${Number(settings[key]) * 100}%`);
      }
    });
    let match = '';
    this.quickRoot.querySelectorAll<HTMLButtonElement>('[data-scene]').forEach((button) => {
      const recipe = recipes[button.dataset.scene as keyof typeof recipes];
      const selected = sceneKeys.every(
        (key) => key === 'seed' || settings[key] === recipe.settings[key],
      );
      button.setAttribute('aria-pressed', String(selected));
      if (selected) match = recipe.name;
    });
    this.$('scene-mix').textContent = match || 'Your mix';
    const time = settings.autoTime
      ? `${settings.dayDuration / 60}-minute days`
      : 'Time of day held';
    const seasons =
      settings.autoTime && settings.autoSeasons
        ? `a new season every ${settings.seasonDays} ${settings.seasonDays === 1 ? 'day' : 'days'}`
        : 'season held';
    this.$('world-clock-summary').textContent =
      `${time} · ${seasons}. ${settings.autoWeather ? 'Weather changes independently.' : 'Weather held.'}`;
  }
  dispose() {
    this.abort.abort();
    this.root.remove();
    this.quickRoot.remove();
  }
}
