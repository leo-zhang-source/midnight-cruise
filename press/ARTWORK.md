# Store artwork provenance

## Published cover and banner

The storefront uses the previously generated purple PHANTOM and police pursuit illustrations, restored at the developer's request. The images were created with OpenAI's built-in image generation tool using the game's visual design as reference. No new image generation was performed for this restoration.

These are promotional illustrations, not gameplay captures or assets used inside the game. The scene has a purple sports car, ground pursuit, a neon highway, palm silhouettes, wireframe hills and the MIDNIGHT CRUISE — 1986 title; there is no helicopter in either illustration.

- `cover-1260x1000.png`: storefront master; the original 1391 × 1131 image is centre-cropped to 1391 × 1104 and resized to the store's 1260 × 1000 format.
- `cover-630x500.png`: smaller storefront export of the same illustration.
- `banner-960.png`: the matching wide illustration resized from 1942 × 809 to 960 × 400.

The original compositions are restored without repainting or adding new elements.

## Gameplay screenshots

The introduction retains `screenshot-05-searchlight.jpg` (blue night, avoiding a searchlight) and `screenshot-07-nitro-trucks.jpg` (orange highway, nitro beside trucks). The second image contains no helicopter. All eight `screenshot-*.jpg` files are captures from the game with the HUD retained.

## Replay renderer

The repository also retains `tools/store-art.html`, `tools/store-art.js` and `tools/store-art-events.json` for reproducing the earlier game-rendered artwork. These helpers do not produce the currently published cover or banner.
