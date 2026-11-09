/**
 * Single source of truth for user-uploadable audio formats.
 *
 * Uploaded files are decoded by the browser (`AudioContext.decodeAudioData`), so the
 * real set of supported formats depends on the browser. We keep a candidate list here
 * and ask the browser which ones it can play via `canPlayType`. The upload hint, the
 * file picker `accept` filter, and validation all derive from this module.
 */

export interface AudioFormat {
  id: string;
  label: string;
  extensions: readonly string[];
  mimeTypes: readonly string[];
  /** MIME string passed to `canPlayType` (may include a codecs parameter). */
  probe: string;
}

export const AUDIO_FORMATS: readonly AudioFormat[] = [
  { id: 'mp3', label: 'MP3', extensions: ['.mp3'], mimeTypes: ['audio/mpeg', 'audio/mp3'], probe: 'audio/mpeg' },
  { id: 'wav', label: 'WAV', extensions: ['.wav'], mimeTypes: ['audio/wav', 'audio/x-wav', 'audio/wave', 'audio/vnd.wave'], probe: 'audio/wav' },
  { id: 'aac', label: 'AAC/M4A', extensions: ['.m4a', '.aac'], mimeTypes: ['audio/mp4', 'audio/x-m4a', 'audio/aac'], probe: 'audio/mp4; codecs="mp4a.40.2"' },
  { id: 'flac', label: 'FLAC', extensions: ['.flac'], mimeTypes: ['audio/flac', 'audio/x-flac'], probe: 'audio/flac' },
  { id: 'ogg', label: 'OGG', extensions: ['.ogg', '.oga'], mimeTypes: ['audio/ogg'], probe: 'audio/ogg; codecs="vorbis"' },
  { id: 'opus', label: 'OPUS', extensions: ['.opus'], mimeTypes: ['audio/opus'], probe: 'audio/ogg; codecs="opus"' },
  { id: 'webm', label: 'WEBM', extensions: ['.webm'], mimeTypes: ['audio/webm'], probe: 'audio/webm; codecs="opus"' },
];

export const MAX_UPLOAD_MB = 50;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
export const MIN_TRACK_SECONDS = 5;

/** Returns the formats this browser reports it can play. Empty outside a browser. */
export function detectSupportedAudioFormats(): AudioFormat[] {
  if (typeof document === 'undefined') return [];
  const probe = document.createElement('audio');
  if (typeof probe.canPlayType !== 'function') return [];
  return AUDIO_FORMATS.filter((f) => probe.canPlayType(f.probe) !== '');
}

/** Builds the `<input type="file" accept>` value from the given formats. */
export function buildAcceptAttribute(formats: readonly AudioFormat[]): string {
  const parts = formats.flatMap((f) => [...f.extensions, ...f.mimeTypes]);
  return Array.from(new Set(parts)).join(',');
}

export function formatLabels(formats: readonly AudioFormat[]): string {
  return formats.map((f) => f.label).join(', ');
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot).toLowerCase() : '';
}

/**
 * Matches a file against the given formats. The extension is checked first because
 * browsers often leave `File.type` empty or generic; the MIME type is a fallback.
 */
export function matchAudioFormat(file: File, formats: readonly AudioFormat[]): AudioFormat | null {
  const ext = extensionOf(file.name);
  if (ext) {
    const byExt = formats.find((f) => f.extensions.includes(ext));
    if (byExt) return byExt;
  }
  const mime = file.type.split(';')[0]!.trim().toLowerCase();
  if (mime) {
    const byMime = formats.find((f) => f.mimeTypes.includes(mime));
    if (byMime) return byMime;
  }
  return null;
}

/** Removes a known audio extension from a file name for display. */
export function stripAudioExtension(name: string): string {
  const ext = extensionOf(name);
  const known = AUDIO_FORMATS.some((f) => f.extensions.includes(ext));
  return known ? name.slice(0, name.length - ext.length) : name;
}

export type AudioLoadErrorCode = 'too_large' | 'unsupported' | 'decode_failed' | 'too_short';

export class AudioLoadError extends Error {
  readonly code: AudioLoadErrorCode;

  constructor(code: AudioLoadErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'AudioLoadError';
    this.code = code;
  }
}
