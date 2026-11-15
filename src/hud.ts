/**
 * In-headset UI for Palm Prism: a holographic instrument panel of smoked
 * glass and brass light, drawn by hand on canvases. Glowing brass linework,
 * a slowly turning dial of light behind the panel's corner, glass buttons
 * that fill with lamplight on hover, and a floating title that blooms in
 * over the board when a level starts.
 *
 * Canvases are redrawn only when the shown state changes, never per frame;
 * the turning dials are textured planes rotated in update(). Materials are
 * unlit and skip tone mapping, so the colours reach the headset as designed,
 * and every glow stays dimmer than the beam core.
 */
import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from '@iwsdk/core';
import { brassMaterial } from './realism.js';

export type HudAction =
  | 'restart'
  | 'daily'
  | 'harp'
  | 'next'
  | 'options'
  | 'recenter'
  | 'opt-hold'
  | 'opt-onehand'
  | 'opt-raise'
  | 'opt-lower'
  | 'opt-done'
  | 'levels'
  | 'lvl-1'
  | 'lvl-2'
  | 'lvl-3'
  | 'lvl-4'
  | 'lvl-5'
  | 'lvl-6'
  | 'lvl-7'
  | 'lvl-8'
  | 'lvl-page'
  | 'lvl-back';

export type HudGroup = 'main' | 'options' | 'levels';

export interface LevelEntry {
  numeral: string;
  title: string;
  stars: number;
  current: boolean;
}
type ButtonIcon = 'none' | 'target' | 'gear';

export interface HudState {
  label: string;
  title: string;
  tip: string;
  stars: number;
  freezesTotal: number;
  freezesLeft: number;
  streak: number;
  solved: boolean;
  /** Hide the stars (free play and the options page). */
  hideStars?: boolean;
  /** Hide the freezes and streak row (options page). */
  hideMeta?: boolean;
  /** Level picker: a two-column list of levels with their best stars. */
  levelList?: LevelEntry[];
  /** Small print above the buttons (options page credits). */
  footnote?: string;
}

// Night observatory palette.
const NIGHT = '#07090d';
const SLATE = '#1b2129';
const BRASS = '#c9a15b';
const BRASS_LIGHT = '#f1d9a0';
const LAMP = '#fff3d6';
const AMBER = '#f2a93b';
const TEAL = '#3fc7c0';
const INK = '#efe6d4';
const INK_SOFT = '#a99f8e';

export const SERIF = '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, "Noto Serif", serif';
export const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif';

function makeTexture(canvas: HTMLCanvasElement): CanvasTexture {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function uiMaterial(map: CanvasTexture): MeshBasicMaterial {
  const material = new MeshBasicMaterial({ map, transparent: true });
  material.toneMapped = false;
  return material;
}

function glowMaterial(map: CanvasTexture, opacity: number): MeshBasicMaterial {
  const material = new MeshBasicMaterial({
    map,
    transparent: true,
    opacity,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  material.toneMapped = false;
  return material;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** A panel outline with clipped (chamfered) corners, like cut glass. */
function chamferPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  c: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + c, y);
  ctx.lineTo(x + w - c, y);
  ctx.lineTo(x + w, y + c);
  ctx.lineTo(x + w, y + h - c);
  ctx.lineTo(x + w - c, y + h);
  ctx.lineTo(x + c, y + h);
  ctx.lineTo(x, y + h - c);
  ctx.lineTo(x, y + c);
  ctx.closePath();
}

function starPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function hexPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 6 + (i * Math.PI) / 3;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/** Split text into lines that fit `width`. */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > width && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function spaced(ctx: CanvasRenderingContext2D, px: number) {
  (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${px}px`;
}

function glow(ctx: CanvasRenderingContext2D, color: string, blur: number) {
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
}

function noGlow(ctx: CanvasRenderingContext2D) {
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';
}

let panelCache: HTMLCanvasElement | null = null;

/**
 * Smoked glass with a fine engraved grid, a brass-light border with brighter
 * corner brackets, and a scale of ticks along the top edge.
 */
function glassPanel(w: number, h: number): HTMLCanvasElement {
  if (panelCache && panelCache.width === w && panelCache.height === h) return panelCache;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const c = 26;

  chamferPath(ctx, 6, 6, w - 12, h - 12, c);
  ctx.save();
  ctx.clip();
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, 'rgba(27,33,41,0.94)');
  g.addColorStop(0.55, 'rgba(12,15,20,0.94)');
  g.addColorStop(1, 'rgba(7,9,13,0.96)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // Warm light falling across the glass from the top left.
  const sheen = ctx.createRadialGradient(w * 0.2, -h * 0.2, 0, w * 0.2, -h * 0.2, w * 0.8);
  sheen.addColorStop(0, 'rgba(241,217,160,0.10)');
  sheen.addColorStop(1, 'rgba(241,217,160,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, w, h);
  // Engraved hex grid, very faint.
  ctx.strokeStyle = 'rgba(201,161,91,0.05)';
  ctx.lineWidth = 1;
  const r = 22;
  for (let row = 0; row * r * 1.5 < h + r; row++) {
    for (let col = 0; col * r * 1.732 < w + r; col++) {
      hexPath(ctx, col * r * 1.732 + (row % 2) * r * 0.866, row * r * 1.5, r);
      ctx.stroke();
    }
  }
  // Fine horizontal scan lines.
  ctx.fillStyle = 'rgba(255,243,214,0.018)';
  for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 1);
  ctx.restore();

  // Border: thin brass light with a soft glow.
  glow(ctx, 'rgba(242,169,59,0.65)', 14);
  ctx.strokeStyle = 'rgba(201,161,91,0.75)';
  ctx.lineWidth = 2;
  chamferPath(ctx, 6, 6, w - 12, h - 12, c);
  ctx.stroke();
  // Brighter corner brackets.
  ctx.strokeStyle = BRASS_LIGHT;
  ctx.lineWidth = 3.5;
  const L = 64;
  const corners: [number, number, number, number][] = [
    [6, 6, 1, 1],
    [w - 6, 6, -1, 1],
    [6, h - 6, 1, -1],
    [w - 6, h - 6, -1, -1],
  ];
  for (const [x, y, sx, sy] of corners) {
    ctx.beginPath();
    ctx.moveTo(x + sx * (c + L), y);
    ctx.lineTo(x + sx * c, y);
    ctx.lineTo(x, y + sy * c);
    ctx.lineTo(x, y + sy * (c + L * 0.6));
    ctx.stroke();
  }
  noGlow(ctx);
  // A measuring scale along the top edge.
  ctx.strokeStyle = 'rgba(241,217,160,0.35)';
  ctx.lineWidth = 1.2;
  for (let x = 140; x < w - 140; x += 12) {
    const long = (x - 140) % 96 === 0;
    ctx.beginPath();
    ctx.moveTo(x, 18);
    ctx.lineTo(x, long ? 30 : 24);
    ctx.stroke();
  }
  panelCache = canvas;
  return canvas;
}

/**
 * A dial of light: concentric rings, degree ticks and broken arcs. Drawn once
 * and turned slowly behind the panel's corner and the title card.
 */
function drawDial(size: number, seed: number): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const c = size / 2;
  let s = seed;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  glow(ctx, 'rgba(242,169,59,0.9)', size * 0.012);
  const ring = (r: number, width: number, alpha: number) => {
    ctx.strokeStyle = `rgba(241,217,160,${alpha})`;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.stroke();
  };
  ring(c * 0.94, size * 0.004, 0.8);
  ring(c * 0.9, size * 0.002, 0.45);
  ring(c * 0.62, size * 0.002, 0.4);
  // Degree ticks.
  for (let i = 0; i < 120; i++) {
    const a = (i / 120) * Math.PI * 2;
    const long = i % 10 === 0;
    const r1 = c * 0.9;
    const r0 = r1 - (long ? c * 0.08 : c * 0.035);
    ctx.strokeStyle = `rgba(241,217,160,${long ? 0.8 : 0.4})`;
    ctx.lineWidth = long ? size * 0.004 : size * 0.002;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0);
    ctx.lineTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1);
    ctx.stroke();
  }
  // Broken arcs between the rings.
  for (let k = 0; k < 3; k++) {
    const r = c * (0.7 + k * 0.06);
    let a = rand() * Math.PI * 2;
    for (let n = 0; n < 4; n++) {
      const len = 0.3 + rand() * 0.8;
      ctx.strokeStyle = k === 1 ? 'rgba(63,199,192,0.55)' : 'rgba(242,169,59,0.6)';
      ctx.lineWidth = size * (k === 1 ? 0.006 : 0.003);
      ctx.beginPath();
      ctx.arc(c, c, r, a, a + len);
      ctx.stroke();
      a += len + 0.2 + rand() * 0.6;
    }
  }
  // Small hexes around the inner ring, like settings on an instrument.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.26;
    hexPath(ctx, c + Math.cos(a) * c * 0.5, c + Math.sin(a) * c * 0.5, c * 0.035);
    ctx.strokeStyle = 'rgba(241,217,160,0.6)';
    ctx.lineWidth = size * 0.003;
    ctx.stroke();
  }
  const texture = makeTexture(canvas);
  texture.anisotropy = 4;
  return texture;
}

/**
 * A flat dial of light lying around the board's rim, turned by the caller.
 * Additive and dim, so the beam stays the brightest thing in view.
 */
export function createBoardDial(diameter: number): Mesh {
  const mesh = new Mesh(new PlaneGeometry(diameter, diameter), glowMaterial(drawDial(1024, 47), 0.2));
  mesh.rotation.x = -Math.PI / 2;
  mesh.name = 'BoardDial';
  mesh.renderOrder = 1;
  return mesh;
}

const CARD_W = 1024;
const CARD_H = 560;
const CARD_METERS_W = 0.48;
const CARD_METERS_H = (CARD_METERS_W * CARD_H) / CARD_W;
const PX = CARD_METERS_W / CARD_W;

interface ButtonVisual {
  mesh: Mesh;
  material: MeshBasicMaterial;
  label: string;
  icon: ButtonIcon;
  group: HudGroup;
  normal: CanvasTexture;
  hover: CanvasTexture;
  hovered: boolean;
  enabled: boolean;
}

const BUTTON_LAYOUT: Record<
  HudAction,
  { x: number; w: number; label: string; icon: ButtonIcon; group: HudGroup }
> = {
  // Main row: 52..972 px.
  restart: { x: 137, w: 170, label: 'Restart', icon: 'none', group: 'main' },
  levels: { x: 310, w: 160, label: 'Levels', icon: 'none', group: 'main' },
  daily: { x: 468, w: 140, label: 'Daily', icon: 'none', group: 'main' },
  harp: { x: 616, w: 140, label: 'Harp', icon: 'none', group: 'main' },
  next: { x: 779, w: 170, label: 'Next', icon: 'none', group: 'main' },
  options: { x: 922, w: 100, label: '', icon: 'gear', group: 'main' },
  // Options row.
  'opt-hold': { x: 177, w: 250, label: 'Hold to freeze: Off', icon: 'none', group: 'options' },
  'opt-onehand': { x: 410, w: 200, label: 'One hand: Off', icon: 'none', group: 'options' },
  'opt-raise': { x: 568, w: 100, label: 'Raise', icon: 'none', group: 'options' },
  'opt-lower': { x: 676, w: 100, label: 'Lower', icon: 'none', group: 'options' },
  recenter: { x: 789, w: 110, label: 'Center', icon: 'none', group: 'options' },
  'opt-done': { x: 912, w: 120, label: 'Done', icon: 'none', group: 'options' },
  // Level picker row: eight slots for the current page, then page and back.
  'lvl-1': { x: 92, w: 80, label: 'I', icon: 'none', group: 'levels' },
  'lvl-2': { x: 180, w: 80, label: 'II', icon: 'none', group: 'levels' },
  'lvl-3': { x: 268, w: 80, label: 'III', icon: 'none', group: 'levels' },
  'lvl-4': { x: 356, w: 80, label: 'IV', icon: 'none', group: 'levels' },
  'lvl-5': { x: 444, w: 80, label: 'V', icon: 'none', group: 'levels' },
  'lvl-6': { x: 532, w: 80, label: 'VI', icon: 'none', group: 'levels' },
  'lvl-7': { x: 620, w: 80, label: 'VII', icon: 'none', group: 'levels' },
  'lvl-8': { x: 708, w: 80, label: 'VIII', icon: 'none', group: 'levels' },
  'lvl-page': { x: 820, w: 120, label: 'More', icon: 'none', group: 'levels' },
  'lvl-back': { x: 932, w: 90, label: 'Back', icon: 'none', group: 'levels' },
};
const BUTTON_Y = 474;
const BUTTON_Z = 0.004;
const BUTTON_H = 78;
/**
 * Margin around each button canvas for its glow. Zero keeps every button's
 * ray target exactly its old size, so neighbouring buttons never overlap.
 */
const BUTTON_PAD = 0;

/** The glass HUD panel plus its main, options and level-picker button rows. */
export class Hud {
  readonly root = new Group();
  readonly buttons = {} as Record<HudAction, ButtonVisual>;
  private readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: CanvasTexture;
  private readonly dialOuter: Mesh;
  private readonly dialInner: Mesh;
  private pulse = 0;

  constructor() {
    this.root.name = 'Hud';
    this.canvas.width = CARD_W;
    this.canvas.height = CARD_H;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = makeTexture(this.canvas);
    const card = new Mesh(
      new PlaneGeometry(CARD_METERS_W, CARD_METERS_H),
      uiMaterial(this.texture),
    );
    card.name = 'HudCard';
    card.renderOrder = 1;
    this.root.add(card);
    // A slim slate back plate with a brass edge gives the glass real
    // thickness and catches the room's light.
    const edge = brassMaterial('dark');
    const plate = new Mesh(
      new BoxGeometry(CARD_METERS_W + 0.006, CARD_METERS_H + 0.006, 0.005),
      [
        edge,
        edge,
        edge,
        edge,
        new MeshStandardMaterial({ color: SLATE, roughness: 0.8, metalness: 0 }),
        new MeshStandardMaterial({ color: NIGHT, roughness: 0.8, metalness: 0 }),
      ],
    );
    plate.position.z = -0.0035;
    plate.name = 'HudPlate';
    this.root.add(plate);

    // Two dials of light turning in opposite directions behind the top-right
    // corner, half hidden by the panel.
    this.dialOuter = new Mesh(new PlaneGeometry(0.3, 0.3), glowMaterial(drawDial(512, 3), 0.55));
    this.dialOuter.position.set(CARD_METERS_W / 2 - 0.02, CARD_METERS_H / 2 - 0.01, -0.008);
    this.dialOuter.name = 'HudDial';
    this.root.add(this.dialOuter);
    this.dialInner = new Mesh(new PlaneGeometry(0.17, 0.17), glowMaterial(drawDial(256, 11), 0.5));
    this.dialInner.position.copy(this.dialOuter.position);
    this.dialInner.position.z -= 0.001;
    this.root.add(this.dialInner);

    for (const action of Object.keys(BUTTON_LAYOUT) as HudAction[]) {
      const spec = BUTTON_LAYOUT[action];
      const normal = this.drawButton(spec.w, spec.label, spec.icon, false);
      const hover = this.drawButton(spec.w, spec.label, spec.icon, true);
      const material = uiMaterial(normal);
      const mesh = new Mesh(
        new PlaneGeometry((spec.w + BUTTON_PAD * 2) * PX, (BUTTON_H + BUTTON_PAD * 2) * PX),
        material,
      );
      mesh.name = `HudButton-${action}`;
      mesh.renderOrder = 2;
      mesh.position.set(
        (spec.x - CARD_W / 2) * PX,
        (CARD_H / 2 - BUTTON_Y) * PX,
        BUTTON_Z,
      );
      mesh.visible = spec.group === 'main';
      this.buttons[action] = {
        mesh,
        material,
        label: spec.label,
        icon: spec.icon,
        group: spec.group,
        normal,
        hover,
        hovered: false,
        enabled: true,
      };
    }
  }

  /** Turn the dials. Cheap: two rotations and one opacity per frame. */
  update(dt: number): void {
    this.dialOuter.rotation.z += dt * 0.09;
    this.dialInner.rotation.z -= dt * 0.21;
    this.pulse += dt;
    (this.dialOuter.material as MeshBasicMaterial).opacity =
      0.48 + Math.sin(this.pulse * 1.3) * 0.07;
  }

  private drawButton(
    w: number,
    label: string,
    icon: ButtonIcon,
    hovered: boolean,
  ): CanvasTexture {
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = (w + BUTTON_PAD * 2) * scale;
    canvas.height = (BUTTON_H + BUTTON_PAD * 2) * scale;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(scale, scale);
    ctx.translate(BUTTON_PAD, BUTTON_PAD);
    // Glass pill; on hover it fills with lamplight.
    roundRect(ctx, 4, 6, w - 8, BUTTON_H - 12, (BUTTON_H - 12) / 2);
    if (hovered) {
      const g = ctx.createLinearGradient(0, 0, 0, BUTTON_H);
      g.addColorStop(0, BRASS_LIGHT);
      g.addColorStop(1, AMBER);
      ctx.fillStyle = g;
      glow(ctx, 'rgba(242,169,59,0.9)', 16);
    } else {
      ctx.fillStyle = 'rgba(20,25,32,0.92)';
    }
    ctx.fill();
    noGlow(ctx);
    ctx.lineWidth = 2;
    ctx.strokeStyle = hovered ? LAMP : 'rgba(201,161,91,0.85)';
    if (!hovered) glow(ctx, 'rgba(242,169,59,0.6)', 8);
    ctx.stroke();
    noGlow(ctx);
    // Inner highlight line on the glass.
    if (!hovered) {
      ctx.strokeStyle = 'rgba(241,217,160,0.12)';
      ctx.lineWidth = 1;
      roundRect(ctx, 9, 10, w - 18, BUTTON_H - 20, (BUTTON_H - 20) / 2);
      ctx.stroke();
    }
    const ink = hovered ? NIGHT : BRASS_LIGHT;
    ctx.fillStyle = ink;
    ctx.strokeStyle = ink;
    if (!hovered) glow(ctx, 'rgba(242,169,59,0.55)', 6);
    const cx = w / 2;
    const cy = BUTTON_H / 2;
    if (icon === 'gear') {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * 12, cy + Math.sin(a) * 12);
        ctx.lineTo(cx + Math.cos(a) * 19, cy + Math.sin(a) * 19);
        ctx.lineWidth = 5;
        ctx.stroke();
      }
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(cx, cy, 13, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, 4.5, 0, Math.PI * 2);
      ctx.stroke();
    } else if (icon === 'target') {
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(cx, cy, 14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fill();
    } else {
      let size = 28;
      ctx.font = `600 ${size}px ${SANS}`;
      spaced(ctx, 1.5);
      while (size > 18 && ctx.measureText(label).width > w - 34) {
        size -= 1;
        ctx.font = `600 ${size}px ${SANS}`;
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, cx, cy + 1);
      spaced(ctx, 0);
    }
    noGlow(ctx);
    return makeTexture(canvas);
  }

  setButtonLabel(action: HudAction, label: string): void {
    const b = this.buttons[action];
    if (b.label === label) return;
    const spec = BUTTON_LAYOUT[action];
    b.label = label;
    b.normal.dispose();
    b.hover.dispose();
    b.normal = this.drawButton(spec.w, label, spec.icon, false);
    b.hover = this.drawButton(spec.w, label, spec.icon, true);
    b.material.map = b.hovered ? b.hover : b.normal;
    b.material.needsUpdate = true;
  }

  /**
   * Show one row of buttons. `hidden` drops individual buttons from the row
   * (empty level slots on the last page). The caller toggles ray targets.
   */
  showGroup(group: HudGroup, nextVisible: boolean, hidden?: ReadonlySet<HudAction>): void {
    for (const action of Object.keys(this.buttons) as HudAction[]) {
      const b = this.buttons[action];
      const shown =
        b.group === group && (action !== 'next' || nextVisible) && !hidden?.has(action);
      b.mesh.visible = shown;
      // Hidden buttons share space with the other row. Park them well behind
      // the card so a ray can never land on one instead of a visible button.
      b.mesh.position.z = shown ? BUTTON_Z : -0.5;
    }
  }

  setHovered(action: HudAction, hovered: boolean): void {
    const b = this.buttons[action];
    b.hovered = hovered;
    b.material.map = hovered ? b.hover : b.normal;
    b.material.needsUpdate = true;
  }

  draw(state: HudState): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, CARD_W, CARD_H);
    ctx.drawImage(glassPanel(CARD_W, CARD_H), 0, 0);
    const left = 60;
    const right = CARD_W - 60;

    // Label: letter-spaced caps in amber light, with a small lamp mark.
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    glow(ctx, 'rgba(242,169,59,0.8)', 10);
    ctx.fillStyle = AMBER;
    ctx.beginPath();
    ctx.arc(left + 6, 70, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `700 22px ${SANS}`;
    spaced(ctx, 5);
    ctx.fillText(state.label.toUpperCase(), left + 22, 78);
    spaced(ctx, 0);
    for (let i = 0; i < (state.hideStars ? 0 : 3); i++) {
      starPath(ctx, right - 18 - (2 - i) * 46, 68, 17);
      if (i < state.stars) {
        ctx.fillStyle = BRASS_LIGHT;
        ctx.fill();
      }
      ctx.lineWidth = 2;
      ctx.strokeStyle = BRASS;
      ctx.stroke();
    }
    noGlow(ctx);

    // Title in warm lamplight.
    glow(ctx, 'rgba(242,169,59,0.55)', 18);
    ctx.fillStyle = INK;
    ctx.font = `600 66px ${SERIF}`;
    ctx.fillText(state.title, left, 156);
    noGlow(ctx);
    // A glowing underline that fades to the right.
    const line = ctx.createLinearGradient(left, 0, right, 0);
    line.addColorStop(0, 'rgba(242,169,59,0.9)');
    line.addColorStop(0.5, 'rgba(242,169,59,0.25)');
    line.addColorStop(1, 'rgba(242,169,59,0)');
    ctx.fillStyle = line;
    ctx.fillRect(left, 176, right - left, 2);

    if (state.levelList) {
      this.drawLevelList(ctx, state.levelList, left, right);
      this.texture.needsUpdate = true;
      return;
    }

    // Tip.
    ctx.fillStyle = INK_SOFT;
    ctx.font = `italic 30px ${SERIF}`;
    wrap(ctx, state.tip, right - left - (state.solved ? 180 : 0))
      .slice(0, state.hideMeta ? (state.footnote ? 3 : 4) : 2)
      .forEach((text, i) => ctx.fillText(text, left, 226 + i * 40));

    if (state.footnote) {
      ctx.fillStyle = 'rgba(169,159,142,0.85)';
      ctx.font = `19px ${SANS}`;
      wrap(ctx, state.footnote, right - left)
        .slice(0, 2)
        .forEach((text, i) => ctx.fillText(text, left, 362 + i * 25));
    }

    if (state.hideMeta) {
      this.texture.needsUpdate = true;
      return;
    }

    // Freezes as glowing hex cells.
    ctx.font = `700 20px ${SANS}`;
    spaced(ctx, 4);
    ctx.fillStyle = BRASS;
    ctx.fillText(state.freezesTotal > 0 ? 'FREEZES' : 'PALMS ONLY', left, 372);
    spaced(ctx, 0);
    for (let i = 0; i < state.freezesTotal; i++) {
      hexPath(ctx, left + 168 + i * 40, 364, 14);
      if (i < state.freezesLeft) {
        glow(ctx, 'rgba(63,199,192,0.9)', 12);
        ctx.fillStyle = TEAL;
        ctx.fill();
        noGlow(ctx);
      }
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(63,199,192,0.8)';
      ctx.stroke();
    }

    // Streak.
    if (state.streak > 0) {
      ctx.textAlign = 'right';
      ctx.fillStyle = INK_SOFT;
      ctx.font = `italic 26px ${SERIF}`;
      ctx.fillText(`${state.streak}-day streak`, right, 372);
      ctx.textAlign = 'left';
    }

    if (state.solved) this.seal(ctx, right - 80, 250);
    this.texture.needsUpdate = true;
  }

  /** Two columns of levels: numeral, title and best stars; current one lit. */
  private drawLevelList(
    ctx: CanvasRenderingContext2D,
    list: LevelEntry[],
    left: number,
    right: number,
  ) {
    const colW = (right - left) / 2;
    list.forEach((entry, i) => {
      const col = Math.floor(i / 4);
      const row = i % 4;
      const x = left + col * colW;
      const y = 226 + row * 52;
      if (entry.current) {
        const g = ctx.createLinearGradient(x - 12, 0, x + colW - 28, 0);
        g.addColorStop(0, 'rgba(242,169,59,0.28)');
        g.addColorStop(1, 'rgba(242,169,59,0)');
        ctx.fillStyle = g;
        chamferPath(ctx, x - 12, y - 34, colW - 16, 46, 8);
        ctx.fill();
        ctx.fillStyle = AMBER;
        ctx.fillRect(x - 12, y - 34, 3, 46);
      }
      ctx.textAlign = 'left';
      glow(ctx, 'rgba(242,169,59,0.6)', 6);
      ctx.fillStyle = AMBER;
      ctx.font = `700 21px ${SANS}`;
      spaced(ctx, 2);
      ctx.fillText(entry.numeral, x, y);
      spaced(ctx, 0);
      noGlow(ctx);
      ctx.fillStyle = INK;
      ctx.font = `600 28px ${SERIF}`;
      ctx.fillText(entry.title, x + 56, y);
      for (let s = 0; s < 3; s++) {
        starPath(ctx, x + colW - 96 + s * 26, y - 10, 10);
        if (s < entry.stars) {
          ctx.fillStyle = BRASS_LIGHT;
          ctx.fill();
        }
        ctx.lineWidth = 1.8;
        ctx.strokeStyle = BRASS;
        ctx.stroke();
      }
    });
  }

  /** A glowing teal seal of light on a solved level. */
  private seal(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
    ctx.save();
    ctx.translate(cx, cy);
    glow(ctx, 'rgba(63,199,192,0.9)', 16);
    ctx.strokeStyle = TEAL;
    ctx.fillStyle = TEAL;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 66, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      const inner = i % 3 === 0 ? 48 : 52;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 56, Math.sin(a) * 56);
      ctx.lineTo(Math.cos(a) * inner, Math.sin(a) * inner);
      ctx.stroke();
    }
    ctx.font = `700 22px ${SANS}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    spaced(ctx, 4);
    ctx.fillText('SOLVED', 3, -2);
    spaced(ctx, 0);
    ctx.fillStyle = BRASS_LIGHT;
    for (let i = 0; i < 3; i++) {
      starPath(ctx, -20 + i * 20, 24, 6.5);
      ctx.fill();
    }
    ctx.restore();
    noGlow(ctx);
  }
}

/**
 * Floating title that blooms in above the board when a level starts or is
 * solved: a glowing kicker, a large serif title in lamplight, and a dial of
 * light turning behind it.
 */
export class TitleCard {
  readonly mesh: Mesh;
  private readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: CanvasTexture;
  private readonly material: MeshBasicMaterial;
  private readonly dial: Mesh;
  private readonly dialMaterial: MeshBasicMaterial;
  private t = 0;
  private duration = 0;

  constructor() {
    this.canvas.width = 1024;
    this.canvas.height = 300;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = makeTexture(this.canvas);
    this.material = uiMaterial(this.texture);
    this.material.depthWrite = false;
    // Always readable, even when a mirror or crystal sits in front of it.
    this.material.depthTest = false;
    this.material.opacity = 0;
    this.mesh = new Mesh(new PlaneGeometry(0.52, 0.152), this.material);
    this.mesh.name = 'TitleCard';
    this.mesh.visible = false;
    this.mesh.renderOrder = 10;
    this.dialMaterial = glowMaterial(drawDial(512, 29), 0);
    this.dialMaterial.depthTest = false;
    this.dial = new Mesh(new PlaneGeometry(0.3, 0.3), this.dialMaterial);
    this.dial.position.z = -0.002;
    this.dial.renderOrder = 9;
    this.mesh.add(this.dial);
  }

  show(kicker: string, title: string, duration = 2.6): void {
    const ctx = this.ctx;
    const w = this.canvas.width;
    ctx.clearRect(0, 0, w, this.canvas.height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    glow(ctx, 'rgba(242,169,59,0.9)', 16);
    ctx.fillStyle = AMBER;
    ctx.font = `700 32px ${SANS}`;
    spaced(ctx, 10);
    ctx.fillText(kicker.toUpperCase(), w / 2, 92);
    spaced(ctx, 0);
    glow(ctx, 'rgba(242,169,59,0.75)', 24);
    ctx.fillStyle = LAMP;
    ctx.font = `600 100px ${SERIF}`;
    ctx.fillText(title, w / 2, 206);
    // Light rule with a diamond at its centre.
    const g = ctx.createLinearGradient(w / 2 - 200, 0, w / 2 + 200, 0);
    g.addColorStop(0, 'rgba(242,169,59,0)');
    g.addColorStop(0.5, 'rgba(241,217,160,0.95)');
    g.addColorStop(1, 'rgba(242,169,59,0)');
    ctx.fillStyle = g;
    ctx.fillRect(w / 2 - 200, 244, 400, 2);
    ctx.fillStyle = BRASS_LIGHT;
    ctx.beginPath();
    ctx.moveTo(w / 2, 237);
    ctx.lineTo(w / 2 + 8, 245);
    ctx.lineTo(w / 2, 253);
    ctx.lineTo(w / 2 - 8, 245);
    ctx.closePath();
    ctx.fill();
    noGlow(ctx);
    this.texture.needsUpdate = true;
    this.t = 0;
    this.duration = duration;
    this.mesh.visible = true;
  }

  update(dt: number): void {
    if (!this.mesh.visible) return;
    this.t += dt;
    const fadeIn = Math.min(1, this.t / 0.35);
    const fadeOut = Math.min(1, Math.max(0, (this.duration - this.t) / 0.6));
    const k = Math.min(fadeIn, fadeOut);
    this.material.opacity = k;
    this.dialMaterial.opacity = k * 0.4;
    this.dial.rotation.z += dt * 0.5;
    this.dial.scale.setScalar(0.85 + fadeIn * 0.15);
    this.mesh.position.y = this.baseY + (1 - fadeIn) * -0.02;
    if (this.t >= this.duration) this.mesh.visible = false;
  }

  baseY = 0;
}
