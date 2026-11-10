import React from 'react';
import { useI18n } from '../i18n/I18nProvider';
import { FORM_CONFIG, type HUDTelemetry, type RendererMode } from '../types/game';

interface ResultModalProps {
  hud: HUDTelemetry;
  trackTitle: string;
  onReplay: () => void;
  onSwitchRendererAndReplay: (nextMode: RendererMode) => void;
  onReturnToMenu: () => void;
}

export const ResultModal: React.FC<ResultModalProps> = ({
  hud,
  trackTitle,
  onReplay,
  onSwitchRendererAndReplay,
  onReturnToMenu,
}) => {
  const { t, format } = useI18n();
  const formCfg = FORM_CONFIG[hud.activeForm];
  const nextMode: RendererMode = hud.rendererMode === 'sw' ? 'gl' : 'sw';

  return (
    <div className="result-modal-backdrop">
      <div className="result-modal-card" style={{ borderColor: formCfg.colorHex }}>
        <span className="result-badge">{t.result.badge}</span>
        <h2>{trackTitle}</h2>
        <p className="result-engine-tag">
          {t.result.renderedVia}{' '}
          <strong>{hud.rendererMode === 'sw' ? t.result.cpuEngine : t.result.gpuEngine}</strong>
        </p>

        <div className="result-stats-grid">
          <div className="stat-item">
            <small>{t.result.finalScore}</small>
            <strong>{hud.score.toLocaleString()}</strong>
          </div>
          <div className="stat-item">
            <small>{t.result.maxCombo}</small>
            <strong style={{ color: formCfg.colorHex }}>x{hud.maxCombo}</strong>
          </div>
          <div className="stat-item">
            <small>{t.result.orbs}</small>
            <strong>
              {format(t.result.orbsValue, {
                collected: hud.orbsCollected ?? 0,
                total: hud.totalOrbs ?? 0,
              })}
            </strong>
          </div>
          <div className="stat-item">
            <small>{t.result.dives}</small>
            <strong>{format(t.result.divesValue, { count: hud.divesCompleted })}</strong>
          </div>
          <div className="stat-item">
            <small>{t.result.traps}</small>
            <strong>{format(t.result.trapsValue, { count: hud.trapsDestroyed })}</strong>
          </div>
        </div>

        <div className="result-actions">
          <button type="button" className="primary-btn" onClick={onReplay}>
            {t.result.replay}
          </button>
          <button
            type="button"
            className="secondary-btn"
            onClick={() => onSwitchRendererAndReplay(nextMode)}
          >
            {nextMode === 'gl' ? t.result.compareGpu : t.result.compareCpu}
          </button>
          <button type="button" className="ghost-btn" onClick={onReturnToMenu}>
            {t.result.backToMenu}
          </button>
        </div>
      </div>
    </div>
  );
};
