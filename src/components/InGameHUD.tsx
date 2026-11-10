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
}

export const InGameHUD: React.FC<InGameHUDProps> = ({
  hud,
  trackTitle,
  onReturnToMenu,
  onToggleRendererInGame,
  onSwapForm,
}) => {
  const { t, format } = useI18n();
  const formCfg = FORM_CONFIG[hud.activeForm];
  const formText = t.forms[hud.activeForm];
  const progressPct = Math.min(100, Math.max(0, Math.round(hud.progress * 100)));
  const surfSpeed = (hud.speedMultiplier ?? 1.0).toFixed(1);
  const orbsCollected = hud.orbsCollected ?? 0;
  const totalOrbs = hud.totalOrbs ?? 0;
  const intensity = hud.sectionIntensity ?? 'groove';
  const sectionLabel =
    intensity === 'drop'
      ? t.hud.sectionDrop
      : intensity === 'groove'
      ? t.hud.sectionGroove
      : t.hud.sectionCalm;

  return (
    <div className="hud-overlay">
      {/* Top-left: renderer badge, live FPS, zoom scale, surf speed, orbs, section */}
      <div className="hud-top-left">
        <div className="hud-badge-row">
          <span className={`renderer-badge ${hud.rendererMode === 'gl' ? 'gpu' : 'cpu'}`}>
            {hud.rendererMode === 'sw' ? t.hud.modeCpu : t.hud.modeGpu}
          </span>
          <span className="fps-badge">FPS: {hud.fps}</span>
          <span className="zoom-badge">ZOOM: {hud.zoomDisplay.toFixed(1)}x</span>
          <span className="surf-badge">{format(t.hud.surfSpeed, { speed: surfSpeed })}</span>
          <span className="orbs-badge">
            {format(t.hud.orbs, { collected: orbsCollected, total: totalOrbs })}
          </span>
        </div>
        <div className="hud-sub-status">
          <span>
            {t.hud.phase}: <strong>{t.phases[hud.phase]}</strong>
          </span>
          <span>
            {t.hud.audioFilter}: <strong>{t.filter[hud.acousticFilter]}</strong>
          </span>
          <span className={`section-pill ${intensity}`}>{sectionLabel}</span>
        </div>
      </div>

      {/* Top-right: score, combo, track progress, menu / renderer controls */}
      <div className="hud-top-right">
        <div className="score-row">
          <div className="score-box">
            <small>{t.hud.score}</small>
            <strong>{hud.score.toLocaleString()}</strong>
          </div>
          <div className="combo-box">
            <small>{t.hud.combo}</small>
            <strong style={{ color: formCfg.colorHex }}>x{hud.combo}</strong>
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
            className="hud-btn"
            onClick={() => onToggleRendererInGame(hud.rendererMode === 'sw' ? 'gl' : 'sw')}
          >
            {hud.rendererMode === 'sw' ? t.hud.toGpu : t.hud.toCpu}
          </button>
          <button type="button" className="hud-btn menu-return-btn" onClick={onReturnToMenu}>
            {t.hud.menuReturn}
          </button>
        </div>
      </div>

      {/* Center: dive / swap banner */}
      {hud.statusBanner && (
        <div className="hud-center-banner" style={{ borderColor: formCfg.colorHex }}>
          {resolveBanner(t, hud.statusBanner)}
        </div>
      )}

      {/* Bottom-center: equipped resonance form and gauge */}
      <div className="hud-bottom-center">
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
            <span style={{ color: formCfg.colorHex }}>
              ◆ {formText.name} — {formText.skillDesc}
            </span>
            <strong>{format(t.hud.resonance, { value: hud.resonanceGauge })}</strong>
          </div>
          <div className="gauge-bar-bg">
            <div
              className="gauge-bar-fill"
              style={{ width: `${hud.resonanceGauge}%`, backgroundColor: formCfg.colorHex }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
