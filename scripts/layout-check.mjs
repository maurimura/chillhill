import assert from 'node:assert/strict';
import { selectGarageTool } from './garage-tools.mjs';

const overlaps = (a, b) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

async function checkNav(page, garage) {
  assert.equal(await page.locator('nav').count(), 1, 'one shared navigation bar');
  const github = page.locator('#github-link');
  assert.equal(await github.isVisible(), true);
  assert.equal(await github.getAttribute('href'), 'https://github.com/maurimura/chillhill');
  assert.equal(await github.getAttribute('target'), '_blank');
  assert.equal(await github.getAttribute('rel'), 'noopener noreferrer');
  assert.match(await github.getAttribute('aria-label'), /GitHub.*new tab/);
  const nav = await page.locator('.site-header').boundingBox();
  const identity = await page.locator('.nav-identity').boundingBox();
  const actions = await page.locator('.header-actions').boundingBox();
  assert.ok(!overlaps(identity, actions), 'brand/title and navigation actions never overlap');
  for (const box of [identity, actions]) {
    assert.ok(box.x >= 0 && box.x + box.width <= page.viewportSize().width);
    assert.ok(Math.abs(box.y + box.height / 2 - (nav.y + nav.height / 2)) < 1);
  }
  const mark = await page.locator('.brand-mark').boundingBox();
  const mountain = await page.locator('.brand-mark svg').evaluate((svg) => {
    const box = svg.getBBox();
    const center = new DOMPoint(box.x + box.width / 2, box.y + box.height / 2);
    const screen = center.matrixTransform(svg.getScreenCTM());
    return { x: screen.x, y: screen.y };
  });
  assert.ok(Math.abs(mountain.x - (mark.x + mark.width / 2)) < 0.1);
  assert.ok(
    Math.abs(mountain.y - (mark.y + mark.height / 2)) < 0.1,
    'the mountain artwork itself is centered inside its circle',
  );
  if (await page.locator('.brand-name').isVisible()) {
    const name = await page.locator('.brand-name').boundingBox();
    assert.ok(Math.abs(name.y + name.height / 2 - (mark.y + mark.height / 2)) < 1);
  }
  assert.equal(await page.locator('#open-car-menu').isVisible(), !garage);
  assert.equal(await page.locator('#open-world-menu').isVisible(), !garage);
  assert.equal(await page.locator('.site-header #open-garage, .weather-label').count(), 0);
  assert.equal(await page.locator('#back-drive').isVisible(), garage);
  assert.equal(await page.locator('#garage-title').isVisible(), garage);
  assert.equal(await page.locator('#world-label').isVisible(), !garage);
  assert.equal(await page.locator('.world-label svg, .world-icon, .world-subtitle').count(), 0);
  if (!garage) {
    const brand = await page.locator('.brand').boundingBox();
    const road = await page.locator('#world-label').boundingBox();
    assert.ok(road.x >= brand.x + brand.width, 'road name sits beside the shared brand');
    assert.ok(Math.abs(road.y + road.height / 2 - (brand.y + brand.height / 2)) < 1);
    const label = await page.locator('#place').boundingBox();
    assert.ok(
      Math.abs(label.y + label.height / 2 - (brand.y + brand.height / 2)) < 1,
      'the landscape line box stays aligned with the brand',
    );
    const spacing = await page.locator('.nav-identity').evaluate((el) => {
      const glass = getComputedStyle(el, '::before');
      const road = getComputedStyle(el.querySelector('#world-label'));
      return {
        inset: [glass.top, glass.right, glass.bottom, glass.left],
        divider: parseFloat(road.borderLeftWidth),
      };
    });
    assert.deepEqual(spacing.inset, ['0px', '0px', '0px', '0px']);
    assert.ok(
      Math.abs(mark.y - identity.y - (identity.y + identity.height - mark.y - mark.height)) < 1,
    );
    if (spacing.divider) {
      assert.ok(
        Math.abs(
          label.x -
            road.x -
            spacing.divider -
            (identity.x + identity.width - label.x - label.width),
        ) < 1,
        'landscape lettering has equal space between the divider and the right edge of the glass',
      );
    } else {
      assert.ok(
        Math.abs(label.x + label.width / 2 - (road.x + road.width / 2)) < 1,
        'wrapped mobile landscape names are centered in their available space',
      );
    }
    assert.ok(road.x + road.width <= actions.x, 'road name does not cover controls');
    assert.deepEqual(
      await page.locator('.site-header').evaluate((nav) => {
        const style = getComputedStyle(nav);
        return { image: style.backgroundImage, color: style.backgroundColor };
      }),
      { image: 'none', color: 'rgba(0, 0, 0, 0)' },
      'driving navigation is transparent in daylight and at night',
    );
    assert.equal(await page.locator('.scene-wash').count(), 0, 'no wash over the scenery');
  }
  if (garage) {
    const brand = await page.locator('.brand').boundingBox();
    const title = await page.locator('#garage-title').boundingBox();
    assert.ok(Math.abs(brand.y + brand.height / 2 - (title.y + title.height / 2)) < 1);
    assert.equal(await page.locator('.garage-heading').count(), 0);
    assert.equal(await page.locator('#drive-toolbar').isVisible(), false);
    const stage = await page.locator('.garage-stage').boundingBox();
    assert.ok(stage.y >= nav.y + nav.height, 'garage preview sits below the only header');
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollHeight <= innerHeight && scrollY === 0,
      ),
      'the whole garage fits without page scrolling',
    );
  }
}

async function checkDrive(page) {
  const viewport = page.viewportSize();
  const canvas = await page.locator('#scene canvas').boundingBox();
  assert.deepEqual(canvas, { x: 0, y: 0, ...viewport }, 'the driving scene fills the viewport');
  assert.ok(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <= innerWidth &&
        document.documentElement.scrollHeight <= innerHeight &&
        scrollY === 0,
    ),
    'driving has no page margins or scrolling, including after leaving the garage',
  );
  await checkNav(page, false);
  const selectors = ['.route-card', '.speed-card'];
  const touch = await page.locator('.touch-controls').isVisible();
  if (touch) selectors.push('.touch-controls');
  if (await page.locator('.driving-guide').isVisible()) selectors.push('.driving-guide');
  const boxes = [['navigation', await page.locator('.site-header').boundingBox()]];
  for (const selector of selectors) {
    const box = await page.locator(selector).boundingBox();
    assert.ok(
      box.x >= 0 &&
        box.y >= 0 &&
        box.x + box.width <= viewport.width &&
        box.y + box.height <= viewport.height,
      `${selector} stays inside the game`,
    );
    for (const [name, other] of boxes) {
      assert.ok(
        !overlaps(box, other),
        `${viewport.width}×${viewport.height}: ${selector} does not overlap ${name}`,
      );
    }
    boxes.push([selector, box]);
  }
}

export async function checkLayout(browser, origin, errors) {
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 960, height: 900 },
    { width: 650, height: 844 },
    { width: 390, height: 844 },
    { width: 320, height: 640 },
    { width: 844, height: 390 },
  ]) {
    const mobile = viewport.width < 650 || viewport.height < 600;
    const page = await browser.newPage({ viewport, isMobile: mobile, hasTouch: mobile });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      await page.goto(origin);
      await page.waitForFunction(() => window.__chillhill?.driveReady);
      await page.evaluate(() => document.fonts.ready);
      await checkDrive(page);
      await page.locator('#start').click();
      await page.locator('#pause').click();
      assert.equal(await page.evaluate(() => window.__chillhill.paused), true);
      await checkDrive(page);
      await page.locator('#pause').click();
      assert.equal(await page.evaluate(() => window.__chillhill.paused), false);
      await page.screenshot({ path: `artifacts/layout-drive-${viewport.width}.png` });
      await page.locator('#open-world-menu').click();
      const panel = await page.locator('#world-menu').boundingBox();
      assert.ok(panel.x >= 0 && panel.x + panel.width <= viewport.width);
      assert.ok(panel.y >= 60 && panel.y + panel.height <= viewport.height);
      assert.ok(
        await page.locator('#world-menu').evaluate((el) => el.scrollWidth <= el.clientWidth),
      );
      await page.locator('[data-scene="summer-coast"]').click();
      await page.locator('#world-timeOfDay').selectOption('night');
      await page.waitForTimeout(1100);
      await page.screenshot({ path: `artifacts/layout-scenery-menu-${viewport.width}.png` });
      await page.locator('#close-world-menu').click();
      await checkDrive(page);
      await page.screenshot({ path: `artifacts/layout-night-${viewport.width}.png` });
      await page.locator('#open-car-menu').click();
      const carPanel = await page.locator('#car-menu').boundingBox();
      assert.ok(carPanel.x >= 0 && carPanel.x + carPanel.width <= viewport.width);
      assert.ok(carPanel.y + carPanel.height <= viewport.height);
      await page.screenshot({ path: `artifacts/layout-car-menu-${viewport.width}.png` });
      await page.locator('#open-garage').click();
      await page.waitForFunction(() => window.__chillhill?.garage);
      await checkNav(page, true);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: `artifacts/layout-garage-${viewport.width}.png` });
      await selectGarageTool(page, 'paint');
      await page.locator('[data-paint="#426453"]').click();
      await checkNav(page, true);
      await page.locator('#back-drive').click();
      await page.waitForFunction(() => window.__chillhill.view === 'drive');
      await checkDrive(page);
    } finally {
      await page.close();
    }
  }
  console.log(
    'PASS: full-viewport driving and garage, single-row shared nav, in-game controls without overlaps, and garage return on desktop, mobile, narrow mobile, and landscape.',
  );
}
