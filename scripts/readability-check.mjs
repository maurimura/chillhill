import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const overlayText = [
  '.brand-name',
  '#place',
  '.site-header .icon-button',
  '.intro h1',
  '.intro h1 em',
  '.intro p',
  '.intro-kicker',
  '.start-note',
  '.start-note kbd',
  '.intro .mode-option',
  '.mode-option strong',
  '.mode-option small',
  '.route-card .eyebrow',
  '.route-distance',
  '.route-distance small',
  '.route-note',
  '.world-clock-label',
  '.speed-number',
  '.speed-unit',
  '.speed-status',
  '.keyboard-guide',
  '.keyboard-guide kbd',
  '.keyboard-guide .arrows-note',
  '.thumb-hint',
  '.pad-up',
  '.pad-down',
  '.challenge-hud',
  '.challenge-hud .eyebrow',
  '.challenge-message',
];

export async function checkContrast(page, selectors) {
  // Composite the actual CSS layers over both extreme scene colors. All our
  // local plates use neutral alpha, so each channel of any scene lies between
  // these extremes. Testing both bounds covers any terrain/sky/car palette.
  const results = await page.evaluate((selectors) => {
    const rgba = (value) => {
      const match = value.match(/^rgba?\((.+)\)$/);
      if (!match) throw new Error(`Unsupported computed color: ${value}`);
      const values = match[1].split(/[,\s/]+/).map(Number);
      return [values[0], values[1], values[2], values[3] ?? 1];
    };
    const over = (foreground, background) =>
      foreground.slice(0, 3).map((v, i) => v * foreground[3] + background[i] * (1 - foreground[3]));
    const luminance = (color) =>
      color
        .slice(0, 3)
        .map((v) => v / 255)
        .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
        .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
    const results = [];
    for (const selector of selectors) {
      for (const element of document.querySelectorAll(selector)) {
        if (!element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
        const styles = getComputedStyle(element);
        const layers = [];
        let parent = element;
        while (parent && parent !== document.body) {
          // The canvas replaces the game-shell background in the final image.
          if (!['game-shell', 'scene', 'app'].includes(parent.id)) {
            const before = getComputedStyle(parent, '::before');
            if (
              before.display !== 'none' &&
              before.content !== 'none' &&
              before.content !== 'normal'
            )
              layers.unshift(rgba(before.backgroundColor));
            layers.unshift(rgba(getComputedStyle(parent).backgroundColor));
          }
          parent = parent.parentElement;
        }
        for (const value of [0, 255]) {
          const background = layers.reduce((bg, layer) => over(layer, bg), [value, value, value]);
          const foreground = over(rgba(styles.color), background);
          const a = luminance(foreground);
          const b = luminance(background);
          results.push({
            selector,
            scene: value === 0 ? 'black' : 'white',
            ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
            text: element.textContent.trim().slice(0, 45),
          });
        }
      }
    }
    return results;
  }, selectors);
  for (const result of results)
    assert.ok(
      result.ratio >= 4.5,
      `${result.selector} (${result.text}) over ${result.scene}: ${result.ratio.toFixed(2)}:1, needs 4.5:1`,
    );
  return results;
}

async function checkMobileHud(page) {
  const cases = await page.evaluate(() => {
    const bounds = (element) => {
      const rect = element.getBoundingClientRect();
      const before = getComputedStyle(element, '::before');
      const visible = before.display !== 'none' && !['none', 'normal'].includes(before.content);
      return {
        left: rect.left + (visible ? Math.min(0, parseFloat(before.left) || 0) : 0),
        right: rect.right - (visible ? Math.min(0, parseFloat(before.right) || 0) : 0),
        top: rect.top + (visible ? Math.min(0, parseFloat(before.top) || 0) : 0),
        bottom: rect.bottom - (visible ? Math.min(0, parseFloat(before.bottom) || 0) : 0),
      };
    };
    const passed = document.querySelector('#overtakes');
    const original = passed.textContent;
    const points = document.querySelector('#score');
    const originalPoints = points.textContent;
    const results = [];
    // Layout-only fixture: measure synchronously before the real HUD refreshes.
    // Reserve room for three digits; larger scores may wrap inside the card.
    for (const score of ['0', '999', '999999']) {
      passed.textContent = score;
      points.textContent = Number(score).toLocaleString();
      const entries = [
        '.site-header',
        '#challenge-hud',
        '.speed-card',
        '.route-card',
        '.touch-controls',
      ]
        .map((selector) => ({ selector, element: document.querySelector(selector) }))
        .filter(({ element }) => element.checkVisibility());
      results.push({
        score,
        boxes: entries.map(({ selector, element }) => ({ selector, ...bounds(element) })),
        speed: bounds(document.querySelector('.speed-card')),
        speedFont: getComputedStyle(document.querySelector('.speed-number')).fontSize,
      });
    }
    passed.textContent = original;
    points.textContent = originalPoints;
    return results;
  });
  const { width, height } = page.viewportSize();
  for (const { score, boxes, speed, speedFont } of cases) {
    assert.equal(speedFont, '30px', 'touch speed readout remains compact');
    assert.ok(speed.bottom < height * 0.4, 'speed backplate stays above the player-car area');
    for (const [index, box] of boxes.entries()) {
      assert.ok(
        box.left >= 0 && box.right <= width && box.top >= 0 && box.bottom <= height,
        `${width}×${height}: ${box.selector} and its backplate fit with ${score} passes`,
      );
      for (const other of boxes.slice(index + 1)) {
        const overlaps =
          box.left < other.right &&
          box.right > other.left &&
          box.top < other.bottom &&
          box.bottom > other.top;
        assert.ok(
          !overlaps,
          `${width}×${height}: ${box.selector} backplate clears ${other.selector}, score ${score}`,
        );
      }
    }
  }
}

export async function checkReadability(browser, origin, errors) {
  const results = [];
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
    { width: 320, height: 640 },
    { width: 844, height: 390 },
  ]) {
    const mobile = viewport.width < 651 || viewport.height < 600;
    const page = await browser.newPage({ viewport, isMobile: mobile, hasTouch: mobile });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    try {
      await page.goto(origin);
      await page.waitForFunction(() => window.__chillhill?.driveReady);
      await page.evaluate(() => document.fonts.ready);
      for (const [landscape, phase, season, weather] of [
        ['coast', 'day', 'summer', 'clear'],
        ['forest', 'night', 'winter', 'snow'],
        ['desert', 'sunset', 'autumn', 'overcast'],
        ['lakes', 'dawn', 'spring', 'rain'],
        ['city', 'dusk', 'summer', 'clear'],
      ]) {
        await page.locator('#open-world-menu').click();
        await page.locator('#world-landscape').selectOption(landscape);
        await page.locator('#world-timeOfDay').selectOption(phase);
        await page.locator('#world-season').selectOption(season);
        await page.locator('#world-weather').selectOption(weather);
        results.push(
          ...(await checkContrast(page, [
            '.quick-heading .eyebrow',
            '.quick-heading h2',
            '.quick-heading p',
            '.quick-note',
            '.composer-field > span',
            '.composer-field select',
            '.scene-recipe strong',
          ])),
        );
        await page.locator('#close-world-menu').click();
        await page.waitForTimeout(250);
        results.push(...(await checkContrast(page, overlayText)));
        assert.equal(
          await page.locator('.intro h1').evaluate((el) => getComputedStyle(el).textShadow),
          'none',
        );
        assert.equal(
          await page.locator('.site-header').evaluate((el) => getComputedStyle(el).backgroundImage),
          'none',
        );
        if (phase === 'day' || phase === 'night') {
          await page.waitForTimeout(850);
          await page.screenshot({ path: `artifacts/readability-${phase}-${viewport.width}.png` });
        }
      }
      await page.locator('#start').click();
      results.push(...(await checkContrast(page, overlayText)));
      await page.screenshot({ path: `artifacts/readability-driving-${viewport.width}.png` });
      await page.locator('#pause').click();
      if (mobile) {
        await page.locator('#pause-card [data-mode="challenge"]').click();
        await checkMobileHud(page);
        results.push(...(await checkContrast(page, overlayText)));
        await page.screenshot({ path: `artifacts/readability-challenge-${viewport.width}.png` });
        await page.locator('#pause').click();
      }
      results.push(
        ...(await checkContrast(page, [
          '.pause-card .eyebrow',
          '.pause-card h2',
          '.pause-card p',
          '.pause-card .mode-option',
          '.pause-card .mode-option strong',
          '.pause-card .mode-option small',
        ])),
      );
      await page.locator('#open-car-menu').click();
      results.push(
        ...(await checkContrast(page, [
          '.quick-heading .eyebrow',
          '.car-name',
          '.car-variant',
          '.quick-custom-paint',
          '.garage-link small',
        ])),
      );
      await page.locator('#close-car-menu').click();
      await page.locator('#open-settings').click();
      results.push(
        ...(await checkContrast(page, [
          '.panel-header .eyebrow',
          '.panel-intro',
          'legend',
          '.slider-label output',
          '.field-note',
          '.saved-note',
        ])),
      );
    } finally {
      await page.close();
    }
  }
  console.log(
    `PASS: ${results.length} computed text-contrast checks across five daylight/weather/landscape combinations and four viewports; minimum ${Math.min(...results.map((r) => r.ratio)).toFixed(2)}:1 over white/black scenery.`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await mkdir('artifacts', { recursive: true });
  const browser = await chromium.launch({
    channel: process.env.CHROME_CHANNEL || 'chrome',
    headless: true,
  });
  const errors = [];
  try {
    await checkReadability(browser, process.env.TEST_URL || 'http://127.0.0.1:5173', errors);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
}
