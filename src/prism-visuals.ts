/**
 * Runtime-built visuals for Palm Prism: board, emitter, crystals, blockers,
 * mirrors, the beam and the sky. Everything is procedural (no downloads) and
 * cheap: unlit additive glow instead of post-processing, so Quest stays at
 * frame rate.
 */
import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DodecahedronGeometry,
  DoubleSide,
  EdgesGeometry,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OctahedronGeometry,
  Points,
  PointsMaterial,
  Quaternion,
  RingGeometry,
  SphereGeometry,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  TetrahedronGeometry,
  TorusGeometry,
  Vector3,
} from '@iwsdk/core';
import { MAX_BOUNCES } from './beam.js';
import { CRYSTAL_RADIUS, MIRROR_RADIUS, type CrystalKind } from './levels.js';

export const COLORS = {
  beamCore: new Color('#fffbe8'),
  beamGlow: new Color('#ffcf5a'),
  gold: new Color('#ffc23d'),
  goldDim: new Color('#6b4a12'),
  blue: new Color('#5fd4ff'),
  blueDim: new Color('#173a52'),
  palm: new Color('#8fe9ff'),
  frozen: new Color('#ffd27a'),
  rune: new Color('#8a6cff'),
};

const UP = new Vector3(0, 1, 0);
const FORWARD_Z = new Vector3(0, 0, 1);

let glowTexture: CanvasTexture | null = null;

/** Soft round glow used by halos, sparkles and earned stars. */
export function getGlowTexture(): CanvasTexture {
  if (glowTexture) return glowTexture;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  glowTexture = new CanvasTexture(canvas);
  glowTexture.colorSpace = SRGBColorSpace;
  return glowTexture;
}

export function createGlowSprite(color: Color, size: number, opacity = 1) {
  const material = new SpriteMaterial({
    map: getGlowTexture(),
    color,
    transparent: true,
    opacity,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  const sprite = new Sprite(material);
  sprite.scale.setScalar(size);
  return sprite;
}

/** Floating stone board. Its top surface is at local y = 0. */
export function createBoard(): Group {
  const group = new Group();
  group.name = 'PrismBoard';

  const stone = new Mesh(
    new CylinderGeometry(0.25, 0.27, 0.035, 64),
    new MeshStandardMaterial({
      color: '#1d1b2e',
      roughness: 0.55,
      metalness: 0.2,
    }),
  );
  stone.position.y = -0.0175;
  group.add(stone);

  const rune = new Mesh(
    new TorusGeometry(0.24, 0.0035, 8, 96),
    new MeshBasicMaterial({ color: COLORS.rune }),
  );
  rune.rotation.x = Math.PI / 2;
  rune.position.y = 0.001;
  group.add(rune);

  const inner = new Mesh(
    new RingGeometry(0.11, 0.113, 64),
    new MeshBasicMaterial({
      color: COLORS.rune,
      transparent: true,
      opacity: 0.45,
    }),
  );
  inner.rotation.x = -Math.PI / 2;
  inner.position.y = 0.0012;
  group.add(inner);

  const underGlow = createGlowSprite(COLORS.rune, 0.9, 0.35);
  underGlow.position.y = -0.06;
  group.add(underGlow);
  return group;
}

/** Light source. Its lens sits at the group origin and fires along +Y. */
export function createEmitter(): Group {
  const group = new Group();
  const base = new Mesh(
    new CylinderGeometry(0.016, 0.024, 0.022, 6),
    new MeshStandardMaterial({
      color: '#b8862b',
      metalness: 0.8,
      roughness: 0.3,
      emissive: COLORS.gold,
      emissiveIntensity: 0.15,
    }),
  );
  base.position.y = -0.012;
  group.add(base);
  const lens = new Mesh(
    new SphereGeometry(0.009, 16, 12),
    new MeshBasicMaterial({ color: COLORS.beamCore }),
  );
  group.add(lens);
  group.add(createGlowSprite(COLORS.beamGlow, 0.08, 0.9));
  return group;
}

export function orientAlong(object: Group | Mesh, dir: Vector3): void {
  object.quaternion.setFromUnitVectors(UP, dir);
}

export interface CrystalVisual {
  group: Group;
  mesh: Mesh;
  material: MeshStandardMaterial;
  halo: Sprite;
}

/**
 * Crystal. The shape follows the note so colour is never the only cue
 * (accessibility): gold stay-crystals and blue pulse-crystals also differ.
 */
export function createCrystal(kind: CrystalKind, note: number): CrystalVisual {
  const r = CRYSTAL_RADIUS;
  const shapes = [
    () => new OctahedronGeometry(r, 0),
    () => new IcosahedronGeometry(r * 0.92, 0),
    () => new DodecahedronGeometry(r * 0.9, 0),
    () => new TetrahedronGeometry(r * 1.15, 0),
  ];
  const geometry = shapes[note % shapes.length]();
  const color = kind === 'stay' ? COLORS.gold : COLORS.blue;
  const material = new MeshStandardMaterial({
    color: kind === 'stay' ? COLORS.goldDim : COLORS.blueDim,
    emissive: color,
    emissiveIntensity: 0.25,
    roughness: 0.15,
    metalness: 0.1,
    flatShading: true,
  });
  const mesh = new Mesh(geometry, material);
  const group = new Group();
  group.add(mesh);
  if (kind === 'pulse') {
    const ring = new Mesh(
      new TorusGeometry(r * 1.45, 0.0016, 6, 40),
      new MeshBasicMaterial({ color, transparent: true, opacity: 0.55 }),
    );
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
  }
  const halo = createGlowSprite(color, 0.12, 0.15);
  group.add(halo);
  return { group, mesh, material, halo };
}

export function createBlocker(
  min: [number, number, number],
  max: [number, number, number],
): Group {
  const sx = max[0] - min[0];
  const sy = max[1] - min[1];
  const sz = max[2] - min[2];
  const geometry = new BoxGeometry(sx, sy, sz);
  const group = new Group();
  const body = new Mesh(
    geometry,
    new MeshStandardMaterial({
      color: '#0d0c16',
      roughness: 0.35,
      metalness: 0.4,
    }),
  );
  group.add(body);
  const edges = new LineSegments(
    new EdgesGeometry(geometry),
    new LineBasicMaterial({ color: COLORS.rune }),
  );
  group.add(edges);
  group.position.set(
    (min[0] + max[0]) / 2,
    (min[1] + max[1]) / 2,
    (min[2] + max[2]) / 2,
  );
  return group;
}

export interface MirrorVisual {
  group: Group;
  fill: MeshBasicMaterial;
  ring: MeshBasicMaterial;
}

/** Hexagonal light shield shown on a palm or as a frozen mirror. */
export function createMirrorVisual(color: Color): MirrorVisual {
  const group = new Group();
  const fill = new MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.14,
    side: DoubleSide,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  const disc = new Mesh(new CircleGeometry(MIRROR_RADIUS, 6), fill);
  group.add(disc);
  const ring = new MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.6,
    side: DoubleSide,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  const edge = new Mesh(
    new RingGeometry(MIRROR_RADIUS * 0.88, MIRROR_RADIUS, 6),
    ring,
  );
  group.add(edge);
  group.visible = false;
  return { group, fill, ring };
}

const mirrorQuat = new Quaternion();
const mirrorNormal = new Vector3();
/** Place a mirror visual at a centre, facing a normal (CircleGeometry faces +Z). */
export function placeMirror(
  visual: MirrorVisual,
  cx: number,
  cy: number,
  cz: number,
  nx: number,
  ny: number,
  nz: number,
): void {
  visual.group.position.set(cx, cy, cz);
  mirrorNormal.set(nx, ny, nz);
  mirrorQuat.setFromUnitVectors(FORWARD_Z, mirrorNormal);
  visual.group.quaternion.copy(mirrorQuat);
}

/** Pool of glowing beam segments plus sparkles at each bounce. */
export class BeamRenderer {
  readonly group = new Group();
  private readonly cores: Mesh[] = [];
  private readonly glows: Mesh[] = [];
  private readonly sparkles: Sprite[] = [];
  private readonly a = new Vector3();
  private readonly b = new Vector3();
  private readonly dir = new Vector3();

  constructor() {
    this.group.name = 'Beam';
    const geometry = new CylinderGeometry(1, 1, 1, 8, 1, true);
    const coreMat = new MeshBasicMaterial({ color: COLORS.beamCore });
    const glowMat = new MeshBasicMaterial({
      color: COLORS.beamGlow,
      transparent: true,
      opacity: 0.35,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    const segments = MAX_BOUNCES + 1;
    for (let i = 0; i < segments; i++) {
      const core = new Mesh(geometry, coreMat);
      const glow = new Mesh(geometry, glowMat);
      core.visible = false;
      glow.visible = false;
      core.frustumCulled = false;
      glow.frustumCulled = false;
      this.cores.push(core);
      this.glows.push(glow);
      this.group.add(core, glow);
      const sparkle = createGlowSprite(COLORS.beamGlow, 0.06, 0.9);
      sparkle.visible = false;
      this.sparkles.push(sparkle);
      this.group.add(sparkle);
    }
  }

  /** points: xyz triples (origin then segment ends); mirrorAt marks bounces. */
  update(
    points: Float32Array,
    count: number,
    mirrorAt: Int16Array,
    time: number,
  ): void {
    const flicker = 1 + Math.sin(time * 31) * 0.08;
    for (let i = 0; i < this.cores.length; i++) {
      const visible = i < count - 1;
      const core = this.cores[i];
      const glow = this.glows[i];
      const sparkle = this.sparkles[i];
      core.visible = visible;
      glow.visible = visible;
      if (!visible) {
        sparkle.visible = false;
        continue;
      }
      this.a.set(points[i * 3], points[i * 3 + 1], points[i * 3 + 2]);
      this.b.set(
        points[(i + 1) * 3],
        points[(i + 1) * 3 + 1],
        points[(i + 1) * 3 + 2],
      );
      this.dir.subVectors(this.b, this.a);
      const length = this.dir.length();
      if (length < 1e-5) {
        core.visible = false;
        glow.visible = false;
        sparkle.visible = false;
        continue;
      }
      this.dir.divideScalar(length);
      core.position.addVectors(this.a, this.b).multiplyScalar(0.5);
      glow.position.copy(core.position);
      core.quaternion.setFromUnitVectors(UP, this.dir);
      glow.quaternion.copy(core.quaternion);
      core.scale.set(0.0022, length, 0.0022);
      glow.scale.set(0.008 * flicker, length, 0.008 * flicker);

      const bounced = mirrorAt[i + 1] >= 0;
      sparkle.visible = bounced;
      if (bounced) {
        sparkle.position.copy(this.b);
        sparkle.scale.setScalar(0.05 * flicker);
      }
    }
  }
}

/** Seeded random so the sky looks identical every visit. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export interface Sky {
  group: Group;
  setEarned(count: number): void;
}

/**
 * Background stars plus "earned" stars: one bright star per star the player
 * has earned, so progress stays visible between sessions.
 */
export function createSky(): Sky {
  const group = new Group();
  group.name = 'Sky';
  const rand = seeded(42);
  const positions: number[] = [];
  for (let i = 0; i < 900; i++) {
    const u = rand() * 2 - 1;
    const theta = rand() * Math.PI * 2;
    const r = 40;
    const s = Math.sqrt(1 - u * u);
    const y = Math.abs(u) * r * 0.9 + 1;
    positions.push(Math.cos(theta) * s * r, y, Math.sin(theta) * s * r);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  const points = new Points(
    geometry,
    new PointsMaterial({
      color: '#c9c3ff',
      size: 0.12,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
    }),
  );
  group.add(points);

  // Earned stars form a ring constellation in front of the player.
  const earned: Sprite[] = [];
  const earnedRand = seeded(7);
  for (let i = 0; i < 24; i++) {
    const angle = -Math.PI / 2 + (i / 24) * Math.PI * 2;
    const radius = 14 + earnedRand() * 4;
    const sprite = createGlowSprite(
      i % 3 === 0 ? COLORS.blue : COLORS.gold,
      1.1 + earnedRand() * 0.6,
      0.95,
    );
    sprite.position.set(
      Math.cos(angle) * radius,
      5 + earnedRand() * 6,
      Math.sin(angle) * radius,
    );
    sprite.visible = false;
    earned.push(sprite);
    group.add(sprite);
  }

  return {
    group,
    setEarned(count: number) {
      for (let i = 0; i < earned.length; i++) earned[i].visible = i < count;
    },
  };
}

/** Dark floor with faint rings, so the player feels grounded while seated. */
export function createFloor(): Mesh {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  g.addColorStop(0, '#2a2347');
  g.addColorStop(0.5, '#120f22');
  g.addColorStop(1, '#05040b');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(138,108,255,0.22)';
  ctx.lineWidth = 2;
  for (let i = 1; i <= 6; i++) {
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, (i / 6) * (size / 2) * 0.95, 0, Math.PI * 2);
    ctx.stroke();
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const floor = new Mesh(
    new CircleGeometry(8, 64),
    new MeshBasicMaterial({ map: texture }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.name = 'Floor';
  return floor;
}
