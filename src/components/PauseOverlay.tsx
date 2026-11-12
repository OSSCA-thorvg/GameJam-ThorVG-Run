import React, { useState } from 'react';
import { useI18n } from '../i18n/I18nProvider';
import type { HUDTelemetry, RendererMode } from '../types/game';

export interface PauseOverlayProps {
  hud: HUDTelemetry;
  trackTitle: string;
  audioOffsetMs: number;
  onChangeAudioOffset: (nextOffsetMs: number) => void;
  onResume: () => void;
  onReturnToMenu: () => void;
  onSetZoom: (zoom: number) => void;
  onStepZoom: (factor: number) => void;
  onResetView: () => void;
  onToggleRenderer: (next: RendererMode) => void;
}

const MIN_Z = 0.2;
const MAX_Z = 20.0;

function zoomToSlider(z: number): number {
  const clamped = Math.max(MIN_Z, Math.min(MAX_Z, z));
  return Math.round((Math.log(clamped / MIN_Z) / Math.log(MAX_Z / MIN_Z)) * 1000);
}

function sliderToZoom(v: number): number {
  return MIN_Z * Math.pow(MAX_Z / MIN_Z, v / 1000);
}

function formatZoom(z: number): string {
  return `${z < 1 ? z.toFixed(2) : z.toFixed(1)}x`;
}

export const PauseOverlay: React.FC<PauseOverlayProps> = ({
  hud,
  trackTitle,
  audioOffsetMs,
  onChangeAudioOffset,
  onResume,
  onReturnToMenu,
  onSetZoom,
  onStepZoom,
  onResetView,
  onToggleRenderer,
}) => {
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState(false);

  const currentZoom = hud.userZoom ?? 1.0;
  const progressPct = Math.min(100, Math.max(0, Math.round(hud.progress * 100)));
  const isViewDefault = !hud.isPanned && Math.abs(currentZoom - 1) < 0.01;
  const offsetText = `${audioOffsetMs > 0 ? '+' : ''}${audioOffsetMs}ms`;

  const presets: ReadonlyArray<{ value: number; testId: string; label: string }> = [
    { value: 0.25, testId: 'pause-preset-0.25', label: t.pause.presetWide },
    { value: 1.0, testId: 'pause-preset-1', label: t.pause.presetDefault },
    { value: 4.0, testId: 'pause-preset-4', label: t.pause.presetClose },
    { value: 10.0, testId: 'pause-preset-10', label: t.pause.presetDetail },
    { value: 20.0, testId: 'pause-preset-20', label: t.pause.presetExtreme },
  ];

  return (
    <div className="pause-overlay" data-testid="pause-overlay">
      {collapsed ? (
        <div
          className="pause-collapsed-pill"
          data-ui-panel="true"
          data-testid="pause-collapsed-pill"
        >
          <span className="pause-pill-zoom" data-testid="pause-zoom-readout">
            🔍 {formatZoom(currentZoom)}
          </span>
          <button
            type="button"
            data-testid="pause-expand-btn"
            className="hud-btn pause-pill-btn"
            onClick={() => setCollapsed(false)}
          >
            {t.pause.showPanel}
          </button>
          <button
            type="button"
            data-testid="pause-resume-btn"
            className="primary-btn pause-pill-resume-btn"
            onClick={onResume}
          >
            {t.pause.resumeBtn}
          </button>
        </div>
      ) : (
        <div
          className="pause-panel"
          data-ui-panel="true"
          data-testid="pause-panel"
          role="dialog"
          aria-label={t.pause.title}
        >
          {/* Row 1: Top Meta Bar */}
          <div className="pause-top-row">
            <div className="pause-meta-left">
              <span className="pause-badge">{t.pause.badge}</span>
              <span className="pause-meta-summary">
                🎵 {trackTitle} · {progressPct}% · {hud.score.toLocaleString()} pts
              </span>
            </div>
            <button
              type="button"
              data-testid="pause-collapse-btn"
              className="hud-btn pause-collapse-btn"
              onClick={() => setCollapsed(true)}
            >
              {t.pause.hidePanel}
            </button>
          </div>

          {/* Row 2: Primary Actions — Resume Game & Return to Main Menu */}
          <div className="pause-actions-row">
            <button
              type="button"
              data-testid="pause-resume-btn"
              className="primary-btn pause-action-btn"
              onClick={onResume}
            >
              {t.pause.resumeBtn}
            </button>
            <button
              type="button"
              data-testid="pause-menu-btn"
              className="ghost-btn pause-action-btn"
              onClick={onReturnToMenu}
            >
              {t.pause.mainMenuBtn}
            </button>
          </div>

          {/* Row 3: Compact Single-Row Audio Sync Offset Calibration (`[Fix 7]`) */}
          <div className="pause-audio-offset-row" data-testid="pause-audio-offset">
            <div className="pause-audio-offset-info">
              <strong>{t.pause.audioSyncLabel}</strong>
              <small>{t.pause.audioSyncHint}</small>
            </div>
            <div className="pause-audio-offset-controls">
              <button
                type="button"
                data-testid="pause-offset-minus"
                className="hud-btn pause-offset-step-btn"
                disabled={audioOffsetMs <= -150}
                onClick={() => onChangeAudioOffset(audioOffsetMs - 5)}
              >
                -5ms
              </button>
              <span
                className={`pause-offset-readout${audioOffsetMs !== 0 ? ' is-adjusted' : ''}`}
                data-testid="pause-offset-value"
              >
                {offsetText}
              </span>
              <button
                type="button"
                data-testid="pause-offset-plus"
                className="hud-btn pause-offset-step-btn"
                disabled={audioOffsetMs >= 150}
                onClick={() => onChangeAudioOffset(audioOffsetMs + 5)}
              >
                +5ms
              </button>
              <button
                type="button"
                data-testid="pause-offset-reset"
                className={`hud-btn pause-offset-reset-btn${audioOffsetMs === 0 ? ' is-default' : ''}`}
                onClick={() => onChangeAudioOffset(0)}
              >
                {t.pause.audioSyncReset}
              </button>
            </div>
          </div>

          {/* Row 4: ThorVG Vector Zoom & Live CPU/GPU Compare */}
          <div className="pause-vector-section">
            <div className="pause-vector-header">
              <span className="pause-vector-title">{t.pause.vectorSection}</span>
              <div className="pause-vector-header-right">
                <button
                  type="button"
                  data-testid="pause-renderer-btn"
                  className={`pause-renderer-btn ${hud.rendererMode === 'gl' ? 'gpu' : 'cpu'}`}
                  onClick={() => onToggleRenderer(hud.rendererMode === 'sw' ? 'gl' : 'sw')}
                >
                  <strong>{hud.rendererMode === 'sw' ? 'SwCanvas CPU' : 'GlCanvas GPU'}</strong>
                  <span className="pause-renderer-switch-label">
                    {hud.rendererMode === 'sw' ? t.hud.toGpu : t.hud.toCpu}
                  </span>
                </button>
                <span className="pause-zoom-readout" data-testid="pause-zoom-readout">
                  {formatZoom(currentZoom)}
                </span>
              </div>
            </div>

            <div className="pause-zoom-controls">
              <button
                type="button"
                data-testid="pause-zoom-out"
                className="hud-btn pause-step-btn"
                title={t.hud.zoomOutTitle}
                onClick={() => onStepZoom(1 / 1.25)}
              >
                −
              </button>
              <input
                type="range"
                data-testid="pause-zoom-slider"
                className="pause-zoom-slider"
                min={0}
                max={1000}
                value={zoomToSlider(currentZoom)}
                aria-label={t.pause.vectorSection}
                onChange={(e) => onSetZoom(sliderToZoom(Number(e.target.value)))}
              />
              <button
                type="button"
                data-testid="pause-zoom-in"
                className="hud-btn pause-step-btn"
                title={t.hud.zoomInTitle}
                onClick={() => onStepZoom(1.25)}
              >
                +
              </button>
              <button
                type="button"
                data-testid="pause-zoom-reset"
                className={`hud-btn pause-reset-btn${isViewDefault ? ' is-default' : ''}`}
                onClick={onResetView}
              >
                {t.pause.resetView}
              </button>
            </div>

            <div className="pause-preset-row">
              {presets.map((preset) => {
                const isActive = Math.abs(currentZoom - preset.value) < preset.value * 0.08;
                return (
                  <button
                    key={preset.testId}
                    type="button"
                    data-testid={preset.testId}
                    className={`pause-preset-pill${isActive ? ' active' : ''}`}
                    onClick={() => onSetZoom(preset.value)}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>

            <p className="pause-vector-hint">{t.pause.vectorHint}</p>
          </div>

          {/* Row 5: 4 Crisp Controls Guide Pills */}
          <div className="controls-pill-grid compact" data-testid="pause-controls-guide">
            <div className="control-guide-pill tone-cyan">
              <div className="control-pill-top">
                <span className="control-lane-tag">{t.menu.controls.highTag}</span>
                <strong>{t.menu.controls.highKey}</strong>
              </div>
              <small>{t.menu.controls.highDesc}</small>
            </div>
            <div className="control-guide-pill tone-crimson">
              <div className="control-pill-top">
                <span className="control-lane-tag">{t.menu.controls.lowTag}</span>
                <strong>{t.menu.controls.lowKey}</strong>
              </div>
              <small>{t.menu.controls.lowDesc}</small>
            </div>
            <div className="control-guide-pill tone-gold">
              <div className="control-pill-top">
                <span className="control-lane-tag">{t.menu.controls.chordTag}</span>
                <strong>{t.menu.controls.chordKey}</strong>
              </div>
              <small>{t.menu.controls.chordDesc}</small>
            </div>
            <div className="control-guide-pill tone-neutral">
              <div className="control-pill-top">
                <span className="control-lane-tag">{t.menu.controls.utilTag}</span>
                <strong>{t.menu.controls.utilKey}</strong>
              </div>
              <small>{t.menu.controls.utilDesc}</small>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
