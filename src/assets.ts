import { defineAssets } from '@iwsdk/core';

// Palm Prism builds all of its geometry, textures and UI at runtime
// (src/prism-visuals.ts, src/hud.ts) and generates its sounds (src/audio.ts),
// so there is nothing to download or place from the manifest.
export default defineAssets({});
