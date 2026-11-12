import type { JudgmentGrade, ResonanceFormType, SfxMode } from '../types/game';

/**
 * Zero-Asset Procedural Web Audio Synthesizer (`<2ms` latency, `0KB` bundle overhead).
 * Connects directly to `AudioContext.destination` through a dedicated bus so procedural
 * chimes/impacts NEVER pollute the song's `AnalyserNode` FFT spectrum!
 *
 * Modes:
 * - `'full'` (Option 1, Default): Subtle form-linked harmonic note chimes + all action/gimmick SFX
 * - `'impact'` (Option 2, Live-switchable): Skips ordinary note chimes for 100% pure song playback,
 *   keeping crisp action/gimmick SFX (JumpPad, SlamPad, DashRing, Drone/Trap shatter, Star, Overdrive, Miss)
 * - `'off'`: Silent
 */
export class SfxSynth {
  private ctx: AudioContext | null = null;
  private busGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private mode: SfxMode = 'full';
  private lastNoteTime: number = 0;

  public attachContext(ctx: AudioContext): void {
    if (this.ctx === ctx && this.busGain) return;
    this.ctx = ctx;
    this.busGain = ctx.createGain();
    this.busGain.gain.value = 0.78;
    this.busGain.connect(ctx.destination);

    // Pre-generate 0.18s crisp white-noise burst buffer once for percussive shatter/snare transients
    const length = Math.max(1, Math.floor(ctx.sampleRate * 0.18));
    const buf = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (length * 0.28));
    }
    this.noiseBuffer = buf;
  }

  public setMode(mode: SfxMode): void {
    this.mode = mode;
  }

  public getMode(): SfxMode {
    return this.mode;
  }

  private scheduleTone(
    freqStart: number,
    freqEnd: number,
    durationSec: number,
    gainPeak: number,
    type: OscillatorType = 'triangle',
    delaySec: number = 0
  ): void {
    if (!this.ctx || !this.busGain || this.ctx.state !== 'running') return;
    const t0 = this.ctx.currentTime + delaySec;
    const t1 = t0 + durationSec;

    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(24, freqStart), t0);
    if (freqEnd !== freqStart) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(24, freqEnd), t1);
    }

    env.gain.setValueAtTime(0.0001, t0);
    env.gain.linearRampToValueAtTime(gainPeak, t0 + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0001, t1);

    osc.connect(env);
    env.connect(this.busGain);
    osc.start(t0);
    osc.stop(t1 + 0.01);
  }

  private scheduleNoiseSnap(
    cutoffHz: number,
    filterType: BiquadFilterType,
    durationSec: number,
    gainPeak: number
  ): void {
    if (!this.ctx || !this.busGain || !this.noiseBuffer || this.ctx.state !== 'running') return;
    const t0 = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(cutoffHz, t0);
    filter.Q.setValueAtTime(1.4, t0);

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(gainPeak, t0);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + durationSec);

    src.connect(filter);
    filter.connect(env);
    env.connect(this.busGain);
    src.start(t0);
    src.stop(t0 + durationSec + 0.01);
  }

  /**
   * Subtle, non-intrusive form-linked harmonic note chime (active ONLY in `'full'` mode).
   * Uses gentle gain (~0.085) and short decay (<95ms) so the original song remains front and center.
   */
  public playNoteHit(
    form: ResonanceFormType,
    grade: JudgmentGrade,
    bandMatched: boolean
  ): void {
    if (this.mode !== 'full' || !this.ctx) return;
    if (grade === 'MISS') {
      this.playMiss();
      return;
    }

    // Prevent dense note clusters from stacking loud transients within <35ms
    const now = this.ctx.currentTime;
    if (now - this.lastNoteTime < 0.035) return;
    this.lastNoteTime = now;

    const boost = grade === 'PERFECT' ? 1.15 : grade === 'GREAT' ? 0.9 : 0.7;
    const matchShimmer = bandMatched ? 1.15 : 1.0;

    if (form === 'bass') {
      this.scheduleTone(130.8, 82.4, 0.085, 0.11 * boost, 'triangle');
      if (grade === 'PERFECT') {
        this.scheduleTone(261.6, 392.0, 0.075, 0.055 * matchShimmer, 'sine', 0.008);
      }
    } else if (form === 'synth') {
      this.scheduleTone(523.25, 659.25, 0.08, 0.075 * boost, 'sine');
      if (grade === 'PERFECT' || bandMatched) {
        this.scheduleTone(1046.5, 1318.5, 0.09, 0.05 * matchShimmer, 'triangle', 0.01);
      }
    } else {
      this.scheduleTone(880.0, 1174.6, 0.068, 0.068 * boost, 'triangle');
      this.scheduleNoiseSnap(6500, 'highpass', 0.035, 0.045 * boost);
    }
  }

  public playJump(isSecondJump: boolean): void {
    if (this.mode !== 'full') return;
    if (isSecondJump) {
      this.scheduleTone(310, 620, 0.065, 0.065, 'sine');
    } else {
      this.scheduleTone(195, 390, 0.06, 0.06, 'triangle');
    }
  }

  public playJumpPad(): void {
    if (this.mode === 'off') return;
    this.scheduleTone(240, 720, 0.14, 0.14, 'triangle');
    this.scheduleTone(480, 960, 0.12, 0.09, 'sine', 0.025);
  }

  public playSlamImpact(): void {
    if (this.mode === 'off') return;
    this.scheduleTone(155, 42, 0.18, 0.22, 'sawtooth');
    this.scheduleTone(330, 880, 0.15, 0.12, 'triangle', 0.02);
    this.scheduleNoiseSnap(1800, 'bandpass', 0.12, 0.16);
  }

  public playDashRing(): void {
    if (this.mode === 'off') return;
    this.scheduleTone(523.25, 783.99, 0.11, 0.12, 'triangle');
    this.scheduleTone(783.99, 1046.5, 0.13, 0.11, 'sine', 0.03);
    this.scheduleNoiseSnap(4200, 'highpass', 0.07, 0.08);
  }

  public playHazardShatter(): void {
    if (this.mode === 'off') return;
    this.scheduleNoiseSnap(2800, 'bandpass', 0.13, 0.18);
    this.scheduleTone(180, 62, 0.12, 0.16, 'triangle');
    this.scheduleTone(740, 1180, 0.09, 0.09, 'sine', 0.012);
  }

  public playBladeSlash(): void {
    if (this.mode === 'off') return;
    this.scheduleNoiseSnap(4600, 'highpass', 0.055, 0.14);
    this.scheduleTone(1480, 320, 0.075, 0.13, 'triangle');
    this.scheduleTone(2200, 680, 0.05, 0.07, 'sine', 0.008);
  }

  public playPrismStar(): void {
    if (this.mode === 'off') return;
    const notes = [587.33, 783.99, 1174.66, 1567.98];
    for (let i = 0; i < notes.length; i++) {
      this.scheduleTone(notes[i]!, notes[i]! * 1.02, 0.14, 0.1, 'sine', i * 0.032);
    }
  }

  public playOverdriveBurst(): void {
    if (this.mode === 'off') return;
    this.scheduleTone(110, 55, 0.22, 0.2, 'sawtooth');
    const chord = [440, 554.37, 659.25, 880, 1318.5];
    for (let i = 0; i < chord.length; i++) {
      this.scheduleTone(chord[i]!, chord[i]! * 1.01, 0.24, 0.09, 'triangle', i * 0.024);
    }
    this.scheduleNoiseSnap(3500, 'highpass', 0.15, 0.13);
  }

  public playMiss(): void {
    if (this.mode === 'off') return;
    this.scheduleTone(145, 52, 0.17, 0.18, 'sawtooth');
    this.scheduleNoiseSnap(650, 'lowpass', 0.12, 0.14);
  }
}
