/**
 * Retro arcade sound, synthesised with the Web Audio API so the game ships no
 * audio files. Audio is never required for gameplay: every call is a no-op if
 * the context cannot start or the player has muted.
 */

const MUTE_KEY = 'fwf-draft-dash-muted';

type Wave = OscillatorType;

class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;

  /** Read the stored preference. Safe to call during render. */
  isMuted(): boolean {
    return this.muted;
  }

  loadPreference() {
    if (typeof window === 'undefined') return;
    this.muted = window.localStorage.getItem(MUTE_KEY) === '1';
    if (this.master) this.master.gain.value = this.muted ? 0 : 1;
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    }
    if (this.master) this.master.gain.value = muted ? 0 : 1;
  }

  /** Must be called from a user gesture the first time. */
  unlock() {
    this.ensure()?.resume();
  }

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    if (typeof window === 'undefined') return null;
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      this.master.connect(this.ctx.destination);
    } catch {
      return null;
    }
    return this.ctx;
  }

  /** One square/saw blip. `slide` bends the pitch over the note. */
  private tone(
    freq: number,
    duration: number,
    opts: { wave?: Wave; gain?: number; delay?: number; slide?: number } = {},
  ) {
    const ctx = this.ensure();
    if (!ctx || !this.master || this.muted) return;

    const start = ctx.currentTime + (opts.delay ?? 0);
    const osc = ctx.createOscillator();
    const env = ctx.createGain();

    osc.type = opts.wave ?? 'square';
    osc.frequency.setValueAtTime(freq, start);
    if (opts.slide) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(opts.slide, 1),
        start + duration,
      );
    }

    const peak = opts.gain ?? 0.18;
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(peak, start + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    osc.connect(env).connect(this.master);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  /** Filtered white noise, for impacts and the whistle's breath. */
  private noise(duration: number, opts: { gain?: number; delay?: number } = {}) {
    const ctx = this.ensure();
    if (!ctx || !this.master || this.muted) return;

    const start = ctx.currentTime + (opts.delay ?? 0);
    const frames = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i += 1) data[i] = Math.random() * 2 - 1;

    const src = ctx.createBufferSource();
    src.buffer = buffer;

    const env = ctx.createGain();
    env.gain.setValueAtTime(opts.gain ?? 0.3, start);
    env.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    src.connect(env).connect(this.master);
    src.start(start);
  }

  countdownTick() {
    this.tone(620, 0.12, { gain: 0.15 });
  }

  hike() {
    this.tone(880, 0.09, { gain: 0.2 });
    this.tone(1320, 0.16, { gain: 0.2, delay: 0.09 });
  }

  laneSwitch() {
    this.tone(1180, 0.05, { gain: 0.08, wave: 'triangle', slide: 1500 });
  }

  milestone() {
    [880, 1108, 1318].forEach((f, i) =>
      this.tone(f, 0.11, { gain: 0.16, delay: i * 0.07 }),
    );
  }

  collision() {
    this.noise(0.28, { gain: 0.4 });
    this.tone(160, 0.3, { gain: 0.28, wave: 'sawtooth', slide: 50 });
  }

  whistle() {
    this.tone(2450, 0.42, { gain: 0.12, wave: 'sine', delay: 0.32 });
    this.tone(2380, 0.42, { gain: 0.09, wave: 'sine', delay: 0.35 });
  }

  revealTick() {
    this.tone(1500, 0.02, { gain: 0.05, wave: 'square' });
  }

  revealLand() {
    [660, 880, 1320].forEach((f, i) =>
      this.tone(f, 0.22, { gain: 0.18, delay: i * 0.06 }),
    );
  }

  confirm() {
    this.tone(740, 0.1, { gain: 0.2 });
    this.tone(1108, 0.22, { gain: 0.2, delay: 0.1 });
  }
}

export const sfx = new Sfx();
