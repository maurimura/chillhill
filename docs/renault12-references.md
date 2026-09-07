# Renault 12 modelling reference

The game car is an early ordinary **Renault 12 TL 1.3 sedan**, not a Gordini or Alpine. Its simple silhouette is shared with the first Argentine R12; Renault's Argentine history confirms local production began in 1971. It is a stylised low-poly model, not a claim of exact Argentine-year trim or a licensed manufacturer asset.

## Primary evidence inspected

- [Renault's original 1969 launch brochure, archived scan](https://www.brochure-catalogue-voiture-neuve.fr/en/brochures/renault/12/renault-12-1969/1-FRA-1969/). Scan page 6 contains the factory technical drawing and tire notation, rear three-quarter photograph, boot, and rear-pillar vent detail. Page 7 shows front, side, front-three-quarter and transparent cutaway photographs; page 8 is a close-up of the rear window, trunk and Renault badge. These pages were visually opened, not merely inferred from search text. The scan identifies its publisher as Régie Nationale des Usines Renault.
- [Renault Argentina: iconic local models](https://www.renault.com.ar/renault-en-argentina.html). Its actual cream R12 studio photograph was downloaded temporarily and visually inspected for the grille, rectangular lamps, narrow body, glasshouse, sloping tail, four-door proportions, bumpers, mirrors and steel wheels. It depicts a later trim than the launch brochure, so its later horizontal C-pillar vent and wheel covers were not blindly copied to the early car.
- [Manufacturer studio photo used for comparison](https://cdn.group.renault.com/ren/ar/descubri-renault/renault-en-argentina/Imagenes_Web_2560x1440px_Sin%20sobreimpresos_Iconos_R12.jpg.ximg.large.jpg/2cee5c4e6e.jpg).

An additional [archived dimension drawing](https://commons.wikimedia.org/wiki/File:Renault_12_dimensions.jpg) was inspected but **not used as the scale authority**: it shows a different 4,348 mm length and 1,616 mm width. The original 1969 brochure provides the internally consistent early-TL values below.

## Scale and assumptions

All values are metres in the game. Directly transcribed from the original brochure technical plate: length **4.340**, width **1.636**, height **1.434**, wheelbase **2.441**, front overhang **0.859**, rear overhang **1.040**, front/rear tracks **1.312**. The overhangs plus wheelbase sum exactly to the quoted length.

The brochure specifies **145 × 330** tires. Width is modelled as **0.145**; 330 mm is the nominal 13-inch rim family. The **0.284** outer radius uses an estimated period full-profile aspect ratio of 82%, not a factory-listed tire radius. Both axles use the same dimensions.

Mirror envelope **1.790** is a conservative visual/road-clearance estimate; the brochure does not state mirror-to-mirror width. Two small mirrors are intentionally provided for the game rather than asserting that the reference car had two as standard. Paint `#e3d7b6` is an art-direction cream inspired by the manufacturer photograph, not a factory paint-code reproduction. Body crown, glass curvature, lamp size, trim thickness, door seams and arch radii are photo-informed estimates. Wheels use the shared steel-wheel/hubcap style.

## Recognition checklist

- Long bonnet, tall upright four-door cabin, small rear window and separately sloping boot: early R12 “arrow” profile.
- Thin A/B pillars, narrow chrome window surrounds, chrome drip rails and front quarterlights.
- Original narrow vertical/sloping C-pillar ventilation slots rather than later large horizontal slots.
- Broad black/slatted grille, twin rectangular headlights, thin chrome bumper and rubber overriders; no race fog lights or Gordini stripes.
- Small wide rectangular tail lamps, Renault rear badging and central plate.
- Narrow wheels, deep-sidewall tires and real open wheel arches; no solid box fills the wheels.

Reference photos/PDFs are temporary research files only and are not shipped in the game. The generated geometry is authored in TypeScript and shares the existing editable paint, roundness, lighting and disposal pipeline.

## Garage comparison pass

Viewed the integrated model in the actual garage at front, side, rear and three-quarter angles, including both ends of the softness slider. Compared those renders to the brochure's matching views and Renault Argentina's studio photograph. The comparison caught initially occluded/thin C-pillar vents, missing windshield wipers and overly square lamp corners; those were revised and the garage views checked again. Confirmed the separate boot, hood/cabin proportions, narrow track, four-door read and clear wheel openings. Pillar/trim thickness remains intentionally exaggerated slightly for low-poly readability, and the opaque stylised glass does not reproduce the real interior.
