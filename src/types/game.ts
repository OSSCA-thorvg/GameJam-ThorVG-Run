export type RendererMode = 'sw' | 'gl';

export type ResonanceFormType = 'bass' | 'synth' | 'treble';

export type SlashLane = 'high' | 'low';

export type BeatTargetKind =
  | 'high'      // 2F 상단 비트 적 코어 (Cyan #05D5FF) — 상단 베기 [F/D/W/↑/좌클릭]
  | 'low'       // 1F 하단 비트 적 코어 (Crimson #FF2A6D) — 하단 베기 [J/K/S/↓/우클릭]
  | 'chord'     // 상·하단 동시 골드 실드 코어 (Gold #FFE600) — [Space] 또는 50ms 이내 [F+J]
  | 'hold'      // 지속형 네온 레이저 리본 (lane: 'high' | 'low') — 시작 타격 후 키 홀드
  | 'rush'      // 드롭 클라이맥스 보스 코어 — 레티클 고정 중 [F/J/Space] 연타 난무 피니시
  | 'sawblade'  // 1F 지상 회피용 회전톱 — 통과 시 HIGH 레인 체공 상태여야 회피 (Overdrive 시 자동 분쇄)
  | 'mine';     // 2F 공중 회피용 플라즈마 기뢰 — 통과 시 LOW 레인 상태여야 회피 (Overdrive 시 자동 분쇄)

export type LoadingStageKey =
  | 'decoding'
  | 'analyzingBands'
  | 'buildingWaveform'
  | 'placingObjects'
  | 'ready';

export type BannerKey =
  | 'ready'
  | 'dropSection'
  | 'overdriveReady'
  | 'overdriveActivate'
  | 'prismStar'
  | 'grooveDanger'
  | 'grooveDepleted'
  | 'chordCross'
  | 'beatRushStart'
  | 'beatRushFinish'
  | 'cleanDodge'
  | 'hazardHit';

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
 * - 'full' (Default): 3-layer percussive drum/katana hit SFX + air swing + gimmick/impact SFX
 * - 'impact': Skips ordinary slash hit SFX to preserve pure song audio; plays chord/rush/shatter/overdrive/miss SFX only
 * - 'off': Mutes all procedural SFX
 */
export type SfxMode = 'full' | 'impact' | 'off';

export type JudgmentGrade = 'PERFECT' | 'GREAT' | 'GOOD' | 'MISS';

export type ResultRank = 'S' | 'A' | 'B' | 'C';

export type SectionIntensity = 'calm' | 'groove' | 'drop';

export const CHORD_SYNC_WINDOW_SEC = 0.050; // 50ms 양손 동시 입력 유예창 단일 상수

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
    worldPxPerSec: 520,
    density: 0.65,
    perfectMs: 75,
    greatMs: 135,
    goodMs: 185,
    colorHex: '#00F5A0',
    rgb: [0, 245, 160],
  },
  normal: {
    mode: 'normal',
    worldPxPerSec: 680,
    density: 1.0,
    perfectMs: 52,
    greatMs: 100,
    goodMs: 150,
    colorHex: '#05D5FF',
    rgb: [5, 213, 255],
  },
  hard: {
    mode: 'hard',
    worldPxPerSec: 840,
    density: 1.35,
    perfectMs: 38,
    greatMs: 78,
    goodMs: 120,
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
  deckLevel?: 0 | 1 | 2;
}

export interface BeatTarget {
  id: number;
  kind: BeatTargetKind;
  lane: SlashLane;
  /** 정확한 온셋 판정 시각 (초). worldX = timeSec * worldPxPerSec */
  timeSec: number;
  /** 'hold' 리본 종료 시각 또는 'rush' 보스 코어 연타 종료 시각 (초) */
  endTimeSec?: number;
  worldX: number;
  endWorldX?: number;
  /** 720p 기준 Y 좌표 (HIGH = 368, LOW = 520, CHORD/RUSH 중심 = 444) */
  worldY: number;
  /** BezierTerrain이 뷰포트 높이에 맞춰 스케일링한 런타임 Y */
  screenY?: number;
  band: ResonanceFormType;
  radius: number;
  /** 트랙당 3개 배치되는 하모닉 프리즘 스타 코어 여부 (3개 격파 시 Prism 스킨 해금) */
  isPrismStar?: boolean;
  /** 런타임 가변 상태 (BezierTerrain.reset()에서 완벽 초기화) */
  resolved: boolean;
  hitGrade?: JudgmentGrade;
  holdActive?: boolean;
  holdNextTickSec?: number;
  holdReleaseGraceSec?: number;
  chordPartialLane?: SlashLane;
  chordPartialSec?: number;
  chordPartialSignedMs?: number;
  rushHits?: number;
  rushTargetHits?: number;
}

export interface SlicedEnemyHalf {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  cutAngle: number;
  spin: number;
  side: 1 | -1;
  color: [number, number, number];
  life: number;
  maxLife: number;
  isPrismStar?: boolean;
}

export interface JudgmentFeedback {
  id: number;
  grade: JudgmentGrade;
  deltaMs?: number;
  /** Signed timing offset in ms: negative = FAST (early), positive = SLOW (late). */
  signedDeltaMs?: number;
  bonusScore: number;
  isCritical?: boolean;
  lane?: SlashLane | 'chord';
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
  bpm: number;
  durationSec: number;
  referenceHeight: number;
  worldPxPerSec: number;
  segmentWidth: number;
  leadInSegments: number;
  laneHighY: number; // 368
  laneLowY: number;  // 520
  floorY: number;    // 542
  slices: AudioSlice[];
  segments: BezierSegment[];
  targets: BeatTarget[];
  sectionCounts: Record<SectionIntensity, number>;
  totalBeats: number;
  totalSlashTargets: number;   // kind in ('high' | 'low' | 'chord' | 'hold' | 'rush')
  totalSpecialTargets: number; // kind in ('chord' | 'hold' | 'rush' | 'sawblade' | 'mine')
  totalStars: number;
}

export interface LoadingProgress {
  progress: number; // 0.0 ~ 1.0
  stage: LoadingStageKey;
  blueprint?: TrackBlueprint;
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
  resonanceGauge: number; // 0 ~ 100
  frequency: FrequencyBands;
  segments: BezierSegment[];
  reticleScreenX: number;
  laneHighScreenY: number;
  laneLowScreenY: number;
  playerLane: SlashLane;
  reticlePulseHigh: number;
  reticlePulseLow: number;
  targets: BeatTarget[];
  slicedHalves: SlicedEnemyHalf[];
  playerScreenX: number;
  playerScreenY: number;
  playerRotation: number;
  playerRadius: number;
  isGrinding: boolean;
  invulnerableTimer: number;
  /** Seconds of run-cycle animation; advances while running/slashing, scaled by speed. */
  runCycleTime: number;
  surfMomentum?: number; // 0.0 ~ 1.0
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
  playerLane?: SlashLane;
  highKeyFlash?: boolean;
  lowKeyFlash?: boolean;
  chordKeyFlash?: boolean;
  rushCombo?: number;
  audioOffsetMs?: number;
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
    hits?: number;
    bonus?: number;
    seconds?: number;
    mult?: number;
    hp?: number;
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
