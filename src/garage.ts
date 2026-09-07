import './garage.css';
import { cars, type CarId } from './config/cars';
import { styles, type Settings } from './config';
import { GarageScene, type GarageAngle } from './game/garage';
import { paintSwatches as swatches } from './config/paint';
import { vehiclePaintColor } from './game/vehicles';
import { formatLength, resolveUnitSystem } from './config/units';

export class Garage {
  private scene?: GarageScene;
  private settings: Settings;
  private abort = new AbortController();
  private rebuildTimer = 0;
  private root: HTMLElement;
  private wireframe = false;
  private spin = false;
  private compact = window.matchMedia('(max-width: 720px), (max-height: 820px)');
  private activeTab = 'cars';

  constructor(
    settings: Settings,
    private onChange: (patch: Partial<Settings>) => void,
  ) {
    this.settings = settings;
    this.root = document.createElement('section');
    this.root.id = 'garage-view';
    this.root.hidden = true;
    this.root.setAttribute('aria-labelledby', 'garage-title');
    this.root.innerHTML = `
      <div class="garage-layout">
        <div class="garage-stage">
          <div id="garage-canvas"></div>
          <div class="garage-stage-top"><span class="garage-bay">BAY 01 <i></i> MODEL WORKBENCH</span><button id="garage-spin" class="garage-chip" aria-pressed="false">Slow spin</button></div>
          <div class="garage-stage-bottom"><span class="garage-orbit-hint">Drag to look around · scroll / pinch to zoom</span><div class="garage-angles" role="group" aria-label="Car view">${[
            ['hero', '¾ view'],
            ['front', 'Front'],
            ['side', 'Side'],
            ['rear', 'Rear'],
          ]
            .map(([id, label]) => `<button data-garage-angle="${id}">${label}</button>`)
            .join('')}</div></div>
          <div id="garage-error" class="garage-error" hidden><h2>The workshop couldn’t load.</h2><p>Try reloading in a browser with WebGL 2 enabled.</p><button id="garage-retry" class="garage-drive">Try again</button></div>
        </div>
        <aside class="garage-panel" aria-label="Customize your car">
          <div class="garage-tabs" role="tablist" aria-label="Garage tools">${[
            ['cars', 'Cars'],
            ['paint', 'Paint'],
            ['details', 'Details'],
          ]
            .map(
              ([id, label]) =>
                `<button id="garage-tab-${id}" role="tab" data-garage-tab="${id}" aria-controls="garage-section-${id}">${label}</button>`,
            )
            .join('')}</div>
          <div class="garage-sections">
          <div id="garage-section-cars" class="garage-panel-section"><span class="eyebrow">01 / YOUR RIDE</span><h2 id="garage-car-name"></h2><p id="garage-car-variant" class="garage-muted"></p><div class="garage-car-list" role="group" aria-label="Choose a garage car">${Object.entries(
            cars,
          )
            .map(
              ([id, car], index) =>
                `<button data-garage-car="${id}" aria-pressed="false"><span class="garage-car-number">0${index + 1}</span><span>${car.name}</span><span class="garage-selection" aria-hidden="true">↗</span></button>`,
            )
            .join('')}</div></div>
          <div id="garage-section-paint" class="garage-panel-section"><span class="eyebrow">02 / A COAT OF COLOR</span><div class="garage-paint-heading"><h3>Find your shade.</h3><button id="garage-paint-reset" class="garage-text-button">Reset paint</button></div><div class="garage-swatches" role="group" aria-label="Paint colors">${swatches.map(([name, color]) => `<button data-paint="${color}" style="--swatch:${color}" title="${name}" aria-label="${name} paint" aria-pressed="false"><span aria-hidden="true">✓</span></button>`).join('')}</div><div class="garage-custom-color"><label class="garage-color-picker" for="garage-paint">Custom color<input id="garage-paint" type="color" aria-label="Custom car paint"/></label><label class="garage-hex-label" for="garage-hex"><span class="sr-only">Hex color</span><input id="garage-hex" type="text" maxlength="7" pattern="#[0-9a-fA-F]{6}" spellcheck="false" autocomplete="off" aria-label="Hex paint color"/></label></div><p id="garage-paint-note" class="garage-muted" role="status">Paint is saved separately for each car.</p></div>
          <div id="garage-section-details" class="garage-panel-section garage-detail-section"><span class="eyebrow">03 / THE LITTLE DETAILS</span><label class="garage-softness-label" for="garage-softness"><span>Shape softness</span><output id="garage-softness-value"></output></label><input id="garage-softness" type="range" min="0" max="1" step="0.05"/><div class="garage-tools"><button id="garage-wireframe" class="garage-chip" aria-pressed="false">Wireframe</button><button id="garage-reset-view" class="garage-text-button">Reset view ↺</button></div><dl class="garage-specs" id="garage-specs"></dl></div>
          </div>
        </aside>
      </div>
      <footer class="garage-footer"><span><i></i> Same car. A different perspective.</span><span>Changes follow you back to the hill.</span></footer>`;
    document.querySelector('#app')!.append(this.root);
    const options = { signal: this.abort.signal };
    const tabs = [...this.root.querySelectorAll<HTMLButtonElement>('[data-garage-tab]')];
    tabs.forEach((button, index) => {
      button.addEventListener(
        'click',
        () => {
          this.activeTab = button.dataset.garageTab!;
          this.syncLayout();
        },
        options,
      );
      button.addEventListener(
        'keydown',
        (event) => {
          const next =
            event.key === 'ArrowRight'
              ? (index + 1) % tabs.length
              : event.key === 'ArrowLeft'
                ? (index + tabs.length - 1) % tabs.length
                : event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? tabs.length - 1
                    : -1;
          if (next < 0) return;
          event.preventDefault();
          this.activeTab = tabs[next]!.dataset.garageTab!;
          this.syncLayout();
          tabs[next]!.focus();
        },
        options,
      );
    });
    this.compact.addEventListener('change', () => this.syncLayout(true), options);
    this.syncLayout();
    this.root.querySelectorAll<HTMLButtonElement>('[data-garage-car]').forEach((button) =>
      button.addEventListener(
        'click',
        () => {
          this.onChange({ car: button.dataset.garageCar as CarId });
        },
        options,
      ),
    );
    this.root
      .querySelectorAll<HTMLButtonElement>('[data-paint]')
      .forEach((button) =>
        button.addEventListener('click', () => this.paint(button.dataset.paint!), options),
      );
    this.$<HTMLInputElement>('garage-paint').addEventListener(
      'input',
      (event) => this.paint((event.target as HTMLInputElement).value),
      options,
    );
    const hex = this.$<HTMLInputElement>('garage-hex');
    hex.addEventListener(
      'input',
      () => {
        const valid = /^#[\da-f]{6}$/i.test(hex.value);
        hex.setAttribute('aria-invalid', String(!valid));
        if (valid) this.paint(hex.value.toLowerCase());
      },
      options,
    );
    hex.addEventListener('blur', () => this.syncUI(), options);
    this.$('garage-paint-reset').addEventListener('click', () => this.paint(null), options);
    this.$<HTMLInputElement>('garage-softness').addEventListener(
      'input',
      (event) => this.onChange({ roundness: Number((event.target as HTMLInputElement).value) }),
      options,
    );
    this.root.querySelectorAll<HTMLButtonElement>('[data-garage-angle]').forEach((button) =>
      button.addEventListener(
        'click',
        () => {
          this.stopSpin();
          this.scene?.setView(button.dataset.garageAngle as GarageAngle);
        },
        options,
      ),
    );
    this.$('garage-reset-view').addEventListener(
      'click',
      () => {
        this.stopSpin();
        this.scene?.setView('hero');
      },
      options,
    );
    this.$('garage-spin').addEventListener(
      'click',
      () => {
        this.spin = !this.spin;
        if (this.scene) this.scene.controls.autoRotate = this.spin;
        this.$('garage-spin').setAttribute('aria-pressed', String(this.spin));
      },
      options,
    );
    this.$('garage-wireframe').addEventListener(
      'click',
      () => {
        this.wireframe = !this.wireframe;
        this.scene?.setWireframe(this.wireframe);
        this.$('garage-wireframe').setAttribute('aria-pressed', String(this.wireframe));
      },
      options,
    );
    this.$('garage-retry').addEventListener('click', () => this.open(), options);
    this.syncUI();
  }

  private $<T extends HTMLElement = HTMLElement>(id: string) {
    return this.root.querySelector<T>(`#${id}`)!;
  }
  private syncLayout(preserveFocus = false) {
    const compact = this.compact.matches;
    const focused = document.activeElement;
    this.root.classList.toggle('garage-compact', compact);
    this.root.querySelector<HTMLElement>('.garage-tabs')!.hidden = !compact;
    for (const id of ['cars', 'paint', 'details']) {
      const panel = this.$(`garage-section-${id}`);
      const tab = this.$<HTMLButtonElement>(`garage-tab-${id}`);
      // Keep the focused tool available when the window changes layout.
      if (preserveFocus && compact && focused && panel.contains(focused)) this.activeTab = id;
      if (compact) {
        panel.setAttribute('role', 'tabpanel');
        panel.setAttribute('aria-labelledby', tab.id);
      } else {
        panel.removeAttribute('role');
        panel.removeAttribute('aria-labelledby');
      }
    }
    for (const id of ['cars', 'paint', 'details']) {
      const panel = this.$(`garage-section-${id}`);
      const tab = this.$<HTMLButtonElement>(`garage-tab-${id}`);
      panel.hidden = compact && id !== this.activeTab;
      tab.setAttribute('aria-selected', String(id === this.activeTab));
      tab.tabIndex = id === this.activeTab ? 0 : -1;
      if (compact && focused && panel.hidden && panel.contains(focused)) {
        this.$(`garage-tab-${this.activeTab}`).focus();
      } else if (!compact && focused === tab) {
        panel.querySelector<HTMLElement>('button, input')?.focus();
      }
    }
  }
  private paint(value: string | null) {
    this.onChange({ paint: { ...this.settings.paint, [this.settings.car]: value } });
  }
  private stopSpin() {
    this.spin = false;
    if (this.scene) this.scene.controls.autoRotate = false;
    this.$('garage-spin').setAttribute('aria-pressed', 'false');
  }

  private syncUI() {
    const car = cars[this.settings.car];
    this.$('garage-car-name').textContent = car.name;
    this.$('garage-car-variant').textContent = car.variant;
    this.root
      .querySelectorAll<HTMLButtonElement>('[data-garage-car]')
      .forEach((button) =>
        button.setAttribute('aria-pressed', String(button.dataset.garageCar === this.settings.car)),
      );
    const color = vehiclePaintColor(
      this.settings.car,
      styles[this.settings.style].car,
      this.settings.paint[this.settings.car],
    );
    this.$<HTMLInputElement>('garage-paint').value = color;
    const hex = this.$<HTMLInputElement>('garage-hex');
    if (document.activeElement !== hex || /^#[\da-f]{6}$/i.test(hex.value)) {
      hex.value = color.toUpperCase();
      hex.setAttribute('aria-invalid', 'false');
    }
    this.$('garage-paint-note').textContent = this.settings.paint[this.settings.car]
      ? 'Your shade. Saved for this car.'
      : 'Original paint. Saved separately for each car.';
    this.root
      .querySelectorAll<HTMLButtonElement>('[data-paint]')
      .forEach((button) =>
        button.setAttribute('aria-pressed', String(button.dataset.paint === color.toLowerCase())),
      );
    this.$<HTMLInputElement>('garage-softness').value = String(this.settings.roundness);
    this.$('garage-softness').style.setProperty(
      '--range-progress',
      `${this.settings.roundness * 100}%`,
    );
    this.$('garage-softness-value').textContent = `${Math.round(this.settings.roundness * 100)}%`;
    this.$('garage-specs').innerHTML = [
      ['Length', car.length],
      ['Width', car.width],
      ['Wheelbase', car.wheelbase],
    ]
      .map(
        ([name, value]) =>
          `<div><dt>${name}</dt><dd>${formatLength(Number(value), resolveUnitSystem(this.settings.units), true)}</dd></div>`,
      )
      .join('');
  }

  applySettings(settings: Settings) {
    const soften = this.settings.roundness !== settings.roundness;
    this.settings = settings;
    clearTimeout(this.rebuildTimer);
    if (soften)
      this.rebuildTimer = window.setTimeout(() => {
        this.scene?.applySettings(this.settings);
        this.syncUI();
      }, 100);
    else this.scene?.applySettings(settings);
    this.syncUI();
  }

  open() {
    this.root.hidden = false;
    if (!this.scene) {
      try {
        this.scene = new GarageScene(this.$('garage-canvas'), this.settings);
        this.scene.setWireframe(this.wireframe);
        this.scene.controls.autoRotate = this.spin;
        this.$('garage-error').hidden = true;
      } catch (error) {
        console.error('Unable to open the garage:', error);
        this.$('garage-error').hidden = false;
      }
    }
    this.syncUI();
  }
  close() {
    clearTimeout(this.rebuildTimer);
    this.scene?.dispose();
    this.scene = undefined;
    this.root.hidden = true;
  }
  render(dt: number) {
    this.scene?.render(dt);
  }
  get telemetry() {
    return this.scene
      ? {
          car: this.scene.carId,
          paint: this.scene.paintColor,
          camera: this.scene.camera.position.toArray(),
          distance: this.scene.camera.position.distanceTo(this.scene.controls.target),
          geometries: this.scene.renderer.info.memory.geometries,
          textures: this.scene.renderer.info.memory.textures,
          wireframe: this.wireframe,
          spin: this.spin,
        }
      : null;
  }
  dispose() {
    this.close();
    this.abort.abort();
    this.root.remove();
  }
}
