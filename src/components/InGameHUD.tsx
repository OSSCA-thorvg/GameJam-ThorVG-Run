import React from 'react';
import { resolveBanner } from '../i18n/display';
import { useI18n } from '../i18n/I18nProvider';
import {
  FORM_CONFIG,
  type HUDTelemetry,
  type RendererMode,
  type ResonanceFormType,
} from '../types/game';

interface InGameHUDProps {
  hud: HUDTelemetry;
  trackTitle: string;
  onReturnToMenu: () => void;
  onToggleRendererInGame: (next: RendererMode) => void;
  onSwapForm: (form: ResonanceFormType) => void;
  onCycleSfxMode: () => void;
  onActivateOverdrive: () => void;
}

export const InGameHUD: React.FC<InGameHUDProps> = ({
  hud,
  trackTitle,
  onReturnToMenu,
  onToggleRendererInGame,
  onSwapForm,
  onCycleSfxMode,
  onActivateOverdrive,
}) => {
  const { t, format } = useI18n();
  const formCfg = FORM_CONFIG[hud.activeForm];
  const formText = t.forms[hud.activeForm];
  const progressPct = Math.min(100, Math.max(0, Math.round(hud.progress * 100)));
  const surfSpeed = (hud.speedMultiplier ?? 1.0).toFixed(1);
  const orbsCollected = hud.orbsCollected ?? 0;
  const totalOrbs = hud.totalOrbs ?? 0;
  const starsCollected = hud.starsCollected ?? 0;
  const totalStars = hud.totalStars ?? 3;
  const isNoMiss = (hud.judgmentCounts?.miss ?? 0) === 0;
  const accuracyText = (hud.accuracy ?? 100).toFixed(1);
  const diffMode = hud.difficulty ?? 'normal';
  const sfxMode = hud.sfxMode ?? 'full';
  const sfxLabel =
    sfxMode === 'full' ? t.hud.sfxFull : sfxMode === 'impact' ? t.hud.sfxImpact : t.hud.sfxOff;

  const intensity = hud.sectionIntensity ?? 'groove';
  const sectionLabel =
    intensity === 'drop'
      ? t.hud.sectionDrop
      : intensity === 'groove'
        ? t.hud.sectionGroove
        : t.hud.sectionCalm;

  // Signed FAST/SLOW/JUST timing indicator
  const signedMs = hud.judgment?.signedDeltaMs;
  const timingTag =
    signedMs !== undefined && hud.judgment?.grade !== 'MISS'
      ? Math.abs(signedMs) <= 12
        ? {
            cls: 'timing-just',
            label: format(t.hud.justMs, { ms: Math.abs(signedMs) }),
          }
        : signedMs < 0
          ? {
              cls: 'timing-fast',
              label: format(t.hud.fastMs, { ms: Math.abs(signedMs) }),
            }
          : {
              cls: 'timing-slow',
              label: format(t.hud.slowMs, { ms: Math.abs(signedMs) }),
            }
      : null;

  const displayGauge = hud.phase === 'MICRO' ? (hud.microSyncProgress ?? 0) : hud.resonanceGauge;
  const gaugeLabel =
    hud.phase === 'MICRO'
      ? format(t.hud.microSync, { value: displayGauge })
      : hud.overdriveActive
        ? format(t.hud.overdriveActive, { value: hud.resonanceGauge })
        : format(t.hud.resonance, { value: hud.resonanceGauge });

  return (
    <div className="hud-overlay">
      {/* Top-left: renderer badge, difficulty, FPS, speed, accuracy, notes, prism stars, NO MISS */}
      <div className="hud-top-left">
        <div className="hud-badge-row">
          <span className={`renderer-badge ${hud.rendererMode === 'gl' ? 'gpu' : 'cpu'}`}>
            {hud.rendererMode === 'sw' ? t.hud.modeCpu : t.hud.modeGpu}
          </span>
          <span className={`diff-badge ${diffMode}`}>{t.difficulties[diffMode].name}</span>
          <span className="fps-badge">FPS: {hud.fps}</span>
          <span className="surf-badge">{format(t.hud.surfSpeed, { speed: surfSpeed })}</span>
          <span className="acc-badge">{format(t.hud.accuracy, { value: accuracyText })}</span>
          <span className="orbs-badge">
            {format(t.hud.orbs, { collected: orbsCollected, total: totalOrbs })}
          </span>
          <span className="stars-badge">
            {format(t.hud.stars, { collected: starsCollected, total: totalStars })}
          </span>
          {isNoMiss && <span className="nomiss-badge">{t.hud.noMissLive}</span>}
        </div>
        <div className="hud-sub-status">
          <span>
            {t.hud.phase}: <strong>{t.phases[hud.phase]}</strong>
          </span>
          <span>
            ZOOM: <strong>{hud.zoomDisplay.toFixed(1)}x</strong>
          </span>
          <span>
            {t.hud.audioFilter}: <strong>{t.filter[hud.acousticFilter]}</strong>
          </span>
          <span className={`section-pill ${intensity}`}>{sectionLabel}</span>
        </div>
      </div>

      {/* Top-right: score, uncapped combo, track progress, live SFX mode & renderer controls */}
      <div className="hud-top-right">
        <div className="score-row">
          <div className="score-box">
            <small>{t.hud.score}</small>
            <strong>{hud.score.toLocaleString()}</strong>
          </div>
          <div className="combo-box">
            <small>{t.hud.combo}</small>
            <strong
              style={{
                color: hud.overdriveActive ? '#FFE600' : formCfg.colorHex,
              }}
            >
              x{hud.combo}
            </strong>
          </div>
        </div>

        <div className="progress-container">
          <div className="progress-labels">
            <span>🎵 {trackTitle}</span>
            <span>{progressPct}%</span>
          </div>
          <div className="progress-track">
            <div
              className="progress-fill"
              style={{ width: `${progressPct}%`, backgroundColor: formCfg.colorHex }}
            />
          </div>
        </div>

        <div className="hud-actions-row">
          <button
            type="button"
            data-testid="sfx-mode-btn"
            className={`hud-btn sfx-mode-btn sfx-${sfxMode}`}
            onClick={onCycleSfxMode}
          >
            {sfxLabel}
          </button>
          <button
            type="button"
            className="hud-btn"
            onClick={() => onToggleRendererInGame(hud.rendererMode === 'sw' ? 'gl' : 'sw')}
          >
            {hud.rendererMode === 'sw' ? t.hud.toGpu : t.hud.toCpu}
          </button>
        </div>
        <button type="button" className="hud-btn menu-return-btn" onClick={onReturnToMenu}>
          {t.hud.menuReturn}
        </button>
      </div>

      {/* Real-time Floating Rhythm Timing Judgment Popup with Signed FAST / SLOW / JUST */}
      {hud.judgment && (
        <div
          key={hud.judgment.id}
          className={`hud-judgment-pop grade-${hud.judgment.grade.toLowerCase()}`}
        >
          <strong>{t.judgments[hud.judgment.grade]}</strong>
          {hud.judgment.grade !== 'MISS' && (
            <div className="judgment-meta-row">
              <small>+{hud.judgment.bonusScore}</small>
              {timingTag && (
                <small className={`timing-tag ${timingTag.cls}`}>{timingTag.label}</small>
              )}
            </div>
          )}
        </div>
      )}

      {/* Center: dive / swap / gimmick / overdrive banner */}
      {hud.statusBanner && (
        <div
          className="hud-center-banner"
          style={{
            borderColor: hud.overdriveActive ? '#FFE600' : formCfg.colorHex,
          }}
        >
          {resolveBanner(t, hud.statusBanner)}
        </div>
      )}

      {/* Bottom-center: Manual Overdrive button, 3-color forms, and Resonance / Micro Sync bar */}
      <div className="hud-bottom-center">
        {hud.overdriveReady && (
          <button
            type="button"
            data-testid="overdrive-btn"
            className="overdrive-ready-btn"
            onClick={onActivateOverdrive}
          >
            {t.hud.overdriveReadyBtn}
          </button>
        )}

        <div className="resonance-forms-strip">
          {(['bass', 'synth', 'treble'] as ResonanceFormType[]).map((formKey, idx) => {
            const cfg = FORM_CONFIG[formKey];
            const isCurrent = hud.activeForm === formKey;
            return (
              <button
                key={formKey}
                type="button"
                className={`resonance-pill ${isCurrent ? 'active' : ''}`}
                style={{
                  borderColor: isCurrent ? cfg.colorHex : undefined,
                  boxShadow: isCurrent ? `0 0 16px ${cfg.colorHex}55` : undefined,
                }}
                onClick={() => onSwapForm(formKey)}
              >
                <span className="pill-key">[{idx + 1}]</span>
                <strong style={{ color: cfg.colorHex }}>{t.forms[formKey].short}</strong>
                <small>{t.forms[formKey].skillName}</small>
              </button>
            );
          })}
        </div>

        <div className="gauge-wrapper">
          <div className="gauge-header">
            <span style={{ color: hud.overdriveActive ? '#FFE600' : formCfg.colorHex }}>
              ◆ {formText.name} — {formText.skillDesc}
            </span>
            <strong className={hud.overdriveReady || hud.overdriveActive ? 'gauge-text-hot' : ''}>
              {gaugeLabel}
            </strong>
          </div>
          <div className="gauge-bar-bg">
            <div
              className={`gauge-bar-fill ${hud.overdriveActive ? 'overdrive-active' : hud.overdriveReady ? 'overdrive-ready' : ''}`}
              style={{
                width: `${displayGauge}%`,
                backgroundColor: hud.overdriveActive ? undefined : formCfg.colorHex,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
