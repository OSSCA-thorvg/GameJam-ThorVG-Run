import type { BannerMessage, TrackMetadata } from '../types/game';
import { formatMessage, type Messages } from './messages';

/** Resolves a language-agnostic engine banner into localized text. */
export function resolveBanner(t: Messages, banner: BannerMessage): string {
  const form = banner.params?.form;
  const formText = form ? t.forms[form] : null;
  return formatMessage(t.banner[banner.key], {
    form: formText?.name ?? '',
    skill: formText?.skillName ?? '',
    band: formText?.band ?? '',
    count: banner.params?.count ?? 0,
  });
}

type BuiltInTrackId = Exclude<keyof Messages['tracks'], 'customArtist'>;

function isBuiltInTrackId(t: Messages, id: string): id is BuiltInTrackId {
  return id !== 'customArtist' && Object.prototype.hasOwnProperty.call(t.tracks, id);
}

/** Built-in tracks use the localized dictionary name; custom tracks keep their file name. */
export function trackTitle(t: Messages, track: TrackMetadata): string {
  if (!track.isCustom && isBuiltInTrackId(t, track.id)) {
    return t.tracks[track.id];
  }
  return track.title;
}

export function trackArtist(t: Messages, track: TrackMetadata): string {
  return track.isCustom ? t.tracks.customArtist : track.artist;
}
