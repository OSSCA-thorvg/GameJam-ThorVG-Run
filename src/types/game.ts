import type { BannerKey, Messages } from '../i18n/messages';

export type RendererMode = 'sw' | 'gl';

export type ResonanceFormType = 'bass' | 'synth' | 'treble';

export type CrewmateSkinId = 'classic' | 'prism' | 'flawless' | 'grandmaster';

export const CREWMATE_SKIN_ORDER: readonly CrewmateSkinId[] = [
  'classic',
  'prism',
  'flawless',
  'grandmaster',
];

export const CREWMATE_SKIN_CONFIG: Record<
  CrewmateSkinId,
  {
    accentHex: string;
    primaryRgb: [number, number, number];
    secondaryRgb: [number, number, number];
  }
> = {
  classic: {
    accentHex: '#05D5FF',
    primaryRgb: [5, 213, 255],
    secondaryRgb: [255, 255, 255],
  },
  prism: {
    accentHex: '#38BDF8',
    primaryRgb: [56, 189, 248],
    secondaryRgb: [255, 230, 0],
  },
  flawless: {
    accentHex: '#34D399',
    primaryRgb: [52, 211, 153],
    secondaryRgb: [5, 213, 255],
  },
  grandmaster: {
    accentHex: '#FFE600',
    primaryRgb: [255, 230, 0],
    secondaryRgb: [255, 42, 109],
  },
};

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

export type SlashEffectKind = 'cross' | 'pierce' | 'slam';

export interface SlashEffect {
  x: number;
  y: number;
  angle: number;
  length: number;
  width: number;
  color: [number, number, number];
  life: number;
  maxLife: number;
  kind: SlashEffectKind;
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
  zoomScale: number;
  cameraX: number;
  focalScreenX: number;
  focalScreenY: number;
  panX?: number; // Unzoomed world/screen horizontal pan offset (px, default 0)
  panY?: number; // Unzoomed world/screen vertical pan offset (px, default 0)
  activeForm: ResonanceFormType;
  skinId?: CrewmateSkinId;
  resonanceGauge: number;     // 0 ~ 100
  frequency: FrequencyBands;
  segments: BezierSegment[];
  traps: BeatTrap[];
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
  slashes: SlashEffect[];
}

export interface HUDTelemetry {
  rendererMode: RendererMode;
  difficulty?: DifficultyMode;
  sfxMode?: SfxMode;
  fps: number;
  zoomDisplay: number;
  cinematicCamera: boolean;
  score: number;
  combo: number;
  maxCombo: number;
  progress: number; // 0.0 ~ 1.0
  activeForm: ResonanceFormType;
  resonanceGauge: number; // 0 ~ 100
  grooveHp: number;
  maxGrooveHp: number;
  isFailed?: boolean;
  newlyUnlockedSkins?: CrewmateSkinId[];
  overdriveReady?: boolean;
  overdriveActive?: boolean;
  /** 0 = [Shift] skill ready, 0 < ratio <= 1 = remaining cooldown fraction */
  skillCooldownRatio?: number;
  /** Remaining [Shift] skill cooldown in seconds (rounded to 0.1s; 0 when ready) */
  skillCooldownSec?: number;
  statusBanner: BannerMessage | null;
  isFinished: boolean;
  trapsDestroyed: number;
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
  isPaused?: boolean;
  userZoom?: number; // User zoom multiplier (0.4~4.0 live, 0.20~20.0 paused)
  isPanned?: boolean; // True when panX !== 0 || panY !== 0 || userZoom !== 1
}

/**
 * Language-agnostic status banner emitted by the engine.
 * The UI layer resolves `key` and `params` into localized text.
 */
export interface BannerMessage {
  key: BannerKey;
  params?: {
    form?: ResonanceFormType;
    count?: number;
    collected?: number;
    total?: number;
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
