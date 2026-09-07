import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const tag = (process.env.PERF_TAG || 'current').replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 64);
const cpuRate = Math.max(1, Math.min(6, Number(process.env.PERF_CPU) || 1));
const browser = await chromium.launch({
  channel: process.env.CHROME_CHANNEL || 'chrome',
  headless: true,
});
const errors = [];
const summarize = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
  return {
    count: sorted.length,
    median: q(0.5),
    p95: q(0.95),
    max: q(1),
    over16: values.filter((n) => n > 16.7).length,
    over50: values.filter((n) => n > 50).length,
  };
};
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (error) => errors.push(error.message));
  // Isolate the real driving renderer from the welcome screen's animation loop.
  await page.addInitScript(() => {
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) => (callback.name === 'frame' ? 0 : raf(callback));
  });
  await page.goto(process.env.TEST_URL || 'http://127.0.0.1:5173');
  await page.waitForFunction(() => window.__chillhill?.driveReady);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuRate });
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 250 });
  await cdp.send('Profiler.start');
  const report = [];
  for (const landscape of ['forest', 'city', 'lakes']) {
    await page.evaluate(async (landscape) => {
      const { GameScene } = await import('/src/game/scene.ts');
      const { baseline } = await import('/src/config.ts');
      const { initialState } = await import('/src/game/driving.ts');
      const { initialChallenge } = await import('/src/game/challenge.ts');
      const element = document.createElement('div');
      element.style.cssText = 'position:fixed;inset:0;z-index:1000';
      document.body.append(element);
      const settings = {
        ...baseline,
        seed: 4282,
        landscape,
        season: 'summer',
        timeOfDay: 'day',
        weather: 'clear',
        treeDensity: 1.5,
        roundness: 0.65,
        pixelRatio: 1,
      };
      const state = { ...initialState(), speed: 22 };
      const stats = { chunk: [], traffic: [], debug: [], frames: [], changes: [], gaps: [] };
      const wrappers = [];
      const wrap = (prototype, method, key) => {
        const original = prototype[method];
        prototype[method] = function (...args) {
          const start = performance.now();
          const result = original.apply(this, args);
          stats[key].push(performance.now() - start);
          return result;
        };
        wrappers.push(() => (prototype[method] = original));
      };
      wrap(GameScene.prototype, 'buildChunk', 'chunk');
      const scene = new GameScene(element, settings);
      wrap(Object.getPrototypeOf(scene.traffic), 'update', 'traffic');
      wrap(Object.getPrototypeOf(scene.collisionDebug), 'update', 'debug');
      const challenge = initialChallenge(settings, state);
      scene.render(state, 1 / 60, true, false, true, false, challenge);
      window.__perf = { scene, element, state, settings, challenge, stats, wrappers, frame: 0 };
    }, landscape);
    const heaps = [];
    for (let batch = 0; batch < 3; batch++) {
      const result = await page.evaluate(async () => {
        const p = window.__perf;
        const ids = ['astra', 'renault-12', 'wagon', 'peugeot-206', 'mustang-fastback'];
        const stats = { chunk: [], traffic: [], debug: [], frames: [], changes: [], gaps: [] };
        // Keep wrapper arrays, clearing the samples from initialization/previous batch.
        for (const values of Object.values(p.stats)) values.length = 0;
        let previous = performance.now();
        for (let i = 0; i < 120; i++, p.frame++) {
          await new Promise(requestAnimationFrame);
          const now = performance.now();
          p.stats.gaps.push(now - previous);
          previous = now;
          // Accelerated travel deliberately crosses many generation boundaries.
          p.state.distance += 9;
          if (p.frame % 40 === 0) {
            p.challenge.traffic.shift();
            const id = 7 + p.frame / 40;
            p.challenge.traffic.push({
              id,
              car: ids[id % ids.length],
              color: '#879ea8',
              offset: 2.5,
              speed: 10,
              lane: 1,
              passed: false,
              distance: p.state.distance + 500,
            });
          }
          p.challenge.traffic.forEach(
            (car, index) => (car.distance = p.state.distance + 40 + index * 60),
          );
          const start = performance.now();
          p.scene.render(p.state, 1 / 60, true, false, true, false, p.challenge, i >= 80);
          p.stats.frames.push(performance.now() - start);
        }
        Object.assign(stats, p.stats);
        return {
          stats,
          resources: { ...p.scene.environment, textures: p.scene.renderer.info.memory.textures },
          streaming: p.scene.environment.terrainPrefetch ?? null,
          trafficPool: p.scene.traffic?.telemetry ?? null,
        };
      });
      await cdp.send('HeapProfiler.collectGarbage');
      const heap = await cdp.send('Runtime.getHeapUsage');
      heaps.push({
        usedMB: heap.usedSize / 1048576,
        backingMB: (heap.backingStorageSize ?? 0) / 1048576,
      });
      report.push({
        landscape,
        batch,
        heap: heaps.at(-1),
        resources: result.resources,
        streaming: result.streaming,
        trafficPool: result.trafficPool,
        ...Object.fromEntries(
          Object.entries(result.stats).map(([key, values]) => [key, summarize(values)]),
        ),
      });
    }
    await page.evaluate(() => {
      const p = window.__perf;
      p.scene.dispose();
      p.element.remove();
      p.wrappers.forEach((restore) => restore());
      delete window.__perf;
    });
  }
  const { profile } = await cdp.send('Profiler.stop');
  const samples = new Map();
  profile.samples?.forEach((id, i) =>
    samples.set(id, (samples.get(id) || 0) + (profile.timeDeltas[i] || 0)),
  );
  const hottest = profile.nodes
    .map((node) => ({
      name: node.callFrame.functionName,
      url: node.callFrame.url,
      selfMs: (samples.get(node.id) || 0) / 1000,
    }))
    .filter((item) => item.name !== '(idle)')
    .sort((a, b) => b.selfMs - a.selfMs)
    .slice(0, 25);
  await mkdir('artifacts', { recursive: true });
  await writeFile(
    `artifacts/performance-${tag}.json`,
    JSON.stringify({ cpuRate, report, hottest }, null, 2),
  );
  await writeFile(`artifacts/performance-${tag}.cpuprofile`, JSON.stringify(profile));
  console.table(
    report.map((r) => ({
      scene: r.landscape,
      batch: r.batch,
      median: r.frames.median.toFixed(1),
      p95: r.frames.p95.toFixed(1),
      max: r.frames.max.toFixed(1),
      over50: r.frames.over50,
      trafficMax: r.traffic.max.toFixed(1),
      chunkMax: r.chunk.max.toFixed(1),
      heapMB: r.heap.usedMB.toFixed(2),
      hits: r.streaming?.hits ?? '-',
    })),
  );
  console.log(
    `CPU throttle: ${cpuRate}×. Report and Chrome CPU profile: artifacts/performance-${tag}.*`,
  );
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
