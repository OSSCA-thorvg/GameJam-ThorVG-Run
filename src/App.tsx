import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AudioEngine } from './audio/AudioEngine';
import type { AudioFormat } from './audio/audioFormats';
import { BUILT_IN_TRACKS } from './audio/proceduralTracks';
import { InGameHUD } from './components/InGameHUD';
import { ResultModal } from './components/ResultModal';
import { StartScreen } from './components/StartScreen';
import { GameEngine } from './engine/GameEngine';
import { trackTitle } from './i18n/display';
import { useI18n } from './i18n/I18nProvider';
import { ThorVGRenderer } from './renderer/ThorVGRenderer';
import {
  type HUDTelemetry,
  type RendererMode,
  type ResonanceFormType,
  type TrackMetadata,
} from './types/game';

const INITIAL_HUD: HUDTelemetry = {
  rendererMode: 'sw',
  fps: 60,
  phase: 'MACRO',
  zoomDisplay: 1.0,
  score: 0,
  combo: 1,
  maxCombo: 1,
  progress: 0,
  activeForm: 'synth',
  resonanceGauge: 40,
  acousticFilter: 'macro',
  statusBanner: null,
  isFinished: false,
  trapsDestroyed: 0,
  divesCompleted: 0,
};

type Screen = 'menu' | 'game';

export const App: React.FC = () => {
  const { t } = useI18n();
  const [rendererMode, setRendererMode] = useState<RendererMode>('sw');
  const [selectedTrack, setSelectedTrack] = useState<TrackMetadata>(BUILT_IN_TRACKS[0]!);
  const [customTracks, setCustomTracks] = useState<TrackMetadata[]>([]);
  const [previewForm, setPreviewForm] = useState<ResonanceFormType>('synth');
  const [engineReady, setEngineReady] = useState<boolean>(false);
  /** Increments each time a renderer finishes init, so loops can restart on the new instance. */
  const [rendererEpoch, setRendererEpoch] = useState<number>(0);
  const [screen, setScreen] = useState<Screen>('menu');
  const inGame = screen === 'game';
  const [hud, setHud] = useState<HUDTelemetry>(INITIAL_HUD);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<ThorVGRenderer | null>(null);
  const audioRef = useRef<AudioEngine | null>(null);
  const gameEngineRef = useRef<GameEngine | null>(null);
  // Read inside loops without re-creating the WASM renderer.
  const previewFormRef = useRef<ResonanceFormType>(previewForm);
  previewFormRef.current = previewForm;

  if (!audioRef.current) {
    audioRef.current = new AudioEngine();
  }
  if (!gameEngineRef.current) {
    gameEngineRef.current = new GameEngine(audioRef.current, (nextHud) => {
      setHud(nextHud);
    });
  }

  // Create the ThorVG renderer ('sw' SwCanvas or 'gl' GlCanvas) on a fresh
  // <canvas key={rendererMode} />. Re-created ONLY when the renderer backend changes.
  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;

    let cancelled = false;
    const renderer = new ThorVGRenderer(rendererMode);
    rendererRef.current = renderer;
    setEngineReady(false);

    renderer
      .init(canvasEl, window.innerWidth, window.innerHeight)
      .then(() => {
        if (cancelled || !renderer.ready) return;
        gameEngineRef.current?.attachRenderer(
          renderer,
          rendererMode,
          window.innerWidth,
          window.innerHeight
        );
        setEngineReady(true);
        setRendererEpoch((n) => n + 1);
      })
      .catch((err) => {
        console.error('ThorVG WASM Renderer initialization error:', err);
      });

    return () => {
      cancelled = true;
      renderer.destroy();
      if (rendererRef.current === renderer) {
        rendererRef.current = null;
      }
    };
  }, [rendererMode]);

  // Menu preview loop. In 'game' the GameEngine owns the frame loop instead.
  useEffect(() => {
    const renderer = rendererRef.current;
    if (screen !== 'menu' || !renderer?.ready) return;

    let rafId = 0;
    const start = performance.now();
    const tick = (now: number) => {
      renderer.renderPreviewFrame((now - start) / 1000, previewFormRef.current);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [screen, rendererEpoch]);

  // Responsive viewport resize listener
  useEffect(() => {
    const onResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      rendererRef.current?.resize(w, h);
      gameEngineRef.current?.resize(w, h);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Keyboard controls for Jump / Phase Invert, Dash / Form Skill, and Resonance Swap
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!inGame) return;
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
        e.preventDefault();
        gameEngineRef.current?.handlePrimaryAction();
      } else if (
        e.code === 'ShiftLeft' ||
        e.code === 'ShiftRight' ||
        e.code === 'ArrowDown' ||
        e.code === 'KeyS'
      ) {
        e.preventDefault();
        gameEngineRef.current?.handleSecondaryAction();
      } else if (e.code === 'Digit1') {
        gameEngineRef.current?.handleFormSwap('bass');
      } else if (e.code === 'Digit2') {
        gameEngineRef.current?.handleFormSwap('synth');
      } else if (e.code === 'Digit3') {
        gameEngineRef.current?.handleFormSwap('treble');
      } else if (e.code === 'KeyQ') {
        gameEngineRef.current?.handleFormSwap();
      } else if (e.code === 'Escape') {
        gameEngineRef.current?.stopRun();
        setScreen('menu');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [inGame]);

  const handleUploadFile = useCallback(async (file: File, supportedFormats: readonly AudioFormat[]) => {
    if (!audioRef.current) return;
    const decodedTrack = await audioRef.current.decodeLocalFile(file, supportedFormats);
    setCustomTracks((prev) => [decodedTrack, ...prev]);
    setSelectedTrack(decodedTrack);
  }, []);

  const handleStartRun = useCallback(() => {
    setHud((prev) => ({
      ...INITIAL_HUD,
      rendererMode,
      activeForm: prev.activeForm,
    }));
    setScreen('game');
    void gameEngineRef.current?.startRun(selectedTrack);
  }, [rendererMode, selectedTrack]);

  const handleReturnToMenu = useCallback(() => {
    gameEngineRef.current?.stopRun();
    setScreen('menu');
  }, []);

  const handleSwitchRendererAndReplay = useCallback(
    (nextMode: RendererMode) => {
      gameEngineRef.current?.stopRun();
      setRendererMode(nextMode);
      setTimeout(() => {
        setScreen('game');
        void gameEngineRef.current?.startRun(selectedTrack);
      }, 120);
    },
    [selectedTrack]
  );

  return (
    <div
      className="app-shell"
      onMouseDown={(e) => {
        if (!inGame || hud.isFinished) return;
        // Ignore clicks on HUD buttons
        if ((e.target as HTMLElement).closest('button')) return;
        if (e.button === 0) {
          gameEngineRef.current?.handlePrimaryAction();
        } else if (e.button === 2) {
          gameEngineRef.current?.handleSecondaryAction();
        }
      }}
      onContextMenu={(e) => {
        if (inGame) e.preventDefault();
      }}
    >
      {/* Keyed by rendererMode so React cleanly replaces DOM <canvas> on CPU <-> GPU switch */}
      <canvas
        key={rendererMode}
        ref={canvasRef}
        id="tvg-canvas"
        className="tvg-canvas"
      />

      {!inGame && (
        <StartScreen
          selectedTrack={selectedTrack}
          customTracks={customTracks}
          rendererMode={rendererMode}
          previewForm={previewForm}
          engineReady={engineReady}
          onSelectTrack={setSelectedTrack}
          onUploadFile={handleUploadFile}
          onSelectRenderer={setRendererMode}
          onSelectPreviewForm={setPreviewForm}
          onStartRun={handleStartRun}
        />
      )}

      {inGame && (
        <InGameHUD
          hud={hud}
          trackTitle={trackTitle(t, selectedTrack)}
          onReturnToMenu={handleReturnToMenu}
          onToggleRendererInGame={(nextMode) => setRendererMode(nextMode)}
          onSwapForm={(form) => gameEngineRef.current?.handleFormSwap(form)}
        />
      )}

      {inGame && hud.isFinished && (
        <ResultModal
          hud={hud}
          trackTitle={trackTitle(t, selectedTrack)}
          onReplay={handleStartRun}
          onSwitchRendererAndReplay={handleSwitchRendererAndReplay}
          onReturnToMenu={handleReturnToMenu}
        />
      )}
    </div>
  );
};

export default App;
