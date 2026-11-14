/**
 * Pure beam-tracing math for Palm Prism. No Three.js and no allocation per
 * call, so the game system can run it every frame and the level checker in
 * `scripts/verify-levels.ts` can run the exact same code under Node.
 *
 * All coordinates are in board-local space (metres, board top surface at y=0).
 */

export const MAX_BOUNCES = 10;
export const MAX_SEGMENT = 1.4;
const EPS = 1e-4;

/** A flat, two-sided circular mirror: a palm, a controller paddle or a frozen mirror. */
export interface MirrorDisc {
  cx: number;
  cy: number;
  cz: number;
  /** Unit normal. Sign does not matter, the mirror reflects on both faces. */
  nx: number;
  ny: number;
  nz: number;
  radius: number;
  active: boolean;
}

/** A crystal. Beams pass through crystals and light them up. */
export interface SphereTarget {
  x: number;
  y: number;
  z: number;
  radius: number;
}

/** An axis-aligned blocker in board space. Beams stop on it. */
export interface BoxObstacle {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

export class BeamTrace {
  /** xyz triples: the origin followed by the end of each segment. */
  readonly points = new Float32Array((MAX_BOUNCES + 2) * 3);
  pointCount = 0;
  /** For each segment end: index of the mirror it bounced off, or -1. */
  readonly mirrorAtPoint = new Int16Array(MAX_BOUNCES + 2);
  /** 1 when the beam passed through crystal i this trace. */
  readonly crystalHit: Uint8Array;
  /** 1 when mirror i was hit at least once this trace. */
  readonly mirrorHit: Uint8Array;

  constructor(maxCrystals = 16, maxMirrors = 16) {
    this.crystalHit = new Uint8Array(maxCrystals);
    this.mirrorHit = new Uint8Array(maxMirrors);
  }
}

/**
 * Trace one beam from (ox,oy,oz) along unit direction (dx,dy,dz).
 * Mirrors reflect it, boxes stop it, crystals are marked as hit when a
 * segment passes within their radius.
 */
export function traceBeam(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  mirrors: readonly MirrorDisc[],
  crystals: readonly SphereTarget[],
  boxes: readonly BoxObstacle[],
  out: BeamTrace,
): void {
  out.crystalHit.fill(0);
  out.mirrorHit.fill(0);
  out.points[0] = ox;
  out.points[1] = oy;
  out.points[2] = oz;
  out.mirrorAtPoint[0] = -1;
  out.pointCount = 1;

  let lastMirror = -1;
  for (let bounce = 0; bounce <= MAX_BOUNCES; bounce++) {
    let tMin = MAX_SEGMENT;
    let hitMirror = -1;

    for (let i = 0; i < mirrors.length; i++) {
      const m = mirrors[i];
      if (!m.active || i === lastMirror) continue;
      const denom = dx * m.nx + dy * m.ny + dz * m.nz;
      if (denom > -1e-6 && denom < 1e-6) continue;
      const t =
        ((m.cx - ox) * m.nx + (m.cy - oy) * m.ny + (m.cz - oz) * m.nz) / denom;
      if (t <= EPS || t >= tMin) continue;
      const px = ox + dx * t - m.cx;
      const py = oy + dy * t - m.cy;
      const pz = oz + dz * t - m.cz;
      if (px * px + py * py + pz * pz <= m.radius * m.radius) {
        tMin = t;
        hitMirror = i;
      }
    }

    let blocked = false;
    for (let i = 0; i < boxes.length; i++) {
      const t = rayBox(ox, oy, oz, dx, dy, dz, boxes[i]);
      if (t > EPS && t < tMin) {
        tMin = t;
        hitMirror = -1;
        blocked = true;
      }
    }

    for (let i = 0; i < crystals.length; i++) {
      if (segmentHitsSphere(ox, oy, oz, dx, dy, dz, tMin, crystals[i])) {
        out.crystalHit[i] = 1;
      }
    }

    const ex = ox + dx * tMin;
    const ey = oy + dy * tMin;
    const ez = oz + dz * tMin;
    const p = out.pointCount * 3;
    out.points[p] = ex;
    out.points[p + 1] = ey;
    out.points[p + 2] = ez;
    out.mirrorAtPoint[out.pointCount] = hitMirror;
    out.pointCount++;

    if (hitMirror < 0 || blocked || out.pointCount >= MAX_BOUNCES + 2) break;

    const m = mirrors[hitMirror];
    out.mirrorHit[hitMirror] = 1;
    const dn = dx * m.nx + dy * m.ny + dz * m.nz;
    dx -= 2 * dn * m.nx;
    dy -= 2 * dn * m.ny;
    dz -= 2 * dn * m.nz;
    const len = Math.hypot(dx, dy, dz) || 1;
    dx /= len;
    dy /= len;
    dz /= len;
    ox = ex;
    oy = ey;
    oz = ez;
    lastMirror = hitMirror;
  }
}

function segmentHitsSphere(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  len: number,
  s: SphereTarget,
): boolean {
  const vx = s.x - ox;
  const vy = s.y - oy;
  const vz = s.z - oz;
  let t = vx * dx + vy * dy + vz * dz;
  if (t < 0) t = 0;
  else if (t > len) t = len;
  const qx = vx - dx * t;
  const qy = vy - dy * t;
  const qz = vz - dz * t;
  return qx * qx + qy * qy + qz * qz <= s.radius * s.radius;
}

function rayBox(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  b: BoxObstacle,
): number {
  slabNear = -Infinity;
  slabFar = Infinity;
  if (!slab(ox, dx, b.minX, b.maxX)) return -1;
  if (!slab(oy, dy, b.minY, b.maxY)) return -1;
  if (!slab(oz, dz, b.minZ, b.maxZ)) return -1;
  return slabNear > 0 ? slabNear : -1;
}

// Scratch state for rayBox, kept at module scope so tracing never allocates.
let slabNear = -Infinity;
let slabFar = Infinity;

function slab(o: number, d: number, mn: number, mx: number): boolean {
  if (d > -1e-9 && d < 1e-9) return o >= mn && o <= mx;
  let t1 = (mn - o) / d;
  let t2 = (mx - o) / d;
  if (t1 > t2) {
    const tmp = t1;
    t1 = t2;
    t2 = tmp;
  }
  if (t1 > slabNear) slabNear = t1;
  if (t2 < slabFar) slabFar = t2;
  return slabNear <= slabFar && slabFar >= 0;
}

/** Normal of a mirror that turns unit direction `inDir` into direction toward `outDir`. */
export function mirrorNormalFor(
  inDir: readonly [number, number, number],
  outDir: readonly [number, number, number],
): [number, number, number] {
  const ol = Math.hypot(outDir[0], outDir[1], outDir[2]) || 1;
  const il = Math.hypot(inDir[0], inDir[1], inDir[2]) || 1;
  const x = outDir[0] / ol - inDir[0] / il;
  const y = outDir[1] / ol - inDir[1] / il;
  const z = outDir[2] / ol - inDir[2] / il;
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
}
