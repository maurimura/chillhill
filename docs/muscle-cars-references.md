# American classics — Camaro and Mustang

Original procedural, low-poly interpretations, checked against manufacturer documents and real photos on 6 September 2026. No downloaded photos or manufacturer CAD are shipped. The cars inherit the same assisted coasting, drifting, braking and configurable speed limit, not real engine performance.

## 1969 Chevrolet Camaro SS 396 coupé

- [Chevrolet's 1969 factory information kit, GM Heritage](https://www.gm.com/content/dam/company/no_search/heritage-archive-docs/vehicle-information-kits/chevrolet/1969-Chevrolet-Camaro.pdf).
- [Original Chevrolet AMA specifications, page 1](https://over-drive-magazine.com/wp-content/uploads/2024/03/1969-CHEVROLET-Camaro-I-6-to-325-HP-396-CID-V-8s-1-31.pdf), preserved by Over-Drive. The actual scan page 2 was rendered and visually inspected, not just its search excerpt. Values below use the **2-door coupé**, not the convertible height.
- [RM Sotheby's real 1969 SS 396 gallery](https://rmsothebys.com/auctions/fl20/lots/r0312-1969-chevrolet-camaro-ss/): inspected [front/side](https://cdn.rmsothebys.com/5/7/4/6/1/8/5746184a3ec2cfdb6c35f1bc5c26ffa076f97041.webp), [rear three-quarter](https://cdn.rmsothebys.com/5/4/3/2/6/c/54326c1d0e47a322dbed19e42509152e2a9fec98.webp) and [rear](https://cdn.rmsothebys.com/5/d/9/8/0/6/5d980691529505311c9afa590992ba2b7d11240d.webp). This is a restored example, used for shape and trim rather than a claim that every part is factory original.

| Input              | Factory inches | Game meters      |
| ------------------ | -------------- | ---------------- |
| Length             | 186.0          | 4.7244           |
| Width              | 74.0           | 1.8796           |
| Coupé height       | 51.1           | 1.29794          |
| Wheelbase          | 108.0          | 2.7432           |
| Front overhang     | 37.1           | 0.94234          |
| Front / rear track | 59.6 / 59.5    | 1.51384 / 1.5113 |

Key features: long hood, compact glasshouse with a rear quarter window, separate rear deck, broad rear shoulders and a pinched waist; exposed circular headlights in the dark grille (non-RS); hockey-stick side stripes; SS-style hood vents; three rear-quarter gills; small deck spoiler; horizontal divided rear clusters and black rear panel. The simplified Rally wheel pattern differs from the restored auction car's aftermarket wheels. Nominal 0.326 m tire radius, 0.215 m width and 2.015 m mirror envelope are **game estimates**, not measurements from this sheet.

## 1967 Ford Mustang 2+2 fastback, 289 V8

- [Original 1967 Ford sales brochure](https://www.auto-brochures.com/makes/Ford/Mustang/Ford_US%20Mustang_1967.pdf), final specifications page (scan page 11), rendered and visually inspected. It lists the 289 Challenger Special V8 as 225 hp; this is descriptive context, not game physics.
- [West Coast Classics' photographed 1967 A-code 289 fastback](https://www.thewestcoastclassics.com/1967-ford-mustang-sportsroof-4-spd-289-v8-fastback-c-1750.htm): inspected [front](https://www.thewestcoastclassics.com/galleria_images/1750/1750_main_l.jpg), [side](https://www.thewestcoastclassics.com/galleria_images/1750/1750_p8_l.jpg), [opposite front](https://www.thewestcoastclassics.com/galleria_images/1750/1750_p4_l.jpg) and [rear](https://www.thewestcoastclassics.com/galleria_images/1750/1750_p6_l.jpg).

| Input           | Ford brochure inches | Game meters         |
| --------------- | -------------------- | ------------------- |
| Length          | 183.6                | 4.66344             |
| Width           | 70.9                 | 1.80086             |
| Fastback height | 51.8                 | 1.31572             |
| Wheelbase       | 108.0                | 2.7432              |
| Treads          | 58                   | 1.4732 front / rear |

The 0.815 m front overhang is a **photo-fit estimate**, not supplied in that brochure. The brochure lists period 6.95 × 14 tires; the game's 0.321 m radius / 0.205 m width approximate the fuller replacement-tire appearance in the photos, with simplified five-spoke styled-steel wheels. The 1.95 m mirror envelope is likewise a conservative game estimate.

Key features: the long falling fastback roof (not the hardtop or a Shelby conversion), one main side window with vent divider, solid louvered sail panels, twin simulated side scoops, long hood, round headlights outside a chrome-framed grille and original simplified horse silhouette, circular fuel cap and **three upright red tail lamps per side**.

## Garage comparison and intentional simplifications

Compared real photos with the actual game garage's front, side, rear and three-quarter views, plus softness 0 and 1. The first models had overly square lower valances and an oversized Camaro spoiler. End-specific corner rounding, raised/tucked valances and a lower spoiler correct those features while keeping the fixed wheelbases. Lamp internals, grille mesh, badges, chrome and sheet-metal creases remain stylized. Both cars have paired mirrors as deliberate game equipment, not a claim about standard period fitment.

`src/config/camaro.ts` and `mustang.ts` hold dimensions and paint; each car has its own body sections and detail builder under `src/game/models/`. `muscle-common.ts` shares only construction tools, glass/trim and wheel-arch handling. The shared body-surface helper's optional nose/tail rounding and lower-valance shaping preserve wheel locations. Neither engine power nor gearbox is simulated.

Use `TEST_CARS=camaro-ss,mustang-fastback npm run test:cars` to regenerate ignored garage and driving captures. All catalog entries automatically receive 3D thumbnails, per-car paint, garage controls, safety envelopes and camera tests.
