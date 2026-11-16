# Store artwork provenance

## Published cover and banner

The cover retains the previously generated purple PHANTOM and police pursuit illustration. The banner is a local edit of the original wide illustration, made with OpenAI's built-in image generation tool. The image generation CLI was not used.

These are promotional illustrations, not gameplay captures or assets used inside the game. The scene has a purple sports car, ground pursuit, a neon highway, palm silhouettes, wireframe hills and the MIDNIGHT CRUISE — 1986 title; there is no helicopter in either illustration.

- `cover-1260x1000.png`: storefront master; the original 1391 × 1131 image is centre-cropped to 1391 × 1104 and resized to the store's 1260 × 1000 format.
- `cover-630x500.png`: smaller storefront export of the same illustration.
- `banner-master.png`: the edited panoramic illustration at its original 1944 × 809 resolution.
- `banner-960.png`: the storefront export, resized to 960 × 400.

The banner retains the original large title and right-hand chase composition. Only the left title background is simplified into a softly blurred, nearly solid dark purple field, feathered into the existing scene. The square cover is unchanged. See the [exact banner edit prompt](banner-prompt.txt) for the full edit instructions.

## Gameplay screenshots

The introduction retains `screenshot-05-searchlight.jpg` (blue night, avoiding a searchlight) and `screenshot-07-nitro-trucks.jpg` (orange highway, nitro beside trucks). The second image contains no helicopter. All eight `screenshot-*.jpg` files are captures from the game with the HUD retained.

## Replay renderer

The repository also retains `tools/store-art.html`, `tools/store-art.js` and `tools/store-art-events.json` for reproducing the earlier game-rendered artwork. These helpers do not produce the currently published cover or banner.
