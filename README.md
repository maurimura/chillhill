# chillhill

Renamed to **chillhill** throughout the game, package metadata, exports, and development tools. Existing browser settings and named scenes are automatically copied to the new storage keys without deleting the original backups; older scene files remain importable. New exports use `chillhill.settings.json` and `chillhill.scene.json`.

A small browser game about taking the scenic route. Drive a low-poly Chevrolet Astra downhill through a procedural landscape, with a gentle chase camera and forgiving drift. Switch to the Astra sedan or the original Hillside Wagon whenever you like. Built with TypeScript, Three.js, and Vite. No backend or downloaded 3D assets required.

## Run it

Requires Node.js 22.18+ (or 24+) and npm.

```sh
npm install
npm run dev
```

Open the URL Vite prints. To play on a phone, connect it to the same Wi-Fi and open the printed network URL. The development server listens on your local network. Desktop production output is the same responsive app used on mobile:

```sh
npm run build
npm run preview
```

Deploy the generated `dist/` directory to a static host. The game requires WebGL 2. Fonts are bundled locally; playing makes no external asset requests.

## One-handed controls

| Action               | Left hand | Arrow keys |
| -------------------- | --------- | ---------- |
| Steer                | A / D     | ← / →      |
| Accelerate           | W         | ↑          |
| Brake and hold still | S         | ↓          |

Hold **V** for a front-facing exterior camera looking back at your car. Release it to return immediately to the chase camera. Steering and pedals stay unchanged. Pausing, opening settings, or leaving the window returns to the chase view.

Both driving cameras follow relative to the car, so accelerating cannot close the camera gap. They ease farther out as speed rises; the front view also adds drift clearance and aims at the visible car's center. An aspect-ratio-aware framing check keeps the full model inside a padded screen area, pulling back immediately when needed and easing back in afterward.

Space also brakes. Enter starts, Esc or P pauses, and R returns to the top. Mobile has a single thumb pad: slide left/right to steer, up to accelerate, or hold down to brake. Diagonals combine steering with a pedal using one thumb. Lifting your thumb resumes coasting. The car eases toward its coasting speed automatically. Hold acceleration to reach the configured top speed; release it to settle back to cruising. Braking always overrides acceleration, reaches exactly zero, and holds the car stationary until released. Changing tabs or windows pauses the drive.

This prototype uses assisted, road-relative arcade driving: the car follows the road direction while you control lateral movement. The rear swings around the front axle with a damped yaw response and retained sideways momentum. Release steering or countersteer to let the tail settle; drifting preserves downhill speed. Soft road edges account for the swinging rear bumper. A held brake freezes both translation and rotation. It is a foundation for testing the feel, not a full tire/suspension simulation.

The descent is endless: road, terrain, and scenery generate ahead of you, with no finish line or automatic reset. Seeded bends join continuously in position, direction, and curvature. The HUD counts total distance traveled and previews the next stretch of road. R or the restart button starts a fresh drive from the top.

Stronger rear slip produces soft tire-smoke puffs from both rear wheels. Smoke stays in world space behind the car, expands, and fades. The effect uses an 80-puff pool and one draw call, pauses with the drive, and clears on restart or world changes. **Tire smoke** adjusts the amount; zero turns off emission.

## Make it your own

The transparent in-game toolbar has three customization icons:

- **Car:** switch rides in place, or choose **Visit the garage** for paint and close-up work.
- **Weather:** open **The scenery** for preset worlds, landscape, season, time of day, and weather. The icon reflects the current conditions.
- **Sliders:** open **Advanced settings** for art, shape softness, road style, wind/intensity, driving feel, rendering quality, and saved scenes.

Quick menus float over the road without a backdrop or navigation away. Close them with the same icon, the close button, Escape, or a click outside. Driving input is cleared and the journey pauses while editing, then resumes unless you had already paused it. Settings are saved to this browser; **Restore defaults** reloads the configured startup defaults. **Export settings** downloads a full settings snapshot for reference. Use the separate **Export scene / Import scene** controls in Advanced settings for reusable scenery recipes.

### World composer

Start with **Summer Coast**, **Coastal Rain**, or the original **Greenridge Pass**, then change ingredients independently:

- **Landscape & season:** highlands or a coast with open water to the right and inland shrubs/hills to the left; summer, autumn, or winter ground and vegetation. Snow cover and falling snow are separate choices.
- **Light & weather:** daylight, sunset, blue hour, or moonlight; clear, overcast, rain, or snow, with intensity and wind controls. Lighting eases between moods, moonlight automatically enables headlights, and rain adds a damp sheen to asphalt. A bounded pool of at most 600 particles handles precipitation; it freezes while paused or in the garage. The synthesized ambience responds to wind, rain, and the coast when sound is enabled.
- **The road:** asphalt or granular gravel, dashed/double/no markings, guide posts or guardrails. Curves, width, grade, terrain height, density, fog, and shape softness remain independently adjustable below. Weather and surfaces are visual: there is no new ice penalty, traction loss, collision behavior, or change to the one-handed drift assistance.
- **The art palette:** Salt & sun, Alpine morning, Golden hour, and Lavender dusk provide colors independently of landscape and time. A preset loads a coherent combination; changing an individual control never reloads the rest of the preset.

The sea is deliberately stylized: its surface follows the same endless downhill grade, 18 meters below the road, rather than using a fixed real-world sea level. The shoreline, waves, and guardrails join across streamed chunks, in both camera directions. The coast keeps the seven-chunk budget and floating origin, including far beyond 10,000 km. Light, fog, wind, and precipitation changes do not rebuild the road; terrain/season/road-geometry changes rebuild the surroundings while the settings panel has the drive paused.

Under **Keep this little world**, name a mix and **Save a copy**. Up to 24 named copies are stored separately from your current settings. Load or remove a selected copy; removing it does not change the active world. **Export scene** downloads a versioned `chillhill.scene.json`; **Import scene** validates a file before applying it. Imported worlds are immediately saved as the current settings; use Save a copy to add one to your named shelf. Scene files include only scenery ingredients—not cars, paint, handling, rendering quality, or journey progress. Invalid formats/choices are rejected, numeric settings are clamped to their supported ranges, and files are limited to 64 KB. Export still works if browser storage is unavailable.

This is the first world-composer slice. Winter coloration and snowfall can be mixed into either landscape, but a dedicated forest biome and city-outskirts buildings/streetlights are not implemented yet.

Configuration and extension points:

- `src/config/scenes.json`: built-in recipes, automatically included in the picker. Duplicate an entry and change its ingredients to add a combination without renderer changes.
- `src/config/world.ts`: supported independent choices and validation. `src/config/scenes.ts`: scene-file format and scenery-only snapshots.
- `src/game/atmosphere.ts`: seasonal colors and lighting/weather composition. `src/game/coast.ts`: shared animated water material and streamed sea geometry. `src/game/weather.ts`: bounded precipitation pool.
- `src/world-composer.ts` and `.css`: in-game editing and the local scene shelf. A genuinely new biome or effect still needs a renderer component before it can be selected in configuration.

For startup defaults, set `VITE_SCENE=summer-coast` (also `coastal-rain` or `greenridge`) or use the individual `VITE_LANDSCAPE`, `VITE_SEASON`, `VITE_TIME_OF_DAY`, `VITE_WEATHER`, `VITE_WEATHER_INTENSITY`, `VITE_WIND`, `VITE_ROAD_SURFACE`, `VITE_ROAD_MARKINGS`, and `VITE_ROADSIDE` variables. Explicit ingredient variables override a startup recipe. Stored browser settings override startup defaults; choose Restore defaults to apply changed environment values. Existing saves inherit the new ingredients without losing their original car, art palette, paint, or driving settings.

## The garage

Open the **car icon → Visit the garage**, or go directly to `/#garage` to work on cars without starting the driving scene. It's a separate, stationary workshop with neutral lighting, a turntable, and no terrain generation or driving simulation.

- Drag to orbit; scroll or pinch to zoom. Front, side, rear, and three-quarter view buttons make comparisons repeatable. **Slow spin** rotates the view; **Reset view** stops it and restores the inspection angle.
- Choose a paint swatch, use the custom color picker, or enter a six-digit hex color. Paint is saved **per car** and used on the road too. **Reset paint** restores only that car's original catalog/palette color; changing atmosphere does not override custom paint.
- Adjust **Shape softness** or toggle **Wireframe** to inspect the same procedural geometry used in the game. Softness is shared with the world; wireframe and spin are inspection tools only.
- **Back to the hillside** keeps the current drive's progress and speed. Driving input is disabled in the garage. Browser Back/Forward also switch views. Garage GPU resources are released when leaving.

`src/game/garage.ts` owns the independent 3D scene; `src/garage.ts` and `src/garage.css` own its UI. Both scenes use `buildVehicle` from `src/game/vehicles.ts`. Add a catalog entry in `src/config/cars.ts` and its model builder to make it available in the garage and the game. Keep `/#garage` open while editing model code for a focused iteration loop. This is a code-based model workbench, not a mesh editor/importer.

Paint overrides live in the saved settings' `paint` object (`astra`, `astra-sedan`, `wagon` → `#rrggbb` or `null`). They are included in **Export settings**. `src/config/paint.ts` validates colors and migrates older saves to original paint.

## Cars and scenery

**Choose your ride** offers the Chevrolet Astra five-door hatchback (default), Astra sedan, and original Hillside Wagon. Switching keeps your distance, speed, and landscape; road-edge clearance, the front-axle drift pivot, wheel rotation, and rear smoke emitters adapt to the selected car. Old smoke clears when swapping. The Astra models use Argentine factory proportions with simplified bodywork, sloping glass, Chevrolet bowties, five-spoke wheels, and separate rear-light/trunk shapes. They share the relaxing arcade handling, not a real powertrain simulation. See [vehicle specifications and customization](docs/vehicles.md).

**Shape softness** works independently of the atmosphere: 0% restores angular low poly; 100% gives rounded car edges, plump tree crowns, rounded rocks and mountains, and smooth terrain shading. Intermediate values blend silhouette and shading softness. The default is 65%. Smooth terrain shares normals across chunk boundaries, and the road keeps its original route and height. Shapes and colors can change without restarting the descent.

Separate layers keep experimentation manageable:

- `src/config/styles.json`: art presets. Edit colors, light, fog color, car paint, location text, and vegetation (`pine` or `round`). Add another complete preset here and the picker includes it automatically.
- `src/config.ts`: default world, driving, and rendering parameters, environment overrides, validation, and persistence.
- `src/config/cars.ts`: vehicle catalog, dimensions, axle positions, and paint. `src/game/vehicles.ts`: procedural car models, with independently disposable geometry and textures. Astra paint uses its own base color with a subtle atmosphere tint; the wagon follows the palette directly.
- `src/game/art.ts`: adjustable shape geometry and terrain shading. `src/game/route.ts` defines the route and terrain height; `src/game/scene.ts` assembles models and the chase camera. `src/game/smoke.ts` owns the rear-tire effect. These can evolve independently of input and driving physics.

Copy `.env.example` to `.env.local` and adjust the `VITE_` variables for startup defaults. Restart the dev server after changing them; production defaults are captured when building. Speeds are km/h, width is meters, grade is a ratio (0.09 = 9%), and seed is an integer. Stored browser choices override these defaults until **Restore defaults** is clicked. All `VITE_` values are public browser configuration, so never put secrets in them. See [Vite's environment variable documentation](https://vite.dev/guide/env-and-mode).

`VITE_SHAPE_SOFTNESS` and `VITE_TIRE_SMOKE` both accept 0–1. `VITE_CAR` accepts `astra`, `astra-sedan`, or `wagon`. Older saved settings automatically inherit defaults for the new controls, including the default Astra.

The road and terrain share a height function to avoid gaps; scenery is seeded and generated in seven resident chunks as you descend. GPU geometry and instance buffers are disposed as chunks leave view. Chunk vertices use local coordinates, and the scene rebases around the car every 180 meters to retain precision on long drives. Camera and smoke shift together, so existing tire trails remain in place. Rendering resolution is capped, trees and rocks use instancing, and render quality is adjustable for mobile. Art or terrain changes regenerate the current surroundings, preserving your progress.

## Verify

```sh
npm test
npm run build
# With the dev server running and Google Chrome installed:
npm run test:browser
# Focused world-composer rendering, file round trips, and coastal streaming:
npm run test:world
```

The unit suite verifies vehicle dimensions and road clearance, cruise behavior, the speed cap, brake priority, exact stationary holding, restarting after braking, drift, forgiving edges, frame-rate consistency, downhill terrain, and seeded scenery. Browser checks cover desktop and emulated mobile input, car switching/persistence/resource disposal, axle positions, settings/export, pause, endless streaming, and car close-up screenshots. Browser automation uses an isolated Chrome profile. Physical-device Safari and Android performance still need hands-on playtesting.

Development builds expose a read-only snapshot at `window.__chillhill` for local checks. It is absent from production builds.
