import defaultTrackUrl from '../asset/music/맨스티어_AK47.mp3?url';
import type { TrackMetadata } from '../types/game';

export const BUILT_IN_TRACKS: TrackMetadata[] = [
  {
    id: 'mens-tear-ak47',
    title: 'Mens Tear - AK47',
    artist: 'Mens Tear',
    bpm: 128,
    durationSec: 167,
    isCustom: false,
    assetUrl: defaultTrackUrl,
  },
];

/**
 * Minimal silent safety buffer used only if neither `assetUrl` nor an uploaded `File` is provided.
 */
export function createFallbackBuffer(ctx: BaseAudioContext, durationSec: number): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const totalSamples = Math.max(1, Math.floor(sampleRate * Math.max(1, durationSec)));
  return ctx.createBuffer(2, totalSamples, sampleRate);
}
