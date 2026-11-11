import { evaluateCubicBezier } from '../engine/bezierMath';
import {
  DIFFICULTY_CONFIG,
  type BeatTrap,
  type BezierSegment,
  type DashRing,
  type DifficultyMode,
  type DivingNode,
  type HoldRail,
  type JumpPad,
  type LoadingProgress,
  type ResonanceOrb,
  type SkyPlatform,
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
export const WORLD_PX_PER_SEC = DIFFICULTY_CONFIG.normal.worldPxPerSec;
export const SEGMENT_WIDTH = WORLD_PX_PER_SEC * SLICE_DURATION_SEC;
export const LEAD_IN_SEGMENTS = 8;

const DECK_HEIGHTS: readonly [number, number, number] = [506, 466, 426];

/**
 * Data-Driven Type Object Pattern:
 * Centralizes all level-generation density, spacing, and beat-picking thresholds per difficulty
 * so game designers can tune rhythm-runner pacing in one table without touching procedural logic.
 */
export interface CourseTuningProfile extends DifficultyDspTuning {
  minGapIntervalSlices: number;
  allowCalmGaps: boolean;
  minSkyGapPx: number;
  minTrapGapPx: number;
  minTrapStrength: number;
  trapModulo: number;
  minNoteSpacingPx: number;
}

export const DIFFICULTY_COURSE_TUNING: Record<DifficultyMode, CourseTuningProfile> = {
  easy: {
    minBeatGapSec: 0.36,
    fluxGate: 0.085,
    minGapIntervalSlices: 20,
    allowCalmGaps: false,
    minSkyGapPx: 2200,
    minTrapGapPx: 760,
    minTrapStrength: 0.56,
    trapModulo: 3,
    minNoteSpacingPx: 195,
  },
  normal: {
    minBeatGapSec: 0.27,
    fluxGate: 0.068,
    minGapIntervalSlices: 14,
    allowCalmGaps: true,
    minSkyGapPx: 1750,
    minTrapGapPx: 560,
    minTrapStrength: 0.42,
    trapModulo: 2,
    minNoteSpacingPx: 145,
  },
  hard: {
    minBeatGapSec: 0.2,
    fluxGate: 0.055,
    minGapIntervalSlices: 11,
    allowCalmGaps: true,
    minSkyGapPx: 1450,
    minTrapGapPx: 430,
    minTrapStrength: 0.42,
    trapModulo: 2,
    minNoteSpacingPx: 115,
  },
};

const blueprintCache = new Map<string, TrackBlueprint>();

class GroundOccupancy {
  private readonly ranges: Array<[number, number]> = [];

  public isBusy(x0: number, x1: number): boolean {
    return this.ranges.some(([a, b]) => x0 <= b && x1 >= a);
  }

  public reserve(x0: number, x1: number): void {
    this.ranges.push([x0, x1]);
  }
}

interface BuiltRoadTopology {
  segments: BezierSegment[];
  divingNodes: DivingNode[];
  gapSliceSet: Set<number>;
  nearPortal: (wx: number, margin?: number) => boolean;
  floorAtWorldX: (wx: number) => { y: number; isGap: boolean; seg: BezierSegment };
  nextEntityId: number;
}

function buildRoadTopology(
  dsp: DspAnalysisResult,
  segWidth: number,
  tuning: CourseTuningProfile
): BuiltRoadTopology {
  const { totalSlices, slices, sliceIntensity, sliceBand, sliceHasBeat } = dsp;
  const segments: BezierSegment[] = [];
  const startDeckY = DECK_HEIGHTS[0];

  for (let li = -LEAD_IN_SEGMENTS; li < 0; li++) {
    const x0 = li * segWidth;
    const x1 = (li + 1) * segWidth;
    segments.push({
      x0,
      y0: startDeckY,
      cx1: x0 + segWidth * 0.35,
      cy1: startDeckY,
      cx2: x0 + segWidth * 0.65,
      cy2: startDeckY,
      x1,
      y1: startDeckY,
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
      isGap: false,
      deckLevel: 0,
    });
  }

  const totalWithRunway = totalSlices + 8;
  const sliceDeckLevel: Array<0 | 1 | 2> = new Array(totalWithRunway).fill(0);
  const gapSliceSet = new Set<number>();

  let curDeck: 0 | 1 | 2 = 0;
  const phraseLen = 12; // 3.0s solid running stretches
  for (let p = 1; p * phraseLen < totalSlices - 6; p++) {
    const startIdx = p * phraseLen;
    const inten = sliceIntensity[startIdx] ?? 'groove';
    if (inten === 'calm') {
      curDeck = p % 3 === 0 ? 1 : 0;
    } else if (inten === 'groove') {
      curDeck = ((curDeck + 1) % 2) as 0 | 1;
    } else {
      curDeck = ((curDeck + 1 + (p % 2)) % 3) as 0 | 1 | 2;
    }
    for (let k = startIdx; k < Math.min(totalWithRunway, startIdx + phraseLen); k++) {
      sliceDeckLevel[k] = curDeck;
    }
  }

  const divingNodes: DivingNode[] = [];
  const portalWorldXs: number[] = [];
  let nextEntityId = 1;
  let lastPortalSec = 8.0;

  for (let i = 36; i < totalSlices - 16; i++) {
    const sec = i * SLICE_DURATION_SEC;
    const prevInten = sliceIntensity[i - 1] ?? 'calm';
    const inten = sliceIntensity[i] ?? 'groove';
    const isUpgrade =
      (prevInten === 'calm' && inten !== 'calm') || (prevInten === 'groove' && inten === 'drop');

    if (sec - lastPortalSec >= 18.0 || (isUpgrade && sec - lastPortalSec >= 11.5)) {
      lastPortalSec = sec;
      const deckY = DECK_HEIGHTS[sliceDeckLevel[i] ?? 0];
      const wx = (i + 0.5) * segWidth;
      portalWorldXs.push(wx);
      divingNodes.push({
        id: nextEntityId++,
        worldX: wx,
        worldY: deckY - 68,
        radius: 30,
        targetForm: sliceBand[i] ?? 'synth',
        activated: false,
      });
    }
  }

  const nearPortal = (wx: number, margin: number = 420): boolean =>
    portalWorldXs.some((px) => Math.abs(px - wx) < margin);

  let lastGapSlice = 10;
  for (let i = 16; i < totalSlices - 12; i++) {
    if (i - lastGapSlice < tuning.minGapIntervalSlices) continue;
    const inten = sliceIntensity[i] ?? 'calm';
    if (inten === 'calm' && !tuning.allowCalmGaps) continue;
    if (!sliceHasBeat.has(i)) continue;
    const wx = i * segWidth;
    if (nearPortal(wx, 520)) continue;

    const takeoffLevel = sliceDeckLevel[i - 1] ?? 0;
    sliceDeckLevel[i - 1] = takeoffLevel;
    sliceDeckLevel[i] = takeoffLevel;
    sliceDeckLevel[i + 1] = takeoffLevel;
    sliceDeckLevel[i + 2] = takeoffLevel;

    gapSliceSet.add(i);
    gapSliceSet.add(i + 1);
    lastGapSlice = i + 2;
  }

  let prevY = startDeckY;
  for (let i = 0; i < totalWithRunway; i++) {
    const clampedIdx = Math.min(i, slices.length - 1);
    const slice = slices[clampedIdx]!;
    const x0 = i * segWidth;
    const x1 = (i + 1) * segWidth;
    const level = sliceDeckLevel[i] ?? 0;
    const targetY = DECK_HEIGHTS[level];
    const isGap = gapSliceSet.has(i);

    const y0 = prevY;
    const y1 = targetY;
    segments.push({
      x0,
      y0,
      cx1: x0 + segWidth * 0.38,
      cy1: y0,
      cx2: x0 + segWidth * 0.62,
      cy2: y1,
      x1,
      y1,
      energyBand: slice.dominantBand,
      sliceIndex: i,
      timeSec: i * SLICE_DURATION_SEC,
      low: slice.low,
      mid: slice.mid,
      high: slice.high,
      overall: slice.overall,
      intensity: slice.intensity,
      isBeatOnset: slice.isBeatOnset,
      isCrest: y1 < y0 - 15,
      isGap,
      deckLevel: level,
    });
    prevY = y1;
  }

  const floorAtWorldX = (wx: number): { y: number; isGap: boolean; seg: BezierSegment } => {
    const idx = Math.max(
      0,
      Math.min(segments.length - 1, Math.floor(wx / segWidth) + LEAD_IN_SEGMENTS)
    );
    const seg = segments[idx]!;
    const t = Math.max(0, Math.min(1, (wx - seg.x0) / Math.max(1, seg.x1 - seg.x0)));
    return {
      y: evaluateCubicBezier(seg.y0, seg.cy1, seg.cy2, seg.y1, t),
      isGap: Boolean(seg.isGap),
      seg,
    };
  };

  return { segments, divingNodes, gapSliceSet, nearPortal, floorAtWorldX, nextEntityId };
}

/**
 * Pre-computes a 1:1 Beat-Synced Hybrid Rhythm-Runner Course via a 4-stage pipeline:
 * 1. Audio PCM Decode -> 2. 20ms DSP Spectral-Flux Beat Extraction ->
 * 3. Multi-Deck & Chasm Topology -> 4. Gimmick, Sky Platform, Trap & Beat Note Placement.
 */
export async function analyzeTrackBlueprint(
  buffer: AudioBuffer,
  track: TrackMetadata,
  onProgress?: (status: LoadingProgress) => void,
  difficulty: DifficultyMode = 'normal'
): Promise<TrackBlueprint> {
  const diffCfg = DIFFICULTY_CONFIG[difficulty];
  const tuning = DIFFICULTY_COURSE_TUNING[difficulty];
  const worldPxPerSec = diffCfg.worldPxPerSec;
  const segWidth = worldPxPerSec * SLICE_DURATION_SEC;
  const cacheKey = `${track.id}:${difficulty}`;

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

  const road = buildRoadTopology(dsp, segWidth, tuning);
  let nextId = road.nextEntityId;

  onProgress?.({ progress: 0.85, stage: 'placingObjects' });
  await nextFrame();

  const orbs: ResonanceOrb[] = [];
  const traps: BeatTrap[] = [];
  const skyPlatforms: SkyPlatform[] = [];
  const jumpPads: JumpPad[] = [];
  const dashRings: DashRing[] = [];
  const holdRails: HoldRail[] = [];
  const ground = new GroundOccupancy();

  // 4A. Chasm Gap Gimmicks (alternating Airborne Dash Ring vs Takeoff Jump Pad + Parabolic Note Arc)
  let gapPatternToggle = 0;
  for (let i = 16; i < dsp.totalSlices - 12; i++) {
    if (!road.gapSliceSet.has(i) || road.gapSliceSet.has(i - 1)) continue;
    const gapStartX = i * segWidth;
    const gapEndX = (i + 2) * segWidth;
    const gapSpan = gapEndX - gapStartX;
    const { y: takeoffY, seg } = road.floorAtWorldX(gapStartX - 16);
    const band = seg.energyBand;
    ground.reserve(gapStartX - 110, gapEndX + 95);

    if (gapPatternToggle % 2 === 0) {
      const ringX = gapStartX + gapSpan * 0.34;
      const ringY = takeoffY - 82;
      dashRings.push({
        id: nextId++,
        worldX: ringX,
        worldY: ringY,
        radius: 26,
        timeSec: ringX / worldPxPerSec,
        triggered: false,
      });
      for (let k = 1; k <= 3; k++) {
        const nx = ringX + k * 68;
        orbs.push({
          id: nextId++,
          worldX: nx,
          worldY: ringY + k * 8,
          radius: 10.5,
          band,
          isArcOrb: true,
          isBeatTarget: k === 1,
          timeSec: nx / worldPxPerSec,
          collected: false,
        });
      }
    } else {
      const padX = gapStartX - 28;
      jumpPads.push({
        id: nextId++,
        worldX: padX,
        worldY: takeoffY,
        timeSec: padX / worldPxPerSec,
        triggered: false,
      });
      for (let k = 0; k < 4; k++) {
        const u = (k + 0.5) / 4;
        const nx = gapStartX + u * gapSpan;
        const lift = 4 * u * (1 - u) * 118 + 38;
        orbs.push({
          id: nextId++,
          worldX: nx,
          worldY: takeoffY - lift,
          radius: 11,
          band,
          isArcOrb: true,
          isBeatTarget: k === 1,
          timeSec: nx / worldPxPerSec,
          collected: false,
        });
      }
    }
    gapPatternToggle++;
  }

  // 4B. 2nd-Floor Sky Platforms preceded by Beat Jump Pads
  let lastSkyEndX = 1100;
  for (const beat of dsp.beatEvents) {
    if (beat.timeSec < 3.2 || beat.timeSec > dsp.durationSec - 4.0) continue;
    if (beat.intensity === 'calm') continue;
    if (beat.worldX < lastSkyEndX + tuning.minSkyGapPx) continue;

    const padX = beat.worldX;
    const platStartX = padX + worldPxPerSec * 0.34;
    const platDurationSec = beat.intensity === 'drop' ? 2.2 : 1.75;
    const platEndX = platStartX + worldPxPerSec * platDurationSec;

    if (road.nearPortal(padX, 450) || road.nearPortal(platEndX, 450)) continue;
    if (ground.isBusy(padX - 90, platStartX + 80)) continue;
    const { y: padFloorY, isGap } = road.floorAtWorldX(padX);
    if (isGap) continue;

    const skyY = Math.max(220, padFloorY - 142);
    ground.reserve(padX - 80, padX + 110);
    lastSkyEndX = platEndX;

    jumpPads.push({
      id: nextId++,
      worldX: padX,
      worldY: padFloorY,
      timeSec: beat.timeSec,
      triggered: false,
    });

    skyPlatforms.push({
      id: nextId++,
      x0: platStartX,
      x1: platEndX,
      worldY: skyY,
      band: beat.band,
    });

    if (skyPlatforms.length % 2 === 1) {
      holdRails.push({
        id: nextId++,
        x0: platStartX + 45,
        x1: platEndX - 55,
        worldY: skyY - 26,
        band: beat.band,
        active: false,
        completed: false,
      });
    } else {
      const skyBeats: DetectedBeatEvent[] = dsp.beatEvents.filter(
        (b) => b.worldX >= platStartX + 35 && b.worldX <= platEndX - 35
      );
      if (skyBeats.length > 0) {
        for (const sb of skyBeats) {
          orbs.push({
            id: nextId++,
            worldX: sb.worldX,
            worldY: skyY - 30,
            radius: 11.5,
            band: sb.band,
            isArcOrb: true,
            isBeatTarget: true,
            timeSec: sb.timeSec,
            collected: false,
          });
        }
      } else {
        for (let x = platStartX + 60; x <= platEndX - 50; x += 130) {
          orbs.push({
            id: nextId++,
            worldX: x,
            worldY: skyY - 30,
            radius: 11,
            band: beat.band,
            isArcOrb: true,
            isBeatTarget: true,
            timeSec: x / worldPxPerSec,
            collected: false,
          });
        }
      }

      if (beat.intensity === 'drop' && !road.nearPortal(platEndX + 80, 340)) {
        const ringX = platEndX + 68;
        dashRings.push({
          id: nextId++,
          worldX: ringX,
          worldY: skyY - 18,
          radius: 26,
          timeSec: ringX / worldPxPerSec,
          triggered: false,
        });
      }
    }
  }

  // 4C. Ground Hold Note Rails on flat gap-free sprint stretches
  let lastGroundRailEndX = 700;
  for (const beat of dsp.beatEvents) {
    if (beat.timeSec < 2.2 || beat.timeSec > dsp.durationSec - 3.0) continue;
    if (beat.worldX < lastGroundRailEndX + 1900) continue;
    const railLenPx = worldPxPerSec * (beat.intensity === 'drop' ? 0.95 : 1.15);
    const rx0 = beat.worldX;
    const rx1 = rx0 + railLenPx;

    if (road.nearPortal(rx0, 380) || road.nearPortal(rx1, 380)) continue;
    if (ground.isBusy(rx0 - 90, rx1 + 90)) continue;

    const f0 = road.floorAtWorldX(rx0);
    const fMid = road.floorAtWorldX((rx0 + rx1) * 0.5);
    const f1 = road.floorAtWorldX(rx1);
    if (f0.isGap || fMid.isGap || f1.isGap) continue;
    if (Math.abs(f0.y - f1.y) > 8) continue;

    ground.reserve(rx0 - 60, rx1 + 60);
    lastGroundRailEndX = rx1;
    holdRails.push({
      id: nextId++,
      x0: rx0,
      x1: rx1,
      worldY: f0.y - 26,
      band: beat.band,
      active: false,
      completed: false,
    });
  }

  // 4D. Beat Traps & On-Beat Rhythm Target Notes
  let lastTrapX = 450;
  let lastNoteX = 220;

  for (let bIdx = 0; bIdx < dsp.beatEvents.length; bIdx++) {
    const beat = dsp.beatEvents[bIdx]!;
    if (beat.timeSec < 1.4 || beat.timeSec > dsp.durationSec - 1.8) continue;
    const wx = beat.worldX;
    if (road.nearPortal(wx, 280)) continue;

    const { y: floorY, isGap } = road.floorAtWorldX(wx);
    if (isGap || ground.isBusy(wx - 55, wx + 55)) continue;

    const canSpawnTrap =
      wx - lastTrapX >= tuning.minTrapGapPx &&
      beat.strength >= tuning.minTrapStrength &&
      !road.floorAtWorldX(wx - 90).isGap &&
      !road.floorAtWorldX(wx + 90).isGap;

    if (canSpawnTrap && bIdx % tuning.trapModulo === 0) {
      lastTrapX = wx;
      ground.reserve(wx - 75, wx + 75);
      const trapHeight = Math.round(40 + beat.strength * 18);
      traps.push({
        id: nextId++,
        worldX: wx,
        width: 34,
        height: trapHeight,
        destroyed: false,
        passed: false,
        timeSec: beat.timeSec,
        screenFloorY: floorY,
      } as BeatTrap & { screenFloorY?: number });

      for (const offset of [-46, 0, 46]) {
        const lift = offset === 0 ? 74 : 54;
        const nx = wx + offset;
        orbs.push({
          id: nextId++,
          worldX: nx,
          worldY: floorY - trapHeight - lift,
          radius: offset === 0 ? 12 : 9.5,
          band: beat.band,
          isArcOrb: true,
          isBeatTarget: offset === 0,
          timeSec: nx / worldPxPerSec,
          collected: false,
        });
      }
      continue;
    }

    if (wx - lastNoteX >= tuning.minNoteSpacingPx) {
      lastNoteX = wx;
      const isJumpNote = beat.band === 'treble' || (beat.intensity === 'drop' && bIdx % 3 === 1);
      orbs.push({
        id: nextId++,
        worldX: wx,
        worldY: isJumpNote ? floorY - 96 : floorY - 30,
        radius: 11.5,
        band: beat.band,
        isArcOrb: isJumpNote,
        isBeatTarget: true,
        timeSec: beat.timeSec,
        collected: false,
      });
    }
  }

  orbs.sort((a, b) => a.worldX - b.worldX);
  traps.sort((a, b) => a.worldX - b.worldX);
  jumpPads.sort((a, b) => a.worldX - b.worldX);
  dashRings.sort((a, b) => a.worldX - b.worldX);
  skyPlatforms.sort((a, b) => a.x0 - b.x0);
  holdRails.sort((a, b) => a.x0 - b.x0);

  const blueprint: TrackBlueprint = {
    trackId: track.id,
    difficulty,
    durationSec: dsp.durationSec,
    referenceHeight: REFERENCE_HEIGHT,
    worldPxPerSec,
    segmentWidth: segWidth,
    leadInSegments: LEAD_IN_SEGMENTS,
    slices: dsp.slices,
    segments: road.segments,
    orbs,
    traps,
    divingNodes: road.divingNodes,
    skyPlatforms,
    jumpPads,
    dashRings,
    holdRails,
    sectionCounts: dsp.sectionCounts,
    totalBeats: dsp.beatEvents.length,
  };

  blueprintCache.set(cacheKey, blueprint);
  onProgress?.({ progress: 1.0, stage: 'ready', blueprint });
  return blueprint;
}
