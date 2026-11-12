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
import { getTrackRecord } from '../engine/recordsStore';
import { trackArtist, trackTitle } from '../i18n/display';
import { useI18n } from '../i18n/I18nProvider';
import { LANGUAGE_LABELS, type Lang } from '../i18n/messages';
import {
  CREWMATE_SKIN_CONFIG,
  CREWMATE_SKIN_ORDER,
  FORM_CONFIG,
  type CrewmateSkinId,
  type DifficultyMode,
  type RendererMode,
  type ResonanceFormType,
  type TrackMetadata,
} from '../types/game';

interface StartScreenProps {
  selectedTrack: TrackMetadata;
  customTracks: TrackMetadata[];
  rendererMode: RendererMode;
  playstyle: ResonanceFormType;
  difficulty: DifficultyMode;
  selectedSkin: CrewmateSkinId;
  unlockedSkins: CrewmateSkinId[];
  engineReady: boolean;
  onSelectTrack: (track: TrackMetadata) => void;
  onUploadFile: (file: File, supportedFormats: readonly AudioFormat[]) => Promise<void>;
  onSelectRenderer: (mode: RendererMode) => void;
  onSelectPlaystyle: (style: ResonanceFormType) => void;
  onSelectDifficulty: (difficulty: DifficultyMode) => void;
  onSelectSkin: (skin: CrewmateSkinId) => void;
  onStartRun: () => void;
}

const LANGS: Lang[] = ['en', 'ko'];

const DIFFICULTY_ACCENTS: Record<DifficultyMode, string> = {
  easy: '#05D5FF',
  normal: '#FFE600',
  hard: '#FF2A6D',
};

export const StartScreen: React.FC<StartScreenProps> = ({
  selectedTrack,
  customTracks,
  rendererMode,
  playstyle,
  difficulty,
  selectedSkin,
  unlockedSkins,
  engineReady,
  onSelectTrack,
  onUploadFile,
  onSelectRenderer,
  onSelectPlaystyle,
  onSelectDifficulty,
  onSelectSkin,
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
              const rec = getTrackRecord(track, difficulty);
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
                  {rec && (
                    <div className="track-record-badges">
                      <span className="pb-pill">
                        {format(t.menu.bestRecord, {
                          rank: rec.bestRank,
                          score: rec.bestScore.toLocaleString(),
                        })}
                      </span>
                      <span className="pb-stars-pill">★ {rec.bestStars}/3</span>
                      {rec.noMissCleared && (
                        <span className="pb-nomiss-pill">{t.menu.noMissBadge}</span>
                      )}
                    </div>
                  )}
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
            <small className="upload-formats">
              {supportedFormats.length > 0
                ? format(t.upload.compactHint, {
                    list: supportedList,
                    maxMb: MAX_UPLOAD_MB,
                    minSeconds: MIN_TRACK_SECONDS,
                  })
                : t.upload.noneSupported}
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

        {/* 3. Select Crewmate Playstyle */}
        <section className="menu-section">
          <h2>{t.menu.formSection}</h2>
          <div className="playstyle-tabs" role="radiogroup" aria-label={t.menu.formSection}>
            {(['bass', 'synth', 'treble'] as ResonanceFormType[]).map((styleKey) => {
              const accent = FORM_CONFIG[styleKey].colorHex;
              const info = t.forms[styleKey];
              const active = playstyle === styleKey;
              return (
                <button
                  key={styleKey}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  data-testid={`playstyle-tab-${styleKey}`}
                  data-playstyle={styleKey}
                  className={`playstyle-tab ${active ? 'active' : ''}`}
                  style={{
                    borderColor: active ? accent : undefined,
                    boxShadow: active ? `0 0 18px ${accent}33` : undefined,
                  }}
                  onClick={() => onSelectPlaystyle(styleKey)}
                >
                  <div className="playstyle-tab-header">
                    <strong style={{ color: accent }}>{info.name}</strong>
                    <small
                      className="playstyle-skill-pill"
                      style={{
                        color: accent,
                        borderColor: `${accent}55`,
                        backgroundColor: `${accent}18`,
                      }}
                    >
                      {info.skillName}
                    </small>
                  </div>
                  <span>{info.skillDesc}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* 4. Select Difficulty & Rhythm Speed */}
        <section className="menu-section">
          <h2>{t.menu.difficultySection}</h2>
          <div className="difficulty-tabs" role="radiogroup" aria-label={t.menu.difficultySection}>
            {(['easy', 'normal', 'hard'] as DifficultyMode[]).map((modeKey) => {
              const accent = DIFFICULTY_ACCENTS[modeKey];
              const info = t.difficulties[modeKey];
              const active = difficulty === modeKey;
              const modeRec = getTrackRecord(selectedTrack, modeKey);
              return (
                <button
                  key={modeKey}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  data-difficulty={modeKey}
                  className={`difficulty-tab ${active ? 'active' : ''}`}
                  style={{
                    borderColor: active ? accent : undefined,
                    boxShadow: active ? `0 0 18px ${accent}33` : undefined,
                  }}
                  onClick={() => onSelectDifficulty(modeKey)}
                >
                  <div className="difficulty-tab-header">
                    <strong style={{ color: accent }}>{info.name}</strong>
                    <div className="difficulty-pills-group">
                      {modeRec && (
                        <small className="difficulty-pb-chip">
                          {modeRec.bestRank} · ★{modeRec.bestStars}/3
                        </small>
                      )}
                      <small className="difficulty-speed-pill">{info.speed}</small>
                    </div>
                  </div>
                  <span>{info.desc}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* 5. Crewmate Vector Suit & Trail */}
        <section className="menu-section">
          <h2>{t.menu.skinSection}</h2>
          <div className="skin-tabs" role="radiogroup" aria-label={t.menu.skinSection}>
            {CREWMATE_SKIN_ORDER.map((skinKey) => {
              const isUnlocked = unlockedSkins.includes(skinKey);
              const isEquipped = selectedSkin === skinKey;
              const skinCfg = CREWMATE_SKIN_CONFIG[skinKey];
              const skinInfo = t.skins[skinKey];
              return (
                <button
                  key={skinKey}
                  type="button"
                  role="radio"
                  aria-checked={isEquipped}
                  disabled={!isUnlocked}
                  data-testid={`skin-tab-${skinKey}`}
                  data-skin={skinKey}
                  className={`skin-tab ${isEquipped ? 'active' : ''} ${!isUnlocked ? 'locked' : ''}`}
                  style={
                    isEquipped
                      ? {
                          borderColor: skinCfg.accentHex,
                          boxShadow: `0 0 16px ${skinCfg.accentHex}33`,
                        }
                      : undefined
                  }
                  onClick={() => isUnlocked && onSelectSkin(skinKey)}
                >
                  <div className="skin-tab-header">
                    <strong style={{ color: isUnlocked ? skinCfg.accentHex : '#7f93b5' }}>
                      {skinInfo.name}
                    </strong>
                    <small
                      className={`skin-status-pill ${isEquipped ? 'equipped' : isUnlocked ? 'unlocked' : 'locked'}`}
                      style={
                        isEquipped
                          ? { backgroundColor: skinCfg.accentHex, color: '#070914' }
                          : undefined
                      }
                    >
                      {isEquipped
                        ? t.menu.skinEquipped
                        : isUnlocked
                          ? t.menu.skinReady
                          : `🔒 ${skinInfo.badge}`}
                    </small>
                  </div>
                  <div className="skin-tab-sub">
                    <span>{isUnlocked ? skinInfo.desc : `🔒 ${skinInfo.unlockReq}`}</span>
                  </div>
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
              <strong>{t.menu.controls.diveKey}</strong>: {t.menu.controls.diveDesc}
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
