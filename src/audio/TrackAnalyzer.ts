import { evaluateCubicBezier } from '../engine/bezierMath';
import {
  DIFFICULTY_CONFIG,
  type BeatTrap,
  type BezierSegment,
  type DashRing,
  type DifficultyMode,
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
  minDroneGapPx: number;
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
    minDroneGapPx: 1950,
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
    minDroneGapPx: 1380,
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
    minDroneGapPx: 980,
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
  gapSliceSet: Set<number>;
  floorAtWorldX: (wx: number) => { y: number; isGap: boolean; seg: BezierSegment };
}

function buildRoadTopology(
  dsp: DspAnalysisResult,
  segWidth: number,
  tuning: CourseTuningProfile
): BuiltRoadTopology {
  const { totalSlices, slices, sliceIntensity, sliceHasBeat } = dsp;
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

  let lastGapSlice = 10;
  for (let i = 16; i < totalSlices - 12; i++) {
    if (i - lastGapSlice < tuning.minGapIntervalSlices) continue;
    const inten = sliceIntensity[i] ?? 'calm';
    if (inten === 'calm' && !tuning.allowCalmGaps) continue;
    if (!sliceHasBeat.has(i)) continue;

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

  return { segments, gapSliceSet, floorAtWorldX };
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
  let nextId = 1;

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

      if (beat.intensity === 'drop') {
        const ringX = platEndX + 68;
        dashRings.push({
          id: nextId++,
          worldX: ringX,
          worldY: skyY - 18,
          radius: 26,
          timeSec: ringX / worldPxPerSec,
          triggered: false,
        });
      } else {
        // Place a Ground SlamPad (`kind: 'slam'`) right past 2F Sky Platform exit to reward S/Down Fast-Drop!
        const slamX = platEndX + 115;
        const slamFloor = road.floorAtWorldX(slamX);
        if (!slamFloor.isGap && !ground.isBusy(slamX - 70, slamX + 190)) {
          ground.reserve(slamX - 65, slamX + 185);
          jumpPads.push({
            id: nextId++,
            worldX: slamX,
            worldY: slamFloor.y,
            timeSec: slamX / worldPxPerSec,
            triggered: false,
            kind: 'slam',
          });
          for (let k = 1; k <= 3; k++) {
            const nx = slamX + k * 56;
            const lift = 68 + k * 28;
            orbs.push({
              id: nextId++,
              worldX: nx,
              worldY: slamFloor.y - lift,
              radius: 11,
              band: beat.band,
              isArcOrb: true,
              isBeatTarget: k === 1,
              timeSec: nx / worldPxPerSec,
              collected: false,
            });
          }
        }
      }
    }
  }

  // 4B-2. Standalone Bass-Drop SlamPads (`kind: 'slam'`) preceded by an aerial lead-in note
  let lastSlamPadX = 950;
  for (const beat of dsp.beatEvents) {
    if (beat.timeSec < 3.0 || beat.timeSec > dsp.durationSec - 3.5) continue;
    if (beat.band !== 'bass' || beat.strength < 0.56) continue;
    if (beat.worldX < lastSlamPadX + 2250) continue;
    const sx = beat.worldX;
    if (ground.isBusy(sx - 130, sx + 190)) continue;
    const fLead = road.floorAtWorldX(sx - 95);
    const fSlam = road.floorAtWorldX(sx);
    if (fLead.isGap || fSlam.isGap) continue;

    ground.reserve(sx - 120, sx + 180);
    lastSlamPadX = sx;
    // Lead-in jump orb inviting the player airborne right before slamming down onto the SlamPad
    orbs.push({
      id: nextId++,
      worldX: sx - 92,
      worldY: fLead.y - 104,
      radius: 11.5,
      band: 'bass',
      isArcOrb: true,
      isBeatTarget: true,
      timeSec: (sx - 92) / worldPxPerSec,
      collected: false,
    });
    jumpPads.push({
      id: nextId++,
      worldX: sx,
      worldY: fSlam.y,
      timeSec: beat.timeSec,
      triggered: false,
      kind: 'slam',
    });
    for (let k = 1; k <= 2; k++) {
      const nx = sx + k * 62;
      orbs.push({
        id: nextId++,
        worldX: nx,
        worldY: fSlam.y - (74 + k * 30),
        radius: 10.5,
        band: 'bass',
        isArcOrb: true,
        isBeatTarget: false,
        timeSec: nx / worldPxPerSec,
        collected: false,
      });
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

  // 4D. Beat Traps, Aerial BeatDrones & On-Beat Rhythm Target Notes
  let lastTrapX = 450;
  let lastDroneX = 720;
  let droneToggle = 0;
  let lastNoteX = 220;

  for (let bIdx = 0; bIdx < dsp.beatEvents.length; bIdx++) {
    const beat = dsp.beatEvents[bIdx]!;
    if (beat.timeSec < 1.4 || beat.timeSec > dsp.durationSec - 1.8) continue;
    const wx = beat.worldX;

    const { y: floorY, isGap } = road.floorAtWorldX(wx);
    if (isGap || ground.isBusy(wx - 55, wx + 55)) continue;

    // Aerial BeatDrone hazard: alternates low strike lane (floorY - 44) and mid-air lane (floorY - 96)
    const canSpawnDrone =
      beat.intensity !== 'calm' &&
      wx - lastDroneX >= tuning.minDroneGapPx &&
      wx - lastTrapX >= 320 &&
      beat.strength >= 0.44 &&
      !road.floorAtWorldX(wx - 90).isGap &&
      !road.floorAtWorldX(wx + 90).isGap;

    if (canSpawnDrone) {
      lastDroneX = wx;
      ground.reserve(wx - 80, wx + 80);
      const isHighLane = droneToggle % 2 === 1;
      droneToggle++;
      const droneY = isHighLane ? floorY - 96 : floorY - 44;
      traps.push({
        id: nextId++,
        worldX: wx,
        width: 38,
        height: 38,
        destroyed: false,
        passed: false,
        timeSec: beat.timeSec,
        isAerialDrone: true,
        droneWorldY: droneY,
      });

      // Reward orbs trailing right behind the drone for slicing through with Shift!
      for (const offset of [54, 108]) {
        const nx = wx + offset;
        orbs.push({
          id: nextId++,
          worldX: nx,
          worldY: droneY,
          radius: 10.5,
          band: beat.band,
          isArcOrb: true,
          isBeatTarget: offset === 54,
          timeSec: nx / worldPxPerSec,
          collected: false,
        });
      }
      continue;
    }

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

  // 4E. Place Exactly 3 High-Risk / High-Route Harmonic Prism Stars (★ 3/3) at ~25%, ~55%, ~82%
  const playableStartX = worldPxPerSec * 1.8;
  const playableEndX = Math.max(playableStartX + 900, (dsp.durationSec - 2.0) * worldPxPerSec);
  const starAnchors = [0.25, 0.55, 0.82];
  const starBands: Array<'bass' | 'synth' | 'treble'> = ['bass', 'synth', 'treble'];
  const usedSkyIds = new Set<number>();
  const usedRingIds = new Set<number>();
  const usedPadIds = new Set<number>();

  for (let sIdx = 0; sIdx < starAnchors.length; sIdx++) {
    const ratio = starAnchors[sIdx]!;
    const targetX = playableStartX + (playableEndX - playableStartX) * ratio;
    const searchWindow = Math.max(550, (playableEndX - playableStartX) * 0.14);

    let starX = targetX;
    let starY = DECK_HEIGHTS[0] - 134;
    let placedOnGimmick = false;

    // Priority 1: High above a 2nd-floor SkyPlatform (requires 2F jump)
    const candidateSky = skyPlatforms.find(
      (p) => !usedSkyIds.has(p.id) && Math.abs((p.x0 + p.x1) * 0.5 - targetX) <= searchWindow
    );
    if (candidateSky) {
      usedSkyIds.add(candidateSky.id);
      starX = (candidateSky.x0 + candidateSky.x1) * 0.5;
      starY = Math.max(145, candidateSky.worldY - 72);
      placedOnGimmick = true;
    }

    // Priority 2: Out of an airborne DashRing burst
    if (!placedOnGimmick) {
      const candidateRing = dashRings.find(
        (r) => !usedRingIds.has(r.id) && Math.abs(r.worldX - targetX) <= searchWindow
      );
      if (candidateRing) {
        usedRingIds.add(candidateRing.id);
        starX = candidateRing.worldX + 92;
        starY = Math.max(155, candidateRing.worldY - 22);
        placedOnGimmick = true;
      }
    }

    // Priority 3: Apex of a JumpPad or SlamPad super-bounce
    if (!placedOnGimmick) {
      const candidatePad = jumpPads.find(
        (p) => !usedPadIds.has(p.id) && Math.abs(p.worldX - targetX) <= searchWindow
      );
      if (candidatePad) {
        usedPadIds.add(candidatePad.id);
        starX = candidatePad.worldX + 102;
        starY = Math.max(165, candidatePad.worldY - 148);
        placedOnGimmick = true;
      }
    }

    // Fallback: Elevated double-jump / glide apex on solid road
    if (!placedOnGimmick) {
      let probeX = targetX;
      for (let step = 0; step < 12; step++) {
        const candidateX = targetX + (step % 2 === 0 ? 1 : -1) * Math.ceil(step / 2) * 85;
        const fl = road.floorAtWorldX(candidateX);
        if (!fl.isGap) {
          probeX = candidateX;
          starY = Math.max(175, fl.y - 128);
          break;
        }
      }
      starX = probeX;
    }

    orbs.push({
      id: nextId++,
      worldX: starX,
      worldY: starY,
      radius: 16,
      band: starBands[sIdx % starBands.length]!,
      isArcOrb: true,
      isBeatTarget: true,
      isPrismStar: true,
      timeSec: starX / worldPxPerSec,
      collected: false,
    });
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
    skyPlatforms,
    jumpPads,
    dashRings,
    holdRails,
    sectionCounts: dsp.sectionCounts,
    totalBeats: dsp.beatEvents.length,
    totalStars: 3,
  };

  blueprintCache.set(cacheKey, blueprint);
  onProgress?.({ progress: 1.0, stage: 'ready', blueprint });
  return blueprint;
}
