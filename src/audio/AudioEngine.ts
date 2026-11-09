import type { AcousticZoomMode, FrequencyBands, TrackMetadata } from '../types/game';
import {
  AudioLoadError,
  MAX_UPLOAD_BYTES,
  MIN_TRACK_SECONDS,
  matchAudioFormat,
  stripAudioExtension,
  type AudioFormat,
} from './audioFormats';
import { BUILT_IN_TRACKS, synthesizeTrackBuffer } from './proceduralTracks';

/**
 * Web Audio API Engine for ThorVG Run.
 * Pipeline: AudioBufferSourceNode -> BiquadFilterNode (Acoustic Zoom) -> AnalyserNode -> GainNode -> Destination
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;
  private filterNode: BiquadFilterNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private gainNode: GainNode | null = null;
  private currentBuffer: AudioBuffer | null = null;
  private currentTrack: TrackMetadata = BUILT_IN_TRACKS[0]!;
  /** Decoded uploads keyed by track id, so starting a run does not decode the file twice. */
  private decodedUploads: Map<string, AudioBuffer> = new Map();

  private fftBytes: Uint8Array<ArrayBuffer> = new Uint8Array(new ArrayBuffer(1024));
  private isPlaying: boolean = false;
  private startTimestamp: number = 0;
  private pauseOffset: number = 0;
  private lastBeatTime: number = 0;
  private rollingLowAvg: number = 0.25;
  private currentZoomMode: AcousticZoomMode = 'macro';

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();

      this.filterNode = this.ctx.createBiquadFilter();
      this.filterNode.type = 'lowpass';
      this.filterNode.frequency.value = 20000;
      this.filterNode.Q.value = 0.707;

      this.analyserNode = this.ctx.createAnalyser();
      this.analyserNode.fftSize = 2048;
      this.analyserNode.smoothingTimeConstant = 0.72;

      this.gainNode = this.ctx.createGain();
      this.gainNode.gain.value = 0.85;

      this.filterNode.connect(this.analyserNode);
      this.analyserNode.connect(this.gainNode);
      this.gainNode.connect(this.ctx.destination);

      this.fftBytes = new Uint8Array(new ArrayBuffer(this.analyserNode.frequencyBinCount));
    }
    return this.ctx;
  }

  public async loadTrack(track: TrackMetadata): Promise<TrackMetadata> {
    const ctx = this.ensureContext();
    this.stop();

    if (track.isCustom && track.file) {
      let decoded = this.decodedUploads.get(track.id);
      if (!decoded) {
        decoded = await ctx.decodeAudioData(await track.file.arrayBuffer());
        this.decodedUploads.set(track.id, decoded);
      }
      this.currentBuffer = decoded;
      this.currentTrack = {
        ...track,
        durationSec: Math.max(1, Math.round(decoded.duration)),
      };
    } else {
      this.currentBuffer = synthesizeTrackBuffer(ctx, track);
      this.currentTrack = track;
    }

    this.pauseOffset = 0;
    return this.currentTrack;
  }

  /**
   * Validates and decodes a user-uploaded file without touching the current track.
   * Order: size -> format -> decode -> duration. Throws `AudioLoadError` on failure,
   * leaving `currentBuffer` / `currentTrack` unchanged.
   */
  public async decodeLocalFile(
    file: File,
    supportedFormats: readonly AudioFormat[]
  ): Promise<TrackMetadata> {
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new AudioLoadError('too_large');
    }
    if (!matchAudioFormat(file, supportedFormats)) {
      throw new AudioLoadError('unsupported');
    }

    const ctx = this.ensureContext();
    let decoded: AudioBuffer;
    try {
      decoded = await ctx.decodeAudioData(await file.arrayBuffer());
    } catch (err) {
      throw new AudioLoadError('decode_failed', err instanceof Error ? err.message : undefined);
    }

    if (!Number.isFinite(decoded.duration) || decoded.duration < MIN_TRACK_SECONDS) {
      throw new AudioLoadError('too_short');
    }

    const id = `custom-${Date.now()}`;
    this.decodedUploads.set(id, decoded);
    return {
      id,
      title: stripAudioExtension(file.name),
      artist: '',
      bpm: 128,
      durationSec: Math.max(1, Math.round(decoded.duration)),
      isCustom: true,
      file,
    };
  }

  public async startPlayback(): Promise<void> {
    const ctx = this.ensureContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    if (!this.currentBuffer) {
      this.currentBuffer = synthesizeTrackBuffer(ctx, this.currentTrack);
    }

    this.stopSourceOnly();

    const source = ctx.createBufferSource();
    source.buffer = this.currentBuffer;
    source.loop = false;
    source.connect(this.filterNode!);

    this.startTimestamp = ctx.currentTime - this.pauseOffset;
    source.start(0, this.pauseOffset);
    this.sourceNode = source;
    this.isPlaying = true;
    this.setAcousticZoom('macro');

    source.onended = () => {
      if (this.sourceNode === source) {
        this.isPlaying = false;
      }
    };
  }

  public stop(): void {
    this.stopSourceOnly();
    this.isPlaying = false;
    this.pauseOffset = 0;
  }

  private stopSourceOnly(): void {
    if (this.sourceNode) {
      try {
        this.sourceNode.onended = null;
        this.sourceNode.stop();
        this.sourceNode.disconnect();
      } catch {
        // Ignore if already stopped
      }
      this.sourceNode = null;
    }
  }

  /**
   * Controls Web Audio API BiquadFilterNode for Acoustic Zoom (Macro <-> Micro).
   * - macro: Full spectrum (lowpass 20kHz)
   * - bass: Low-pass filter (20Hz ~ 250Hz emphasis)
   * - synth: Band-pass filter (250Hz ~ 4kHz emphasis)
   * - treble: High-pass filter (4kHz ~ 20kHz emphasis)
   */
  public setAcousticZoom(mode: AcousticZoomMode): void {
    this.currentZoomMode = mode;
    if (!this.ctx || !this.filterNode) return;

    const now = this.ctx.currentTime;
    this.filterNode.frequency.cancelScheduledValues(now);
    this.filterNode.Q.cancelScheduledValues(now);

    if (mode === 'macro') {
      this.filterNode.type = 'lowpass';
      this.filterNode.frequency.setTargetAtTime(20000, now, 0.08);
      this.filterNode.Q.setTargetAtTime(0.707, now, 0.08);
    } else if (mode === 'bass') {
      this.filterNode.type = 'lowpass';
      this.filterNode.frequency.setTargetAtTime(240, now, 0.06);
      this.filterNode.Q.setTargetAtTime(3.2, now, 0.06);
    } else if (mode === 'synth') {
      this.filterNode.type = 'bandpass';
      this.filterNode.frequency.setTargetAtTime(1250, now, 0.06);
      this.filterNode.Q.setTargetAtTime(1.85, now, 0.06);
    } else if (mode === 'treble') {
      this.filterNode.type = 'highpass';
      this.filterNode.frequency.setTargetAtTime(4000, now, 0.06);
      this.filterNode.Q.setTargetAtTime(2.8, now, 0.06);
    }
  }

  /** Current Acoustic Zoom mode. The UI localizes it via `t.filter[mode]`. */
  public getAcousticZoomMode(): AcousticZoomMode {
    return this.currentZoomMode;
  }

  /**
   * Extracts real-time normalized energy (0.0 ~ 1.0) across Low, Mid, and High frequency bands.
   */
  public getFrequencyData(): FrequencyBands {
    if (!this.analyserNode || !this.ctx || !this.isPlaying) {
      return { low: 0.1, mid: 0.1, high: 0.1, overall: 0.1, isBeat: false };
    }

    this.analyserNode.getByteFrequencyData(this.fftBytes);

    const sampleRate = this.ctx.sampleRate;
    const fftSize = this.analyserNode.fftSize;
    const binHz = sampleRate / fftSize;

    const lowStart = Math.max(1, Math.floor(20 / binHz));
    const lowEnd = Math.max(lowStart + 1, Math.floor(250 / binHz));
    const midEnd = Math.max(lowEnd + 1, Math.floor(4000 / binHz));
    const highEnd = Math.min(this.fftBytes.length - 1, Math.floor(16000 / binHz));

    const avgRange = (start: number, end: number): number => {
      let sum = 0;
      const count = Math.max(1, end - start + 1);
      for (let i = start; i <= end && i < this.fftBytes.length; i++) {
        sum += this.fftBytes[i]!;
      }
      return Math.min(1.0, sum / (count * 255));
    };

    const low = avgRange(lowStart, lowEnd);
    const mid = avgRange(lowEnd + 1, midEnd);
    const high = avgRange(midEnd + 1, highEnd);
    const overall = Math.min(1.0, low * 0.45 + mid * 0.35 + high * 0.2);

    const nowMs = performance.now();
    this.rollingLowAvg = this.rollingLowAvg * 0.92 + low * 0.08;
    const isBeat =
      low > Math.max(0.32, this.rollingLowAvg * 1.24) && nowMs - this.lastBeatTime > 230;
    if (isBeat) {
      this.lastBeatTime = nowMs;
    }

    return { low, mid, high, overall, isBeat };
  }

  public getElapsedSec(): number {
    if (!this.ctx || !this.isPlaying) return this.pauseOffset;
    return Math.max(0, this.ctx.currentTime - this.startTimestamp);
  }

  public getDurationSec(): number {
    return this.currentBuffer?.duration ?? this.currentTrack.durationSec;
  }

  public getProgress(): number {
    const dur = this.getDurationSec();
    if (dur <= 0) return 0;
    return Math.min(1.0, this.getElapsedSec() / dur);
  }

  public get playing(): boolean {
    return this.isPlaying;
  }
}

