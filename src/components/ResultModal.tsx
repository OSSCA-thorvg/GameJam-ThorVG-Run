import React from 'react';
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
  const formCfg = FORM_CONFIG[hud.activeForm];
  const nextMode: RendererMode = hud.rendererMode === 'sw' ? 'gl' : 'sw';

  return (
    <div className="result-modal-backdrop">
      <div className="result-modal-card" style={{ borderColor: formCfg.colorHex }}>
        <span className="result-badge">TRACK COMPLETE · RESONANCE SYNCHRONIZED</span>
        <h2>{trackTitle}</h2>
        <p className="result-Engine-tag">
          Rendered via{' '}
          <strong>
            {hud.rendererMode === 'sw'
              ? 'ThorVG SwCanvas (CPU Rasterizer)'
              : 'ThorVG GlCanvas (WebGL2 GPU)'}
          </strong>
        </p>

        <div className="result-stats-grid">
          <div className="stat-item">
            <small>FINAL SCORE</small>
            <strong>{hud.score.toLocaleString()}</strong>
          </div>
          <div className="stat-item">
            <small>MAX COMBO</small>
            <strong style={{ color: formCfg.colorHex }}>x{hud.maxCombo}</strong>
          </div>
          <div className="stat-item">
            <small>INFINITE DIVES</small>
            <strong>{hud.divesCompleted}회</strong>
          </div>
          <div className="stat-item">
            <small>TRAPS SHATTERED</small>
            <strong>{hud.trapsDestroyed}개</strong>
          </div>
        </div>

        <div className="result-actions">
          <button type="button" className="primary-btn" onClick={onReplay}>
            ▶ 현재 렌더러로 다시 달리기
          </button>
          <button
            type="button"
            className="secondary-btn"
            onClick={() => onSwitchRendererAndReplay(nextMode)}
          >
            🔄 {nextMode === 'gl' ? 'GPU (GlCanvas)' : 'CPU (SwCanvas)'} 모드로 비교 플레이
          </button>
          <button type="button" className="ghost-btn" onClick={onReturnToMenu}>
            ⚙️ 메인 메뉴로 돌아가기
          </button>
        </div>
      </div>
    </div>
  );
};

