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
| Restart / Levels / Daily / Harp / Next / Options | Point at the paper card to the left of the board and pinch. **Levels** opens every level directly; **Center** (in Options) re-centres the board. |

Stars: clear a level within its freeze par for 3 stars. Every star you earn
adds a star to your sky, and clearing a level each day grows your streak.

**Light Harp:** a free-play instrument. Eight crystals in an arc each ring one
note; sweep the reflected beam across them to play, and freeze mirrors to hold
notes for chords.

**Options (gear button):** *Hold to freeze* (keep a palm still for two seconds
instead of pinching), *One hand* (an extra freeze in every level, so every level
can be solved with one hand), *Raise* / *Lower* to move the board, and *Center*
to re-centre it in front of you.

**Levels:** every level is open from the start, so anyone (judges included) can
jump straight to the freeze puzzles, the Light Harp or the Daily Prism.

**First level:** a glass pane above the lamp tilts on its own and a dashed line
shows where the light will go, so new players learn the move without reading.

**Daily Prism:** a new puzzle every day, generated from the date (same puzzle
on every device). The generator builds the answer first, then places the
crystals on it, so every daily puzzle is solvable.

## Dev shortcuts (dev server only)

In the browser window: **1-8** jump to a level, **N** / **P** next or previous,
**R** reset, **D** today's Daily Prism, **H** Light Harp, **I** log the beam path to the console.
Useful for testing and for recording the demo video.

## Project layout

| File | What it does |
| --- | --- |
| `src/prism-game.ts` | Main game system: palms to mirrors, beam, crystals, freezes, level flow, HUD |
| `src/beam.ts` | Pure beam-tracing math (no Three.js), shared with the level checker |
| `src/levels.ts` | The 8 levels and the Light Harp, each with a known solution |
| `src/daily.ts` | Daily Prism generator (seeded by date, self-validating) |
| `src/prism-visuals.ts` | Night-observatory look: brass astrolabe board, lamplight beam with dust, crystals, mirrors, sky with your constellation, floor |
| `src/audio.ts` | Generated sounds (no audio files) |
| `src/progress.ts` | Unlocks, stars and daily streak in localStorage |
| `src/settings.ts` | Accessibility options in localStorage |
| `src/hud.ts` | Hand-drawn in-headset HUD card, buttons and floating level titles |
| `src/landing.ts`, `src/landing.css` | Browser landing page over the live 3D scene |
| `src/prism-button.ts` | ECS component for pressable HUD buttons |
| `scripts/verify-levels.ts` | Proves every level, and a year of daily puzzles, is solvable with the real tracer |

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
