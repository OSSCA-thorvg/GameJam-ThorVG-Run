import React, { useRef, useState } from 'react';
import { BUILT_IN_TRACKS } from '../audio/proceduralTracks';
import {
  FORM_CONFIG,
  type RendererMode,
  type ResonanceFormType,
  type TrackMetadata,
} from '../types/game';

interface StartScreenProps {
  selectedTrack: TrackMetadata;
  customTracks: TrackMetadata[];
  rendererMode: RendererMode;
  previewForm: ResonanceFormType;
  engineReady: boolean;
  onSelectTrack: (track: TrackMetadata) => void;
  onUploadFile: (file: File) => Promise<void>;
  onSelectRenderer: (mode: RendererMode) => void;
  onSelectPreviewForm: (form: ResonanceFormType) => void;
  onStartRun: () => void;
}

export const StartScreen: React.FC<StartScreenProps> = ({
  selectedTrack,
  customTracks,
  rendererMode,
  previewForm,
  engineReady,
  onSelectTrack,
  onUploadFile,
  onSelectRenderer,
  onSelectPreviewForm,
  onStartRun,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0]!;
    if (!/\.(mp3|ogg|wav)$/i.test(file.name) && !file.type.startsWith('audio/')) {
      setUploadStatus('지원 포맷: .mp3, .ogg, .wav 오디오 파일만 가능합니다.');
      return;
    }
    setUploadStatus(`음원 분석 중: ${file.name}...`);
    try {
      await onUploadFile(file);
      setUploadStatus(`로드 완료: ${file.name}`);
    } catch {
      setUploadStatus('오디오 파일 디코딩에 실패했습니다.');
    }
  };

  const allTracks = [...BUILT_IN_TRACKS, ...customTracks];

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
      <div className={`start-card ${isDragging ? 'dragging' : ''}`}>
        <header className="start-header">
          <div>
            <span className="badge-version">ThorVG WASM v1.1.3 · Web Lightweight v3.1</span>
            <h1 className="title-logo">THORVG RUN</h1>
            <p className="subtitle">
              2D 벡터 오디오 파형 무한 스케일 액션 플랫포머
            </p>
          </div>
          <a
            href="https://github.com/OSSCA-thorvg/GameJam-ThorVG-Run"
            target="_blank"
            rel="noreferrer"
            className="github-link"
          >
            GitHub Repository ↗
          </a>
        </header>

        {/* 1. 음원 선택 (Select Track) */}
        <section className="menu-section">
          <h2>1. 음원 선택 (Select Track)</h2>
          <div className="track-list">
            {allTracks.map((track, idx) => {
              const isSelected = selectedTrack.id === track.id;
              return (
                <button
                  key={track.id}
                  type="button"
                  className={`track-item ${isSelected ? 'selected' : ''}`}
                  onClick={() => onSelectTrack(track)}
                >
                  <span className="track-icon">{track.isCustom ? '📂' : '🎵'}</span>
                  <div className="track-meta">
                    <strong>
                      {track.isCustom
                        ? `커스텀 트랙: ${track.title}`
                        : `기본 샘플 트랙 ${idx + 1}: ${track.title}`}
                    </strong>
                    <span>
                      {track.artist} · {track.durationSec}s
                    </span>
                  </div>
                  {isSelected && <span className="selected-pill">SELECTED</span>}
                </button>
              );
            })}
          </div>

          <div
            className="upload-dropzone"
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".mp3,.ogg,.wav,audio/*"
              style={{ display: 'none' }}
              onChange={(e) => void handleFiles(e.target.files)}
            />
            <span>📂 내 PC 음원 업로드 (.mp3 / .ogg / .wav 클릭 또는 드래그 앤 드롭)</span>
            {uploadStatus && <small className="upload-status">{uploadStatus}</small>}
          </div>
        </section>

        {/* 2. ThorVG 렌더러 엔진 선택 (Select Renderer Backend) */}
        <section className="menu-section">
          <h2>2. ThorVG 렌더러 엔진 선택 (Select Renderer Backend)</h2>
          <div className="renderer-radio-group">
            <label
              className={`renderer-option ${rendererMode === 'sw' ? 'selected' : ''}`}
              onClick={() => onSelectRenderer('sw')}
            >
              <input
                type="radio"
                name="renderer"
                checked={rendererMode === 'sw'}
                onChange={() => onSelectRenderer('sw')}
              />
              <span className="radio-dot" />
              <div className="renderer-info">
                <strong>🖥️ CPU Rendering (ThorVG SwCanvas - Software Rasterizer)</strong>
                <span>WASM 내부 멀티스레드/소프트웨어 벡터 래스터라이저 → Canvas2D 픽셀 출력</span>
              </div>
            </label>

            <label
              className={`renderer-option ${rendererMode === 'gl' ? 'selected' : ''}`}
              onClick={() => onSelectRenderer('gl')}
            >
              <input
                type="radio"
                name="renderer"
                checked={rendererMode === 'gl'}
                onChange={() => onSelectRenderer('gl')}
              />
              <span className="radio-dot" />
              <div className="renderer-info">
                <strong>🚀 GPU Rendering (ThorVG GlCanvas - WebGL2 Accelerated)</strong>
                <span>WebGL2 하드웨어 셰이더 파이프라인 바인딩 → 초고속 GPU 벡터 가속</span>
              </div>
            </label>
          </div>
        </section>

        {/* 3. 주파수 공명 변신 (Resonance Swap) 프리뷰 */}
        <section className="menu-section">
          <h2>3. 주파수 공명 변신 폼 프리뷰 (Skul-Style Resonance Swap)</h2>
          <div className="form-preview-tabs">
            {(['bass', 'synth', 'treble'] as ResonanceFormType[]).map((f) => {
              const cfg = FORM_CONFIG[f];
              const active = previewForm === f;
              return (
                <button
                  key={f}
                  type="button"
                  className={`form-tab ${active ? 'active' : ''}`}
                  style={{
                    borderColor: active ? cfg.colorHex : undefined,
                  }}
                  onClick={() => onSelectPreviewForm(f)}
                >
                  <strong style={{ color: cfg.colorHex }}>{cfg.name}</strong>
                  <small>{cfg.bandLabel}</small>
                  <span>{cfg.skillName}</span>
                </button>
              );
            })}
          </div>
        </section>

        <footer className="start-footer">
          <button
            type="button"
            className="start-run-btn"
            disabled={!engineReady}
            onClick={onStartRun}
          >
            {engineReady ? '▶ START RUN (게임 시작)' : '⏳ ThorVG WASM 초기화 중...'}
          </button>
          <div className="controls-hint">
            <span><strong>Space / 좌클릭</strong>: 점프 & Micro 위상 반전(+A↔-A)</span>
            <span><strong>Shift / 우클릭</strong>: 폼 고유 액션(충격파 / 대시 / 블링크)</span>
            <span><strong>1·2·3 / Q</strong>: 주파수 공명 폼 즉시 스왑</span>
          </div>
        </footer>
      </div>
    </div>
  );
};
