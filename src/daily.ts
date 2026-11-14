/**
 * Daily Prism: one procedurally generated puzzle per calendar day.
 *
 * The generator builds the answer first: a random beam path with three
 * mirrors (two palms plus one freeze), then places blue crystals along the
 * bounces. Every candidate is checked with the real tracer, so the puzzle is
 * always solvable. The same date always gives the same puzzle.
 */
import {
  BeamTrace,
  mirrorNormalFor,
  traceBeam,
  type BoxObstacle,
  type MirrorDisc,
  type SphereTarget,
} from './beam.ts';
import {
  CRYSTAL_AIM_ASSIST,
  CRYSTAL_RADIUS,
  MIRROR_RADIUS,
  type LevelDef,
  type Vec3,
} from './levels.ts';

/** Same board slab the game uses, so a path cannot dive through the board. */
const BOARD_SLAB: BoxObstacle = {
  minX: -0.25,
  minY: -0.035,
  minZ: -0.25,
  maxX: 0.25,
  maxY: 0,
  maxZ: 0.25,
};

/** Seated reach above the board. */
const MIRROR_RADIUS_LIMIT = 0.24;
const MIRROR_MIN_Y = 0.1;
const MIRROR_MAX_Y = 0.36;

function hashString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Local date as YYYY-MM-DD. */
export function todayKey(date = new Date()): string {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const dist = (a: Vec3, b: Vec3) => len(sub(a, b));
const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

function turnAngleDeg(inDir: Vec3, outDir: Vec3): number {
  const c =
    (inDir[0] * outDir[0] + inDir[1] * outDir[1] + inDir[2] * outDir[2]) /
    (len(inDir) * len(outDir));
  return (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI;
}

function inMirrorVolume(p: Vec3): boolean {
  return (
    Math.hypot(p[0], p[2]) <= MIRROR_RADIUS_LIMIT &&
    p[1] >= MIRROR_MIN_Y &&
    p[1] <= MIRROR_MAX_Y
  );
}

function randomMirrorPoint(rand: () => number): Vec3 {
  const angle = rand() * Math.PI * 2;
  const r = 0.08 + rand() * (MIRROR_RADIUS_LIMIT - 0.08);
  return [
    Math.cos(angle) * r,
    MIRROR_MIN_Y + rand() * (MIRROR_MAX_Y - MIRROR_MIN_Y),
    Math.sin(angle) * r,
  ];
}

function tryGenerate(rand: () => number, key: string): LevelDef | null {
  // Emitter: half the days it rises from the board, half it fires from the rim.
  let emitterPos: Vec3;
  let emitterDir: Vec3;
  if (rand() < 0.5) {
    const a = rand() * Math.PI * 2;
    const r = rand() * 0.16;
    emitterPos = [Math.cos(a) * r, 0.015, Math.sin(a) * r];
    emitterDir = [0, 1, 0];
  } else {
    const a = rand() * Math.PI * 2;
    emitterPos = [Math.cos(a) * 0.22, 0.08 + rand() * 0.1, Math.sin(a) * 0.22];
    const toward: Vec3 = [
      (rand() - 0.5) * 0.12,
      emitterPos[1],
      (rand() - 0.5) * 0.12,
    ];
    const d = sub(toward, emitterPos);
    const l = len(d);
    emitterDir = [d[0] / l, d[1] / l, d[2] / l];
  }

  // First mirror sits on the emitter ray.
  const firstT = emitterDir[1] > 0.5 ? 0.12 + rand() * 0.22 : 0.12 + rand() * 0.18;
  const m1: Vec3 = [
    emitterPos[0] + emitterDir[0] * firstT,
    emitterPos[1] + emitterDir[1] * firstT,
    emitterPos[2] + emitterDir[2] * firstT,
  ];
  if (!inMirrorVolume(m1)) return null;

  const path: Vec3[] = [m1];
  let prev = emitterPos;
  for (let i = 0; i < 3; i++) {
    const current = path[path.length - 1];
    let found: Vec3 | null = null;
    for (let attempt = 0; attempt < 30 && !found; attempt++) {
      // The last point is only an aim target, so it may sit outside reach.
      const candidate =
        i < 2
          ? randomMirrorPoint(rand)
          : lerp(current, randomMirrorPoint(rand), 1.6);
      const seg = dist(candidate, current);
      if (seg < 0.16 || seg > 0.42) continue;
      const turn = turnAngleDeg(sub(current, prev), sub(candidate, current));
      if (turn < 55 || turn > 145) continue;
      found = candidate;
    }
    if (!found) return null;
    prev = current;
    path.push(found);
  }

  // Crystals: one on each bounce segment, away from the mirrors.
  // Fisher-Yates with a fixed number of draws, so every JS engine agrees.
  const notes = [0, 1, 2, 3, 4, 5, 6, 7];
  for (let i = notes.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = notes[i];
    notes[i] = notes[j];
    notes[j] = tmp;
  }
  const crystals: Vec3[] = [];
  for (let i = 0; i < 3; i++) {
    const t = 0.38 + rand() * 0.24;
    const c = lerp(path[i], path[i + 1], t);
    if (Math.hypot(c[0], c[2]) > 0.25 || c[1] < 0.06 || c[1] > 0.42) return null;
    crystals.push(c);
  }
  for (let i = 0; i < crystals.length; i++) {
    for (let j = i + 1; j < crystals.length; j++) {
      if (dist(crystals[i], crystals[j]) < 0.09) return null;
    }
    for (let m = 0; m < 3; m++) {
      if (dist(crystals[i], path[m]) < MIRROR_RADIUS + 0.02) return null;
    }
    if (dist(crystals[i], emitterPos) < 0.08) return null;
  }

  // The emitter's own ray must not light a crystal by itself: the puzzle
  // should need the mirrors.
  const level: LevelDef = {
    id: `daily-${key}`,
    title: 'Daily Prism',
    tip: 'A new puzzle every day. Three blue notes, one freeze.',
    emitter: { pos: round3(emitterPos), dir: round3(emitterDir) },
    crystals: crystals.map((c, i) => ({
      pos: round3(c),
      note: notes[i],
      kind: 'pulse' as const,
    })),
    blockers: [],
    freezes: 1,
    par: 1,
    solutions: [path.map(round3)],
  };
  return validates(level) ? level : null;
}

function round3(v: Vec3): Vec3 {
  return [
    Math.round(v[0] * 1000) / 1000,
    Math.round(v[1] * 1000) / 1000,
    Math.round(v[2] * 1000) / 1000,
  ];
}

/** True when the stored solution lights every crystal and the bare beam lights none. */
export function validates(level: LevelDef): boolean {
  const crystals: SphereTarget[] = level.crystals.map((c) => ({
    x: c.pos[0],
    y: c.pos[1],
    z: c.pos[2],
    radius: CRYSTAL_RADIUS + CRYSTAL_AIM_ASSIST,
  }));
  const e = level.emitter;
  const dl = len(e.dir);
  const dir: Vec3 = [e.dir[0] / dl, e.dir[1] / dl, e.dir[2] / dl];
  const trace = new BeamTrace(crystals.length, 4);

  traceBeam(e.pos[0], e.pos[1], e.pos[2], dir[0], dir[1], dir[2], [], crystals, [BOARD_SLAB], trace);
  for (let i = 0; i < crystals.length; i++) if (trace.crystalHit[i]) return false;

  const path = level.solutions[0];
  const mirrors: MirrorDisc[] = [];
  let prev: Vec3 = e.pos;
  for (let i = 0; i < path.length - 1; i++) {
    const n = mirrorNormalFor(sub(path[i], prev), sub(path[i + 1], path[i]));
    mirrors.push({
      cx: path[i][0],
      cy: path[i][1],
      cz: path[i][2],
      nx: n[0],
      ny: n[1],
      nz: n[2],
      radius: MIRROR_RADIUS,
      active: true,
    });
    prev = path[i];
  }
  traceBeam(e.pos[0], e.pos[1], e.pos[2], dir[0], dir[1], dir[2], mirrors, crystals, [BOARD_SLAB], trace);
  for (let i = 0; i < mirrors.length; i++) {
    if (trace.mirrorAtPoint[i + 1] !== i) return false;
  }
  for (let i = 0; i < crystals.length; i++) if (!trace.crystalHit[i]) return false;
  return true;
}

/** The puzzle for a date key (YYYY-MM-DD). Deterministic. */
export function createDailyLevel(key = todayKey()): LevelDef {
  const rand = mulberry32(hashString(`palm-prism:${key}`));
  for (let attempt = 0; attempt < 4000; attempt++) {
    const level = tryGenerate(rand, key);
    if (level) return level;
  }
  // Practically unreachable; fall back to a fixed, known-good layout.
  return {
    id: `daily-${key}`,
    title: 'Daily Prism',
    tip: 'A new puzzle every day. Three blue notes, one freeze.',
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
  };
}
