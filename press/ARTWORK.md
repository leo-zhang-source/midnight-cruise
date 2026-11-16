# Store artwork provenance

The published cover and banner use the actual game renderer. No generated or repainted vehicle, background, lighting or effect is inserted. The title is the game's own polygonal MIDNIGHT word, neon Cruise path and 1986 plate, repositioned for the store format. The gameplay HUD is omitted.

## Source frame

- Replay seed: `2024`.
- Starting level: `0`.
- Timeline: [store-art-events.json](../tools/store-art-events.json), generated with `play(2024, 150, { nitro: true, seek: true, lv: 0 })` from [bot.mjs](../tools/bot.mjs).
- Time: `84.63750000000573` seconds, the first interceptor turn warning plus 0.6 seconds.
- World, cars and effects: the production classes in `js/world.js`, `js/gameview.js`, `js/car.js`, `js/vehicles.js` and `js/post.js`.
- Title geometry: `js/title.js` and `js/neon.js`.
- [Artwork renderer](../tools/store-art.html), with layout in [store-art.js](../tools/store-art.js).

## Reproduce

Serve the repository locally, open these paths, and use **Download PNG**:

- Cover, 1260 × 1000: `/tools/store-art.html?scene=interceptor&w=1260&h=1000&zoom=0.94&xshift=-0.45`
- Banner, 960 × 400: `/tools/store-art.html?scene=interceptor&layout=banner&w=960&h=400`

The cover changes the lens field of view by a factor of 0.94 and shifts the framing to keep the police car in view. These are camera framing changes; the replay's object positions, geometry, palette and effects are unchanged. The 630 × 500 cover is a downscaled export of the full cover.

## Body image selection

The introduction uses `screenshot-05-searchlight.jpg` (blue night, avoiding a searchlight) and `screenshot-07-nitro-trucks.jpg` (orange highway, nitro beside trucks). The second image contains no helicopter.
