/**
 * In-headset UI for Palm Prism, drawn by hand on canvases: a paper card with
 * serif type above the board, brass-rimmed buttons, and a floating title card
 * that introduces each level.
 *
 * Canvases are redrawn only when the shown state changes, never per frame.
 * Materials are unlit and skip tone mapping, so the paper and ink colours
 * reach the headset exactly as designed.
 */
import {
  CanvasTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from '@iwsdk/core';

export type HudAction = 'restart' | 'daily' | 'next' | 'recenter';

export interface HudState {
  label: string;
  title: string;
  tip: string;
  stars: number;
  freezesTotal: number;
  freezesLeft: number;
  streak: number;
  solved: boolean;
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
  icon: 'none' | 'target';
  normal: CanvasTexture;
  hover: CanvasTexture;
  hovered: boolean;
  enabled: boolean;
}

const BUTTON_LAYOUT: Record<HudAction, { x: number; w: number; label: string; icon: 'none' | 'target' }> = {
  restart: { x: 150, w: 220, label: 'Restart', icon: 'none' },
  daily: { x: 390, w: 200, label: 'Daily', icon: 'none' },
  next: { x: 630, w: 240, label: 'Next', icon: 'none' },
  recenter: { x: 890, w: 120, label: '', icon: 'target' },
};
const BUTTON_Y = 474;
const BUTTON_H = 78;

/** The paper HUD card plus its four buttons. */
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
        0.004,
      );
      this.buttons[action] = {
        mesh,
        material,
        label: spec.label,
        icon: spec.icon,
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
    icon: 'none' | 'target',
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
    } else {
      ctx.font = `600 32px ${SANS}`;
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
    for (let i = 0; i < 3; i++) {
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

    // Tip, up to two lines.
    ctx.fillStyle = INK_SOFT;
    ctx.font = `italic 31px ${SERIF}`;
    wrap(ctx, state.tip, right - left - (state.solved ? 170 : 0))
      .slice(0, 2)
      .forEach((line, i) => ctx.fillText(line, left, 218 + i * 40));

    // Hairline.
    ctx.strokeStyle = 'rgba(167,121,47,0.45)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(left, 312);
    ctx.lineTo(right, 312);
    ctx.stroke();

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
