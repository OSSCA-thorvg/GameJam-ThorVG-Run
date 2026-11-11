import React, { useMemo } from 'react';
import { useI18n } from '../i18n/I18nProvider';
import type { LoadingProgress } from '../types/game';

interface TrackLoadingModalProps {
  trackTitle: string;
  loadingState: LoadingProgress;
}

export const TrackLoadingModal: React.FC<TrackLoadingModalProps> = ({
  trackTitle,
  loadingState,
}) => {
  const { t } = useI18n();
  const pct = Math.min(100, Math.max(0, Math.round(loadingState.progress * 100)));
  const blueprint = loadingState.blueprint;

  // Downsample slices into 72 preview bars for the full-track waveform blueprint minimap
  const previewBars = useMemo(() => {
    const barCount = 72;
    if (!blueprint || blueprint.slices.length === 0) {
      return Array.from({ length: barCount }, (_, idx) => ({
        heightPct: 22 + Math.round(Math.abs(Math.sin(idx * 0.35)) * 58),
        color: idx % 3 === 0 ? '#FF2A6D' : idx % 2 === 0 ? '#05D5FF' : '#FFE600',
      }));
    }

    const slices = blueprint.slices;
    return Array.from({ length: barCount }, (_, idx) => {
      const sIdx = Math.min(slices.length - 1, Math.floor((idx / barCount) * slices.length));
      const slice = slices[sIdx]!;
      const heightPct = Math.max(14, Math.min(98, Math.round((0.18 + slice.overall * 0.82) * 100)));
      const color =
        slice.intensity === 'drop'
          ? '#FF2A6D'
          : slice.intensity === 'groove'
          ? '#FFE600'
          : '#05D5FF';
      return { heightPct, color };
    });
  }, [blueprint]);

  const totalGimmicksAndPlatforms = blueprint
    ? blueprint.skyPlatforms.length +
      blueprint.jumpPads.length +
      blueprint.dashRings.length +
      blueprint.holdRails.length
    : 0;

  return (
    <div className="loading-modal-backdrop" role="status" aria-live="polite">
      <div className="loading-modal-card">
        <span className="loading-badge">{t.loading.badge}</span>
        <h2 className="loading-track-title">🎵 {trackTitle}</h2>
        <p className="loading-subtitle">{t.loading.subtitle}</p>

        {/* Full-Track Pre-computed Waveform Blueprint Minimap */}
        <div className="blueprint-minimap">
          <div className="blueprint-bars">
            {previewBars.map((bar, idx) => {
              const revealed = (idx / previewBars.length) * 100 <= pct;
              return (
                <div
                  key={idx}
                  className="blueprint-bar"
                  style={{
                    height: `${bar.heightPct}%`,
                    backgroundColor: revealed ? bar.color : 'rgba(255,255,255,0.12)',
                    opacity: revealed ? 0.92 : 0.35,
                  }}
                />
              );
            })}
          </div>
        </div>

        {/* Progress Bar & Stage Label */}
        <div className="loading-progress-wrap">
          <div className="loading-stage-row">
            <span>{t.loading.stages[loadingState.stage]}</span>
            <strong>{pct}%</strong>
          </div>
          <div className="loading-bar-bg">
            <div className="loading-bar-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>

        {/* Pre-computed Blueprint Stats */}
        {blueprint && (
          <div className="blueprint-stats-grid">
            <div className="blueprint-stat">
              <small>{t.loading.stats.segments}</small>
              <strong>{blueprint.segments.length.toLocaleString()}</strong>
            </div>
            <div className="blueprint-stat">
              <small>{t.loading.stats.beats}</small>
              <strong>{blueprint.totalBeats.toLocaleString()}</strong>
            </div>
            <div className="blueprint-stat">
              <small>{t.loading.stats.orbs}</small>
              <strong>{blueprint.orbs.length.toLocaleString()}</strong>
            </div>
            <div className="blueprint-stat">
              <small>{t.loading.stats.drops}</small>
              <strong style={{ color: '#FFE600' }}>
                {totalGimmicksAndPlatforms.toLocaleString()}
              </strong>
            </div>
          </div>
        )}

        {/* How to Run Guide */}
        <div className="loading-tip-box">
          <strong>{t.loading.tipTitle}</strong>
          <p>{t.loading.tipBody}</p>
        </div>
      </div>
    </div>
  );
};
