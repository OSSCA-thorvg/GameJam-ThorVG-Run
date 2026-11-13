import type { JudgmentGrade, SfxMode, SlashLane } from '../types/game';

/**
 * Zero-Asset `<0.5ms` Percussive Drum & Katana Web Audio Synthesizer (`0KB` bundle overhead).
 * - Connects directly to `AudioContext.destination` via a dedicated SFX bus so procedural
 *   impacts NEVER pollute the song's `AnalyserNode` FFT spectrum.
 * - Replaces tonal C-major chimes & hard 35ms mutes with `<0.5ms` (`0.4ms`) percussive 3-layer
 *   drum/katana transients + a `25ms` rolling polyphonic density scaler (`1 / sqrt(n)`).
 *
 * Modes:
 * - `'full'` (Default): 3-layer percussive kick/snare/katana hit SFX + air-swing + gimmick SFX
 * - `'impact'`: Skips ordinary lane hits & air-swings for pure song playback; plays chord cross,
 *   critical impacts, rush combo, shatter, overdrive, prism star, and miss SFX
 * - `'off'`: Mutes all procedural SFX
 */
export class SfxSynth {
  private ctx: AudioContext | null = null;
  private busGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private mode: SfxMode = 'full';
  private readonly recentHitTimes: number[] = [];

  public attachContext(ctx: AudioContext): void {
    if (this.ctx === ctx && this.busGain) return;
    this.ctx = ctx;
    this.busGain = ctx.createGain();
    this.busGain.gain.value = 0.82;
    this.busGain.connect(ctx.destination);

    // Pre-generate 0.16s ultra-crisp white-noise burst buffer once at startup
    const length = Math.max(1, Math.floor(ctx.sampleRate * 0.16));
    const buf = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (length * 0.24));
    }
    this.noiseBuffer = buf;
  }

  public setMode(mode: SfxMode): void {
    this.mode = mode;
  }

  public getMode(): SfxMode {
    return this.mode;
  }

  /**
   * 25ms rolling polyphonic density scaler (`1 / sqrt(n)`) — prevents clipping during rapid
   * katana streams or Beat Rush mashing without ever muting/dropping any hit transient.
   */
  private consumePolyphonicScale(now: number): number {
    while (this.recentHitTimes.length > 0 && now - this.recentHitTimes[0]! > 0.025) {
      this.recentHitTimes.shift();
    }
    if (this.recentHitTimes.length >= 12) {
      this.recentHitTimes.shift();
    }
    this.recentHitTimes.push(now);
    return 1 / Math.sqrt(Math.max(1, this.recentHitTimes.length));
  }

  private schedulePercussiveTone(
    freqStart: number,
    freqEnd: number,
    durationSec: number,
    gainPeak: number,
    type: OscillatorType = 'triangle',
    delaySec: number = 0,
    attackSec: number = 0.0004
  ): void {
    if (!this.ctx || !this.busGain || this.ctx.state !== 'running' || gainPeak <= 0.0002) return;
    const t0 = this.ctx.currentTime + delaySec;
    const tAtk = t0 + Math.max(0.0003, attackSec);
    const t1 = t0 + Math.max(0.008, durationSec);

    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(24, freqStart), t0);
    if (freqEnd !== freqStart) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(24, freqEnd), t1);
    }

    env.gain.setValueAtTime(0.0001, t0);
    env.gain.linearRampToValueAtTime(gainPeak, tAtk);
    env.gain.exponentialRampToValueAtTime(0.0001, t1);

    osc.connect(env);
    env.connect(this.busGain);
    osc.start(t0);
    osc.stop(t1 + 0.008);
  }

  private scheduleNoiseTransient(
    cutoffHz: number,
    filterType: BiquadFilterType,
    qFactor: number,
    durationSec: number,
    gainPeak: number,
    delaySec: number = 0
  ): void {
    if (
      !this.ctx ||
      !this.busGain ||
      !this.noiseBuffer ||
      this.ctx.state !== 'running' ||
      gainPeak <= 0.0002
    ) {
      return;
    }
    const t0 = this.ctx.currentTime + delaySec;
    const tAtk = t0 + 0.0004; // 0.4ms (< 0.5ms) instant percussive attack
    const t1 = t0 + Math.max(0.008, durationSec);

    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(cutoffHz, t0);
    filter.Q.setValueAtTime(qFactor, t0);

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.linearRampToValueAtTime(gainPeak, tAtk);
    env.gain.exponentialRampToValueAtTime(0.0001, t1);

    src.connect(filter);
    filter.connect(env);
    env.connect(this.busGain);
    src.start(t0);
    src.stop(t1 + 0.008);
  }

  /**
   * `<0.5ms` 3-Layer Atonal Percussive Drum + Katana Slash Hit SFX:
   * - `low`: Sub-punch kick body + low blade cut + transient click
   * - `high`: Crisp snare crack + high steel katana edge + transient click
   * - `chord`: Heavy dual X-cross iai impact + wide metallic draw + sub thump
   */
  public playSlashHit(
    lane: SlashLane | 'chord',
    grade: JudgmentGrade,
    isCritical: boolean = false
  ): void {
    if (this.mode === 'off' || !this.ctx || this.ctx.state !== 'running') return;
    if (grade === 'MISS') {
      this.playMiss();
      return;
    }
    if (this.mode === 'impact' && lane !== 'chord' && !isCritical) {
      return;
    }

    const polyScale = this.consumePolyphonicScale(this.ctx.currentTime);
    const gradeBoost = isCritical
      ? 1.18
      : grade === 'PERFECT'
        ? 1.05
        : grade === 'GREAT'
          ? 0.88
          : 0.72;
    const scale = polyScale * gradeBoost;

    // Layer 1: <0.5ms tactile transient click
    this.scheduleNoiseTransient(4200, 'highpass', 1.2, 0.015, 0.14 * scale);

    if (lane === 'low') {
      // Layer 2: Punchy kick transient (172Hz -> 44Hz)
      this.schedulePercussiveTone(172, 44, 0.068, 0.24 * scale, 'sine');
      // Layer 3: Heavy low-blade steel cut
      this.scheduleNoiseTransient(1480, 'bandpass', 1.8, 0.036, 0.15 * scale);
      this.schedulePercussiveTone(960, 220, 0.042, 0.095 * scale, 'triangle');
      if (isCritical) {
        this.schedulePercussiveTone(1880, 520, 0.048, 0.075 * scale, 'sine', 0.003);
      }
    } else if (lane === 'high') {
      // Layer 2: Crisp snare body + wire crack
      this.schedulePercussiveTone(245, 112, 0.046, 0.16 * scale, 'triangle');
      this.scheduleNoiseTransient(3300, 'highpass', 1.5, 0.048, 0.17 * scale);
      // Layer 3: High katana steel edge (rapid pitch-sweep = zero tonal key clash)
      this.schedulePercussiveTone(2650, 1140, 0.038, 0.095 * scale, 'triangle');
      if (isCritical || grade === 'PERFECT') {
        this.schedulePercussiveTone(4280, 2450, 0.046, 0.065 * scale, 'sine', 0.002);
      }
    } else {
      // 'chord': Dual X-Cross Iai Finisher
      this.schedulePercussiveTone(190, 40, 0.095, 0.26 * scale, 'sine');
      this.scheduleNoiseTransient(2600, 'bandpass', 1.4, 0.062, 0.18 * scale);
      this.scheduleNoiseTransient(5400, 'highpass', 1.8, 0.072, 0.15 * scale, 0.003);
      this.schedulePercussiveTone(3100, 780, 0.075, 0.13 * scale, 'sawtooth');
      this.schedulePercussiveTone(4400, 1680, 0.068, 0.085 * scale, 'triangle', 0.004);
    }
  }

  public playAirSwing(lane: SlashLane | 'chord'): void {
    if (this.mode !== 'full' || !this.ctx || this.ctx.state !== 'running') return;
    const polyScale = this.consumePolyphonicScale(this.ctx.currentTime);
    const cutoff = lane === 'high' ? 2900 : lane === 'low' ? 1450 : 2200;
    this.scheduleNoiseTransient(cutoff, 'bandpass', 1.6, 0.042, 0.068 * polyScale);
    this.schedulePercussiveTone(
      lane === 'high' ? 1250 : 780,
      lane === 'high' ? 420 : 240,
      0.038,
      0.045 * polyScale,
      'triangle'
    );
  }

  public playHoldTick(): void {
    if (this.mode !== 'full' || !this.ctx || this.ctx.state !== 'running') return;
    const polyScale = this.consumePolyphonicScale(this.ctx.currentTime);
    this.scheduleNoiseTransient(5200, 'highpass', 1.8, 0.016, 0.055 * polyScale);
    this.schedulePercussiveTone(1850, 920, 0.022, 0.04 * polyScale, 'sine');
  }

  public playRushHit(step: number): void {
    if (this.mode === 'off' || !this.ctx || this.ctx.state !== 'running') return;
    const polyScale = this.consumePolyphonicScale(this.ctx.currentTime);
    const clampedStep = Math.max(1, Math.min(12, step));
    const startHz = 1150 + clampedStep * 145;
    this.scheduleNoiseTransient(3800, 'highpass', 1.5, 0.028, 0.13 * polyScale);
    this.schedulePercussiveTone(startHz, 340, 0.044, 0.14 * polyScale, 'triangle');
    this.schedulePercussiveTone(165, 52, 0.042, 0.12 * polyScale, 'sine');
  }

  public playCleanDodge(): void {
    if (this.mode === 'off' || !this.ctx || this.ctx.state !== 'running') return;
    const polyScale = this.consumePolyphonicScale(this.ctx.currentTime);
    this.scheduleNoiseTransient(4800, 'highpass', 2.0, 0.032, 0.075 * polyScale);
    this.schedulePercussiveTone(1420, 2180, 0.045, 0.06 * polyScale, 'sine');
  }

  public playHazardShatter(): void {
    if (this.mode === 'off' || !this.ctx || this.ctx.state !== 'running') return;
    const polyScale = this.consumePolyphonicScale(this.ctx.currentTime);
    this.scheduleNoiseTransient(2800, 'bandpass', 1.3, 0.11, 0.19 * polyScale);
    this.schedulePercussiveTone(185, 46, 0.11, 0.2 * polyScale, 'triangle');
    this.schedulePercussiveTone(2400, 620, 0.075, 0.11 * polyScale, 'sawtooth', 0.004);
  }

  public playPrismStar(): void {
    if (this.mode === 'off' || !this.ctx || this.ctx.state !== 'running') return;
    const polyScale = this.consumePolyphonicScale(this.ctx.currentTime);
    this.scheduleNoiseTransient(6200, 'highpass', 1.8, 0.045, 0.11 * polyScale);
    this.schedulePercussiveTone(1760, 2640, 0.065, 0.085 * polyScale, 'sine');
    this.schedulePercussiveTone(2640, 3520, 0.075, 0.07 * polyScale, 'triangle', 0.022);
  }

  public playOverdriveBurst(): void {
    if (this.mode === 'off' || !this.ctx || this.ctx.state !== 'running') return;
    const polyScale = this.consumePolyphonicScale(this.ctx.currentTime);
    this.schedulePercussiveTone(135, 42, 0.18, 0.24 * polyScale, 'sawtooth');
    this.scheduleNoiseTransient(3600, 'highpass', 1.4, 0.13, 0.16 * polyScale);
    this.schedulePercussiveTone(1200, 2800, 0.12, 0.11 * polyScale, 'triangle', 0.008);
  }

  public playMiss(): void {
    if (this.mode === 'off' || !this.ctx || this.ctx.state !== 'running') return;
    this.schedulePercussiveTone(145, 50, 0.15, 0.17, 'sawtooth', 0, 0.001);
    this.scheduleNoiseTransient(640, 'lowpass', 1.2, 0.1, 0.13);
  }

  public playStageFail(): void {
    if (this.mode === 'off' || !this.ctx || this.ctx.state !== 'running') return;
    this.schedulePercussiveTone(320, 44, 0.4, 0.17, 'sawtooth', 0, 0.002);
    this.schedulePercussiveTone(210, 34, 0.44, 0.14, 'triangle', 0.025, 0.002);
    this.scheduleNoiseTransient(420, 'lowpass', 1.1, 0.22, 0.14);
  }
}
