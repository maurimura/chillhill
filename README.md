# chillhill

Renamed to **chillhill** throughout the game, package metadata, exports, and development tools. Existing browser settings and named scenes are automatically copied to the new storage keys without deleting the original backups; older scene files remain importable. New exports use `chillhill.settings.json` and `chillhill.scene.json`.

A small browser game about taking the scenic route. Drive a low-poly Chevrolet Astra downhill through a procedural landscape, with a gentle chase camera and forgiving drift. Switch between eight customizable cars whenever you like, including the 1969 Camaro SS and 1967 Mustang fastback. Built with TypeScript, Three.js, and Vite. Driving and personal scores work offline; a Cloudflare Worker and D1 database provide worldwide leaderboards. No downloaded 3D assets required.

[GitHub Actions](https://github.com/maurimura/chillhill/actions) tests pull requests
and deploys successful `main` builds to [chillhill.maurimura.dev](https://chillhill.maurimura.dev).
See [CI/CD setup and deployment credentials](docs/cloudflare.md#github-cicd).

## Run it

Fresh players start on the **Sunwashed Coast**, in coastal colors, with a
**110 km/h** top speed. Existing saved settings are respected; **Advanced settings
→ Restore defaults** applies this setup to an existing browser.

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

The game requires WebGL 2. Fonts, cars, and the built-in music playlist are bundled locally. Deploy `dist/` alone for local-only records, or follow [Cloudflare deployment](docs/cloudflare.md) for the full game and online leaderboard at `chillhill.maurimura.dev`. `npm run preview:cloudflare` runs the production build with a local database after the documented setup.

## One-handed controls

| Action               | Left hand | Arrow keys |
| -------------------- | --------- | ---------- |
| Steer                | A / D     | ← / →      |
| Accelerate           | W         | ↑          |
| Brake and hold still | S         | ↓          |

Hold **V** for a front-facing exterior camera looking back at your car. Release it to return immediately to the chase camera. Steering and pedals stay unchanged. Pausing, opening settings, or leaving the window returns to the chase view.

Both driving cameras follow relative to the car, so accelerating cannot close the camera gap. They ease farther out as speed rises; the front view also adds drift clearance and aims at the visible car's center. An aspect-ratio-aware framing check keeps the full model inside a padded screen area, pulling back immediately when needed and easing back in afterward.

Space also brakes. Enter starts or resumes **Keep wandering** (including numpad Enter), Esc or P pauses, and R returns to the top. Enter retains its normal action in menus and text fields. Mobile has a single thumb pad: slide left/right to steer, up to accelerate, or hold down to brake. Diagonals combine steering with a pedal using one thumb. In Easy drive, lifting your thumb resumes automatic coasting. Hold acceleration to reach the configured top speed; release it to settle back to cruising. Drift king instead requires manual acceleration. In both modes, braking overrides acceleration, reaches exactly zero, and holds the car stationary. Changing tabs or windows pauses the drive.

The default **Easy drive** mode uses assisted, road-relative arcade driving: the car follows the road direction while you control lateral movement. The rear swings around the front axle with a damped yaw response and retained sideways momentum. Release steering or countersteer to let the tail settle; drifting preserves downhill speed. Soft road edges account for the swinging rear bumper. A held brake freezes both translation and rotation. It is a foundation for testing the feel, not a full tire/suspension simulation.

On touch screens, **drag anywhere on the game view**: your first contact becomes a neutral origin, left/right steers, up accelerates, and down brakes. Diagonals combine steering and a pedal. A small ring shows that origin; the next touch starts fresh, and the fixed pad remains optional. Menus, buttons, pause screens and the garage keep their normal interactions; a touch that closes a menu never starts steering. Drift king uses **gentle touch heading assistance**: your sideways gesture requests a small lane-change angle instead of continually adding turn. Centering or lifting the thumb settles the heading along the road at your current lateral position, with anticipation to reduce tail overshoot. It does not recenter your lane, clamp road edges, avoid traffic or apply throttle. Smaller angles at speed keep the rear swing subtle. The controller supplies ordinary steering commands to the existing physics; collision boundaries, speed limits and scoring formulas are unchanged, and smoke-based drift points still reflect actual rear slip. Pressing a driving key immediately returns to direct, unassisted keyboard steering, including on tablets. Pedal hysteresis reduces accidental throttle/brake changes, and rotating the device releases held input.

Mobile play uses compact score/lives/speed badges, a generous thumb target, and lower-left recovery/crash signs. Safety warnings take priority over points popups so they do not stack over the road. Secondary route detail is hidden while driving; Easy drive keeps a small distance badge. The garage and desktop keep their full layouts. Run `node scripts/mobile-ux-check.mjs` with local Vite to check touch gestures, rotation, contrast, clear road space and phone/tablet layouts.

### Easy drive or Drift king

The welcome and pause cards contain only **Easy drive** and **Drift king**. Click either to start immediately; on the pause card the current mode resumes your run and the other starts a fresh one. **Easy drive** is unchanged: automatic coasting, forgiving edges, no traffic or lives. **Drift king** retains smooth drifting, but you control acceleration and the car's direction; keyboard steering is unassisted, while touch uses the gentle heading assistance described above. Neither clamps you to the road. Hold W/up (or drag up) to accelerate; releasing the accelerator coasts down slowly.

The Escape/pause card uses the same translucent dark surface and cream/sage text as the HUD. Opening it focuses the current mode's resume button; Tab/Shift+Tab stay within its two choices. Enter activates the focused choice and Escape resumes. The toolbar remains pointer-accessible for changing scenery, cars or music while paused; closing those panels returns focus to the pause card.

Drift king starts with **three lives** and two-way traffic. Keep the whole car on the road and pass close without contact. Small road departures are recoverable: near the edge you have up to **four seconds** to steer back, and the same budget drains faster the farther you stray. A cliff/car pictogram, direction hint, countdown and meter appear above the keyboard legend (above the touch controls on mobile). Both sides share one budget: crossing the road does not reset it. After **five continuous seconds safely on the road**, the budget gradually refills at one second of recovery time per second. A fresh departure interrupts refilling and restarts the cooldown without erasing the spent budget. The indicator shows the cooldown and refill progress, then disappears when full. Losing the budget or crossing the **six-metre outer recovery range** costs one life. Traffic body contact still costs a life immediately, with a distinct crash pictogram in the same HUD position. Both lead to a short recovery, stationary safe respawn and grace period. At zero lives, Enter or the current mode button starts a fresh run. Switching modes or restarting resets the run, not the world clock. Pauses, menus, the garage, and background tabs freeze traffic, off-road countdowns, cooldown/refill, recovery and lives.

Only **near misses**, not ordinary overtakes, earn passing points: pass within **65 cm of another car's actual body** while alongside, then clear the whole vehicle without contact. Both same-direction overtakes and close oncoming passes qualify. Wide passes and tailgating do not. You must be moving at least **15 km/h (about 9 mph)**, stay on the road, and be outside respawn protection throughout the encounter. A crash cancels pending points, including a crash with a different car on the same simulation step. Each traffic vehicle can score only once; recycled cars start fresh. `nearMissDistance` (metres) and `nearMissMinSpeed` (km/h) in `src/config/challenge.ts` tune the window. Proximity reuses the collision body's dimensions, drift pivot, road heading and slope; it does not enlarge the hitbox. The legacy `overtakes` telemetry key reports the near-miss **count**, while `challenge.score` holds points, streak and run statistics.

#### Drift points and scoreboards

On-road drifting earns **20 points per second**, ramping linearly to **60 points per second after eight uninterrupted seconds**. The exact rate is `20 × (1 + 2 × min(driftSeconds / 8, 1))`, integrated without per-frame rounding. Drifting uses the physical rear-slip signal behind the smoke, above 7.2 km/h; disabling visual smoke does not affect scoring. Straightening, stopping, touching the shoulder, incidents and safety recenters reset the drift multiplier without erasing banked points. Pauses freeze it. Results show drift points, total drift time and the longest drift alongside near-miss points and penalties.

The leaderboard is **worldwide only**, available in production builds (the deployed game or local Cloudflare preview), not Vite development. The completed-run panel shows the matching Standard/Custom top ten alongside your score; it stacks on phones. A qualifying run appears as an editable row at its provisional rank, among the leaders: enter a public nickname (2–20 characters) and choose **Save**. There is no separate entry card, local/worldwide switch, or publish modal; leaving the field publishes nothing. Desktop focuses the field automatically; touch screens reveal the row without opening the keyboard until you tap it. The same field stays mounted through refreshes, unit changes and failed saves, and repeated Enter cannot restart the game. Rank is rechecked on submission. Mobile results fit the visible viewport, including browser chrome and keyboard changes; the board scrolls independently, while run details are expandable. Network problems never prevent driving. See [deployment, API safeguards and competitive limitations](docs/cloudflare.md). This is a community board, not authoritative anti-cheat.

Rules v3 uses the 110 km/h Standard cap and `chillhill.scores.v3`. Older v1/v2 records remain untouched at their original keys and in D1; unlike ranked rules are not mixed.

Each completed near miss earns `round(100 × clamp(speedKmh / 60, 0.5, 2) × min(1 + 0.25 × cleanStreak, 2))`. The first pass uses a 1× streak multiplier; each success raises the next bonus by 0.25×, reaching 2× on the fifth pass. There is no combo-expiry timer. Speed is captured when the encounter first qualifies as close, not when the player later clears the car, so accelerating after the risk cannot inflate the award. At 90 km/h, the first five clean bonuses are 150, 188, 225, 263 and 300. Units do not change scoring. There are no passive time/distance points.

Shoulder contact resets the clean streak and deducts **25 points once per departure**, after a **0.15-second debounce**. Further off-road time drains `10 + 20 × min(excursionMetres / 2.5, 1)` points/second: 10 near the edge up to 30 farther out. Only time after the debounce is charged. Brief rejoins and side switches share an entry; a full second back on asphalt rearms the entry penalty without restoring the streak. The existing off-road recovery budget and its separate five-second refill cooldown are unchanged. The score is clamped at zero with no hidden debt. Crashes cost a life and reset the streak, but do not deduct extra points. Banked points survive respawn and car/road changes; safety recenters reset the streak. Pauses, menus, the scoreboard and the garage freeze all scoring and notice timers. No points or penalties accrue during the fall/crash animation or respawn protection.

The HUD shows points, the next-pass streak multiplier, lives, near-miss count, and small bonus/penalty feedback. In production, **click the points** or **View scoreboard** while paused to browse the worldwide Standard/Custom boards. The modal freezes gameplay and contains keyboard focus. At game over the board is already in the results, alongside earned points, shoulder deductions, near misses, best streak, distance and drift statistics. Completed runs save once; restarting, reloading or switching modes abandons an unfinished run. Records include car(s), starting seed, date, distance, moving average/top speed and shoulder time. Metric/imperial affects display only: canonical scoring uses km/h, and regression replays produce identical physics, near-miss awards, drift points, penalties and records even when switching units mid-run.

Two independent categories retain ten records each. **Standard** uses the canonical 110 km/h cap, 10 m road, curves 1, grade 0.09 and drift 0.55; any starting car/seed and cosmetic settings are allowed. Custom or environment-overridden difficulty starts on **Custom**. Changing difficulty, the route seed, or cars during a run permanently tags that run Custom, even if settings are restored. Scenery, paint and units are cosmetic; a scenery recipe that also changes road geometry does count as a difficulty change. Personal records use `chillhill.scores.v3` in this browser; named worldwide entries are stored in Cloudflare D1 and shared across devices. Blocked local storage falls back to a bounded session-only board with a visible warning. Invalid records are rejected, IDs deduplicated, and ties sort by near misses then earlier completion. The server supplies completion time for worldwide tie ordering.

`src/config/scoring.ts` holds all scoring constants, canonical Standard settings and the rules version. `src/game/scoring.ts` is pure fixed-step scoring; `src/scoreboard.ts` handles classification, completed records and bounded private storage (no local leaderboard UI). When changing scoring or ranked challenge physics, version the rules/storage key so unlike records are not mixed. `npm run test:scoreboard` checks development visibility, completed runs, categories, units and responsive summaries; `npm run test:online-scoreboard` covers live-view focus, name entry, rank races and offline states using mocked requests. `npm run test:run-leaderboard` runs real production gameplay through local Cloudflare with intercepted APIs; it never publishes test scores. `npm run test:challenge` exercises real point awards and game-over saving.

Traffic uses the garage's vehicle models in a bounded pool. The **right lane goes downhill with you; the left lane carries oncoming traffic**. Your car starts and respawns on the right. The default pool reserves four cars for your direction and three for oncoming traffic, so recycling cannot gradually eliminate one stream. Approaching cars spawn farther ahead and have larger gaps for readable overtaking opportunities. Models, headlights, road slope and debug/collision footprints face the correct direction. `src/config/challenge.ts` controls lives, traffic count/speed/spacing, scoring, recovery and grace; `src/game/challenge.ts` owns scoring and collision rules, independent of rendering. Weather still does not make grip harder. Changing a road's geometry or swapping cars mid-run returns the car safely to the right lane without taking a life; color and atmosphere changes leave the run alone. This is an arcade road-and-traffic challenge, not a rigid-body crash or terrain-collision simulator.

`offRoadRange`, `offRoadSeconds`, `offRoadMinSeconds`, `offRoadCooldownSeconds` and `offRoadRefillSeconds` tune recovery in `src/config/challenge.ts`. `offRoadRejoinSeconds` is only a brief on-road debounce for clean-pass scoring; it never refills the budget. The outer range is measured beyond the yaw-aware whole-car road limit, not from the road centre. Both shoulders are now **2.5 m wide**, with terrain support, posts, guardrails and nearby props coordinated through `src/config/road.ts`. The shoulder is recovery space, not an additional scoring lane.

Drift king tests the actual rotated body outline (including samples between corners) against the curved asphalt edges. Its left/right limits are asymmetric around the front-axle pivot, not the old conservative Easy drive envelope; drifting while fully on the road cannot start a timer. Mirror tips do not count, and a 6 cm tolerance absorbs body roll and road-mesh tessellation. The direction hint follows the body edge that really crossed the road. Debug limits use this exact same calculation, sampled along the upcoming bends.

Traffic collisions use body-sized, clipped-corner polygons in `src/game/collision.ts`, matching each model's dimensions, front-axle drift pivot, road heading and slope. Continuous sweeps prevent high-speed tunnelling without the old oversized axis-aligned/mirror-width boxes. Mirror and trim brushes are intentionally forgiving. Press **H**, or use **Advanced settings → Under the hood → Show collision hitboxes**, to display the exact collision outlines plus asphalt edges, safe car-position limits and the outer recovery range. Mint outlines are your car; amber is traffic. Blue/pink road guides apply to the player's reference position, not a body corner. This is a planar arcade collision check; trees, rocks and rails are non-colliding scenery. Debug view is session-only, off on refresh, and uses one reusable line buffer with no draw calls when disabled.

The descent is endless: road, terrain, and scenery generate ahead of you, with no finish line or automatic reset. Seeded bends join continuously in position, direction, and curvature. The HUD counts total distance traveled and previews the next stretch of road. R or the restart button starts a fresh drive from the top.

Stronger rear slip produces soft tire-smoke puffs from both rear wheels. Smoke stays in world space behind the car, expands, and fades. The effect uses an 80-puff pool and one draw call, pauses with the drive, and clears on restart or world changes. **Tire smoke** adjusts the amount; zero turns off emission.

## Make it your own

The transparent in-game toolbar keeps customization in small icon menus:

- **Car:** switch rides in place, or choose **Visit the garage** for paint and close-up work.
- **Weather:** open **The scenery** for preset worlds, landscape, season, time of day, and weather. The icon reflects the current conditions.
- **Sound:** _Sleep_ (piano only), _Moonlight_, and _Meanwhile_ by Scott Buckley form a roughly 13-minute CC BY playlist, with automatic next-track playback, previous/next buttons, a song picker, progress, volume and matching artist credits. Ambience has its own toggle. Audio loads only after Play; this is a repeating playlist, not live radio. [Music sources and licensing](docs/music.md).
- **Sliders:** open **Advanced settings** for art, shape softness, road style, wind/intensity, driving feel, rendering quality, and saved scenes.

Quick menus float over the road without a backdrop or navigation away. Close them with the same icon, the close button, Escape, or a click outside. Driving input is cleared and the journey pauses while editing, then resumes unless you had already paused it. Settings are saved to this browser; **Restore defaults** reloads the configured startup defaults. **Export settings** downloads a full settings snapshot for reference. Use the separate **Export scene / Import scene** controls in Advanced settings for reusable scenery recipes.

### World composer

Start with **City Afterglow**, **Desert Quiet**, **Alpine Lakes**, **Tallwood**, **Summer Coast**, **Coastal Rain**, or the original **Greenridge Pass**, then change ingredients independently:

- **Landscape & season:** highlands, coast, a mountain city overlook, desert mesas, finite alpine lakes, or tall-canopy forest; spring, summer, autumn, or winter ground and vegetation. Snow cover and falling snow are separate choices.
- **Light & weather:** daylight, sunset, blue hour, moonlight, or dawn; clear, overcast, rain, or snow, with intensity and wind controls. Lighting eases between moods, moonlight automatically enables headlights, and rain adds a damp sheen to asphalt. A bounded pool of at most 600 particles handles precipitation; it freezes while paused or in the garage. The synthesized ambience responds to wind, rain, and the coast when sound is enabled.
- **The road:** asphalt or granular gravel, dashed/double/no markings, guide posts or guardrails. Curves, width, grade, terrain height, density, fog, and shape softness remain independently adjustable below. Weather and surfaces are visual: no ice penalty or additional traction loss, and Easy drive's assistance stays unchanged.
- **The art palette:** Salt & sun, Alpine morning, Golden hour, and Lavender dusk provide colors independently of landscape and time. A preset loads a coherent combination; changing an individual control never reloads the rest of the preset.

The sea is deliberately stylized: its surface follows the same endless downhill grade, 18 meters below the road, rather than using a fixed real-world sea level. The shoreline, waves, and guardrails join across streamed chunks, in both camera directions. The coast keeps the seven-chunk budget and floating origin, including far beyond 10,000 km. Light, fog, wind, and precipitation changes do not rebuild the road; terrain/season/road-geometry changes rebuild the surroundings only when the ingredient changes.

### A world that keeps moving

By default a full day takes **10 minutes of active play**: daylight → sunset → moonlight → dawn, each lasting **2.5 minutes**. Every **three days (30 active minutes)** the season advances: spring → summer → autumn → winter → spring. Blue hour remains available manually and leads into moonlight. Weather rolls separately every **3.5 minutes**, with season-aware rain/snow and drier desert weighting; a day or season boundary does not force a weather change.

Advanced settings includes independent hold/automatic controls for daylight, seasons and weather, plus day length, days per season and weather interval. Holding daylight also holds calendar progression; weather can continue independently. Manual time/season/weather picks restart only that ingredient's interval. The welcome screen, pause, menus, garage and background tabs do not advance these clocks. Restarting a drive keeps its world time; refreshing starts a new clock from the saved atmosphere preferences. Automatic transitions are not written to storage on every phase.

Startup overrides: `VITE_AUTO_TIME`, `VITE_AUTO_SEASONS`, `VITE_AUTO_WEATHER`, `VITE_DAY_DURATION` (seconds), `VITE_SEASON_DAYS`, and `VITE_WEATHER_DURATION` (seconds). `src/game/world-clock.ts` is pure, independently testable clock logic. Scene recipes keep their existing scenery-only format and do not override your cycle preferences.

Readable cream/sage text sits on small, local translucent charcoal surfaces in the driving view, including the intro, navigation groups, HUD and controls. The rest of the scene stays transparent; there is no white gradient or text glow. Paper menus and the garage use their own opaque, higher-contrast surfaces.

Under **Keep this little world**, name a mix and **Save a copy**. Up to 24 named copies are stored separately from your current settings. Load or remove a selected copy; removing it does not change the active world. **Export scene** downloads a versioned `chillhill.scene.json`; **Import scene** validates a file before applying it. Imported worlds are immediately saved as the current settings; use Save a copy to add one to your named shelf. Scene files include only scenery ingredients—not cars, paint, handling, rendering quality, or journey progress. Invalid formats/choices are rejected, numeric settings are clamped to their supported ranges, and files are limited to 64 KB. Export still works if browser storage is unavailable.

These are distinct terrain profiles and scenery, not only palette swaps. City windows and roadside lamp lenses light up at dusk/night; the skyline uses instancing and procedural windows, not hundreds of individual lights. Desert formations have broad stepped tops and sparse shrubs. Tallwood grows much taller trunks and overhead crowns. Alpine lakes are finite, horizontal water surfaces in seeded basins, unlike the stylized sloping sea. [Landscape design and extension points](docs/landscapes.md).

Configuration and extension points:

- `src/config/scenes.json`: built-in recipes, automatically included in the picker. Duplicate an entry and change its ingredients to add a combination without renderer changes.
- `src/config/world.ts`: supported independent choices and validation. `src/config/scenes.ts`: scene-file format and scenery-only snapshots.
- `src/game/atmosphere.ts`: seasonal colors and lighting/weather composition. `src/game/coast.ts`: shared animated water material and streamed sea geometry. `src/game/weather.ts`: bounded precipitation pool.
- `src/world-composer.ts` and `.css`: in-game editing and the local scene shelf. A genuinely new biome or effect still needs a renderer component before it can be selected in configuration.

For startup defaults, set `VITE_SCENE` to any recipe ID in `src/config/scenes.json` (for example `city-afterglow`, `desert-quiet`, `alpine-lakes`, or `tallwood`) or use the individual `VITE_LANDSCAPE`, `VITE_SEASON`, `VITE_TIME_OF_DAY`, `VITE_WEATHER`, `VITE_WEATHER_INTENSITY`, `VITE_WIND`, `VITE_ROAD_SURFACE`, `VITE_ROAD_MARKINGS`, and `VITE_ROADSIDE` variables. Explicit ingredient variables override a startup recipe. Stored browser settings override startup defaults; choose Restore defaults to apply changed environment values. Existing saves inherit new ingredients without losing their art palette, paint, or driving settings.

## Measurement units

**Advanced settings → Your preferred units** offers **Auto**, **Metric** (km/h, km, m) and **Imperial** (mph, mi, ft). On Cloudflare, Auto uses the request's country through the same-origin `/api/preferences` endpoint. Only the country is returned; no GPS permission, location storage, city or IP disclosure. This beats browser language: an English-US browser in Argentina gets metric. The mapping follows [Unicode CLDR's speed preferences](https://github.com/unicode-org/cldr/blob/main/common/supplemental/units.xml): US/GB use mph, other countries default to km/h. If country lookup is unavailable, explicit locale regions/preferences are a fallback; language-only English is never expanded into a guessed US country. Missing information defaults to metric. Manual choices always win, including if selected before the country response arrives. All display surfaces share this decision.

Speed, wandered distance, game-over distance, speed/road-width slider readouts and their accessible values, car-menu dimensions, and garage specs all follow the selected units. Switching only affects display, never the car's speed, geometry, collisions or journey. Slider storage/steps, physics, environment values and exported numeric settings remain metric, avoiding conversion drift. Full settings exports include the unit preference; scenery recipes do not override it. `VITE_UNITS=auto|metric|imperial` optionally changes the startup preference. Conversion and locale logic lives in `src/config/units.ts`.

## Sharing previews

`index.html` contains static Open Graph and Twitter large-image tags, a canonical
URL, image dimensions/alt text and PNG/SVG icons. The title and game description
match across the page, Open Graph and Twitter. Crawlers need no JavaScript or
WebGL to discover them. `public/social/chillhill-coast-v2.png` is a 1200×630 render
of the real coastal scene with a prominent logo, game description and typography;
the standalone touch logo is 180×180, with a 32×32 PNG favicon fallback.
Run `npm run social:image` against local Vite to regenerate
them, then rebuild. When changing the preview, version its filename and update
the HTML URLs. `npm run test:sharing` checks the original HTML with JavaScript off
and validates all three public PNGs. Previous preview images stay available for
cached links. Chat apps control the final layout and may retain old previews;
[Slack caches crawler responses for roughly 30 minutes](https://api.slack.com/robots).

## The garage

Open the **car icon → Visit the garage**, or go directly to `/#garage` to work on cars without starting the driving scene. It's a separate, stationary workshop with neutral lighting, a turntable, and no terrain generation or driving simulation.

The garage fits the viewport without page scrolling. Cars occupy a two-column grid; phones and shorter windows use keyboard-accessible **Cars / Paint / Details** tabs while the preview stays visible. Larger windows show all three sections together.

- Drag to orbit; scroll or pinch to zoom. Front, side, rear, and three-quarter view buttons make comparisons repeatable. **Slow spin** rotates the view; **Reset view** stops it and restores the inspection angle.
- Choose a paint swatch, use the custom color picker, or enter a six-digit hex color. Paint is saved **per car** and used on the road too. **Reset paint** restores only that car's original catalog/palette color; changing atmosphere does not override custom paint.
- Adjust **Shape softness** or toggle **Wireframe** to inspect the same procedural geometry used in the game. Softness is shared with the world; wireframe and spin are inspection tools only.
- **Back to the hillside** keeps the current drive's progress and speed. Driving input is disabled in the garage. Browser Back/Forward also switch views. Garage GPU resources are released when leaving.

`src/game/garage.ts` owns the independent 3D scene; `src/garage.ts` and `src/garage.css` own its UI. Both scenes use `buildVehicle` from `src/game/vehicles.ts`. Add a catalog entry in `src/config/cars.ts` and its model builder to make it available in the garage and the game. Keep `/#garage` open while editing model code for a focused iteration loop. This is a code-based model workbench, not a mesh editor/importer.

Paint overrides live in the saved settings' `paint` object (car ID → `#rrggbb` or `null`). They are included in **Export settings**. `src/config/paint.ts` validates colors and gives newly added cars their original paint without changing older saved colors.

## Cars and scenery

The garage includes the original 2005 Peugeot 206 five-door, early Renault 12 TL, 1967 Porsche 911 S coupé, and 1986 Ferrari Testarossa alongside the Astra hatch and fictional wagon. The 911 and Testarossa have custom matching mirrors on both sides. Each has its own procedural silhouette, period details, 3D model thumbnail and editable paint. The car menu has a two-column grid and paint controls, so colors can change without visiting the garage. Dimensions come from original manufacturer material; photo-derived estimates are explicitly marked in [the vehicle reference notes](docs/vehicles.md). Ferrari rear tires are wider/larger than the fronts, with axle-specific wheel animation. All cars share the selected mode's handling; Easy drive retains the relaxing driving assistance.

**Choose your ride** keeps the Chevrolet Astra five-door hatchback as default. The Peugeot 206 replaces the retired Astra sedan; old sedan selections fall back to the configured supported default without resetting the other cars' paint or world settings. In Easy drive, switching keeps your distance, speed, and landscape; road-edge clearance, the front-axle drift pivot, wheel rotation, and rear smoke emitters adapt to the selected car. Drift king preserves distance, lives and passes, but safely recenters and stops the replacement car. Old smoke clears when swapping. The Astra uses Argentine factory proportions with simplified bodywork, sloping glass, Chevrolet bowties and five-spoke wheels. Cars share arcade handling, not a real powertrain simulation. See [vehicle specifications and customization](docs/vehicles.md).

**Shape softness** works independently of the atmosphere: 0% restores angular low poly; 100% gives rounded car edges, plump tree crowns, rounded rocks and mountains, and smooth terrain shading. Intermediate values blend silhouette and shading softness. The default is 65%. Smooth terrain shares normals across chunk boundaries, and the road keeps its original route and height. Shapes and colors can change without restarting the descent.

Separate layers keep experimentation manageable:

- `src/config/styles.json`: art presets. Edit colors, light, fog color, car paint, location text, and vegetation (`pine` or `round`). Add another complete preset here and the picker includes it automatically.
- `src/config.ts`: default world, driving, and rendering parameters, environment overrides, validation, and persistence.
- `src/config/cars.ts`: vehicle catalog, dimensions, axle positions, and paint. `src/game/vehicles.ts`: procedural car models, with independently disposable geometry and textures. Astra paint uses its own base color with a subtle atmosphere tint; the wagon follows the palette directly.
- `src/game/art.ts`: adjustable shape geometry and terrain shading. `src/game/route.ts` defines the route and terrain height; `src/game/scene.ts` assembles models and the chase camera. `src/game/smoke.ts` owns the rear-tire effect. These can evolve independently of input and driving physics.

Copy `.env.example` to `.env.local` and adjust the `VITE_` variables for startup defaults. Restart the dev server after changing them; production defaults are captured when building. Speeds are km/h, width is meters, grade is a ratio (0.09 = 9%), and seed is an integer. Stored browser choices override these defaults until **Restore defaults** is clicked. All `VITE_` values are public browser configuration, so never put secrets in them. See [Vite's environment variable documentation](https://vite.dev/guide/env-and-mode).

`VITE_SHAPE_SOFTNESS` and `VITE_TIRE_SMOKE` both accept 0–1. `VITE_CAR` accepts `astra`, `renault-12`, `testarossa`, `porsche-911`, `camaro-ss`, `mustang-fastback`, `wagon`, or `peugeot-206`. Older saved settings automatically inherit defaults for the new controls, including the default Astra.

The road and terrain share a height function to avoid gaps; scenery is seeded and generated in seven resident chunks as you descend. GPU geometry and instance buffers are disposed as chunks leave view. Chunk vertices use local coordinates, and the scene rebases around the car every 180 meters to retain precision on long drives. Camera and smoke shift together, so existing tire trails remain in place. Rendering resolution is capped, trees and rocks use instancing, and render quality is adjustable for mobile. Art or terrain changes regenerate the current surroundings, preserving your progress.

Upcoming terrain is prepared in a bounded background worker; initial scenery and abrupt camera/route jumps retain a safe synchronous fallback. Traffic models keep stable identities and reuse five geometry templates with independent paint and wheel animation. This removes the repeated full-car rebuilds that caused periodic driving stalls. See [profiling results, cache ownership and remaining limits](docs/performance.md). `window.__chillhill.environment` exposes traffic-cache and terrain-prefetch counts in development.

Every fresh page load rolls a new route seed while retaining your car, paint and world preferences. The last 64 generated seeds are avoided when browser storage is available. The seed stays fixed throughout that drive, including garage visits and **Back to the top**; scenery presets keep it too. Enter a specific seed in Advanced settings or explicitly load/import a saved scene to revisit a route. Refresh starts a fresh road again. `VITE_WORLD_SEED` remains the baseline used by **Restore defaults**, not a lock on the automatically generated startup route.

Nearby trees fade out when their trunks or crowns would obstruct the camera-to-car/road view, then return gently once clear. This works in the welcome, chase and held-V views, with no camera jumps and without thinning the entire forest.

## Verify

```sh
npm test
npm run build
# With the dev server running and Google Chrome installed:
npm run test:browser
# Focused world-composer rendering, file round trips, and coastal streaming:
npm run test:world
# Focused new landscapes, both cameras, mobile selection, level lakes and resource recycling:
npm run test:landscapes
# Focused actual-app world clock, challenge driving, and text contrast:
npm run test:clock
npm run test:challenge
npm run test:offroad
npm run test:hitboxes
npm run test:readability
npm run test:units
# Reproducible streaming/traffic timings, heap samples and a Chrome CPU profile:
npm run test:performance
```

The unit suite verifies vehicle dimensions and road clearance, cruise behavior, the speed cap, brake priority, exact stationary holding, restarting after braking, drift, forgiving edges, frame-rate consistency, downhill terrain, and seeded scenery. Browser checks cover desktop and emulated mobile input, car switching/persistence/resource disposal, axle positions, settings/export, pause, endless streaming, and car close-up screenshots. Browser automation uses an isolated Chrome profile. Physical-device Safari and Android performance still need hands-on playtesting.

Development builds expose a read-only snapshot at `window.__chillhill` for local checks. It is absent from production builds.
