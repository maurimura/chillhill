import assert from 'node:assert/strict';

export async function checkRename(browser, origin, errors) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', (error) => errors.push(error.message));
  const settings = {
    car: 'astra-sedan',
    style: 'coastal',
    paint: { 'astra-sedan': '#123456' },
    landscape: 'coast',
    wind: 0.75,
  };
  const scenes = [
    { name: 'Old favorite', settings: { landscape: 'highlands', style: 'dusk', seed: 17 } },
  ];
  await page.addInitScript(
    ({ settings, scenes }) => {
      if (sessionStorage.getItem('rename-fixture')) return;
      localStorage.setItem('chill-the-hill.settings.v1', JSON.stringify(settings));
      localStorage.setItem('chill-the-hill.scenes.v1', JSON.stringify(scenes));
      sessionStorage.setItem('rename-fixture', 'ready');
    },
    { settings, scenes },
  );
  try {
    await page.goto(`${origin}/#garage`);
    await page.waitForFunction(() => window.__chillhill?.garage);
    assert.match(await page.title(), /^chillhill —/);
    assert.equal(await page.locator('.brand').textContent(), 'chillhill');
    assert.equal(await page.locator('.brand').getAttribute('aria-label'), 'chillhill home');
    assert.equal(await page.evaluate(() => typeof window.__chill), 'undefined');
    assert.equal(await page.evaluate(() => window.__chillhill.garage.paint), '#123456');
    assert.equal(await page.evaluate(() => window.__chillhill.settings.wind), 0.75);
    assert.deepEqual(
      await page.evaluate(() => JSON.parse(localStorage.getItem('chillhill.settings.v1'))),
      settings,
    );
    assert.deepEqual(
      await page.evaluate(() => JSON.parse(localStorage.getItem('chillhill.scenes.v1'))),
      scenes,
    );
    await page.locator('[data-paint="#426453"]').click();
    await page.reload();
    await page.waitForFunction(() => window.__chillhill?.garage);
    assert.equal(await page.evaluate(() => window.__chillhill.garage.paint), '#426453');
    assert.deepEqual(
      await page.evaluate(() => JSON.parse(localStorage.getItem('chill-the-hill.settings.v1'))),
      settings,
    );
    await page.locator('#back-drive').click();
    await page.waitForFunction(() => window.__chillhill.driveReady);
    assert.equal(await page.locator('.brand').textContent(), 'chillhill');
    await page.locator('#open-settings').click();
    await page.locator('#saved-scenes').evaluate((input) => (input.closest('details').open = true));
    await page.locator('#saved-scenes').selectOption('0');
    await page.locator('#load-scene').click();
    assert.equal(await page.evaluate(() => window.__chillhill.settings.seed), 17);
    assert.equal(await page.evaluate(() => window.__chillhill.settings.car), 'astra-sedan');
    assert.equal(
      await page.evaluate(() => window.__chillhill.settings.paint['astra-sedan']),
      '#426453',
    );
    await page.locator('#scene-file').setInputFiles({
      name: 'chill-the-hill.scene.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify({
          format: 'chill-the-hill.scene',
          version: 1,
          name: 'Earlier export',
          settings: { landscape: 'coast', seed: 79 },
        }),
      ),
    });
    await page.waitForFunction(() => window.__chillhill.settings.seed === 79);
    const downloading = page.waitForEvent('download');
    await page.locator('#export-scene').click();
    const download = await downloading;
    assert.equal(download.suggestedFilename(), 'chillhill.scene.json');
    const chunks = [];
    for await (const chunk of await download.createReadStream()) chunks.push(chunk);
    const file = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    assert.equal(file.format, 'chillhill.scene');
    assert.equal(file.settings.seed, 79);
    assert.deepEqual(
      await page.evaluate(() => JSON.parse(localStorage.getItem('chill-the-hill.scenes.v1'))),
      scenes,
    );
    console.log(
      'PASS: chillhill branding, renamed exports/telemetry, legacy settings/paint/scene migration, new-save precedence, and earlier scene imports.',
    );
  } finally {
    await page.close();
  }
}
