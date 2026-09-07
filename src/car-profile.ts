import { cars, type CarId } from './config/cars';

const profiles: Record<CarId, [string, string]> = {
  astra: ['M8 31 11 25 28 22 40 12 65 12 85 26 87 36H8Z', 'm32 23 10-8h20l11 9Z'],
  'peugeot-206': [
    'M8 35V30Q10 24 28 22L40 12Q51 6 66 13Q82 20 86 28L89 36Z',
    'M33 23 43 14Q53 10 64 15L77 26Z',
  ],
  wagon: ['M8 30 13 22 27 21 34 10 75 10 83 23 88 26 88 36H8Z', 'm31 22 6-9h35l6 10Z'],
  'renault-12': ['M8 35V26L29 24 39 11 61 10 71 22 87 22 89 35Z', 'm33 23 8-9 18-1 9 10Z'],
  'porsche-911': [
    'M8 35V29Q13 24 30 23L40 14Q48 8 58 13Q68 16 75 25L87 29 89 36Z',
    'm34 24 8-9q8-4 15 0l11 10Z',
  ],
  testarossa: ['M8 36V31L33 26 45 17 61 17 72 23 89 24V36Z', 'm38 26 9-7h12l11 7Z'],
  'camaro-ss': ['M8 35V25L34 23 44 13 64 13 75 23 89 26V36Z', 'm38 23 8-8h16l10 8Z'],
  'mustang-fastback': ['M8 35V26L34 23 44 13Q54 9 66 15L83 24 89 28V36Z', 'm38 23 8-9 14 1 2 9Z'],
};

export function carProfile(id: CarId) {
  const [body, glass] = profiles[id],
    spec = cars[id];
  const front = 8 + (spec.frontOverhang / spec.length) * 80;
  const rear = front + (spec.wheelbase / spec.length) * 80;
  const wheels = [front, rear]
    .map(
      (x) =>
        `<circle cx="${x}" cy="35" r="7" fill="var(--car-tire)"/><circle cx="${x}" cy="35" r="3" fill="var(--car-window)"/>`,
    )
    .join('');
  return `<svg class="car-profile" viewBox="0 0 96 48" aria-hidden="true"><path d="${body}" fill="currentColor"/><path d="${glass}" fill="var(--car-window)"/><path d="M51 14v11" stroke="currentColor" stroke-width="2"/>${id === 'testarossa' ? '<path d="M39 29h24m-24 3h24" stroke="var(--car-window)" stroke-width="1.2"/>' : '<path d="M10 32h76" stroke="var(--car-window)" stroke-width="1.5"/>'}${wheels}</svg>`;
}
