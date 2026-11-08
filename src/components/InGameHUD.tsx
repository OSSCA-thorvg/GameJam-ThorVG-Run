import React from 'react';
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
  const formCfg = FORM_CONFIG[hud.activeForm];
  const progressPct = Math.min(100, Math.max(0, Math.round(hud.progress * 100)));

  return (
    <div className="hud-overlay">
      {/* 상단 좌측: 렌더러 배지, 실시간 FPS, 스케일 배율(ZOOM) */}
      <div className="hud-top-left">
        <div className="hud-badge-row">
          <span
            className={`renderer-badge ${hud.rendererMode === 'gl' ? 'gpu' : 'cpu'}`}
          >
            {hud.rendererMode === 'sw'
              ? 'MODE: CPU [SwCanvas]'
              : 'MODE: GPU [GlCanvas]'}
          </span>
          <span className="fps-badge">FPS: {hud.fps}</span>
          <span className="zoom-badge">
            ZOOM: {hud.zoomDisplay.toFixed(1)}x
          </span>
        </div>
        <div className="hud-sub-status">
          <span>PHASE: <strong>{hud.phase}</strong></span>
          <span>AUDIO FILTER: <strong>{hud.acousticFilterLabel}</strong></span>
        </div>
      </div>

      {/* 상단 우측: 점수, 콤보, 곡 진행도 프로그레스 바, 메뉴 복귀(렌더러 변경) 버튼 */}
      <div className="hud-top-right">
        <div className="score-row">
          <div className="score-box">
            <small>SCORE</small>
            <strong>{hud.score.toLocaleString()}</strong>
          </div>
          <div className="combo-box">
            <small>COMBO</small>
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
              style={{
                width: `${progressPct}%`,
                backgroundColor: formCfg.colorHex,
              }}
            />
          </div>
        </div>

        <div className="hud-actions-row">
          <button
            type="button"
            className="hud-btn"
            onClick={() =>
              onToggleRendererInGame(hud.rendererMode === 'sw' ? 'gl' : 'sw')
            }
          >
            ⚡ {hud.rendererMode === 'sw' ? 'GPU(GlCanvas)로 전환' : 'CPU(SwCanvas)로 전환'}
          </button>
          <button
            type="button"
            className="hud-btn menu-return-btn"
            onClick={onReturnToMenu}
          >
            [ 메뉴로 돌아가기 ( 렌더러 변경 ) ]
          </button>
        </div>
      </div>

      {/* 중앙 다이빙/변신 알림 배너 */}
      {hud.statusBanner && (
        <div
          className="hud-center-banner"
          style={{ borderColor: formCfg.colorHex }}
        >
          {hud.statusBanner}
        </div>
      )}

      {/* 하단 중앙: 현재 장착 중인 주파수 공명 폼 아이콘 및 공명 게이지 바 */}
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
                <strong style={{ color: cfg.colorHex }}>{cfg.name.replace(' FORM', '')}</strong>
                <small>{cfg.skillName.split('(')[0]}</small>
              </button>
            );
          })}
        </div>

        <div className="gauge-wrapper">
          <div className="gauge-header">
            <span style={{ color: formCfg.colorHex }}>
              ◆ {formCfg.name} — {formCfg.skillDesc}
            </span>
            <strong>RESONANCE {hud.resonanceGauge}%</strong>
          </div>
          <div className="gauge-bar-bg">
            <div
              className="gauge-bar-fill"
              style={{
                width: `${hud.resonanceGauge}%`,
                backgroundColor: formCfg.colorHex,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

