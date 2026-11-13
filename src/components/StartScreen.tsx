import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { useCoarsePointer } from '../hooks/useCoarsePointer';
import { trackArtist, trackTitle } from '../i18n/display';
import { useI18n } from '../i18n/I18nProvider';
import { LANGUAGE_LABELS, type Lang } from '../i18n/messages';
import {
  CREWMATE_SKIN_CONFIG,
  CREWMATE_SKIN_ORDER,
  DIFFICULTY_CONFIG,
  type CrewmateSkinId,
  type DifficultyMode,
  type RendererMode,
  type TrackMetadata,
} from '../types/game';

export type MenuStep = 'setup' | 'track';

interface StartScreenProps {
  selectedTrack: TrackMetadata;
  customTracks: TrackMetadata[];
  rendererMode: RendererMode;
  difficulty: DifficultyMode;
  selectedSkin: CrewmateSkinId;
  unlockedSkins: CrewmateSkinId[];
  engineReady: boolean;
  step: MenuStep;
  onStepChange: (step: MenuStep) => void;
  onSelectTrack: (track: TrackMetadata) => void;
  onUploadFile: (file: File, supportedFormats: readonly AudioFormat[]) => Promise<void>;
  onSelectRenderer: (mode: RendererMode) => void;
  onSelectDifficulty: (difficulty: DifficultyMode) => void;
  onSelectSkin: (skin: CrewmateSkinId) => void;
  onStartRun: () => void;
}

const LANGS: Lang[] = ['en', 'ko'];
const DIFFICULTY_MODES: DifficultyMode[] = ['casual', 'standard'];

export const StartScreen: React.FC<StartScreenProps> = ({
  selectedTrack,
  customTracks,
  rendererMode,
  difficulty,
  selectedSkin,
  unlockedSkins,
  engineReady,
  step,
  onStepChange,
  onSelectTrack,
  onUploadFile,
  onSelectRenderer,
  onSelectDifficulty,
  onSelectSkin,
  onStartRun,
}) => {
  const { lang, setLang, t, format } = useI18n();
  const isCoarsePointer = useCoarsePointer();
  const ctrlGuide = isCoarsePointer ? t.menu.controlsTouch : t.menu.controls;
  const cardRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);

  useEffect(() => {
    if (cardRef.current) {
      cardRef.current.scrollTop = 0;
    }
  }, [step]);

  // Formats this browser can decode. Drives the hint, the picker filter, and validation.
  const supportedFormats = useMemo(() => detectSupportedAudioFormats(), []);
  const supportedList = supportedFormats.length > 0 ? formatLabels(supportedFormats) : '—';
  const acceptAttr = useMemo(() => buildAcceptAttribute(supportedFormats), [supportedFormats]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (step !== 'track') {
      onStepChange('track');
    }
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
  const equippedSkinCfg = CREWMATE_SKIN_CONFIG[selectedSkin];

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
      <div
        ref={cardRef}
        className={`start-card${isDragging ? ' dragging' : ''}`}
        data-testid="start-card"
        data-menu-step={step}
        data-engine-ready={engineReady ? 'true' : 'false'}
      >
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

        <nav className="menu-stepper" data-testid="menu-stepper" aria-label={t.menu.stepperLabel}>
          <button
            type="button"
            data-testid="menu-step-setup"
            aria-current={step === 'setup' ? 'step' : undefined}
            className={`menu-step-tab${step === 'setup' ? ' active' : ' completed'}`}
            onClick={() => onStepChange('setup')}
          >
            <span className="menu-step-num" aria-hidden="true">
              {step === 'track' ? '✓' : '1'}
            </span>
            <span className="menu-step-copy">
              <strong>{t.menu.stepSetupTitle}</strong>
              <small>{t.menu.stepSetupHint}</small>
            </span>
          </button>

          <button
            type="button"
            data-testid="menu-step-track"
            aria-current={step === 'track' ? 'step' : undefined}
            className={`menu-step-tab${step === 'track' ? ' active' : ''}`}
            onClick={() => onStepChange('track')}
          >
            <span className="menu-step-num" aria-hidden="true">
              2
            </span>
            <span className="menu-step-copy">
              <strong>{t.menu.stepTrackTitle}</strong>
              <small>{t.menu.stepTrackHint}</small>
            </span>
          </button>
        </nav>

        {step === 'setup' ? (
          <>
            <div className="menu-step-body" data-step="setup">
              {/* 1. Select Renderer Backend */}
              <section className="menu-section">
                <h2>{t.menu.rendererSection}</h2>
                <div className="renderer-radio-group">
                  <label
                    data-testid="renderer-option-sw"
                    className={`renderer-option${rendererMode === 'sw' ? ' selected' : ''}`}
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
                    data-testid="renderer-option-gl"
                    className={`renderer-option${rendererMode === 'gl' ? ' selected' : ''}`}
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

              {/* 2. Crewmate Vector Suit & Blade Trail (2x2 Grid) */}
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
                        className={`skin-tab${isEquipped ? ' active' : ''}${!isUnlocked ? ' locked' : ''}`}
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
            </div>

            <footer className="start-footer">
              <button
                type="button"
                className="menu-next-btn"
                data-testid="menu-next-step-btn"
                onClick={() => onStepChange('track')}
              >
                {t.menu.nextToTrackBtn}
              </button>
            </footer>
          </>
        ) : (
          <>
            <div className="menu-step-body" data-step="track">
              {/* Top Play Mode Toggle & Step 1 Loadout Summary Bar */}
              <div className="menu-mode-loadout-bar" data-testid="menu-mode-loadout-bar">
                <div className="menu-mode-loadout-top">
                  <div
                    className="difficulty-tabs"
                    role="radiogroup"
                    aria-label={t.menu.difficultySection}
                  >
                    {DIFFICULTY_MODES.map((modeKey) => {
                      const accent = DIFFICULTY_CONFIG[modeKey].colorHex;
                      const info = t.difficulties[modeKey];
                      const active = difficulty === modeKey;
                      const modeRec = getTrackRecord(selectedTrack, modeKey);
                      return (
                        <button
                          key={modeKey}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          data-testid={`difficulty-tab-${modeKey}`}
                          data-difficulty={modeKey}
                          className={`difficulty-tab${active ? ' active' : ''}`}
                          style={{
                            borderColor: active ? accent : undefined,
                            boxShadow: active ? `0 0 16px ${accent}33` : undefined,
                          }}
                          onClick={() => onSelectDifficulty(modeKey)}
                        >
                          <strong style={{ color: active ? accent : '#dce8ff' }}>{info.name}</strong>
                          <small className="difficulty-speed-pill">
                            {modeRec ? `${modeRec.bestRank} · ★${modeRec.bestStars}/3` : info.speed}
                          </small>
                        </button>
                      );
                    })}
                  </div>

                  <div className="menu-loadout-summary" data-testid="menu-loadout-summary">
                    <span className="loadout-chip">
                      {rendererMode === 'sw' ? t.menu.loadoutCpuShort : t.menu.loadoutGpuShort}
                    </span>
                    <span
                      className="loadout-chip skin-chip"
                      style={{
                        borderColor: `${equippedSkinCfg.accentHex}66`,
                        color: equippedSkinCfg.accentHex,
                      }}
                    >
                      ✦ {t.skins[selectedSkin].name}
                    </span>
                    <button
                      type="button"
                      className="loadout-edit-btn"
                      data-testid="menu-edit-setup-btn"
                      onClick={() => onStepChange('setup')}
                    >
                      {t.menu.editSetupBtn}
                    </button>
                  </div>
                </div>

                <p className="active-mode-hint" data-testid="active-mode-hint">
                  {t.difficulties[difficulty].desc}
                </p>
              </div>

              {/* Select Track & Custom Audio Dropzone */}
              <section className="menu-section menu-track-section">
                <div className="track-section-header">
                  <h2>{t.menu.trackSection}</h2>
                  <span className="track-count-pill">
                    {format(t.menu.trackCountSummary, {
                      count: allTracks.length,
                      difficulty: t.difficulties[difficulty].shortName,
                    })}
                  </span>
                </div>

                <div className="track-list" data-testid="menu-track-list">
                  {allTracks.map((track, idx) => {
                    const isSelected = selectedTrack.id === track.id;
                    const title = trackTitle(t, track);
                    const rec = getTrackRecord(track, difficulty);
                    return (
                      <button
                        key={track.id}
                        type="button"
                        data-testid={`track-item-${track.id}`}
                        className={`track-item${isSelected ? ' selected' : ''}`}
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

                <div
                  className="upload-dropzone"
                  data-testid="menu-upload-dropzone"
                  role="button"
                  tabIndex={0}
                  onClick={() => fileInputRef.current?.click()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      fileInputRef.current?.click();
                    }
                  }}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={acceptAttr}
                    style={{ display: 'none' }}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      void handleFiles(e.target.files);
                      // Allow re-selecting the same file after an error.
                      e.target.value = '';
                    }}
                  />
                  <span className="upload-dropzone-title">{t.upload.dropzone}</span>
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

              {/* 2-Lane Core Controls Guide */}
              <div className="menu-controls-wrap">
                <h3 className="controls-guide-title">{t.menu.controlsSectionTitle}</h3>
                <div className="controls-pill-grid" data-testid="menu-controls-guide">
                  <div className="control-guide-pill tone-cyan">
                    <div className="control-pill-top">
                      <span className="control-lane-tag">{ctrlGuide.highTag}</span>
                      <strong>{ctrlGuide.highKey}</strong>
                    </div>
                    <small>{ctrlGuide.highDesc}</small>
                  </div>
                  <div className="control-guide-pill tone-crimson">
                    <div className="control-pill-top">
                      <span className="control-lane-tag">{ctrlGuide.lowTag}</span>
                      <strong>{ctrlGuide.lowKey}</strong>
                    </div>
                    <small>{ctrlGuide.lowDesc}</small>
                  </div>
                  <div className="control-guide-pill tone-gold">
                    <div className="control-pill-top">
                      <span className="control-lane-tag">{ctrlGuide.chordTag}</span>
                      <strong>{ctrlGuide.chordKey}</strong>
                    </div>
                    <small>{ctrlGuide.chordDesc}</small>
                  </div>
                  <div className="control-guide-pill tone-neutral">
                    <div className="control-pill-top">
                      <span className="control-lane-tag">{ctrlGuide.utilTag}</span>
                      <strong>{ctrlGuide.utilKey}</strong>
                    </div>
                    <small>{ctrlGuide.utilDesc}</small>
                  </div>
                </div>
              </div>
            </div>

            <footer className="start-footer start-footer-dual">
              <button
                type="button"
                className="menu-prev-btn"
                data-testid="menu-prev-step-btn"
                onClick={() => onStepChange('setup')}
              >
                {t.menu.prevToSetupBtn}
              </button>
              <button
                type="button"
                className="start-run-btn"
                data-testid="start-run-btn"
                disabled={!engineReady}
                onClick={onStartRun}
              >
                {engineReady ? t.menu.start : t.menu.initializing}
              </button>
            </footer>
          </>
        )}
      </div>
    </div>
  );
};
