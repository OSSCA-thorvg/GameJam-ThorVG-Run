import React, { useMemo, useRef, useState } from 'react';
import {
  AudioLoadError,
  MAX_UPLOAD_MB,
  MIN_TRACK_SECONDS,
  buildAcceptAttribute,
  detectSupportedAudioFormats,
  formatLabels,
  type AudioFormat,
} from '../audio/audioFormats';
import { BUILT_IN_TRACKS } from '../audio/proceduralTracks';
import { trackArtist, trackTitle } from '../i18n/display';
import { useI18n } from '../i18n/I18nProvider';
import { LANGUAGE_LABELS, type Lang } from '../i18n/messages';
import {
  FORM_CONFIG,
  type RendererMode,
  type ResonanceFormType,
  type TrackMetadata,
} from '../types/game';

interface StartScreenProps {
  selectedTrack: TrackMetadata;
  customTracks: TrackMetadata[];
  rendererMode: RendererMode;
  previewForm: ResonanceFormType;
  engineReady: boolean;
  onSelectTrack: (track: TrackMetadata) => void;
  onUploadFile: (file: File, supportedFormats: readonly AudioFormat[]) => Promise<void>;
  onSelectRenderer: (mode: RendererMode) => void;
  onSelectPreviewForm: (form: ResonanceFormType) => void;
  onStartRun: () => void;
}

const LANGS: Lang[] = ['en', 'ko'];

export const StartScreen: React.FC<StartScreenProps> = ({
  selectedTrack,
  customTracks,
  rendererMode,
  previewForm,
  engineReady,
  onSelectTrack,
  onUploadFile,
  onSelectRenderer,
  onSelectPreviewForm,
  onStartRun,
}) => {
  const { lang, setLang, t, format } = useI18n();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);

  // Formats this browser can decode. Drives the hint, the picker filter, and validation.
  const supportedFormats = useMemo(() => detectSupportedAudioFormats(), []);
  const supportedList = supportedFormats.length > 0 ? formatLabels(supportedFormats) : '—';
  const acceptAttr = useMemo(() => buildAcceptAttribute(supportedFormats), [supportedFormats]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0]!;
    const extraNote = files.length > 1 ? ` ${t.upload.firstOnly}` : '';
    setUploadStatus(format(t.upload.analyzing, { name: file.name }));
    try {
      await onUploadFile(file, supportedFormats);
      setUploadStatus(format(t.upload.loaded, { name: file.name }) + extraNote);
    } catch (err) {
      const code = err instanceof AudioLoadError ? err.code : 'decode_failed';
      setUploadStatus(
        format(t.upload.errors[code], {
          list: supportedList,
          minSeconds: MIN_TRACK_SECONDS,
          maxMb: MAX_UPLOAD_MB,
        }) + extraNote
      );
    }
  };

  const allTracks = [...BUILT_IN_TRACKS, ...customTracks];

  return (
    <div
      className="start-screen-backdrop"
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        void handleFiles(e.dataTransfer.files);
      }}
    >
      <div className={`start-card ${isDragging ? 'dragging' : ''}`}>
        <header className="start-header">
          <div>
            <span className="badge-version">{t.menu.versionBadge}</span>
            <h1 className="title-logo">THORVG RUN</h1>
            <p className="subtitle">{t.menu.subtitle}</p>
          </div>
          <div className="header-actions">
            <div className="lang-toggle" role="group" aria-label={t.menu.language}>
              {LANGS.map((code) => (
                <button
                  key={code}
                  type="button"
                  lang={code}
                  className={`lang-btn ${lang === code ? 'active' : ''}`}
                  aria-pressed={lang === code}
                  onClick={() => setLang(code)}
                >
                  {LANGUAGE_LABELS[code]}
                </button>
              ))}
            </div>
            <a
              href="https://github.com/OSSCA-thorvg/GameJam-ThorVG-Run"
              target="_blank"
              rel="noreferrer"
              className="github-link"
            >
              {t.menu.github}
            </a>
          </div>
        </header>

        {/* 1. Select Track */}
        <section className="menu-section">
          <h2>{t.menu.trackSection}</h2>
          <div className="track-list">
            {allTracks.map((track, idx) => {
              const isSelected = selectedTrack.id === track.id;
              const title = trackTitle(t, track);
              return (
                <button
                  key={track.id}
                  type="button"
                  className={`track-item ${isSelected ? 'selected' : ''}`}
                  onClick={() => onSelectTrack(track)}
                >
                  <span className="track-icon">{track.isCustom ? '📂' : '🎵'}</span>
                  <div className="track-meta">
                    <strong>
                      {track.isCustom
                        ? format(t.menu.customTrack, { title })
                        : format(t.menu.builtInTrack, { index: idx + 1, title })}
                    </strong>
                    <span>
                      {format(t.menu.trackMeta, {
                        artist: trackArtist(t, track),
                        seconds: track.durationSec,
                      })}
                    </span>
                  </div>
                  {isSelected && <span className="selected-pill">{t.menu.selected}</span>}
                </button>
              );
            })}
          </div>

          <div className="upload-dropzone" onClick={() => fileInputRef.current?.click()}>
            <input
              ref={fileInputRef}
              type="file"
              accept={acceptAttr}
              style={{ display: 'none' }}
              onChange={(e) => {
                void handleFiles(e.target.files);
                // Allow re-selecting the same file after an error.
                e.target.value = '';
              }}
            />
            <span>{t.upload.dropzone}</span>
            <small className="upload-formats">{t.upload.addMoreGuide}</small>
            <small className="upload-formats">
              {supportedFormats.length > 0
                ? format(t.upload.supported, { list: supportedList })
                : t.upload.noneSupported}
            </small>
            <small className="upload-formats">
              {format(t.upload.limits, { maxMb: MAX_UPLOAD_MB, minSeconds: MIN_TRACK_SECONDS })}
            </small>
            {uploadStatus && <small className="upload-status">{uploadStatus}</small>}
          </div>
        </section>

        {/* 2. Select Renderer Backend */}
        <section className="menu-section">
          <h2>{t.menu.rendererSection}</h2>
          <div className="renderer-radio-group">
            <label
              className={`renderer-option ${rendererMode === 'sw' ? 'selected' : ''}`}
              onClick={() => onSelectRenderer('sw')}
            >
              <input
                type="radio"
                name="renderer"
                checked={rendererMode === 'sw'}
                onChange={() => onSelectRenderer('sw')}
              />
              <span className="radio-dot" />
              <div className="renderer-info">
                <strong>{t.menu.rendererCpuTitle}</strong>
                <span>{t.menu.rendererCpuDesc}</span>
              </div>
            </label>

            <label
              className={`renderer-option ${rendererMode === 'gl' ? 'selected' : ''}`}
              onClick={() => onSelectRenderer('gl')}
            >
              <input
                type="radio"
                name="renderer"
                checked={rendererMode === 'gl'}
                onChange={() => onSelectRenderer('gl')}
              />
              <span className="radio-dot" />
              <div className="renderer-info">
                <strong>{t.menu.rendererGpuTitle}</strong>
                <span>{t.menu.rendererGpuDesc}</span>
              </div>
            </label>
          </div>
        </section>

        {/* 3. Resonance Form Preview */}
        <section className="menu-section">
          <h2>{t.menu.formSection}</h2>
          <div className="form-preview-tabs">
            {(['bass', 'synth', 'treble'] as ResonanceFormType[]).map((f) => {
              const cfg = FORM_CONFIG[f];
              const text = t.forms[f];
              const active = previewForm === f;
              return (
                <button
                  key={f}
                  type="button"
                  className={`form-tab ${active ? 'active' : ''}`}
                  style={{ borderColor: active ? cfg.colorHex : undefined }}
                  onClick={() => onSelectPreviewForm(f)}
                >
                  <strong style={{ color: cfg.colorHex }}>{text.name}</strong>
                  <small>{text.band}</small>
                  <span>{text.skillName}</span>
                </button>
              );
            })}
          </div>
        </section>

        <footer className="start-footer">
          <button
            type="button"
            className="start-run-btn"
            disabled={!engineReady}
            onClick={onStartRun}
          >
            {engineReady ? t.menu.start : t.menu.initializing}
          </button>
          <div className="controls-hint">
            <span>
              <strong>{t.menu.controls.jumpKey}</strong>: {t.menu.controls.jumpDesc}
            </span>
            <span>
              <strong>{t.menu.controls.skillKey}</strong>: {t.menu.controls.skillDesc}
            </span>
            <span>
              <strong>{t.menu.controls.swapKey}</strong>: {t.menu.controls.swapDesc}
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
};
