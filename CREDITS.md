# Credits

Palm Prism's board, lamp, beam, mirrors, sky, floor, HUD and sounds are still
generated in code. The assets below are downloaded, licensed files layered on
top. They are visual only, and `?assets=0` in the URL turns all of them off.

| Asset | Author | Source | License | What we changed | File |
| --- | --- | --- | --- | --- | --- |
| LowPoly Crystals | Aredon | https://opengameart.org/content/lowpoly-crystals | CC0 1.0 | Converted OBJ to glTF. Took the tallest blue shard (amber crystal), the green cluster without its base (teal crystal) and the pink cluster with its base (room decor). Recentred, rescaled, Meshopt-compressed. Original colours replaced by our own materials. | `public/assets/crystals/crystals.glb` |
| Generic hand (left and right) | WebXR Input Profiles contributors (Copyright (c) 2019 Amazon) | https://github.com/immersive-web/webxr-input-profiles, `@webxr-input-profiles/assets@1.0.20` (`dist/profiles/generic-hand/`) | MIT (copy in `public/assets/hands/generic-hand/LICENSE`) | Self-hosted unchanged. At runtime, a warm translucent material and outline colour replace the default look. | `public/assets/hands/generic-hand/left.glb`, `right.glb` |
| Moon Lab HDRI (1K) | Greg Zaal, Poly Haven | https://polyhaven.com/a/moon_lab | CC0 1.0 | Unchanged file. At runtime, values are clamped to 2.0 and the map is used only for reflections, scaled down to stay a dark night room. | `public/assets/env/moon_lab_1k.hdr` |
| Planet textures: Jupiter, Saturn, Saturn ring alpha, Mars, Earth day map, Moon (2K) | Solar System Scope (INOVE) | https://www.solarsystemscope.com/textures/ | CC BY 4.0 | Resized to 1024×512 (ring 1024×64) and converted to WebP. | `public/assets/planets/*.webp` |
| Basis Universal transcoder | Binomial LLC, via three.js | https://github.com/mrdoob/three.js/tree/r185/examples/jsm/libs/basis | Apache 2.0 | Self-hosted copy from the `three` package, so KTX2 textures need no CDN. | `public/assets/decoders/basis/` |

The brass orrery that holds the planets is built in code
(`src/asset-props.ts`).

Licences:
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) ·
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) ·
[MIT](https://opensource.org/license/mit) ·
[Apache 2.0](https://www.apache.org/licenses/LICENSE-2.0)
