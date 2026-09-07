# Peugeot 206 — original 2005 five-door hatchback

This is the original 206 five-door shape familiar in Argentina and other markets, **not the 207 Compact/206+**, the three-door RC, the SW or the CC. It is a hand-built low-poly interpretation; body surfaces and small trim are stylized rather than scanned. The game uses its existing shared, gentle driving behavior.

## Primary specification references

Checked 6 September 2026:

- [Peugeot, May 2005 technical brochure, CT206 05B](https://www.forum-peugeot.com/wp-content/uploads/2016/11/caractech206mai2005.pdf), an original manufacturer document preserved by Forum-Peugeot. PDF page 7 contains the five-door dimension drawing; page 6 lists engine and tire equipment. The actual dimension drawing was rendered and visually inspected.
- [Peugeot, April 2005 model brochure](https://www.forum-peugeot.com/wp-content/uploads/2016/11/cat206avril2005.pdf), PDF page 17, supplies another dimension summary and original colors/wheel options. Its text gives a 2.445 m wheelbase, while the May technical drawing gives 2.442 m. The game consistently follows the measured May drawing, not a mixture of variants.

| Model input      | Value           | Basis                                                                   |
| ---------------- | --------------- | ----------------------------------------------------------------------- |
| Length           | 3.835 m         | May technical drawing                                                   |
| Body width       | 1.652 m         | May technical drawing, standard narrow body                             |
| Height           | 1.432 m         | Upper end of drawing's 1.428–1.432 m range                              |
| Wheelbase        | 2.442 m         | May technical drawing                                                   |
| Front overhang   | 0.785 m         | May technical drawing; rear is 0.608 m                                  |
| Front/rear track | 1.425 / 1.416 m | Narrow setup within drawing's listed ranges                             |
| Tires            | 175/65 R14      | Standard 1.4-litre setup in May technical table                         |
| Tire radius      | 0.29155 m       | Calculated from nominal tire size                                       |
| Mirror envelope  | 1.890 m         | Conservative photo-based game framing estimate, not factory measurement |

The body and 14-inch tire envelope follow the ordinary narrow-body model. Generic five-spoke game alloys are an artistic simplification, not an assertion that every Argentine 2005 trim came with those wheels. Paint and trim choices are likewise customizable rather than tied to one market's exact equipment package.

## Real-photo comparison

Inspected seven real photographs across three 2005 five-door cars, alongside the manufacturer's side/front/rear drawings:

- [PS Auction's 2005 Peugeot 206 five-door gallery](https://psauction.com/item/view/1121112/peugeot-206-5-door-1-6-manual-109hp-2005): [front three-quarter](https://d2q01ftr6ua4w.cloudfront.net/assets/images/thumb_7329603_item_image_normal.jpg) and [side/rear three-quarter](https://d2q01ftr6ua4w.cloudfront.net/assets/images/thumb_7329609_item_image_normal.jpg). This photographed 1.6-litre example has different wheel/bumper trim, used as a body-shape reference rather than the source for narrow-model tire dimensions.
- [Argentine 2005 XR Premium gallery](https://www.deruedas.com.ar/vendo/Peugeot/206/Usado/Mendoza?cod=639371): [front](https://www.deruedas.com.ar/images/autos/Peugeot-206-2005/639/639371_1_im.jpg?edit=4), [rear](https://www.deruedas.com.ar/images/autos/Peugeot-206-2005/639/639371_2_im.jpg?edit=4), and [side](https://www.deruedas.com.ar/images/autos/Peugeot-206-2005/639/639371_3_im.jpg?edit=4). Using three angles of the same car avoids mixing different body generations.
- [A second Argentine 2005 car, rear three-quarter](https://www.deruedas.com.ar/images/autos/Peugeot-206-2005/782/782628_3_im.jpg?edit=2), used to cross-check the lamp wrap, rear glass and bumper.

Key visual features carried into the model: a short rounded bonnet; long swept almond-shaped headlights; large forward windshield; domed roof; black B-pillars and two door handles per side; gently rising side molding; short raked hatch; diagonal wraparound rear lamp wings; rear wiper; small lion-shaped emblems and the original narrow upper grille rather than a 207 Compact front end.

No reference photographs or downloaded model assets are included in the shipped game.

## Garage checks and refinements

Compared the integrated front, side, rear and three-quarter garage captures with the actual photographs and Peugeot dimension drawings, including both endpoints of the shape-softness control. Earlier passes still had an overly triangular rear door window, an early roof taper, disconnected-looking rear lamp pieces and door seams floating off the body. The latest correction rebuilds the window and roof profiles, projects door seams onto the skin, and uses one continuous rear lamp across the corner. Headlights span the nose and bonnet instead of lying flat on top. Hood vents, the roof aerial, round handle recesses, fuel flap and wraparound bumper strip are also represented. These are authored approximations, not scanned surfaces.

The focused Peugeot browser suite passes garage angle/softness captures, independent custom paint, drive selection, held-V front-camera framing and persistence. Small badges, wheels and lamp internals remain deliberate low-poly approximations.

## Rear-shape correction

A second comparison on 6 September 2026 used a clear [rear photograph of an Argentine 2005 206](https://www.deruedas.com.ar/vendo/Peugeot/206/Usado/Mendoza?cod=639371) ([photograph](https://www.deruedas.com.ar/images/autos/Peugeot-206-2005/639/639371_2_im.jpg?edit=4)), alongside the side reference above. The initial clusters were much too small and high, the plate dish and handle too narrow, and the rear skin too flat. The revised model has larger rounded wraparound corner lamps, amber/red lens sections, a broader recessed plate dish with body-colored handle, lower model lettering, a curved rear screen with a wider wiper, and a broad black bumper band. The tail corners now curve inward continuously across the side and rear surfaces. Lens internals remain simplified; the reference has the earlier amber/red cluster appearance, not aftermarket LED lamps or the 206+ rear design.
