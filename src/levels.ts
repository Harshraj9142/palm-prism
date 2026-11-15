/**
 * Palm Prism level data, in board-local metres.
 *
 * Board space: the board's top surface is y = 0, its radius is about 0.24 m,
 * and +Z points toward the player. Keep every crystal within reach of a seated
 * player (|x|,|z| <= 0.24, 0.05 <= y <= 0.4).
 *
 * Crystal kinds:
 *  - `stay`  (amber): charge it once and it stays lit for the rest of the level.
 *  - `pulse` (teal): glows only while light flows through it. Every pulse
 *    crystal must be lit at the same moment.
 */

export type Vec3 = [number, number, number];

export type CrystalKind = 'stay' | 'pulse';

export interface CrystalDef {
  pos: Vec3;
  /** Index into the pentatonic scale in audio.ts. */
  note: number;
  kind: CrystalKind;
}

export interface BlockerDef {
  min: Vec3;
  max: Vec3;
}

export interface LevelDef {
  id: string;
  title: string;
  /** One short line shown on the HUD. No walls of text. */
  tip: string;
  emitter: { pos: Vec3; dir: Vec3 };
  crystals: CrystalDef[];
  blockers: BlockerDef[];
  /** Mirrors the player may freeze in this level. */
  freezes: number;
  /** Freezes used for a 3-star clear. */
  par: number;
  /** Ghost mirror shown until the first crystal lights (onboarding). */
  hint?: { center: Vec3; toward: Vec3 };
  /**
   * Known solutions, used only by scripts/verify-levels.ts. Each entry is a
   * beam path: mirror centres in order, then a far point the last bounce aims
   * at. Several entries mean the crystals can be lit one path at a time
   * (only valid when every crystal is `stay`).
   */
  solutions: Vec3[][];
  /** `harp`: a free-play instrument with no goal (see HARP_LEVEL). */
  mode?: 'harp';
}

/** The first levels are short lessons, one idea each, with a ghost hint. */
export const TUTORIAL_COUNT = 3;

export const LEVELS: LevelDef[] = [
  // ------------------------------------------------------------- Lessons
  {
    id: 'lesson-palm',
    title: 'The Palm Mirror',
    tip: 'Hold a palm flat over the lamp: the light bounces off it. Tilt toward the amber crystal.',
    emitter: { pos: [0, 0.015, 0.02], dir: [0, 1, 0] },
    crystals: [{ pos: [0.13, 0.16, 0.02], note: 0, kind: 'stay' }],
    blockers: [],
    freezes: 0,
    par: 0,
    hint: { center: [0, 0.16, 0.02], toward: [0.13, 0.16, 0.02] },
    solutions: [[[0, 0.16, 0.02], [0.3, 0.16, 0.02]]],
  },
  {
    id: 'lesson-teal',
    title: 'Teal Sings',
    tip: 'Teal crystals glow only while light flows through them. Hold the beam steady.',
    emitter: { pos: [0, 0.015, 0.02], dir: [0, 1, 0] },
    crystals: [{ pos: [-0.14, 0.2, -0.06], note: 2, kind: 'pulse' }],
    blockers: [],
    freezes: 0,
    par: 0,
    hint: { center: [0, 0.2, 0.02], toward: [-0.14, 0.2, -0.06] },
    solutions: [[[0, 0.2, 0.02], [-0.28, 0.2, -0.14]]],
  },
  {
    id: 'lesson-freeze',
    title: 'Leave a Mirror',
    tip: 'Pinch to freeze your palm as a brass mirror, then use that hand again.',
    emitter: { pos: [0, 0.015, 0.04], dir: [0, 1, 0] },
    crystals: [
      { pos: [-0.09, 0.2, 0.04], note: 1, kind: 'pulse' },
      { pos: [-0.18, 0.2, -0.13], note: 4, kind: 'pulse' },
    ],
    blockers: [],
    freezes: 1,
    par: 1,
    hint: { center: [0, 0.2, 0.04], toward: [-0.18, 0.2, 0.04] },
    solutions: [[[0, 0.2, 0.04], [-0.18, 0.2, 0.04], [-0.18, 0.2, -0.4]]],
  },
  // -------------------------------------------------------------- Levels
  {
    id: 'first-light',
    title: 'First Light',
    tip: 'Hold your palm over the lamp, then tilt it toward the amber crystal.',
    emitter: { pos: [0, 0.015, 0], dir: [0, 1, 0] },
    crystals: [{ pos: [0.17, 0.2, -0.06], note: 0, kind: 'stay' }],
    blockers: [],
    freezes: 0,
    par: 0,
    hint: { center: [0, 0.2, 0], toward: [0.17, 0.2, -0.06] },
    solutions: [[[0, 0.2, 0], [0.34, 0.2, -0.12]]],
  },
  {
    id: 'two-notes',
    title: 'Two Notes',
    tip: 'Every crystal is a note. Light them both.',
    emitter: { pos: [0, 0.015, 0.03], dir: [0, 1, 0] },
    crystals: [
      { pos: [-0.16, 0.17, -0.05], note: 1, kind: 'stay' },
      { pos: [0.15, 0.25, -0.1], note: 3, kind: 'stay' },
    ],
    blockers: [],
    freezes: 0,
    par: 0,
    hint: { center: [0, 0.17, 0.03], toward: [-0.16, 0.17, -0.05] },
    solutions: [
      [[0, 0.17, 0.03], [-0.32, 0.17, -0.13]],
      [[0, 0.25, 0.03], [0.3, 0.25, -0.23]],
    ],
  },
  {
    id: 'side-light',
    title: 'Side Light',
    tip: 'This lamp lies on its side. Turn your palm to meet it.',
    emitter: { pos: [-0.22, 0.12, 0.04], dir: [1, 0, 0] },
    crystals: [
      { pos: [0.02, 0.3, -0.14], note: 2, kind: 'stay' },
      { pos: [0.16, 0.05, -0.16], note: 4, kind: 'stay' },
    ],
    blockers: [],
    freezes: 0,
    par: 0,
    solutions: [
      [[0.05, 0.12, 0.04], [-0.01, 0.48, -0.32]],
      [[0.12, 0.12, 0.04], [0.2, -0.02, -0.36]],
    ],
  },
  {
    id: 'over-the-wall',
    title: 'Over the Wall',
    tip: "One hand can't reach. Use both: each palm is a mirror.",
    emitter: { pos: [0.13, 0.015, 0.05], dir: [0, 1, 0] },
    crystals: [{ pos: [-0.15, 0.08, 0], note: 5, kind: 'stay' }],
    blockers: [{ min: [-0.025, 0, -0.14], max: [0.005, 0.3, 0.14] }],
    freezes: 0,
    par: 0,
    solutions: [[[0.13, 0.36, 0.05], [-0.15, 0.36, 0], [-0.15, -0.2, 0]]],
  },
  {
    id: 'hold-the-light',
    title: 'Hold the Light',
    tip: 'Teal crystals sing only while lit. Light both at once.',
    emitter: { pos: [0, 0.015, 0.06], dir: [0, 1, 0] },
    crystals: [
      { pos: [-0.12, 0.22, 0.06], note: 0, kind: 'pulse' },
      { pos: [-0.2, 0.22, -0.12], note: 2, kind: 'pulse' },
    ],
    blockers: [],
    freezes: 1,
    par: 0,
    solutions: [[[0, 0.22, 0.06], [-0.24, 0.22, 0.06], [-0.16, 0.22, -0.3]]],
  },
  {
    id: 'three-notes',
    title: 'Three Notes',
    tip: 'Three bounces, two hands. Pinch to leave a mirror behind.',
    emitter: { pos: [0.16, 0.015, 0.1], dir: [0, 1, 0] },
    crystals: [
      { pos: [0, 0.3, 0.1], note: 1, kind: 'pulse' },
      { pos: [-0.16, 0.3, -0.03], note: 3, kind: 'pulse' },
      { pos: [0, 0.19, -0.16], note: 5, kind: 'pulse' },
    ],
    blockers: [],
    freezes: 1,
    par: 1,
    solutions: [
      [
        [0.16, 0.3, 0.1],
        [-0.16, 0.3, 0.1],
        [-0.16, 0.3, -0.16],
        [0.48, -0.14, -0.16],
      ],
    ],
  },
  {
    id: 'around-the-pillar',
    title: 'Around the Pillar',
    tip: 'Bend the light around the pillar.',
    emitter: { pos: [-0.22, 0.1, 0.1], dir: [1, 0, 0] },
    crystals: [
      { pos: [0.12, 0.1, 0.1], note: 4, kind: 'pulse' },
      { pos: [-0.12, 0.18, -0.17], note: 1, kind: 'pulse' },
    ],
    blockers: [{ min: [-0.04, 0, -0.09], max: [0.04, 0.3, -0.01] }],
    freezes: 1,
    par: 0,
    solutions: [
      [
        [0.2, 0.1, 0.1],
        [0.2, 0.1, -0.17],
        [-0.44, 0.26, -0.17],
      ],
    ],
  },
  {
    id: 'constellation',
    title: 'Constellation',
    tip: 'Four notes. Leave mirrors behind as you go.',
    emitter: { pos: [0.18, 0.015, -0.12], dir: [0, 1, 0] },
    crystals: [
      { pos: [0, 0.26, -0.12], note: 0, kind: 'pulse' },
      { pos: [-0.18, 0.26, 0], note: 2, kind: 'pulse' },
      { pos: [-0.03, 0.19, 0.12], note: 4, kind: 'pulse' },
      { pos: [0.12, 0.22, 0.02], note: 6, kind: 'pulse' },
    ],
    blockers: [],
    freezes: 2,
    par: 2,
    solutions: [
      [
        [0.18, 0.26, -0.12],
        [-0.18, 0.26, -0.12],
        [-0.18, 0.26, 0.12],
        [0.12, 0.12, 0.12],
        [0.12, 0.42, -0.18],
      ],
    ],
  },
  {
    id: 'zigzag',
    title: 'Zigzag',
    tip: 'Across, up and back. The last note only sings while the whole path holds.',
    emitter: { pos: [0.2, 0.015, 0.12], dir: [0, 1, 0] },
    crystals: [
      { pos: [0, 0.14, 0.12], note: 0, kind: 'stay' },
      { pos: [-0.2, 0.22, -0.015], note: 3, kind: 'stay' },
      { pos: [0.1, 0.3, -0.15], note: 6, kind: 'pulse' },
    ],
    blockers: [],
    freezes: 1,
    par: 1,
    solutions: [
      [
        [0.2, 0.14, 0.12],
        [-0.2, 0.14, 0.12],
        [-0.2, 0.3, -0.15],
        [0.4, 0.3, -0.15],
      ],
    ],
  },
  {
    id: 'the-gate',
    title: 'The Gate',
    tip: 'A wall stands in the lamp’s way. Lead the light around the gate.',
    emitter: { pos: [-0.22, 0.1, -0.1], dir: [1, 0, 0] },
    crystals: [
      { pos: [0.08, 0.1, 0.12], note: 2, kind: 'pulse' },
      { pos: [0.22, 0.1, -0.1], note: 5, kind: 'pulse' },
    ],
    blockers: [{ min: [-0.02, 0, -0.2], max: [0.02, 0.3, 0] }],
    freezes: 1,
    par: 1,
    solutions: [
      [
        [-0.1, 0.1, -0.1],
        [-0.1, 0.1, 0.12],
        [0.22, 0.1, 0.12],
        [0.22, 0.1, -0.4],
      ],
    ],
  },
  {
    id: 'high-wire',
    title: 'High Wire',
    tip: 'Reach high, then bring the light down toward you.',
    emitter: { pos: [0, 0.015, -0.15], dir: [0, 1, 0] },
    crystals: [
      { pos: [0, 0.38, 0], note: 4, kind: 'pulse' },
      { pos: [0, 0.12, 0.15], note: 1, kind: 'pulse' },
    ],
    blockers: [],
    freezes: 1,
    par: 0,
    solutions: [[[0, 0.38, -0.15], [0, 0.38, 0.15], [0, -0.3, 0.15]]],
  },
  {
    id: 'north-star',
    title: 'North Star',
    tip: 'Four bounces, four notes, all at once. Freeze as you go.',
    emitter: { pos: [-0.18, 0.015, 0.12], dir: [0, 1, 0] },
    crystals: [
      { pos: [0, 0.2, 0.12], note: 0, kind: 'pulse' },
      { pos: [0.18, 0.2, -0.02], note: 2, kind: 'pulse' },
      { pos: [0, 0.26, -0.16], note: 4, kind: 'pulse' },
      { pos: [-0.18, 0.32, 0.1], note: 7, kind: 'pulse' },
    ],
    blockers: [],
    freezes: 2,
    par: 2,
    solutions: [
      [
        [-0.18, 0.2, 0.12],
        [0.18, 0.2, 0.12],
        [0.18, 0.2, -0.16],
        [-0.18, 0.32, -0.16],
        [-0.18, 0.32, 0.4],
      ],
    ],
  },
];

/** Visual radius of a crystal. */
export const CRYSTAL_RADIUS = 0.028;
/** Extra forgiveness so a beam that grazes a crystal still counts. */
export const CRYSTAL_AIM_ASSIST = 0.016;
/** Radius of a palm or frozen mirror. */
export const MIRROR_RADIUS = 0.075;
/** Seconds of light a gold crystal needs before it stays lit. */
export const CHARGE_SECONDS = 0.6;
/** Seconds every blue crystal must glow together to clear the level. */
export const HOLD_SECONDS = 0.5;

/**
 * Light Harp: eight crystals in an arc around the lamp, one per note of the
 * scale, low on the left to high on the right. Sweep a reflected beam across
 * them to play. There is no goal; freezes hold notes for chords.
 */
export const HARP_LEVEL: LevelDef = (() => {
  const centre: Vec3 = [0, 0.2, 0.05];
  const crystals: CrystalDef[] = [];
  const solutions: Vec3[][] = [];
  for (let i = 0; i < 8; i++) {
    const a = Math.PI + 0.25 + (i / 7) * (Math.PI - 0.5);
    const p: Vec3 = [
      Math.round(Math.cos(a) * 0.19 * 1000) / 1000,
      Math.round((0.2 + Math.sin(i * 1.3) * 0.025) * 1000) / 1000,
      Math.round((0.05 + Math.sin(a) * 0.19) * 1000) / 1000,
    ];
    crystals.push({ pos: p, note: i, kind: 'pulse' });
    // One reflection from a palm above the lamp reaches each string.
    solutions.push([centre, [p[0] * 2 - centre[0], p[1] * 2 - centre[1], p[2] * 2 - centre[2]]]);
  }
  return {
    id: 'light-harp',
    title: 'Light Harp',
    tip: 'Sweep the light across the crystals to play. Pinch to hold a note.',
    emitter: { pos: [0, 0.015, 0.05], dir: [0, 1, 0] },
    crystals,
    blockers: [],
    freezes: 4,
    par: 4,
    mode: 'harp',
    solutions,
  };
})();
