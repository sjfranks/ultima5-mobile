/**
 * sound.ts
 *
 * The tactical board's sounds: quiet one-shots, made as they play, like
 * pieces and dice on a wooden board - select, pick, lift, clack, drop -
 * and the blows and spells besides.
 */

export type Sfx =
  | 'select'
  | 'pick'
  | 'lift'
  | 'clack'
  | 'drop'
  | 'step'
  | 'hit'
  | 'crit'
  | 'miss'
  | 'magic'
  | 'heal'
  | 'fire'
  | 'death'
  | 'bad'
  | 'win'
  | 'lose'
  | 'turn';

export class Sounds {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  on = true;
  volume = 0.5;

  /** Browsers open the audio only after a touch. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
  }

  private noise(dur: number): AudioBuffer {
    const c = this.ctx!;
    const b = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * dur)), c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  /** A knock of wood: a burst of noise through a band, and a short tone under it. */
  private knock(freq: number, vol: number, dur = 0.06, q = 6): void {
    const c = this.ctx!;
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this.noise(dur);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(bp).connect(g).connect(this.master!);
    src.start(t);
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(freq * 0.5, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.35, t + dur);
    const og = c.createGain();
    og.gain.setValueAtTime(vol * 0.5, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(og).connect(this.master!);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private tone(f0: number, f1: number, dur: number, vol: number, type: OscillatorType = 'sine', delay = 0): void {
    const c = this.ctx!;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private hiss(dur: number, vol: number, f0: number, f1: number): void {
    const c = this.ctx!;
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this.noise(dur);
    const lp = c.createBiquadFilter();
    lp.type = 'bandpass';
    lp.Q.value = 1.2;
    lp.frequency.setValueAtTime(f0, t);
    lp.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(lp).connect(g).connect(this.master!);
    src.start(t);
  }

  play(s: Sfx, vol = 1): void {
    if (!this.on || !this.ctx || !this.master) return;
    this.master.gain.value = this.volume;
    const v = Math.max(0.05, vol);
    switch (s) {
      case 'select':
        return this.knock(2400, 0.25 * v, 0.035, 10);
      case 'pick':
        return this.knock(1500, 0.22 * v, 0.04, 8);
      case 'lift':
        return this.hiss(0.12, 0.12 * v, 600, 2200);
      case 'clack':
        return this.knock(1900, 0.5 * v, 0.05, 7);
      case 'step':
        return this.knock(900, 0.16 * v, 0.045, 5);
      case 'drop':
        return this.knock(520, 0.45 * v, 0.09, 4);
      case 'hit':
        this.knock(320, 0.6 * v, 0.12, 2);
        return this.hiss(0.08, 0.2 * v, 3000, 800);
      case 'crit':
        this.knock(260, 0.8 * v, 0.16, 2);
        this.tone(1800, 1200, 0.35, 0.18 * v, 'square');
        return this.tone(2700, 2400, 0.4, 0.1 * v, 'sine', 0.03);
      case 'miss':
        return this.hiss(0.18, 0.18 * v, 1200, 4000);
      case 'magic':
        this.tone(500, 1600, 0.3, 0.12 * v, 'triangle');
        return this.tone(750, 2400, 0.3, 0.06 * v, 'sine', 0.05);
      case 'heal':
        this.tone(660, 990, 0.25, 0.12 * v);
        return this.tone(990, 1320, 0.3, 0.1 * v, 'sine', 0.12);
      case 'fire':
        return this.hiss(0.5, 0.35 * v, 400, 120);
      case 'death':
        return this.tone(300, 60, 0.5, 0.18 * v, 'sawtooth');
      case 'bad':
        return this.tone(220, 150, 0.2, 0.1 * v, 'square');
      case 'turn':
        return this.knock(1200, 0.15 * v, 0.05, 12);
      case 'win':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, f, 0.35, 0.12 * v, 'square', i * 0.14));
        return;
      case 'lose':
        [392, 330, 262, 196].forEach((f, i) => this.tone(f, f * 0.98, 0.45, 0.12 * v, 'triangle', i * 0.2));
        return;
    }
  }
}
