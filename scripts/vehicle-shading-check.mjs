import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export async function checkVehicleShading(browser, origin, errors) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  try {
    await page.goto(`${origin}/#garage`);
    await page.waitForFunction(() => window.__chillhill?.garage);
    const results = await page.evaluate(async () => {
      const THREE = await import('/node_modules/three/build/three.module.js');
      const { GarageScene } = await import('/src/game/garage.ts');
      const { defaults } = await import('/src/config.ts');
      const { cars } = await import('/src/config/cars.ts');
      const host = document.createElement('div');
      host.id = 'vehicle-shading-check';
      host.style.cssText = 'position:fixed;inset:0;z-index:1000';
      document.body.append(host);
      const scene = new GarageScene(host, defaults);
      const a = new THREE.Vector3(),
        b = new THREE.Vector3(),
        c = new THREE.Vector3(),
        face = new THREE.Vector3(),
        normal = new THREE.Vector3();
      const results = [];
      for (const car of Object.keys(cars)) {
        for (const roundness of [0, 0.25, 0.49, 0.5, 0.51, 0.65, 1]) {
          scene.applySettings({ ...defaults, car, roundness });
          let checked = 0,
            minimumDot = 1;
          scene.scene.getObjectByName('car-body').traverse((mesh) => {
            if (mesh.material?.name !== 'car-paint') return;
            const positions = mesh.geometry.getAttribute('position'),
              normals = mesh.geometry.getAttribute('normal');
            for (let i = 0; i < positions.count; i += 3) {
              a.fromBufferAttribute(positions, i);
              b.fromBufferAttribute(positions, i + 1);
              c.fromBufferAttribute(positions, i + 2);
              // Sample both actual door skins, excluding roof, wheels and end-cap trim.
              const x = (a.x + b.x + c.x) / 3,
                y = (a.y + b.y + c.y) / 3,
                z = (a.z + b.z + c.z) / 3;
              // At zero softness the wagon has just two long door triangles;
              // their centroids lie beyond the smaller central patch used for the detailed cars.
              const doorDepth = car === 'wagon' ? 0.9 : 0.5;
              if (
                Math.abs(x) < cars[car].width * 0.35 ||
                y < 0.3 ||
                y > 0.85 ||
                Math.abs(z) > doorDepth
              )
                continue;
              face.crossVectors(b.sub(a), c.sub(a));
              if (face.lengthSq() < 1e-16) continue;
              face.normalize();
              for (let vertex = i; vertex < i + 3; vertex++) {
                normal.fromBufferAttribute(normals, vertex);
                if (
                  ![normal.x, normal.y, normal.z].every(Number.isFinite) ||
                  Math.abs(normal.length() - 1) > 1e-4
                )
                  throw Error(`${car}/${roundness}: invalid lighting normal`);
                const dot = normal.dot(face);
                minimumDot = Math.min(minimumDot, dot);
                if (dot < -0.001)
                  throw Error(`${car}/${roundness}: opposing door normals (${dot})`);
                checked++;
              }
            }
          });
          results.push({ car, roundness, checked, minimumDot });
        }
      }
      window.__shadingCheck = { scene, host, defaults };
      return results;
    });
    assert.equal(results.length, 56);
    assert.ok(
      results.every((result) => result.checked > 0),
      `every car and softness samples real door triangles: ${JSON.stringify(results.filter((result) => !result.checked))}`,
    );
    for (const car of [
      'camaro-ss',
      'mustang-fastback',
      'astra',
      'renault-12',
      'peugeot-206',
      'porsche-911',
      'testarossa',
    ]) {
      for (const side of ['right', 'left']) {
        await page.evaluate(
          ({ car, side }) => {
            const { scene, defaults } = window.__shadingCheck;
            scene.applySettings({ ...defaults, car, roundness: 0.5 });
            scene.setView('hero');
            if (side === 'left') {
              scene.camera.position.x *= -1;
              scene.controls.update();
            }
            scene.render(0);
          },
          { car, side },
        );
        await page.waitForTimeout(80);
        await page
          .locator('#vehicle-shading-check')
          .screenshot({ path: `artifacts/shading-${car}-${side}-50.png` });
      }
    }
    await page.evaluate(() => {
      window.__shadingCheck.scene.dispose();
      window.__shadingCheck.host.remove();
      delete window.__shadingCheck;
    });
    console.log(
      `PASS: rendered door normals for all eight cars at seven softness settings (${results.reduce((n, r) => n + r.checked, 0)} vertex checks), plus both garage sides at 50%.`,
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
    await checkVehicleShading(browser, process.env.TEST_URL || 'http://127.0.0.1:5173', errors);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
}
