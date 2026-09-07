# Cars

The default is the Argentine Chevrolet Astra G five-door hatchback; the Hillside Wagon is fictional. Six additional production cars are available:

| Car                          | Length × width × height       | Wheelbase | Research and visual comparison                                      |
| ---------------------------- | ----------------------------- | --------- | ------------------------------------------------------------------- |
| 2005 Peugeot 206 five-door   | 3.835 × 1.652 × 1.432 m       | 2.442 m   | [Peugeot brochures and photo comparisons](peugeot206-references.md) |
| Early Renault 12 TL 1.3      | 4.340 × 1.636 × 1.434 m       | 2.441 m   | [Original brochure and Renault photos](renault12-references.md)     |
| 1967 Porsche 911 S coupé     | 4.163 × 1.610 × 1.320 m       | 2.211 m   | [Porsche references and real photos](porsche911-references.md)      |
| 1986 Ferrari Testarossa      | 4.485 × 1.976 × 1.130 m       | 2.550 m   | [Ferrari manuals and photo comparisons](testarossa-references.md)   |
| 1969 Chevrolet Camaro SS 396 | 4.7244 × 1.8796 × 1.29794 m   | 2.7432 m  | [Factory sheets and photo comparisons](muscle-cars-references.md)   |
| 1967 Ford Mustang fastback   | 4.66344 × 1.80086 × 1.31572 m | 2.7432 m  | [Ford brochure and photo comparisons](muscle-cars-references.md)    |

The classics are original stylized procedural models, not scans or licensed manufacturer CAD. They preserve the same gentle driving assistance; factory power/top speeds do not override the game’s coasting or speed limit. New cars inherit original paint when loading old saves.

## Reference

Dimensions follow Chevrolet Argentina's [2011 Astra owner's manual, section 12, pages 12-1 and 12-2](https://mi.chevrolet.com.ar/content/dam/gmownercenter/gmsa/gmar/dynamic/manuals/2011/chevrolet/Astra/es/om_ng-chevrolet_Astra_my11-es_AR.pdf.pdf), using the 195/60 R15 configuration. The manual's side elevations informed the silhouettes.

| Dimension               | Astra hatchback |
| ----------------------- | --------------- |
| Length                  | 4.199 m         |
| Body width              | 1.709 m         |
| Width including mirrors | 1.989 m         |
| Height                  | 1.431 m         |
| Wheelbase               | 2.614 m         |
| Front overhang          | 0.878 m         |
| Rear overhang           | 0.707 m         |
| Front/rear track        | 1.464 / 1.440 m |

The 0.3075 m tire radius is calculated from 195/60 R15 nominal dimensions. Bodywork, glass, lights, rims, and badges are original simplified procedural geometry, not a manufacturer CAD model. Details and rounding are stylized; the antenna and trim extend slightly beyond nominal body dimensions.

The production Astra is front-wheel drive (manual section 12). This game intentionally retains its shared assisted rear-slide behavior, coasting speed, and configurable speed cap. Catalog dimensions affect proportions, road clearance, axle pivots, tire animation, and smoke locations—not engine torque, tire grip, or suspension simulation.

## Customize

- Use the **car icon → Your ride** to switch while staying on the road. The two-column grid renders thumbnails of the actual models with their current paint and softness. Swatches, a color picker, a validated hex field and per-car reset work directly in the menu and stay synchronized with the garage. Your browser remembers them, and JSON exports include `car` and `paint`.
- Choose **Visit the garage** in that menu, or `/#garage`, for a standalone model workbench. Orbit or use fixed views, preview softness, toggle wireframe, and change body paint. Per-car paint overrides are saved and used in both scenes; resetting one car's paint does not affect the others.
- Both pickers follow the catalog order: **Astra → Renault 12 → Testarossa → 911 → Camaro → Mustang → Wagon → 206**. Reorder entries in `src/config/cars.ts` to change it in both places; the default remains the Astra.
- Set `VITE_CAR` to `astra`, `renault-12`, `testarossa`, `porsche-911`, `camaro-ss`, `mustang-fastback`, `wagon`, or `peugeot-206` in `.env.local` to change the startup default. Restart Vite and use **Restore defaults** if a saved selection overrides it.
- Edit `src/config/cars.ts` for names, dimensions, and base paint. `paint: null` follows the atmosphere palette; a fixed paint gets a small palette tint.
- Edit `src/game/vehicles.ts` for shared wheels, materials and batching, and `src/game/models/` for the individual body builders. Coordinates use meters, +Y up, -Z forward, and the body center as origin. Wheels and smoke use the catalog's axle/track data; optional rear tire dimensions allow staggered tire sizes.
- The garage uses that same `buildVehicle` function, not a second copy of the car. Keep `/#garage` open during development to see model edits without generating a road. Garage lighting and scenery are defined separately in `src/game/garage.ts`.
- Adding a catalog entry and body builder automatically adds a picker option and its model thumbnail; no separate illustration is needed. `src/game/vehicle-thumbnails.ts` uses one lazy WebGL renderer, releases each rendered model, caches only one snapshot per catalog car and updates one changed preview per frame while the menu is open. Builders receive the shared `VehicleBuilder` helpers so paint, lights, disposal, and batching remain consistent. The original wagon has legacy fixed-size bodywork; change that geometry along with its catalog dimensions.

Run `npm run test:cars` for actual garage front/side/rear/three-quarter screenshots, roundness endpoints, per-car paint/reset, in-drive switching and held-V checks. Images go to ignored `artifacts/`; the full browser suite additionally checks camera framing, wheelbase/tracks and bounded resources for every catalog entry.

The **Shape softness** slider is shared with the world. All models retain their own materials, animated wheel groups, brake-light material, and disposal routine so swapping does not rebuild the landscape or accumulate old GPU resources.

The Astra, Renault 12 and Peugeot 206 use `src/game/vehicle-surfaces.ts` for gently crowned bodywork, rolled shoulders and tucked lower doors, with sampled wheel-arch openings. Each builder specifies its own crown, shoulder roll and sill tuck; the Renault is more restrained. The measured vehicle envelope and wheel locations are unchanged. Softness still blends faceted/smooth shading and geometry rather than replacing their characteristic silhouettes. `tests/vehicle-surfaces.test.ts` checks shoulder continuity, symmetry, envelope and arch clearance. `node scripts/car-menu-check.mjs` checks grid layout, paint/garage persistence, actual rendered previews and bounded resources.

The Astra sedan has been removed from the catalog and both pickers. Existing saves selecting its retired ID use the configured supported default (normally the Astra hatch); unrelated paints, scenery and handling remain intact. No sedan paint is copied onto the Peugeot or hatch. Legacy storage backups remain untouched.
