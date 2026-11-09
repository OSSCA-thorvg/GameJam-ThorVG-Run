import type { BannerKey } from '../i18n/messages';

export type RendererMode = 'sw' | 'gl';

export type ResonanceFormType = 'bass' | 'synth' | 'treble';

export type GamePhase = 'MACRO' | 'ZOOM_IN' | 'MICRO' | 'ZOOM_OUT';

export interface FrequencyBands {
  low: number;     // 20Hz ~ 250Hz normalized (0.0 ~ 1.0)
  mid: number;     // 250Hz ~ 4kHz normalized (0.0 ~ 1.0)
  high: number;    // 4kHz ~ 20kHz normalized (0.0 ~ 1.0)
  overall: number; // Combined normalized energy
  isBeat: boolean; // Beat impulse flag
}

export interface TrackMetadata {
  id: string;
  title: string;
  artist: string;
  bpm: number;
  durationSec: number;
  isCustom?: boolean;
  file?: File;
  assetUrl?: string;
}

export interface BezierSegment {
  x0: number;
  y0: number;
  cx1: number;
  cy1: number;
  cx2: number;
  cy2: number;
  x1: number;
  y1: number;
  energyBand: ResonanceFormType;
}

export interface BeatTrap {
  id: number;
  worldX: number;
  width: number;
  height: number;
  destroyed: boolean;
  passed: boolean;
}

export interface DivingNode {
  id: number;
  worldX: number;
  worldY: number;
  radius: number;
  targetForm: ResonanceFormType;
  activated: boolean;
}

export interface MicroGate {
  id: number;
  worldX: number;
  safePolarity: 1 | -1; // -1 = top lane, +1 = bottom lane
  passed: boolean;
  hit: boolean;
}

export interface VectorParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: [number, number, number];
  alpha: number;
  life: number;
  maxLife: number;
}

export interface ShockwaveEffect {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  color: [number, number, number];
  alpha: number;
}

export interface AfterimageTrail {
  x: number;
  y: number;
  rotation: number;
  form: ResonanceFormType;
  alpha: number;
}

export interface RenderFrameState {
  width: number;
  height: number;
  timeSec: number;
  phase: GamePhase;
  zoomScale: number;        // 1.0x -> 50.0x (with Origin Rebasing)
  rebasedZoomDisplay: number; // Effective HUD display scale (e.g. 1.0x ~ 64.0x)
  cameraX: number;
  focalScreenX: number;
  focalScreenY: number;
  activeForm: ResonanceFormType;
  divingTargetForm: ResonanceFormType;
  resonanceGauge: number;   // 0 ~ 100
  frequency: FrequencyBands;
  segments: BezierSegment[];
  traps: BeatTrap[];
  divingNodes: DivingNode[];
  microGates: MicroGate[];
  microPolarity: 1 | -1;
  playerScreenX: number;
  playerScreenY: number;
  playerRotation: number;
  playerRadius: number;
  isDashing: boolean;
  isGrinding: boolean;
  invulnerableTimer: number;
  /** Seconds of run-cycle animation; advances only while running on ground/rails, scaled by speed. */
  runCycleTime: number;
  shockwaves: ShockwaveEffect[];
  afterimages: AfterimageTrail[];
  particles: VectorParticle[];
}

export interface HUDTelemetry {
  rendererMode: RendererMode;
  fps: number;
  phase: GamePhase;
  zoomDisplay: number;
  score: number;
  combo: number;
  maxCombo: number;
  progress: number; // 0.0 ~ 1.0
  activeForm: ResonanceFormType;
  resonanceGauge: number; // 0 ~ 100
  acousticFilter: AcousticZoomMode;
  statusBanner: BannerMessage | null;
  isFinished: boolean;
  trapsDestroyed: number;
  divesCompleted: number;
}

/** Acoustic Zoom filter state. 'macro' = full spectrum, otherwise the isolated band. */
export type AcousticZoomMode = 'macro' | ResonanceFormType;

/**
 * Language-agnostic status banner emitted by the engine.
 * The UI layer resolves `key` and `params` into localized text.
 */
export interface BannerMessage {
  key: BannerKey;
  params?: {
    form?: ResonanceFormType;
    count?: number;
  };
}

/** Visual-only form config. User-facing names/descriptions live in `src/i18n/messages.ts`. */
export const FORM_CONFIG: Record<
  ResonanceFormType,
  {
    colorHex: string;
    rgb: [number, number, number];
    secondaryRgb: [number, number, number];
  }
> = {
  bass: {
    colorHex: '#FF2A6D',
    rgb: [255, 42, 109],
    secondaryRgb: [255, 130, 170],
  },
  synth: {
    colorHex: '#05D5FF',
    rgb: [5, 213, 255],
    secondaryRgb: [140, 245, 255],
  },
  treble: {
    colorHex: '#FFE600',
    rgb: [255, 230, 0],
    secondaryRgb: [255, 250, 160],
  },
};

