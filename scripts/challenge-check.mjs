import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { checkContrast } from './readability-check.mjs';

export async function checkChallenge(browser, origin, errors) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem(
      'chillhill.settings.v1',
      JSON.stringify({
        landscape: 'city',
        timeOfDay: 'sunset',
        weather: 'clear',
        roadWidth: 14,
        curves: 0.2,
        // Preserve this scripted passing driver's original speed envelope.
        // The 280 km/h cap has separate physics, touch and camera checks.
        maxSpeed: 110,
        autoTime: false,
        autoWeather: false,
      }),
    );
    const request = window.requestAnimationFrame.bind(window);
    const cancel = window.cancelAnimationFrame.bind(window);
    const callbacks = new Map();
    let serial = -1,
      time;
    window.requestAnimationFrame = (callback) => {
      if (callback.name !== 'frame') return request(callback);
      const id = serial--;
      callbacks.set(id, callback);
      return id;
    };
    window.cancelAnimationFrame = (id) => (id < 0 ? callbacks.delete(id) : cancel(id));
    window.__challengeFrame = (seconds = 1 / 30) => {
      if (!callbacks.size) throw new Error('The app frame was not captured');
      time = (time ?? performance.now()) + seconds * 1000;
      const pending = [...callbacks.values()];
      callbacks.clear();
      pending.forEach((callback) => callback(time));
    };
    window.__challengeAdvance = (seconds, stopAtIncident = false) => {
      for (let i = 0; i < Math.ceil(seconds * 30); i++) {
        window.__challengeFrame();
        if (stopAtIncident && window.__chillhill.challenge?.phase !== 'racing') break;
      }
    };
  });
  const snapshot = () => page.evaluate(() => window.__chillhill);
  const advance = async (seconds, stopAtIncident = false) => {
    await page.evaluate(
      ({ seconds, stopAtIncident }) => window.__challengeAdvance(seconds, stopAtIncident),
      { seconds, stopAtIncident },
    );
    return snapshot();
  };
  const leaveRoad = async (keepHeld = false) => {
    await page.keyboard.down('w');
    await page.keyboard.down('d');
    const result = await advance(10, true);
    if (!keepHeld) {
      await page.keyboard.up('d');
      await page.keyboard.up('w');
    }
    assert.equal(result.challenge.phase, 'falling');
    return result;
  };
  try {
    await page.goto(origin);
    await page.waitForFunction(() => window.__chillhill?.driveReady);
    await page.locator('#start').click();
    const cozy = await advance(4);
    assert.equal(cozy.mode, 'cozy');
    assert.ok(cozy.state.speed > 5);
    assert.equal(cozy.environment.trafficCars, 0);
    await page.keyboard.press('Escape');
    await page.locator('#pause-card [data-mode="challenge"]').click();
    assert.equal((await snapshot()).paused, false, 'one click switches modes and starts driving');
    const initialTraffic = (await snapshot()).challenge.traffic;
    const idle = await advance(3);
    assert.equal(idle.mode, 'challenge');
    assert.equal(idle.state.speed, 0, 'challenge never accelerates for the player');
    assert.equal(idle.challenge.lives, 3);
    assert.equal(idle.state.offset, idle.settings.roadWidth / 4, 'start safely in the right lane');
    for (const vehicle of idle.challenge.traffic) {
      const previous = initialTraffic.find((car) => car.id === vehicle.id);
      assert.equal(
        Math.sign(vehicle.distance - previous.distance),
        vehicle.lane,
        'both traffic directions move correctly',
      );
    }
    assert.equal(idle.environment.trafficCars, 7);
    assert.ok(await page.locator('#challenge-hud').isVisible());

    const firstFall = await leaveRoad();
    assert.equal(firstFall.challenge.lives, 2);
    await page.keyboard.press('Escape');
    const paused = await snapshot();
    await advance(4);
    assert.deepEqual(
      (await snapshot()).challenge,
      paused.challenge,
      'pause freezes incident recovery and traffic',
    );
    await page.keyboard.press('Enter');
    await advance(0.7);
    await page.screenshot({ path: 'artifacts/challenge-fall.png' });
    const recovered = await advance(1);
    assert.equal(recovered.challenge.phase, 'racing');
    assert.equal(recovered.challenge.lives, 2);
    assert.equal(recovered.state.speed, 0);
    assert.equal(recovered.state.offset, recovered.settings.roadWidth / 4);
    assert.ok(recovered.challenge.graceRemaining > 0);

    await page.locator('#open-car-menu').click();
    const menu = await snapshot();
    await advance(5);
    assert.deepEqual((await snapshot()).challenge, menu.challenge, 'menus freeze the run');
    await page.locator('[data-car="renault-12"]').click();
    await page.locator('#open-garage').click();
    await page.waitForFunction(() => window.__chillhill.view === 'garage');
    const garage = await snapshot();
    await advance(5);
    assert.deepEqual((await snapshot()).challenge, garage.challenge, 'garage freezes the run');
    await page.locator('#back-drive').click();
    await page.waitForFunction(() => window.__chillhill.view === 'drive');
    await advance(3);
    assert.equal((await snapshot()).challenge.lives, 2, 'car changes do not cost a life');

    assert.equal((await leaveRoad(true)).challenge.lives, 1);
    const heldRecovery = await page.evaluate(() => {
      for (let i = 0; i < 60 && window.__chillhill.challenge.phase !== 'racing'; i++)
        window.__challengeFrame(0.05);
      return window.__chillhill;
    });
    assert.equal(heldRecovery.challenge.phase, 'racing');
    assert.equal(
      heldRecovery.state.speed,
      0,
      'the old held throttle cannot leak into the respawn frame',
    );
    assert.equal(heldRecovery.state.offset, heldRecovery.settings.roadWidth / 4);
    await page.keyboard.up('d');
    await page.keyboard.up('w');
    await advance(3);
    assert.equal((await leaveRoad()).challenge.lives, 0);
    await advance(2);
    const over = await snapshot();
    assert.equal(over.challenge.phase, 'gameover');
    assert.equal(over.paused, true);
    assert.ok(over.runResult, 'completed runs produce a scoreboard record');
    assert.equal(over.runResult.record.score, Math.round(over.challenge.score.points));
    assert.equal(
      over.runResult.record.category,
      'custom',
      'the wider, gentler test road is Custom',
    );
    assert.equal(await page.locator('#run-results').isVisible(), true);
    const savedRunCount = () =>
      page.evaluate(async () => {
        const { scoreStorageKey } = await import('/src/scoreboard.ts');
        return JSON.parse(localStorage.getItem(scoreStorageKey)).records.length;
      });
    assert.equal(await savedRunCount(), 1);
    assert.match(await page.locator('#resume').innerText(), /Try again/);
    await advance(10);
    assert.equal(await savedRunCount(), 1, 'the same game-over run is not saved every frame');
    assert.equal((await snapshot()).challenge.lives, 0, 'game over never revives itself');
    await page.screenshot({ path: 'artifacts/challenge-gameover.png' });
    await page.keyboard.press('Enter');
    await advance(3);
    assert.equal((await snapshot()).challenge.lives, 3);
    assert.equal((await snapshot()).state.speed, 0);

    // A deterministic test driver uses the same key events as the player. It
    // keeps an open passing lane, then deliberately lines up with slower traffic.
    const driveTo = async (collide, lane = 1, close = true) =>
      page.evaluate(
        async ({ collide, lane, close }) => {
          const { roadAt } = await import('/src/game/route.ts');
          const { cars } = await import('/src/config/cars.ts');
          const press = (key, down) =>
            window.dispatchEvent(
              new KeyboardEvent(down ? 'keydown' : 'keyup', {
                code: `Key${key.toUpperCase()}`,
                key,
                bubbles: true,
              }),
            );
          let passingId;
          for (let i = 0; i < 90 * 30; i++) {
            const game = window.__chillhill;
            const ahead = game.challenge.traffic
              .filter((car) => !car.passed && car.distance > game.state.distance - 5)
              .sort((a, b) => a.distance - b.distance);
            const first = ahead.find((car) => collide || car.lane === lane);
            const oncoming = game.challenge.traffic
              .filter((car) => car.lane === -1 && car.distance > game.state.distance - 12)
              .sort((a, b) => a.distance - b.distance)[0];
            const gap = first ? first.distance - game.state.distance : Infinity;
            if (
              !collide &&
              passingId === undefined &&
              gap < (lane === -1 ? 180 : 20) &&
              (lane === -1 || !oncoming || oncoming.distance - game.state.distance > 150)
            )
              passingId = first.id;
            const passing = passingId !== undefined;
            const passedCar = game.challenge.traffic.find((car) => car.id === passingId);
            const target =
              collide && first
                ? first.offset
                : passing && passedCar
                  ? passedCar.offset -
                    lane *
                      ((cars[game.settings.car].width + cars[passedCar.car].width) / 2 +
                        (close ? 0.35 : 2))
                  : game.settings.roadWidth / 4;
            const following = !collide && lane === 1 && !passing && gap < 27;
            press('w', !following || game.state.speed < first.speed - 0.5);
            press('s', following && game.state.speed > first.speed + 0.5);
            const desired = Math.max(-0.16, Math.min(0.16, (target - game.state.offset) * 0.13));
            const error = desired - (game.state.headingOffset ?? 0);
            const feed = roadAt(game.state.distance, game.settings).curvature * game.state.speed;
            const turn = error * 3 + feed;
            press('a', turn < -0.025);
            press('d', turn > 0.025);
            window.__challengeFrame();
            const next = window.__chillhill;
            if (
              next.challenge.phase !== 'racing' ||
              (!collide && next.challenge.traffic.some((car) => car.id === passingId && car.passed))
            )
              break;
          }
          for (const key of ['w', 'a', 'd', 's']) press(key, false);
          return window.__chillhill;
        },
        { collide, lane, close },
      );
    const clean = await driveTo(false);
    assert.equal(clean.challenge.phase, 'racing', 'a clean passing lane is drivable');
    assert.ok(clean.challenge.overtakes > 0, 'a close, whole-car pass scores');
    assert.ok(clean.challenge.score.points >= 50, 'near misses now award actual points');
    assert.equal(clean.challenge.score.streak, clean.challenge.overtakes);
    assert.equal(clean.challenge.lives, 3);
    await advance(0.1);
    assert.equal(await page.locator('#overtakes').innerText(), String(clean.challenge.overtakes));
    assert.match(await page.locator('#challenge-hud').innerText(), /near misses/);
    assert.equal(
      await page.locator('#score').innerText(),
      Math.round(clean.challenge.score.points).toLocaleString(),
    );
    assert.match(await page.locator('#score-feedback').innerText(), /\+\d+ · Near miss/);
    await page.screenshot({ path: 'artifacts/challenge-driving.png' });
    await page.keyboard.press('r');
    await advance(3);
    const oncomingPass = await driveTo(false, -1);
    assert.equal(oncomingPass.challenge.phase, 'racing');
    assert.equal(oncomingPass.challenge.lives, 3);
    assert.equal(oncomingPass.challenge.overtakes, 1, 'a close oncoming pass also earns a point');
    assert.ok(oncomingPass.challenge.score.points > 100, 'higher player speed raises the bonus');
    await advance(0.1);
    assert.equal(await page.locator('#overtakes').innerText(), '1');
    await page.screenshot({ path: 'artifacts/challenge-oncoming-near-miss.png' });
    await page.keyboard.press('Escape');
    const scored = await snapshot();
    await advance(3);
    assert.deepEqual(
      (await snapshot()).challenge,
      scored.challenge,
      'scoring freezes with the pause card',
    );
    assert.match(await page.locator('#pause-copy').innerText(), /Near misses reward speed/);
    assert.match(await page.locator('#pause-copy').innerText(), /Longer drifts earn more/);
    await page.keyboard.press('Enter');
    await page.locator('#open-car-menu').click();
    const banked = (await snapshot()).challenge.score.points;
    await page.locator('[data-car="astra"]').click();
    assert.equal(
      (await snapshot()).challenge.score.points,
      banked,
      'changing cars preserves banked points',
    );
    assert.equal(
      (await snapshot()).challenge.score.streak,
      0,
      'a safety recenter resets the streak',
    );
    await page.locator('#close-car-menu').click();
    await page.keyboard.press('r');
    await advance(3);
    const wide = await driveTo(false, 1, false);
    assert.equal(wide.challenge.phase, 'racing');
    assert.equal(wide.challenge.lives, 3);
    assert.equal(wide.challenge.overtakes, 0, 'wide overtakes no longer count');
    await page.keyboard.press('r');
    await advance(3);
    const crashed = await driveTo(true);
    assert.equal(crashed.challenge.phase, 'crashed');
    assert.equal(crashed.challenge.lastIncident, 'traffic');
    assert.equal(crashed.challenge.lives, 2);
    assert.equal(crashed.challenge.overtakes, 0);
    await advance(0.1);
    assert.equal(await page.locator('#incident-crash-sign').isVisible(), true);
    assert.equal(await page.locator('#incident-cliff-sign').isVisible(), false);
    assert.equal(await page.locator('#road-recovery-warning').isVisible(), false);
    assert.match(
      await page.locator('#incident-copy').innerText(),
      /Traffic collision · 2 lives left/,
    );
    await checkContrast(page, ['#incident-copy', '#incident-crash-sign']);
    const crashBox = await page.locator('#challenge-message').boundingBox();
    const keys = await page.locator('.driving-guide').boundingBox();
    assert.ok(crashBox.y + crashBox.height <= keys.y - 8);
    await page.screenshot({ path: 'artifacts/challenge-traffic-crash.png' });

    await page.keyboard.press('Escape');
    await page.locator('#pause-card [data-mode="cozy"]').click();
    const back = await advance(4);
    assert.equal(back.challenge, null);
    assert.equal(back.environment.trafficCars, 0);
    assert.ok(back.state.speed > 5, 'returning to Cozy restores automatic coasting');
    assert.equal(await page.locator('#challenge-hud').isVisible(), false);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.keyboard.press('Escape');
    await page.locator('#pause-card [data-mode="challenge"]').click();
    await advance(3);
    const pad = await page.locator('#thumb-pad').boundingBox();
    assert.ok(pad && pad.y + pad.height <= 844, 'the one-thumb pad fits');
    await page.mouse.move(pad.x + pad.width / 2, pad.y + pad.height * 0.2);
    await page.mouse.down();
    assert.ok((await advance(1)).state.speed > 3, 'thumb-up accelerates in Challenge');
    await page.mouse.move(pad.x + pad.width / 2, pad.y + pad.height * 0.85);
    const stopped = await advance(1);
    assert.equal(stopped.state.speed, 0, 'thumb-down holds the brake');
    await page.mouse.up();
    assert.equal(
      (await advance(1)).state.speed,
      0,
      'lifting the thumb does not apply Cozy throttle',
    );
    await page.screenshot({ path: 'artifacts/challenge-mobile.png' });
    const boxes = await page.locator('#challenge-hud, #thumb-pad, #pause').evaluateAll((elements) =>
      elements.map((element) => ({
        id: element.id,
        rect: element.getBoundingClientRect().toJSON(),
      })),
    );
    assert.ok(
      boxes.every(
        ({ rect }) => rect.x >= 0 && rect.right <= 390 && rect.y >= 0 && rect.bottom <= 844,
      ),
    );
    console.log(
      'PASS: Cozy unchanged; Challenge manual throttle, near-miss score, traffic crash, three lives, falling/recovery, safe car change, pause/menu/garage freeze, game over/Enter retry, and mode switching.',
    );
  } finally {
    await page.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await mkdir('artifacts', { recursive: true });
  const browser = await chromium.launch({
    channel: process.env.CHROME_CHANNEL || 'chrome',
    headless: true,
  });
  const errors = [];
  try {
    await checkChallenge(browser, process.env.TEST_URL || 'http://127.0.0.1:5173', errors);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
}
