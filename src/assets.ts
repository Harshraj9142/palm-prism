import { defineAssets } from '@iwsdk/core';

// Palm Prism builds all of its geometry, textures and UI at runtime
// (src/prism-visuals.ts, src/hud.ts) and generates its sounds (src/audio.ts),
// so there is nothing to place from the manifest. The licensed props layered on
// top (src/asset-props.ts, CREDITS.md) load at runtime, outside the manifest,
// because they need the Meshopt decoder and a self-hosted KTX2 transcoder.
export default defineAssets({});
