/**
 * Realism layer for Palm Prism: everything that makes the scene read as real
 * material under real light, generated in code (nothing is downloaded).
 *
 * - A night-room environment map (warm lamplight, cool moonlight) so brass,
 *   glass and stone show believable reflections.
 * - Brushed-metal roughness, engraved-stone bump and a flagstone floor.
 * - Soft light-spill decals: the lamp's pool, glows under lit crystals, and
 *   a hotspot where the beam strikes the board.
 * - A painted Milky Way and a moon.
 */
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  EquirectangularReflectionMapping,
  Group,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  PMREMGenerator,
  RepeatWrapping,
  BackSide,
  SphereGeometry,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  Vector2,
  type Texture,
  type WebGLRenderer,
} from '@iwsdk/core';

let envMap: Texture | null = null;

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function canvas2d(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function srgb(canvas: HTMLCanvasElement): CanvasTexture {
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function glowBlob(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  alpha: number,
) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color.replace('A', String(alpha)));
  g.addColorStop(1, color.replace('A', '0'));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

/**
 * Build the reflection environment once, from a painted equirectangular
 * night room: dark walls, a warm low glow (lamps and candles) and a cool
 * high window of moonlight. Prefiltered with PMREM for PBR materials.
 */
export function buildNightEnvironment(renderer: WebGLRenderer): Texture {
  if (envMap) return envMap;
  const W = 1024;
  const H = 512;
  const [canvas, ctx] = canvas2d(W, H);
  const v = ctx.createLinearGradient(0, 0, 0, H);
  v.addColorStop(0, '#0b1020');
  v.addColorStop(0.45, '#1a1a26');
  v.addColorStop(0.55, '#20180f');
  v.addColorStop(1, '#0b0805');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
  // Warm lamplight low around the room.
  for (const x of [120, 380, 640, 900]) glowBlob(ctx, x, H * 0.56, 150, 'rgba(255,170,80,A)', 0.55);
  glowBlob(ctx, W * 0.62, H * 0.6, 220, 'rgba(255,190,110,A)', 0.8);
  // A tall cool window of moonlight.
  ctx.fillStyle = 'rgba(205,220,255,0.9)';
  ctx.fillRect(W * 0.18, H * 0.16, 70, 120);
  glowBlob(ctx, W * 0.18 + 35, H * 0.16 + 60, 170, 'rgba(170,195,255,A)', 0.45);
  // A soft overhead.
  glowBlob(ctx, W * 0.5, 0, 260, 'rgba(120,130,170,A)', 0.35);

  const tex = new CanvasTexture(canvas);
  tex.mapping = EquirectangularReflectionMapping;
  tex.colorSpace = SRGBColorSpace;
  const pmrem = new PMREMGenerator(renderer);
  envMap = pmrem.fromEquirectangular(tex).texture;
  pmrem.dispose();
  tex.dispose();
  return envMap;
}

export function getEnvMap(): Texture | null {
  return envMap;
}

// ------------------------------------------------------------- Materials

let brushedRoughness: CanvasTexture | null = null;

/** Fine brushed-metal streaks in the roughness channel. */
function getBrushedRoughness(): CanvasTexture {
  if (brushedRoughness) return brushedRoughness;
  const [c, ctx] = canvas2d(256, 256);
  ctx.fillStyle = '#5a5a5a';
  ctx.fillRect(0, 0, 256, 256);
  const rand = seeded(23);
  for (let i = 0; i < 900; i++) {
    const y = rand() * 256;
    const l = 30 + rand() * 200;
    const x = rand() * 256;
    const g = Math.floor(60 + rand() * 90);
    ctx.strokeStyle = `rgba(${g},${g},${g},${0.15 + rand() * 0.25})`;
    ctx.lineWidth = 0.6 + rand();
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + l, y + (rand() - 0.5) * 2);
    ctx.stroke();
  }
  // A few darker patina flecks.
  for (let i = 0; i < 120; i++) {
    ctx.fillStyle = `rgba(150,150,150,${rand() * 0.25})`;
    ctx.beginPath();
    ctx.arc(rand() * 256, rand() * 256, 1 + rand() * 4, 0, Math.PI * 2);
    ctx.fill();
  }
  brushedRoughness = new CanvasTexture(c);
  brushedRoughness.wrapS = brushedRoughness.wrapT = RepeatWrapping;
  return brushedRoughness;
}

/** Polished, slightly brushed brass that reflects the room. */
export function brassMaterial(tone: 'bright' | 'dark' = 'bright'): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color: tone === 'bright' ? '#c4943f' : '#6f5222',
    metalness: 1,
    roughness: tone === 'bright' ? 0.38 : 0.5,
    roughnessMap: getBrushedRoughness(),
    envMap,
    envMapIntensity: tone === 'bright' ? 1.35 : 1,
  });
}

/** Cut glass with a clear lacquer: glints from the room, glow from within. */
export function glassMaterial(tint: Color, glow: Color): MeshPhysicalMaterial {
  return new MeshPhysicalMaterial({
    color: tint,
    emissive: glow,
    emissiveIntensity: 0.25,
    metalness: 0,
    roughness: 0.06,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    ior: 1.6,
    specularIntensity: 1,
    envMap,
    envMapIntensity: 1.7,
    flatShading: true,
  });
}

/** Polished obsidian for walls and pillars. */
export function obsidianMaterial(): MeshPhysicalMaterial {
  return new MeshPhysicalMaterial({
    color: '#0c0c12',
    metalness: 0,
    roughness: 0.18,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    envMap,
    envMapIntensity: 1.2,
  });
}

// ---------------------------------------------------------------- Pedestal

/** Turned brass capital under the board (top at y = -0.026). */
export function pedestalCapital(): LatheGeometry {
  const p: [number, number][] = [
    [0.0, -0.026],
    [0.072, -0.026],
    [0.072, -0.033],
    [0.058, -0.04],
    [0.034, -0.054],
    [0.022, -0.068],
    [0.03, -0.082],
    [0.032, -0.092],
    [0.019, -0.108],
    [0.0145, -0.13],
  ];
  return new LatheGeometry(p.map(([r, y]) => new Vector2(r, y)), 48);
}

/** Turned brass foot that sits on the floor (floor at y = 0). */
export function pedestalFoot(): LatheGeometry {
  const p: [number, number][] = [
    [0.0145, 0.1],
    [0.02, 0.088],
    [0.03, 0.078],
    [0.024, 0.066],
    [0.05, 0.046],
    [0.092, 0.03],
    [0.122, 0.015],
    [0.128, 0.004],
    [0.126, 0],
    [0.0, 0],
  ];
  return new LatheGeometry(p.map(([r, y]) => new Vector2(r, y)), 48);
}

// ------------------------------------------------------------- Light spill

let spillTexture: CanvasTexture | null = null;

function getSpillTexture(): CanvasTexture {
  if (spillTexture) return spillTexture;
  const [c, ctx] = canvas2d(128, 128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.45)');
  g.addColorStop(0.7, 'rgba(255,255,255,0.08)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  spillTexture = srgb(c);
  return spillTexture;
}

const spillGeometry = new PlaneGeometry(1, 1);

/** A soft pool of coloured light lying flat on a surface. */
export function createSpill(color: Color, size: number, opacity = 0.3): Mesh {
  const material = new MeshBasicMaterial({
    map: getSpillTexture(),
    color,
    transparent: true,
    opacity,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  const mesh = new Mesh(spillGeometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.scale.set(size, size, 1);
  mesh.renderOrder = 2;
  return mesh;
}

// --------------------------------------------------------------- Sky, floor

/** A painted band of the Milky Way on a large inverted sphere. */
export function createMilkyWay(): Mesh {
  const W = 2048;
  const H = 1024;
  const [c, ctx] = canvas2d(W, H);
  const rand = seeded(77);
  const centreY = (x: number) => H * 0.32 + Math.sin((x / W) * Math.PI * 2 + 0.6) * H * 0.12;
  // Diffuse glow.
  for (let i = 0; i < 2600; i++) {
    const x = rand() * W;
    const y = centreY(x) + (rand() + rand() + rand() - 1.5) * 60;
    const r = 8 + rand() * 40;
    const warm = rand() < 0.5;
    glowBlob(ctx, x, y, r, warm ? 'rgba(255,225,190,A)' : 'rgba(190,205,255,A)', 0.045 + rand() * 0.05);
  }
  // Dust lanes.
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 500; i++) {
    const x = rand() * W;
    const y = centreY(x) + (rand() - 0.5) * 26;
    glowBlob(ctx, x, y, 6 + rand() * 22, 'rgba(0,0,0,A)', 0.22);
  }
  ctx.globalCompositeOperation = 'source-over';
  // Dense faint stars in the band.
  for (let i = 0; i < 6000; i++) {
    const x = rand() * W;
    const y = centreY(x) + (rand() + rand() - 1) * 90;
    ctx.fillStyle = `rgba(255,250,240,${0.15 + rand() * 0.45})`;
    ctx.fillRect(x, y, rand() < 0.1 ? 1.6 : 1, rand() < 0.1 ? 1.6 : 1);
  }
  const material = new MeshBasicMaterial({
    map: srgb(c),
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    side: BackSide,
  });
  material.toneMapped = false;
  const sphere = new Mesh(new SphereGeometry(60, 48, 24), material);
  sphere.rotation.set(0.35, 0.8, 0.15);
  sphere.renderOrder = -1;
  sphere.name = 'MilkyWay';
  return sphere;
}

/** A pale moon with soft craters and a halo, low over the left shoulder. */
export function createMoon(): Group {
  const [c, ctx] = canvas2d(256, 256);
  const g = ctx.createRadialGradient(110, 110, 10, 128, 128, 100);
  g.addColorStop(0, '#fbf6ea');
  g.addColorStop(0.8, '#d9d2c2');
  g.addColorStop(1, '#a9a293');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(128, 128, 100, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.clip();
  const rand = seeded(9);
  for (let i = 0; i < 26; i++) {
    const x = 50 + rand() * 160;
    const y = 50 + rand() * 160;
    const r = 4 + rand() * 18;
    ctx.fillStyle = `rgba(120,112,98,${0.12 + rand() * 0.2})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  const disc = new Sprite(new SpriteMaterial({ map: srgb(c), transparent: true }));
  disc.material.toneMapped = false;
  disc.scale.setScalar(2.4);
  const [hc, hctx] = canvas2d(128, 128);
  glowBlob(hctx, 64, 64, 64, 'rgba(210,220,255,A)', 0.5);
  const halo = new Sprite(
    new SpriteMaterial({
      map: srgb(hc),
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
    }),
  );
  halo.scale.setScalar(9);
  const moon = new Group();
  moon.add(halo, disc);
  moon.position.set(-22, 20, -30);
  moon.name = 'Moon';
  return moon;
}

/** Flagstone floor with a warm pool of light under the board, fading to night. */
export function createStoneFloor(): Mesh {
  const S = 1024;
  const [c, ctx] = canvas2d(S, S);
  ctx.fillStyle = '#0e1015';
  ctx.fillRect(0, 0, S, S);
  const rand = seeded(31);
  const px = S / 18; // 18 m across
  const tileW = 0.9 * px;
  const tileH = 0.6 * px;
  for (let row = 0; row * tileH < S; row++) {
    const offset = (row % 2) * tileW * 0.5;
    for (let x = -tileW; x < S + tileW; x += tileW) {
      const shade = 24 + Math.floor(rand() * 14);
      ctx.fillStyle = `rgb(${shade},${shade + 1},${shade + 4})`;
      ctx.fillRect(x + offset + 1.2, row * tileH + 1.2, tileW - 2.4, tileH - 2.4);
      for (let k = 0; k < 14; k++) {
        ctx.fillStyle = `rgba(255,255,255,${rand() * 0.035})`;
        ctx.fillRect(x + offset + rand() * tileW, row * tileH + rand() * tileH, 2, 2);
      }
    }
  }
  // Warm lamplight pool, centred a little ahead of the player.
  const cx = S / 2;
  const cy = S / 2 - 0.5 * px;
  const pool = ctx.createRadialGradient(cx, cy, 0, cx, cy, 2.6 * px);
  pool.addColorStop(0, 'rgba(255,190,110,0.32)');
  pool.addColorStop(0.5, 'rgba(255,170,90,0.1)');
  pool.addColorStop(1, 'rgba(255,170,90,0)');
  ctx.fillStyle = pool;
  ctx.fillRect(0, 0, S, S);
  // Brass inlay ring around the pedestal.
  ctx.strokeStyle = 'rgba(196,148,63,0.45)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, 1.2 * px, 0, Math.PI * 2);
  ctx.stroke();
  // Fade into the night.
  const vignette = ctx.createRadialGradient(S / 2, S / 2, S * 0.12, S / 2, S / 2, S / 2);
  vignette.addColorStop(0, 'rgba(4,5,9,0)');
  vignette.addColorStop(1, 'rgba(4,5,9,1)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, S, S);

  const floor = new Mesh(
    new PlaneGeometry(18, 18),
    new MeshBasicMaterial({ map: srgb(c) }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.name = 'Floor';
  return floor;
}
