import type { BannerMessage, TrackMetadata } from '../types/game';
import { formatMessage, type Messages } from './messages';

/** Resolves a language-agnostic engine banner into localized text. */
export function resolveBanner(t: Messages, banner: BannerMessage): string {
  const form = banner.params?.form;
  const formText = form ? t.forms[form] : null;
  const bonusVal = banner.params?.bonus;
  return formatMessage(t.banner[banner.key], {
    form: formText?.name ?? '',
    band: formText?.band ?? '',
    count: banner.params?.count ?? 0,
    collected: banner.params?.collected ?? 0,
    total: banner.params?.total ?? 3,
    hits: banner.params?.hits ?? 0,
    bonus: bonusVal !== undefined ? bonusVal.toLocaleString() : 0,
    seconds: banner.params?.seconds ?? 0,
    mult: banner.params?.mult ?? 1,
    hp: banner.params?.hp ?? 0,
  });
}

type BuiltInTrackId = Exclude<keyof Messages['tracks'], 'defaultArtist' | 'customArtist'>;

function isBuiltInTrackId(t: Messages, id: string): id is BuiltInTrackId {
  return (
    id !== 'defaultArtist' &&
    id !== 'customArtist' &&
    Object.prototype.hasOwnProperty.call(t.tracks, id)
  );
}

/** Built-in tracks use the localized dictionary name; custom tracks keep their file name. */
export function trackTitle(t: Messages, track: TrackMetadata): string {
  if (!track.isCustom && isBuiltInTrackId(t, track.id)) {
    return t.tracks[track.id];
  }
  return track.title;
}

export function trackArtist(t: Messages, track: TrackMetadata): string {
  return track.isCustom ? t.tracks.customArtist : t.tracks.defaultArtist;
}
