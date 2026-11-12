import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AudioEngine } from './audio/AudioEngine';
import type { AudioFormat } from './audio/audioFormats';
import { BUILT_IN_TRACKS } from './audio/proceduralTracks';
import { InGameHUD } from './components/InGameHUD';
import { PauseOverlay } from './components/PauseOverlay';
import { ResultModal } from './components/ResultModal';
import { StartScreen } from './components/StartScreen';
import { TrackLoadingModal } from './components/TrackLoadingModal';
import { GameEngine } from './engine/GameEngine';
import { InputController } from './engine/InputController';
import { getUnlockedSkins, loadSelectedSkin, saveSelectedSkin } from './engine/recordsStore';
import { trackTitle } from './i18n/display';
import { useI18n } from './i18n/I18nProvider';
import { ThorVGRenderer } from './renderer/ThorVGRenderer';
import {
  DIFFICULTY_CONFIG,
  type CrewmateSkinId,
  type DifficultyMode,
  type HUDTelemetry,
  type LoadingProgress,
  type RendererMode,
  type ResonanceFormType,
  type TrackMetadata,
} from './types/game';

const PLAYSTYLE_STORAGE_KEY = 'thorvg-run:playstyle:v1';
const CINEMATIC_STORAGE_KEY = 'thorvg-run:cinematic:v1';

function loadInitialPlaystyle(): ResonanceFormType {
  try {
    const raw = window.localStorage.getItem(PLAYSTYLE_STORAGE_KEY);
    if (raw === 'bass' || raw === 'synth' || raw === 'treble') {
      return raw;
    }
  } catch {
    // Ignore storage access errors (e.g. private browsing / restricted context).
  }
  return 'synth';
}

function loadInitialCinematic(): boolean {
  try {
    const raw = window.localStorage.getItem(CINEMATIC_STORAGE_KEY);
    if (raw === '0' || raw === 'false') {
      return false;
    }
  } catch {
    // Ignore storage access errors (e.g. private browsing / restricted context).
  }
  return true;
}

const INITIAL_HUD: HUDTelemetry = {
  rendererMode: 'sw',
  difficulty: 'normal',
  sfxMode: 'full',
  fps: 60,
  zoomDisplay: 1.0,
  cinematicCamera: true,
  score: 0,
  combo: 1,
  maxCombo: 1,
  progress: 0,
  activeForm: 'synth',
  resonanceGauge: 40,
  grooveHp: 100,
  maxGrooveHp: 100,
  skillCooldownRatio: 0,
  skillCooldownSec: 0,
  overdriveReady: false,
  overdriveActive: false,
  statusBanner: null,
  isFinished: false,
  isFailed: false,
  newlyUnlockedSkins: [],
  trapsDestroyed: 0,
  surfMomentum: 0.25,
  speedMultiplier: 1.0,
  orbsCollected: 0,
  totalOrbs: 0,
  starsCollected: 0,
  totalStars: 3,
  sectionIntensity: 'calm',
  accuracy: 100,
  rank: 'S',
  judgment: null,
  judgmentCounts: { perfect: 0, great: 0, good: 0, miss: 0 },
  gimmicksTriggered: 0,
  isNewRecord: false,
  scoreDelta: 0,
};

type Screen = 'splash' | 'menu' | 'loading' | 'game';

export const App: React.FC = () => {
  const { t } = useI18n();
  const [rendererMode, setRendererMode] = useState<RendererMode>('sw');
  const [selectedTrack, setSelectedTrack] = useState<TrackMetadata>(BUILT_IN_TRACKS[0]!);
  const [customTracks, setCustomTracks] = useState<TrackMetadata[]>([]);
  const [playstyle, setPlaystyle] = useState<ResonanceFormType>(() => loadInitialPlaystyle());
  const [cinematicCamera, setCinematicCamera] = useState<boolean>(() => loadInitialCinematic());
  const [difficulty, setDifficulty] = useState<DifficultyMode>('normal');
  const [unlockedSkins, setUnlockedSkins] = useState<CrewmateSkinId[]>(() => getUnlockedSkins());
  const [selectedSkin, setSelectedSkin] = useState<CrewmateSkinId>(() => loadSelectedSkin());
  const [engineReady, setEngineReady] = useState<boolean>(false);
  /** Increments each time a renderer finishes init, so loops can restart on the new instance. */
  const [rendererEpoch, setRendererEpoch] = useState<number>(0);
  const [launchKey, setLaunchKey] = useState<number>(0);
  const [screen, setScreen] = useState<Screen>('splash');
  const inGame = screen === 'game';
  const [hud, setHud] = useState<HUDTelemetry>(() => ({
    ...INITIAL_HUD,
    activeForm: playstyle,
    cinematicCamera,
  }));
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
  const playstyleRef = useRef<ResonanceFormType>(playstyle);
  playstyleRef.current = playstyle;
  const cinematicCameraRef = useRef<boolean>(cinematicCamera);
  cinematicCameraRef.current = cinematicCamera;
  const difficultyRef = useRef<DifficultyMode>(difficulty);
  difficultyRef.current = difficulty;
  const selectedSkinRef = useRef<CrewmateSkinId>(selectedSkin);
  selectedSkinRef.current = selectedSkin;
  const finishedAtRef = useRef<number>(0);
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
    const engine = new GameEngine(audioRef.current, (nextHud) => {
      if (nextHud.isFinished) {
        if (finishedAtRef.current === 0) {
          finishedAtRef.current = performance.now();
        }
      } else {
        finishedAtRef.current = 0;
      }
      setHud(nextHud);
    });
    engine.setPlaystyle(playstyle);
    engine.setCinematicCamera(cinematicCameraRef.current);
    engine.setSelectedSkin(selectedSkinRef.current);
    gameEngineRef.current = engine;
  }

  useEffect(() => {
    gameEngineRef.current?.setPlaystyle(playstyle);
  }, [playstyle]);

  useEffect(() => {
    cinematicCameraRef.current = cinematicCamera;
    gameEngineRef.current?.setCinematicCamera(cinematicCamera);
  }, [cinematicCamera]);

  useEffect(() => {
    selectedSkinRef.current = selectedSkin;
    gameEngineRef.current?.setSelectedSkin(selectedSkin);
  }, [selectedSkin]);

  useEffect(() => {
    if (hud.isFinished) {
      if (finishedAtRef.current === 0) {
        finishedAtRef.current = performance.now();
      }
      setUnlockedSkins(getUnlockedSkins());
    } else {
      finishedAtRef.current = 0;
    }
  }, [hud.isFinished, hud.newlyUnlockedSkins]);

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
        const w = window.innerWidth;
        const h = window.innerHeight;
        renderer.resize(w, h);
        gameEngineRef.current?.setCinematicCamera(cinematicCameraRef.current);
        gameEngineRef.current?.setSelectedSkin(selectedSkinRef.current);
        gameEngineRef.current?.attachRenderer(renderer, rendererMode, w, h);
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

  // Menu background preview loop. Stopped and cleared immediately on 'loading' / 'game'.
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer?.ready) return;

    if (screen === 'loading') {
      renderer.clearForTransition();
      return;
    }
    if (screen !== 'menu') return;

    let rafId = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const speedPx = DIFFICULTY_CONFIG[difficultyRef.current].worldPxPerSec;
      renderer.renderPreviewFrame(
        (now - start) / 1000,
        playstyleRef.current,
        speedPx,
        selectedSkinRef.current
      );
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
    finishedAtRef.current = 0;
    gameEngineRef.current?.stopRun();
    rendererRef.current?.clearForTransition();
    setUnlockedSkins(getUnlockedSkins());
    setHud((prev) => ({ ...prev, isPaused: false, userZoom: 1.0, isPanned: false }));
    setScreen('menu');
  }, []);

  const handleTogglePause = useCallback(() => {
    audioRef.current?.unlockFromGesture();
    gameEngineRef.current?.togglePause();
  }, []);

  const handlePauseRun = useCallback(() => {
    gameEngineRef.current?.pauseRun();
  }, []);

  const handleResumeRun = useCallback(() => {
    audioRef.current?.unlockFromGesture();
    void gameEngineRef.current?.resumeRun();
  }, []);

  const handleStepZoom = useCallback((factor: number) => {
    gameEngineRef.current?.zoomByFactor(factor);
  }, []);

  const handleSetZoom = useCallback((zoom: number) => {
    gameEngineRef.current?.setUserZoom(zoom);
  }, []);

  const handleResetView = useCallback(() => {
    gameEngineRef.current?.resetCameraView();
  }, []);

  const handleToggleCinematicCamera = useCallback(() => {
    const next = gameEngineRef.current
      ? gameEngineRef.current.toggleCinematicCamera()
      : !cinematicCameraRef.current;
    cinematicCameraRef.current = next;
    setCinematicCamera(next);
    try {
      window.localStorage.setItem(CINEMATIC_STORAGE_KEY, next ? '1' : '0');
    } catch {
      // Ignore storage access errors.
    }
    setHud((prev) => ({ ...prev, cinematicCamera: next }));
  }, []);

  const handleUploadFile = useCallback(
    async (file: File, supportedFormats: readonly AudioFormat[]) => {
      if (!audioRef.current) return;
      const decodedTrack = await audioRef.current.decodeLocalFile(file, supportedFormats);
      setCustomTracks((prev) => [decodedTrack, ...prev]);
      setSelectedTrack(decodedTrack);
    },
    []
  );

  const handleSelectPlaystyle = useCallback((nextStyle: ResonanceFormType) => {
    playstyleRef.current = nextStyle;
    setPlaystyle(nextStyle);
    try {
      window.localStorage.setItem(PLAYSTYLE_STORAGE_KEY, nextStyle);
    } catch {
      // Ignore storage access errors.
    }
    gameEngineRef.current?.setPlaystyle(nextStyle);
    setHud((prev) => ({ ...prev, activeForm: nextStyle }));
  }, []);

  const handleSelectDifficulty = useCallback((nextDiff: DifficultyMode) => {
    setDifficulty(nextDiff);
    gameEngineRef.current?.setDifficulty(nextDiff);
  }, []);

  const handleSelectSkin = useCallback((skinId: CrewmateSkinId) => {
    const saved = saveSelectedSkin(skinId);
    selectedSkinRef.current = saved;
    setSelectedSkin(saved);
    setUnlockedSkins(getUnlockedSkins());
    gameEngineRef.current?.setSelectedSkin(saved);
  }, []);

  const handleStartRun = useCallback(() => {
    const engine = gameEngineRef.current;
    if (!engine) return;

    audioRef.current?.unlockFromGesture();
    const seq = ++launchSeqRef.current;
    finishedAtRef.current = 0;
    rendererRef.current?.clearForTransition();
    engine.setPlaystyle(playstyle);
    engine.setCinematicCamera(cinematicCamera);
    engine.setSelectedSkin(selectedSkinRef.current);
    setHud((prev) => ({
      ...INITIAL_HUD,
      grooveHp: 100,
      maxGrooveHp: 100,
      isFailed: false,
      newlyUnlockedSkins: [],
      rendererMode,
      difficulty,
      sfxMode: gameEngineRef.current?.getSfxMode() ?? prev.sfxMode ?? 'full',
      activeForm: playstyle,
      cinematicCamera,
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

        const runPromise = engine.startRun(selectedTrack, undefined, difficulty, playstyle);
        setLaunchKey((k) => k + 1);
        setScreen('game');
        await runPromise;
      } catch (err) {
        console.error('Track blueprint preparation failed:', err);
        if (launchSeqRef.current === seq) {
          setScreen('menu');
        }
      }
    })();
  }, [cinematicCamera, difficulty, playstyle, rendererMode, selectedTrack]);

  const handleStartRunRef = useRef(handleStartRun);
  handleStartRunRef.current = handleStartRun;

  // Command-Pattern InputController binding keyboard & pointer controls once
  useEffect(() => {
    const controller = new InputController({
      isGameActive: () => inGameRef.current,
      isPaused: () => Boolean(gameEngineRef.current?.isPaused),
      isRunFinished: () => isFinishedRef.current,
      onPrimaryPress: () => gameEngineRef.current?.handlePrimaryAction(),
      onPrimaryRelease: () => gameEngineRef.current?.setJumpHeld(false),
      onDiveHoldChange: (held) => gameEngineRef.current?.setDiveHeld(held),
      onSecondaryPress: () => gameEngineRef.current?.handleSecondaryAction(),
      onActivateOverdrive: () => {
        gameEngineRef.current?.activateOverdrive();
      },
      onCycleSfxMode: () => {
        const next = gameEngineRef.current?.cycleSfxMode();
        if (next) {
          setHud((prev) => ({ ...prev, sfxMode: next }));
        }
      },
      onToggleCinematicCamera: handleToggleCinematicCamera,
      onTogglePause: handleTogglePause,
      onExitToMenu: handleReturnToMenu,
      onReplayRun: () => {
        if (finishedAtRef.current > 0 && performance.now() - finishedAtRef.current < 550) {
          return;
        }
        void handleStartRunRef.current();
      },
      onWheelZoom: (factor, canvasX, canvasY) => {
        gameEngineRef.current?.zoomByFactor(factor, canvasX, canvasY);
      },
      onStepZoom: (factor) => {
        gameEngineRef.current?.zoomByFactor(factor);
      },
      onResetZoom: () => {
        gameEngineRef.current?.resetCameraView();
      },
      onPanDelta: (dx, dy) => {
        gameEngineRef.current?.panCamera(dx, dy);
      },
    });
    return controller.attach(shellRef.current);
  }, [handleReturnToMenu, handleToggleCinematicCamera, handleTogglePause]);

  const handleSwitchRendererAndReplay = useCallback(
    (nextMode: RendererMode) => {
      audioRef.current?.unlockFromGesture();
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
      <canvas
        key={rendererMode}
        ref={canvasRef}
        id="tvg-canvas"
        className={`tvg-canvas${inGame && hud.isPaused && !hud.isFinished ? ' paused-inspectable' : ''}`}
      />

      {screen === 'menu' && (
        <StartScreen
          selectedTrack={selectedTrack}
          customTracks={customTracks}
          rendererMode={rendererMode}
          playstyle={playstyle}
          difficulty={difficulty}
          selectedSkin={selectedSkin}
          unlockedSkins={unlockedSkins}
          engineReady={engineReady}
          onSelectTrack={setSelectedTrack}
          onUploadFile={handleUploadFile}
          onSelectRenderer={setRendererMode}
          onSelectPlaystyle={handleSelectPlaystyle}
          onSelectDifficulty={handleSelectDifficulty}
          onSelectSkin={handleSelectSkin}
          onStartRun={handleStartRun}
        />
      )}

      {screen === 'loading' && (
        <TrackLoadingModal
          trackTitle={trackTitle(t, selectedTrack)}
          loadingState={loadingState}
        />
      )}

      {inGame && !hud.isPaused && !hud.isFinished && (
        <InGameHUD
          hud={hud}
          trackTitle={trackTitle(t, selectedTrack)}
          onReturnToMenu={handleReturnToMenu}
          onPause={handlePauseRun}
          onStepZoom={handleStepZoom}
          onResetZoom={handleResetView}
          onToggleCinematicCamera={handleToggleCinematicCamera}
          onToggleRendererInGame={(nextMode) => setRendererMode(nextMode)}
          onCycleSfxMode={() => {
            const next = gameEngineRef.current?.cycleSfxMode();
            if (next) {
              setHud((prev) => ({ ...prev, sfxMode: next }));
            }
          }}
          onActivateOverdrive={() => {
            gameEngineRef.current?.activateOverdrive();
          }}
        />
      )}

      {inGame && Boolean(hud.isPaused) && !hud.isFinished && (
        <PauseOverlay
          hud={hud}
          trackTitle={trackTitle(t, selectedTrack)}
          onResume={handleResumeRun}
          onReturnToMenu={handleReturnToMenu}
          onSetZoom={handleSetZoom}
          onStepZoom={handleStepZoom}
          onResetView={handleResetView}
          onToggleRenderer={(nextMode) => setRendererMode(nextMode)}
        />
      )}

      {inGame && launchKey > 0 && (
        <div key={launchKey} className="game-launch-veil" aria-hidden="true" />
      )}

      {inGame && hud.isFinished && (
        <ResultModal
          hud={hud}
          trackTitle={trackTitle(t, selectedTrack)}
          selectedSkin={selectedSkin}
          onEquipSkin={handleSelectSkin}
          onReplay={handleStartRun}
          onSwitchRendererAndReplay={handleSwitchRendererAndReplay}
          onReturnToMenu={handleReturnToMenu}
        />
      )}
    </div>
  );
};

export default App;
