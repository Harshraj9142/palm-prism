/**
 * Palm Prism visuals: a night observatory. A slate-and-brass astrolabe board
 * on a brass stem, warm lamplight beams with drifting dust, amber and
 * aquamarine crystals, glass-and-brass mirrors, and a real-feeling night sky.
 *
 * Everything here is procedural and cheap (downloaded crystal meshes, when
 * loaded, come from asset-props.ts): unlit glow sprites
 * instead of post-processing, so Quest stays at frame rate.
 */
import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
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
import { getCrystalGeometry } from './asset-props.js';
import { MAX_BOUNCES } from './beam.js';
import {
  brassMaterial,
  createMilkyWay,
  createMoon,
  createSpill,
  createStoneFloor,
  getEnvMap,
  glassMaterial,
  obsidianMaterial,
  pedestalCapital,
  pedestalFoot,
} from './realism.js';
import { CRYSTAL_RADIUS, MIRROR_RADIUS, type CrystalKind } from './levels.js';

export const COLORS = {
  beamCore: new Color('#fff6dc'),
  beamGlow: new Color('#ffb84d'),
  /** Amber "stay" crystals. */
  gold: new Color('#f4b23e'),
  goldDim: new Color('#4a3210'),
  /** Aquamarine "pulse" crystals. */
  blue: new Color('#52d6c3'),
  blueDim: new Color('#0f3330'),
  /** Silvered glass on a palm. */
  palm: new Color('#dfe9f2'),
  /** Brass: frozen mirrors, rims, the board's inlay. */
  frozen: new Color('#d8a74e'),
  rune: new Color('#a07d3c'),
  brass: new Color('#c49a4f'),
};

const UP = new Vector3(0, 1, 0);
const FORWARD_Z = new Vector3(0, 0, 1);

function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return [canvas, canvas.getContext('2d')!];
}

function canvasTexture(canvas: HTMLCanvasElement): CanvasTexture {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** Seeded random so the sky and dust look identical every visit. */
export function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

let glowTexture: CanvasTexture | null = null;

/** Soft round glow used by halos, sparkles, stars and dust. */
export function getGlowTexture(): CanvasTexture {
  if (glowTexture) return glowTexture;
  const size = 128;
  const [canvas, ctx] = makeCanvas(size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.2, 'rgba(255,255,255,0.6)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  glowTexture = canvasTexture(canvas);
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

let ringTexture: CanvasTexture | null = null;

/** Thin soft ring used by bursts and shockwaves. */
function getRingTexture(): CanvasTexture {
  if (ringTexture) return ringTexture;
  const size = 128;
  const [canvas, ctx] = makeCanvas(size);
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.shadowColor = 'rgba(255,255,255,0.8)';
  ctx.shadowBlur = 8;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 12, 0, Math.PI * 2);
  ctx.stroke();
  ringTexture = canvasTexture(canvas);
  return ringTexture;
}

// ------------------------------------------------------------------ Board

/**
 * Slate face of the astrolabe: etched rings, degree ticks, hour numerals.
 * Drawn twice: once in colour, once as a bump map where the engraving is cut
 * into the stone.
 */
function drawBoardFace(bump = false): CanvasTexture {
  const size = 1024;
  const [canvas, ctx] = makeCanvas(size);
  const c = size / 2;
  const g = ctx.createRadialGradient(c, c * 0.9, 0, c, c, c);
  g.addColorStop(0, bump ? '#808080' : '#2a2d33');
  g.addColorStop(1, bump ? '#808080' : '#16181d');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  // Fine stone grain.
  const rand = seeded(11);
  for (let i = 0; i < 9000; i++) {
    const a = rand() * (bump ? 0.18 : 0.06);
    ctx.fillStyle = rand() < 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a * 1.5})`;
    ctx.fillRect(rand() * size, rand() * size, 1.5, 1.5);
  }

  const ink = (alpha: number) => (bump ? `rgba(20,20,20,${Math.min(1, alpha * 1.6)})` : `rgba(214,178,112,${alpha})`);
  const etch = (r: number, width: number, alpha: number) => {
    ctx.strokeStyle = ink(alpha);
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.stroke();
  };
  etch(c * 0.96, 3, 0.55);
  etch(c * 0.9, 1.5, 0.35);
  etch(c * 0.62, 1.2, 0.22);
  etch(c * 0.3, 1.2, 0.2);

  // Degree ticks between the two outer rings.
  for (let i = 0; i < 360; i += 2) {
    const a = (i * Math.PI) / 180;
    const long = i % 30 === 0;
    const mid = i % 10 === 0;
    const r1 = c * 0.96;
    const r0 = r1 - (long ? 30 : mid ? 20 : 11);
    ctx.strokeStyle = ink(long ? 0.6 : mid ? 0.4 : 0.25);
    ctx.lineWidth = long ? 2.4 : 1.2;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0);
    ctx.lineTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1);
    ctx.stroke();
  }

  // Hour numerals, like the rim of an astrolabe.
  const numerals = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
  ctx.fillStyle = ink(0.5);
  ctx.font = '600 26px Georgia, "Noto Serif", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  numerals.forEach((n, i) => {
    const a = -Math.PI / 2 + (i / 12) * Math.PI * 2;
    const r = c * 0.84;
    ctx.save();
    ctx.translate(c + Math.cos(a) * r, c + Math.sin(a) * r);
    ctx.rotate(a + Math.PI / 2);
    ctx.fillText(n, 0, 0);
    ctx.restore();
  });

  // A faint compass rose at the centre.
  ctx.strokeStyle = ink(0.16);
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const r = i % 4 === 0 ? c * 0.6 : i % 2 === 0 ? c * 0.42 : c * 0.3;
    ctx.beginPath();
    ctx.moveTo(c, c);
    ctx.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
    ctx.stroke();
  }
  const texture = canvasTexture(canvas);
  if (bump) texture.colorSpace = '';
  return texture;
}

export interface Board {
  group: Group;
  /** Inlay ring material, warmed to bright gold when a level clears. */
  rune: MeshBasicMaterial;
  /** Stretch the brass stem so it reaches the floor from `heightAboveFloor`. */
  setStemHeight(heightAboveFloor: number): void;
  /** Warm pool of lamplight on the slate around the lamp. */
  lampPool: Mesh;
  /** Bright spot where the beam strikes the board. */
  hotspot: Mesh;
}

/** Slate-and-brass astrolabe on a stem. Its top surface is at local y = 0. */
export function createBoard(): Board {
  const group = new Group();
  group.name = 'PrismBoard';

  const brass = brassMaterial('bright');
  const darkBrass = brassMaterial('dark');
  const env = getEnvMap();
  const slateSide = new MeshStandardMaterial({
    color: '#1a1c21',
    roughness: 0.6,
    envMap: env,
    envMapIntensity: 0.5,
  });
  const face = new MeshStandardMaterial({
    map: drawBoardFace(),
    bumpMap: drawBoardFace(true),
    bumpScale: 1.2,
    roughness: 0.55,
    metalness: 0.05,
    envMap: env,
    envMapIntensity: 0.55,
  });

  const slab = new Mesh(new CylinderGeometry(0.25, 0.25, 0.026, 96), [
    slateSide,
    face,
    slateSide,
  ]);
  slab.position.y = -0.013;
  group.add(slab);

  const rim = new Mesh(new TorusGeometry(0.252, 0.0065, 14, 160), brass);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = -0.002;
  group.add(rim);

  const runeMaterial = new MeshBasicMaterial({
    color: COLORS.rune.clone(),
    transparent: true,
    opacity: 0.9,
  });
  const inlay = new Mesh(new RingGeometry(0.236, 0.239, 128), runeMaterial);
  inlay.rotation.x = -Math.PI / 2;
  inlay.position.y = 0.0008;
  group.add(inlay);

  // Turned brass pedestal: capital, shaft and foot.
  group.add(new Mesh(pedestalCapital(), darkBrass));
  const stem = new Mesh(new CylinderGeometry(0.0145, 0.0145, 1, 24, 1, true), darkBrass);
  group.add(stem);
  const foot = new Mesh(pedestalFoot(), darkBrass);
  group.add(foot);

  const setStemHeight = (h: number) => {
    const top = 0.13;
    const footHeight = 0.1;
    const length = Math.max(0.02, h - top - footHeight);
    stem.scale.y = length;
    stem.position.y = -top - length / 2;
    foot.position.y = -h;
  };
  setStemHeight(1);

  const lampPool = createSpill(COLORS.beamGlow, 0.34, 0.32);
  lampPool.position.y = 0.0015;
  group.add(lampPool);
  const hotspot = createSpill(COLORS.beamCore, 0.09, 0.7);
  hotspot.position.y = 0.0017;
  hotspot.visible = false;
  group.add(hotspot);
  return { group, rune: runeMaterial, setStemHeight, lampPool, hotspot };
}

/** Brass lamp. Its lens sits at the group origin and fires along +Y. */
export function createEmitter(): Group {
  const group = new Group();
  const body = new Mesh(new CylinderGeometry(0.013, 0.02, 0.026, 32), brassMaterial('bright'));
  body.position.y = -0.014;
  group.add(body);
  const collar = new Mesh(new TorusGeometry(0.0125, 0.0025, 10, 40), brassMaterial('dark'));
  collar.rotation.x = Math.PI / 2;
  group.add(collar);
  const lens = new Mesh(
    new SphereGeometry(0.0085, 20, 14),
    new MeshBasicMaterial({ color: COLORS.beamCore }),
  );
  group.add(lens);
  group.add(createGlowSprite(COLORS.beamGlow, 0.07, 0.7));
  return group;
}

export function orientAlong(object: Group | Mesh, dir: Vector3): void {
  object.quaternion.setFromUnitVectors(UP, dir);
}

// ---------------------------------------------------------------- Pieces

export interface CrystalVisual {
  group: Group;
  mesh: Mesh;
  material: MeshStandardMaterial;
  halo: Sprite;
}

export { createSpill };

/**
 * Cut-glass crystal. The shape follows the note and teal crystals wear a
 * brass ring, so colour is never the only cue (accessibility).
 */
export function createCrystal(kind: CrystalKind, note: number): CrystalVisual {
  const r = CRYSTAL_RADIUS;
  const shapes = [
    () => new OctahedronGeometry(r, 0),
    () => new IcosahedronGeometry(r * 0.92, 0),
    () => new DodecahedronGeometry(r * 0.9, 0),
    () => new TetrahedronGeometry(r * 1.15, 0),
  ];
  // Downloaded mesh when ready (shard for amber, cluster for teal), else procedural.
  const geometry = getCrystalGeometry(kind) ?? shapes[note % shapes.length]();
  const color = kind === 'stay' ? COLORS.gold : COLORS.blue;
  const material = glassMaterial(kind === 'stay' ? COLORS.goldDim : COLORS.blueDim, color);
  const mesh = new Mesh(geometry, material);
  const group = new Group();
  group.add(mesh);
  if (kind === 'pulse') {
    const ring = new Mesh(new TorusGeometry(r * 1.5, 0.0014, 8, 56), brassMaterial('bright'));
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
  }
  const halo = createGlowSprite(color, 0.12, 0.12);
  group.add(halo);
  return { group, mesh, material, halo };
}

/** Swap a live crystal onto the downloaded mesh once it has loaded (visual only). */
export function upgradeCrystal(visual: CrystalVisual, kind: CrystalKind): void {
  const geometry = getCrystalGeometry(kind);
  if (!geometry) return;
  visual.mesh.geometry.dispose();
  visual.mesh.geometry = geometry;
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
  group.add(new Mesh(geometry, obsidianMaterial()));
  group.add(
    new LineSegments(
      new EdgesGeometry(geometry),
      new LineBasicMaterial({ color: COLORS.brass, transparent: true, opacity: 0.55 }),
    ),
  );
  group.position.set((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
  return group;
}

export interface MirrorVisual {
  group: Group;
  fill: MeshBasicMaterial;
  ring: MeshBasicMaterial;
}

/** Hexagonal pane of silvered glass in a thin brass frame. */
export function createMirrorVisual(glass: Color, frame: Color = COLORS.brass): MirrorVisual {
  const group = new Group();
  const fill = new MeshBasicMaterial({
    color: glass,
    transparent: true,
    opacity: 0.16,
    side: DoubleSide,
    depthWrite: false,
  });
  group.add(new Mesh(new CircleGeometry(MIRROR_RADIUS, 6), fill));
  const ring = new MeshBasicMaterial({
    color: frame,
    transparent: true,
    opacity: 0.85,
    side: DoubleSide,
    depthWrite: false,
  });
  group.add(new Mesh(new RingGeometry(MIRROR_RADIUS * 0.92, MIRROR_RADIUS, 6), ring));
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

// ------------------------------------------------------------------ Beam

/** Pool of glowing beam segments plus a soft flare at each bounce. */
export class BeamRenderer {
  readonly group = new Group();
  private readonly cores: Mesh[] = [];
  private readonly glows: Mesh[] = [];
  private readonly flares: Sprite[] = [];
  private readonly a = new Vector3();
  private readonly b = new Vector3();
  private readonly dir = new Vector3();

  constructor() {
    this.group.name = 'Beam';
    const geometry = new CylinderGeometry(1, 1, 1, 10, 1, true);
    const coreMat = new MeshBasicMaterial({ color: COLORS.beamCore });
    const glowMat = new MeshBasicMaterial({
      color: COLORS.beamGlow,
      transparent: true,
      opacity: 0.22,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    for (let i = 0; i < MAX_BOUNCES + 1; i++) {
      const core = new Mesh(geometry, coreMat);
      const glow = new Mesh(geometry, glowMat);
      core.visible = glow.visible = false;
      core.frustumCulled = glow.frustumCulled = false;
      this.cores.push(core);
      this.glows.push(glow);
      this.group.add(core, glow);
      const flare = createGlowSprite(COLORS.beamGlow, 0.05, 0.8);
      flare.visible = false;
      this.flares.push(flare);
      this.group.add(flare);
    }
  }

  update(points: Float32Array, count: number, mirrorAt: Int16Array, time: number): void {
    const shimmer = 1 + Math.sin(time * 23) * 0.05;
    for (let i = 0; i < this.cores.length; i++) {
      const core = this.cores[i];
      const glow = this.glows[i];
      const flare = this.flares[i];
      const visible = i < count - 1;
      core.visible = glow.visible = visible;
      if (!visible) {
        flare.visible = false;
        continue;
      }
      this.a.set(points[i * 3], points[i * 3 + 1], points[i * 3 + 2]);
      this.b.set(points[i * 3 + 3], points[i * 3 + 4], points[i * 3 + 5]);
      this.dir.subVectors(this.b, this.a);
      const length = this.dir.length();
      if (length < 1e-5) {
        core.visible = glow.visible = flare.visible = false;
        continue;
      }
      this.dir.divideScalar(length);
      core.position.addVectors(this.a, this.b).multiplyScalar(0.5);
      glow.position.copy(core.position);
      core.quaternion.setFromUnitVectors(UP, this.dir);
      glow.quaternion.copy(core.quaternion);
      core.scale.set(0.0018, length, 0.0018);
      glow.scale.set(0.0075 * shimmer, length, 0.0075 * shimmer);
      const bounced = mirrorAt[i + 1] >= 0;
      flare.visible = bounced;
      if (bounced) {
        flare.position.copy(this.b);
        flare.scale.setScalar(0.045 * shimmer);
      }
    }
  }
}

/** Dust motes drifting along the beam, like light through a dark room. */
export class DustMotes {
  readonly points: Points;
  private readonly positions: Float32Array;
  private readonly phase: Float32Array;
  private readonly offsets: Float32Array;
  private readonly cumulative = new Float32Array(MAX_BOUNCES + 2);
  private readonly count: number;

  constructor(count = 160) {
    this.count = count;
    this.positions = new Float32Array(count * 3);
    this.phase = new Float32Array(count);
    this.offsets = new Float32Array(count * 3);
    const rand = seeded(5);
    for (let i = 0; i < count; i++) {
      this.phase[i] = rand();
      this.offsets[i * 3] = (rand() - 0.5) * 0.012;
      this.offsets[i * 3 + 1] = (rand() - 0.5) * 0.012;
      this.offsets[i * 3 + 2] = (rand() - 0.5) * 0.012;
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    this.points = new Points(
      geometry,
      new PointsMaterial({
        color: COLORS.beamGlow,
        map: getGlowTexture(),
        size: 0.0045,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.75,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.points.frustumCulled = false;
    this.points.name = 'DustMotes';
  }

  update(points: Float32Array, count: number, time: number): void {
    const segs = count - 1;
    if (segs < 1) {
      this.points.visible = false;
      return;
    }
    this.points.visible = true;
    let total = 0;
    this.cumulative[0] = 0;
    for (let s = 0; s < segs; s++) {
      const dx = points[s * 3 + 3] - points[s * 3];
      const dy = points[s * 3 + 4] - points[s * 3 + 1];
      const dz = points[s * 3 + 5] - points[s * 3 + 2];
      total += Math.sqrt(dx * dx + dy * dy + dz * dz);
      this.cumulative[s + 1] = total;
    }
    for (let i = 0; i < this.count; i++) {
      const d = ((this.phase[i] + time * 0.035) % 1) * total;
      let s = 0;
      while (s < segs - 1 && this.cumulative[s + 1] < d) s++;
      const segLen = this.cumulative[s + 1] - this.cumulative[s] || 1;
      const t = (d - this.cumulative[s]) / segLen;
      const wobble = Math.sin(time * 0.9 + i) * 0.6;
      const p = i * 3;
      const o = s * 3;
      this.positions[p] = points[o] + (points[o + 3] - points[o]) * t + this.offsets[p] * wobble;
      this.positions[p + 1] =
        points[o + 1] + (points[o + 4] - points[o + 1]) * t + this.offsets[p + 1];
      this.positions[p + 2] =
        points[o + 2] + (points[o + 5] - points[o + 2]) * t + this.offsets[p + 2] * wobble;
    }
    (this.points.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
  }
}

interface Burst {
  ring: Sprite;
  glow: Sprite;
  t: number;
  life: number;
  size: number;
}

/** Pool of short light bursts for crystals lighting and levels clearing. */
export class BurstPool {
  readonly group = new Group();
  private readonly bursts: Burst[] = [];
  private next = 0;

  constructor(count = 16) {
    this.group.name = 'Bursts';
    for (let i = 0; i < count; i++) {
      const ring = new Sprite(
        new SpriteMaterial({
          map: getRingTexture(),
          transparent: true,
          blending: AdditiveBlending,
          depthWrite: false,
        }),
      );
      const glow = createGlowSprite(COLORS.gold, 0.1, 1);
      ring.visible = glow.visible = false;
      this.group.add(ring, glow);
      this.bursts.push({ ring, glow, t: 1, life: 1, size: 0.1 });
    }
  }

  spawn(x: number, y: number, z: number, color: Color, size = 0.16, life = 0.7) {
    const b = this.bursts[this.next];
    this.next = (this.next + 1) % this.bursts.length;
    b.t = 0;
    b.life = life;
    b.size = size;
    b.ring.position.set(x, y, z);
    b.glow.position.set(x, y, z);
    b.ring.material.color.copy(color);
    b.glow.material.color.copy(color);
    b.ring.visible = b.glow.visible = true;
  }

  update(dt: number): void {
    for (const b of this.bursts) {
      if (!b.ring.visible) continue;
      b.t += dt;
      const k = b.t / b.life;
      if (k >= 1) {
        b.ring.visible = b.glow.visible = false;
        continue;
      }
      const ease = 1 - (1 - k) * (1 - k) * (1 - k);
      b.ring.scale.setScalar(b.size * (0.15 + 0.85 * ease));
      b.ring.material.opacity = 0.9 * (1 - k);
      b.glow.scale.setScalar(b.size * 0.6 * (1 - 0.5 * k));
      b.glow.material.opacity = (1 - k) * (1 - k);
    }
  }
}

// ------------------------------------------------------------ Sky, floor

export interface Sky {
  group: Group;
  setEarned(count: number): void;
}

const STAR_TINTS = ['#fff4e0', '#ffffff', '#dfe8ff', '#ffe2b8', '#cfdcff'];

function starField(
  rand: () => number,
  count: number,
  size: number,
  opacity: number,
  pick: () => [number, number, number],
): Points {
  const positions: number[] = [];
  const colors: number[] = [];
  const c = new Color();
  for (let i = 0; i < count; i++) {
    positions.push(...pick());
    c.set(STAR_TINTS[Math.floor(rand() * STAR_TINTS.length)]);
    const b = 0.45 + rand() * 0.55;
    colors.push(c.r * b, c.g * b, c.b * b);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  return new Points(
    geometry,
    new PointsMaterial({
      size,
      map: getGlowTexture(),
      vertexColors: true,
      sizeAttenuation: true,
      transparent: true,
      opacity,
      depthWrite: false,
      blending: AdditiveBlending,
    }),
  );
}

/**
 * Night sky: scattered stars, a soft Milky Way band, and the player's own
 * constellation. Every star earned adds one brass star, joined to the last.
 */
export function createSky(): Sky {
  const group = new Group();
  group.name = 'Sky';
  const rand = seeded(42);
  const R = 45;
  const onSphere = (): [number, number, number] => {
    const u = rand() * 0.95 + 0.05;
    const theta = rand() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    return [Math.cos(theta) * s * R, u * R, Math.sin(theta) * s * R];
  };
  group.add(starField(rand, 700, 0.35, 0.9, onSphere));
  group.add(starField(rand, 90, 0.75, 1, onSphere));

  // Milky Way: a dense, dim band along a tilted great circle.
  const tilt = 0.55;
  const band = (): [number, number, number] => {
    const a = rand() * Math.PI * 2;
    const spread = (rand() + rand() + rand() - 1.5) * 0.16;
    const x = Math.cos(a);
    const z = Math.sin(a);
    let y = spread;
    const yy = y * Math.cos(tilt) + z * Math.sin(tilt);
    const zz = -y * Math.sin(tilt) + z * Math.cos(tilt);
    y = Math.abs(yy) + 0.04;
    const l = Math.hypot(x, y, zz);
    return [(x / l) * R, (y / l) * R, (zz / l) * R];
  };
  group.add(starField(rand, 1400, 0.28, 0.55, band));

  group.add(createMilkyWay());
  group.add(createMoon());

  // The player's constellation, rising in front of them.
  const EARNED_MAX = 60;
  const earnedRand = seeded(7);
  const earned: Sprite[] = [];
  const linePositions = new Float32Array(EARNED_MAX * 6);
  let px = 0;
  let py = 9;
  let pz = -26;
  for (let i = 0; i < EARNED_MAX; i++) {
    if (i > 0) {
      px += (earnedRand() - 0.5) * 7;
      py += (earnedRand() - 0.35) * 3.2;
      pz += (earnedRand() - 0.5) * 3;
      if (py > 22 || py < 5) py = 7 + earnedRand() * 10;
      if (Math.abs(px) > 22) px *= 0.5;
    }
    const sprite = createGlowSprite(
      i % 4 === 3 ? COLORS.blue : COLORS.frozen,
      1.3 + earnedRand() * 0.9,
      1,
    );
    sprite.position.set(px, py, pz);
    sprite.visible = false;
    earned.push(sprite);
    group.add(sprite);
    if (i > 0) {
      const prev = earned[i - 1].position;
      linePositions.set([prev.x, prev.y, prev.z, px, py, pz], (i - 1) * 6);
    }
  }
  const lineGeometry = new BufferGeometry();
  lineGeometry.setAttribute('position', new BufferAttribute(linePositions, 3));
  lineGeometry.setDrawRange(0, 0);
  const lines = new LineSegments(
    lineGeometry,
    new LineBasicMaterial({ color: COLORS.frozen, transparent: true, opacity: 0.35 }),
  );
  group.add(lines);

  return {
    group,
    setEarned(count: number) {
      const n = Math.min(count, EARNED_MAX);
      for (let i = 0; i < EARNED_MAX; i++) earned[i].visible = i < n;
      lineGeometry.setDrawRange(0, Math.max(0, n - 1) * 2);
    },
  };
}

/** Flagstone floor with a warm light pool (see realism.ts). */
export function createFloor(): Mesh {
  return createStoneFloor();
}

/** Earlier planisphere floor, kept for reference. */
export function createPlanisphereFloor(): Mesh {
  const size = 1024;
  const [canvas, ctx] = makeCanvas(size);
  const c = size / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0, '#151925');
  g.addColorStop(0.45, '#0b0e17');
  g.addColorStop(1, '#04050a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(196,154,79,0.12)';
  ctx.lineWidth = 1.5;
  for (let i = 1; i <= 8; i++) {
    ctx.beginPath();
    ctx.arc(c, c, (i / 8) * c * 0.94, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(196,154,79,0.06)';
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * c * 0.12, c + Math.sin(a) * c * 0.12);
    ctx.lineTo(c + Math.cos(a) * c * 0.94, c + Math.sin(a) * c * 0.94);
    ctx.stroke();
  }
  const floor = new Mesh(
    new CircleGeometry(9, 96),
    new MeshBasicMaterial({ map: canvasTexture(canvas) }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.name = 'Floor';
  return floor;
}
