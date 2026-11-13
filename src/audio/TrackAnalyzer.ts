import {
  DIFFICULTY_CONFIG,
  type BeatTarget,
  type BezierSegment,
  type DifficultyMode,
  type LoadingProgress,
  type ResonanceFormType,
  type SlashLane,
  type TrackBlueprint,
  type TrackMetadata,
} from '../types/game';
import {
  extractAudioSlicesAndBeats,
  nextFrame,
  SLICE_DURATION_SEC,
  type DetectedBeatEvent,
  type DifficultyDspTuning,
  type DspAnalysisResult,
} from './dsp/beatDetector';

export { SLICE_DURATION_SEC };
export const REFERENCE_HEIGHT = 720;
export const LANE_HIGH_Y = 368;
export const LANE_LOW_Y = 520;
export const LANE_MID_Y = 444;
export const FLOOR_Y = 542;
export const WORLD_PX_PER_SEC = DIFFICULTY_CONFIG.standard.worldPxPerSec;
export const SEGMENT_WIDTH = WORLD_PX_PER_SEC * SLICE_DURATION_SEC;
export const LEAD_IN_SEGMENTS = 8;

export interface CourseTuningProfile extends DifficultyDspTuning {
  chordMinGapSec: number;
  holdMinGapSec: number;
  rushMinGapSec: number;
  rushTargetHits: number;
  hazardMinGapSec: number;
}

export const DIFFICULTY_COURSE_TUNING: Record<DifficultyMode, CourseTuningProfile> = {
  casual: {
    minBeatGapSec: 0.28,
    fluxGate: 0.082,
    madMultiplier: 1.26,
    chordMinGapSec: 2.8,
    holdMinGapSec: 4.5,
    rushMinGapSec: 26.0,
    rushTargetHits: 6,
    hazardMinGapSec: 3.4,
  },
  standard: {
    minBeatGapSec: 0.18,
    fluxGate: 0.062,
    madMultiplier: 1.05,
    chordMinGapSec: 1.9,
    holdMinGapSec: 3.5,
    rushMinGapSec: 22.0,
    rushTargetHits: 8,
    hazardMinGapSec: 2.3,
  },
};

const blueprintCache = new Map<string, TrackBlueprint>();

/**
 * Builds a continuous, gap-free 1F Bezier Neon Stage Deck at `FLOOR_Y = 542`
 * (`LANE_LOW_Y = 520`, `playerRadius = 22`).
 */
function buildStageSegments(dsp: DspAnalysisResult, segWidth: number): BezierSegment[] {
  const { totalSlices, slices } = dsp;
  const segments: BezierSegment[] = [];

  for (let li = -LEAD_IN_SEGMENTS; li < 0; li++) {
    const x0 = li * segWidth;
    const x1 = (li + 1) * segWidth;
    segments.push({
      x0,
      y0: FLOOR_Y,
      cx1: x0 + segWidth * 0.35,
      cy1: FLOOR_Y,
      cx2: x0 + segWidth * 0.65,
      cy2: FLOOR_Y,
      x1,
      y1: FLOOR_Y,
      energyBand: 'synth',
      sliceIndex: li,
      timeSec: li * SLICE_DURATION_SEC,
      low: 0.2,
      mid: 0.2,
      high: 0.2,
      overall: 0.2,
      intensity: 'calm',
      isBeatOnset: false,
      isCrest: false,
      deckLevel: 0,
    });
  }

  const totalWithRunway = totalSlices + 8;
  for (let i = 0; i < totalWithRunway; i++) {
    const clampedIdx = Math.min(i, slices.length - 1);
    const slice = slices[clampedIdx]!;
    const x0 = i * segWidth;
    const x1 = (i + 1) * segWidth;
    const deckLevel: 0 | 1 | 2 =
      slice.intensity === 'drop' ? 2 : slice.intensity === 'groove' ? 1 : 0;

    segments.push({
      x0,
      y0: FLOOR_Y,
      cx1: x0 + segWidth * 0.36,
      cy1: FLOOR_Y,
      cx2: x0 + segWidth * 0.64,
      cy2: FLOOR_Y,
      x1,
      y1: FLOOR_Y,
      energyBand: slice.dominantBand,
      sliceIndex: i,
      timeSec: i * SLICE_DURATION_SEC,
      low: slice.low,
      mid: slice.mid,
      high: slice.high,
      overall: slice.overall,
      intensity: slice.intensity,
      isBeatOnset: slice.isBeatOnset,
      isCrest: false,
      deckLevel,
    });
  }

  return segments;
}

/**
 * [Fix 5] Supplements sparse/silent/short audio buffers with deterministic beat-grid events
 * so every track (including 5.35s test WAVs and silent fallback buffers) guarantees `>= minRequired`
 * active playable slash targets inside `[minSec, maxSec]`.
 */
function ensureMinimumBeatEvents(
  baseEvents: readonly DetectedBeatEvent[],
  minSec: number,
  maxSec: number,
  minRequired: number,
  bpm: number,
  beatPhaseSec: number,
  worldPxPerSec: number,
  dsp: DspAnalysisResult
): DetectedBeatEvent[] {
  const filtered = baseEvents
    .filter((ev) => ev.timeSec >= minSec && ev.timeSec <= maxSec)
    .map((ev) => ({ ...ev }));

  if (filtered.length >= minRequired) {
    return filtered;
  }

  const spanSec = Math.max(0.4, maxSec - minSec);
  const beatSec = 60 / Math.max(85, Math.min(185, bpm || 128));
  let stepSec = beatSec;
  while (spanSec / stepSec < minRequired + 2 && stepSec > 0.14) {
    stepSec *= 0.5;
  }
  if (spanSec / stepSec < minRequired + 1) {
    stepSec = spanSec / (minRequired + 1);
  }

  const minCollisionGap = Math.min(0.16, stepSec * 0.55);
  const startK = Math.ceil((minSec - beatPhaseSec) / stepSec);
  const endK = Math.floor((maxSec - beatPhaseSec) / stepSec);
  const bandsCycle: readonly ResonanceFormType[] = ['bass', 'synth', 'treble'];
  let synthIdx = 0;

  for (let k = startK; k <= endK && filtered.length < minRequired; k++) {
    const candSec = Number((beatPhaseSec + k * stepSec).toFixed(4));
    if (candSec < minSec || candSec > maxSec) continue;

    const collides = filtered.some((e) => Math.abs(e.timeSec - candSec) < minCollisionGap);
    if (collides) continue;

    const sIdx = Math.min(
      dsp.totalSlices - 1,
      Math.max(0, Math.floor(candSec / SLICE_DURATION_SEC))
    );
    const isHigh = synthIdx % 2 === 1;
    const isAccent = synthIdx % 4 === 3;
    const band = bandsCycle[synthIdx % bandsCycle.length]!;
    synthIdx++;

    filtered.push({
      timeSec: candSec,
      worldX: candSec * worldPxPerSec,
      strength: isAccent ? 0.72 : 0.54,
      kickStrength: isAccent || !isHigh ? 0.68 : 0.22,
      lowMidStrength: !isHigh ? 0.52 : 0.25,
      midHighStrength: isHigh || isAccent ? 0.66 : 0.24,
      hatStrength: isHigh ? 0.58 : 0.18,
      sustainSec: 0.12,
      isDownbeat: isAccent,
      band,
      intensity: dsp.sliceIntensity[sIdx] ?? 'groove',
    });
  }

  // Final deterministic uniform sweep if uniform grid still needed extra slots
  let fallbackStep = 0;
  while (filtered.length < minRequired && fallbackStep < minRequired * 3) {
    const u = (fallbackStep + 1) / (minRequired * 2 + 1);
    fallbackStep++;
    const candSec = Number((minSec + spanSec * u).toFixed(4));
    if (filtered.some((e) => Math.abs(e.timeSec - candSec) < 0.11)) continue;
    const isHigh = filtered.length % 2 === 1;
    filtered.push({
      timeSec: candSec,
      worldX: candSec * worldPxPerSec,
      strength: 0.55,
      kickStrength: isHigh ? 0.2 : 0.65,
      lowMidStrength: isHigh ? 0.22 : 0.45,
      midHighStrength: isHigh ? 0.65 : 0.24,
      hatStrength: isHigh ? 0.55 : 0.18,
      sustainSec: 0.1,
      isDownbeat: filtered.length % 4 === 0,
      band: isHigh ? 'synth' : 'bass',
      intensity: 'groove',
    });
  }

  filtered.sort((a, b) => a.timeSec - b.timeSec);
  return filtered;
}

function naturalLaneForEvent(ev: DetectedBeatEvent): SlashLane {
  const highScore = ev.midHighStrength * 0.95 + ev.hatStrength * 1.1;
  const lowScore = ev.kickStrength * 1.05 + ev.lowMidStrength * 0.75;
  return highScore > lowScore ? 'high' : 'low';
}

function isSlashTargetKind(kind: BeatTarget['kind']): boolean {
  return (
    kind === 'high' ||
    kind === 'low' ||
    kind === 'chord' ||
    kind === 'hold' ||
    kind === 'rush'
  );
}

/**
 * Pre-computes a 1:1 Beat-Synced 2-Lane Rhythm Slasher Chart (`rhythm-slasher-v6`):
 * 1. Audio PCM Decode -> 2. 4-Band STFT `SuperFlux` + BPM/Phase Grid ->
 * 3. Continuous 1F Bezier Neon Deck -> 4. Active 2-Lane Beat Targets & Attack=Dodge Hazards.
 */
export async function analyzeTrackBlueprint(
  buffer: AudioBuffer,
  track: TrackMetadata,
  onProgress?: (status: LoadingProgress) => void,
  difficulty: DifficultyMode = 'standard'
): Promise<TrackBlueprint> {
  const diffCfg = DIFFICULTY_CONFIG[difficulty];
  const tuning = DIFFICULTY_COURSE_TUNING[difficulty];
  const worldPxPerSec = diffCfg.worldPxPerSec;
  const segWidth = worldPxPerSec * SLICE_DURATION_SEC;
  const cacheKey = `${track.id}:${difficulty}:v7`;

  const cached = blueprintCache.get(cacheKey);
  if (cached) {
    onProgress?.({ progress: 0.45, stage: 'analyzingBands' });
    await nextFrame();
    onProgress?.({ progress: 0.82, stage: 'buildingWaveform' });
    await nextFrame();
    onProgress?.({ progress: 1.0, stage: 'ready', blueprint: cached });
    return cached;
  }

  onProgress?.({ progress: 0.2, stage: 'analyzingBands' });
  await nextFrame();

  const dsp = await extractAudioSlicesAndBeats(buffer, worldPxPerSec, tuning, onProgress);

  onProgress?.({ progress: 0.65, stage: 'buildingWaveform' });
  await nextFrame();

  const segments = buildStageSegments(dsp, segWidth);

  onProgress?.({ progress: 0.85, stage: 'placingObjects' });
  await nextFrame();

  // [Fix 5] Lead-in/out valid window supporting both full songs and 5.35s test WAVs ([0.642s .. 4.80s])
  const minTargetSec = Math.min(0.85, dsp.durationSec * 0.12);
  const rawMaxTargetSec = Math.max(dsp.durationSec - 0.55, dsp.durationSec * 0.88);
  const maxTargetSec = Math.max(
    minTargetSec + 0.4,
    Math.min(dsp.durationSec - 0.18, rawMaxTargetSec)
  );
  const minRequiredSlashTargets = Math.max(9, Math.floor(dsp.durationSec * 1.6));

  const events = ensureMinimumBeatEvents(
    dsp.beatEvents,
    minTargetSec,
    maxTargetSec,
    minRequiredSlashTargets,
    dsp.bpm,
    dsp.beatPhaseSec,
    worldPxPerSec,
    dsp
  );

  const beatSec = 60 / Math.max(85, Math.min(185, dsp.bpm || 128));
  const targets: BeatTarget[] = [];
  const consumedIdx = new Set<number>();

  // 1. Place Drop Climax 'rush' Boss Cores on tracks >= 16s (preserving >= minRequiredSlashTargets)
  if (dsp.durationSec >= 16.0) {
    let lastRushEndSec = -tuning.rushMinGapSec;
    for (let i = 0; i < events.length; i++) {
      const ev = events[i]!;
      if (ev.timeSec < 4.5 || ev.timeSec > maxTargetSec - 2.2) continue;
      if (ev.intensity !== 'drop' || ev.strength < 0.62) continue;
      if (ev.timeSec - lastRushEndSec < tuning.rushMinGapSec) continue;

      const rushDurSec = Math.min(1.35, Math.max(1.05, beatSec * 2.5));
      const endSec = Number(Math.min(maxTargetSec - 0.25, ev.timeSec + rushDurSec).toFixed(4));
      if (endSec - ev.timeSec < 0.9) continue;

      // Count how many events this rush span would absorb
      const absorbed: number[] = [];
      for (let j = 0; j < events.length; j++) {
        if (consumedIdx.has(j)) continue;
        const tj = events[j]!.timeSec;
        if (tj >= ev.timeSec - 0.18 && tj <= endSec + 0.24) {
          absorbed.push(j);
        }
      }
      if (events.length - consumedIdx.size - absorbed.length + 1 < minRequiredSlashTargets) {
        continue;
      }

      for (const idx of absorbed) consumedIdx.add(idx);
      lastRushEndSec = endSec;

      targets.push({
        id: 0,
        kind: 'rush',
        lane: 'low',
        timeSec: ev.timeSec,
        endTimeSec: endSec,
        worldX: ev.timeSec * worldPxPerSec,
        endWorldX: endSec * worldPxPerSec,
        worldY: LANE_MID_Y,
        band: 'treble',
        radius: 36,
        resolved: false,
        rushHits: 0,
        rushTargetHits: tuning.rushTargetHits,
      });
    }
  }

  // 2. Place Sustained 'hold' Laser Ribbons on tracks >= 12s (preserving >= minRequiredSlashTargets)
  if (dsp.durationSec >= 12.0) {
    let lastHoldEndSec = -tuning.holdMinGapSec;
    let holdLaneToggle: SlashLane = 'low';
    for (let i = 0; i < events.length; i++) {
      if (consumedIdx.has(i)) continue;
      const ev = events[i]!;
      if (ev.timeSec < 2.2 || ev.timeSec > maxTargetSec - 1.4) continue;
      if (ev.timeSec - lastHoldEndSec < tuning.holdMinGapSec) continue;
      if (ev.sustainSec < 0.26 && !(ev.intensity !== 'drop' && ev.isDownbeat && ev.strength >= 0.58)) {
        continue;
      }

      const rawHoldDur = Math.max(0.45, Math.min(0.95, Math.max(ev.sustainSec * 1.35, beatSec)));
      const snappedHoldDur = Math.max(0.42, Math.round(rawHoldDur / (beatSec * 0.5)) * (beatSec * 0.5));
      const endSec = Number(Math.min(maxTargetSec - 0.2, ev.timeSec + snappedHoldDur).toFixed(4));
      if (endSec - ev.timeSec < 0.4) continue;

      // Ensure hold span does not collide with an already-placed rush target
      const hitsExistingSpan = targets.some(
        (t) =>
          ev.timeSec <= (t.endTimeSec ?? t.timeSec) + 0.25 &&
          endSec >= t.timeSec - 0.25
      );
      if (hitsExistingSpan) continue;

      const absorbed: number[] = [];
      for (let j = i; j < events.length; j++) {
        if (consumedIdx.has(j)) continue;
        const tj = events[j]!.timeSec;
        if (tj >= ev.timeSec - 0.02 && tj <= endSec + 0.16) {
          absorbed.push(j);
        } else if (tj > endSec + 0.16) {
          break;
        }
      }
      if (
        targets.length + (events.length - consumedIdx.size - absorbed.length) + 1 <
        minRequiredSlashTargets
      ) {
        continue;
      }

      for (const idx of absorbed) consumedIdx.add(idx);
      lastHoldEndSec = endSec;
      const lane: SlashLane =
        ev.sustainSec >= 0.35 ? naturalLaneForEvent(ev) : holdLaneToggle;
      holdLaneToggle = lane === 'low' ? 'high' : 'low';

      targets.push({
        id: 0,
        kind: 'hold',
        lane,
        timeSec: ev.timeSec,
        endTimeSec: endSec,
        worldX: ev.timeSec * worldPxPerSec,
        endWorldX: endSec * worldPxPerSec,
        worldY: lane === 'high' ? LANE_HIGH_Y : LANE_LOW_Y,
        band: ev.band,
        radius: 22,
        resolved: false,
      });
    }
  }

  // 3. Place 'chord' Gold Shield Cores & 'high'/'low' Slash Cores with rapid (<0.19s) lane alternation
  let lastChordSec = -tuning.chordMinGapSec;
  let prevSlashSec = -10;
  let prevLane: SlashLane = 'high';
  let sameLaneStreak = 0;

  for (let i = 0; i < events.length; i++) {
    if (consumedIdx.has(i)) continue;
    const ev = events[i]!;
    const dtFromPrev = ev.timeSec - prevSlashSec;

    const isChordCandidate =
      dtFromPrev >= 0.24 &&
      ev.timeSec - lastChordSec >= tuning.chordMinGapSec &&
      ((ev.isDownbeat && ev.strength >= 0.62) ||
        (ev.kickStrength >= 0.52 && ev.midHighStrength >= 0.48));

    if (isChordCandidate) {
      lastChordSec = ev.timeSec;
      prevSlashSec = ev.timeSec;
      sameLaneStreak = 0;
      targets.push({
        id: 0,
        kind: 'chord',
        lane: 'low',
        timeSec: ev.timeSec,
        worldX: ev.timeSec * worldPxPerSec,
        worldY: LANE_MID_Y,
        band: 'treble',
        radius: 30,
        resolved: false,
      });
      continue;
    }

    let lane: SlashLane = naturalLaneForEvent(ev);
    // Mandatory rapid katana flow: consecutive notes < 0.19s MUST alternate LOW <-> HIGH
    if (dtFromPrev < 0.19) {
      lane = prevLane === 'low' ? 'high' : 'low';
    } else if (lane === prevLane && sameLaneStreak >= 3) {
      lane = prevLane === 'low' ? 'high' : 'low';
    }

    if (lane === prevLane) {
      sameLaneStreak++;
    } else {
      sameLaneStreak = 1;
    }
    prevLane = lane;
    prevSlashSec = ev.timeSec;

    targets.push({
      id: 0,
      kind: lane,
      lane,
      timeSec: ev.timeSec,
      worldX: ev.timeSec * worldPxPerSec,
      worldY: lane === 'high' ? LANE_HIGH_Y : LANE_LOW_Y,
      band: ev.band,
      radius: lane === 'high' ? 22 : 24,
      resolved: false,
    });
  }

  targets.sort((a, b) => a.timeSec - b.timeSec);

  // 4. Assign up to 3 Harmonic Prism Stars (`isPrismStar = true`) at ~25%, ~55%, ~82% of slash targets
  const slashEligible = targets.filter(
    (t) => t.kind === 'high' || t.kind === 'low' || t.kind === 'chord' || t.kind === 'hold'
  );
  const starAnchors = [0.25, 0.55, 0.82];
  const chosenStarTargets = new Set<BeatTarget>();
  if (slashEligible.length > 0) {
    for (const anchor of starAnchors) {
      const baseIdx = Math.min(
        slashEligible.length - 1,
        Math.max(0, Math.round((slashEligible.length - 1) * anchor))
      );
      let picked: BeatTarget | undefined;
      for (let offset = 0; offset < slashEligible.length; offset++) {
        const right = slashEligible[baseIdx + offset];
        if (right && !chosenStarTargets.has(right)) {
          picked = right;
          break;
        }
        const left = slashEligible[baseIdx - offset];
        if (left && !chosenStarTargets.has(left)) {
          picked = left;
          break;
        }
      }
      if (picked) {
        picked.isPrismStar = true;
        chosenStarTargets.add(picked);
      }
    }
  }

  // 5. Place 'sawblade' (1F low) & 'mine' (2F high) hazards strictly in safe opposite-lane windows
  //    (>= 0.24s > 0.22s clear of any same-lane target, chord, or rush span) so Attack = Automatic Dodge!
  if (dsp.durationSec >= 8.0) {
    const slashSnapshot = [...targets];
    let lastHazardSec = -tuning.hazardMinGapSec;

    const isHazardSafeAt = (candSec: number, hazardLane: SlashLane): boolean => {
      for (let k = 0; k < slashSnapshot.length; k++) {
        const st = slashSnapshot[k]!;
        const start = st.timeSec;
        const end = st.endTimeSec ?? st.timeSec;
        // Must never overlap any chord or rush within ±0.30s
        if (st.kind === 'chord' || st.kind === 'rush') {
          if (candSec >= start - 0.3 && candSec <= end + 0.3) return false;
          continue;
        }
        // Must never overlap a same-lane target (or hold span) within ±0.25s (> 0.22s requirement)
        if (st.lane === hazardLane) {
          if (candSec >= start - 0.25 && candSec <= end + 0.25) return false;
        }
      }
      return true;
    };

    for (let i = 0; i < slashSnapshot.length; i++) {
      const anchor = slashSnapshot[i]!;
      if (anchor.kind !== 'high' && anchor.kind !== 'low') continue;
      const sIdx = Math.min(
        dsp.totalSlices - 1,
        Math.max(0, Math.floor(anchor.timeSec / SLICE_DURATION_SEC))
      );
      const inten = dsp.sliceIntensity[sIdx] ?? 'groove';
      if (difficulty === 'casual' && inten !== 'drop') continue;
      if (inten === 'calm') continue;

      // Place hazard 0.08s after an opposite-lane slash so hitting the note vaults/ducks cleanly!
      const hazSec = Number((anchor.timeSec + 0.08).toFixed(4));
      if (hazSec > maxTargetSec - 0.2) continue;
      if (hazSec - lastHazardSec < tuning.hazardMinGapSec) continue;

      const hazardLane: SlashLane = anchor.lane === 'high' ? 'low' : 'high';
      if (!isHazardSafeAt(hazSec, hazardLane)) continue;

      lastHazardSec = hazSec;
      targets.push({
        id: 0,
        kind: hazardLane === 'low' ? 'sawblade' : 'mine',
        lane: hazardLane,
        timeSec: hazSec,
        worldX: hazSec * worldPxPerSec,
        worldY: hazardLane === 'low' ? LANE_LOW_Y : LANE_HIGH_Y,
        band: hazardLane === 'low' ? 'bass' : 'synth',
        radius: hazardLane === 'low' ? 24 : 22,
        resolved: false,
      });
    }
  }

  targets.sort((a, b) => a.timeSec - b.timeSec);

  let totalSlashTargets = 0;
  let totalSpecialTargets = 0;
  let totalStars = 0;
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i]!;
    t.id = i + 1;
    if (isSlashTargetKind(t.kind)) {
      totalSlashTargets++;
    }
    if (
      t.kind === 'chord' ||
      t.kind === 'hold' ||
      t.kind === 'rush' ||
      t.kind === 'sawblade' ||
      t.kind === 'mine'
    ) {
      totalSpecialTargets++;
    }
    if (t.isPrismStar) {
      totalStars++;
    }
  }

  const blueprint: TrackBlueprint = {
    trackId: track.id,
    difficulty,
    bpm: dsp.bpm,
    durationSec: dsp.durationSec,
    referenceHeight: REFERENCE_HEIGHT,
    worldPxPerSec,
    segmentWidth: segWidth,
    leadInSegments: LEAD_IN_SEGMENTS,
    laneHighY: LANE_HIGH_Y,
    laneLowY: LANE_LOW_Y,
    floorY: FLOOR_Y,
    slices: dsp.slices,
    segments,
    targets,
    sectionCounts: dsp.sectionCounts,
    totalBeats: Math.max(dsp.beatEvents.length, totalSlashTargets),
    totalSlashTargets,
    totalSpecialTargets,
    totalStars,
  };

  blueprintCache.set(cacheKey, blueprint);
  onProgress?.({ progress: 1.0, stage: 'ready', blueprint });
  return blueprint;
}
