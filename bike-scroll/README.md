# Concept car scroll site

Scroll-driven 3D site for the Khronos **Car Concept** model. React Three Fiber renders the
car, Framer Motion tracks scroll (`useScroll` + `useSpring`) and animates the text panels.
The camera flies between keyframes defined in `src/site.config.json`, and the paint-finish
dots switch the model's built-in `KHR_materials_variants`.

## Run

```bash
npm install
npm run dev
```

The model is `public/models/car.glb` (about 11 MB), downloaded from
https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CarConcept.
It is auto-centred and scaled, so you only tune camera angles. The car's nose points to +Z.

## Page content

The text below the 3D story (highlights, specs, finishes, FAQ, form copy, nav) lives in
`src/content.json`. The generator never touches it.

The speed test (`src/speedtest.js`) reads its targets (`t100`, `vmax`) from `speedTest` in
`src/content.json`. The specs chapter reads `specs`. Both are simulated demos.

## Generator

`src/site.config.json` is the whole site: copy, colours, camera angles, finishes, credit.
Regenerate a fresh layout with:

```bash
npm run generate -- --name "My Car" --sections 6 --accent "#00c2ff"
```

This **overwrites the sections** with an orbiting set of camera angles (back up your copy
first), then edit the text. Each section has `eyebrow`, `title`, `body`,
`align` (left/right/center, the car shifts to the opposite side) and
`camera.position` / `camera.target`. To use another model, change `model`, drop the file in
`public/models/`, and edit the camera angles. Remove `variants` if it has no material variants.

## License / credit

Car Concept is CC BY 4.0 (Khronos Group, based on a public-domain model by Unity Fan). The
credit footer comes from `credit` in the config; keep it. The license excludes the Khronos
logos and trademarks on the model.
