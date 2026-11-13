import {
  CREWMATE_SKIN_ORDER,
  type CrewmateSkinId,
  type DifficultyMode,
  type HUDTelemetry,
  type ResultRank,
  type SfxMode,
  type TrackMetadata,
  type TrackRecord,
} from '../types/game';

const RECORDS_STORAGE_KEY = 'thorvg_run:records:v2';
const SFX_MODE_STORAGE_KEY = 'thorvg_run:sfx_mode:v1';
const UNLOCKED_SKINS_KEY = 'thorvg_run:unlocked_skins:v1';
const SELECTED_SKIN_KEY = 'thorvg_run:selected_skin:v1';
const AUDIO_OFFSET_MS_KEY = 'thorvg_run:audio_offset_ms:v1';

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
  const runCombo = hud.maxCombo ?? 0;
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

function clampAudioOffsetInt(offsetMs: number): number {
  if (!Number.isFinite(offsetMs)) return 0;
  const rounded = Math.round(offsetMs);
  const clamped = Math.max(-150, Math.min(150, rounded));
  return clamped === 0 ? 0 : clamped;
}

export function loadAudioOffsetMs(): number {
  try {
    const raw = window.localStorage.getItem(AUDIO_OFFSET_MS_KEY);
    if (raw !== null && raw.trim() !== '') {
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) {
        return clampAudioOffsetInt(parsed);
      }
    }
  } catch {
    // Ignore storage errors
  }
  return 0;
}

export function saveAudioOffsetMs(offsetMs: number): number {
  const clamped = clampAudioOffsetInt(offsetMs);
  try {
    window.localStorage.setItem(AUDIO_OFFSET_MS_KEY, String(clamped));
  } catch {
    // Ignore storage errors
  }
  return clamped;
}

function isValidSkinId(v: unknown): v is CrewmateSkinId {
  return (
    typeof v === 'string' &&
    (CREWMATE_SKIN_ORDER as readonly string[]).includes(v)
  );
}

export function getUnlockedSkins(): CrewmateSkinId[] {
  const set = new Set<CrewmateSkinId>(['classic']);

  try {
    const raw = window.localStorage.getItem(UNLOCKED_SKINS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (isValidSkinId(item)) {
            set.add(item);
          }
        }
      }
    }
  } catch {
    // Ignore storage access errors
  }

  for (const rec of Object.values(readAllRecords())) {
    if (!rec || typeof rec !== 'object') continue;
    if (rec.bestStars >= 3) set.add('prism');
    if (rec.noMissCleared) set.add('flawless');
    if (rec.bestRank === 'S') set.add('grandmaster');
  }

  const ordered = CREWMATE_SKIN_ORDER.filter((id) => set.has(id));
  try {
    window.localStorage.setItem(UNLOCKED_SKINS_KEY, JSON.stringify(ordered));
  } catch {
    // Ignore quota/storage errors
  }
  return ordered;
}

export function evaluateSkinUnlocksOnClear(summary: {
  rank: ResultRank;
  starsCollected: number;
  noMiss: boolean;
}): CrewmateSkinId[] {
  const before = new Set<CrewmateSkinId>(getUnlockedSkins());
  const after = new Set<CrewmateSkinId>(before);

  if (summary.starsCollected >= 3) after.add('prism');
  if (summary.noMiss) after.add('flawless');
  if (summary.rank === 'S') after.add('grandmaster');

  const persisted = CREWMATE_SKIN_ORDER.filter((id) => after.has(id));
  try {
    window.localStorage.setItem(UNLOCKED_SKINS_KEY, JSON.stringify(persisted));
  } catch {
    // Ignore quota/storage errors
  }

  return CREWMATE_SKIN_ORDER.filter((id) => after.has(id) && !before.has(id));
}

export function loadSelectedSkin(): CrewmateSkinId {
  const unlocked = getUnlockedSkins();
  try {
    const raw = window.localStorage.getItem(SELECTED_SKIN_KEY);
    if (isValidSkinId(raw) && unlocked.includes(raw)) {
      return raw;
    }
  } catch {
    // Ignore storage errors
  }
  return 'classic';
}

export function saveSelectedSkin(skinId: CrewmateSkinId): CrewmateSkinId {
  const unlocked = getUnlockedSkins();
  const safeSkin: CrewmateSkinId =
    isValidSkinId(skinId) && unlocked.includes(skinId) ? skinId : 'classic';
  try {
    window.localStorage.setItem(SELECTED_SKIN_KEY, safeSkin);
  } catch {
    // Ignore storage errors
  }
  return safeSkin;
}
