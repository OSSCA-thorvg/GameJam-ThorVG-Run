import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AudioEngine } from './audio/AudioEngine';
import type { AudioFormat } from './audio/audioFormats';
import { BUILT_IN_TRACKS } from './audio/proceduralTracks';
import { InGameHUD } from './components/InGameHUD';
import { ResultModal } from './components/ResultModal';
import { StartScreen } from './components/StartScreen';
import { TrackLoadingModal } from './components/TrackLoadingModal';
import { GameEngine } from './engine/GameEngine';
import { InputController } from './engine/InputController';
import { trackTitle } from './i18n/display';
import { useI18n } from './i18n/I18nProvider';
import { ThorVGRenderer } from './renderer/ThorVGRenderer';
import {
  DIFFICULTY_CONFIG,
  type DifficultyMode,
  type HUDTelemetry,
  type LoadingProgress,
  type RendererMode,
  type TrackMetadata,
} from './types/game';

const INITIAL_HUD: HUDTelemetry = {
  rendererMode: 'sw',
  difficulty: 'normal',
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
  surfMomentum: 0.25,
  speedMultiplier: 1.0,
  orbsCollected: 0,
  totalOrbs: 0,
  sectionIntensity: 'calm',
  accuracy: 100,
  rank: 'S',
  judgment: null,
  judgmentCounts: { perfect: 0, great: 0, good: 0, miss: 0 },
  gimmicksTriggered: 0,
};

type Screen = 'splash' | 'menu' | 'loading' | 'game';

export const App: React.FC = () => {
  const { t } = useI18n();
  const [rendererMode, setRendererMode] = useState<RendererMode>('sw');
  const [selectedTrack, setSelectedTrack] = useState<TrackMetadata>(BUILT_IN_TRACKS[0]!);
  const [customTracks, setCustomTracks] = useState<TrackMetadata[]>([]);
  const [difficulty, setDifficulty] = useState<DifficultyMode>('normal');
  const [engineReady, setEngineReady] = useState<boolean>(false);
  /** Increments each time a renderer finishes init, so loops can restart on the new instance. */
  const [rendererEpoch, setRendererEpoch] = useState<number>(0);
  const [screen, setScreen] = useState<Screen>('splash');
  const inGame = screen === 'game';
  const [hud, setHud] = useState<HUDTelemetry>(INITIAL_HUD);
  const [loadingState, setLoadingState] = useState<LoadingProgress>({
    progress: 0,
    stage: 'decoding',
  });

  const shellRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<ThorVGRenderer | null>(null);
  const audioRef = useRef<AudioEngine | null>(null);
  const gameEngineRef = useRef<GameEngine | null>(null);

  // Refs read by RAF preview and InputController without re-subscribing listeners.
  const difficultyRef = useRef<DifficultyMode>(difficulty);
  difficultyRef.current = difficulty;
  const inGameRef = useRef<boolean>(inGame);
  inGameRef.current = inGame;
  const isFinishedRef = useRef<boolean>(hud.isFinished);
  isFinishedRef.current = hud.isFinished;

  // The splash plays once per page load, even if the renderer is re-created later.
  const splashStartedRef = useRef<boolean>(false);
  const launchSeqRef = useRef<number>(0);

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

        if (!splashStartedRef.current) {
          splashStartedRef.current = true;
          void renderer.playSplash().then(() => {
            setScreen((current) => (current === 'splash' ? 'menu' : current));
          });
        }
      })
      .catch((err) => {
        console.error('ThorVG WASM Renderer initialization error:', err);
        splashStartedRef.current = true;
        setScreen((current) => (current === 'splash' ? 'menu' : current));
      });

    return () => {
      cancelled = true;
      renderer.destroy();
      if (rendererRef.current === renderer) {
        rendererRef.current = null;
      }
    };
  }, [rendererMode]);

  // Menu / Loading background preview loop. Reflects selected difficulty speed live!
  useEffect(() => {
    const renderer = rendererRef.current;
    if ((screen !== 'menu' && screen !== 'loading') || !renderer?.ready) return;

    let rafId = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const speedPx = DIFFICULTY_CONFIG[difficultyRef.current].worldPxPerSec;
      renderer.renderPreviewFrame((now - start) / 1000, 'synth', speedPx);
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

  const handleReturnToMenu = useCallback(() => {
    launchSeqRef.current++;
    gameEngineRef.current?.stopRun();
    setScreen('menu');
  }, []);

  // Command-Pattern InputController binding keyboard & pointer controls once
  useEffect(() => {
    const controller = new InputController({
      isGameActive: () => inGameRef.current,
      isRunFinished: () => isFinishedRef.current,
      onPrimaryPress: () => gameEngineRef.current?.handlePrimaryAction(),
      onPrimaryRelease: () => gameEngineRef.current?.setJumpHeld(false),
      onDiveHoldChange: (held) => gameEngineRef.current?.setDiveHeld(held),
      onSecondaryPress: () => gameEngineRef.current?.handleSecondaryAction(),
      onSwapForm: (form) => gameEngineRef.current?.handleFormSwap(form),
      onPauseOrExit: handleReturnToMenu,
    });
    return controller.attach(shellRef.current);
  }, [handleReturnToMenu]);

  const handleUploadFile = useCallback(
    async (file: File, supportedFormats: readonly AudioFormat[]) => {
      if (!audioRef.current) return;
      const decodedTrack = await audioRef.current.decodeLocalFile(file, supportedFormats);
      setCustomTracks((prev) => [decodedTrack, ...prev]);
      setSelectedTrack(decodedTrack);
    },
    []
  );

  const handleSelectDifficulty = useCallback((nextDiff: DifficultyMode) => {
    setDifficulty(nextDiff);
    gameEngineRef.current?.setDifficulty(nextDiff);
  }, []);

  const handleStartRun = useCallback(() => {
    const engine = gameEngineRef.current;
    if (!engine) return;

    const seq = ++launchSeqRef.current;
    setHud((prev) => ({
      ...INITIAL_HUD,
      rendererMode,
      difficulty,
      activeForm: prev.activeForm,
    }));
    setLoadingState({ progress: 0.06, stage: 'decoding' });
    setScreen('loading');

    void (async () => {
      try {
        const blueprint = await engine.prepareRun(
          selectedTrack,
          (status) => {
            if (launchSeqRef.current === seq) {
              setLoadingState(status);
            }
          },
          difficulty
        );
        if (launchSeqRef.current !== seq) return;
        setLoadingState({ progress: 1.0, stage: 'ready', blueprint });

        // Brief hold at 100% so the player can see the pre-computed track waveform minimap
        await new Promise((r) => setTimeout(r, 480));
        if (launchSeqRef.current !== seq) return;

        setScreen('game');
        await engine.startRun(selectedTrack, undefined, difficulty);
      } catch (err) {
        console.error('Track blueprint preparation failed:', err);
        if (launchSeqRef.current === seq) {
          setScreen('menu');
        }
      }
    })();
  }, [difficulty, rendererMode, selectedTrack]);

  const handleSwitchRendererAndReplay = useCallback(
    (nextMode: RendererMode) => {
      gameEngineRef.current?.stopRun();
      setRendererMode(nextMode);
      setTimeout(() => {
        handleStartRun();
      }, 120);
    },
    [handleStartRun]
  );

  return (
    <div ref={shellRef} className="app-shell">
      {/* Keyed by rendererMode so React cleanly replaces DOM <canvas> on CPU <-> GPU switch */}
      <canvas key={rendererMode} ref={canvasRef} id="tvg-canvas" className="tvg-canvas" />

      {screen === 'menu' && (
        <StartScreen
          selectedTrack={selectedTrack}
          customTracks={customTracks}
          rendererMode={rendererMode}
          difficulty={difficulty}
          engineReady={engineReady}
          onSelectTrack={setSelectedTrack}
          onUploadFile={handleUploadFile}
          onSelectRenderer={setRendererMode}
          onSelectDifficulty={handleSelectDifficulty}
          onStartRun={handleStartRun}
        />
      )}

      {screen === 'loading' && (
        <TrackLoadingModal
          trackTitle={trackTitle(t, selectedTrack)}
          loadingState={loadingState}
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
