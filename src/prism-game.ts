/**
 * PrismGameSystem: the whole Palm Prism loop.
 *
 * Each frame it turns each tracked palm into a two-sided mirror, traces the
 * light beam through palms, frozen mirrors, crystals and walls, charges the
 * crystals, and runs the level flow (intro -> play -> clear -> next).
 *
 * Board space: everything gameplay-related lives under one board group whose
 * top surface is y = 0. Palm poses are converted into that space, so the pure
 * tracer in beam.ts works in the same coordinates as levels.ts.
 */
import {
  createSystem,
  Euler,
  Group,
  Hovered,
  Matrix4,
  Object3D,
  Quaternion,
  Vector3,
  VisibilityState,
  type Entity,
  type UIKit,
  type UIKitMLAsset,
} from '@iwsdk/core';
import { prismAudio } from './audio.js';
import {
  BeamTrace,
  mirrorNormalFor,
  traceBeam,
  type BoxObstacle,
  type MirrorDisc,
  type SphereTarget,
} from './beam.js';
import {
  CHARGE_SECONDS,
  CRYSTAL_AIM_ASSIST,
  CRYSTAL_RADIUS,
  HOLD_SECONDS,
  LEVELS,
  MIRROR_RADIUS,
  type CrystalDef,
  type LevelDef,
} from './levels.js';
import {
  BeamRenderer,
  COLORS,
  createBlocker,
  createBoard,
  createCrystal,
  createEmitter,
  createFloor,
  createMirrorVisual,
  createSky,
  orientAlong,
  placeMirror,
  type CrystalVisual,
  type MirrorVisual,
  type Sky,
} from './prism-visuals.js';
import {
  currentStreak,
  loadProgress,
  recordClear,
  totalStars,
  type Progress,
} from './progress.js';

type Side = 'left' | 'right';
type GameState = 'intro' | 'play' | 'clear' | 'finale';

const SIDES: Side[] = ['left', 'right'];
const HISTORY = 12;
/** Frames to look back when freezing, so the pinch motion itself is ignored. */
const FREEZE_LOOKBACK = 7;
const MAX_FROZEN = 4;
/** Seated layout: board this far ahead of and below the eyes. */
const BOARD_DISTANCE = 0.5;
const BOARD_DROP = 0.42;
const DESKTOP_BOARD_POSITION = new Vector3(0, 1.0, -0.5);
const HUD_LOCAL = new Vector3(0, 0.5, -0.36);
const HIDDEN_Y = -100;
const INTRO_SECONDS = 0.6;
const AUTO_ADVANCE_SECONDS = 3.5;

interface PalmState {
  side: Side;
  valid: boolean;
  hasPrev: boolean;
  center: Vector3;
  normal: Vector3;
  history: Float32Array;
  historyCount: number;
  historyIndex: number;
  mirror: MirrorDisc;
  visual: MirrorVisual;
  jointSource: unknown;
  wrist: number;
  indexProx: number;
  middleProx: number;
  pinkyProx: number;
}

interface CrystalState {
  def: CrystalDef;
  target: SphereTarget;
  visual: CrystalVisual;
  baseY: number;
  charge: number;
  lit: boolean;
  glow: number;
  glowing: boolean;
  lastPing: number;
  intensity: number;
}

function makeMirror(): MirrorDisc {
  return {
    cx: 0,
    cy: 0,
    cz: 0,
    nx: 0,
    ny: 1,
    nz: 0,
    radius: MIRROR_RADIUS,
    active: false,
  };
}

function disposeTree(root: Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as Object3D & {
      geometry?: { dispose(): void };
      material?: { dispose(): void } | { dispose(): void }[];
    };
    mesh.geometry?.dispose();
    const mat = mesh.material;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else mat?.dispose();
  });
}

export class PrismGameSystem extends createSystem({}) {
  private board!: Group;
  private levelGroup!: Group;
  private emitter!: Group;
  private beam!: BeamRenderer;
  private sky!: Sky;
  private hint!: MirrorVisual;
  private trace = new BeamTrace(16, 2 + MAX_FROZEN);

  private palms!: Record<Side, PalmState>;
  private frozen: MirrorDisc[] = [];
  private frozenVisuals: MirrorVisual[] = [];
  private mirrors: MirrorDisc[] = [];

  private level!: LevelDef;
  private levelIndex = 0;
  private crystals: CrystalState[] = [];
  private crystalTargets: SphereTarget[] = [];
  private boxes: BoxObstacle[] = [];
  /** The board top itself: beams that hit it stop there. */
  private boardSlab: BoxObstacle = {
    minX: -0.25,
    minY: -0.035,
    minZ: -0.25,
    maxX: 0.25,
    maxY: 0,
    maxZ: 0.25,
  };
  /** The floor, in board space; its top follows the board height. */
  private floorBox: BoxObstacle = {
    minX: -20,
    minY: -20,
    minZ: -20,
    maxX: 20,
    maxY: -1,
    maxZ: 20,
  };
  private emitterDir = new Vector3();
  private hintNormal: [number, number, number] = [0, 1, 0];
  private anyLit = false;

  private state: GameState = 'intro';
  private stateTime = 0;
  private holdTime = 0;
  private freezesUsed = 0;
  private tipFlash = 0;
  private recenterIn = -1;
  private progress!: Progress;

  private hudObject?: Object3D;
  private hudEntity?: Entity;
  private hud: {
    levelLabel?: UIKit.Text;
    title?: UIKit.Text;
    tip?: UIKit.Text;
    freeze?: UIKit.Text;
    streak?: UIKit.Text;
    stars: { setProperties(p: Record<string, unknown>): void }[];
    next?: { setProperties(p: Record<string, unknown>): void };
    nextLabel?: UIKit.Text;
  } = { stars: [] };

  // Scratch objects, allocated once.
  private boardInv = new Matrix4();
  private jointMat = new Matrix4();
  private vA = new Vector3();
  private vB = new Vector3();
  private vC = new Vector3();
  private vD = new Vector3();
  private rawCenter = new Vector3();
  private rawNormal = new Vector3();
  private local = new Vector3();
  private localN = new Vector3();
  private quat = new Quaternion();
  private euler = new Euler(0, 0, 0, 'YXZ');

  init(): void {
    this.progress = loadProgress();

    const floor = createFloor();
    this.world.createTransformEntity(floor, { persistent: true });
    this.sky = createSky();
    this.world.createTransformEntity(this.sky.group, { persistent: true });
    this.sky.setEarned(totalStars(this.progress));

    this.board = createBoard();
    this.world.createTransformEntity(this.board, { persistent: true });
    this.board.position.copy(DESKTOP_BOARD_POSITION);

    this.levelGroup = new Group();
    this.levelGroup.name = 'Level';
    this.board.add(this.levelGroup);
    this.emitter = createEmitter();
    this.board.add(this.emitter);
    this.beam = new BeamRenderer();
    this.board.add(this.beam.group);

    this.palms = {
      left: this.makePalm('left'),
      right: this.makePalm('right'),
    };
    for (let i = 0; i < MAX_FROZEN; i++) {
      const m = makeMirror();
      this.frozen.push(m);
      const v = createMirrorVisual(COLORS.frozen);
      v.fill.opacity = 0.22;
      this.frozenVisuals.push(v);
      this.board.add(v.group);
    }
    this.mirrors = [
      this.palms.left.mirror,
      this.palms.right.mirror,
      ...this.frozen,
    ];
    this.hint = createMirrorVisual(COLORS.palm);
    this.board.add(this.hint.group);

    this.setupHud();
    this.loadLevel(Math.min(this.progress.unlocked, LEVELS.length - 1));

    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((visibility) => {
        const immersive = visibility !== VisibilityState.NonImmersive;
        if (immersive) {
          prismAudio.ensure();
          prismAudio.setDrone(true);
          this.recenterIn = 0.4;
        } else {
          prismAudio.setDrone(false);
          this.board.position.copy(DESKTOP_BOARD_POSITION);
          this.board.rotation.set(0, 0, 0);
        }
        this.placeHud(immersive);
      }),
    );

    // Dev shortcuts for testing and video capture: N next, P previous, R reset.
    if (import.meta.env.DEV) {
      const onKey = (event: KeyboardEvent) => {
        const key = event.key.toLowerCase();
        if (key === 'n') this.loadLevel((this.levelIndex + 1) % LEVELS.length);
        else if (key === 'p')
          this.loadLevel((this.levelIndex - 1 + LEVELS.length) % LEVELS.length);
        else if (key === 'r') this.loadLevel(this.levelIndex);
      };
      window.addEventListener('keydown', onKey);
      this.cleanupFuncs.push(() => window.removeEventListener('keydown', onKey));
    }
  }

  private makePalm(side: Side): PalmState {
    const visual = createMirrorVisual(COLORS.palm);
    this.board.add(visual.group);
    return {
      side,
      valid: false,
      hasPrev: false,
      center: new Vector3(),
      normal: new Vector3(0, 1, 0),
      history: new Float32Array(HISTORY * 6),
      historyCount: 0,
      historyIndex: 0,
      mirror: makeMirror(),
      visual,
      jointSource: null,
      wrist: -1,
      indexProx: -1,
      middleProx: -1,
      pinkyProx: -1,
    };
  }

  // ---------------------------------------------------------------- HUD

  private setupHud(): void {
    const panel = this.world.getSceneObject<UIKitMLAsset>('hud-panel');
    this.hudObject = panel;
    this.hudEntity = this.world.getSceneEntity('hud-panel');
    if (!panel) return;
    const text = (id: string) =>
      panel.getElementById<UIKit.Text>(id) ?? undefined;
    this.hud.levelLabel = text('level-label');
    this.hud.title = text('level-title');
    this.hud.tip = text('tip-text');
    this.hud.freeze = text('freeze-text');
    this.hud.streak = text('streak-text');
    this.hud.nextLabel = text('next-label');
    for (const id of ['star-1', 'star-2', 'star-3']) {
      const star = panel.getElementById(id);
      if (star) this.hud.stars.push(star);
    }
    const next = panel.getElementById('next-button') ?? undefined;
    const reset = panel.getElementById('reset-button') ?? undefined;
    const recenter = panel.getElementById('recenter-button') ?? undefined;
    this.hud.next = next;

    const onNext = () => {
      prismAudio.ensure();
      if (this.state === 'finale') this.loadLevel(0);
      else if (this.state === 'clear') this.advance();
    };
    const onReset = () => {
      prismAudio.ensure();
      this.loadLevel(this.levelIndex);
    };
    const onRecenter = () => {
      prismAudio.ensure();
      this.recenter();
    };
    next?.addEventListener('click', onNext);
    reset?.addEventListener('click', onReset);
    recenter?.addEventListener('click', onRecenter);
    this.cleanupFuncs.push(() => {
      next?.removeEventListener('click', onNext);
      reset?.removeEventListener('click', onReset);
      recenter?.removeEventListener('click', onRecenter);
    });
  }

  private placeHud(immersive: boolean): void {
    if (!this.hudObject) return;
    if (!immersive) {
      this.hudObject.position.set(0, HIDDEN_Y, 0);
      return;
    }
    this.board.updateWorldMatrix(true, false);
    this.vA.copy(HUD_LOCAL);
    this.board.localToWorld(this.vA);
    this.hudObject.position.copy(this.vA);
    this.euler.set(-0.14, this.board.rotation.y, 0, 'YXZ');
    this.quat.setFromEuler(this.euler);
    this.hudObject.quaternion.copy(this.quat);
  }

  private refreshHud(): void {
    const level = this.level;
    this.hud.levelLabel?.setProperties({
      text: `LEVEL ${this.levelIndex + 1} / ${LEVELS.length}`,
    });
    this.hud.title?.setProperties({ text: level.title });
    this.hud.tip?.setProperties({ text: level.tip });
    this.refreshFreezeText();
    const streak = currentStreak(this.progress);
    this.hud.streak?.setProperties({
      text: streak > 0 ? `Streak ${streak} day${streak === 1 ? '' : 's'}` : '',
    });
    this.setStars(this.progress.stars[level.id] ?? 0);
    this.hud.next?.setProperties({ display: 'none' });
  }

  private refreshFreezeText(): void {
    const level = this.level;
    this.hud.freeze?.setProperties({
      text:
        level.freezes > 0
          ? `Freezes ${level.freezes - this.freezesUsed} left`
          : 'Palms only',
    });
  }

  private setStars(count: number): void {
    this.hud.stars.forEach((star, i) =>
      star.setProperties({
        color: i < count ? '#ffc23d' : '#3d3f4a',
        fill: i < count ? '#ffc23d' : 'none',
      }),
    );
  }

  private flashTip(text: string): void {
    this.hud.tip?.setProperties({ text });
    this.tipFlash = 2.2;
  }

  // ------------------------------------------------------------- Levels

  private loadLevel(index: number): void {
    this.levelIndex = index;
    this.level = LEVELS[index];
    const level = this.level;

    for (const child of [...this.levelGroup.children]) {
      this.levelGroup.remove(child);
      disposeTree(child);
    }

    this.crystals = level.crystals.map((def) => {
      const visual = createCrystal(def.kind, def.note);
      visual.group.position.set(def.pos[0], def.pos[1], def.pos[2]);
      visual.group.scale.setScalar(0.001);
      this.levelGroup.add(visual.group);
      return {
        def,
        target: {
          x: def.pos[0],
          y: def.pos[1],
          z: def.pos[2],
          radius: CRYSTAL_RADIUS + CRYSTAL_AIM_ASSIST,
        },
        visual,
        baseY: def.pos[1],
        charge: 0,
        lit: false,
        glow: 0,
        glowing: false,
        lastPing: -10,
        intensity: 0.2,
      };
    });
    this.crystalTargets = this.crystals.map((c) => c.target);
    const levelBoxes = level.blockers.map((b) => {
      this.levelGroup.add(createBlocker(b.min, b.max));
      return {
        minX: b.min[0],
        minY: b.min[1],
        minZ: b.min[2],
        maxX: b.max[0],
        maxY: b.max[1],
        maxZ: b.max[2],
      };
    });
    this.boxes = [this.boardSlab, this.floorBox, ...levelBoxes];

    const e = level.emitter;
    this.emitter.position.set(e.pos[0], e.pos[1], e.pos[2]);
    this.emitterDir.set(e.dir[0], e.dir[1], e.dir[2]).normalize();
    orientAlong(this.emitter, this.emitterDir);

    if (level.hint) {
      const c = level.hint.center;
      const t = level.hint.toward;
      this.hintNormal = mirrorNormalFor(
        [this.emitterDir.x, this.emitterDir.y, this.emitterDir.z],
        [t[0] - c[0], t[1] - c[1], t[2] - c[2]],
      );
      placeMirror(
        this.hint,
        c[0],
        c[1],
        c[2],
        this.hintNormal[0],
        this.hintNormal[1],
        this.hintNormal[2],
      );
    }
    this.hint.group.visible = false;

    for (let i = 0; i < MAX_FROZEN; i++) {
      this.frozen[i].active = false;
      this.frozenVisuals[i].group.visible = false;
    }
    this.freezesUsed = 0;
    this.holdTime = 0;
    this.anyLit = false;
    this.tipFlash = 0;
    this.setState('intro');
    this.refreshHud();
  }

  private advance(): void {
    if (this.levelIndex + 1 < LEVELS.length) this.loadLevel(this.levelIndex + 1);
  }

  private setState(state: GameState): void {
    this.state = state;
    this.stateTime = 0;
  }

  private clearLevel(): void {
    const level = this.level;
    const stars =
      this.freezesUsed <= level.par ? 3 : this.freezesUsed <= level.par + 1 ? 2 : 1;
    this.progress = recordClear(
      this.progress,
      level.id,
      this.levelIndex,
      stars,
      LEVELS.length,
    );
    this.sky.setEarned(totalStars(this.progress));
    prismAudio.celebrate(level.crystals.map((c) => c.note));
    this.setStars(stars);
    const streak = currentStreak(this.progress);
    this.hud.streak?.setProperties({
      text: `Streak ${streak} day${streak === 1 ? '' : 's'}`,
    });
    const last = this.levelIndex === LEVELS.length - 1;
    if (last) {
      this.setState('finale');
      this.hud.tip?.setProperties({
        text: 'Every level cleared! Come back tomorrow to grow your sky.',
      });
      this.hud.nextLabel?.setProperties({ text: 'Play again' });
    } else {
      this.setState('clear');
      this.hud.tip?.setProperties({
        text: stars === 3 ? 'Perfect! Three stars.' : 'Level clear!',
      });
      this.hud.nextLabel?.setProperties({ text: 'Next' });
    }
    this.hud.next?.setProperties({ display: 'flex' });
  }

  // ------------------------------------------------------------ Recenter

  private recenter(): void {
    const head = this.player.head;
    head.updateWorldMatrix(true, false);
    head.getWorldPosition(this.vA);
    head.getWorldQuaternion(this.quat);
    this.vB.set(0, 0, -1).applyQuaternion(this.quat);
    this.vB.y = 0;
    if (this.vB.lengthSq() < 1e-6) this.vB.set(0, 0, -1);
    this.vB.normalize();
    this.board.position.set(
      this.vA.x + this.vB.x * BOARD_DISTANCE,
      Math.max(0.5, this.vA.y - BOARD_DROP),
      this.vA.z + this.vB.z * BOARD_DISTANCE,
    );
    this.board.rotation.set(0, Math.atan2(-this.vB.x, -this.vB.z), 0);
    this.placeHud(true);
  }

  // --------------------------------------------------------------- Palms

  private resolveJoints(p: PalmState, spaces: XRJointSpace[]): void {
    p.jointSource = spaces;
    p.wrist = p.indexProx = p.middleProx = p.pinkyProx = -1;
    for (let i = 0; i < spaces.length; i++) {
      switch (spaces[i].jointName) {
        case 'wrist':
          p.wrist = i;
          break;
        case 'index-finger-phalanx-proximal':
          p.indexProx = i;
          break;
        case 'middle-finger-phalanx-proximal':
          p.middleProx = i;
          break;
        case 'pinky-finger-phalanx-proximal':
          p.pinkyProx = i;
          break;
      }
    }
  }

  private jointWorld(
    gripWorld: Matrix4,
    transforms: Float32Array,
    index: number,
    out: Vector3,
  ): void {
    this.jointMat.fromArray(transforms, index * 16).premultiply(gripWorld);
    out.setFromMatrixPosition(this.jointMat);
  }

  /** Read one palm (or controller paddle) into world space, smoothed. */
  private readPalm(p: PalmState, delta: number): boolean {
    let ok = false;
    const hand = this.input.visualAdapters.hand[p.side];
    const transforms = hand.jointTransforms;
    if (
      this.input.isPrimary('hand', p.side) &&
      hand.connected &&
      transforms &&
      hand.gripSpace
    ) {
      if (p.jointSource !== hand.jointSpaces) {
        this.resolveJoints(p, hand.jointSpaces);
      }
      if (p.wrist >= 0 && p.indexProx >= 0 && p.middleProx >= 0 && p.pinkyProx >= 0) {
        const grip = hand.gripSpace;
        grip.updateWorldMatrix(true, false);
        this.jointWorld(grip.matrixWorld, transforms, p.wrist, this.vA);
        this.jointWorld(grip.matrixWorld, transforms, p.indexProx, this.vB);
        this.jointWorld(grip.matrixWorld, transforms, p.pinkyProx, this.vC);
        this.jointWorld(grip.matrixWorld, transforms, p.middleProx, this.vD);
        // Palm centre: a little past halfway from the wrist to the middle knuckle.
        this.rawCenter.copy(this.vA).lerp(this.vD, 0.55);
        // Palm plane: wrist, index knuckle and pinky knuckle.
        this.vB.sub(this.vA);
        this.vC.sub(this.vA);
        this.rawNormal.crossVectors(this.vB, this.vC);
        ok = this.rawNormal.lengthSq() > 1e-10;
        if (ok) this.rawNormal.normalize();
      }
    } else if (this.input.isPrimary('controller', p.side)) {
      const grip = this.player.gripSpaces[p.side];
      const ray = this.player.raySpaces[p.side];
      grip.updateWorldMatrix(true, false);
      ray.updateWorldMatrix(true, false);
      grip.getWorldPosition(this.rawCenter);
      ray.getWorldQuaternion(this.quat);
      this.rawNormal.set(0, 0, -1).applyQuaternion(this.quat);
      this.rawCenter.addScaledVector(this.rawNormal, 0.05);
      ok = true;
    }

    if (!ok) {
      p.hasPrev = false;
      return false;
    }
    if (!p.hasPrev) {
      p.center.copy(this.rawCenter);
      p.normal.copy(this.rawNormal);
      p.hasPrev = true;
    } else {
      const a = 1 - Math.exp(-delta * 20);
      p.center.lerp(this.rawCenter, a);
      if (p.normal.dot(this.rawNormal) < 0) this.rawNormal.negate();
      p.normal.lerp(this.rawNormal, a).normalize();
    }
    return true;
  }

  private updatePalm(p: PalmState, delta: number, immersive: boolean): void {
    p.valid = immersive && this.readPalm(p, delta);
    p.mirror.active = p.valid;
    if (!p.valid) {
      p.visual.group.visible = false;
      return;
    }
    this.local.copy(p.center).applyMatrix4(this.boardInv);
    this.localN.copy(p.normal).transformDirection(this.boardInv);
    const m = p.mirror;
    m.cx = this.local.x;
    m.cy = this.local.y;
    m.cz = this.local.z;
    m.nx = this.localN.x;
    m.ny = this.localN.y;
    m.nz = this.localN.z;

    const h = p.historyIndex * 6;
    p.history[h] = m.cx;
    p.history[h + 1] = m.cy;
    p.history[h + 2] = m.cz;
    p.history[h + 3] = m.nx;
    p.history[h + 4] = m.ny;
    p.history[h + 5] = m.nz;
    p.historyIndex = (p.historyIndex + 1) % HISTORY;
    if (p.historyCount < HISTORY) p.historyCount++;

    placeMirror(p.visual, m.cx, m.cy, m.cz, m.nx, m.ny, m.nz);
    p.visual.group.visible = true;
  }

  private inPlayVolume(m: MirrorDisc): boolean {
    return Math.hypot(m.cx, m.cz) < 0.36 && m.cy > -0.05 && m.cy < 0.6;
  }

  private tryFreeze(p: PalmState): void {
    if (this.state !== 'play' || !p.valid) return;
    if (this.hudEntity?.hasComponent(Hovered)) return;
    if (!this.inPlayVolume(p.mirror)) return;
    const level = this.level;
    if (level.freezes === 0) {
      this.flashTip('No freezes here. Just your palms.');
      prismAudio.deny();
      return;
    }
    if (this.freezesUsed >= level.freezes) {
      this.flashTip('No freezes left. Press Reset to try again.');
      prismAudio.deny();
      return;
    }
    const slot = this.frozen.findIndex((f) => !f.active);
    if (slot < 0) return;
    const back = Math.min(FREEZE_LOOKBACK, p.historyCount - 1);
    const idx = (p.historyIndex - 1 - back + HISTORY * 2) % HISTORY;
    const h = idx * 6;
    const f = this.frozen[slot];
    f.cx = p.history[h];
    f.cy = p.history[h + 1];
    f.cz = p.history[h + 2];
    f.nx = p.history[h + 3];
    f.ny = p.history[h + 4];
    f.nz = p.history[h + 5];
    f.active = true;
    const v = this.frozenVisuals[slot];
    placeMirror(v, f.cx, f.cy, f.cz, f.nx, f.ny, f.nz);
    v.group.visible = true;
    this.freezesUsed++;
    this.refreshFreezeText();
    prismAudio.freeze();
  }

  // --------------------------------------------------------------- Frame

  update(delta: number, time: number): void {
    const dt = Math.min(delta, 0.1);
    const immersive =
      this.world.visibilityState.peek() !== VisibilityState.NonImmersive;

    if (this.recenterIn >= 0) {
      this.recenterIn -= dt;
      if (this.recenterIn < 0) this.recenter();
    }

    this.board.updateWorldMatrix(true, false);
    this.boardInv.copy(this.board.matrixWorld).invert();
    this.floorBox.maxY = -this.board.position.y;

    for (const side of SIDES) this.updatePalm(this.palms[side], dt, immersive);

    if (immersive) {
      for (const side of SIDES) {
        if (this.input.xr.getSelectState(side).start) {
          prismAudio.ensure();
          this.tryFreeze(this.palms[side]);
        }
      }
    }

    const e = this.level.emitter;
    traceBeam(
      e.pos[0],
      e.pos[1],
      e.pos[2],
      this.emitterDir.x,
      this.emitterDir.y,
      this.emitterDir.z,
      this.mirrors,
      this.crystalTargets,
      this.boxes,
      this.trace,
    );
    this.beam.update(
      this.trace.points,
      this.trace.pointCount,
      this.trace.mirrorAtPoint,
      time,
    );

    for (let i = 0; i < 2; i++) {
      const p = i === 0 ? this.palms.left : this.palms.right;
      const hit = this.trace.mirrorHit[i] === 1;
      p.visual.fill.opacity = hit ? 0.3 : 0.12;
      p.visual.ring.opacity = hit ? 0.95 : 0.5;
    }

    this.stateTime += dt;
    this.updateCrystals(dt, time);
    this.updateHint(time);

    if (this.tipFlash > 0) {
      this.tipFlash -= dt;
      if (this.tipFlash <= 0 && (this.state === 'play' || this.state === 'intro')) {
        this.hud.tip?.setProperties({ text: this.level.tip });
      }
    }

    if (this.state === 'intro' && this.stateTime >= INTRO_SECONDS) {
      this.setState('play');
    } else if (this.state === 'clear' && this.stateTime >= AUTO_ADVANCE_SECONDS) {
      this.advance();
    }
  }

  private updateCrystals(dt: number, time: number): void {
    const playing = this.state === 'play';
    let allStay = true;
    let allPulse = true;
    let hasPulse = false;
    const introT = Math.min(1, this.stateTime / INTRO_SECONDS);
    const appear = this.state === 'intro' ? 1 - Math.pow(1 - introT, 3) : 1;

    for (let i = 0; i < this.crystals.length; i++) {
      const c = this.crystals[i];
      const hit = playing && this.trace.crystalHit[i] === 1;
      let target: number;
      if (c.def.kind === 'stay') {
        if (!c.lit) {
          if (hit) c.charge += dt;
          else c.charge = Math.max(0, c.charge - dt * 0.6);
          if (c.charge >= CHARGE_SECONDS) {
            c.lit = true;
            this.anyLit = true;
            prismAudio.bell(c.def.note);
          }
        }
        if (!c.lit) allStay = false;
        target = c.lit ? 2.6 : 0.25 + (c.charge / CHARGE_SECONDS) * 1.8;
      } else {
        hasPulse = true;
        c.glow = hit ? 0.15 : c.glow - dt;
        const glowing = c.glow > 0;
        if (glowing && !c.glowing && time - c.lastPing > 0.35) {
          prismAudio.bell(c.def.note, 0.12);
          c.lastPing = time;
        }
        if (glowing) this.anyLit = true;
        c.glowing = glowing;
        if (!glowing) allPulse = false;
        target = glowing ? 2.8 : 0.2;
      }
      c.intensity += (target - c.intensity) * Math.min(1, dt * 10);
      c.visual.material.emissiveIntensity = c.intensity;
      c.visual.halo.material.opacity = Math.min(1, 0.08 + c.intensity * 0.3);
      const charging = c.def.kind === 'stay' && !c.lit && c.charge > 0;
      const pulse = charging ? 1 + Math.sin(time * 18) * 0.06 : 1;
      c.visual.group.scale.setScalar(appear * pulse);
      c.visual.mesh.rotation.y += dt * (c.intensity > 1.5 ? 1.4 : 0.35);
      c.visual.group.position.y = c.baseY + Math.sin(time * 1.3 + i * 1.7) * 0.004;
    }

    if (!playing) return;
    if (allStay && allPulse) {
      this.holdTime += dt;
      if (!hasPulse || this.holdTime >= HOLD_SECONDS) this.clearLevel();
    } else {
      this.holdTime = 0;
    }
  }

  private updateHint(time: number): void {
    const show = !!this.level.hint && !this.anyLit && this.state === 'play';
    this.hint.group.visible = show;
    if (!show) return;
    const s = 0.5 + 0.5 * Math.sin(time * 3);
    this.hint.fill.opacity = 0.04 + 0.08 * s;
    this.hint.ring.opacity = 0.15 + 0.35 * s;
  }
}
