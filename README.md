# Palm Prism

**Your hands are the mirrors.** A hands-first VR puzzle game for Meta Quest,
built with the Immersive Web SDK (WebXR) for the Meta VR Start Developer
Competition 2026 (Gaming track, New Experience division).

A beam of light rises from a small floating board. Hold your palm in the beam
and tilt it: your hand reflects the light. Guide it through crystals to make
them sing. Pinch to freeze a mirror where your hand was, then use that hand
again. No controllers needed.

## Run it

```sh
npm install
npm run dev
```

`npm run dev` starts the dev server at `https://localhost:8081` and opens a
managed browser with the IWER emulator (a simulated Quest 3). Stop it with
`npm run dev:down`.

**On a Quest:** connect the headset to the same Wi-Fi, open the `Network` URL
printed by `npx @iwsdk/cli dev status` in Quest Browser, accept the local
certificate warning, then press **Enter VR**.

## How to play

| Action | How |
| --- | --- |
| Reflect light | Hold a palm in the beam; tilt to aim. Both palms work. |
| Freeze a mirror | Pinch while your palm is over the board. Limited per level. |
| Gold crystal | Hold light on it briefly; it stays lit. |
| Blue crystal | Glows only while light flows through it. Light every blue crystal at once. |
| Reset / Recenter / Next | Point at the panel behind the board and pinch. |

Stars: clear a level within its freeze par for 3 stars. Every star you earn
adds a star to your sky, and clearing a level each day grows your streak.

## Dev shortcuts (dev server only)

Press **N** (next level), **P** (previous) or **R** (reset) in the browser
window. Useful for testing and for recording the demo video.

## Project layout

| File | What it does |
| --- | --- |
| `src/prism-game.ts` | Main game system: palms to mirrors, beam, crystals, freezes, level flow, HUD |
| `src/beam.ts` | Pure beam-tracing math (no Three.js), shared with the level checker |
| `src/levels.ts` | The 8 levels plus a known solution for each |
| `src/prism-visuals.ts` | Procedural board, crystals, beam, mirrors, sky and floor |
| `src/audio.ts` | Generated sounds (no audio files) |
| `src/progress.ts` | Unlocks, stars and daily streak in localStorage |
| `public/ui/hud.uikitml` | In-headset HUD panel |
| `public/ui/welcome.uikitml` | Browser landing panel |
| `scripts/verify-levels.ts` | Proves every level is solvable with the real tracer |

## Checks

```sh
npm run typecheck
node scripts/verify-levels.ts
npm run build
```

## Adding a level

Add an entry to `LEVELS` in `src/levels.ts` (board-local metres: top surface
is y = 0, radius about 0.24, +Z toward the player) with at least one entry in
`solutions`, then run `node scripts/verify-levels.ts`.

## Deploy (for judges)

`npm run build` writes a static site to `dist/`. Host it on GitHub Pages,
Vercel or any static host over HTTPS; see
https://iwsdk.dev/guides/02-testing-experience.html and the IWSDK hosting
guide.
