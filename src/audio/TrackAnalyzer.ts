import { evaluateCubicBezier } from '../engine/bezierMath';
import {
  DIFFICULTY_CONFIG,
  type AudioSlice,
  type BeatTrap,
  type BezierSegment,
  type DashRing,
  type DifficultyMode,
  type DivingNode,
  type HoldRail,
  type JumpPad,
  type LoadingProgress,
  type ResonanceFormType,
  type ResonanceOrb,
  type SectionIntensity,
  type SkyPlatform,
  type TrackBlueprint,
  type TrackMetadata,
} from '../types/game';

export const REFERENCE_HEIGHT = 720;
export const WORLD_PX_PER_SEC = DIFFICULTY_CONFIG.normal.worldPxPerSec; // 550px/s default
export const SLICE_DURATION_SEC = 0.25;
export const SEGMENT_WIDTH = WORLD_PX_PER_SEC * SLICE_DURATION_SEC;
export const LEAD_IN_SEGMENTS = 8;

const blueprintCache = new Map<string, TrackBlueprint>();

interface BeatEvent {
  timeSec: number;
  worldX: number;
  strength: number;
  band: ResonanceFormType;
  intensity: SectionIntensity;
}

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
 * Pre-computes a 1:1 Beat-Synced Hybrid Rhythm-Runner Course:
 * - Sub-20ms spectral-flux beat onset peak detection
 * - Solid multi-elevation sprint decks + chasm gaps (`isGap`) + 2F sky platforms
 * - Shrinking-ring Rhythm Beat Notes, Beat Jump Pads, Airborne Dash Rings, Hold Note Rails & Beat Traps
 */
export async function analyzeTrackBlueprint(
  buffer: AudioBuffer,
  track: TrackMetadata,
  onProgress?: (status: LoadingProgress) => void,
  difficulty: DifficultyMode = 'normal'
): Promise<TrackBlueprint> {
  const diffCfg = DIFFICULTY_CONFIG[difficulty];
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

  const sampleRate = buffer.sampleRate;
  const totalSamples = buffer.length;
  const durationSec = buffer.duration;
  const ch0 = buffer.getChannelData(0);
  const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null;

  // Stage 1: Fine-grained 20ms (50 Hz) 3-band envelope extraction for sub-20ms beat accuracy
  const hopSec = 0.02;
  const hopSamples = Math.max(1, Math.floor(sampleRate * hopSec));
  const totalHops = Math.max(32, Math.ceil(durationSec / hopSec));

  const stride = 4;
  const effRate = sampleRate / stride;
  const alphaLow = (2 * Math.PI * 220) / (effRate + 2 * Math.PI * 220);
  const alphaMid = (2 * Math.PI * 3400) / (effRate + 2 * Math.PI * 3400);

  const hopLow = new Float32Array(totalHops);
  const hopMid = new Float32Array(totalHops);
  const hopHigh = new Float32Array(totalHops);

  let lpLow = 0;
  let lpMid = 0;

  for (let h = 0; h < totalHops; h++) {
    const startSample = h * hopSamples;
    const endSample = Math.min(totalSamples, startSample + hopSamples);
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
      hopLow[h] = Math.sqrt(sumLowSq / count);
      hopMid[h] = Math.sqrt(sumMidSq / count);
      hopHigh[h] = Math.sqrt(sumHighSq / count);
    }

    if (h > 0 && h % 1800 === 0) {
      onProgress?.({
        progress: 0.2 + (h / totalHops) * 0.35,
        stage: 'analyzingBands',
      });
      await nextFrame();
    }
  }

  // Normalize against 95th percentile
  const sampleLowArr = Array.from(hopLow);
  const sampleMidArr = Array.from(hopMid);
  const sampleHighArr = Array.from(hopHigh);
  const normLowDenom = Math.max(1e-4, percentile(sampleLowArr, 0.95));
  const normMidDenom = Math.max(1e-4, percentile(sampleMidArr, 0.95));
  const normHighDenom = Math.max(1e-4, percentile(sampleHighArr, 0.95));

  const nLow = new Float32Array(totalHops);
  const nMid = new Float32Array(totalHops);
  const nHigh = new Float32Array(totalHops);
  const nOverall = new Float32Array(totalHops);
  const fluxArr = new Float32Array(totalHops);

  for (let h = 0; h < totalHops; h++) {
    const l = Math.min(1.0, hopLow[h]! / normLowDenom);
    const m = Math.min(1.0, hopMid[h]! / normMidDenom);
    const hi = Math.min(1.0, hopHigh[h]! / normHighDenom);
    nLow[h] = l;
    nMid[h] = m;
    nHigh[h] = hi;
    nOverall[h] = Math.min(1.0, l * 0.45 + m * 0.35 + hi * 0.2);

    if (h > 0) {
      const dl = Math.max(0, l - nLow[h - 1]!);
      const dm = Math.max(0, m - nMid[h - 1]!);
      const dhi = Math.max(0, hi - nHigh[h - 1]!);
      fluxArr[h] = dl * 0.62 + dm * 0.26 + dhi * 0.12;
    }
  }

  // Stage 2: Aggregate 0.25s terrain slices & classify Calm / Groove / Drop sections
  const totalSlices = Math.max(16, Math.ceil(durationSec / SLICE_DURATION_SEC));
  const hopsPerSlice = Math.max(1, Math.round(SLICE_DURATION_SEC / hopSec)); // 12 or 13 hops
  const sliceOverall: number[] = new Array(totalSlices).fill(0);
  const sliceLow: number[] = new Array(totalSlices).fill(0);
  const sliceMid: number[] = new Array(totalSlices).fill(0);
  const sliceHigh: number[] = new Array(totalSlices).fill(0);

  for (let i = 0; i < totalSlices; i++) {
    const h0 = i * hopsPerSlice;
    const h1 = Math.min(totalHops, h0 + hopsPerSlice);
    let sl = 0;
    let sm = 0;
    let sh = 0;
    let cnt = 0;
    for (let h = h0; h < h1; h++) {
      sl += nLow[h]!;
      sm += nMid[h]!;
      sh += nHigh[h]!;
      cnt++;
    }
    if (cnt > 0) {
      sliceLow[i] = sl / cnt;
      sliceMid[i] = sm / cnt;
      sliceHigh[i] = sh / cnt;
      sliceOverall[i] = Math.min(1.0, sliceLow[i]! * 0.45 + sliceMid[i]! * 0.35 + sliceHigh[i]! * 0.2);
    }
  }

  const rollingEnergy: number[] = new Array(totalSlices).fill(0);
  const windowRadius = 6; // ±1.5s
  for (let i = 0; i < totalSlices; i++) {
    let sum = 0;
    let cnt = 0;
    for (let k = Math.max(0, i - windowRadius); k <= Math.min(totalSlices - 1, i + windowRadius); k++) {
      sum += sliceOverall[k]!;
      cnt++;
    }
    rollingEnergy[i] = cnt > 0 ? sum / cnt : 0.2;
  }

  const calmThreshold = Math.max(0.22, Math.min(0.44, percentile(rollingEnergy, 0.32)));
  const dropThreshold = Math.max(calmThreshold + 0.13, Math.min(0.75, percentile(rollingEnergy, 0.67)));

  const sectionCounts: Record<SectionIntensity, number> = { calm: 0, groove: 0, drop: 0 };
  const sliceIntensity: SectionIntensity[] = new Array(totalSlices).fill('groove');
  const sliceBand: ResonanceFormType[] = new Array(totalSlices).fill('synth');

  for (let i = 0; i < totalSlices; i++) {
    const l = sliceLow[i]!;
    const m = sliceMid[i]!;
    const hi = sliceHigh[i]!;
    sliceBand[i] = l >= m && l >= hi ? 'bass' : m >= hi ? 'synth' : 'treble';

    const roll = rollingEnergy[i]!;
    const inten: SectionIntensity =
      roll >= dropThreshold ? 'drop' : roll >= calmThreshold ? 'groove' : 'calm';
    sliceIntensity[i] = inten;
    sectionCounts[inten]++;
  }

  // Exact 20ms peak-picking for musical beat onsets
  const minBeatGapSec = difficulty === 'hard' ? 0.2 : difficulty === 'easy' ? 0.36 : 0.27;
  const minBeatGapHops = Math.max(2, Math.round(minBeatGapSec / hopSec));
  const fluxGate = difficulty === 'hard' ? 0.055 : difficulty === 'easy' ? 0.085 : 0.068;

  const beatEvents: BeatEvent[] = [];
  const sliceHasBeat = new Set<number>();
  let lastBeatHop = -minBeatGapHops;

  for (let h = Math.round(0.8 / hopSec); h < totalHops - Math.round(1.0 / hopSec); h++) {
    if (h - lastBeatHop < minBeatGapHops) continue;
    const f = fluxArr[h]!;
    if (f < fluxGate) continue;

    // Local flux peak within ±1 hop (20ms precision!)
    if (f < fluxArr[h - 1]! || f < fluxArr[h + 1]!) continue;

    // Compare against local ±0.4s flux background
    let localSum = 0;
    let localCnt = 0;
    for (let k = Math.max(1, h - 20); k <= Math.min(totalHops - 1, h + 20); k++) {
      localSum += fluxArr[k]!;
      localCnt++;
    }
    const localMean = localCnt > 0 ? localSum / localCnt : 0;
    if (f < localMean * 1.45 + 0.024) continue;

    lastBeatHop = h;
    const timeSec = Number((h * hopSec).toFixed(3));
    const sIdx = Math.min(totalSlices - 1, Math.floor(timeSec / SLICE_DURATION_SEC));
    sliceHasBeat.add(sIdx);

    const l = nLow[h]!;
    const m = nMid[h]!;
    const hi = nHigh[h]!;
    const band: ResonanceFormType = l >= m && l >= hi ? 'bass' : m >= hi ? 'synth' : 'treble';

    beatEvents.push({
      timeSec,
      worldX: timeSec * worldPxPerSec,
      strength: Math.min(1.0, f * 3.2 + nOverall[h]! * 0.35),
      band,
      intensity: sliceIntensity[sIdx] ?? 'groove',
    });
  }

  const slices: AudioSlice[] = [];
  for (let i = 0; i < totalSlices; i++) {
    slices.push({
      index: i,
      timeSec: i * SLICE_DURATION_SEC,
      worldX0: i * segWidth,
      worldX1: (i + 1) * segWidth,
      low: sliceLow[i]!,
      mid: sliceMid[i]!,
      high: sliceHigh[i]!,
      overall: sliceOverall[i]!,
      dominantBand: sliceBand[i]!,
      intensity: sliceIntensity[i]!,
      isBeatOnset: sliceHasBeat.has(i),
    });
  }

  onProgress?.({ progress: 0.65, stage: 'buildingWaveform' });
  await nextFrame();

  // Stage 3: Build Grounded Multi-Deck Running Road + Chasm Gaps (`isGap`)
  const deckHeights: [number, number, number] = [506, 466, 426]; // Low / Mid / High ground road Y
  const segments: BezierSegment[] = [];

  // Lead-in segments covering [-LEAD_IN_SEGMENTS * segWidth .. 0] so cameraX < 0 at start is fully paved
  const startDeckY = deckHeights[0];
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

  // Decide phrase deck levels (every 12 slices = 3.0s) and chasm gap slices
  const totalWithRunway = totalSlices + 8;
  const sliceDeckLevel: Array<0 | 1 | 2> = new Array(totalWithRunway).fill(0);
  const gapSliceSet = new Set<number>();

  let curDeck: 0 | 1 | 2 = 0;
  const phraseLen = 12; // 3.0s solid running stretches!
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

  // Schedule Frequency Diving Portals first so gaps/traps never collide with portals
  const divingNodes: DivingNode[] = [];
  const portalWorldXs: number[] = [];
  let nextId = 1;
  let lastPortalSec = 8.0;

  for (let i = 36; i < totalSlices - 16; i++) {
    const sec = i * SLICE_DURATION_SEC;
    const prevInten = sliceIntensity[i - 1] ?? 'calm';
    const inten = sliceIntensity[i] ?? 'groove';
    const isUpgrade =
      (prevInten === 'calm' && inten !== 'calm') || (prevInten === 'groove' && inten === 'drop');

    if (sec - lastPortalSec >= 18.0 || (isUpgrade && sec - lastPortalSec >= 11.5)) {
      lastPortalSec = sec;
      const deckY = deckHeights[sliceDeckLevel[i] ?? 0];
      const wx = (i + 0.5) * segWidth;
      portalWorldXs.push(wx);
      divingNodes.push({
        id: nextId++,
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

  // Schedule Abyss Chasm Gaps (`isGap: true`, 2 slices = 0.50s wide) at energetic beat transitions
  const minGapIntervalSlices = difficulty === 'hard' ? 11 : difficulty === 'easy' ? 20 : 14;
  let lastGapSlice = 10;
  for (let i = 16; i < totalSlices - 12; i++) {
    if (i - lastGapSlice < minGapIntervalSlices) continue;
    const inten = sliceIntensity[i] ?? 'calm';
    if (inten === 'calm' && difficulty === 'easy') continue;
    if (!sliceHasBeat.has(i)) continue;
    const wx = i * segWidth;
    if (nearPortal(wx, 520)) continue;

    // Flatten deck level around the gap so takeoff and landing are clean and readable
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
    const targetY = deckHeights[level];
    const isGap = gapSliceSet.has(i);

    // Smooth 1-segment S-curve ramp when stepping between deck elevations; rock-solid flat road otherwise!
    const y0 = prevY;
    const y1 = targetY;
    const cx1 = x0 + segWidth * 0.38;
    const cy1 = y0;
    const cx2 = x0 + segWidth * 0.62;
    const cy2 = y1;

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

  onProgress?.({ progress: 0.85, stage: 'placingObjects' });
  await nextFrame();

  // Stage 4: Place Sky Platforms, 3 Track Gimmicks (JumpPads, DashRings, HoldRails), Beat Traps & Rhythm Notes
  const orbs: ResonanceOrb[] = [];
  const traps: BeatTrap[] = [];
  const skyPlatforms: SkyPlatform[] = [];
  const jumpPads: JumpPad[] = [];
  const dashRings: DashRing[] = [];
  const holdRails: HoldRail[] = [];

  // Track occupied X intervals on the ground so objects never overlap unfairly
  const occupiedGround: Array<[number, number]> = [];
  const isGroundBusy = (x0: number, x1: number): boolean =>
    occupiedGround.some(([a, b]) => x0 <= b && x1 >= a);
  const reserveGround = (x0: number, x1: number): void => {
    occupiedGround.push([x0, x1]);
  };

  // 4A. Equip every Abyss Chasm Gap with either a Takeoff Jump Pad OR an Airborne Dash Ring + Jump Guide Arc!
  let gapPatternToggle = 0;
  for (let i = 16; i < totalSlices - 12; i++) {
    if (!gapSliceSet.has(i) || gapSliceSet.has(i - 1)) continue;
    const gapStartX = i * segWidth;
    const gapEndX = (i + 2) * segWidth;
    const gapSpan = gapEndX - gapStartX;
    const { y: takeoffY, seg } = floorAtWorldX(gapStartX - 16);
    const band = seg.energyBand;
    reserveGround(gapStartX - 110, gapEndX + 95);

    if (gapPatternToggle % 2 === 0) {
      // Airborne Dash Ring suspended above the chasm!
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
      // Trail of 3 airborne notes out of the Dash Ring
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
      // Beat Jump Pad right at the chasm takeoff edge!
      const padX = gapStartX - 28;
      jumpPads.push({
        id: nextId++,
        worldX: padX,
        worldY: takeoffY,
        timeSec: padX / worldPxPerSec,
        triggered: false,
      });
      // High parabolic arc of 4 rhythm notes soaring across the chasm
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

  // 4B. Place 2nd-Floor Sky Platforms (`SkyPlatform`) preceded by a Beat Jump Pad & topped with Hold Rails or Beat Notes
  let lastSkyEndX = 1100;
  const minSkyGapPx = difficulty === 'hard' ? 1450 : difficulty === 'easy' ? 2200 : 1750;

  for (const beat of beatEvents) {
    if (beat.timeSec < 3.2 || beat.timeSec > durationSec - 4.0) continue;
    if (beat.intensity === 'calm') continue;
    if (beat.worldX < lastSkyEndX + minSkyGapPx) continue;

    const padX = beat.worldX;
    const platStartX = padX + worldPxPerSec * 0.34;
    const platDurationSec = beat.intensity === 'drop' ? 2.2 : 1.75;
    const platEndX = platStartX + worldPxPerSec * platDurationSec;

    if (nearPortal(padX, 450) || nearPortal(platEndX, 450)) continue;
    if (isGroundBusy(padX - 90, platStartX + 80)) continue;
    const { y: padFloorY, isGap } = floorAtWorldX(padX);
    if (isGap) continue;

    const skyY = Math.max(220, padFloorY - 142);
    reserveGround(padX - 80, padX + 110);
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

    // Alternate between a sustained Hold Note Rail on the Sky Platform vs a rhythmic Beat Note chain + Exit Dash Ring!
    if (skyPlatforms.length % 2 === 1) {
      const railX0 = platStartX + 45;
      const railX1 = platEndX - 55;
      holdRails.push({
        id: nextId++,
        x0: railX0,
        x1: railX1,
        worldY: skyY - 26,
        band: beat.band,
        active: false,
        completed: false,
      });
    } else {
      const skyBeats = beatEvents.filter(
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

      // Exit Airborne Dash Ring off the end of 2F Sky Platform in Drop sections!
      if (beat.intensity === 'drop' && !nearPortal(platEndX + 80, 340)) {
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

  // 4C. Place Ground Hold Note Rails on clean flat sprint sections
  let lastGroundRailEndX = 700;
  for (const beat of beatEvents) {
    if (beat.timeSec < 2.2 || beat.timeSec > durationSec - 3.0) continue;
    if (beat.worldX < lastGroundRailEndX + 1900) continue;
    const railLenPx = worldPxPerSec * (beat.intensity === 'drop' ? 0.95 : 1.15);
    const rx0 = beat.worldX;
    const rx1 = rx0 + railLenPx;

    if (nearPortal(rx0, 380) || nearPortal(rx1, 380)) continue;
    if (isGroundBusy(rx0 - 90, rx1 + 90)) continue;

    // Ensure the road is flat and gap-free across [rx0, rx1]
    const f0 = floorAtWorldX(rx0);
    const fMid = floorAtWorldX((rx0 + rx1) * 0.5);
    const f1 = floorAtWorldX(rx1);
    if (f0.isGap || fMid.isGap || f1.isGap) continue;
    if (Math.abs(f0.y - f1.y) > 8) continue;

    reserveGround(rx0 - 60, rx1 + 60);
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

  // 4D. Place Beat Traps & On-Beat Rhythm Target Notes across remaining BeatEvents
  const minTrapGapPx =
    difficulty === 'hard' ? 430 : difficulty === 'easy' ? 760 : 560;
  let lastTrapX = 450;
  let lastNoteX = 220;

  for (let bIdx = 0; bIdx < beatEvents.length; bIdx++) {
    const beat = beatEvents[bIdx]!;
    if (beat.timeSec < 1.4 || beat.timeSec > durationSec - 1.8) continue;
    const wx = beat.worldX;
    if (nearPortal(wx, 280)) continue;

    const { y: floorY, isGap } = floorAtWorldX(wx);
    if (isGap) continue;
    if (isGroundBusy(wx - 55, wx + 55)) continue;

    const canSpawnTrap =
      wx - lastTrapX >= minTrapGapPx &&
      beat.strength >= (difficulty === 'easy' ? 0.56 : 0.42) &&
      !floorAtWorldX(wx - 90).isGap &&
      !floorAtWorldX(wx + 90).isGap;

    if (canSpawnTrap && bIdx % (difficulty === 'easy' ? 3 : 2) === 0) {
      lastTrapX = wx;
      reserveGround(wx - 75, wx + 75);
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

      // Place a 3-note jump arc above the Beat Trap with an on-beat apex target!
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

    // Otherwise place a crisp On-Beat Rhythm Target Note (ground sprint note or low jump note)
    const minNoteSpacing = difficulty === 'hard' ? 115 : difficulty === 'easy' ? 195 : 145;
    if (wx - lastNoteX >= minNoteSpacing) {
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

  // Sort entities by X for clean left-to-right streaming
  orbs.sort((a, b) => a.worldX - b.worldX);
  traps.sort((a, b) => a.worldX - b.worldX);
  jumpPads.sort((a, b) => a.worldX - b.worldX);
  dashRings.sort((a, b) => a.worldX - b.worldX);
  skyPlatforms.sort((a, b) => a.x0 - b.x0);
  holdRails.sort((a, b) => a.x0 - b.x0);

  const blueprint: TrackBlueprint = {
    trackId: track.id,
    difficulty,
    durationSec,
    referenceHeight: REFERENCE_HEIGHT,
    worldPxPerSec,
    segmentWidth: segWidth,
    leadInSegments: LEAD_IN_SEGMENTS,
    slices,
    segments,
    orbs,
    traps,
    divingNodes,
    skyPlatforms,
    jumpPads,
    dashRings,
    holdRails,
    sectionCounts,
    totalBeats: beatEvents.length,
  };

  blueprintCache.set(cacheKey, blueprint);
  onProgress?.({ progress: 1.0, stage: 'ready', blueprint });
  return blueprint;
}
