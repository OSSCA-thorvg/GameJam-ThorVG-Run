import type { BannerKey, Messages } from '../i18n/messages';

export type RendererMode = 'sw' | 'gl';

export type ResonanceFormType = 'bass' | 'synth' | 'treble';

export type DifficultyMode = 'easy' | 'normal' | 'hard';

/**
 * Live-switchable Procedural Sound Effect Mode:
 * - 'full' (Option 1, Default): Form-linked harmonic note chimes + action/gimmick/impact SFX
 * - 'impact' (Option 2): Skips ordinary note chimes to preserve 100% pure song audio; plays gimmick/shatter/overdrive/miss SFX only
 * - 'off': Mutes all procedural SFX
 */
export type SfxMode = 'full' | 'impact' | 'off';

export type JudgmentGrade = 'PERFECT' | 'GREAT' | 'GOOD' | 'MISS';

export type ResultRank = 'S' | 'A' | 'B' | 'C';

export type GamePhase = 'MACRO' | 'ZOOM_IN' | 'MICRO' | 'ZOOM_OUT';

export type SectionIntensity = 'calm' | 'groove' | 'drop';

export type LoadingStageKey = keyof Messages['loading']['stages'];

export interface DifficultyProfile {
  mode: DifficultyMode;
  worldPxPerSec: number;
  density: number;
  perfectMs: number;
  greatMs: number;
  goodMs: number;
  colorHex: string;
  rgb: [number, number, number];
}

export const DIFFICULTY_CONFIG: Record<DifficultyMode, DifficultyProfile> = {
  easy: {
    mode: 'easy',
    worldPxPerSec: 450,
    density: 0.65,
    perfectMs: 75,
    greatMs: 135,
    goodMs: 185,
    colorHex: '#00F5A0',
    rgb: [0, 245, 160],
  },
  normal: {
    mode: 'normal',
    worldPxPerSec: 550,
    density: 1.0,
    perfectMs: 55,
    greatMs: 105,
    goodMs: 155,
    colorHex: '#05D5FF',
    rgb: [5, 213, 255],
  },
  hard: {
    mode: 'hard',
    worldPxPerSec: 660,
    density: 1.35,
    perfectMs: 40,
    greatMs: 80,
    goodMs: 125,
    colorHex: '#FF2A6D',
    rgb: [255, 42, 109],
  },
};

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

export interface TrackRecord {
  bestScore: number;
  bestRank: ResultRank;
  bestAccuracy: number;
  maxCombo: number;
  bestStars: number;
  noMissCleared: boolean;
  clearCount: number;
}

export interface AudioSlice {
  index: number;
  timeSec: number;
  worldX0: number;
  worldX1: number;
  low: number;
  mid: number;
  high: number;
  overall: number;
  dominantBand: ResonanceFormType;
  intensity: SectionIntensity;
  isBeatOnset: boolean;
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
  sliceIndex?: number;
  timeSec?: number;
  low?: number;
  mid?: number;
  high?: number;
  overall?: number;
  intensity?: SectionIntensity;
  isBeatOnset?: boolean;
  isCrest?: boolean;
  /** True when the ground track breaks open into an abyss chasm requiring a jump or dash. */
  isGap?: boolean;
  deckLevel?: 0 | 1 | 2;
}

export interface ResonanceOrb {
  id: number;
  worldX: number;
  worldY: number;
  radius: number;
  band: ResonanceFormType;
  isArcOrb: boolean;
  collected: boolean;
  screenY?: number;
  /** Exact beat timestamp (seconds) for shrinking timing ring & ms judgment. */
  timeSec?: number;
  /** True when this note is a primary on-beat target displaying a shrinking timing ring. */
  isBeatTarget?: boolean;
  /** True for the 3 high-risk/high-route collectible Harmonic Prism Stars per track. */
  isPrismStar?: boolean;
}

export interface SkyPlatform {
  id: number;
  x0: number;
  x1: number;
  worldY: number;
  screenY?: number;
  band: ResonanceFormType;
}

export interface JumpPad {
  id: number;
  worldX: number;
  worldY: number;
  screenY?: number;
  timeSec: number;
  triggered: boolean;
  /** 'slam' = SlamPad rewarding airborne Fast-Drop (S/Down) with shockwave & super bounce. */
  kind?: 'jump' | 'slam';
}

export interface DashRing {
  id: number;
  worldX: number;
  worldY: number;
  screenY?: number;
  radius: number;
  timeSec: number;
  triggered: boolean;
}

export interface HoldRail {
  id: number;
  x0: number;
  x1: number;
  worldY: number;
  screenY?: number;
  band: ResonanceFormType;
  active: boolean;
  completed: boolean;
}

export interface JudgmentFeedback {
  id: number;
  grade: JudgmentGrade;
  deltaMs?: number;
  /** Signed timing offset in ms: negative = FAST (early), positive = SLOW (late). */
  signedDeltaMs?: number;
  bonusScore: number;
}

export interface JudgmentCounts {
  perfect: number;
  great: number;
  good: number;
  miss: number;
}

export interface TrackBlueprint {
  trackId: string;
  difficulty: DifficultyMode;
  durationSec: number;
  referenceHeight: number;
  worldPxPerSec: number;
  segmentWidth: number;
  leadInSegments: number;
  slices: AudioSlice[];
  segments: BezierSegment[];
  orbs: ResonanceOrb[];
  traps: BeatTrap[];
  divingNodes: DivingNode[];
  skyPlatforms: SkyPlatform[];
  jumpPads: JumpPad[];
  dashRings: DashRing[];
  holdRails: HoldRail[];
  sectionCounts: Record<SectionIntensity, number>;
  totalBeats: number;
  totalStars?: number;
}

export interface LoadingProgress {
  progress: number; // 0.0 ~ 1.0
  stage: LoadingStageKey;
  blueprint?: TrackBlueprint;
}

export interface BeatTrap {
  id: number;
  worldX: number;
  width: number;
  height: number;
  destroyed: boolean;
  passed: boolean;
  timeSec?: number;
  /** True when floating mid-air as a BeatDrone hazard (damages on contact unless shattered via Shift Dash/Skill or Overdrive). */
  isAerialDrone?: boolean;
  droneWorldY?: number;
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
  audioSec?: number;
  worldPxPerSec?: number;
  beatPulse?: number;
  combo?: number;
  overdriveActive?: boolean;
  overdriveRatio?: number;
  shakeX?: number;
  shakeY?: number;
  phase: GamePhase;
  zoomScale: number;          // 1.0x -> 50.0x (with Origin Rebasing)
  rebasedZoomDisplay: number; // Effective HUD display scale (e.g. 1.0x ~ 64.0x)
  cameraX: number;
  focalScreenX: number;
  focalScreenY: number;
  activeForm: ResonanceFormType;
  divingTargetForm: ResonanceFormType;
  resonanceGauge: number;     // 0 ~ 100
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
  orbs?: ResonanceOrb[];
  skyPlatforms?: SkyPlatform[];
  jumpPads?: JumpPad[];
  dashRings?: DashRing[];
  holdRails?: HoldRail[];
  surfMomentum?: number; // 0.0 ~ 1.0
  isDiving?: boolean;
  sectionIntensity?: SectionIntensity;
  shockwaves: ShockwaveEffect[];
  afterimages: AfterimageTrail[];
  particles: VectorParticle[];
}

export interface HUDTelemetry {
  rendererMode: RendererMode;
  difficulty?: DifficultyMode;
  sfxMode?: SfxMode;
  fps: number;
  phase: GamePhase;
  zoomDisplay: number;
  score: number;
  combo: number;
  maxCombo: number;
  progress: number; // 0.0 ~ 1.0
  activeForm: ResonanceFormType;
  resonanceGauge: number; // 0 ~ 100
  microSyncProgress?: number; // 0 ~ 100 during MICRO tunnel
  overdriveReady?: boolean;
  overdriveActive?: boolean;
  acousticFilter: AcousticZoomMode;
  statusBanner: BannerMessage | null;
  isFinished: boolean;
  trapsDestroyed: number;
  divesCompleted: number;
  surfMomentum?: number; // 0.0 ~ 1.0
  speedMultiplier?: number; // 1.0 ~ 2.4
  orbsCollected?: number;
  totalOrbs?: number;
  starsCollected?: number;
  totalStars?: number;
  sectionIntensity?: SectionIntensity;
  accuracy?: number; // 0 ~ 100
  rank?: ResultRank;
  judgment?: JudgmentFeedback | null;
  judgmentCounts?: JudgmentCounts;
  gimmicksTriggered?: number;
  isNewRecord?: boolean;
  scoreDelta?: number;
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
