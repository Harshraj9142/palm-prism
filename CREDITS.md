# Credits

Palm Prism's board, lamp, beam, mirrors, sky, floor, HUD and sounds are still
generated in code. The assets below are downloaded, licensed files layered on
top. They are visual only, and `?assets=0` in the URL turns all of them off.

| Asset | Author | Source | License | What we changed | File |
| --- | --- | --- | --- | --- | --- |
| LowPoly Crystals | Aredon | https://opengameart.org/content/lowpoly-crystals | CC0 1.0 | Converted OBJ to glTF. Took the tallest blue shard (amber crystal); the green cluster (teal crystal) and the pink cluster with its base (room decor) are kept as fallbacks if the Sketchfab models fail to load. Recentred, rescaled, Meshopt-compressed. Original colours replaced by our own materials. | `public/assets/crystals/crystals.glb` |
| Planispheric astrolabe | Virtual Museums of Małopolska (model by Stanisław Ogarek) | https://sketchfab.com/3d-models/planispheric-astrolabe-f6dac1748e964711ad4331767317d7b9 | CC BY 4.0 | Removed a stray line primitive and the clearcoat layer, textures converted to WebP (1024 px), Meshopt-compressed. Shown as a display piece hung from a code-built brass stand. | `public/assets/models/astrolabe.glb` |
| orrery | korolevalidia | https://sketchfab.com/3d-models/orrery-d0458d3a7d544596893891fc227d23d2 | CC BY 4.0 | Textures converted to WebP (1024 px), Meshopt-compressed. The arms turn slowly at runtime, and its planets are dressed with the Solar System Scope maps below. | `public/assets/models/orrery.glb` |
| Crystal | Kyyy_24 | https://sketchfab.com/3d-models/crystal-4fe689d72a5945fda06bbdb7428d9e71 | CC BY 4.0 | Geometry only (textures and materials removed), shards merged, recentred and scaled to the crystal radius, Meshopt-compressed. Used for teal crystals with our own glass material. | `public/assets/models/teal-crystal.glb` |
| Quartz Cluster | University Libraries at Virginia Tech | https://sketchfab.com/3d-models/quartz-cluster-8a863657e61949dc8ad519d868b74a02 | CC BY 4.0 | Simplified from 199,902 to 13,376 triangles, texture converted to WebP (1024 px), Meshopt-compressed, lit material instead of unlit. Two pieces at the room's edge. | `public/assets/models/quartz.glb` |
| Generic hand (left and right) | WebXR Input Profiles contributors (Copyright (c) 2019 Amazon) | https://github.com/immersive-web/webxr-input-profiles, `@webxr-input-profiles/assets@1.0.20` (`dist/profiles/generic-hand/`) | MIT (copy in `public/assets/hands/generic-hand/LICENSE`) | Self-hosted unchanged. At runtime, a warm translucent material and outline colour replace the default look. | `public/assets/hands/generic-hand/left.glb`, `right.glb` |
| Moon Lab HDRI (1K) | Greg Zaal, Poly Haven | https://polyhaven.com/a/moon_lab | CC0 1.0 | Unchanged file. At runtime, values are clamped to 2.0 and the map is used only for reflections, scaled down to stay a dark night room. | `public/assets/env/moon_lab_1k.hdr` |
| Planet textures: Jupiter, Saturn, Saturn ring alpha, Mars, Earth day map, Moon (2K) | Solar System Scope (INOVE) | https://www.solarsystemscope.com/textures/ | CC BY 4.0 | Resized to 1024×512 (ring 1024×64) and converted to WebP. Mapped onto spheres over the orrery's planets. | `public/assets/planets/*.webp` |
| Basis Universal transcoder | Binomial LLC, via three.js | https://github.com/mrdoob/three.js/tree/r185/examples/jsm/libs/basis | Apache 2.0 | Self-hosted copy from the `three` package, so KTX2 textures need no CDN. | `public/assets/decoders/basis/` |

If the Sketchfab orrery fails to load, a code-built brass orrery
(`src/asset-props.ts`) carries the planets instead.

Licences:
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) ·
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) ·
[MIT](https://opensource.org/license/mit) ·
[Apache 2.0](https://www.apache.org/licenses/LICENSE-2.0)
