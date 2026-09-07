import { cars, type CarId } from './config/cars';
import { paintSwatches } from './config/paint';
import { styles, type Settings } from './config';
import { vehiclePaintColor } from './game/vehicles';
import { VehicleThumbnails } from './game/vehicle-thumbnails';
import { formatLength, resolveUnitSystem } from './config/units';

/** Paint and model previews share the garage's settings and actual vehicle builder. */
export class CarMenu {
  private root = document.getElementById('car-menu')!;
  private abort = new AbortController();
  private previews = new VehicleThumbnails();
  private frame = 0;
  private active = false;
  private settings: Settings;

  constructor(
    settings: Settings,
    private onChange: (patch: Partial<Settings>) => void,
  ) {
    this.settings = settings;
    this.$('car-options').innerHTML = `
      <div class="quick-paint">
        <div class="quick-paint-heading"><label for="quick-car-color">Paint <span id="quick-paint-car"></span></label><button id="quick-paint-reset" class="text-button">Reset</button></div>
        <div class="quick-swatches" role="group" aria-label="Car paint colors">${paintSwatches.map(([name, color]) => `<button data-quick-paint="${color}" style="--swatch:${color}" aria-label="${name} paint" title="${name}" aria-pressed="false"><span aria-hidden="true">✓</span></button>`).join('')}</div>
        <div class="quick-custom-paint"><input id="quick-car-color" type="color" aria-label="Custom car paint"><label for="quick-car-hex">Your shade</label><input id="quick-car-hex" type="text" maxlength="7" spellcheck="false" autocomplete="off" aria-label="Hex paint color"><span id="quick-paint-status" class="sr-only" role="status"></span></div>
      </div>
      <fieldset class="car-picker"><legend>Choose your ride</legend><div class="car-grid">${Object.entries(
        cars,
      )
        .map(
          ([id, car]) =>
            `<button class="car-option" data-car="${id}" aria-pressed="false"><span class="car-thumbnail"><img data-car-thumbnail="${id}" alt="" width="360" height="208" hidden><span class="car-preview-status">Loading model…</span></span><span class="car-copy"><span class="car-name">${car.name}</span><span class="car-variant">${car.variant}</span></span><span class="car-check" aria-hidden="true">✓</span></button>`,
        )
        .join('')}</div><p class="field-note" id="car-spec"></p></fieldset>`;
    const options = { signal: this.abort.signal };
    this.root
      .querySelectorAll<HTMLButtonElement>('[data-car]')
      .forEach((button) =>
        button.addEventListener(
          'click',
          () => this.onChange({ car: button.dataset.car as CarId }),
          options,
        ),
      );
    this.root
      .querySelectorAll<HTMLButtonElement>('[data-quick-paint]')
      .forEach((button) =>
        button.addEventListener('click', () => this.paint(button.dataset.quickPaint!), options),
      );
    this.$<HTMLInputElement>('quick-car-color').addEventListener(
      'input',
      (event) => this.paint((event.target as HTMLInputElement).value),
      options,
    );
    const hex = this.$<HTMLInputElement>('quick-car-hex');
    hex.addEventListener(
      'input',
      () => {
        const valid = /^#[\da-f]{6}$/i.test(hex.value);
        hex.setAttribute('aria-invalid', String(!valid));
        if (valid) this.paint(hex.value.toLowerCase());
        else
          this.$('quick-paint-status').textContent = 'Use a six-digit hex color, such as #426453.';
      },
      options,
    );
    hex.addEventListener('blur', () => this.sync(this.settings, true), options);
    this.$('quick-paint-reset').addEventListener('click', () => this.paint(null), options);
    this.sync(settings);
  }

  private $<T extends HTMLElement = HTMLElement>(id: string) {
    return this.root.querySelector<T>(`#${id}`)!;
  }
  private paint(value: string | null) {
    this.onChange({ paint: { ...this.settings.paint, [this.settings.car]: value } });
    this.$('quick-paint-status').textContent = value
      ? 'Color saved for this car.'
      : 'Original paint restored for this car.';
  }

  sync(settings: Settings, resetHex = false) {
    const changedCar = this.settings.car !== settings.car;
    this.settings = settings;
    const color = vehiclePaintColor(
      settings.car,
      styles[settings.style].car,
      settings.paint[settings.car],
    );
    this.root
      .querySelectorAll<HTMLButtonElement>('[data-car]')
      .forEach((button) =>
        button.setAttribute('aria-pressed', String(button.dataset.car === settings.car)),
      );
    this.root
      .querySelectorAll<HTMLButtonElement>('[data-quick-paint]')
      .forEach((button) =>
        button.setAttribute('aria-pressed', String(button.dataset.quickPaint === color)),
      );
    this.$('quick-paint-car').textContent = `· ${cars[settings.car].name}`;
    this.$<HTMLInputElement>('quick-car-color').value = color;
    const hex = this.$<HTMLInputElement>('quick-car-hex');
    if (
      resetHex ||
      changedCar ||
      document.activeElement !== hex ||
      /^#[\da-f]{6}$/i.test(hex.value)
    ) {
      hex.value = color.toUpperCase();
      hex.setAttribute('aria-invalid', 'false');
    }
    const car = cars[settings.car];
    const units = resolveUnitSystem(settings.units);
    this.$('car-spec').textContent =
      `${formatLength(car.length, units, true)} long · ${formatLength(car.wheelbase, units, true)} wheelbase. Colors are saved per car. Your journey stays with you.`;
    this.schedule();
  }

  setOpen(open: boolean) {
    this.active = open;
    if (open) this.schedule();
    else {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
    }
  }

  private schedule() {
    if (!this.active || this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      if (!this.active) return;
      // One changed preview per frame, prioritizing the car currently being painted.
      const ids = [
        this.settings.car,
        ...(Object.keys(cars) as CarId[]).filter((id) => id !== this.settings.car),
      ];
      for (const id of ids) {
        const img = this.root.querySelector<HTMLImageElement>(`[data-car-thumbnail="${id}"]`)!;
        const color = vehiclePaintColor(
          id,
          styles[this.settings.style].car,
          this.settings.paint[id],
        );
        const key = `${this.settings.roundness}:${color}`;
        if (img.dataset.previewKey === key) continue;
        try {
          img.src = this.previews.render(id, this.settings.roundness, color);
          img.hidden = false;
          img.nextElementSibling!.textContent = '';
          img.dataset.previewColor = color;
        } catch {
          img.nextElementSibling!.textContent = 'Preview unavailable';
        }
        img.dataset.previewKey = key;
        this.schedule();
        break;
      }
    });
  }

  dispose() {
    this.setOpen(false);
    this.abort.abort();
    this.previews.dispose();
  }

  get telemetry() {
    return this.previews.telemetry;
  }
}
