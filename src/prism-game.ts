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
  BufferGeometry,
  Float32BufferAttribute,
  Hovered,
  Line,
  LineDashedMaterial,
  Matrix4,
  MeshBasicMaterial,
  Object3D,
  Pressed,
  Quaternion,
  RayInteractable,
  Vector3,
  VisibilityState,
  type Entity,
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
import { createDailyLevel, todayKey } from './daily.js';
import { Hud, TitleCard, type HudAction, type HudGroup, type HudState } from './hud.js';
import {
  CHARGE_SECONDS,
  CRYSTAL_AIM_ASSIST,
  CRYSTAL_RADIUS,
  HARP_LEVEL,
  HOLD_SECONDS,
  LEVELS,
  MIRROR_RADIUS,
  type CrystalDef,
  type LevelDef,
} from './levels.js';
import { PrismButton } from './prism-button.js';
import {
  BeamRenderer,
  BurstPool,
  COLORS,
  createBlocker,
  createBoard,
  createCrystal,
  createEmitter,
  createFloor,
  createMirrorVisual,
  createSky,
  DustMotes,
  orientAlong,
  placeMirror,
  type Board,
  type CrystalVisual,
  type MirrorVisual,
  type Sky,
} from './prism-visuals.js';
import { loadSettings, saveSettings, type Settings } from './settings.js';
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
const HUD_ACTIONS: HudAction[] = [
  'restart',
  'levels',
  'daily',
  'harp',
  'next',
  'options',
  'opt-hold',
  'opt-onehand',
  'opt-raise',
  'opt-lower',
  'recenter',
  'opt-done',
  'lvl-1',
  'lvl-2',
  'lvl-3',
  'lvl-4',
  'lvl-5',
  'lvl-6',
  'lvl-7',
  'lvl-8',
  'lvl-back',
];
/** Seconds a palm must stay still to freeze when hold-to-freeze is on. */
const HOLD_FREEZE_SECONDS = 2;
const HISTORY = 12;
/** Frames to look back when freezing, so the pinch motion itself is ignored. */
const FREEZE_LOOKBACK = 7;
const MAX_FROZEN = 4;
/** Seated layout: board this far ahead of and below the eyes. */
const BOARD_DISTANCE = 0.5;
const BOARD_DROP = 0.42;
const DESKTOP_BOARD_POSITION = new Vector3(0.12, 1.0, -0.5);
// Off to the left and turned toward the player: beams that rise from the
// lamp never cross it, and hand rays over the board point past it, so
// pinches there freeze mirrors instead of pressing buttons.
const HUD_LOCAL = new Vector3(-0.42, 0.56, -0.12);
const HUD_YAW = 0.5;
const HUD_TILT = -0.12;
const TITLE_LOCAL_Y = 0.34;
const HIDDEN_Y = -100;
const INTRO_SECONDS = 0.6;
const AUTO_ADVANCE_SECONDS = 3.5;
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

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
  return { cx: 0, cy: 0, cz: 0, nx: 0, ny: 1, nz: 0, radius: MIRROR_RADIUS, active: false };
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

function prettyDate(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
  });
}

export class PrismGameSystem extends createSystem({
  buttons: { required: [PrismButton] },
  pressed: { required: [PrismButton, Pressed] },
  hovered: { required: [PrismButton, Hovered] },
}) {
  private boardParts!: Board;
  private board!: Group;
  private rune!: MeshBasicMaterial;
  private levelGroup!: Group;
  private emitter!: Group;
  private beam!: BeamRenderer;
  private dust!: DustMotes;
  private bursts!: BurstPool;
  private sky!: Sky;
  private hint!: MirrorVisual;
  private showcase = makeMirror();
  private showcaseVisual!: MirrorVisual;
  private trace = new BeamTrace(16, 3 + MAX_FROZEN);

  private palms!: Record<Side, PalmState>;
  private frozen: MirrorDisc[] = [];
  private frozenVisuals: MirrorVisual[] = [];
  private mirrors: MirrorDisc[] = [];

  private level!: LevelDef;
  private levelIndex = 0;
  private isDaily = false;
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
  private anyLit = false;

  private state: GameState = 'intro';
  private stateTime = 0;
  private holdTime = 0;
  private freezesUsed = 0;
  private clearFlash = 0;
  private lastStars = 0;
  private tipOverride: string | null = null;
  private tipTimer = 0;
  private recenterIn = -1;
  private immersive = false;
  private progress!: Progress;

  private hud!: Hud;
  private hudEntity!: Entity;
  private titleCard!: TitleCard;
  private hoverCount = 0;
  private buttonEntities = {} as Record<HudAction, Entity>;
  private hudGroup: HudGroup = 'main';
  private nextVisible = false;
  private isHarp = false;
  private settings!: Settings;
  /** Hold-to-freeze: per palm, seconds held still and the pose it started at. */
  private dwell = {
    left: { t: 0, armed: true, x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0 },
    right: { t: 0, armed: true, x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0 },
  };
  // Onboarding ghost: tilts from flat to the right angle, then shows the path.
  private ghostFrom = new Quaternion();
  private ghostTo = new Quaternion();
  private ghostLine!: Line;
  private ghostLineMat!: LineDashedMaterial;

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
    this.settings = loadSettings();

    this.world.createTransformEntity(createFloor(), { persistent: true });
    this.sky = createSky();
    this.world.createTransformEntity(this.sky.group, { persistent: true });
    this.sky.setEarned(totalStars(this.progress));

    this.boardParts = createBoard();
    this.board = this.boardParts.group;
    this.rune = this.boardParts.rune;
    this.world.createTransformEntity(this.board, { persistent: true });
    this.placeBoardForBrowser();

    this.levelGroup = new Group();
    this.levelGroup.name = 'Level';
    this.board.add(this.levelGroup);
    this.emitter = createEmitter();
    this.board.add(this.emitter);
    this.beam = new BeamRenderer();
    this.board.add(this.beam.group);
    this.dust = new DustMotes();
    this.board.add(this.dust.points);
    this.bursts = new BurstPool();
    this.board.add(this.bursts.group);

    this.palms = { left: this.makePalm('left'), right: this.makePalm('right') };
    for (let i = 0; i < MAX_FROZEN; i++) {
      this.frozen.push(makeMirror());
      const v = createMirrorVisual(COLORS.frozen, COLORS.frozen);
      v.fill.opacity = 0.3;
      this.frozenVisuals.push(v);
      this.board.add(v.group);
    }
    this.showcaseVisual = createMirrorVisual(COLORS.palm);
    this.board.add(this.showcaseVisual.group);
    this.mirrors = [
      this.palms.left.mirror,
      this.palms.right.mirror,
      ...this.frozen,
      this.showcase,
    ];
    this.hint = createMirrorVisual(COLORS.palm);
    this.board.add(this.hint.group);
    this.ghostLineMat = new LineDashedMaterial({
      color: COLORS.beamGlow,
      dashSize: 0.012,
      gapSize: 0.01,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.ghostLine = new Line(
      new BufferGeometry().setAttribute(
        'position',
        new Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3),
      ),
      this.ghostLineMat,
    );
    this.ghostLine.visible = false;
    this.board.add(this.ghostLine);

    this.titleCard = new TitleCard();
    this.titleCard.mesh.position.set(0, TITLE_LOCAL_Y, -0.04);
    this.titleCard.baseY = TITLE_LOCAL_Y;
    this.board.add(this.titleCard.mesh);

    this.setupHud();
    this.loadLevel(Math.min(this.progress.unlocked, LEVELS.length - 1));

    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((visibility) => {
        this.immersive = visibility !== VisibilityState.NonImmersive;
        if (this.immersive) {
          prismAudio.ensure();
          prismAudio.setDrone(true);
          this.recenterIn = 0.4;
        } else {
          prismAudio.setDrone(false);
          this.placeBoardForBrowser();
        }
        this.placeHud();
      }),
    );

    // Dev shortcuts for testing and video capture: N next, P previous,
    // R reset, D daily puzzle, H light harp, 1-8 jump to a level, I log beam state.
    if (import.meta.env.DEV) {
      const onKey = (event: KeyboardEvent) => {
        const key = event.key.toLowerCase();
        if (key === 'n') this.loadLevel((this.levelIndex + 1) % LEVELS.length);
        else if (key === 'p')
          this.loadLevel((this.levelIndex - 1 + LEVELS.length) % LEVELS.length);
        else if (key === 'r') this.restart();
        else if (key === 'd') this.loadDaily();
        else if (key === 'h') this.loadHarp();
        else if (key >= '1' && key <= '9') this.loadLevel(Number(key) - 1);
        else if (key === 'i') this.logDebug();
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

  private placeBoardForBrowser(): void {
    this.board.position.copy(DESKTOP_BOARD_POSITION);
    this.board.rotation.set(0, -0.12, 0);
    this.boardParts.setStemHeight(DESKTOP_BOARD_POSITION.y);
  }

  // ---------------------------------------------------------------- HUD

  private setupHud(): void {
    this.hud = new Hud();
    this.hudEntity = this.world.createTransformEntity(this.hud.root, { persistent: true });
    for (const action of HUD_ACTIONS) {
      const mesh = this.hud.buttons[action].mesh;
      const home = mesh.position.clone();
      const entity = this.world.createTransformEntity(mesh, {
        parent: this.hudEntity,
        persistent: true,
      });
      mesh.position.copy(home);
      entity.addComponent(PrismButton, { action });
      this.buttonEntities[action] = entity;
    }
    this.applyButtonTargets();

    const actionOf = (entity: Entity) =>
      (entity.getValue(PrismButton, 'action') ?? '') as HudAction;
    this.cleanupFuncs.push(
      // Unlock audio on press (a user gesture), but act on release, like a
      // normal click. Acting on press would hide or swap the very button
      // still being held, which leaves the pointer stuck on it.
      this.queries.pressed.subscribe('qualify', () => prismAudio.ensure()),
      this.queries.pressed.subscribe('disqualify', (entity) => {
        this.onButton(actionOf(entity));
      }),
      this.queries.hovered.subscribe('qualify', (entity) => {
        this.hoverCount++;
        this.hud.setHovered(actionOf(entity), true);
      }),
      this.queries.hovered.subscribe('disqualify', (entity) => {
        this.hoverCount = Math.max(0, this.hoverCount - 1);
        this.hud.setHovered(actionOf(entity), false);
      }),
    );
    this.placeHud();
  }

  private onButton(action: HudAction): void {
    if (import.meta.env.DEV) console.info(`[PalmPrism] button ${action}`);
    switch (action) {
      case 'restart':
        this.restart();
        break;
      case 'daily':
        this.loadDaily();
        break;
      case 'harp':
        this.loadHarp();
        break;
      case 'options':
        this.setHudGroup('options');
        break;
      case 'levels':
        this.setHudGroup('levels');
        break;
      case 'lvl-back':
        this.setHudGroup('main');
        break;
      case 'lvl-1':
      case 'lvl-2':
      case 'lvl-3':
      case 'lvl-4':
      case 'lvl-5':
      case 'lvl-6':
      case 'lvl-7':
      case 'lvl-8':
        // Every level is open, so judges and players can jump anywhere.
        this.hudGroup = 'main';
        this.loadLevel(Number(action.slice(4)) - 1);
        break;
      case 'opt-done':
        this.setHudGroup('main');
        break;
      case 'opt-hold':
        this.settings.holdToFreeze = !this.settings.holdToFreeze;
        this.saveSettingsAndRefresh();
        break;
      case 'opt-onehand':
        this.settings.oneHand = !this.settings.oneHand;
        this.saveSettingsAndRefresh();
        break;
      case 'opt-raise':
      case 'opt-lower': {
        const step = action === 'opt-raise' ? 0.04 : -0.04;
        this.settings.boardOffset = Math.max(
          -0.2,
          Math.min(0.2, this.settings.boardOffset + step),
        );
        this.saveSettingsAndRefresh();
        this.recenter();
        break;
      }
      case 'recenter':
        this.recenter();
        break;
      case 'next':
        if (this.isDaily || this.isHarp) this.loadLevel(this.progress.unlocked);
        else if (this.state === 'finale') this.loadDaily();
        else if (this.state === 'clear') this.advance();
        break;
    }
  }

  private setNextVisible(visible: boolean): void {
    this.nextVisible = visible;
    this.applyButtonTargets();
  }

  private setHudGroup(group: HudGroup): void {
    this.hudGroup = group;
    this.applyButtonTargets();
    this.redrawHud();
  }

  /** Show the active button row and make only visible buttons ray targets. */
  private applyButtonTargets(): void {
    this.hud.showGroup(this.hudGroup, this.nextVisible);
    for (const action of HUD_ACTIONS) {
      const entity = this.buttonEntities[action];
      if (!entity) continue;
      const visible = this.hud.buttons[action].mesh.visible;
      const has = entity.hasComponent(RayInteractable);
      if (visible && !has) entity.addComponent(RayInteractable);
      else if (!visible && has) entity.removeComponent(RayInteractable);
    }
  }

  private saveSettingsAndRefresh(): void {
    saveSettings(this.settings);
    this.hud.setButtonLabel(
      'opt-hold',
      `Hold to freeze: ${this.settings.holdToFreeze ? 'On' : 'Off'}`,
    );
    this.hud.setButtonLabel('opt-onehand', `One hand: ${this.settings.oneHand ? 'On' : 'Off'}`);
    this.redrawHud();
  }

  /** Freezes available this level, including the one-hand bonus. */
  private freezeAllowance(): number {
    if (this.isHarp) return this.level.freezes;
    return this.level.freezes + (this.settings.oneHand ? 1 : 0);
  }

  private placeHud(): void {
    const root = this.hud.root;
    if (!this.immersive) {
      root.position.set(0, HIDDEN_Y, 0);
      root.visible = false;
      return;
    }
    root.visible = true;
    this.board.updateWorldMatrix(true, false);
    this.vA.copy(HUD_LOCAL);
    this.board.localToWorld(this.vA);
    root.position.copy(this.vA);
    this.euler.set(HUD_TILT, this.board.rotation.y + HUD_YAW, 0, 'YXZ');
    this.quat.setFromEuler(this.euler);
    root.quaternion.copy(this.quat);
  }

  private hudState(): HudState {
    const level = this.level;
    const solved = this.state === 'clear' || this.state === 'finale';
    if (this.hudGroup === 'levels') {
      return {
        label: 'Every level is open',
        title: 'Levels',
        tip: '',
        stars: 0,
        freezesTotal: 0,
        freezesLeft: 0,
        streak: 0,
        solved: false,
        hideStars: true,
        hideMeta: true,
        levelList: LEVELS.map((l, i) => ({
          numeral: ROMAN[i],
          title: l.title,
          stars: this.progress.stars[l.id] ?? 0,
          current: !this.isDaily && !this.isHarp && i === this.levelIndex,
        })),
      };
    }
    if (this.hudGroup === 'options') {
      return {
        label: 'Comfort and access',
        title: 'Options',
        tip:
          'Hold to freeze: keep a palm still for two seconds instead of pinching. ' +
          'One hand: every level gets an extra freeze. Raise or lower moves the board.',
        stars: 0,
        freezesTotal: 0,
        freezesLeft: 0,
        streak: 0,
        solved: false,
        hideStars: true,
        hideMeta: true,
      };
    }
    return {
      label: this.isHarp
        ? 'Free play'
        : this.isDaily
          ? `Daily Prism · ${prettyDate(todayKey())}`
          : `Level ${this.levelIndex + 1} of ${LEVELS.length}`,
      title: level.title,
      tip: this.tipOverride ?? (solved ? this.solvedLine() : level.tip),
      stars: solved ? this.lastStars : (this.progress.stars[level.id] ?? 0),
      freezesTotal: this.freezeAllowance(),
      freezesLeft: this.freezeAllowance() - this.freezesUsed,
      streak: currentStreak(this.progress),
      solved,
      hideStars: this.isHarp,
    };
  }

  private solvedLine(): string {
    if (this.isDaily) return 'Solved. A new puzzle waits tomorrow.';
    if (this.state === 'finale') return "Every level solved. Try today's Daily Prism.";
    return this.lastStars === 3 ? 'Perfect. On to the next.' : 'Solved. Fewer freezes earn more stars.';
  }

  private redrawHud(): void {
    this.hud.draw(this.hudState());
  }

  private flashTip(text: string): void {
    this.tipOverride = text;
    this.tipTimer = 2.4;
    this.redrawHud();
  }

  // ------------------------------------------------------------- Levels

  private loadLevel(index: number): void {
    this.levelIndex = Math.max(0, Math.min(index, LEVELS.length - 1));
    this.isDaily = false;
    this.isHarp = false;
    this.startLevel(LEVELS[this.levelIndex]);
  }

  private loadHarp(): void {
    this.isDaily = false;
    this.isHarp = true;
    this.startLevel(HARP_LEVEL);
  }

  private loadDaily(): void {
    this.isDaily = true;
    this.isHarp = false;
    this.startLevel(createDailyLevel(todayKey()));
  }

  private restart(): void {
    if (this.isHarp) this.loadHarp();
    else if (this.isDaily) this.loadDaily();
    else this.loadLevel(this.levelIndex);
  }

  private startLevel(def: LevelDef): void {
    this.level = def;
    const level = def;
    if (import.meta.env.DEV) console.info(`[PalmPrism] start ${level.id}`);

    for (const child of [...this.levelGroup.children]) {
      this.levelGroup.remove(child);
      disposeTree(child);
    }

    this.crystals = level.crystals.map((c) => {
      const visual = createCrystal(c.kind, c.note);
      visual.group.position.set(c.pos[0], c.pos[1], c.pos[2]);
      visual.group.scale.setScalar(0.001);
      this.levelGroup.add(visual.group);
      return {
        def: c,
        target: {
          x: c.pos[0],
          y: c.pos[1],
          z: c.pos[2],
          radius: CRYSTAL_RADIUS + CRYSTAL_AIM_ASSIST,
        },
        visual,
        baseY: c.pos[1],
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
    const inDir: [number, number, number] = [
      this.emitterDir.x,
      this.emitterDir.y,
      this.emitterDir.z,
    ];

    if (level.hint) {
      const c = level.hint.center;
      const t = level.hint.toward;
      const n = mirrorNormalFor(inDir, [t[0] - c[0], t[1] - c[1], t[2] - c[2]]);
      placeMirror(this.hint, c[0], c[1], c[2], n[0], n[1], n[2]);
      this.ghostTo.copy(this.hint.group.quaternion);
      // Start flat, facing the lamp.
      this.vA.set(-inDir[0], -inDir[1], -inDir[2]);
      this.ghostFrom.setFromUnitVectors(this.vB.set(0, 0, 1), this.vA);
      const pos = this.ghostLine.geometry.getAttribute('position') as Float32BufferAttribute;
      pos.setXYZ(0, c[0], c[1], c[2]);
      pos.setXYZ(1, t[0], t[1], t[2]);
      pos.needsUpdate = true;
      this.ghostLine.computeLineDistances();
    }
    this.hint.group.visible = false;
    this.ghostLine.visible = false;

    // Browser attract mode: a glass pane on the first bounce of the known
    // solution, so the landing view shows light bending into a crystal.
    const path = level.solutions[0];
    const c0 = path[0];
    const c1 = path[1];
    const sn = mirrorNormalFor(inDir, [c1[0] - c0[0], c1[1] - c0[1], c1[2] - c0[2]]);
    Object.assign(this.showcase, {
      cx: c0[0],
      cy: c0[1],
      cz: c0[2],
      nx: sn[0],
      ny: sn[1],
      nz: sn[2],
    });
    placeMirror(this.showcaseVisual, c0[0], c0[1], c0[2], sn[0], sn[1], sn[2]);

    for (let i = 0; i < MAX_FROZEN; i++) {
      this.frozen[i].active = false;
      this.frozenVisuals[i].group.visible = false;
    }
    this.freezesUsed = 0;
    this.holdTime = 0;
    this.anyLit = false;
    this.tipOverride = null;
    this.tipTimer = 0;
    this.dwell.left.t = this.dwell.right.t = 0;
    this.setState('intro');
    if (this.isHarp) this.hud.setButtonLabel('next', 'Levels');
    this.setNextVisible(this.isHarp);
    this.titleCard.show(
      this.isHarp
        ? 'Free play'
        : this.isDaily
          ? `Daily Prism · ${prettyDate(todayKey())}`
          : `Level ${ROMAN[this.levelIndex]}`,
      level.title,
    );
    this.redrawHud();
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
    const par = level.par + (this.settings.oneHand ? 1 : 0);
    const stars =
      this.freezesUsed <= par ? 3 : this.freezesUsed <= par + 1 ? 2 : 1;
    this.lastStars = stars;
    this.progress = recordClear(
      this.progress,
      level.id,
      this.isDaily ? -1 : this.levelIndex,
      stars,
      LEVELS.length,
    );
    if (import.meta.env.DEV) console.info(`[PalmPrism] clear ${level.id} stars=${stars}`);
    this.sky.setEarned(totalStars(this.progress));
    prismAudio.celebrate(level.crystals.map((c) => c.note));

    // Every crystal flares, a ring of light rolls across the board.
    for (const c of this.crystals) {
      this.bursts.spawn(
        c.def.pos[0],
        c.def.pos[1],
        c.def.pos[2],
        c.def.kind === 'stay' ? COLORS.gold : COLORS.blue,
        0.22,
        0.9,
      );
    }
    this.bursts.spawn(0, 0.02, 0, COLORS.frozen, 0.9, 1.3);
    this.clearFlash = 1;

    const last = this.levelIndex === LEVELS.length - 1;
    this.setState(this.isDaily || last ? 'finale' : 'clear');
    this.hud.setButtonLabel(
      'next',
      this.isDaily ? 'Levels' : last ? 'Daily' : 'Next',
    );
    this.setNextVisible(true);
    this.titleCard.show(
      `${stars} of 3 stars`,
      this.isDaily ? 'Solved' : stars === 3 ? 'Perfect' : 'Solved',
      2.4,
    );
    this.redrawHud();
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
    const y = Math.max(0.4, this.vA.y - BOARD_DROP + this.settings.boardOffset);
    this.board.position.set(
      this.vA.x + this.vB.x * BOARD_DISTANCE,
      y,
      this.vA.z + this.vB.z * BOARD_DISTANCE,
    );
    this.board.rotation.set(0, Math.atan2(-this.vB.x, -this.vB.z), 0);
    this.boardParts.setStemHeight(y);
    this.placeHud();
  }

  /** Dev only: dump the beam path, mirrors and crystal hits to the console. */
  private logDebug(): void {
    const r = (v: number) => Math.round(v * 1000) / 1000;
    const points: number[][] = [];
    for (let i = 0; i < this.trace.pointCount; i++) {
      points.push([
        r(this.trace.points[i * 3]),
        r(this.trace.points[i * 3 + 1]),
        r(this.trace.points[i * 3 + 2]),
        this.trace.mirrorAtPoint[i],
      ]);
    }
    const mirrors = this.mirrors
      .map((m, i) => ({ i, m }))
      .filter(({ m }) => m.active)
      .map(({ i, m }) => [i, r(m.cx), r(m.cy), r(m.cz), r(m.nx), r(m.ny), r(m.nz)]);
    console.info(
      `[PalmPrism] debug ${JSON.stringify({
        level: this.level.id,
        state: this.state,
        settings: this.settings,
        freezesUsed: this.freezesUsed,
        emitter: this.level.emitter,
        solution: this.level.solutions[0],
        points,
        mirrors,
        crystals: Array.from(this.trace.crystalHit.slice(0, this.crystals.length)),
      })}`,
    );
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

  private jointWorld(gripWorld: Matrix4, transforms: Float32Array, index: number, out: Vector3) {
    this.jointMat.fromArray(transforms, index * 16).premultiply(gripWorld);
    out.setFromMatrixPosition(this.jointMat);
  }

  /** Read one palm (or controller paddle) into world space, smoothed. */
  private readPalm(p: PalmState, delta: number): boolean {
    let ok = false;
    const hand = this.input.visualAdapters.hand[p.side];
    const transforms = hand.jointTransforms;
    if (this.input.isPrimary('hand', p.side) && hand.connected && transforms && hand.gripSpace) {
      if (p.jointSource !== hand.jointSpaces) this.resolveJoints(p, hand.jointSpaces);
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

  private updatePalm(p: PalmState, delta: number): void {
    p.valid = this.immersive && this.readPalm(p, delta);
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
    if (this.hoverCount > 0) {
      if (import.meta.env.DEV) console.info('[PalmPrism] freeze skipped: hud');
      return;
    }
    if (!this.inPlayVolume(p.mirror)) {
      if (import.meta.env.DEV) console.info('[PalmPrism] freeze skipped: volume');
      return;
    }
    const level = this.level;
    const allowance = this.freezeAllowance();
    if (allowance === 0) {
      this.flashTip('No freezes here. Just your palms.');
      prismAudio.deny();
      return;
    }
    if (this.freezesUsed >= allowance) {
      this.flashTip('No freezes left. Restart to try again.');
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
    this.bursts.spawn(f.cx, f.cy, f.cz, COLORS.frozen, 0.12, 0.5);
    this.redrawHud();
    prismAudio.freeze();
    if (import.meta.env.DEV) console.info(`[PalmPrism] freeze ${p.side}`);
  }

  // --------------------------------------------------------------- Frame

  update(delta: number, time: number): void {
    const dt = Math.min(delta, 0.1);

    if (this.recenterIn >= 0) {
      this.recenterIn -= dt;
      if (this.recenterIn < 0) this.recenter();
    }

    this.board.updateWorldMatrix(true, false);
    this.boardInv.copy(this.board.matrixWorld).invert();
    this.floorBox.maxY = -this.board.position.y;

    for (const side of SIDES) this.updatePalm(this.palms[side], dt);

    if (this.immersive) {
      for (const side of SIDES) {
        if (this.input.xr.getSelectState(side).start) {
          prismAudio.ensure();
          this.tryFreeze(this.palms[side]);
        }
      }
    }

    // Attract mode in the browser: show light bending into the first crystal.
    this.showcase.active = !this.immersive && this.state !== 'intro';
    this.showcaseVisual.group.visible = this.showcase.active;

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
    this.beam.update(this.trace.points, this.trace.pointCount, this.trace.mirrorAtPoint, time);
    this.dust.update(this.trace.points, this.trace.pointCount, time);

    for (let i = 0; i < 2; i++) {
      const p = i === 0 ? this.palms.left : this.palms.right;
      const hit = this.trace.mirrorHit[i] === 1;
      p.visual.fill.opacity = hit ? 0.3 : 0.14;
      p.visual.ring.opacity = hit ? 1 : 0.7;
      p.visual.ring.color.copy(COLORS.brass);
      this.updateDwell(p, dt);
    }

    this.stateTime += dt;
    this.updateCrystals(dt, time);
    this.updateHint(time);
    this.bursts.update(dt);
    this.titleCard.update(dt);
    if (this.clearFlash > 0) {
      this.clearFlash = Math.max(0, this.clearFlash - dt * 0.6);
      this.rune.color.copy(COLORS.rune).lerp(COLORS.beamGlow, this.clearFlash);
    }

    if (this.tipTimer > 0) {
      this.tipTimer -= dt;
      if (this.tipTimer <= 0) {
        this.tipOverride = null;
        this.redrawHud();
      }
    }

    if (this.state === 'intro' && this.stateTime >= INTRO_SECONDS) {
      this.setState('play');
    } else if (
      this.state === 'clear' &&
      !this.isDaily &&
      this.stateTime >= AUTO_ADVANCE_SECONDS
    ) {
      this.advance();
    }
  }

  private updateCrystals(dt: number, time: number): void {
    const playing = this.state === 'play' && this.immersive;
    let allStay = true;
    let allPulse = true;
    let hasPulse = false;
    const introT = Math.min(1, this.stateTime / INTRO_SECONDS);
    const appear = this.state === 'intro' ? 1 - Math.pow(1 - introT, 3) : 1;

    for (let i = 0; i < this.crystals.length; i++) {
      const c = this.crystals[i];
      const touched = this.trace.crystalHit[i] === 1;
      const hit = playing && touched;
      let target: number;
      if (c.def.kind === 'stay') {
        if (!c.lit) {
          if (hit) c.charge += dt;
          else c.charge = Math.max(0, c.charge - dt * 0.6);
          if (c.charge >= CHARGE_SECONDS) {
            c.lit = true;
            this.anyLit = true;
            prismAudio.bell(c.def.note);
            this.bursts.spawn(c.def.pos[0], c.def.pos[1], c.def.pos[2], COLORS.gold);
          }
        }
        if (!c.lit) allStay = false;
        target = c.lit ? 2.6 : 0.25 + (c.charge / CHARGE_SECONDS) * 1.8;
      } else {
        hasPulse = true;
        c.glow = hit ? 0.15 : c.glow - dt;
        const glowing = c.glow > 0;
        if (glowing && !c.glowing && time - c.lastPing > (this.isHarp ? 0.12 : 0.35)) {
          prismAudio.bell(c.def.note, 0.12);
          c.lastPing = time;
          this.bursts.spawn(c.def.pos[0], c.def.pos[1], c.def.pos[2], COLORS.blue, 0.1, 0.45);
        }
        if (glowing) this.anyLit = true;
        c.glowing = glowing;
        if (!glowing) allPulse = false;
        target = glowing ? 2.8 : 0.2;
      }
      // In the browser preview, crystals the beam touches simply glow.
      if (!this.immersive && touched) target = 2.2;
      c.intensity += (target - c.intensity) * Math.min(1, dt * 10);
      c.visual.material.emissiveIntensity = c.intensity;
      c.visual.halo.material.opacity = Math.min(1, 0.06 + c.intensity * 0.28);
      const charging = c.def.kind === 'stay' && !c.lit && c.charge > 0;
      const pulse = charging ? 1 + Math.sin(time * 18) * 0.06 : 1;
      c.visual.group.scale.setScalar(appear * pulse);
      c.visual.mesh.rotation.y += dt * (c.intensity > 1.5 ? 1.2 : 0.3);
      c.visual.group.position.y = c.baseY + Math.sin(time * 1.3 + i * 1.7) * 0.004;
    }

    if (!playing || this.isHarp) return;
    if (allStay && allPulse) {
      this.holdTime += dt;
      if (!hasPulse || this.holdTime >= HOLD_SECONDS) this.clearLevel();
    } else {
      this.holdTime = 0;
    }
  }

  /**
   * Onboarding ghost: a glass pane above the lamp tilts from flat to the right
   * angle on a loop, then a dashed line shows where the light will go. It
   * fades once a palm arrives or the first crystal lights. No words needed.
   */
  private updateHint(time: number): void {
    const hint = this.level.hint;
    let show = !!hint && !this.anyLit && this.state === 'play' && this.immersive;
    if (show && hint) {
      for (const side of SIDES) {
        const m = this.palms[side].mirror;
        if (
          m.active &&
          Math.hypot(m.cx - hint.center[0], m.cy - hint.center[1], m.cz - hint.center[2]) < 0.07
        ) {
          show = false;
        }
      }
    }
    this.hint.group.visible = show;
    this.ghostLine.visible = show;
    if (!show) return;
    const cycle = (time % 2.8) / 2.8;
    const tilt = Math.min(1, Math.max(0, (cycle - 0.15) / 0.4));
    const eased = tilt * tilt * (3 - 2 * tilt);
    this.hint.group.quaternion.slerpQuaternions(this.ghostFrom, this.ghostTo, eased);
    const glow = 0.5 + 0.5 * Math.sin(time * 3);
    this.hint.fill.opacity = 0.06 + 0.1 * glow;
    this.hint.ring.opacity = 0.3 + 0.5 * glow;
    this.ghostLineMat.opacity = cycle > 0.55 ? Math.min(1, (cycle - 0.55) / 0.15) * 0.8 : 0;
  }

  /** Hold-to-freeze: a palm held still over the board for two seconds freezes. */
  private updateDwell(p: PalmState, dt: number): void {
    const d = this.dwell[p.side];
    if (!this.settings.holdToFreeze || !p.valid || this.state !== 'play') {
      d.t = 0;
      return;
    }
    const m = p.mirror;
    const moved = Math.hypot(m.cx - d.x, m.cy - d.y, m.cz - d.z);
    const turned = m.nx * d.nx + m.ny * d.ny + m.nz * d.nz;
    if (moved > 0.012 || Math.abs(turned) < 0.996) {
      // Moving again: restart the timer from here, and re-arm once the
      // palm has clearly left its last frozen spot.
      if (moved > 0.04) d.armed = true;
      d.x = m.cx;
      d.y = m.cy;
      d.z = m.cz;
      d.nx = m.nx;
      d.ny = m.ny;
      d.nz = m.nz;
      d.t = 0;
      return;
    }
    if (!d.armed || !this.inPlayVolume(m) || this.freezesUsed >= this.freezeAllowance()) {
      return;
    }
    d.t += dt;
    // Warm the frame toward brass as the hold completes.
    const k = Math.min(1, d.t / HOLD_FREEZE_SECONDS);
    p.visual.ring.color.copy(COLORS.brass).lerp(COLORS.beamGlow, k);
    p.visual.fill.opacity = 0.14 + 0.25 * k;
    if (d.t >= HOLD_FREEZE_SECONDS) {
      d.t = 0;
      d.armed = false;
      this.tryFreeze(p);
    }
  }
}
