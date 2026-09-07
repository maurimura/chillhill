import assert from 'node:assert/strict';

/** Mode choices are actions: no separate start/confirmation button. */
export async function checkModeEntry(browser, origin, errors) {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
    { width: 320, height: 640 },
    { width: 844, height: 390 },
  ]) {
    const mobile = viewport.width < 650 || viewport.height < 500;
    const page = await browser.newPage({ viewport, isMobile: mobile, hasTouch: mobile });
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      await page.goto(origin);
      await page.waitForFunction(() => window.__chillhill?.driveReady);
      await page.evaluate(() => document.fonts.ready);
      const assertChoice = async (id) => {
        assert.equal(await page.evaluate(() => document.activeElement?.id), id);
        assert.equal(await page.locator('#intro [data-selected="true"]').count(), 1);
        assert.equal(await page.locator(`#${id}`).getAttribute('data-selected'), 'true');
        assert.equal(await page.evaluate(() => window.__chillhill.started), false);
        assert.equal(
          await page.evaluate(() => window.__chillhill.mode),
          'cozy',
          'moving focus must not start or change the actual driving mode',
        );
      };
      await assertChoice('start');
      assert.equal(
        await page.locator('#start').evaluate((el) => getComputedStyle(el).animationName),
        'welcome-glow',
      );
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const reducedStyle = await page.locator('#start').evaluate((el) => {
        const style = getComputedStyle(el);
        return {
          animation: style.animationName,
          shadow: style.boxShadow,
          fill: style.backgroundColor,
        };
      });
      assert.equal(reducedStyle.animation, 'none');
      assert.notEqual(reducedStyle.shadow, 'none', 'reduced motion keeps a steady highlight');
      assert.equal(reducedStyle.fill, 'rgb(199, 214, 183)');
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      assert.equal(await page.locator('#intro button').count(), 2);
      assert.deepEqual(await page.locator('#intro button strong').allTextContents(), [
        'Easy drive',
        'Drift king',
      ]);
      assert.equal(
        await page.locator('#intro [aria-pressed]').count(),
        0,
        'entry buttons are actions, not a selection that needs confirmation',
      );
      for (const mode of ['cozy', 'challenge']) {
        const rect = await page.locator(`#intro [data-mode="${mode}"]`).boundingBox();
        assert.ok(
          rect &&
            rect.x >= 0 &&
            rect.y >= 0 &&
            rect.x + rect.width <= viewport.width &&
            rect.y + rect.height <= viewport.height,
        );
      }
      await page.screenshot({
        path: `artifacts/mode-entry-${viewport.width}.png`,
        animations: 'disabled',
      });
      for (const [key, choice] of [
        ['ArrowRight', 'start-challenge'],
        ['ArrowRight', 'start'],
        ['ArrowLeft', 'start-challenge'],
        ['ArrowUp', 'start'],
        ['ArrowDown', 'start-challenge'],
      ]) {
        await page.keyboard.press(key);
        await assertChoice(choice);
      }
      await page.keyboard.down('ArrowRight');
      await assertChoice('start');
      await page.keyboard.down('ArrowRight');
      await assertChoice('start'); // Holding an arrow doesn't flicker back and forth.
      await page.keyboard.up('ArrowRight');
      await page.keyboard.press('Tab');
      await assertChoice('start-challenge');
      await page.keyboard.press('Shift+Tab');
      await assertChoice('start');
      await page.keyboard.press('Shift+Tab');
      assert.equal(
        await page.evaluate(() => document.activeElement?.id),
        'github-link',
        'Tab is not trapped in the mode choices',
      );
      await page.keyboard.press('ArrowRight');
      assert.equal(await page.evaluate(() => document.activeElement?.id), 'github-link');
      await page.keyboard.press('Tab');
      await page.keyboard.press('ArrowRight');
      await assertChoice('start-challenge');

      await page.locator('#open-settings').click();
      await page.locator('#units').selectOption('metric');
      await page.locator('#drift').focus();
      const drift = Number(await page.locator('#drift').inputValue());
      await page.keyboard.press('ArrowLeft');
      assert.ok(
        Number(await page.locator('#drift').inputValue()) < drift,
        'settings sliders still use arrows normally',
      );
      assert.equal(await page.evaluate(() => document.activeElement?.id), 'drift');
      assert.equal(
        await page.locator('#start-challenge').getAttribute('data-selected'),
        'true',
        'settings refresh preserves the welcome choice',
      );
      assert.equal(await page.evaluate(() => window.__chillhill.started), false);
      await page.locator('#close-settings').click();
      await page.waitForFunction(() => !document.querySelector('#settings-dialog').open);
      await page.locator('#open-car-menu').click();
      await page.keyboard.press('ArrowRight');
      assert.equal(await page.evaluate(() => document.activeElement?.id), 'close-car-menu');
      await page.keyboard.press('Enter'); // Native close-button action, never launches a drive.
      assert.equal(await page.evaluate(() => window.__chillhill.started), false);
      await page.locator('#start-challenge').focus();
      await assertChoice('start-challenge');
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => window.__chillhill.started && !window.__chillhill.paused);
      assert.equal(await page.evaluate(() => window.__chillhill.mode), 'challenge');
      assert.equal(await page.locator('#intro').isVisible(), false);
      assert.equal(await page.locator('#challenge-hud .eyebrow').innerText(), 'DRIFT KING');

      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#pause-card [data-mode]').count(), 2);
      assert.match(await page.locator('#resume').innerText(), /Drift king/);
      await page.locator('#pause-card [data-mode="cozy"]').click();
      assert.equal(await page.evaluate(() => window.__chillhill.mode), 'cozy');
      assert.equal(await page.evaluate(() => window.__chillhill.paused), false);
      await page.waitForFunction(() => window.__chillhill.state.speed > 0.5);
      await page.keyboard.press('Escape');
      const distance = await page.evaluate(() => window.__chillhill.state.distance);
      await page.locator('#resume').click();
      assert.equal(await page.evaluate(() => window.__chillhill.paused), false);
      assert.ok(
        await page.evaluate((before) => window.__chillhill.state.distance >= before, distance),
        'clicking the current mode resumes rather than restarting',
      );

      await page.keyboard.press('Escape');
      await page.locator('#pause-card [data-mode="challenge"]').focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => window.__chillhill.mode), 'challenge');
      assert.equal(await page.evaluate(() => window.__chillhill.paused), false);
      await page.keyboard.press('Escape');
      await page.locator('#resume').focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => window.__chillhill.paused), false);

      await page.reload();
      await page.waitForFunction(() => window.__chillhill?.driveReady);
      await assertChoice('start');
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => window.__chillhill.mode), 'cozy');
      assert.equal(await page.evaluate(() => window.__chillhill.started), true);

      await page.reload();
      await page.waitForFunction(() => window.__chillhill?.driveReady);
      if (mobile) await page.locator('#start-challenge').tap();
      else await page.locator('#start-challenge').click();
      assert.equal(await page.evaluate(() => window.__chillhill.mode), 'challenge');
      assert.equal(
        await page.evaluate(() => window.__chillhill.started),
        true,
        'one click or tap still launches immediately',
      );

      if (!mobile) {
        await page.reload();
        await page.waitForFunction(() => window.__chillhill?.driveReady);
        await page.keyboard.press('ArrowLeft');
        await page.keyboard.press('Space');
        assert.equal(
          await page.evaluate(() => window.__chillhill.mode),
          'challenge',
          'Space retains native button activation',
        );
        await page.goto(`${origin}/#garage`);
        await page.reload();
        await page.waitForFunction(() => window.__chillhill?.view === 'garage');
        assert.equal(await page.locator('#intro').isVisible(), false);
        assert.notEqual(await page.evaluate(() => document.activeElement?.id), 'start');
        await page.locator('#back-drive').click();
        await page.waitForFunction(() => window.__chillhill?.view === 'drive');
        await assertChoice('start');
      }
    } finally {
      await page.close();
    }
  }
  console.log(
    'PASS: initial Easy drive focus, four-arrow navigation/wrapping, gentle/reduced-motion highlight, normal Tab/settings/garage focus, Enter/Space launch, one-click/tap entry and pause/resume; desktop, portrait and landscape.',
  );
}
