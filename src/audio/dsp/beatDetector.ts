import type {
  AudioSlice,
  LoadingProgress,
  ResonanceFormType,
  SectionIntensity,
} from '../../types/game';

export const SLICE_DURATION_SEC = 0.25;
const HOP_DURATION_SEC = 0.02; // 20ms (50 Hz) resolution for sub-20ms beat onset precision

export interface DifficultyDspTuning {
  minBeatGapSec: number;
  fluxGate: number;
}

export interface DetectedBeatEvent {
  timeSec: number;
  worldX: number;
  strength: number;
  band: ResonanceFormType;
  intensity: SectionIntensity;
}

export interface DspAnalysisResult {
  durationSec: number;
  totalSlices: number;
  slices: AudioSlice[];
  beatEvents: DetectedBeatEvent[];
  sliceHasBeat: Set<number>;
  sliceIntensity: SectionIntensity[];
  sliceBand: ResonanceFormType[];
  sectionCounts: Record<SectionIntensity, number>;
}

export function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });
}

function percentile(values: ArrayLike<number>, q: number): number {
  if (values.length === 0) return 1;
  const sorted = Array.from(values).sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * q)));
  return sorted[idx] || 1;
}

function dominantBandOf(low: number, mid: number, high: number): ResonanceFormType {
  return low >= mid && low >= high ? 'bass' : mid >= high ? 'synth' : 'treble';
}

/**
 * Stage 1 & 2 DSP Pipeline:
 * - Extracts 20ms 3-band (Low / Mid / High) RMS envelopes via lightweight IIR filters
 * - Normalizes bands against their 95th percentile for loudness-agnostic mapping
 * - Classifies 0.25s slices into `calm` / `groove` / `drop` energy sections
 * - Detects musical beat onsets via local spectral-flux peak picking
 */
export async function extractAudioSlicesAndBeats(
  buffer: AudioBuffer,
  worldPxPerSec: number,
  tuning: DifficultyDspTuning,
  onProgress?: (status: LoadingProgress) => void
): Promise<DspAnalysisResult> {
  const segWidth = worldPxPerSec * SLICE_DURATION_SEC;
  const sampleRate = buffer.sampleRate;
  const totalSamples = buffer.length;
  const durationSec = buffer.duration;
  const ch0 = buffer.getChannelData(0);
  const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null;

  const hopSamples = Math.max(1, Math.floor(sampleRate * HOP_DURATION_SEC));
  const totalHops = Math.max(32, Math.ceil(durationSec / HOP_DURATION_SEC));

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

  const normLowDenom = Math.max(1e-4, percentile(hopLow, 0.95));
  const normMidDenom = Math.max(1e-4, percentile(hopMid, 0.95));
  const normHighDenom = Math.max(1e-4, percentile(hopHigh, 0.95));

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

  const totalSlices = Math.max(16, Math.ceil(durationSec / SLICE_DURATION_SEC));
  const hopsPerSlice = Math.max(1, Math.round(SLICE_DURATION_SEC / HOP_DURATION_SEC));
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
      sliceOverall[i] = Math.min(
        1.0,
        sliceLow[i]! * 0.45 + sliceMid[i]! * 0.35 + sliceHigh[i]! * 0.2
      );
    }
  }

  const rollingEnergy: number[] = new Array(totalSlices).fill(0);
  const windowRadius = 6; // ±1.5s
  for (let i = 0; i < totalSlices; i++) {
    let sum = 0;
    let cnt = 0;
    for (
      let k = Math.max(0, i - windowRadius);
      k <= Math.min(totalSlices - 1, i + windowRadius);
      k++
    ) {
      sum += sliceOverall[k]!;
      cnt++;
    }
    rollingEnergy[i] = cnt > 0 ? sum / cnt : 0.2;
  }

  const calmThreshold = Math.max(0.22, Math.min(0.44, percentile(rollingEnergy, 0.32)));
  const dropThreshold = Math.max(
    calmThreshold + 0.13,
    Math.min(0.75, percentile(rollingEnergy, 0.67))
  );

  const sectionCounts: Record<SectionIntensity, number> = { calm: 0, groove: 0, drop: 0 };
  const sliceIntensity: SectionIntensity[] = new Array(totalSlices).fill('groove');
  const sliceBand: ResonanceFormType[] = new Array(totalSlices).fill('synth');

  for (let i = 0; i < totalSlices; i++) {
    sliceBand[i] = dominantBandOf(sliceLow[i]!, sliceMid[i]!, sliceHigh[i]!);
    const roll = rollingEnergy[i]!;
    const inten: SectionIntensity =
      roll >= dropThreshold ? 'drop' : roll >= calmThreshold ? 'groove' : 'calm';
    sliceIntensity[i] = inten;
    sectionCounts[inten]++;
  }

  const minBeatGapHops = Math.max(2, Math.round(tuning.minBeatGapSec / HOP_DURATION_SEC));
  const beatEvents: DetectedBeatEvent[] = [];
  const sliceHasBeat = new Set<number>();
  let lastBeatHop = -minBeatGapHops;

  const startHop = Math.round(0.8 / HOP_DURATION_SEC);
  const endHop = totalHops - Math.round(1.0 / HOP_DURATION_SEC);

  for (let h = startHop; h < endHop; h++) {
    if (h - lastBeatHop < minBeatGapHops) continue;
    const f = fluxArr[h]!;
    if (f < tuning.fluxGate) continue;
    if (f < fluxArr[h - 1]! || f < fluxArr[h + 1]!) continue;

    let localSum = 0;
    let localCnt = 0;
    for (let k = Math.max(1, h - 20); k <= Math.min(totalHops - 1, h + 20); k++) {
      localSum += fluxArr[k]!;
      localCnt++;
    }
    const localMean = localCnt > 0 ? localSum / localCnt : 0;
    if (f < localMean * 1.45 + 0.024) continue;

    lastBeatHop = h;
    const timeSec = Number((h * HOP_DURATION_SEC).toFixed(3));
    const sIdx = Math.min(totalSlices - 1, Math.floor(timeSec / SLICE_DURATION_SEC));
    sliceHasBeat.add(sIdx);

    beatEvents.push({
      timeSec,
      worldX: timeSec * worldPxPerSec,
      strength: Math.min(1.0, f * 3.2 + nOverall[h]! * 0.35),
      band: dominantBandOf(nLow[h]!, nMid[h]!, nHigh[h]!),
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

  return {
    durationSec,
    totalSlices,
    slices,
    beatEvents,
    sliceHasBeat,
    sliceIntensity,
    sliceBand,
    sectionCounts,
  };
}
