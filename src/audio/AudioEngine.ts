import type { FrequencyBands, SfxMode, TrackMetadata } from '../types/game';
import { loadSfxMode, saveSfxMode } from '../engine/recordsStore';
import {
  AudioLoadError,
  MAX_UPLOAD_BYTES,
  MIN_TRACK_SECONDS,
  matchAudioFormat,
  stripAudioExtension,
  type AudioFormat,
} from './audioFormats';
import { BUILT_IN_TRACKS, createFallbackBuffer } from './proceduralTracks';
import { SfxSynth } from './SfxSynth';

/**
 * Web Audio API Engine for ThorVG Run.
 * Pipeline: AudioBufferSourceNode -> AnalyserNode -> GainNode -> Destination
 */
export class AudioEngine {
  public readonly sfx: SfxSynth = new SfxSynth();

  private ctx: AudioContext | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;
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

  constructor() {
    this.sfx.setMode(loadSfxMode());
  }

  public setSfxMode(mode: SfxMode): void {
    this.sfx.setMode(mode);
    saveSfxMode(mode);
  }

  public getSfxMode(): SfxMode {
    return this.sfx.getMode();
  }

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.sfx.attachContext(this.ctx);

      this.analyserNode = this.ctx.createAnalyser();
      this.analyserNode.fftSize = 2048;
      this.analyserNode.smoothingTimeConstant = 0.72;

      this.gainNode = this.ctx.createGain();
      this.gainNode.gain.value = 0.85;

      this.analyserNode.connect(this.gainNode);
      this.gainNode.connect(this.ctx.destination);

      this.fftBytes = new Uint8Array(new ArrayBuffer(this.analyserNode.frequencyBinCount));
    }
    return this.ctx;
  }

  /**
   * Synchronously initializes/resumes the AudioContext inside a direct user gesture
   * so later async `startPlayback()` never stalls waiting on browser autoplay unlock.
   */
  public unlockFromGesture(): void {
    try {
      const ctx = this.ensureContext();
      if (ctx.state === 'suspended') {
        void ctx.resume().catch(() => undefined);
      }
    } catch {
      // Ignore if AudioContext creation is unavailable
    }
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
    } else if (track.assetUrl) {
      let decoded = this.decodedUploads.get(track.id);
      if (!decoded) {
        const res = await fetch(track.assetUrl);
        decoded = await ctx.decodeAudioData(await res.arrayBuffer());
        this.decodedUploads.set(track.id, decoded);
      }
      this.currentBuffer = decoded;
      this.currentTrack = {
        ...track,
        durationSec: Math.max(1, Math.round(decoded.duration)),
      };
    } else {
      this.currentBuffer = createFallbackBuffer(ctx, track.durationSec);
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
      this.currentBuffer = createFallbackBuffer(ctx, this.currentTrack.durationSec);
    }

    this.stopSourceOnly();

    const source = ctx.createBufferSource();
    source.buffer = this.currentBuffer;
    source.loop = false;
    source.connect(this.analyserNode!);

    this.startTimestamp = ctx.currentTime - this.pauseOffset;
    source.start(0, this.pauseOffset);
    this.sourceNode = source;
    this.isPlaying = true;

    source.onended = () => {
      if (this.sourceNode === source) {
        this.pauseOffset = this.getDurationSec();
        this.isPlaying = false;
      }
    };
  }

  public pause(): void {
    if (!this.ctx || !this.isPlaying) return;
    this.pauseOffset = Math.min(
      this.getDurationSec(),
      Math.max(0, this.ctx.currentTime - this.startTimestamp)
    );
    this.stopSourceOnly();
    this.isPlaying = false;
  }

  public async resume(): Promise<void> {
    if (this.isPlaying) return;
    const ctx = this.ensureContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    if (!this.currentBuffer) {
      this.currentBuffer = createFallbackBuffer(ctx, this.currentTrack.durationSec);
    }

    const dur = this.currentBuffer.duration;
    if (this.pauseOffset >= dur - 0.015) {
      this.pauseOffset = dur;
      this.isPlaying = false;
      return;
    }

    this.stopSourceOnly();

    const source = ctx.createBufferSource();
    source.buffer = this.currentBuffer;
    source.loop = false;
    source.connect(this.analyserNode!);

    const offset = Math.max(0, this.pauseOffset);
    this.startTimestamp = ctx.currentTime - offset;
    source.start(0, offset);
    this.sourceNode = source;
    this.isPlaying = true;

    source.onended = () => {
      if (this.sourceNode === source) {
        this.pauseOffset = this.getDurationSec();
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

  public getBuffer(): AudioBuffer | null {
    return this.currentBuffer;
  }
}

