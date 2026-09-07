# More places to wander

Use the weather icon to select a recipe, then mix its ingredients independently.
No recipe changes the selected car, paint, driving assistance or journey.

| Recipe         | Landscape ID | Scenery                                                                                             | Starting mood          |
| -------------- | ------------ | --------------------------------------------------------------------------------------------------- | ---------------------- |
| City Afterglow | `city`       | Wooded mountain on one side, lower city valley on the other; warm windows and sparse roadside lamps | Clear blue hour        |
| Desert Quiet   | `desert`     | Long dune-like valleys, stepped sandstone mesas and sparse shrubs                                   | Summer sunset          |
| Alpine Lakes   | `lakes`      | Mountain banks, pines and separate turquoise lake basins                                            | Still summer morning   |
| Tallwood       | `forest`     | Taller trunks, high crowns over the road, gentler forest floor                                      | Soft overcast daylight |

The existing coast and highlands remain available. Season, weather, time of day,
road surface, markings, barriers, art palette and softness remain separate controls.
For example, try snowy Tallwood at blue hour or the desert under moonlight.

## How the pieces fit

- `src/config/scenes.json`: complete, editable recipe combinations. The UI lists them automatically. `VITE_SCENE` can select one for startup; explicit environment ingredients and then saved browser choices take precedence.
- `src/config/world.ts`: validated landscape/season/weather/road choices.
- `src/game/route.ts`: continuous terrain profiles and deterministic finite lake descriptors. The driving route and forgiving steering math are unchanged.
- `src/game/scene.ts`: resident chunks, tree size/density/clearings, rock and landmark placement. `src/game/art.ts`: soft terrain/crowns/rocks and stepped mesa geometry.
- `src/game/city.ts`: instanced valley blocks and streetlamps. Shared shader windows respond to time/weather without rebuilding. Lamps are emissive lenses, not a separate point light per pole.
- `src/game/lakes.ts`: per-chunk water pieces clipped to each finite basin; one shared ripple-highlight material. The lake surface itself never tilts or waves vertically.
- `src/game/atmosphere.ts`: independent lighting, seasonal cover and landscape palette accents.
- `src/config/route-seed.ts`: a fresh startup route with a bounded recent-seed history. Built-in scenery choices retain the current seed; explicitly loading a saved scene restores its seed.
- `src/game/camera-occlusion.ts` / `tree-occlusion.ts`: camera-to-car and camera-to-road clearance. Only obstructing tree instances fade, keeping trunks and crowns together. Chunk-local bounds survive origin rebasing; attribute buffers are disposed with their chunks. Dithering avoids transparent-instance depth sorting and settles to fully hidden so paused views do not retain ghost trees.

## Endless, but not unbounded

All landscapes use seven resident 180 m chunks, seeded generation, and the existing
floating origin. Camera reversal moves that same budget behind the car. Each chunk's
instance buffers and owned geometry are disposed when it leaves view. City material
and geometry are shared; the lake descriptor cache is bounded.

Each lake has one fixed world center and elevation. Its water is an ellipse, not a
sloping infinite ocean. Neighboring chunks query the same descriptor and clip the
same level surface. Lake basins are kept clear of the entire curved road envelope;
roadside rocks/trees and broad mountain meshes do not cover the water. There are dry
stretches between lakes, allowing the road to continue descending indefinitely.

These are stylized places, not geographic recreations. City blocks follow the
endless valley rather than simulating one fixed metropolis. The road still uses
sweeping bends; true 180-degree hairpins need a separate route-system change.

## Verification

`npm test` covers terrain continuity, seeded basins, road clearance at extreme
settings and large origins. `npm run test:landscapes` captures desktop/mobile views,
checks independent weather and preserved journey, verifies horizontal lake geometry,
reverses cameras, and tests repeated landscape/softness switches at 10,000 km.
The full browser suite includes those checks and actual opt-in MP3 playback.
