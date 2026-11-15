/**
 * Downloaded, licensed assets layered over the code-generated scene
 * (see CREDITS.md). Everything here is visual only: no gameplay data, beam
 * tracing, colliders or crystal positions depend on it.
 *
 * - Loads asynchronously after the game starts; the code-generated look shows
 *   until each asset is ready, and stays if one fails.
 * - `?assets=0` in the URL skips every download and renders the original look.
 *
 * Models are glTF with Meshopt geometry; GLTFLoader is configured with the
 * Meshopt decoder and a self-hosted KTX2 (Basis) transcoder, so nothing is
 * fetched from a CDN. IWSDK's AssetManager loader has no Meshopt decoder and
 * points its KTX2 transcoder at unpkg, so these props use their own loader.
 */
import {
  AnimatedHand,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  EquirectangularReflectionMapping,
  FloatType,
  Group,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  outlineMaterial,
  PMREMGenerator,
  RingGeometry,
  SphereGeometry,
  SRGBColorSpace,
  TextureLoader,
  TorusGeometry,
  Vector2,
  Vector3,
  Box3,
  type Object3D,
  type Scene,
  type SkinnedMesh,
  type Texture,
  type VisualConstructor,
  type WebGLRenderer,
  type World,
} from '@iwsdk/core';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CrystalKind } from './levels.js';
import { CRYSTAL_RADIUS } from './levels.js';
import { brassMaterial, getEnvMap, useAssetEnvironment } from './realism.js';

/** False when the page was opened with `?assets=0`. */
export const ASSETS_ENABLED: boolean = (() => {
  try {
    return new URLSearchParams(window.location.search).get('assets') !== '0';
  } catch {
    return true;
  }
})();

const BASE = `${import.meta.env.BASE_URL}assets/`;

/**
 * The moon_lab HDRI has a tiny, extremely hot light (luminance ~140,000).
 * Clamping before PMREM keeps its highlight below the beam, and the scale
 * keeps the room as dark as the painted night environment it replaces.
 */
const ENV_CLAMP = 2;
const ENV_SCALE = 0.35;

// ------------------------------------------------------------------ Loaders

let gltfLoader: GLTFLoader | null = null;

function getGLTFLoader(renderer: WebGLRenderer): GLTFLoader {
  if (gltfLoader) return gltfLoader;
  const ktx2 = new KTX2Loader()
    .setTranscoderPath(`${BASE}decoders/basis/`)
    .detectSupport(renderer);
  gltfLoader = new GLTFLoader().setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);
  return gltfLoader;
}

function warn(what: string, error: unknown): void {
  console.warn(`[PalmPrism] ${what} not loaded, keeping the code-generated look.`, error);
}

// -------------------------------------------------------------- Environment

/** moon_lab 1K → PMREM → reflections on brass, glass and slate. */
async function loadEnvironment(renderer: WebGLRenderer, scene: Scene): Promise<void> {
  const hdr = await new HDRLoader().setDataType(FloatType).loadAsync(`${BASE}env/moon_lab_1k.hdr`);
  const data = hdr.image.data as Float32Array;
  for (let i = 0; i < data.length; i++) if (data[i] > ENV_CLAMP) data[i] = ENV_CLAMP;
  hdr.mapping = EquirectangularReflectionMapping;
  hdr.needsUpdate = true;
  const pmrem = new PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(hdr).texture;
  pmrem.dispose();
  hdr.dispose();
  useAssetEnvironment(env, ENV_SCALE, scene);
}

// ----------------------------------------------------------------- Crystals

const crystalGeometry: Partial<Record<CrystalKind, BufferGeometry>> = {};
let decorPrototype: Mesh[] | null = null;

/** Copy a (possibly quantized) primitive into a plain float geometry in world units. */
function bakeGeometry(mesh: Mesh, scale: number, girth = 1): BufferGeometry {
  mesh.updateWorldMatrix(true, false);
  const src = mesh.geometry.getAttribute('position');
  const positions = new Float32Array(src.count * 3);
  for (let i = 0; i < src.count; i++) {
    positions[i * 3] = src.getX(i);
    positions[i * 3 + 1] = src.getY(i);
    positions[i * 3 + 2] = src.getZ(i);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  const index = mesh.geometry.getIndex();
  if (index) geometry.setIndex(Array.from(index.array as ArrayLike<number>));
  geometry.applyMatrix4(mesh.matrixWorld);
  geometry.scale(scale * girth, scale, scale * girth);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function findMesh(root: Object3D, name: string): Mesh[] {
  const found: Mesh[] = [];
  root.traverse((o) => {
    if ((o as Mesh).isMesh && (o.name.startsWith(name) || o.parent?.name.startsWith(name))) {
      found.push(o as Mesh);
    }
  });
  return found;
}

/**
 * Downloaded crystal meshes. Amber is a single tall shard, teal a cluster of
 * three (which also keeps its brass ring), so colour is never the only cue.
 * Sized to the existing crystal radius; positions and hit radii are untouched.
 */
async function loadCrystals(renderer: WebGLRenderer): Promise<void> {
  const gltf = await getGLTFLoader(renderer).loadAsync(`${BASE}crystals/crystals.glb`);
  const amber = findMesh(gltf.scene, 'AmberShard')[0];
  const teal = findMesh(gltf.scene, 'TealCluster')[0];
  if (amber) crystalGeometry.stay = bakeGeometry(amber, CRYSTAL_RADIUS * 1.15, 1.9);
  if (teal) crystalGeometry.pulse = bakeGeometry(teal, CRYSTAL_RADIUS * 1.2);
  const decor = findMesh(gltf.scene, 'DecorCluster');
  if (decor.length) decorPrototype = decor;
}

/** A fresh copy of the downloaded crystal geometry, or null to keep the procedural shape. */
export function getCrystalGeometry(kind: CrystalKind): BufferGeometry | null {
  return crystalGeometry[kind]?.clone() ?? null;
}

// ------------------------------------------------------------------- Decor

/** Where the quartz decor stands, in board-local metres (floor height is set each frame). */
// Every prop stays over 2 m from the board centre: the beam ends at most
// MAX_SEGMENT (1.4 m) past a mirror, and mirrors stay within ~0.3 m of the board.
const DECOR_SPOTS: [number, number, number, number][] = [
  // x, z, height, yaw
  [-2.4, -2.6, 0.42, 0.4],
  [2.8, -2.9, 0.34, 2.1],
  [-3.2, -0.6, 0.3, 4.0],
];

function createDecor(): Group {
  const group = new Group();
  group.name = 'QuartzDecor';
  if (!decorPrototype) return group;
  const env = getEnvMap();
  const quartz = new MeshStandardMaterial({
    color: '#4b4350',
    emissive: new Color('#000000'),
    emissiveIntensity: 0,
    metalness: 0,
    roughness: 0.15,
    envMap: env,
    envMapIntensity: 0.6,
    flatShading: true,
  });
  const base = new MeshStandardMaterial({
    color: '#1b2129',
    metalness: 0,
    roughness: 0.8,
    envMap: env,
    envMapIntensity: 0.3,
    flatShading: true,
  });
  const parts = decorPrototype.map((m) => {
    const name = Array.isArray(m.material) ? '' : m.material.name;
    return { geometry: bakeGeometry(m, 1), isBase: name === 'DecorBase' };
  });
  for (const [x, z, h, yaw] of DECOR_SPOTS) {
    const cluster = new Group();
    for (const p of parts) cluster.add(new Mesh(p.geometry, p.isBase ? base : quartz));
    cluster.position.set(x, 0, z);
    cluster.rotation.y = yaw;
    cluster.scale.setScalar(h);
    group.add(cluster);
  }
  return group;
}

// ------------------------------------------------------------------ Orrery

export interface Orrery {
  group: Group;
  update(dt: number): void;
}

/**
 * A brass orrery standing on the floor, off to the right of the board and
 * beyond arm's reach. Planets carry Solar System Scope maps; arms turn slowly.
 * Its origin is at floor contact.
 */
function createOrrery(maps: Record<string, Texture>): Orrery {
  const group = new Group();
  group.name = 'Orrery';
  const brass = brassMaterial('bright');
  const darkBrass = brassMaterial('dark');
  const env = getEnvMap();

  // Turned foot and column.
  const foot: [number, number][] = [
    [0, 0],
    [0.16, 0],
    [0.165, 0.012],
    [0.12, 0.03],
    [0.05, 0.06],
    [0.03, 0.1],
    [0.022, 0.12],
  ];
  group.add(new Mesh(new LatheGeometry(foot.map(([r, y]) => new Vector2(r, y)), 32), darkBrass));
  const column = new Mesh(new CylinderGeometry(0.012, 0.016, 0.9, 16, 1, true), darkBrass);
  column.position.y = 0.12 + 0.45;
  group.add(column);
  const HUB_Y = 1.02;

  // The sun: warm, but kept well below the beam's brightness.
  const sun = new Mesh(
    new SphereGeometry(0.05, 32, 16),
    new MeshStandardMaterial({
      color: '#f2a93b',
      emissive: new Color('#f2a93b'),
      emissiveIntensity: 0.55,
      roughness: 0.6,
    }),
  );
  sun.position.y = HUB_Y;
  group.add(sun);

  const planetMaterial = (map: Texture | undefined, tint = '#ffffff') =>
    new MeshStandardMaterial({
      map: map ?? null,
      color: tint,
      metalness: 0,
      roughness: 0.85,
      envMap: env,
      envMapIntensity: 0.25,
    });

  interface Arm {
    pivot: Group;
    speed: number;
    spin: Mesh;
  }
  const arms: Arm[] = [];
  const addArm = (
    radius: number,
    height: number,
    size: number,
    map: string,
    speed: number,
    phase: number,
  ): Group => {
    const pivot = new Group();
    pivot.position.y = HUB_Y;
    pivot.rotation.y = phase;
    const rod = new Mesh(new CylinderGeometry(0.0025, 0.0025, radius, 6, 1, true), brass);
    rod.rotation.z = Math.PI / 2;
    rod.position.set(radius / 2, 0, 0);
    pivot.add(rod);
    const post = new Mesh(new CylinderGeometry(0.002, 0.002, Math.abs(height) + 0.001, 6, 1, true), brass);
    post.position.set(radius, height / 2, 0);
    pivot.add(post);
    const planet = new Mesh(new SphereGeometry(size, 32, 16), planetMaterial(maps[map]));
    planet.position.set(radius, height, 0);
    pivot.add(planet);
    group.add(pivot);
    arms.push({ pivot, speed, spin: planet });
    return pivot;
  };

  addArm(0.13, -0.04, 0.016, 'mars', 0.11, 0.6);
  const earthArm = addArm(0.2, -0.07, 0.02, 'earth_daymap', 0.17, 2.4);
  const jupiterArm = addArm(0.29, -0.1, 0.038, 'jupiter', 0.06, 4.1);
  void jupiterArm;
  const saturnArm = addArm(0.38, -0.13, 0.032, 'saturn', 0.04, 5.3);

  // Earth's moon on a small sub-arm.
  const moonPivot = new Group();
  moonPivot.position.set(0.2, -0.07, 0);
  const moon = new Mesh(new SphereGeometry(0.007, 16, 12), planetMaterial(maps.moon));
  moon.position.set(0.035, 0, 0);
  moonPivot.add(moon);
  earthArm.add(moonPivot);

  // Saturn's ring from the alpha map (radial strip: u runs inner → outer edge).
  const ringGeometry = new RingGeometry(0.042, 0.075, 48, 1);
  const uv = ringGeometry.getAttribute('uv');
  const pos = ringGeometry.getAttribute('position');
  const v = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    uv.setXY(i, (v.length() - 0.042) / (0.075 - 0.042), 0.5);
  }
  const ring = new Mesh(
    ringGeometry,
    new MeshStandardMaterial({
      map: maps.saturn_ring ?? null,
      color: '#e9dcc0',
      transparent: true,
      side: DoubleSide,
      depthWrite: false,
      roughness: 0.9,
      metalness: 0,
    }),
  );
  ring.rotation.x = -Math.PI / 2 + 0.45;
  ring.position.set(0.38, -0.13, 0);
  saturnArm.add(ring);

  // A brass meridian ring around the hub.
  const meridian = new Mesh(new TorusGeometry(0.42, 0.003, 6, 96), darkBrass);
  meridian.rotation.x = Math.PI / 2;
  meridian.position.y = HUB_Y - 0.14;
  group.add(meridian);

  return {
    group,
    update(dt: number) {
      for (const a of arms) {
        a.pivot.rotation.y += a.speed * dt;
        a.spin.rotation.y += dt * 0.6;
      }
      moonPivot.rotation.y += dt * 0.8;
    },
  };
}

async function loadPlanetMaps(): Promise<Record<string, Texture>> {
  const loader = new TextureLoader();
  const names = ['mars', 'earth_daymap', 'jupiter', 'saturn', 'moon', 'saturn_ring'];
  const maps: Record<string, Texture> = {};
  await Promise.all(
    names.map(async (n) => {
      try {
        const t = await loader.loadAsync(`${BASE}planets/${n}.webp`);
        t.colorSpace = SRGBColorSpace;
        t.anisotropy = 4;
        maps[n] = t;
      } catch (e) {
        warn(`planet map ${n}`, e);
      }
    }),
  );
  return maps;
}

// -------------------------------------------------------------------- Hands

/** Warm, slightly translucent skin so the palm mirror reads through the hand. */
const handSkin = new MeshStandardMaterial({
  color: '#f1d9a0',
  emissive: new Color('#c9a15b'),
  emissiveIntensity: 0.08,
  roughness: 0.6,
  metalness: 0,
  transparent: true,
  opacity: 0.28,
  depthWrite: true,
});

function styleHand(model: Object3D): void {
  model.traverse((o) => {
    const mesh = o as SkinnedMesh;
    // AnimatedHand keeps a depth-only skin and a white outline clone (renderOrder 999).
    if (mesh.isSkinnedMesh && mesh.renderOrder !== 999) mesh.material = handSkin;
  });
}

class LocalLeftHand extends AnimatedHand {
  static assetKeyPrefix = 'palm-prism-hand-';
  static assetPath = `${BASE}hands/generic-hand/left.glb`;
  init(): void {
    super.init();
    styleHand(this.model);
  }
}

class LocalRightHand extends AnimatedHand {
  static assetKeyPrefix = 'palm-prism-hand-';
  static assetPath = `${BASE}hands/generic-hand/right.glb`;
  init(): void {
    super.init();
    styleHand(this.model);
  }
}

/** Point IWSDK's hand visuals at the self-hosted generic-hand models. */
function installHands(world: World): void {
  (outlineMaterial.uniforms.outlineColor.value as Color).set('#f1d9a0');
  const adapters = world.input.xr.visualAdapters.hand;
  adapters.left.updateVisualImplementation(
    LocalLeftHand as unknown as VisualConstructor<LocalLeftHand>,
  );
  adapters.right.updateVisualImplementation(
    LocalRightHand as unknown as VisualConstructor<LocalRightHand>,
  );
}

// ------------------------------------------------------- Sketchfab models

/**
 * Scale an object so its height is `height` metres and wrap it so the wrapper's
 * origin is at floor contact, centred under the object.
 */
function standOnFloor(object: Object3D, height: number): Group {
  object.updateMatrixWorld(true);
  const box = new Box3().setFromObject(object);
  const size = box.getSize(new Vector3());
  const scale = height / Math.max(1e-6, size.y);
  const centre = box.getCenter(new Vector3());
  object.position.set(-centre.x * scale, -box.min.y * scale, -centre.z * scale);
  object.scale.setScalar(scale);
  const wrapper = new Group();
  wrapper.add(object);
  return wrapper;
}

/** Point every PBR material in a model at our environment, scaled for the night room. */
function useRoomReflections(root: Object3D, strength: number): void {
  const env = getEnvMap();
  root.traverse((o) => {
    const mat = (o as Mesh).material as MeshStandardMaterial | undefined;
    if (!mat || !(mat as MeshStandardMaterial).isMeshStandardMaterial) return;
    mat.envMap = env;
    mat.envMapIntensity = strength;
    mat.needsUpdate = true;
  });
}

/**
 * Teal crystal from "Crystal" by Kyyy_24: eleven shards fanning from a point.
 * Merged, centred and sized to the crystal radius; our glass material is used.
 */
async function loadTealCrystal(renderer: WebGLRenderer): Promise<void> {
  const gltf = await getGLTFLoader(renderer).loadAsync(`${BASE}models/teal-crystal.glb`);
  const parts: BufferGeometry[] = [];
  gltf.scene.traverse((o) => {
    if ((o as Mesh).isMesh) parts.push(bakeGeometry(o as Mesh, 1));
  });
  if (!parts.length) return;
  const merged = mergeGeometries(parts.map((g) => g.toNonIndexed()), false);
  if (!merged) return;
  merged.computeBoundingBox();
  const box = merged.boundingBox!;
  const c = box.getCenter(new Vector3());
  merged.translate(-c.x, -c.y, -c.z);
  merged.computeBoundingSphere();
  const r = merged.boundingSphere!.radius || 1;
  const k = (CRYSTAL_RADIUS * 1.3) / r;
  merged.scale(k, k, k);
  merged.computeVertexNormals();
  merged.computeBoundingSphere();
  crystalGeometry.pulse = merged;
}

/** "Quartz Cluster" scan (Virginia Tech), simplified: two pieces at the room's edge. */
const QUARTZ_SPOTS: [number, number, number, number][] = [
  // x, z, height, yaw
  [-2.5, -2.6, 0.32, 0.5],
  [3.0, -2.8, 0.26, 2.3],
];

async function loadQuartz(renderer: WebGLRenderer): Promise<Group> {
  const gltf = await getGLTFLoader(renderer).loadAsync(`${BASE}models/quartz.glb`);
  const group = new Group();
  group.name = 'QuartzDecor';
  // The scan ships unlit; light it like everything else in the room.
  gltf.scene.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const old = mesh.material as MeshStandardMaterial;
    mesh.material = new MeshStandardMaterial({
      map: old.map ?? null,
      color: '#d9d4cc',
      roughness: 0.55,
      metalness: 0,
      envMap: getEnvMap(),
      envMapIntensity: 0.5,
    });
  });
  for (const [x, z, h, yaw] of QUARTZ_SPOTS) {
    const piece = standOnFloor(gltf.scene.clone(), h);
    piece.position.set(x, 0, z);
    piece.rotation.y = yaw;
    group.add(piece);
  }
  return group;
}

/**
 * "orrery" by korolevalidia: the table stays put while the arms and planets
 * turn slowly about the centre column. Its planets are dressed with Solar
 * System Scope maps, as spheres a hair larger than the model's own.
 */
// Planet centres and diameters in the model's own units (measured offline).
const ORRERY_PLANETS: [string, number, number, number, number][] = [
  ['jupiter', 0, 20.474, 33.256, 8.63],
  ['earth_daymap', -27.421, 20.906, 0.028, 4.57],
  ['mars', -26.535, 18.493, -22.211, 4.02],
  ['saturn', 27.44, 12.73, 0, 4.93],
  ['moon', 0, 19.198, -21.711, 2.79],
];

async function loadModelOrrery(
  renderer: WebGLRenderer,
  maps: Record<string, Texture>,
): Promise<Orrery> {
  const gltf = await getGLTFLoader(renderer).loadAsync(`${BASE}models/orrery.glb`);
  const model = gltf.scene;
  model.updateMatrixWorld(true);
  // Re-parent the arms onto a pivot on the centre column (model x = z = 0).
  const arms = new Group();
  arms.name = 'OrreryArmsPivot';
  const armMeshes: Object3D[] = [];
  model.traverse((o) => {
    if ((o as Mesh).isMesh && o.name.startsWith('OrreryArms')) armMeshes.push(o);
  });
  model.add(arms);
  for (const m of armMeshes) arms.attach(m);
  for (const [name, x, y, z, d] of ORRERY_PLANETS) {
    const map = maps[name];
    if (!map) continue;
    const planet = new Mesh(
      new SphereGeometry((d / 2) * 1.04, 32, 16),
      new MeshStandardMaterial({ map, roughness: 0.85, metalness: 0 }),
    );
    planet.position.set(x, y, z);
    planet.name = `Planet-${name}`;
    arms.add(planet);
    if (name === 'saturn' && maps.saturn_ring) {
      const ring = new Mesh(
        saturnRingGeometry(d * 0.6, d * 1.15),
        new MeshStandardMaterial({
          map: maps.saturn_ring,
          color: '#e9dcc0',
          transparent: true,
          side: DoubleSide,
          depthWrite: false,
          roughness: 0.9,
          metalness: 0,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, y + 0.05, z);
      arms.add(ring);
    }
  }
  useRoomReflections(model, 0.35);
  const group = standOnFloor(model, 1.1);
  group.name = 'Orrery';
  return {
    group,
    update(dt: number) {
      arms.rotation.y += dt * 0.05;
    },
  };
}

/** A ring whose u coordinate runs from the inner to the outer edge (alpha strip maps). */
function saturnRingGeometry(inner: number, outer: number): RingGeometry {
  const geometry = new RingGeometry(inner, outer, 64, 1);
  const uv = geometry.getAttribute('uv');
  const pos = geometry.getAttribute('position');
  const v = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    uv.setXY(i, (v.length() - inner) / (outer - inner), 0.5);
  }
  return geometry;
}

/**
 * "Planispheric astrolabe" (Virtual Museums of Małopolska, model by Stanisław
 * Ogarek), hung by its ring from a slim brass stand: a display piece beside
 * the board, facing the player, well outside every beam's reach.
 */
async function loadAstrolabe(renderer: WebGLRenderer): Promise<Group> {
  const gltf = await getGLTFLoader(renderer).loadAsync(`${BASE}models/astrolabe.glb`);
  useRoomReflections(gltf.scene, 0.5);
  const DISC = 0.5;
  const hung = standOnFloor(gltf.scene, DISC);
  const group = new Group();
  group.name = 'AstrolabeDisplay';
  const HANG = 0.82; // bottom of the disc above the floor
  hung.position.y = HANG;
  group.add(hung);
  // Stand beside the disc (the disc's face looks along local +x): foot,
  // upright, and an arm the ring hangs from.
  const brass = brassMaterial('dark');
  const top = HANG + DISC + 0.06;
  const upright = new Mesh(new CylinderGeometry(0.012, 0.016, top, 16, 1, true), brass);
  upright.position.set(0, top / 2, -0.26);
  group.add(upright);
  const foot = new Mesh(new CylinderGeometry(0.03, 0.13, 0.03, 32), brass);
  foot.position.set(0, 0.015, -0.26);
  group.add(foot);
  const arm = new Mesh(new CylinderGeometry(0.008, 0.008, 0.28, 12, 1, true), brass);
  arm.rotation.x = Math.PI / 2;
  arm.position.set(0, top, -0.13);
  group.add(arm);
  const hook = new Mesh(new CylinderGeometry(0.003, 0.003, 0.07, 8, 1, true), brass);
  hook.position.set(0, top - 0.035, 0);
  group.add(hook);
  return group;
}

// -------------------------------------------------------------------- Entry

export interface AssetHooks {
  /** Downloaded crystal geometry is ready: swap it onto the current level. */
  onCrystals(): void;
  /** A board-relative prop is ready to be added (origin at floor contact). */
  onProp(prop: Group, update?: (dt: number) => void): void;
}

/** Start every download in the background. Never awaited by the game. */
export function loadAssetProps(world: World, hooks: AssetHooks): void {
  if (!ASSETS_ENABLED) return;
  const renderer = world.renderer;
  try {
    installHands(world);
  } catch (e) {
    warn('self-hosted hands', e);
  }
  // Environment first, so props built afterwards pick up the new reflections.
  const env = loadEnvironment(renderer, world.scene).catch((e) => warn('moon_lab HDRI', e));
  const crystals = loadCrystals(renderer)
    .then(() => hooks.onCrystals())
    .catch((e) => warn('crystal meshes', e));
  // The Sketchfab teal crystal replaces the CC0 cluster once it arrives.
  Promise.all([crystals, loadTealCrystal(renderer)])
    .then(() => hooks.onCrystals())
    .catch((e) => warn('Sketchfab crystal', e));

  // Every prop stays more than 1.7 m (beam reach) plus its own radius from the
  // board centre. Quartz scan for decor, else the CC0 crystal clusters.
  Promise.all([env, crystals])
    .then(() => loadQuartz(renderer))
    .then((quartz) => hooks.onProp(quartz))
    .catch((e) => {
      warn('quartz cluster', e);
      hooks.onProp(createDecor());
    });

  // Orrery: the Sketchfab model, else the code-built one. Right of the board
  // and well behind it, away from the HUD.
  Promise.all([env, loadPlanetMaps()])
    .then(async ([, maps]) => {
      try {
        const orrery = await loadModelOrrery(renderer, maps);
        orrery.group.position.set(2.1, 0, -1.6);
        orrery.group.rotation.y = -0.6;
        hooks.onProp(orrery.group, orrery.update);
      } catch (e) {
        warn('Sketchfab orrery', e);
        const orrery = createOrrery(maps);
        orrery.group.position.set(1.85, 0, -1.65);
        orrery.group.scale.setScalar(1.25);
        hooks.onProp(orrery.group, orrery.update);
      }
    })
    .catch((e) => warn('orrery', e));

  // Astrolabe: a display piece on the left, behind the HUD, facing the player.
  env
    .then(() => loadAstrolabe(renderer))
    .then((astrolabe) => {
      // Far left, clear of the HUD (about 64° off centre for the seated player)
      // and over 1.9 m from the board centre including its stand.
      astrolabe.position.set(-2.1, 0, -0.5);
      // Turn the disc's face (local +x) toward the seated player at z = +0.5.
      astrolabe.rotation.y = -Math.atan2(1.0, 2.1);
      hooks.onProp(astrolabe);
    })
    .catch((e) => warn('Sketchfab astrolabe', e));
}
