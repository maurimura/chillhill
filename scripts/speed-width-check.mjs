import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

export async function checkSpeedWidth(browser, origin, errors) {
  await mkdir('artifacts', { recursive: true });
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
    { width: 390, height: 844 },
    { width: 320, height: 640 },
    { width: 844, height: 390 },
  ]) {
    const touch = viewport.width < 651 || viewport.height < 600;
    const page = await browser.newPage({ viewport, hasTouch: touch, isMobile: touch });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      localStorage.setItem(
        'chillhill.settings.v1',
        JSON.stringify({ treeDensity: 0, autoTime: false, autoWeather: false }),
      );
    });
    try {
      await page.goto(origin);
      await page.waitForFunction(() => window.__chillhill?.driveReady);
      await page.evaluate(() => document.fonts.ready);
      for (const phase of ['intro', 'driving']) {
        if (phase === 'driving') await page.locator('#start').click();
        // Layout-only fixtures run in one synchronous task: no simulation state
        // changes, and the real animation loop cannot replace a digit mid-check.
        const samples = await page.evaluate(() => {
          const card = document.querySelector('.speed-card');
          const number = document.querySelector('#speed');
          const unit = document.querySelector('#speed-unit');
          const status = document.querySelector('#speed-status');
          const originals = [number, unit, status].map((element) => element.textContent);
          const samples = [];
          const bounds = (element) => {
            const { left, right, top, bottom, width, height } = element.getBoundingClientRect();
            return { left, right, top, bottom, width, height };
          };
          try {
            for (const label of ['KM/H', 'MPH']) {
              unit.textContent = label;
              for (const mood of ['NICE & EASY', 'TAKING A BREATHER', 'A LITTLE FASTER']) {
                status.textContent = mood;
                for (const digits of ['00', '11', '88', '99', '100', '000', '888', '999']) {
                  number.textContent = digits;
                  const glyphs = document.createRange();
                  glyphs.selectNodeContents(number);
                  samples.push({
                    label,
                    mood,
                    digits,
                    card: bounds(card),
                    number: bounds(number),
                    unit: bounds(unit),
                    glyphs: bounds(glyphs),
                  });
                  glyphs.detach();
                }
              }
            }
          } finally {
            [number, unit, status].forEach((element, index) => {
              element.textContent = originals[index];
            });
          }
          return samples;
        });
        const baseline = samples[0].card;
        for (const sample of samples) {
          const context = `${viewport.width}×${viewport.height} ${phase} ${sample.digits} ${sample.label} ${sample.mood}`;
          assert.ok(
            Math.abs(sample.card.width - baseline.width) < 0.02,
            `${context}: stable width`,
          );
          assert.ok(
            Math.abs(sample.card.left - baseline.left) < 0.02,
            `${context}: stable position`,
          );
          assert.ok(
            sample.glyphs.left >= sample.number.left - 0.5 &&
              sample.glyphs.right <= sample.number.right + 0.5,
            `${context}: all three digits fit their reserved column`,
          );
          assert.ok(sample.number.right <= sample.unit.left, `${context}: digits clear units`);
          assert.ok(sample.unit.right <= sample.card.right, `${context}: units fit the card`);
          assert.ok(
            sample.card.left >= 0 && sample.card.right <= viewport.width,
            `${context}: card stays inside the viewport`,
          );
        }
        if (touch && phase === 'driving')
          assert.equal(baseline.width, 92, 'touch driving readout keeps its compact width');
        if (phase === 'driving')
          await page.screenshot({ path: `artifacts/speed-width-${viewport.width}.png` });
      }
    } finally {
      await page.close();
    }
  }
  console.log(
    'PASS: speed card reserves three tabular digits; stable width/position across 00–999, metric/imperial, every status, desktop/mobile/landscape.',
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const browser = await chromium.launch({
    channel: process.env.CHROME_CHANNEL || 'chrome',
    headless: true,
  });
  const errors = [];
  try {
    await checkSpeedWidth(browser, process.env.TEST_URL || 'http://127.0.0.1:5173', errors);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
}
