/**
 * In-headset UI for Palm Prism, drawn by hand on canvases: a paper card with
 * serif type above the board, brass-rimmed buttons, and a floating title card
 * that introduces each level.
 *
 * Canvases are redrawn only when the shown state changes, never per frame.
 * Materials are unlit and skip tone mapping, so the paper and ink colours
 * reach the headset exactly as designed.
 */
import { brassMaterial } from './realism.js';
import {
  BoxGeometry,
  CanvasTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from '@iwsdk/core';

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
}

const INK = '#2a2219';
const INK_SOFT = '#5d5243';
const BRASS = '#a7792f';
const BRASS_LIGHT = '#c99d4f';
const PAPER = '#f3eadb';
const PAPER_EDGE = '#e4d6bf';
const OXBLOOD = '#8f3324';

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

let paperCache: HTMLCanvasElement | null = null;

/** Cream paper with a faint grain and a deckled shadow edge. */
function paper(w: number, h: number): HTMLCanvasElement {
  if (paperCache && paperCache.width === w && paperCache.height === h) return paperCache;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  roundRect(ctx, 0, 0, w, h, 18);
  ctx.save();
  ctx.clip();
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, PAPER);
  g.addColorStop(1, PAPER_EDGE);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  let s = 99;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 7000; i++) {
    ctx.fillStyle = `rgba(90,70,40,${rand() * 0.05})`;
    ctx.fillRect(rand() * w, rand() * h, 1.6, 1.6);
  }
  ctx.restore();
  ctx.strokeStyle = BRASS_LIGHT;
  ctx.lineWidth = 3;
  roundRect(ctx, 1.5, 1.5, w - 3, h - 3, 17);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(167,121,47,0.35)';
  ctx.lineWidth = 1.5;
  roundRect(ctx, 12, 12, w - 24, h - 24, 10);
  ctx.stroke();
  paperCache = canvas;
  return canvas;
}

const CARD_W = 1024;
const CARD_H = 560;
const CARD_METERS_W = 0.52;
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
  // Level picker row.
  'lvl-1': { x: 97, w: 90, label: 'I', icon: 'none', group: 'levels' },
  'lvl-2': { x: 197, w: 90, label: 'II', icon: 'none', group: 'levels' },
  'lvl-3': { x: 297, w: 90, label: 'III', icon: 'none', group: 'levels' },
  'lvl-4': { x: 397, w: 90, label: 'IV', icon: 'none', group: 'levels' },
  'lvl-5': { x: 497, w: 90, label: 'V', icon: 'none', group: 'levels' },
  'lvl-6': { x: 597, w: 90, label: 'VI', icon: 'none', group: 'levels' },
  'lvl-7': { x: 697, w: 90, label: 'VII', icon: 'none', group: 'levels' },
  'lvl-8': { x: 797, w: 90, label: 'VIII', icon: 'none', group: 'levels' },
  'lvl-back': { x: 912, w: 120, label: 'Back', icon: 'none', group: 'levels' },
};
const BUTTON_Y = 474;
const BUTTON_Z = 0.004;
const BUTTON_H = 78;

/** The paper HUD card plus its main and options button rows. */
export class Hud {
  readonly root = new Group();
  readonly buttons = {} as Record<HudAction, ButtonVisual>;
  private readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: CanvasTexture;

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
    this.root.add(card);
    // A brass backing plate gives the card real thickness and an edge that
    // catches the light.
    const plate = new Mesh(
      new BoxGeometry(CARD_METERS_W + 0.016, CARD_METERS_H + 0.016, 0.006),
      brassMaterial('bright'),
    );
    plate.position.z = -0.0035;
    plate.name = 'HudPlate';
    this.root.add(plate);

    for (const action of Object.keys(BUTTON_LAYOUT) as HudAction[]) {
      const spec = BUTTON_LAYOUT[action];
      const normal = this.drawButton(spec.w, spec.label, spec.icon, false);
      const hover = this.drawButton(spec.w, spec.label, spec.icon, true);
      const material = uiMaterial(normal);
      const mesh = new Mesh(new PlaneGeometry(spec.w * PX, BUTTON_H * PX), material);
      mesh.name = `HudButton-${action}`;
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

  private drawButton(
    w: number,
    label: string,
    icon: ButtonIcon,
    hovered: boolean,
  ): CanvasTexture {
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = w * scale;
    canvas.height = BUTTON_H * scale;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(scale, scale);
    roundRect(ctx, 3, 3, w - 6, BUTTON_H - 6, (BUTTON_H - 6) / 2);
    ctx.fillStyle = hovered ? BRASS_LIGHT : '#efe4d1';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = hovered ? '#7a5620' : BRASS;
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.strokeStyle = INK;
    if (icon === 'target') {
      const cx = w / 2;
      const cy = BUTTON_H / 2;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, 15, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fill();
      for (const [dx, dy] of [
        [0, -1],
        [0, 1],
        [-1, 0],
        [1, 0],
      ]) {
        ctx.beginPath();
        ctx.moveTo(cx + dx * 19, cy + dy * 19);
        ctx.lineTo(cx + dx * 26, cy + dy * 26);
        ctx.stroke();
      }
    } else if (icon === 'gear') {
      const cx = w / 2;
      const cy = BUTTON_H / 2;
      ctx.lineWidth = 3;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * 13, cy + Math.sin(a) * 13);
        ctx.lineTo(cx + Math.cos(a) * 21, cy + Math.sin(a) * 21);
        ctx.lineWidth = 6;
        ctx.stroke();
      }
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, 14, 0, Math.PI * 2);
      ctx.fillStyle = hovered ? BRASS_LIGHT : '#efe4d1';
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      let size = 32;
      ctx.font = `600 ${size}px ${SANS}`;
      while (size > 20 && ctx.measureText(label).width > w - 34) {
        size -= 1;
        ctx.font = `600 ${size}px ${SANS}`;
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, w / 2, BUTTON_H / 2 + 2);
    }
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

  /** Show one row of buttons. Returns nothing; the caller toggles ray targets. */
  showGroup(group: HudGroup, nextVisible: boolean): void {
    for (const action of Object.keys(this.buttons) as HudAction[]) {
      const b = this.buttons[action];
      const shown = b.group === group && (action !== 'next' || nextVisible);
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
    ctx.drawImage(paper(CARD_W, CARD_H), 0, 0);
    const left = 56;
    const right = CARD_W - 56;

    // Label in letter-spaced small caps, stars on the right.
    ctx.fillStyle = BRASS;
    ctx.font = `700 24px ${SANS}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    spaced(ctx, 4);
    ctx.fillText(state.label.toUpperCase(), left, 78);
    spaced(ctx, 0);
    for (let i = 0; i < (state.hideStars ? 0 : 3); i++) {
      starPath(ctx, right - 18 - (2 - i) * 46, 68, 18);
      if (i < state.stars) {
        ctx.fillStyle = BRASS_LIGHT;
        ctx.fill();
      }
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = BRASS;
      ctx.stroke();
    }

    // Title.
    ctx.fillStyle = INK;
    ctx.font = `600 70px ${SERIF}`;
    ctx.fillText(state.title, left, 160);

    if (state.levelList) {
      this.drawLevelList(ctx, state.levelList, left, right);
      this.texture.needsUpdate = true;
      return;
    }

    // Tip, up to two lines.
    ctx.fillStyle = INK_SOFT;
    ctx.font = `italic 31px ${SERIF}`;
    wrap(ctx, state.tip, right - left - (state.solved ? 170 : 0))
      .slice(0, state.hideMeta ? 4 : 2)
      .forEach((line, i) => ctx.fillText(line, left, 218 + i * 40));

    if (!state.hideMeta) {
      ctx.strokeStyle = 'rgba(167,121,47,0.45)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(left, 312);
      ctx.lineTo(right, 312);
      ctx.stroke();
    }

    if (state.hideMeta) {
      this.texture.needsUpdate = true;
      return;
    }

    // Freezes as hexagon tokens.
    ctx.font = `700 22px ${SANS}`;
    spaced(ctx, 3);
    ctx.fillStyle = BRASS;
    ctx.fillText(state.freezesTotal > 0 ? 'FREEZES' : 'PALMS ONLY', left, 366);
    spaced(ctx, 0);
    for (let i = 0; i < state.freezesTotal; i++) {
      hexPath(ctx, left + 160 + i * 40, 358, 14);
      if (i < state.freezesLeft) {
        ctx.fillStyle = BRASS_LIGHT;
        ctx.fill();
      }
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = BRASS;
      ctx.stroke();
    }

    // Streak.
    if (state.streak > 0) {
      ctx.textAlign = 'right';
      ctx.fillStyle = INK_SOFT;
      ctx.font = `italic 28px ${SERIF}`;
      ctx.fillText(
        `${state.streak}-day streak`,
        right,
        366,
      );
      ctx.textAlign = 'left';
    }

    if (state.solved) this.stamp(ctx, right - 76, 228);
    this.texture.needsUpdate = true;
  }

  /** Two columns of levels: numeral, title and best stars; current one marked. */
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
      const y = 214 + row * 52;
      if (entry.current) {
        ctx.fillStyle = 'rgba(201,157,79,0.22)';
        roundRect(ctx, x - 12, y - 34, colW - 16, 46, 8);
        ctx.fill();
      }
      ctx.textAlign = 'left';
      ctx.fillStyle = BRASS;
      ctx.font = `700 22px ${SANS}`;
      spaced(ctx, 2);
      ctx.fillText(entry.numeral, x, y);
      spaced(ctx, 0);
      ctx.fillStyle = INK;
      ctx.font = `600 30px ${SERIF}`;
      ctx.fillText(entry.title, x + 62, y);
      for (let s = 0; s < 3; s++) {
        starPath(ctx, x + colW - 96 + s * 26, y - 10, 10);
        if (s < entry.stars) {
          ctx.fillStyle = BRASS_LIGHT;
          ctx.fill();
        }
        ctx.lineWidth = 2;
        ctx.strokeStyle = BRASS;
        ctx.stroke();
      }
    });
  }

  /** A slightly crooked ink stamp, like a seal on a solved page. */
  private stamp(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-0.16);
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = OXBLOOD;
    ctx.fillStyle = OXBLOOD;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, 70, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, 61, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = `700 26px ${SANS}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    spaced(ctx, 3);
    ctx.fillText('SOLVED', 3, 0);
    spaced(ctx, 0);
    for (let i = 0; i < 3; i++) {
      starPath(ctx, -22 + i * 22, 32, 7);
      ctx.fill();
    }
    ctx.restore();
  }
}

/**
 * Floating title that fades in above the board when a level starts or is
 * solved: a small kicker line and a large serif title in warm light.
 */
export class TitleCard {
  readonly mesh: Mesh;
  private readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: CanvasTexture;
  private readonly material: MeshBasicMaterial;
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
  }

  show(kicker: string, title: string, duration = 2.6): void {
    const ctx = this.ctx;
    const w = this.canvas.width;
    ctx.clearRect(0, 0, w, this.canvas.height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#e7c27a';
    ctx.font = `700 34px ${SANS}`;
    spaced(ctx, 8);
    ctx.fillText(kicker.toUpperCase(), w / 2, 92);
    spaced(ctx, 0);
    ctx.fillStyle = '#fbf3e3';
    ctx.font = `600 104px ${SERIF}`;
    ctx.fillText(title, w / 2, 208);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(231,194,122,0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w / 2 - 90, 246);
    ctx.lineTo(w / 2 + 90, 246);
    ctx.stroke();
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
    this.material.opacity = Math.min(fadeIn, fadeOut);
    this.mesh.position.y = this.baseY + (1 - fadeIn) * -0.02;
    if (this.t >= this.duration) this.mesh.visible = false;
  }

  baseY = 0;
}
