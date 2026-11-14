/**
 * Tiny Web Audio synth: every sound is generated, so there are no audio files
 * to license. Crystals ring notes from a pentatonic scale, so a cleared level
 * always sounds like a small melody.
 */

const SCALE = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51];

export class PrismAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private droneGain: GainNode | null = null;

  /** Create or resume the context. Call from a user gesture or XR entry. */
  ensure(): void {
    try {
      if (!this.ctx) {
        const Ctor =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.7;
        this.master.connect(this.ctx.destination);
        this.startDrone();
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      // Audio is optional; the game works silently.
    }
  }

  setDrone(on: boolean): void {
    if (!this.ctx || !this.droneGain) return;
    const t = this.ctx.currentTime;
    this.droneGain.gain.cancelScheduledValues(t);
    this.droneGain.gain.setTargetAtTime(on ? 0.05 : 0, t, 0.8);
  }

  private startDrone(): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    filter.connect(this.droneGain);
    this.droneGain.connect(this.master);
    for (const [freq, detune] of [
      [110, -4],
      [164.81, 3],
      [220, 6],
    ]) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.detune.value = detune;
      const g = ctx.createGain();
      g.gain.value = freq === 220 ? 0.25 : 0.5;
      osc.connect(g).connect(filter);
      osc.start();
    }
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 160;
    lfo.connect(lfoGain).connect(filter.frequency);
    lfo.start();
  }

  /** Soft bell for crystal `note`. */
  bell(note: number, gain = 0.22, delay = 0, octave = 1): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const freq = SCALE[((note % SCALE.length) + SCALE.length) % SCALE.length] * octave;
    const t = ctx.currentTime + delay;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
    env.connect(this.master);
    for (const [mult, level] of [
      [1, 1],
      [2.01, 0.35],
      [3.98, 0.12],
    ]) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq * mult;
      const g = ctx.createGain();
      g.gain.value = level;
      osc.connect(g).connect(env);
      osc.start(t);
      osc.stop(t + 1.9);
    }
  }

  /** Arpeggio then chord when a level is cleared. */
  celebrate(notes: number[]): void {
    const sorted = [...notes].sort((a, b) => a - b);
    sorted.forEach((n, i) => this.bell(n, 0.18, i * 0.11));
    const end = sorted.length * 0.11 + 0.05;
    sorted.forEach((n) => this.bell(n, 0.1, end, 2));
  }

  /** Glassy click when a mirror freezes. */
  freeze(): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(2400, t);
    osc.frequency.exponentialRampToValueAtTime(1500, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.15, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.4);
  }

  /** Low blip when an action is not allowed, such as freezing with none left. */
  deny(): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(140, t + 0.18);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.14, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.3);
  }
}

/** Shared instance so UI click handlers can unlock audio from a user gesture. */
export const prismAudio = new PrismAudio();
