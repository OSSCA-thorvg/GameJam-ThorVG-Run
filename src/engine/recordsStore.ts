import type {
  DifficultyMode,
  HUDTelemetry,
  ResultRank,
  SfxMode,
  TrackMetadata,
  TrackRecord,
} from '../types/game';

const RECORDS_STORAGE_KEY = 'thorvg_run:records:v1';
const SFX_MODE_STORAGE_KEY = 'thorvg_run:sfx_mode:v1';

const RANK_WEIGHT: Record<ResultRank, number> = {
  S: 4,
  A: 3,
  B: 2,
  C: 1,
};

function buildTrackKey(track: TrackMetadata, difficulty: DifficultyMode): string {
  const baseId = track.isCustom
    ? `custom:${track.title.trim().toLowerCase()}:${Math.round(track.durationSec)}`
    : track.id;
  return `${baseId}::${difficulty}`;
}

function readAllRecords(): Record<string, TrackRecord> {
  try {
    const raw = window.localStorage.getItem(RECORDS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object') {
      return parsed as Record<string, TrackRecord>;
    }
  } catch {
    // Ignore storage access errors in private/restricted contexts
  }
  return {};
}

function writeAllRecords(records: Record<string, TrackRecord>): void {
  try {
    window.localStorage.setItem(RECORDS_STORAGE_KEY, JSON.stringify(records));
  } catch {
    // Ignore quota/storage errors
  }
}

export function getTrackRecord(
  track: TrackMetadata,
  difficulty: DifficultyMode
): TrackRecord | null {
  const all = readAllRecords();
  return all[buildTrackKey(track, difficulty)] ?? null;
}

export function saveTrackRunResult(
  track: TrackMetadata,
  difficulty: DifficultyMode,
  hud: Pick<
    HUDTelemetry,
    'score' | 'rank' | 'accuracy' | 'maxCombo' | 'starsCollected' | 'judgmentCounts'
  >
): { record: TrackRecord; isNewRecord: boolean; scoreDelta: number } {
  const all = readAllRecords();
  const key = buildTrackKey(track, difficulty);
  const prev = all[key];

  const runScore = Math.max(0, Math.floor(hud.score));
  const runRank: ResultRank = hud.rank ?? 'B';
  const runAcc = hud.accuracy ?? 0;
  const runCombo = hud.maxCombo ?? 1;
  const runStars = hud.starsCollected ?? 0;
  const runNoMiss = (hud.judgmentCounts?.miss ?? 0) === 0;

  const isNewRecord = !prev || runScore > prev.bestScore;
  const scoreDelta = prev ? runScore - prev.bestScore : runScore;

  const next: TrackRecord = {
    bestScore: prev ? Math.max(prev.bestScore, runScore) : runScore,
    bestRank:
      prev && RANK_WEIGHT[prev.bestRank] > RANK_WEIGHT[runRank] ? prev.bestRank : runRank,
    bestAccuracy: prev ? Math.max(prev.bestAccuracy, runAcc) : runAcc,
    maxCombo: prev ? Math.max(prev.maxCombo, runCombo) : runCombo,
    bestStars: prev ? Math.max(prev.bestStars, runStars) : runStars,
    noMissCleared: Boolean(prev?.noMissCleared || runNoMiss),
    clearCount: (prev?.clearCount ?? 0) + 1,
  };

  all[key] = next;
  writeAllRecords(all);
  return { record: next, isNewRecord, scoreDelta };
}

export function loadSfxMode(): SfxMode {
  try {
    const raw = window.localStorage.getItem(SFX_MODE_STORAGE_KEY);
    if (raw === 'full' || raw === 'impact' || raw === 'off') {
      return raw;
    }
  } catch {
    // Ignore storage errors
  }
  return 'full';
}

export function saveSfxMode(mode: SfxMode): void {
  try {
    window.localStorage.setItem(SFX_MODE_STORAGE_KEY, mode);
  } catch {
    // Ignore storage errors
  }
}

export function nextSfxMode(current: SfxMode): SfxMode {
  if (current === 'full') return 'impact';
  if (current === 'impact') return 'off';
  return 'full';
}
