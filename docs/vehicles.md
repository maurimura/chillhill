# Cars

The default is the Argentine Chevrolet Astra G five-door hatchback. The second Astra is the four-door sedan; the Hillside Wagon is fictional.

## Reference

Dimensions follow Chevrolet Argentina's [2011 Astra owner's manual, section 12, pages 12-1 and 12-2](https://mi.chevrolet.com.ar/content/dam/gmownercenter/gmsa/gmar/dynamic/manuals/2011/chevrolet/Astra/es/om_ng-chevrolet_Astra_my11-es_AR.pdf.pdf), using the 195/60 R15 configuration. The manual's side elevations informed the silhouettes.

| Dimension               | Hatchback       | Sedan           |
| ----------------------- | --------------- | --------------- |
| Length                  | 4.199 m         | 4.342 m         |
| Body width              | 1.709 m         | 1.709 m         |
| Width including mirrors | 1.989 m         | 1.989 m         |
| Height                  | 1.431 m         | 1.425 m         |
| Wheelbase               | 2.614 m         | 2.614 m         |
| Front overhang          | 0.878 m         | 0.878 m         |
| Rear overhang           | 0.707 m         | 0.850 m         |
| Front/rear track        | 1.464 / 1.440 m | 1.484 / 1.460 m |

The 0.3075 m tire radius is calculated from 195/60 R15 nominal dimensions. Bodywork, glass, lights, rims, and badges are original simplified procedural geometry, not a manufacturer CAD model. Details and rounding are stylized; the antenna and trim extend slightly beyond nominal body dimensions.

The production Astra is front-wheel drive (manual section 12). This game intentionally retains its shared assisted rear-slide behavior, coasting speed, and configurable speed cap. Catalog dimensions affect proportions, road clearance, axle pivots, tire animation, and smoke locations—not engine torque, tire grip, or suspension simulation.

## Customize

- Choose a car in **Make it yours → Choose your ride**. Your browser remembers it, and JSON exports include `car`.
- Open **Garage** or `/#garage` for a standalone model workbench. Orbit or use fixed views, preview softness, toggle wireframe, and change body paint. Per-car paint overrides are saved and used in both scenes; resetting one car's paint does not affect the others.
- Set `VITE_CAR=astra`, `astra-sedan`, or `wagon` in `.env.local` to change the startup default. Restart Vite and use **Restore defaults** if a saved selection overrides it.
- Edit `src/config/cars.ts` for names, dimensions, and base paint. `paint: null` follows the atmosphere palette; a fixed paint gets a small palette tint.
- Edit `src/game/vehicles.ts` for bodywork and details. Coordinates use meters, +Y up, -Z forward, and the body center as origin. Wheels and smoke use the catalog's axle/track data.
- The garage uses that same `buildVehicle` function, not a second copy of the car. Keep `/#garage` open during development to see model edits without generating a road. Garage lighting and scenery are defined separately in `src/game/garage.ts`.
- Adding a catalog entry automatically adds a picker option. Existing `kind` values reuse their body builder; a genuinely new silhouette needs a new builder branch and a corresponding picker profile in `src/main.ts`. The original wagon has legacy fixed-size bodywork; change that geometry along with its catalog dimensions.

The **Shape softness** slider is shared with the world. All models retain their own materials, animated wheel groups, brake-light material, and disposal routine so swapping does not rebuild the landscape or accumulate old GPU resources.
