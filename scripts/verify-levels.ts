/**
 * Checks every level is solvable with the real tracing code.
 * Run: node scripts/verify-levels.ts
 *
 * For each authored solution path it builds mirrors at the given centres,
 * traces the emitter beam and confirms:
 *  - the first mirror sits on the emitter ray,
 *  - the beam reaches every mirror in order (nothing blocks it),
 *  - the mirror count fits two hands plus the level's freezes,
 *  - all crystals are lit (pulse crystals by a single path).
 */
import {
  BeamTrace,
  mirrorNormalFor,
  traceBeam,
  type BoxObstacle,
  type MirrorDisc,
  type SphereTarget,
} from '../src/beam.ts';
import {
  CRYSTAL_AIM_ASSIST,
  CRYSTAL_RADIUS,
  LEVELS,
  MIRROR_RADIUS,
  type Vec3,
} from '../src/levels.ts';

let failures = 0;

for (const level of LEVELS) {
  const crystals: SphereTarget[] = level.crystals.map((c) => ({
    x: c.pos[0],
    y: c.pos[1],
    z: c.pos[2],
    radius: CRYSTAL_RADIUS + CRYSTAL_AIM_ASSIST,
  }));
  // Same board slab the game adds, so a path cannot dive through the board.
  const boardSlab: BoxObstacle = {
    minX: -0.25,
    minY: -0.035,
    minZ: -0.25,
    maxX: 0.25,
    maxY: 0,
    maxZ: 0.25,
  };
  const boxes: BoxObstacle[] = level.blockers.map((b) => ({
    minX: b.min[0],
    minY: b.min[1],
    minZ: b.min[2],
    maxX: b.max[0],
    maxY: b.max[1],
    maxZ: b.max[2],
  }));
  boxes.unshift(boardSlab);
  const lit = new Array(crystals.length).fill(false);
  const problems: string[] = [];
  const hasPulse = level.crystals.some((c) => c.kind === 'pulse');

  if (hasPulse && level.solutions.length !== 1) {
    problems.push('pulse levels need one path that lights everything at once');
  }

  for (const path of level.solutions) {
    const mirrorCount = path.length - 1;
    if (mirrorCount > 2 + level.freezes) {
      problems.push(
        `path uses ${mirrorCount} mirrors but only ${2 + level.freezes} allowed`,
      );
    }
    const mirrors: MirrorDisc[] = [];
    let prev: Vec3 = level.emitter.pos;
    for (let i = 0; i < mirrorCount; i++) {
      const c = path[i];
      const next = path[i + 1];
      const inDir: Vec3 = [c[0] - prev[0], c[1] - prev[1], c[2] - prev[2]];
      const outDir: Vec3 = [next[0] - c[0], next[1] - c[1], next[2] - c[2]];
      const n = mirrorNormalFor(inDir, outDir);
      mirrors.push({
        cx: c[0],
        cy: c[1],
        cz: c[2],
        nx: n[0],
        ny: n[1],
        nz: n[2],
        radius: MIRROR_RADIUS,
        active: true,
      });
      prev = c;
    }

    const e = level.emitter;
    const dl = Math.hypot(...e.dir);
    const trace = new BeamTrace(crystals.length, mirrors.length + 1);
    traceBeam(
      e.pos[0],
      e.pos[1],
      e.pos[2],
      e.dir[0] / dl,
      e.dir[1] / dl,
      e.dir[2] / dl,
      mirrors,
      crystals,
      boxes,
      trace,
    );

    for (let i = 0; i < mirrorCount; i++) {
      if (trace.mirrorAtPoint[i + 1] !== i) {
        problems.push(
          `beam did not reach mirror ${i + 1} at [${path[i].join(', ')}]`,
        );
        break;
      }
    }
    for (let i = 0; i < crystals.length; i++) {
      if (trace.crystalHit[i]) lit[i] = true;
    }
    if (hasPulse) {
      const missing = level.crystals
        .map((c, i) => (c.kind === 'pulse' && !trace.crystalHit[i] ? i : -1))
        .filter((i) => i >= 0);
      if (missing.length) {
        problems.push(`pulse crystals not lit together: ${missing.join(', ')}`);
      }
    }
  }

  const unlit = lit.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
  if (unlit.length) problems.push(`crystals never lit: ${unlit.join(', ')}`);

  if (problems.length) {
    failures++;
    console.log(`FAIL ${level.id}`);
    for (const p of problems) console.log(`     - ${p}`);
  } else {
    console.log(
      `PASS ${level.id} (${level.crystals.length} crystals, ` +
        `${Math.max(...level.solutions.map((s) => s.length - 1))} mirrors)`,
    );
  }
}

console.log(failures ? `\n${failures} level(s) failed` : '\nAll levels solvable');
process.exit(failures ? 1 : 0);
