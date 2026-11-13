import React from 'react';
import { useI18n } from '../i18n/I18nProvider';
import {
  FORM_CONFIG,
  type HUDTelemetry,
  type RendererMode,
  type ResultRank,
} from '../types/game';

interface ResultModalProps {
  hud: HUDTelemetry;
  trackTitle: string;
  onReplay: () => void;
  onSwitchRendererAndReplay: (nextMode: RendererMode) => void;
  onReturnToMenu: () => void;
}

const RANK_COLORS: Record<ResultRank, string> = {
  S: '#FFE600',
  A: '#05D5FF',
  B: '#34D399',
  C: '#FF2A6D',
};

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
  const isFailed = Boolean(hud.isFailed);
  const rank: ResultRank = hud.rank ?? 'S';
  const displayRank = isFailed ? 'F' : rank;
  const rankColor = isFailed ? '#FF2A6D' : RANK_COLORS[rank];
  const accuracy = (hud.accuracy ?? 100).toFixed(1);
  const counts = hud.judgmentCounts ?? { perfect: 0, great: 0, good: 0, miss: 0 };
  const isNoMiss = !isFailed && counts.miss === 0;
  const failedProgressPct = Math.min(99, Math.max(0, Math.round(hud.progress * 100)));

  return (
    <div className="result-modal-backdrop">
      <div
        className={`result-modal-card${isFailed ? ' is-failed' : ''}`}
        style={{ borderColor: isFailed ? '#FF2A6D' : formCfg.colorHex }}
      >
        {isFailed ? (
          <span className="result-badge failed" data-testid="result-failed-badge">
            ⚠️ {t.result.failedBadge}
          </span>
        ) : (
          <span className="result-badge">{t.result.badge}</span>
        )}
        <h2>{trackTitle}</h2>

        {!isFailed && (hud.isNewRecord || isNoMiss) && (
          <div className="result-honors-row">
            {hud.isNewRecord && (
              <span className="result-new-record-pill">
                {format(t.result.newRecord, {
                  delta: Math.max(0, hud.scoreDelta ?? hud.score).toLocaleString(),
                })}
              </span>
            )}
            {isNoMiss && <span className="result-nomiss-pill">{t.result.noMissClear}</span>}
          </div>
        )}

        <p className="result-engine-tag">
          {t.result.renderedVia}{' '}
          <strong>{hud.rendererMode === 'sw' ? t.result.cpuEngine : t.result.gpuEngine}</strong>
        </p>

        {/* Hero Rank & Accuracy Showcase */}
        <div className={`result-rank-hero${isFailed ? ' failed' : ''}`}>
          <div className="rank-emblem-box">
            <small>{t.result.rank}</small>
            <strong className="rank-emblem" style={{ color: rankColor }}>
              {displayRank}
            </strong>
          </div>
          <div className="rank-accuracy-box">
            <div className="rank-accuracy-top">
              <small>{t.result.accuracy}</small>
              {isFailed && (
                <span className="failed-progress-pill" data-testid="result-failed-progress">
                  {format(t.result.failedProgress, { pct: failedProgressPct })}
                </span>
              )}
            </div>
            <strong style={{ color: rankColor }}>
              {format(t.result.accuracyValue, { value: accuracy })}
            </strong>
            <span className="judgment-breakdown-bar">
              {format(t.result.judgmentBreakdown, {
                perfect: counts.perfect,
                great: counts.great,
                good: counts.good,
                miss: counts.miss,
              })}
            </span>
          </div>
        </div>

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
            <small>{t.result.stars}</small>
            <strong style={{ color: '#FFE600' }}>
              {format(t.result.starsValue, {
                collected: hud.starsCollected ?? 0,
                total: hud.totalStars ?? 3,
              })}
            </strong>
          </div>
          <div className="stat-item">
            <small>{t.result.dives}</small>
            <strong>{format(t.result.divesValue, { count: hud.gimmicksTriggered ?? 0 })}</strong>
          </div>
          <div className="stat-item">
            <small>{t.result.traps}</small>
            <strong>{format(t.result.trapsValue, { count: hud.trapsDestroyed })}</strong>
          </div>
        </div>

        <div className="result-actions">
          <button
            type="button"
            data-testid="result-replay-btn"
            className="primary-btn"
            onClick={onReplay}
          >
            {isFailed ? t.result.instantRetry : t.result.replay}
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
