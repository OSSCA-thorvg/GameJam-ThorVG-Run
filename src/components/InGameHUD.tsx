import React from 'react';
import { resolveBanner } from '../i18n/display';
import { useI18n } from '../i18n/I18nProvider';
import {
  FORM_CONFIG,
  type HUDTelemetry,
  type RendererMode,
} from '../types/game';

interface InGameHUDProps {
  hud: HUDTelemetry;
  trackTitle: string;
  onReturnToMenu?: () => void;
  onPause: () => void;
  onStepZoom: (factor: number) => void;
  onResetZoom: () => void;
  onToggleCinematicCamera: () => void;
  onToggleRendererInGame: (next: RendererMode) => void;
  onCycleSfxMode: () => void;
  onActivateOverdrive: () => void;
}

export const InGameHUD: React.FC<InGameHUDProps> = ({
  hud,
  trackTitle,
  onPause,
  onStepZoom,
  onResetZoom,
  onToggleCinematicCamera,
  onToggleRendererInGame,
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

  const displayGauge = hud.resonanceGauge;
  const gaugeLabel = hud.overdriveActive
    ? format(t.hud.overdriveActive, { value: hud.resonanceGauge })
    : format(t.hud.resonance, { value: hud.resonanceGauge });

  const isSkillCoolingDown = (hud.skillCooldownRatio ?? 0) > 0.02;
  const skillStatusLabel = isSkillCoolingDown
    ? format(t.hud.skillCooldown, {
        skill: formText.skillName,
        sec: (hud.skillCooldownSec ?? 0).toFixed(1),
      })
    : formText.skillDesc;

  const zoomDisplayText =
    hud.zoomDisplay < 1 ? hud.zoomDisplay.toFixed(2) : hud.zoomDisplay.toFixed(1);
  const userZoom = hud.userZoom ?? 1.0;
  const userZoomText = userZoom < 1 ? userZoom.toFixed(2) : userZoom.toFixed(1);
  const isZoomDefault = !hud.isPanned && Math.abs(userZoom - 1) < 0.01;
  const hpPct = Math.min(
    100,
    Math.max(0, Math.round(((hud.grooveHp ?? 100) / Math.max(1, hud.maxGrooveHp ?? 100)) * 100))
  );
  const isDanger = hpPct <= 30;
  const hpTierClass = hpPct > 65 ? 'hp-high' : hpPct > 30 ? 'hp-mid' : 'hp-danger';

  const playerLane = hud.playerLane ?? 'low';
  const highLit = Boolean(hud.highKeyFlash || playerLane === 'high');
  const chordLit = Boolean(hud.chordKeyFlash);
  const lowLit = Boolean(hud.lowKeyFlash || playerLane === 'low');
  const rushCombo = hud.rushCombo ?? 0;

  return (
    <div className="hud-overlay">
      {/* Top-left: renderer badge, difficulty, FPS, speed, accuracy, slashed targets, stars, NO MISS */}
      <div className="hud-top-left" data-ui-panel="true">
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
            {t.hud.styleLabel}:{' '}
            <strong style={{ color: formCfg.colorHex }}>{formText.name}</strong>
          </span>
          <span
            className={`cine-zoom-readout${hud.cinematicCamera ? ' active' : ''}`}
            data-testid="hud-effective-zoom"
          >
            {hud.cinematicCamera ? '🎬' : 'ZOOM:'} <strong>{zoomDisplayText}x</strong>
          </span>
          <span className="pure-audio-pill">🎵 {t.hud.pureAudio}</span>
          <span className={`section-pill ${intensity}`}>{sectionLabel}</span>
        </div>
      </div>

      {/* Top-right: score, uncapped combo, track progress, live SFX mode, zoom & pause controls */}
      <div className="hud-top-right" data-ui-panel="true">
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

        <div className="hud-zoom-bar" data-ui-panel="true">
          <button
            type="button"
            data-testid="hud-zoom-out"
            className="hud-btn hud-zoom-step-btn"
            title={t.hud.zoomOutTitle}
            onClick={() => onStepZoom(1 / 1.25)}
          >
            −
          </button>
          <span className="hud-zoom-value" data-testid="hud-zoom-value">
            🔍 {userZoomText}x
          </span>
          <button
            type="button"
            data-testid="hud-zoom-in"
            className="hud-btn hud-zoom-step-btn"
            title={t.hud.zoomInTitle}
            onClick={() => onStepZoom(1.25)}
          >
            +
          </button>
          <button
            type="button"
            data-testid="hud-zoom-reset"
            className={`hud-btn hud-zoom-reset-btn${isZoomDefault ? ' is-default' : ''}`}
            onClick={onResetZoom}
          >
            {t.hud.zoomReset}
          </button>
          <button
            type="button"
            data-testid="hud-cinematic-btn"
            className={`hud-btn hud-cinematic-btn${hud.cinematicCamera ? ' active' : ''}`}
            title={t.hud.cinematicTitle}
            onClick={onToggleCinematicCamera}
          >
            {hud.cinematicCamera ? t.hud.cinematicAuto : t.hud.cinematicFixed}
          </button>
        </div>

        <button
          type="button"
          data-testid="hud-pause-btn"
          className="hud-btn pause-trigger-btn"
          onClick={onPause}
        >
          {t.hud.pauseBtn}
        </button>
      </div>

      {/* Live Rush Lock-On Counter Badge */}
      {rushCombo > 0 && (
        <div className="hud-rush-badge" data-testid="hud-rush-badge">
          {format(t.hud.rushBadge, { count: rushCombo })}
        </div>
      )}

      {/* Real-time Floating Rhythm Timing Judgment Popup with CRITICAL! & FAST / SLOW / JUST */}
      {hud.judgment && (
        <div
          key={hud.judgment.id}
          className={`hud-judgment-pop grade-${hud.judgment.grade.toLowerCase()}`}
        >
          {hud.judgment.isCritical && (
            <span className="judgment-critical-badge" data-testid="hud-critical-badge">
              {t.hud.criticalBadge}
            </span>
          )}
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

      {/* Center-sky status banner (clear of Dual Reticles & 2-Lane playfield) */}
      {hud.statusBanner && (
        <div
          className="hud-center-banner"
          style={{
            borderColor:
              hud.statusBanner.key === 'grooveDanger' || hud.statusBanner.key === 'grooveDepleted'
                ? '#FF2A6D'
                : hud.overdriveActive || hud.statusBanner.key === 'chordCross'
                  ? '#FFE600'
                  : formCfg.colorHex,
          }}
        >
          {resolveBanner(t, hud.statusBanner)}
        </div>
      )}

      {/* Bottom Live 2-Lane Keycap Receptor (`pointer-events: none` for 0ms canvas click-through) */}
      <div className="hud-lane-keys" data-testid="hud-lane-keys" aria-hidden="true">
        <div
          data-testid="hud-key-high"
          className={`hud-keycap keycap-high${highLit ? ' is-lit' : ''}${hud.highKeyFlash ? ' is-flash' : ''}`}
        >
          <kbd>[{t.hud.laneHighKey}]</kbd>
          <span>{t.hud.laneHighLabel}</span>
        </div>
        <div
          data-testid="hud-key-chord"
          className={`hud-keycap keycap-chord${chordLit ? ' is-lit is-flash' : ''}`}
        >
          <kbd>[{t.hud.laneChordKey}]</kbd>
          <span>{t.hud.laneChordLabel}</span>
        </div>
        <div
          data-testid="hud-key-low"
          className={`hud-keycap keycap-low${lowLit ? ' is-lit' : ''}${hud.lowKeyFlash ? ' is-flash' : ''}`}
        >
          <kbd>[{t.hud.laneLowKey}]</kbd>
          <span>{t.hud.laneLowLabel}</span>
        </div>
      </div>

      {/* Bottom-center: Overdrive trigger, Groove HP / Chill status, Katana style & Resonance bar */}
      <div className="hud-bottom-center" data-ui-panel="true">
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

        {diffMode === 'easy' ? (
          <div className="groove-hp-row chill" data-testid="hud-chill-pill">
            <span>{t.hud.chillNoFail}</span>
          </div>
        ) : (
          <div
            className={`groove-hp-row${isDanger ? ' danger' : ''}`}
            data-testid="hud-groove-hp"
          >
            <div className="groove-hp-header">
              <strong>{format(t.hud.grooveHp, { hp: hpPct })}</strong>
              {isDanger && <span className="groove-danger-tag">{t.hud.grooveDangerTag}</span>}
            </div>
            <div className="groove-hp-bar-bg">
              <div
                className={`groove-hp-bar-fill ${hpTierClass}`}
                style={{ width: `${hpPct}%` }}
              />
            </div>
          </div>
        )}

        <div className="gauge-wrapper">
          <div className="gauge-header">
            <div className="gauge-style-skill">
              <strong
                className="hud-style-name"
                style={{ color: hud.overdriveActive ? '#FFE600' : formCfg.colorHex }}
              >
                ◆ {formText.name}
              </strong>
              <span
                data-testid="hud-skill-status"
                className={`hud-skill-pill ${isSkillCoolingDown ? 'cooldown' : 'ready'}`}
                style={
                  !isSkillCoolingDown
                    ? {
                        borderColor: `${formCfg.colorHex}88`,
                        color: formCfg.colorHex,
                        backgroundColor: `${formCfg.colorHex}1F`,
                      }
                    : undefined
                }
              >
                {skillStatusLabel}
              </span>
            </div>
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
