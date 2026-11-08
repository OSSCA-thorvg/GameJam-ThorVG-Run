import type { TrackMetadata } from '../types/game';

export const BUILT_IN_TRACKS: TrackMetadata[] = [
  {
    id: 'cyber-pulse',
    title: 'Cyber Pulse (128 BPM)',
    artist: 'ThorVG Synth Engine',
    bpm: 128,
    durationSec: 45,
    isCustom: false,
  },
  {
    id: 'subatomic-rush',
    title: 'Subatomic Rush (140 BPM)',
    artist: 'ThorVG Resonance Lab',
    bpm: 140,
    durationSec: 45,
    isCustom: false,
  },
];

/**
 * Synthesizes a multi-band stereo AudioBuffer with distinct Low (20~250Hz),
 * Mid (250Hz~4kHz), and High (4kHz~20kHz) harmonic layers so Web Audio FFT
 * and BiquadFilterNode Acoustic Zoom work immediately with zero external asset dependencies.
 */
export function synthesizeTrackBuffer(
  ctx: BaseAudioContext,
  track: TrackMetadata
): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const duration = track.durationSec;
  const totalSamples = Math.floor(sampleRate * duration);
  const buffer = ctx.createBuffer(2, totalSamples, sampleRate);
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);

  const bpm = track.bpm;
  const beatDur = 60 / bpm;
  const sixteenthDur = beatDur / 4;

  // Musical scale frequencies (Mid arpeggio & bass root notes in minor pentatonic)
  const bassRoots =
    track.id === 'subatomic-rush'
      ? [55.0, 65.41, 73.42, 49.0] // A1, C2, D2, G1
      : [65.41, 58.27, 49.0, 55.0]; // C2, Bb1, G1, A1

  const midArpNotes =
    track.id === 'subatomic-rush'
      ? [440, 523.25, 659.25, 783.99, 880, 659.25, 587.33, 523.25]
      : [523.25, 659.25, 783.99, 1046.5, 783.99, 659.25, 1174.66, 1046.5];

  let noiseSeed = 1337;
  const nextNoise = () => {
    noiseSeed = (noiseSeed * 16807) % 2147483647;
    return (noiseSeed / 1073741823.5) - 1.0;
  };

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const beatIndex = Math.floor(t / beatDur);
    const beatPhase = (t % beatDur) / beatDur; // 0..1 within a quarter note
    const sixteenthIndex = Math.floor(t / sixteenthDur);
    const sixteenthPhase = (t % sixteenthDur) / sixteenthDur;
    const barIndex = Math.floor(beatIndex / 4);

    // Dynamic arrangement intensity (Intro -> Build-up -> Drop -> Outro)
    const sectionMod = (barIndex % 8) / 7;
    const isBuildUp = barIndex % 4 === 3;

    // 1. LOW BAND (20Hz ~ 250Hz): Punchy Kick Drum + Sub-Bass Saw/Sine
    const kickEnv = Math.exp(-beatPhase * 11.5);
    const kickFreq = 52 + 125 * Math.exp(-beatPhase * 28);
    const kickSample = Math.sin(2 * Math.PI * kickFreq * t) * kickEnv * 0.52;

    const rootFreq = bassRoots[barIndex % bassRoots.length]!;
    const subEnv = 0.35 + 0.65 * Math.sin(Math.PI * sixteenthPhase);
    const subSample =
      (Math.sin(2 * Math.PI * rootFreq * t) * 0.7 +
        Math.sin(2 * Math.PI * rootFreq * 2 * t) * 0.3) *
      subEnv *
      0.34;

    // 2. MID BAND (250Hz ~ 4kHz): Synth Arpeggio + Harmonic Chord Pad
    const arpFreq = midArpNotes[sixteenthIndex % midArpNotes.length]! * (isBuildUp ? 1.25 : 1.0);
    const arpEnv = Math.exp(-sixteenthPhase * 5.2);
    // Rich saw-like harmonic sum in 400Hz~2800Hz
    const arpSample =
      (Math.sin(2 * Math.PI * arpFreq * t) +
        0.5 * Math.sin(2 * Math.PI * arpFreq * 2 * t) +
        0.25 * Math.sin(2 * Math.PI * arpFreq * 3 * t)) *
      arpEnv *
      0.22;

    const padFreq = rootFreq * 8; // ~440Hz - 520Hz
    const padSample =
      (Math.sin(2 * Math.PI * padFreq * t) +
        Math.sin(2 * Math.PI * padFreq * 1.5 * t) * 0.6) *
      (0.08 + sectionMod * 0.06);

    // 3. HIGH BAND (4kHz ~ 20kHz): Crisp Metallic Hi-Hats & High FM Shimmer
    const isOffBeatHat = sixteenthIndex % 2 === 1 || isBuildUp;
    const hatDecay = isOffBeatHat ? 18.0 : 36.0;
    const hatEnv = Math.exp(-sixteenthPhase * hatDecay);
    const highCarrier = Math.sin(2 * Math.PI * 6400 * t + Math.sin(2 * Math.PI * 9100 * t) * 2.5);
    const hatSample = (nextNoise() * 0.6 + highCarrier * 0.4) * hatEnv * (isOffBeatHat ? 0.24 : 0.12);

    const shimmerSample =
      Math.sin(2 * Math.PI * (5200 + 1200 * Math.sin(t * 6)) * t) *
      Math.exp(-beatPhase * 6.0) *
      0.09;

    // Stereo imaging
    const pan = Math.sin(t * 2.5) * 0.15;
    const monoCore = kickSample + subSample;
    const stereoMid = arpSample + padSample;
    const stereoHigh = hatSample + shimmerSample;

    // Master soft-clipping limiter
    const rawL = monoCore + stereoMid * (1 - pan) + stereoHigh * (1 + pan);
    const rawR = monoCore + stereoMid * (1 + pan) + stereoHigh * (1 - pan);

    left[i] = Math.tanh(rawL * 1.15);
    right[i] = Math.tanh(rawR * 1.15);
  }

  return buffer;
}
