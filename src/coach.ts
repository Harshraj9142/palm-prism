/**
 * Lesson coach: one short instruction at a time on a small glass panel beside
 * the board, and a pulsing marker of light at the spot to act on. Steps move
 * on by themselves as the player does each thing (see CoachStep in levels.ts).
 *
 * The panel is redrawn only when the step changes. Per frame it only moves
 * and fades the marker, so it allocates nothing in update().
 */
import {
  AdditiveBlending,
  CanvasTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  RingGeometry,
  SRGBColorSpace,
  type Sprite,
} from '@iwsdk/core';
import { SANS, SERIF } from './hud.js';
import type { CoachStep } from './levels.js';
import { createGlowSprite, COLORS } from './prism-visuals.js';

const W = 768;
const H = 236;
const METERS_W = 0.3;

/** Board-local place for the panel: right of the board, clear of the lessons' beams. */
export const COACH_PANEL_POS: [number, number, number] = [0.33, 0.4, -0.12];
export const COACH_PANEL_YAW = -0.5;

export class Coach {
  /** Add to the board. Holds the panel and the marker. */
  readonly group = new Group();
  private readonly panel: Mesh;
  private readonly panelMat: MeshBasicMaterial;
  private readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: CanvasTexture;
  private readonly marker = new Group();
  private readonly markerRing: Mesh;
  private readonly markerRingMat: MeshBasicMaterial;
  private readonly markerGlow: Sprite;
  private steps: CoachStep[] = [];
  private index = 0;
  private fade = 0;
  private t = 0;
  private active = false;

  constructor() {
    this.group.name = 'Coach';
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.anisotropy = 8;
    this.panelMat = new MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.panelMat.toneMapped = false;
    this.panel = new Mesh(new PlaneGeometry(METERS_W, (METERS_W * H) / W), this.panelMat);
    this.panel.position.set(...COACH_PANEL_POS);
    this.panel.rotation.y = COACH_PANEL_YAW;
    this.panel.renderOrder = 8;
    this.group.add(this.panel);

    // Marker: a flat ring of light that faces the player, plus a soft glow.
    this.markerRingMat = new MeshBasicMaterial({
      color: COLORS.beamGlow,
      transparent: true,
      opacity: 0,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    this.markerRingMat.toneMapped = false;
    this.markerRing = new Mesh(new RingGeometry(0.028, 0.032, 48), this.markerRingMat);
    this.marker.add(this.markerRing);
    this.markerGlow = createGlowSprite(COLORS.beamGlow, 0.06, 0);
    this.marker.add(this.markerGlow);
    this.marker.visible = false;
    this.group.add(this.marker);
    this.group.visible = false;
  }

  /** Start a lesson's steps (or hide the coach for a level without any). */
  start(steps: CoachStep[] | undefined): void {
    this.steps = steps ?? [];
    this.index = 0;
    this.fade = 0;
    this.active = this.steps.length > 0;
    this.group.visible = this.active;
    if (this.active) this.drawStep();
  }

  /** The step the player is on, or null when there is none. */
  get step(): CoachStep | null {
    return this.active ? (this.steps[this.index] ?? null) : null;
  }

  /** Move to the next step. Returns true if there was one. */
  advance(): boolean {
    if (!this.active || this.index + 1 >= this.steps.length) return false;
    this.index++;
    this.fade = 0;
    this.drawStep();
    return true;
  }

  stop(): void {
    this.active = false;
    this.group.visible = false;
  }

  /**
   * Fade in, bob the marker and keep it facing the viewer. `visible` lets the
   * game hide the coach outside play (intro, clear, browser preview).
   */
  update(dt: number, visible: boolean, cameraLocalX: number, cameraLocalZ: number): void {
    if (!this.active) return;
    this.group.visible = visible;
    if (!visible) return;
    this.t += dt;
    this.fade = Math.min(1, this.fade + dt * 2.5);
    this.panelMat.opacity = this.fade;
    const step = this.steps[this.index];
    const m = step?.marker;
    this.marker.visible = !!m;
    if (!m) return;
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 4);
    this.marker.position.set(m[0], m[1], m[2]);
    // Face the player around the vertical axis so the ring reads as a circle.
    this.markerRing.rotation.y = Math.atan2(cameraLocalX - m[0], cameraLocalZ - m[2]);
    this.markerRing.scale.setScalar(1 + pulse * 0.35);
    this.markerRingMat.opacity = this.fade * (0.35 + 0.45 * (1 - pulse));
    this.markerGlow.material.opacity = this.fade * (0.15 + 0.2 * pulse);
  }

  private drawStep(): void {
    const ctx = this.ctx;
    const step = this.steps[this.index];
    ctx.clearRect(0, 0, W, H);
    // Smoked glass with a brass-light edge, like the HUD.
    ctx.beginPath();
    const c = 18;
    ctx.moveTo(c, 4);
    ctx.lineTo(W - c, 4);
    ctx.lineTo(W - 4, c);
    ctx.lineTo(W - 4, H - c);
    ctx.lineTo(W - c, H - 4);
    ctx.lineTo(c, H - 4);
    ctx.lineTo(4, H - c);
    ctx.lineTo(4, c);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, 'rgba(27,33,41,0.93)');
    g.addColorStop(1, 'rgba(7,9,13,0.95)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.shadowColor = 'rgba(242,169,59,0.7)';
    ctx.shadowBlur = 12;
    ctx.strokeStyle = 'rgba(241,217,160,0.8)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Step counter: "STEP 1 OF 3" with lit pips.
    ctx.fillStyle = '#f2a93b';
    ctx.font = `700 20px ${SANS}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '4px';
    ctx.fillText(`STEP ${this.index + 1} OF ${this.steps.length}`, 34, 52);
    (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '0px';
    for (let i = 0; i < this.steps.length; i++) {
      ctx.beginPath();
      ctx.arc(W - 40 - (this.steps.length - 1 - i) * 24, 45, 6, 0, Math.PI * 2);
      ctx.fillStyle = i <= this.index ? '#f2a93b' : 'rgba(201,161,91,0.25)';
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    // Instruction, up to three lines.
    ctx.fillStyle = '#efe6d4';
    ctx.font = `600 34px ${SERIF}`;
    const words = (step?.text ?? '').split(' ');
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > W - 68 && line) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line) lines.push(line);
    lines.slice(0, 3).forEach((l, i) => ctx.fillText(l, 34, 104 + i * 44));
    this.texture.needsUpdate = true;
  }
}
