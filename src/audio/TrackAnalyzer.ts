import { evaluateCubicBezier } from '../engine/bezierMath';
import type {
  AudioSlice,
  BeatTrap,
  BezierSegment,
  DivingNode,
  LoadingProgress,
  ResonanceFormType,
  ResonanceOrb,
  SectionIntensity,
  TrackBlueprint,
  TrackMetadata,
} from '../types/game';

export const REFERENCE_HEIGHT = 720;
export const WORLD_PX_PER_SEC = 480;
export const SLICE_DURATION_SEC = 0.25;
export const SEGMENT_WIDTH = WORLD_PX_PER_SEC * SLICE_DURATION_SEC; // 120px per 0.25s slice

const blueprintCache = new Map<string, TrackBlueprint>();

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });
}

function percentile(values: number[], q: number): number {
  if (values.length === 0) return 1;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * q)));
  return sorted[idx] || 1;
}

/**
 * Pre-computes the entire track's multi-band audio energy, section intensity (Calm / Groove / Drop),
 * C1 Cubic Bezier wave-surfing terrain, rhythm resonance orbs, beat traps, and diving portals
 * before the run begins.
 */
export async function analyzeTrackBlueprint(
  buffer: AudioBuffer,
  track: TrackMetadata,
  onProgress?: (status: LoadingProgress) => void
): Promise<TrackBlueprint> {
  const cached = blueprintCache.get(track.id);
  if (cached) {
    onProgress?.({ progress: 0.45, stage: 'analyzingBands' });
    await nextFrame();
    onProgress?.({ progress: 0.82, stage: 'buildingWaveform' });
    await nextFrame();
    onProgress?.({ progress: 1.0, stage: 'ready', blueprint: cached });
    return cached;
  }

  onProgress?.({ progress: 0.22, stage: 'analyzingBands' });
  await nextFrame();

  const sampleRate = buffer.sampleRate;
  const totalSamples = buffer.length;
  const durationSec = buffer.duration;
  const ch0 = buffer.getChannelData(0);
  const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null;

  const totalSlices = Math.max(16, Math.ceil(durationSec / SLICE_DURATION_SEC));
  const samplesPerSlice = Math.max(1, Math.floor(sampleRate * SLICE_DURATION_SEC));

  // Downsample by 4x (~11kHz effective rate) for fast, accurate 3-band envelope extraction
  const stride = 4;
  const effRate = sampleRate / stride;
  const alphaLow = (2 * Math.PI * 240) / (effRate + 2 * Math.PI * 240);
  const alphaMid = (2 * Math.PI * 3600) / (effRate + 2 * Math.PI * 3600);

  const rawLow: number[] = new Array(totalSlices).fill(0);
  const rawMid: number[] = new Array(totalSlices).fill(0);
  const rawHigh: number[] = new Array(totalSlices).fill(0);

  let lpLow = 0;
  let lpMid = 0;

  for (let i = 0; i < totalSlices; i++) {
    const startSample = i * samplesPerSlice;
    const endSample = Math.min(totalSamples, startSample + samplesPerSlice);
    let sumLowSq = 0;
    let sumMidSq = 0;
    let sumHighSq = 0;
    let count = 0;

    for (let s = startSample; s < endSample; s += stride) {
      const mono = ch1 ? (ch0[s]! + ch1[s]!) * 0.5 : ch0[s]!;
      lpLow += alphaLow * (mono - lpLow);
      lpMid += alphaMid * (mono - lpMid);

      const lowBand = lpLow;
      const midBand = lpMid - lpLow;
      const highBand = mono - lpMid;

      sumLowSq += lowBand * lowBand;
      sumMidSq += midBand * midBand;
      sumHighSq += highBand * highBand;
      count++;
    }

    if (count > 0) {
      rawLow[i] = Math.sqrt(sumLowSq / count);
      rawMid[i] = Math.sqrt(sumMidSq / count);
      rawHigh[i] = Math.sqrt(sumHighSq / count);
    }

    if (i > 0 && i % 140 === 0) {
      const ratio = i / totalSlices;
      onProgress?.({
        progress: 0.22 + ratio * 0.38,
        stage: 'analyzingBands',
      });
      await nextFrame();
    }
  }

  // Normalize each band against its 95th percentile so every song uses the full dynamic range
  const normLowDenom = Math.max(1e-4, percentile(rawLow, 0.95));
  const normMidDenom = Math.max(1e-4, percentile(rawMid, 0.95));
  const normHighDenom = Math.max(1e-4, percentile(rawHigh, 0.95));

  const normLow = rawLow.map((v) => Math.min(1.0, v / normLowDenom));
  const normMid = rawMid.map((v) => Math.min(1.0, v / normMidDenom));
  const normHigh = rawHigh.map((v) => Math.min(1.0, v / normHighDenom));
  const normOverall = normLow.map((l, i) =>
    Math.min(1.0, l * 0.44 + normMid[i]! * 0.36 + normHigh[i]! * 0.2)
  );

  // Compute 3-second rolling energy average to classify Calm / Groove / Drop sections
  const rollingEnergy: number[] = new Array(totalSlices).fill(0);
  const windowRadius = 6; // ±1.5s (3.0s window)
  for (let i = 0; i < totalSlices; i++) {
    let sum = 0;
    let cnt = 0;
    for (let k = Math.max(0, i - windowRadius); k <= Math.min(totalSlices - 1, i + windowRadius); k++) {
      sum += normOverall[k]!;
      cnt++;
    }
    rollingEnergy[i] = cnt > 0 ? sum / cnt : 0.2;
  }

  const calmThreshold = Math.max(0.24, Math.min(0.45, percentile(rollingEnergy, 0.33)));
  const dropThreshold = Math.max(calmThreshold + 0.14, Math.min(0.76, percentile(rollingEnergy, 0.68)));

  const slices: AudioSlice[] = [];
  const sectionCounts: Record<SectionIntensity, number> = {
    calm: 0,
    groove: 0,
    drop: 0,
  };

  let lastBeatSlice = -4;
  let totalBeats = 0;

  for (let i = 0; i < totalSlices; i++) {
    const low = normLow[i]!;
    const mid = normMid[i]!;
    const high = normHigh[i]!;
    const overall = normOverall[i]!;

    const dominantBand: ResonanceFormType =
      low >= mid && low >= high ? 'bass' : mid >= high ? 'synth' : 'treble';

    const roll = rollingEnergy[i]!;
    const intensity: SectionIntensity =
      roll >= dropThreshold ? 'drop' : roll >= calmThreshold ? 'groove' : 'calm';
    sectionCounts[intensity]++;

    // Detect beat onset via positive spectral flux over local background
    const prevLow = i > 0 ? normLow[i - 1]! : low;
    const prevMid = i > 0 ? normMid[i - 1]! : mid;
    const flux = Math.max(0, low - prevLow) * 0.68 + Math.max(0, mid - prevMid) * 0.32;
    const isBeatOnset =
      i >= 4 &&
      i - lastBeatSlice >= 2 &&
      (flux > 0.14 || (low > Math.max(0.42, roll * 1.18) && low >= prevLow));

    if (isBeatOnset) {
      lastBeatSlice = i;
      totalBeats++;
    }

    slices.push({
      index: i,
      timeSec: i * SLICE_DURATION_SEC,
      worldX0: i * SEGMENT_WIDTH,
      worldX1: (i + 1) * SEGMENT_WIDTH,
      low,
      mid,
      high,
      overall,
      dominantBand,
      intensity,
      isBeatOnset,
    });
  }

  onProgress?.({ progress: 0.68, stage: 'buildingWaveform' });
  await nextFrame();

  // Stage 3: Synthesize C1 Cubic Bezier Wave-Surfing Terrain
  // We use a 2-segment uphill (crest) + 2-segment downhill (trough) surfing cadence
  // modulated by real audio energy, section intensity, and beat onsets.
  const baseFloorY = REFERENCE_HEIGHT * 0.64; // 460.8px
  const minPeakY = REFERENCE_HEIGHT * 0.24;   // 172.8px (high crest ceiling)
  const maxTroughY = REFERENCE_HEIGHT * 0.84; // 604.8px (deep trough floor)

  const segments: BezierSegment[] = [];
  let lastY = baseFloorY;
  let lastSlopeY = 0;

  // Add 1 lead-in segment before x=0 so cameraX=0 has full coverage
  segments.push({
    x0: -SEGMENT_WIDTH,
    y0: baseFloorY,
    cx1: -SEGMENT_WIDTH * 0.65,
    cy1: baseFloorY,
    cx2: -SEGMENT_WIDTH * 0.35,
    cy2: baseFloorY,
    x1: 0,
    y1: baseFloorY,
    energyBand: 'synth',
    sliceIndex: -1,
    timeSec: 0,
    low: 0.2,
    mid: 0.2,
    high: 0.2,
    overall: 0.2,
    intensity: 'calm',
    isBeatOnset: false,
    isCrest: false,
  });

  // Pre-compute target anchor heights y1 for each slice using a 4-slice wave cycle
  // Phase 0: mid-uphill, Phase 1: Wave Crest (Peak), Phase 2: steep downhill, Phase 3: Wave Trough (Valley)
  const totalWithRunway = totalSlices + 6;
  for (let i = 0; i < totalWithRunway; i++) {
    const slice = slices[Math.min(i, slices.length - 1)]!;
    const x0 = i * SEGMENT_WIDTH;
    const x1 = (i + 1) * SEGMENT_WIDTH;
    const y0 = lastY;

    let y1 = baseFloorY;
    let isCrest = false;

    if (i < 3) {
      // Gentle introductory runway
      y1 = baseFloorY + Math.sin(i * 0.8) * 18;
    } else {
      const wavePhase = (i - 3) % 4;
      const intensityScale =
        slice.intensity === 'drop' ? 1.38 : slice.intensity === 'groove' ? 1.0 : 0.56;
      const bandBoost =
        slice.dominantBand === 'bass'
          ? slice.low * 1.15
          : slice.dominantBand === 'synth'
          ? slice.mid * 1.05
          : slice.high * 1.0;
      const energy = Math.min(1.0, slice.overall * 0.65 + bandBoost * 0.35);
      const beatBonus = slice.isBeatOnset ? 26 : 0;

      // Amplitude in pixels on 720p canvas
      const amplitude = (38 + energy * 108 + beatBonus) * intensityScale;

      if (wavePhase === 0) {
        // Climbing uphill toward the crest
        y1 = baseFloorY - amplitude * 0.35;
      } else if (wavePhase === 1) {
        // Wave Crest (Peak) — launch point!
        y1 = baseFloorY - amplitude;
        isCrest = true;
      } else if (wavePhase === 2) {
        // Carving steeply downhill from the crest into the trough
        y1 = baseFloorY + amplitude * 0.42;
      } else {
        // Bottom of the Wave Trough (Valley) — maximum pump compression
        y1 = baseFloorY + amplitude * 0.92;
      }

      y1 = Math.max(minPeakY, Math.min(maxTroughY, y1));
    }

    // C1 continuous control points
    const cx1 = x0 + SEGMENT_WIDTH * 0.36;
    const cy1 = Math.max(minPeakY - 20, Math.min(maxTroughY + 20, y0 + lastSlopeY * 0.42));
    const nextSlope = isCrest ? 0 : (y1 - y0) * 0.58;
    const cx2 = x0 + SEGMENT_WIDTH * 0.66;
    const cy2 = Math.max(minPeakY - 20, Math.min(maxTroughY + 20, y1 - nextSlope * 0.42));

    segments.push({
      x0,
      y0,
      cx1,
      cy1,
      cx2,
      cy2,
      x1,
      y1,
      energyBand: slice.dominantBand,
      sliceIndex: i,
      timeSec: slice.timeSec,
      low: slice.low,
      mid: slice.mid,
      high: slice.high,
      overall: slice.overall,
      intensity: slice.intensity,
      isBeatOnset: slice.isBeatOnset,
      isCrest,
    });

    lastY = y1;
    lastSlopeY = nextSlope;
  }

  onProgress?.({ progress: 0.86, stage: 'placingObjects' });
  await nextFrame();

  // Stage 4: Pre-compute Rhythm Resonance Orbs, Beat Traps, and Frequency Diving Nodes
  const orbs: ResonanceOrb[] = [];
  const traps: BeatTrap[] = [];
  const divingNodes: DivingNode[] = [];

  let nextId = 1;
  let lastTrapX = 400;
  let lastPortalX = 1200;

  for (let i = 4; i < totalSlices - 3; i++) {
    const seg = segments[i + 1]!; // +1 because of lead-in segment at index 0
    const slice = slices[i]!;
    const wavePhase = (i - 3) % 4;
    const midX = (seg.x0 + seg.x1) * 0.5;
    const midFloorY = evaluateCubicBezier(seg.y0, seg.cy1, seg.cy2, seg.y1, 0.5);

    // 1. Frequency Diving Nodes at major transitions or ~12s intervals
    const prevIntensity = i > 0 ? slices[i - 1]!.intensity : slice.intensity;
    const isIntensityUpgrade =
      (prevIntensity === 'calm' && slice.intensity !== 'calm') ||
      (prevIntensity === 'groove' && slice.intensity === 'drop');

    if (
      seg.x0 - lastPortalX >= 4800 ||
      (isIntensityUpgrade && seg.x0 - lastPortalX >= 2800)
    ) {
      lastPortalX = seg.x0;
      divingNodes.push({
        id: nextId++,
        worldX: midX,
        worldY: Math.max(REFERENCE_HEIGHT * 0.22, midFloorY - 78),
        radius: 30,
        targetForm: slice.dominantBand,
        activated: false,
      });
      continue;
    }

    // 2. Airborne Parabolic Orb Arcs launching off Wave Crests in Groove/Drop sections
    if (seg.isCrest && (slice.intensity === 'drop' || (slice.intensity === 'groove' && slice.isBeatOnset))) {
      const crestX = seg.x1;
      const crestY = seg.y1;
      const arcSpanPx = SEGMENT_WIDTH * 2.1;
      const peakLift = slice.intensity === 'drop' ? 128 : 92;
      const orbCount = slice.intensity === 'drop' ? 5 : 4;

      for (let k = 0; k < orbCount; k++) {
        const u = (k + 0.5) / orbCount; // 0 -> 1 along the jump arc
        const ox = crestX + u * arcSpanPx;
        // Parabolic flight trajectory above the wave trough
        const arcOffset = 4 * u * (1 - u) * peakLift;
        const oy = Math.max(REFERENCE_HEIGHT * 0.14, crestY - 28 - arcOffset);
        orbs.push({
          id: nextId++,
          worldX: ox,
          worldY: oy,
          radius: 11,
          band: slice.dominantBand,
          isArcOrb: true,
          collected: false,
        });
      }
    } else if (wavePhase === 2 || wavePhase === 3) {
      // 3. Wave-Contour Surfing Orbs along downhill & trough curves
      if (i % 2 === 0 || slice.intensity === 'drop') {
        for (const t of [0.28, 0.72]) {
          const ox = seg.x0 + (seg.x1 - seg.x0) * t;
          const oy = evaluateCubicBezier(seg.y0, seg.cy1, seg.cy2, seg.y1, t) - 26;
          orbs.push({
            id: nextId++,
            worldX: ox,
            worldY: oy,
            radius: 9.5,
            band: slice.dominantBand,
            isArcOrb: false,
            collected: false,
          });
        }
      }
    }

    // 4. Beat Traps placed on real Beat Onsets on uphill/trough approaches (never blind downhill landings)
    const minTrapGap =
      slice.intensity === 'drop' ? 420 : slice.intensity === 'groove' ? 560 : 780;
    if (
      slice.isBeatOnset &&
      (wavePhase === 0 || wavePhase === 3) &&
      seg.x0 - lastTrapX >= minTrapGap &&
      Math.abs(seg.x0 - lastPortalX) > 260
    ) {
      lastTrapX = seg.x0;
      const trapX = seg.x0 + SEGMENT_WIDTH * 0.52;
      const trapFloorY = evaluateCubicBezier(seg.y0, seg.cy1, seg.cy2, seg.y1, 0.52);
      traps.push({
        id: nextId++,
        worldX: trapX,
        width: 34,
        height: Math.round(38 + slice.overall * 22),
        destroyed: false,
        passed: false,
        screenFloorY: trapFloorY,
      } as BeatTrap & { screenFloorY?: number });
    }
  }

  const blueprint: TrackBlueprint = {
    trackId: track.id,
    durationSec,
    referenceHeight: REFERENCE_HEIGHT,
    worldPxPerSec: WORLD_PX_PER_SEC,
    segmentWidth: SEGMENT_WIDTH,
    slices,
    segments,
    orbs,
    traps,
    divingNodes,
    sectionCounts,
    totalBeats,
  };

  blueprintCache.set(track.id, blueprint);
  onProgress?.({ progress: 1.0, stage: 'ready', blueprint });
  return blueprint;
}
