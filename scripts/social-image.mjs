import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

// Re-render the real game, not an invented car/landscape or a downloaded image.
const origin = process.env.TEST_URL || 'http://127.0.0.1:5173';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
await mkdir('public/social', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  // Block the normal app only in this isolated renderer page; import its scene below.
  await page.route('**/src/main.ts', (route) => route.abort());
  await page.goto(origin);
  await page.evaluate(async () => {
    await import('/src/style.css');
    await import('/node_modules/@fontsource-variable/dm-sans/index.css');
    await import('/node_modules/@fontsource/dm-serif-display/latin-400.css');
    await import('/node_modules/@fontsource/dm-serif-display/latin-400-italic.css');
    document.body.innerHTML = `<div id="view"></div><section id="cover"><div class="social-brand"><img src="/favicon.svg" width="72" height="72"/><span>chillhill</span></div><div><p class="kicker">A LITTLE DOWNHILL ESCAPE</p><h1>Take the<br/><em>scenic route.</em></h1><p class="copy">A relaxing 3D driving game.<br/>Endless roads. Your own pace.</p></div><div class="social-bottom"><span>FREE · PLAY IN YOUR BROWSER</span><span>↗</span></div></section>`;
    const style = document.createElement('style');
    style.textContent = `*{box-sizing:border-box}body{margin:0;background:#eff0e5;color:#344539;overflow:hidden}#view{position:absolute;inset:0 0 0 365px}#cover{position:absolute;inset:0 auto 0 0;width:465px;padding:38px 34px 32px 38px;background:#f3f1e7;border-radius:0 32px 32px 0;display:flex;flex-direction:column;justify-content:space-between;box-shadow:14px 0 40px #273c2314}.social-brand{display:flex;align-items:center;gap:14px;font:700 48px 'DM Sans Variable',sans-serif;letter-spacing:-2px}.social-brand img{border-radius:18px}.kicker{font:600 10px 'DM Sans Variable',sans-serif;letter-spacing:3px;color:#647555;margin:0 0 20px}#cover h1{font:400 65px/.99 'DM Serif Display',Georgia,serif;letter-spacing:-2px;margin:0}#cover em{color:#61734c;font-weight:400;white-space:nowrap}.copy{font:400 18px/1.7 'DM Sans Variable',sans-serif;margin:24px 0 0;color:#65715e}.social-bottom{display:flex;justify-content:space-between;align-items:center;border-top:1px solid #cbd1bf;padding-top:18px;font:600 10px 'DM Sans Variable',sans-serif;letter-spacing:2px}.social-bottom span:last-child{font-size:27px;line-height:1}`;
    document.head.append(style);
    const [{ GameScene }, { baseline, normalizeSettings }, { initialState }] = await Promise.all([
      import('/src/game/scene.ts'),
      import('/src/config.ts'),
      import('/src/game/driving.ts'),
    ]);
    const settings = normalizeSettings(
      {
        seed: 42,
        car: 'astra',
        landscape: 'coast',
        style: 'coastal',
        timeOfDay: 'day',
        weather: 'clear',
        treeDensity: 0.45,
        terrainHeight: 0.65,
        fog: 0.2,
        curves: 0.7,
        grade: 0.06,
        roundness: 0.7,
        roadside: 'barriers',
        autoTime: false,
        autoWeather: false,
      },
      baseline,
    );
    const scene = new GameScene(document.querySelector('#view'), settings);
    const state = { ...initialState(), distance: 125, speed: 0, slide: -0.1 };
    window.__socialScene = scene;
    await document.fonts.ready;
    await new Promise(requestAnimationFrame);
    scene.render(state, 1 / 60, true, false, false);
    window.__renderSocial = () => scene.render(state, 1 / 60, true, false, false);
  });
  await page.evaluate(() => window.__renderSocial());
  // Keep previous versions available to links whose previews are still cached.
  await page.screenshot({ path: 'public/social/chillhill-coast-v2.png' });
  await page.evaluate(() => {
    window.__socialScene.dispose();
    document.body.innerHTML =
      '<img src="/favicon.svg" style="display:block;width:180px;height:180px"/>';
  });
  await page.setViewportSize({ width: 180, height: 180 });
  await page.locator('img').evaluate((img) => img.decode());
  await page.screenshot({ path: 'public/social/chillhill-icon.png' });
  await page.setViewportSize({ width: 32, height: 32 });
  await page.locator('img').evaluate((img) => {
    img.style.width = '32px';
    img.style.height = '32px';
  });
  await page.screenshot({ path: 'public/social/chillhill-favicon.png' });
  console.log(
    'Rendered 1200×630 coastal social card, 180×180 logo and 32×32 PNG favicon from the game assets.',
  );
} finally {
  await browser.close();
}
