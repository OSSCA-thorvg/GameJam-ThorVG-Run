import { AudioEngine } from '../audio/AudioEngine';
import { analyzeTrackBlueprint, WORLD_PX_PER_SEC } from '../audio/TrackAnalyzer';
import { ThorVGRenderer } from '../renderer/ThorVGRenderer';
import {
  CHORD_SYNC_WINDOW_SEC,
  DIFFICULTY_CONFIG,
  FORM_CONFIG,
  type BannerMessage,
  type BeatTarget,
  type CrewmateSkinId,
  type DifficultyMode,
  type FrequencyBands,
  type HUDTelemetry,
  type JudgmentGrade,
  type LoadingProgress,
  type RendererMode,
  type ResonanceFormType,
  type SectionIntensity,
  type SfxMode,
  type SlashLane,
  type TrackBlueprint,
  type TrackMetadata,
} from '../types/game';
import { BezierTerrain } from './BezierTerrain';
import { PlayerController } from './PlayerController';
import { nextSfxMode, saveTrackRunResult } from './recordsStore';
import { ScoreJudgeSystem } from './systems/ScoreJudgeSystem';
import { VfxPoolSystem } from './systems/VfxPoolSystem';

export const RETICLE_X_RATIO = 0.25;
export const PLAYER_HIT_X_RATIO = RETICLE_X_RATIO;

const OVERDRIVE_DURATION_SEC = 8.0;
const HUD_PUBLISH_INTERVAL_SEC = 0.05; // 20Hz steady telemetry + 0ms instant flush on discrete dirty events
const KEY_FLASH_DURATION_SEC = 0.09;
const LIVE_MIN_ZOOM = 0.35;
const LIVE_MAX_ZOOM = 4.0;
const PAUSED_MIN_ZOOM = 0.2;
const PAUSED_MAX_ZOOM = 20.0;

const CYAN_RGB: readonly [number, number, number] = [5, 213, 255];
const CRIMSON_RGB: readonly [number, number, number] = [255, 42, 109];
const GOLD_RGB: readonly [number, number, number] = [255, 230, 0];

/**
 * Core 60fps 2-Lane Instant Rhythm Slasher Coordinator (`rhythm-slasher-v6`):
 * - 100% Active Agency: zero passive/magnet note collection; every target is sliced at the Dual Reticle
 * - `[Fix 2]` World scroll (`cameraX`) NEVER freezes during hitstop (`0.0ms` scroll lag)
 * - `[Fix 3]` Pause-continuous `getEffectiveElapsedSec()` + sub-frame `e.timeStamp` compensation + live sync offset
 * - `[Fix 4]` Reticle focal lock (`fx = getReticleScreenX()`), `50ms` `CHORD` sync window, `75ms` `HOLD` grace, `RUSH` lock-on
 * - `[Fix 5]` Zero-cooldown `applyMissGrooveDrain` (`-16 HP` Standard) vs `0.45s` `applyHazardDamage`
 */
export class GameEngine {
  private readonly audio: AudioEngine;
  private readonly terrain: BezierTerrain;
  private readonly playerController: PlayerController;
  private readonly scoreJudge: ScoreJudgeSystem;
  private readonly vfx: VfxPoolSystem;
  private renderer: ThorVGRenderer | null = null;
  private readonly onHudUpdate: (hud: HUDTelemetry) => void;

  private width: number = 1280;
  private height: number = 720;
  private rendererMode: RendererMode = 'sw';
  private difficulty: DifficultyMode = 'standard';

  private activeBlueprint: TrackBlueprint | null = null;
  private currentTrackMeta: TrackMetadata | null = null;
  private finishRecorded: boolean = false;
  private finishedAudioSec: number = 0;
  private lastIsNewRecord: boolean = false;
  private lastScoreDelta: number = 0;

  // Loop, Timing & HUD Throttling
  private rafId: number = 0;
  private running: boolean = false;
  private lastFrameTime: number = 0;
  private elapsedSec: number = 0;
  private fpsFrames: number = 0;
  private fpsAccum: number = 0;
  private currentFps: number = 60;
  private hudPublishAccum: number = 0;
  private hudDirty: boolean = true;

  // 2-Lane Slasher World & Character State
  private cameraX: number = 0;
  private prevRenderCameraX: number = 0;
  private baseSpeed: number = WORLD_PX_PER_SEC;
  private playerLane: SlashLane = 'low';
  private highAirHangTimer: number = 0;
  private chordPoseTimer: number = 0;
  private playerY: number = 520;
  private playerRotation: number = 0;
  private readonly playerRadius: number = 22;
  private slashRecoilX: number = 0;
  private slashAltToggle: number = 0;
  private isGrinding: boolean = false;
  private surfMomentum: number = 0.25;
  private beatPulse: number = 0;
  private reticlePulseHigh: number = 0;
  private reticlePulseLow: number = 0;
  private lastBeatSliceIndex: number = -1;
  private currentSectionIntensity: SectionIntensity = 'calm';
  private invulnerableTimer: number = 0;
  private runCycleTime: number = 0;
  private firstUnresolvedIdx: number = 0;
  private activeRushCombo: number = 0;

  // Live Key Hold & Receptor Flash State
  private laneHighHeld: boolean = false;
  private laneLowHeld: boolean = false;
  private laneChordHeld: boolean = false;
  private highKeyFlashTimer: number = 0;
  private lowKeyFlashTimer: number = 0;
  private chordKeyFlashTimer: number = 0;

  // Screen Shake State
  private shakeTimer: number = 0;
  private shakeDuration: number = 0.2;
  private shakeIntensity: number = 0;

  // Live Music Resonance, Skin, Groove HP & Overdrive State
  private activeForm: ResonanceFormType = 'synth';
  private resonanceHoldTimer: number = 0;
  private selectedSkin: CrewmateSkinId = 'classic';
  private resonanceGauge: number = 35;
  private overdriveTimer: number = 0;
  private overdriveNotifiedReady: boolean = false;
  private grooveHp: number = 100;
  private readonly maxGrooveHp: number = 100;
  private hazardDamageCooldown: number = 0;
  private isFailed: boolean = false;

  // Status Banner State
  private statusBanner: BannerMessage | null = null;
  private statusBannerTimer: number = 0;

  // Pause & Interactive Vector Camera State
  private paused: boolean = false;
  private pauseSeq: number = 0;
  private pausedAudioSec: number = 0;
  private pausedFreq: FrequencyBands = {
    low: 0.1,
    mid: 0.1,
    high: 0.1,
    overall: 0.1,
    isBeat: false,
  };
  private lastSpeedMultiplier: number = 1.0;
  private userZoom: number = 1.0;
  private savedLiveZoom: number = 1.0;
  private panX: number = 0;
  private panY: number = 0;
  private hasManualPan: boolean = false;
  private pausedRenderRaf: number = 0;

  // Dynamic Vector Cinematic Camera & Non-Freezing Hitstop State (`[Fix 2]`)
  private cinematicCamera: boolean = true;
  private cinematicZoom: number = 1.0;
  private impactZoomPunch: number = 0;
  private hitstopTimer: number = 0;
  private hitstopCooldownTimer: number = 0;
  private hitstopFreezePlayerY: number = 520;
  private hitstopFreezeRunCycle: number = 0;

  constructor(audio: AudioEngine, onHudUpdate: (hud: HUDTelemetry) => void) {
    this.audio = audio;
    this.terrain = new BezierTerrain();
    this.playerController = new PlayerController();
    this.scoreJudge = new ScoreJudgeSystem();
    this.vfx = new VfxPoolSystem();
    this.onHudUpdate = onHudUpdate;
  }

  public attachRenderer(
    renderer: ThorVGRenderer,
    mode: RendererMode,
    width: number,
    height: number
  ): void {
    const sizeChanged = width !== this.width || height !== this.height;
    this.renderer = renderer;
    this.rendererMode = mode;
    this.width = width;
    this.height = height;
    this.terrain.setViewportSize(width, height);
    if (sizeChanged) {
      this.realignPlayerToCurrentLane();
    }
    this.hudDirty = true;
    if (this.running && this.paused) {
      if (this.cinematicCamera) {
        this.cinematicZoom = this.computeTargetCinematicZoom(this.pausedAudioSec);
      }
      this.cameraX = this.pausedAudioSec * this.baseSpeed - this.getReticleScreenX();
      this.prevRenderCameraX = this.cameraX;
      if (!this.hasManualPan) {
        this.applyNeutralPausedFraming(this.userZoom);
      } else {
        this.clampPausedPan();
      }
      this.refreshPausedView(true);
    } else if (!this.running && this.finishRecorded && this.activeBlueprint) {
      if (this.cinematicCamera) {
        this.cinematicZoom = this.computeTargetCinematicZoom(this.finishedAudioSec);
      }
      this.cameraX = this.finishedAudioSec * this.baseSpeed - this.getReticleScreenX();
      this.prevRenderCameraX = this.cameraX;
      this.terrain.update(
        this.cameraX,
        this.width,
        this.height,
        this.elapsedSec,
        this.pausedFreq,
        this.computeViewWorldBounds(true)
      );
      this.renderCurrentState(this.finishedAudioSec, this.pausedFreq);
    }
  }

  public setRenderer(
    renderer: ThorVGRenderer,
    mode: RendererMode = this.rendererMode,
    width: number = this.width,
    height: number = this.height
  ): void {
    this.attachRenderer(renderer, mode, width, height);
  }

  public setDifficulty(difficulty: DifficultyMode): void {
    this.difficulty = difficulty;
    this.hudDirty = true;
  }

  public getDifficulty(): DifficultyMode {
    return this.difficulty;
  }

  private shiftActiveForm(nextForm: ResonanceFormType, holdSec: number = 0): void {
    if (holdSec > 0) {
      this.resonanceHoldTimer = Math.max(this.resonanceHoldTimer, holdSec);
    }
    if (this.activeForm !== nextForm) {
      this.activeForm = nextForm;
      this.playerController.setResonance(nextForm);
      this.hudDirty = true;
    }
  }

  public setSelectedSkin(skinId: CrewmateSkinId): void {
    if (this.selectedSkin === skinId) return;
    this.selectedSkin = skinId;
    if (this.paused) {
      this.refreshPausedView(false);
    }
  }

  public getSelectedSkin(): CrewmateSkinId {
    return this.selectedSkin;
  }

  public setSfxMode(mode: SfxMode): void {
    this.audio.setSfxMode(mode);
    this.hudDirty = true;
    if (this.running && this.paused) {
      this.publishHud(this.audio.getProgress(), this.lastSpeedMultiplier, false);
    }
  }

  public getSfxMode(): SfxMode {
    return this.audio.getSfxMode();
  }

  public cycleSfxMode(): SfxMode {
    const next = nextSfxMode(this.audio.getSfxMode());
    this.audio.setSfxMode(next);
    this.hudDirty = true;
    if (this.running && this.paused) {
      this.publishHud(this.audio.getProgress(), this.lastSpeedMultiplier, false);
    }
    return next;
  }

  public setAudioOffsetMs(offsetMs: number): number {
    const applied = this.audio.setAudioOffsetMs(offsetMs);
    this.hudDirty = true;
    if (this.running && this.paused) {
      this.pausedAudioSec = this.audio.getEffectiveElapsedSec();
      this.cameraX = this.pausedAudioSec * this.baseSpeed - this.getReticleScreenX();
      this.prevRenderCameraX = this.cameraX;
      this.clampPausedPan();
      this.refreshPausedView(true);
    }
    return applied;
  }

  public getAudioOffsetMs(): number {
    return this.audio.getAudioOffsetMs();
  }

  public setCinematicCamera(enabled: boolean): void {
    this.cinematicCamera = enabled;
    this.hudDirty = true;
    if (this.running && this.paused) {
      this.cinematicZoom = enabled ? this.computeTargetCinematicZoom(this.pausedAudioSec) : 1.0;
      if (!this.hasManualPan) {
        this.applyNeutralPausedFraming(this.userZoom);
      } else {
        this.clampPausedPan();
      }
      this.refreshPausedView(true);
    } else if (!this.running) {
      this.cinematicZoom = 1.0;
    }
  }

  public getCinematicCamera(): boolean {
    return this.cinematicCamera;
  }

  public toggleCinematicCamera(): boolean {
    this.setCinematicCamera(!this.cinematicCamera);
    return this.cinematicCamera;
  }

  public activateOverdrive(): boolean {
    if (
      !this.running ||
      this.paused ||
      this.overdriveTimer > 0 ||
      this.resonanceGauge < 100
    ) {
      return false;
    }

    this.overdriveTimer = OVERDRIVE_DURATION_SEC;
    this.overdriveNotifiedReady = false;
    this.invulnerableTimer = Math.max(this.invulnerableTimer, OVERDRIVE_DURATION_SEC + 0.15);
    this.surfMomentum = 1.0;
    this.beatPulse = 1.0;
    this.reticlePulseHigh = 1.0;
    this.reticlePulseLow = 1.0;
    this.shiftActiveForm('treble', 0.65);
    this.healGrooveHp(26);
    this.hudDirty = true;

    const rx = this.getReticleScreenX();
    const py = this.getRenderPlayerY();
    this.audio.sfx.playOverdriveBurst();
    this.triggerHitstop(0.036, 0.075);
    this.triggerScreenShake(0.3, 9.0);
    this.vfx.spawnSlash(rx, py, -0.45, 240, 20, GOLD_RGB, 'cross', 0.22);
    this.vfx.spawnSlash(rx, py, 0.45, 240, 20, GOLD_RGB, 'cross', 0.22);
    this.vfx.spawnShockwave(rx, py, 24, 340, GOLD_RGB, 1.0);
    this.vfx.spawnShockwave(rx, py, 16, 220, FORM_CONFIG[this.activeForm].rgb, 0.95);
    this.vfx.spawnBurst(rx, py, GOLD_RGB, 26);
    this.setBanner({ key: 'overdriveActivate', params: { seconds: OVERDRIVE_DURATION_SEC, mult: 2 } }, 2.2);
    return true;
  }

  /**
   * [Fix 2] Hitstop freezes character strike pose & `SlicedEnemyHalf` fragments ONLY.
   * World `cameraX` NEVER freezes so incoming beat targets retain `0.0ms` timing integrity!
   */
  private triggerHitstop(durationSec: number, zoomPunch: number): void {
    this.impactZoomPunch = Math.min(0.11, Math.max(this.impactZoomPunch, zoomPunch));
    if (this.hitstopCooldownTimer > 0 || this.hitstopTimer > 0) return;
    this.hitstopTimer = durationSec;
    this.hitstopCooldownTimer = 0.12;
    this.hitstopFreezePlayerY = this.playerY;
    this.hitstopFreezeRunCycle = this.runCycleTime;
  }

  private triggerScreenShake(durationSec: number, intensityPx: number): void {
    if (intensityPx >= this.shakeIntensity || this.shakeTimer <= 0.04) {
      this.shakeDuration = Math.max(0.05, durationSec);
      this.shakeTimer = this.shakeDuration;
      this.shakeIntensity = intensityPx;
    }
  }

  private realignPlayerToCurrentLane(): void {
    const highY = this.terrain.getLaneHighScreenY();
    const lowY = this.terrain.getLaneLowScreenY();
    const alignedY =
      this.chordPoseTimer > 0
        ? (highY + lowY) * 0.5
        : this.playerLane === 'high'
          ? highY
          : lowY;
    this.playerY = alignedY;
    this.hitstopFreezePlayerY = alignedY;
  }

  public resize(width: number, height: number): void {
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.terrain.setViewportSize(width, height);
    this.renderer?.resize(width, height);
    this.realignPlayerToCurrentLane();
    this.hudDirty = true;

    if (this.running && this.paused) {
      if (this.cinematicCamera) {
        this.cinematicZoom = this.computeTargetCinematicZoom(this.pausedAudioSec);
      }
      this.cameraX = this.pausedAudioSec * this.baseSpeed - this.getReticleScreenX();
      this.prevRenderCameraX = this.cameraX;
      if (!this.hasManualPan) {
        this.applyNeutralPausedFraming(this.userZoom);
      } else {
        this.clampPausedPan();
      }
      this.refreshPausedView(true);
    } else if (!this.running && this.finishRecorded && this.activeBlueprint) {
      if (this.cinematicCamera) {
        this.cinematicZoom = this.computeTargetCinematicZoom(this.finishedAudioSec);
      }
      this.cameraX = this.finishedAudioSec * this.baseSpeed - this.getReticleScreenX();
      this.prevRenderCameraX = this.cameraX;
      this.terrain.update(
        this.cameraX,
        this.width,
        this.height,
        this.elapsedSec,
        this.pausedFreq,
        this.computeViewWorldBounds(true)
      );
      this.renderCurrentState(this.finishedAudioSec, this.pausedFreq);
    } else if (this.running && !this.paused) {
      const effectiveAudioSec = this.audio.getEffectiveElapsedSec();
      this.cameraX = effectiveAudioSec * this.baseSpeed - this.getReticleScreenX();
      this.prevRenderCameraX = this.cameraX;
      const freq = this.audio.getFrequencyData();
      this.terrain.update(
        this.cameraX,
        this.width,
        this.height,
        this.elapsedSec,
        freq,
        this.computeViewWorldBounds(true)
      );
      this.renderCurrentState(effectiveAudioSec, freq);
    }
  }

  public async prepareRun(
    track: TrackMetadata,
    onProgress?: (status: LoadingProgress) => void,
    difficulty: DifficultyMode = this.difficulty
  ): Promise<TrackBlueprint> {
    this.stopRun();
    this.difficulty = difficulty;
    onProgress?.({ progress: 0.08, stage: 'decoding' });
    const loadedTrack = await this.audio.loadTrack(track);
    this.currentTrackMeta = loadedTrack;
    const buffer = this.audio.getBuffer();
    if (!buffer) {
      throw new Error('AudioBuffer unavailable after loadTrack');
    }
    const blueprint = await analyzeTrackBlueprint(buffer, loadedTrack, onProgress, difficulty);
    this.activeBlueprint = blueprint;
    return blueprint;
  }

  public async startRun(
    track: TrackMetadata,
    onProgress?: (status: LoadingProgress) => void,
    difficulty: DifficultyMode = this.difficulty
  ): Promise<void> {
    this.difficulty = difficulty;
    if (
      !this.activeBlueprint ||
      this.activeBlueprint.trackId !== track.id ||
      this.activeBlueprint.difficulty !== difficulty
    ) {
      await this.prepareRun(track, onProgress, difficulty);
    } else if (this.currentTrackMeta?.id !== track.id || !this.audio.getBuffer()) {
      this.currentTrackMeta = await this.audio.loadTrack(track);
    } else {
      this.audio.stop();
    }

    this.resetState();
    this.renderer?.clearForTransition();
    const initialAudioSec = this.audio.getEffectiveElapsedSec();
    this.renderCurrentState(initialAudioSec, this.audio.getFrequencyData());
    this.hudDirty = false;
    this.scoreJudge.consumeDirty();
    this.publishHud(0, 1.0, false);

    this.running = true;
    this.lastFrameTime = performance.now();
    cancelAnimationFrame(this.rafId);
    this.rafId = requestAnimationFrame(this.loop);

    await this.audio.startPlayback();
    if (!this.running) {
      this.audio.stop();
    } else if (this.paused) {
      this.audio.pause();
    }
  }

  public stopRun(): void {
    this.running = false;
    this.paused = false;
    this.pauseSeq++;
    this.finishRecorded = false;
    this.finishedAudioSec = 0;
    this.userZoom = 1.0;
    this.savedLiveZoom = 1.0;
    this.panX = 0;
    this.panY = 0;
    this.hasManualPan = false;
    this.laneHighHeld = false;
    this.laneLowHeld = false;
    this.laneChordHeld = false;
    this.highKeyFlashTimer = 0;
    this.lowKeyFlashTimer = 0;
    this.chordKeyFlashTimer = 0;
    this.hitstopTimer = 0;
    this.hitstopCooldownTimer = 0;
    this.prevRenderCameraX = this.cameraX;
    this.impactZoomPunch = 0;
    cancelAnimationFrame(this.rafId);
    cancelAnimationFrame(this.pausedRenderRaf);
    this.pausedRenderRaf = 0;
    this.audio.stop();
  }

  public getReticleScreenX(): number {
    if (this.width >= 768) {
      return this.width * RETICLE_X_RATIO;
    }
    const t = Math.max(0, Math.min(1, (this.width - 360) / (768 - 360)));
    const ratio = 0.2 + 0.05 * t;
    return this.width * ratio;
  }

  /** Returns normalized [0..1] screen Y midpoint between 2F HIGH and 1F LOW lanes for spatial touch split. */
  public getTouchSplitYRatio(): number {
    const midY =
      (this.terrain.getLaneHighScreenY() + this.terrain.getLaneLowScreenY()) * 0.5;
    return Math.max(0.42, Math.min(0.68, midY / Math.max(1, this.height)));
  }

  private getResponsiveViewportZoom(): number {
    if (this.width >= 1024 && this.height >= 560) {
      return 1.0;
    }
    const widthScale = Math.min(1.0, Math.max(0.58, this.width / 960));
    const heightScale = Math.min(1.0, Math.max(0.76, this.height / 540));
    return Math.min(widthScale, heightScale);
  }

  private getPlayerRenderScreenX(): number {
    return this.getReticleScreenX() - 24 + this.slashRecoilX;
  }

  /**
   * [Fix 2] Always returns `this.cameraX` directly — world scroll NEVER freezes on hitstop!
   */
  private getRenderCameraX(): number {
    return this.cameraX;
  }

  private getRenderPlayerY(): number {
    return this.hitstopTimer > 0 ? this.hitstopFreezePlayerY : this.playerY;
  }

  private getRenderRunCycleTime(): number {
    return this.hitstopTimer > 0 ? this.hitstopFreezeRunCycle : this.runCycleTime;
  }

  private computeTargetCinematicZoom(audioSec: number): number {
    if (!this.cinematicCamera) return 1.0;
    const lookaheadWorldX = Math.max(0, audioSec) * this.baseSpeed + this.baseSpeed * 0.65;
    const lookaheadIntensity = this.terrain.getSectionIntensityAt(lookaheadWorldX);
    if (this.currentSectionIntensity === 'drop' || lookaheadIntensity === 'drop') {
      return this.overdriveTimer > 0 ? 0.84 : 0.8;
    }
    if (
      this.currentSectionIntensity === 'calm' &&
      lookaheadIntensity === 'calm' &&
      this.overdriveTimer <= 0
    ) {
      return this.width < 768 ? 1.08 : 1.24;
    }
    return 1.0;
  }

  private getPhaseBaseZoom(): number {
    const punchScale =
      this.overdriveTimer > 0
        ? 0.05
        : this.currentSectionIntensity === 'drop'
          ? 0.042
          : 0.026;
    const beatAdd = this.beatPulse * punchScale;
    const rawPhaseZoom = Math.max(
      0.55,
      Math.min(2.2, this.cinematicZoom * (1.0 + beatAdd + this.impactZoomPunch))
    );
    const viewportScale = this.getResponsiveViewportZoom();
    if (viewportScale >= 1.0) {
      return rawPhaseZoom;
    }
    return Math.max(0.42, Math.min(2.2, rawPhaseZoom * viewportScale));
  }

  private getEffectiveZoomScale(): number {
    return this.getPhaseBaseZoom() * this.userZoom;
  }

  /**
   * [Fix 4] Locks horizontal focal anchor strictly to `getReticleScreenX()` (NEVER `playerScreenX`)
   * so `[C]` cinematic zoom & katana lunge recoil produce `0.0px` reticle screen shift!
   */
  private getLiveFocalPoint(): { fx: number; fy: number } {
    const laneMidY = (this.terrain.getLaneHighScreenY() + this.terrain.getLaneLowScreenY()) * 0.5;
    const py = this.getRenderPlayerY();
    const fy = laneMidY * 0.65 + py * 0.35;
    return { fx: this.getReticleScreenX(), fy };
  }

  private getEffectiveFocalPoint(): { fx: number; fy: number } {
    if (this.paused) {
      return { fx: this.width * 0.5, fy: this.height * 0.5 };
    }
    return this.getLiveFocalPoint();
  }

  private getClampedNeutralPausedPan(): { panX: number; panY: number } {
    const { fx: fx0, fy: fy0 } = this.getLiveFocalPoint();
    const cx = this.width * 0.5;
    const cy = this.height * 0.5;
    const zEff = Math.max(0.05, this.getEffectiveZoomScale());
    const rawPanX = (fx0 - cx) * (1 - 1 / zEff);
    const rawPanY = (fy0 - cy) * (1 - 1 / zEff);

    const totalWorldX = Math.max(
      this.terrain.getMaxWorldX(),
      this.audio.getDurationSec() * this.baseSpeed
    );
    const minPanX = -this.width - this.cameraX - cx;
    const maxPanX = totalWorldX + this.width - this.cameraX - cx;
    return {
      panX: Math.max(minPanX, Math.min(maxPanX, rawPanX)),
      panY: Math.max(-this.height * 1.2, Math.min(this.height * 1.2, rawPanY)),
    };
  }

  private applyNeutralPausedFraming(zoom: number): void {
    const cx = this.width * 0.5;
    const cy = this.height * 0.5;
    const z2 = Math.max(0.05, this.getEffectiveZoomScale());
    const { fx: fx0, fy: fy0 } = this.getLiveFocalPoint();
    const blend = zoom <= 1 ? 0 : Math.min(1, (zoom - 1) / 3);
    const renderPy = this.getRenderPlayerY();
    const uSubj = fx0;
    const vSubj = fy0 + (renderPy - fy0) * blend * 0.6;
    const targetSx = fx0 + (cx - fx0) * blend;
    const targetSy = fy0 + (cy - fy0) * blend;
    this.panX = uSubj - cx - (targetSx - cx) / z2;
    this.panY = vSubj - cy - (targetSy - cy) / z2;
    this.clampPausedPan();
  }

  private clampPausedPan(): void {
    const cx = this.width * 0.5;
    const totalWorldX = Math.max(
      this.terrain.getMaxWorldX(),
      this.audio.getDurationSec() * this.baseSpeed
    );
    const minPanX = -this.width - this.cameraX - cx;
    const maxPanX = totalWorldX + this.width - this.cameraX - cx;
    this.panX = Math.max(minPanX, Math.min(maxPanX, this.panX));
    this.panY = Math.max(-this.height * 1.2, Math.min(this.height * 1.2, this.panY));
  }

  private computeViewWorldBounds(includePhysicsUnion: boolean): { minX: number; maxX: number } {
    const zEff = Math.max(0.05, this.getEffectiveZoomScale());
    const { fx } = this.getEffectiveFocalPoint();
    const uLeft = this.panX + fx - fx / zEff;
    const uRight = this.panX + fx + (this.width - fx) / zEff;
    const pad = Math.max(this.baseSpeed * 0.2, 240);

    let minX = this.cameraX + Math.min(uLeft, uRight) - pad;
    let maxX = this.cameraX + Math.max(uLeft, uRight) + pad;

    if (includePhysicsUnion) {
      minX = Math.min(minX, this.cameraX - 180);
      maxX = Math.max(maxX, this.cameraX + this.width + 340);
    }

    return { minX, maxX };
  }

  public get isPaused(): boolean {
    return this.paused;
  }

  public pauseRun(): void {
    if (!this.running || this.paused || this.finishRecorded) return;
    this.hitstopTimer = 0;
    this.hitstopCooldownTimer = 0;
    this.pauseSeq++;

    this.pausedFreq = this.audio.getFrequencyData();
    this.audio.pause();
    this.pausedAudioSec = this.audio.getEffectiveElapsedSec();
    this.cameraX = this.pausedAudioSec * this.baseSpeed - this.getReticleScreenX();
    this.prevRenderCameraX = this.cameraX;

    this.savedLiveZoom = this.userZoom;
    this.hasManualPan = false;

    const { fx: fx0, fy: fy0 } = this.getLiveFocalPoint();
    const cx = this.width * 0.5;
    const cy = this.height * 0.5;
    const zEff = Math.max(0.05, this.getEffectiveZoomScale());
    this.panX = (fx0 - cx) * (1 - 1 / zEff);
    this.panY = (fy0 - cy) * (1 - 1 / zEff);

    this.shakeTimer = 0;
    this.laneHighHeld = false;
    this.laneLowHeld = false;
    this.laneChordHeld = false;
    this.paused = true;

    cancelAnimationFrame(this.rafId);
    this.clampPausedPan();
    this.refreshPausedView(true);
  }

  public async resumeRun(): Promise<void> {
    if (!this.running || !this.paused || this.finishRecorded) return;
    const seq = ++this.pauseSeq;

    await this.audio.resume();
    if (this.pauseSeq !== seq || !this.running || !this.paused || this.finishRecorded) {
      return;
    }

    this.paused = false;
    this.hitstopTimer = 0;
    this.hitstopCooldownTimer = 0;
    this.panX = 0;
    this.panY = 0;
    this.hasManualPan = false;
    if (this.userZoom < LIVE_MIN_ZOOM || this.userZoom > LIVE_MAX_ZOOM) {
      this.userZoom = Math.max(
        LIVE_MIN_ZOOM,
        Math.min(LIVE_MAX_ZOOM, this.savedLiveZoom)
      );
    }

    cancelAnimationFrame(this.pausedRenderRaf);
    this.pausedRenderRaf = 0;
    this.lastFrameTime = performance.now();

    const effectiveAudioSec = this.audio.getEffectiveElapsedSec();
    this.cameraX = effectiveAudioSec * this.baseSpeed - this.getReticleScreenX();
    this.prevRenderCameraX = this.cameraX;
    const freq = this.audio.getFrequencyData();
    this.terrain.update(
      this.cameraX,
      this.width,
      this.height,
      this.elapsedSec,
      freq,
      this.computeViewWorldBounds(true)
    );
    this.renderCurrentState(effectiveAudioSec, freq);
    this.hudDirty = false;
    this.publishHud(this.audio.getProgress(), this.lastSpeedMultiplier, false);

    cancelAnimationFrame(this.rafId);
    this.rafId = requestAnimationFrame(this.loop);
  }

  public togglePause(): void {
    if (!this.running || this.finishRecorded) return;
    if (this.paused) {
      void this.resumeRun();
    } else {
      this.pauseRun();
    }
  }

  public getUserZoom(): number {
    return this.userZoom;
  }

  public setUserZoom(
    nextZoom: number,
    anchorScreenX?: number,
    anchorScreenY?: number
  ): void {
    if (!this.running || this.finishRecorded) return;
    const minZ = this.paused ? PAUSED_MIN_ZOOM : LIVE_MIN_ZOOM;
    const maxZ = this.paused ? PAUSED_MAX_ZOOM : LIVE_MAX_ZOOM;
    const clamped = Math.max(minZ, Math.min(maxZ, nextZoom));
    if (Math.abs(clamped - this.userZoom) < 1e-4) return;

    if (this.paused) {
      const cx = this.width * 0.5;
      const cy = this.height * 0.5;

      if (anchorScreenX === undefined && anchorScreenY === undefined && !this.hasManualPan) {
        this.userZoom = clamped;
        this.applyNeutralPausedFraming(clamped);
        this.schedulePausedRender();
      } else {
        const z1 = Math.max(0.05, this.getEffectiveZoomScale());
        this.userZoom = clamped;
        const z2 = Math.max(0.05, this.getEffectiveZoomScale());
        const mx = anchorScreenX ?? cx;
        const my = anchorScreenY ?? cy;
        if (anchorScreenX !== undefined && anchorScreenY !== undefined) {
          this.hasManualPan = true;
        }
        this.panX += (mx - cx) * (1 / z1 - 1 / z2);
        this.panY += (my - cy) * (1 / z1 - 1 / z2);
        this.clampPausedPan();
        this.schedulePausedRender();
      }
    } else {
      this.userZoom = clamped;
      this.savedLiveZoom = clamped;
      this.hudDirty = true;
    }
  }

  public zoomByFactor(
    factor: number,
    anchorScreenX?: number,
    anchorScreenY?: number
  ): void {
    this.setUserZoom(this.userZoom * factor, anchorScreenX, anchorScreenY);
  }

  public panCamera(dxScreenPx: number, dyScreenPx: number): void {
    if (!this.running || !this.paused || this.finishRecorded) return;
    this.hasManualPan = true;
    const zEff = Math.max(0.05, this.getEffectiveZoomScale());
    this.panX -= dxScreenPx / zEff;
    this.panY -= dyScreenPx / zEff;
    this.clampPausedPan();
    this.schedulePausedRender();
  }

  public resetCameraView(): void {
    if (!this.running || this.finishRecorded) return;
    this.userZoom = 1.0;
    this.savedLiveZoom = 1.0;
    this.panX = 0;
    this.panY = 0;
    this.hasManualPan = false;
    if (this.paused) {
      const { fx: fx0, fy: fy0 } = this.getLiveFocalPoint();
      const cx = this.width * 0.5;
      const cy = this.height * 0.5;
      const zEff = Math.max(0.05, this.getEffectiveZoomScale());
      this.panX = (fx0 - cx) * (1 - 1 / zEff);
      this.panY = (fy0 - cy) * (1 - 1 / zEff);
      this.clampPausedPan();
      this.refreshPausedView(true);
    } else {
      this.hudDirty = true;
    }
  }

  private schedulePausedRender(): void {
    if (this.pausedRenderRaf !== 0) return;
    this.pausedRenderRaf = requestAnimationFrame(() => {
      this.pausedRenderRaf = 0;
      if (this.running && this.paused) {
        this.refreshPausedView(true);
      }
    });
  }

  private refreshPausedView(publish: boolean): void {
    this.terrain.update(
      this.cameraX,
      this.width,
      this.height,
      this.elapsedSec,
      this.pausedFreq,
      this.computeViewWorldBounds(false)
    );
    this.renderCurrentState(this.pausedAudioSec, this.pausedFreq);
    if (publish) {
      this.publishHud(
        this.audio.getProgress(),
        this.paused ? this.lastSpeedMultiplier : 1.0,
        false
      );
    }
  }

  private resetState(): void {
    this.paused = false;
    this.pauseSeq++;
    this.pausedAudioSec = 0;
    this.pausedFreq = { low: 0.1, mid: 0.1, high: 0.1, overall: 0.1, isBeat: false };
    this.lastSpeedMultiplier = 1.0;
    this.userZoom = 1.0;
    this.savedLiveZoom = 1.0;
    this.panX = 0;
    this.panY = 0;
    this.hasManualPan = false;
    cancelAnimationFrame(this.pausedRenderRaf);
    this.pausedRenderRaf = 0;

    this.elapsedSec = 0;
    this.hudPublishAccum = 0;
    this.hudDirty = true;
    this.finishRecorded = false;
    this.finishedAudioSec = 0;
    this.lastIsNewRecord = false;
    this.lastScoreDelta = 0;
    this.cinematicZoom = 1.0;
    this.impactZoomPunch = 0;
    this.baseSpeed =
      this.activeBlueprint?.worldPxPerSec ?? DIFFICULTY_CONFIG[this.difficulty].worldPxPerSec;

    if (this.activeBlueprint) {
      this.terrain.loadBlueprint(this.activeBlueprint, this.width, this.height);
    } else {
      this.terrain.reset(this.width, this.height);
    }

    this.playerController.reset();
    this.activeForm = 'synth';
    this.resonanceHoldTimer = 0;

    const initialEffectiveSec = this.audio.getEffectiveElapsedSec();
    this.cameraX = initialEffectiveSec * this.baseSpeed - this.getReticleScreenX();
    this.prevRenderCameraX = this.cameraX;
    this.terrain.update(
      this.cameraX,
      this.width,
      this.height,
      0,
      this.audio.getFrequencyData(),
      this.computeViewWorldBounds(true)
    );
    this.hitstopTimer = 0;
    this.hitstopCooldownTimer = 0;

    this.playerLane = 'low';
    this.highAirHangTimer = 0;
    this.chordPoseTimer = 0;
    this.playerY = this.terrain.getLaneLowScreenY();
    this.hitstopFreezePlayerY = this.playerY;
    this.hitstopFreezeRunCycle = 0;
    this.playerRotation = 0;
    this.slashRecoilX = 0;
    this.slashAltToggle = 0;
    this.isGrinding = false;
    this.laneHighHeld = false;
    this.laneLowHeld = false;
    this.laneChordHeld = false;
    this.highKeyFlashTimer = 0;
    this.lowKeyFlashTimer = 0;
    this.chordKeyFlashTimer = 0;
    this.surfMomentum = 0.25;
    this.beatPulse = 0;
    this.reticlePulseHigh = 0;
    this.reticlePulseLow = 0;
    this.lastBeatSliceIndex = -1;
    this.currentSectionIntensity = 'calm';
    this.invulnerableTimer = 0;
    this.runCycleTime = 0;
    this.firstUnresolvedIdx = 0;
    this.activeRushCombo = 0;
    this.shakeTimer = 0;
    this.shakeIntensity = 0;

    this.resonanceGauge = 35;
    this.overdriveTimer = 0;
    this.overdriveNotifiedReady = false;
    this.grooveHp = this.maxGrooveHp;
    this.hazardDamageCooldown = 0;
    this.isFailed = false;

    this.scoreJudge.reset();
    this.vfx.reset();
    this.setBanner({ key: 'ready' }, 2.2);
  }

  public setLaneHeld(lane: SlashLane | 'chord', held: boolean): void {
    if (!this.running || this.paused) {
      this.laneHighHeld = false;
      this.laneLowHeld = false;
      this.laneChordHeld = false;
      return;
    }
    if (lane === 'high') {
      if (this.laneHighHeld !== held) {
        this.laneHighHeld = held;
        this.hudDirty = true;
      }
    } else if (lane === 'low') {
      if (this.laneLowHeld !== held) {
        this.laneLowHeld = held;
        this.hudDirty = true;
      }
    } else {
      if (this.laneChordHeld !== held) {
        this.laneChordHeld = held;
        this.hudDirty = true;
      }
    }
  }

  /**
   * [Fix 3] Sub-frame DOM input lag guard (`0ms..45ms`), immune to synthetic/Playwright `timeStamp === 0`.
   */
  private computeHitAudioSec(eventTimeStampMs?: number): number {
    const inputLagSec =
      eventTimeStampMs !== undefined &&
      Number.isFinite(eventTimeStampMs) &&
      eventTimeStampMs > 0
        ? Math.min(0.045, Math.max(0, (performance.now() - eventTimeStampMs) / 1000))
        : 0;
    return this.audio.getEffectiveElapsedSec() - inputLagSec;
  }

  private snapPlayerToLane(lane: SlashLane): void {
    const prevY = this.playerY;
    const nextY =
      lane === 'high' ? this.terrain.getLaneHighScreenY() : this.terrain.getLaneLowScreenY();
    if (this.playerLane !== lane) {
      this.vfx.spawnAfterimage(
        this.getPlayerRenderScreenX(),
        (prevY + nextY) * 0.5,
        lane === 'high' ? -0.22 : 0.2,
        this.activeForm,
        0.72
      );
    }
    this.playerLane = lane;
    this.chordPoseTimer = 0;
    this.playerY = nextY;
    this.playerRotation = lane === 'high' ? -0.16 : 0.12;
    this.slashRecoilX = 24;
    if (lane === 'high') {
      this.highAirHangTimer = this.playerController.profile.highHangDurationSec;
      this.reticlePulseHigh = 1.0;
    } else {
      this.highAirHangTimer = 0;
      this.reticlePulseLow = 1.0;
    }
    this.hudDirty = true;
  }

  public handleSlashHigh(eventTimeStampMs?: number): void {
    if (!this.running || this.paused || this.finishRecorded) return;
    this.highKeyFlashTimer = KEY_FLASH_DURATION_SEC;
    this.snapPlayerToLane('high');
    const hitAudioSec = this.computeHitAudioSec(eventTimeStampMs);
    this.processLaneSlashInput('high', hitAudioSec);
  }

  public handleSlashLow(eventTimeStampMs?: number): void {
    if (!this.running || this.paused || this.finishRecorded) return;
    this.lowKeyFlashTimer = KEY_FLASH_DURATION_SEC;
    this.snapPlayerToLane('low');
    const hitAudioSec = this.computeHitAudioSec(eventTimeStampMs);
    this.processLaneSlashInput('low', hitAudioSec);
  }

  public handleSlashChord(eventTimeStampMs?: number): void {
    if (!this.running || this.paused || this.finishRecorded) return;
    this.chordKeyFlashTimer = KEY_FLASH_DURATION_SEC;
    this.reticlePulseHigh = 1.0;
    this.reticlePulseLow = 1.0;
    this.slashRecoilX = 30;
    this.chordPoseTimer = 0.16;
    this.playerY =
      (this.terrain.getLaneHighScreenY() + this.terrain.getLaneLowScreenY()) * 0.5;
    this.playerRotation = -0.06;
    this.hudDirty = true;

    const hitAudioSec = this.computeHitAudioSec(eventTimeStampMs);
    this.processChordSlashInput(hitAudioSec);
  }

  private findActiveRushTarget(hitAudioSec: number, goodSec: number): BeatTarget | null {
    const all = this.terrain.getAllTargets();
    for (let i = this.firstUnresolvedIdx; i < all.length; i++) {
      const t = all[i]!;
      if (t.resolved) continue;
      if (t.timeSec - goodSec > hitAudioSec) break;
      if (t.kind === 'rush') {
        const endSec = t.endTimeSec ?? t.timeSec + 1.2;
        if (hitAudioSec >= t.timeSec - goodSec && hitAudioSec <= endSec + 0.04) {
          return t;
        }
      }
    }
    return null;
  }

  private applyRushMashHit(target: BeatTarget): void {
    const nextHits = (target.rushHits ?? 0) + 1;
    target.rushHits = nextHits;
    const reqHits = target.rushTargetHits ?? 8;
    this.activeRushCombo = nextHits;
    this.shiftActiveForm('treble', 0.65);
    this.hudDirty = true;

    const rx = this.getReticleScreenX();
    const midY = (this.terrain.getLaneHighScreenY() + this.terrain.getLaneLowScreenY()) * 0.5;
    const angle = (nextHits % 2 === 0 ? 1 : -1) * (0.36 + (nextHits % 3) * 0.12);
    const widthScale = this.playerController.profile.slashWidthScale;

    this.audio.sfx.playRushHit(nextHits);
    this.scoreJudge.addRushMashTick(this.getActiveScoreMultiplier());
    this.addResonanceGauge(2.2 * this.playerController.profile.gaugeChargeMult);
    this.vfx.spawnSlash(rx, midY, angle, 215, 16 * widthScale, GOLD_RGB, 'cross', 0.16);
    this.vfx.spawnBurst(rx, midY, nextHits % 2 === 0 ? CYAN_RGB : CRIMSON_RGB, 8);

    if (nextHits === 1) {
      this.setBanner({ key: 'beatRushStart', params: { total: reqHits } }, 1.2);
    }

    if (nextHits >= reqHits) {
      target.resolved = true;
      target.hitGrade = 'PERFECT';
      this.activeRushCombo = 0;
      this.scoreJudge.recordOrbCollected();
      this.scoreJudge.recordGimmickTriggered();
      this.scoreJudge.recordTrapDestroyed();
      this.collectPrismStarIfPresent(target, rx, midY);

      const bonusPts = this.emitSlashJudgment(
        'PERFECT',
        rx,
        midY,
        0,
        600,
        0,
        true,
        'chord'
      );
      this.audio.sfx.playHazardShatter();
      this.audio.triggerSidechainDuck(0.75, 0.065);
      this.triggerHitstop(0.042, 0.09);
      this.triggerScreenShake(0.28, 9.0);
      this.vfx.spawnSlicedEnemy(rx, midY - 12, target.radius, -0.52, GOLD_RGB, false, 0.64);
      this.vfx.spawnSlicedEnemy(rx, midY + 12, target.radius * 0.9, 0.52, CRIMSON_RGB, false, 0.64);
      this.vfx.spawnShockwave(
        rx,
        midY,
        24,
        290 * this.playerController.profile.shockwaveScale,
        GOLD_RGB,
        1.0
      );
      this.vfx.spawnBurst(rx, midY, GOLD_RGB, 26);
      this.setBanner(
        { key: 'beatRushFinish', params: { hits: nextHits, bonus: bonusPts } },
        1.65
      );
    }
  }

  private processChordSlashInput(hitAudioSec: number): void {
    const cfg = DIFFICULTY_CONFIG[this.difficulty];
    const goodSec = cfg.goodMs / 1000;

    // 1. Check active Beat Rush boss core first
    const rushTarget = this.findActiveRushTarget(hitAudioSec, goodSec);
    if (rushTarget) {
      this.applyRushMashHit(rushTarget);
      return;
    }

    const all = this.terrain.getAllTargets();
    let bestChord: BeatTarget | null = null;
    let bestFallback: BeatTarget | null = null;

    for (let i = this.firstUnresolvedIdx; i < all.length; i++) {
      const t = all[i]!;
      if (t.resolved) continue;
      if (t.timeSec - hitAudioSec > goodSec) break;
      if (Math.abs(hitAudioSec - t.timeSec) > goodSec) continue;

      if (t.kind === 'chord') {
        bestChord = t;
        break;
      }
      if (
        !bestFallback &&
        (t.kind === 'high' || t.kind === 'low' || (t.kind === 'hold' && !t.holdActive))
      ) {
        bestFallback = t;
      }
    }

    if (bestChord) {
      this.resolveFullChordFinisher(bestChord, hitAudioSec);
      return;
    }

    if (bestFallback) {
      this.snapPlayerToLane(bestFallback.lane);
      if (bestFallback.kind === 'hold') {
        this.activateHoldHead(bestFallback, hitAudioSec);
      } else {
        this.resolveSingleTargetHit(bestFallback, bestFallback.lane, hitAudioSec);
      }
      return;
    }

    // Air X-cross swing
    this.shiftActiveForm('treble', 0.28);
    const rx = this.getReticleScreenX();
    const midY = (this.terrain.getLaneHighScreenY() + this.terrain.getLaneLowScreenY()) * 0.5;
    const wScale = this.playerController.profile.slashWidthScale;
    this.audio.sfx.playAirSwing('chord');
    this.vfx.spawnSlash(rx, midY, -0.46, 175, 13 * wScale, GOLD_RGB, 'cross', 0.14);
    this.vfx.spawnSlash(rx, midY, 0.46, 175, 13 * wScale, GOLD_RGB, 'cross', 0.14);
  }

  private processLaneSlashInput(lane: SlashLane, hitAudioSec: number): void {
    const cfg = DIFFICULTY_CONFIG[this.difficulty];
    const goodSec = cfg.goodMs / 1000;

    // 1. Check active Beat Rush boss core first
    const rushTarget = this.findActiveRushTarget(hitAudioSec, goodSec);
    if (rushTarget) {
      this.applyRushMashHit(rushTarget);
      return;
    }

    const all = this.terrain.getAllTargets();
    let matchedTarget: BeatTarget | null = null;

    for (let i = this.firstUnresolvedIdx; i < all.length; i++) {
      const t = all[i]!;
      if (t.resolved) continue;
      if (t.timeSec - hitAudioSec > goodSec) break;

      // [Fix 4] Check half-struck CHORD awaiting opposite-hand completion within 50ms
      if (
        t.kind === 'chord' &&
        t.chordPartialLane !== undefined &&
        t.chordPartialLane !== lane &&
        t.chordPartialSec !== undefined &&
        Math.abs(hitAudioSec - t.chordPartialSec) <= CHORD_SYNC_WINDOW_SEC
      ) {
        this.resolveFullChordFinisher(t, hitAudioSec);
        return;
      }

      if (Math.abs(hitAudioSec - t.timeSec) > goodSec) continue;

      if (t.kind === lane) {
        matchedTarget = t;
        break;
      }
      if (t.kind === 'hold' && t.lane === lane && !t.holdActive) {
        matchedTarget = t;
        break;
      }
      if (t.kind === 'chord' && t.chordPartialLane === undefined) {
        matchedTarget = t;
        break;
      }
    }

    if (matchedTarget) {
      if (matchedTarget.kind === 'chord') {
        // [Fix 4] Record first-hand partial hit on CHORD and wait up to 50ms (`CHORD_SYNC_WINDOW_SEC`)
        this.shiftActiveForm(lane === 'low' ? 'bass' : 'synth', 0.28);
        matchedTarget.chordPartialLane = lane;
        matchedTarget.chordPartialSec = hitAudioSec;
        matchedTarget.chordPartialSignedMs = Math.round(
          (hitAudioSec - matchedTarget.timeSec) * 1000
        );
        const rx = this.getReticleScreenX();
        const ly =
          lane === 'high'
            ? this.terrain.getLaneHighScreenY()
            : this.terrain.getLaneLowScreenY();
        this.audio.sfx.playAirSwing(lane);
        this.vfx.spawnSlash(
          rx,
          ly,
          lane === 'high' ? -0.42 : 0.38,
          170,
          13 * this.playerController.profile.slashWidthScale,
          lane === 'high' ? CYAN_RGB : CRIMSON_RGB,
          'cross',
          0.14
        );
        return;
      }

      if (matchedTarget.kind === 'hold') {
        this.activateHoldHead(matchedTarget, hitAudioSec);
        return;
      }

      this.resolveSingleTargetHit(matchedTarget, lane, hitAudioSec);
      return;
    }

    // Air katana swing (tactile feedback, zero penalty so player can freely dodge hazards!)
    this.shiftActiveForm(lane === 'low' ? 'bass' : 'synth', 0.28);
    const rx = this.getReticleScreenX();
    const laneY =
      lane === 'high' ? this.terrain.getLaneHighScreenY() : this.terrain.getLaneLowScreenY();
    this.slashAltToggle ^= 1;
    const angle =
      lane === 'high'
        ? this.slashAltToggle === 0
          ? -0.44
          : 0.28
        : this.slashAltToggle === 0
          ? 0.42
          : -0.26;
    const color = lane === 'high' ? CYAN_RGB : CRIMSON_RGB;
    this.audio.sfx.playAirSwing(lane);
    this.vfx.spawnSlash(
      rx,
      laneY,
      angle,
      165,
      12 * this.playerController.profile.slashWidthScale,
      color,
      lane === 'low' ? 'slam' : 'cross',
      0.13
    );
  }

  private resolveSingleTargetHit(
    target: BeatTarget,
    lane: SlashLane,
    hitAudioSec: number
  ): void {
    target.resolved = true;
    const signedDeltaMs = Math.round((hitAudioSec - target.timeSec) * 1000);
    const deltaMs = Math.abs(signedDeltaMs);
    const grade = this.scoreJudge.classifyDeltaMs(deltaMs, this.difficulty);
    const isCritical =
      grade === 'PERFECT' && this.scoreJudge.isCriticalDeltaMs(deltaMs, this.difficulty);
    target.hitGrade = grade;

    if (target.isPrismStar || isCritical) {
      this.shiftActiveForm('treble', 0.48);
    } else {
      this.shiftActiveForm(lane === 'low' ? 'bass' : 'synth', 0.42);
    }

    this.scoreJudge.recordOrbCollected();
    const rx = this.getReticleScreenX();
    const laneY =
      lane === 'high' ? this.terrain.getLaneHighScreenY() : this.terrain.getLaneLowScreenY();
    const targetColor = target.isPrismStar
      ? GOLD_RGB
      : lane === 'high'
        ? CYAN_RGB
        : CRIMSON_RGB;

    this.collectPrismStarIfPresent(target, rx, laneY);
    this.audio.sfx.playSlashHit(lane, grade, isCritical);

    const profile = this.playerController.profile;
    let basePts = 320;
    if (isCritical) basePts = Math.round(basePts * profile.criticalScoreMult);
    if (this.scoreJudge.combo >= 20) {
      basePts = Math.round(basePts * profile.highComboScoreMult);
    }

    this.emitSlashJudgment(
      grade,
      rx,
      laneY,
      deltaMs,
      basePts,
      signedDeltaMs,
      isCritical,
      lane
    );

    this.slashAltToggle ^= 1;
    const cutAngle =
      lane === 'high'
        ? this.slashAltToggle === 0
          ? -0.48
          : 0.34
        : this.slashAltToggle === 0
          ? 0.46
          : -0.32;

    this.vfx.spawnSlash(
      rx,
      laneY,
      cutAngle,
      205,
      (isCritical ? 18 : 15) * profile.slashWidthScale,
      isCritical ? GOLD_RGB : targetColor,
      lane === 'low' ? 'slam' : 'cross',
      0.18
    );
    this.vfx.spawnSlicedEnemy(
      rx,
      laneY,
      target.radius,
      cutAngle,
      targetColor,
      Boolean(target.isPrismStar)
    );

    if (isCritical) {
      this.triggerHitstop(0.024, 0.042);
      this.triggerScreenShake(0.11, 4.2);
    }
  }

  private activateHoldHead(target: BeatTarget, hitAudioSec: number): void {
    const signedDeltaMs = Math.round((hitAudioSec - target.timeSec) * 1000);
    const deltaMs = Math.abs(signedDeltaMs);
    const grade = this.scoreJudge.classifyDeltaMs(deltaMs, this.difficulty);
    const isCritical =
      grade === 'PERFECT' && this.scoreJudge.isCriticalDeltaMs(deltaMs, this.difficulty);

    target.holdActive = true;
    target.hitGrade = grade;
    target.holdReleaseGraceSec = 0.075;
    target.holdNextTickSec = hitAudioSec + 0.1;
    this.isGrinding = true;
    this.shiftActiveForm(
      target.isPrismStar ? 'treble' : target.lane === 'low' ? 'bass' : 'synth',
      0.42
    );

    this.scoreJudge.recordOrbCollected();
    const rx = this.getReticleScreenX();
    const laneY =
      target.lane === 'high'
        ? this.terrain.getLaneHighScreenY()
        : this.terrain.getLaneLowScreenY();
    const color = target.lane === 'high' ? CYAN_RGB : CRIMSON_RGB;

    this.collectPrismStarIfPresent(target, rx, laneY);
    this.audio.sfx.playSlashHit(target.lane, grade, isCritical);

    const basePts = Math.round(300 * this.playerController.profile.chordHoldScoreMult);
    this.emitSlashJudgment(
      grade,
      rx,
      laneY,
      deltaMs,
      basePts,
      signedDeltaMs,
      isCritical,
      target.lane
    );
    this.vfx.spawnSlash(
      rx,
      laneY,
      0,
      195,
      15 * this.playerController.profile.slashWidthScale,
      color,
      'pierce',
      0.17
    );
  }

  private resolveFullChordFinisher(target: BeatTarget, hitAudioSec: number): void {
    target.resolved = true;
    const rawSignedMs = Math.round((hitAudioSec - target.timeSec) * 1000);
    const signedDeltaMs =
      target.chordPartialSignedMs !== undefined &&
      Math.abs(target.chordPartialSignedMs) < Math.abs(rawSignedMs)
        ? target.chordPartialSignedMs
        : rawSignedMs;
    const deltaMs = Math.abs(signedDeltaMs);
    const grade = this.scoreJudge.classifyDeltaMs(deltaMs, this.difficulty);
    const isCritical =
      grade === 'PERFECT' && this.scoreJudge.isCriticalDeltaMs(deltaMs, this.difficulty);
    target.hitGrade = grade;
    this.shiftActiveForm('treble', 0.65);

    this.reticlePulseHigh = 1.0;
    this.reticlePulseLow = 1.0;
    this.chordPoseTimer = 0.18;
    const rx = this.getReticleScreenX();
    const highY = this.terrain.getLaneHighScreenY();
    const lowY = this.terrain.getLaneLowScreenY();
    const midY = (highY + lowY) * 0.5;
    this.playerY = midY;

    this.scoreJudge.recordOrbCollected();
    this.scoreJudge.recordGimmickTriggered();
    this.collectPrismStarIfPresent(target, rx, midY);

    const profile = this.playerController.profile;
    let basePts = Math.round(520 * profile.chordHoldScoreMult);
    if (isCritical) basePts = Math.round(basePts * profile.criticalScoreMult);

    const bonusPts = this.emitSlashJudgment(
      grade,
      rx,
      midY,
      deltaMs,
      basePts,
      signedDeltaMs,
      isCritical,
      'chord'
    );

    this.audio.sfx.playSlashHit('chord', grade, true);
    this.audio.triggerSidechainDuck(0.78, 0.055);
    this.triggerHitstop(0.038, 0.075);
    this.triggerScreenShake(0.22, 7.5);

    this.vfx.spawnSlash(rx, midY, -0.5, 250, 19 * profile.slashWidthScale, GOLD_RGB, 'cross', 0.21);
    this.vfx.spawnSlash(rx, midY, 0.5, 250, 19 * profile.slashWidthScale, GOLD_RGB, 'cross', 0.21);
    this.vfx.spawnSlicedEnemy(rx, highY, target.radius * 0.88, -0.5, GOLD_RGB, Boolean(target.isPrismStar));
    this.vfx.spawnSlicedEnemy(rx, lowY, target.radius * 0.88, 0.5, GOLD_RGB, Boolean(target.isPrismStar));
    this.vfx.spawnShockwave(rx, midY, 22, 260 * profile.shockwaveScale, GOLD_RGB, 1.0);
    this.vfx.spawnBurst(rx, midY, GOLD_RGB, 20);
    this.setBanner({ key: 'chordCross', params: { bonus: bonusPts } }, 1.25);
  }

  private collectPrismStarIfPresent(target: BeatTarget, screenX: number, screenY: number): void {
    if (!target.isPrismStar) return;
    this.scoreJudge.recordStarCollected();
    this.addResonanceGauge(18 * this.playerController.profile.gaugeChargeMult);
    this.healGrooveHp(18);
    this.audio.sfx.playPrismStar();
    this.vfx.spawnShockwave(screenX, screenY, 18, 175, GOLD_RGB, 1.0);
    this.vfx.spawnBurst(screenX, screenY, GOLD_RGB, 20);
    this.setBanner(
      {
        key: 'prismStar',
        params: {
          collected: this.scoreJudge.starsCollected,
          total: this.terrain.getTotalStarCount() || 3,
        },
      },
      1.5
    );
  }

  private addResonanceGauge(amount: number): void {
    if (this.overdriveTimer > 0) return;
    const prev = this.resonanceGauge;
    this.resonanceGauge = Math.min(100, this.resonanceGauge + amount);
    if (prev < 100 && this.resonanceGauge >= 100 && !this.overdriveNotifiedReady) {
      this.overdriveNotifiedReady = true;
      this.hudDirty = true;
      this.setBanner({ key: 'overdriveReady' }, 1.8);
    }
  }

  /**
   * [Fix 5] Zero-cooldown Groove HP drain per missed slash target:
   * - `Casual`: `0` drain (`CASUAL NO-FAIL`)
   * - `Standard`: `-16 HP` (`-22 HP` on `CHORD`/`RUSH`)
   */
  private applyMissGrooveDrain(isHeavy: boolean): void {
    if (this.difficulty === 'casual' || this.isFailed) return;
    const baseDrain = isHeavy ? 22 : 16;
    const overdriveMitigation = this.overdriveTimer > 0 ? 0.5 : 1.0;
    const drain =
      baseDrain * this.playerController.profile.grooveDamageScale * overdriveMitigation;
    const prevHp = this.grooveHp;
    this.grooveHp = Math.max(0, this.grooveHp - drain);
    this.hudDirty = true;
    if (this.grooveHp > 0 && this.grooveHp <= 30 && prevHp > 30) {
      this.setBanner({ key: 'grooveDanger', params: { hp: Math.round(this.grooveHp) } }, 1.6);
    }
  }

  /**
   * [Fix 5] Physical obstacle (`sawblade` / `mine`) collision damage with `0.45s` invulnerability cooldown.
   */
  private applyHazardDamage(): void {
    if (
      this.difficulty === 'casual' ||
      this.isFailed ||
      this.overdriveTimer > 0 ||
      this.hazardDamageCooldown > 0
    ) {
      return;
    }
    const baseDmg = 22;
    const dmg = baseDmg * this.playerController.profile.grooveDamageScale;
    const prevHp = this.grooveHp;
    this.grooveHp = Math.max(0, this.grooveHp - dmg);
    this.hazardDamageCooldown = 0.45;
    this.invulnerableTimer = Math.max(this.invulnerableTimer, 0.45);
    this.hudDirty = true;
    if (this.grooveHp > 0 && this.grooveHp <= 30 && prevHp > 30) {
      this.setBanner({ key: 'grooveDanger', params: { hp: Math.round(this.grooveHp) } }, 1.6);
    }
  }

  private healGrooveHp(amount: number): void {
    if (this.difficulty === 'casual' || this.isFailed || this.grooveHp >= this.maxGrooveHp) {
      return;
    }
    const prevRounded = Math.round(this.grooveHp);
    this.grooveHp = Math.min(this.maxGrooveHp, this.grooveHp + amount);
    if (Math.round(this.grooveHp) !== prevRounded) {
      this.hudDirty = true;
    }
  }

  private handleMissedTarget(target: BeatTarget, isHeavy: boolean): void {
    const rx = this.getReticleScreenX();
    const targetY =
      target.kind === 'chord' || target.kind === 'rush'
        ? (this.terrain.getLaneHighScreenY() + this.terrain.getLaneLowScreenY()) * 0.5
        : target.lane === 'high'
          ? this.terrain.getLaneHighScreenY()
          : this.terrain.getLaneLowScreenY();

    this.scoreJudge.recordJudgment('MISS', undefined, 0, 1, undefined, {
      lane: target.kind === 'chord' || target.kind === 'rush' ? 'chord' : target.lane,
    });
    this.surfMomentum = Math.max(0.15, this.surfMomentum * 0.55);
    this.applyMissGrooveDrain(isHeavy);
    this.vfx.spawnBurst(rx - 18, targetY, CRIMSON_RGB, 8);
  }

  private triggerStageFail(
    audioSec: number,
    freq: FrequencyBands,
    speedMultiplier: number
  ): void {
    const failProgress = this.audio.getProgress();
    this.isFailed = true;
    this.finishRecorded = true;
    this.finishedAudioSec = audioSec;
    this.pausedFreq = freq;
    this.running = false;
    this.paused = false;
    this.laneHighHeld = false;
    this.laneLowHeld = false;
    this.laneChordHeld = false;
    this.hitstopTimer = 0;
    this.audio.stop();
    this.audio.sfx.playStageFail();
    const rx = this.getReticleScreenX();
    const renderPy = this.getRenderPlayerY();
    this.vfx.spawnShockwave(rx, renderPy, 20, 195, CRIMSON_RGB, 1.0);
    this.vfx.spawnBurst(rx, renderPy, CRIMSON_RGB, 24);
    this.setBanner({ key: 'grooveDepleted' }, 3.0);
    this.hudDirty = false;
    this.hudPublishAccum = 0;
    this.scoreJudge.consumeDirty();
    this.renderCurrentState(audioSec, freq);
    this.publishHud(failProgress, speedMultiplier, true);
  }

  private getActiveScoreMultiplier(): number {
    const overdriveMult = this.overdriveTimer > 0 ? 2.0 : 1.0;
    const dropMult = this.currentSectionIntensity === 'drop' ? 1.25 : 1.0;
    return overdriveMult * dropMult;
  }

  private emitSlashJudgment(
    grade: JudgmentGrade,
    screenX: number,
    screenY: number,
    deltaMs: number | undefined,
    basePoints: number,
    signedDeltaMs: number | undefined,
    isCritical: boolean,
    lane: SlashLane | 'chord'
  ): number {
    const bonusPoints = this.scoreJudge.recordJudgment(
      grade,
      deltaMs,
      basePoints,
      this.getActiveScoreMultiplier(),
      signedDeltaMs,
      { isCritical, lane }
    );

    const profile = this.playerController.profile;
    const gaugeMult = profile.gaugeChargeMult;
    const swScale = profile.shockwaveScale;

    if (grade === 'PERFECT') {
      this.beatPulse = 1.0;
      this.surfMomentum = Math.min(1.0, this.surfMomentum + 0.1);
      this.addResonanceGauge((isCritical ? 6.8 : 5.5) * gaugeMult);
      this.healGrooveHp(2.4 * (this.scoreJudge.combo >= 25 ? 1.4 : 1.0));
      this.vfx.spawnShockwave(
        screenX,
        screenY,
        14,
        (isCritical ? 118 : 92) * swScale,
        isCritical ? GOLD_RGB : lane === 'high' ? CYAN_RGB : CRIMSON_RGB,
        0.95
      );
      this.vfx.spawnBurst(screenX, screenY, isCritical ? GOLD_RGB : CYAN_RGB, isCritical ? 14 : 10);
    } else if (grade === 'GREAT') {
      this.beatPulse = Math.max(this.beatPulse, 0.55);
      this.surfMomentum = Math.min(1.0, this.surfMomentum + 0.06);
      this.addResonanceGauge(3.6 * gaugeMult);
      this.healGrooveHp(0.9);
      this.vfx.spawnBurst(screenX, screenY, lane === 'high' ? CYAN_RGB : CRIMSON_RGB, 8);
    } else if (grade === 'GOOD') {
      this.addResonanceGauge(1.8 * gaugeMult);
      this.vfx.spawnBurst(screenX, screenY, [180, 220, 255], 5);
    }
    return bonusPoints;
  }

  private loop = (now: number): void => {
    if (!this.running || this.paused) return;

    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastFrameTime) / 1000));
    this.lastFrameTime = now;
    this.elapsedSec += dt;

    this.fpsFrames++;
    this.fpsAccum += dt;
    if (this.fpsAccum >= 0.25) {
      this.currentFps = Math.round(this.fpsFrames / this.fpsAccum);
      this.fpsFrames = 0;
      this.fpsAccum = 0;
    }

    this.updateFrame(dt);
    if (this.running && !this.paused) {
      this.rafId = requestAnimationFrame(this.loop);
    }
  };

  private updateFrame(dt: number): void {
    if (this.paused) return;
    const freq = this.audio.getFrequencyData();
    const effectiveAudioSec = this.audio.getEffectiveElapsedSec();

    if (this.hitstopCooldownTimer > 0) {
      this.hitstopCooldownTimer = Math.max(0, this.hitstopCooldownTimer - dt);
    }
    if (this.hitstopTimer > 0) {
      this.hitstopTimer = Math.max(0, this.hitstopTimer - dt);
    }

    if (this.statusBannerTimer > 0) {
      this.statusBannerTimer = Math.max(0, this.statusBannerTimer - dt);
      if (this.statusBannerTimer === 0 && this.statusBanner !== null) {
        this.statusBanner = null;
        this.hudDirty = true;
      }
    }
    this.scoreJudge.tick(dt);

    // Decay HUD key-flash timers and notify React immediately on transition to false
    if (this.highKeyFlashTimer > 0) {
      this.highKeyFlashTimer = Math.max(0, this.highKeyFlashTimer - dt);
      if (this.highKeyFlashTimer === 0 && !this.laneHighHeld) this.hudDirty = true;
    }
    if (this.lowKeyFlashTimer > 0) {
      this.lowKeyFlashTimer = Math.max(0, this.lowKeyFlashTimer - dt);
      if (this.lowKeyFlashTimer === 0 && !this.laneLowHeld) this.hudDirty = true;
    }
    if (this.chordKeyFlashTimer > 0) {
      this.chordKeyFlashTimer = Math.max(0, this.chordKeyFlashTimer - dt);
      if (this.chordKeyFlashTimer === 0 && !this.laneChordHeld) this.hudDirty = true;
    }

    if (this.invulnerableTimer > 0) {
      this.invulnerableTimer = Math.max(0, this.invulnerableTimer - dt);
    }
    if (this.hazardDamageCooldown > 0) {
      this.hazardDamageCooldown = Math.max(0, this.hazardDamageCooldown - dt);
    }
    if (this.shakeTimer > 0) {
      this.shakeTimer = Math.max(0, this.shakeTimer - dt);
    }
    if (this.reticlePulseHigh > 0) {
      this.reticlePulseHigh = Math.max(0, this.reticlePulseHigh - dt * 7.2);
    }
    if (this.reticlePulseLow > 0) {
      this.reticlePulseLow = Math.max(0, this.reticlePulseLow - dt * 7.2);
    }
    if (this.slashRecoilX > 0) {
      this.slashRecoilX *= Math.exp(-dt * 24);
      if (this.slashRecoilX < 0.1) this.slashRecoilX = 0;
    }

    if (this.overdriveTimer > 0) {
      this.healGrooveHp(3.8 * dt);
      this.overdriveTimer = Math.max(0, this.overdriveTimer - dt);
      this.resonanceGauge = (this.overdriveTimer / OVERDRIVE_DURATION_SEC) * 100;
      if (this.overdriveTimer === 0) {
        this.resonanceGauge = 0;
        this.hudDirty = true;
      }
    }

    if (this.beatPulse > 0) {
      this.beatPulse = Math.max(0, this.beatPulse - dt * 5.2);
    }
    if (freq.isBeat) {
      this.beatPulse = Math.max(
        this.beatPulse,
        this.overdriveTimer > 0 || this.currentSectionIntensity === 'drop' ? 0.68 : 0.42
      );
    }

    let speedMultiplier = 1.0 + this.surfMomentum * 0.55 + freq.overall * 0.15;
    if (this.overdriveTimer > 0) speedMultiplier += 0.35;
    if (this.isGrinding) speedMultiplier += 0.25;
    this.lastSpeedMultiplier = speedMultiplier;

    const targetCineZoom = this.computeTargetCinematicZoom(effectiveAudioSec);
    const cineRate = targetCineZoom < this.cinematicZoom ? 4.5 : 2.2;
    this.cinematicZoom += (targetCineZoom - this.cinematicZoom) * (1 - Math.exp(-dt * cineRate));
    this.impactZoomPunch *= Math.exp(-dt * 18);
    if (this.impactZoomPunch < 0.0005) this.impactZoomPunch = 0;

    // 1:1 Reticle-Synchronized Camera Scroll (`reticleWorldX === effectiveAudioSec * baseSpeed`)
    const reticleScreenX = this.getReticleScreenX();
    const targetCameraX = effectiveAudioSec * this.baseSpeed - reticleScreenX;
    if (this.audio.playing) {
      const predictedCameraX = this.cameraX + this.baseSpeed * dt;
      const drift = targetCameraX - predictedCameraX;
      if (Math.abs(drift) > this.baseSpeed * 0.14) {
        this.cameraX = targetCameraX;
      } else {
        this.cameraX = predictedCameraX + drift * Math.min(1, dt * 24);
      }
    } else {
      this.cameraX = targetCameraX;
    }

    this.runCycleTime += dt * speedMultiplier * 1.18;

    this.terrain.update(
      this.cameraX,
      this.width,
      this.height,
      this.elapsedSec,
      freq,
      this.computeViewWorldBounds(true)
    );

    const renderStepX = Math.max(0, this.cameraX - this.prevRenderCameraX);
    this.vfx.update(dt, renderStepX, this.hitstopTimer > 0);
    this.prevRenderCameraX = this.cameraX;

    this.updateLanePostureAndTargets(dt, effectiveAudioSec, freq);

    if (!this.isFailed && this.difficulty !== 'casual' && this.grooveHp <= 0) {
      this.triggerStageFail(effectiveAudioSec, freq, speedMultiplier);
      return;
    }

    this.renderCurrentState(effectiveAudioSec, freq);

    const progress = this.audio.getProgress();
    const isFinished =
      !this.paused && (progress >= 0.995 || (!this.audio.playing && this.elapsedSec > 2.0));
    if (isFinished) {
      this.running = false;
      this.finishedAudioSec = effectiveAudioSec;
      this.pausedFreq = freq;
      if (!this.finishRecorded && !this.isFailed) {
        this.finishRecorded = true;
        const { accuracy, rank } = this.scoreJudge.computeAccuracyAndRank();
        const judgmentCounts = this.scoreJudge.snapshotCounts();
        if (this.currentTrackMeta) {
          const saved = saveTrackRunResult(this.currentTrackMeta, this.difficulty, {
            score: Math.floor(this.scoreJudge.score),
            rank,
            accuracy,
            maxCombo: this.scoreJudge.maxCombo,
            starsCollected: this.scoreJudge.starsCollected,
            judgmentCounts,
          });
          this.lastIsNewRecord = saved.isNewRecord;
          this.lastScoreDelta = saved.scoreDelta;
        }
      }
    }

    this.hudPublishAccum += dt;
    const scoreDirty = this.scoreJudge.consumeDirty();
    if (
      isFinished ||
      this.hudDirty ||
      scoreDirty ||
      this.hudPublishAccum >= HUD_PUBLISH_INTERVAL_SEC
    ) {
      this.hudPublishAccum = 0;
      this.hudDirty = false;
      this.publishHud(progress, speedMultiplier, isFinished);
    }
  }

  private updateLanePostureAndTargets(
    dt: number,
    effectiveAudioSec: number,
    freq: FrequencyBands
  ): void {
    this.resonanceHoldTimer = Math.max(0, this.resonanceHoldTimer - dt);
    const reticleScreenX = this.getReticleScreenX();
    const reticleWorldX = this.cameraX + reticleScreenX;
    const { floorY, angleRad, segment } = this.terrain.sampleFloor(reticleWorldX);

    const nextIntensity = segment?.intensity ?? 'groove';
    if (nextIntensity !== this.currentSectionIntensity) {
      if (nextIntensity === 'drop') {
        this.setBanner({ key: 'dropSection' }, 1.65);
        this.beatPulse = 1.0;
        this.vfx.spawnBurst(reticleScreenX, this.playerY, FORM_CONFIG[this.activeForm].rgb, 18);
      }
      this.currentSectionIntensity = nextIntensity;
      this.hudDirty = true;
    }

    if (
      segment?.isBeatOnset &&
      segment.sliceIndex !== undefined &&
      segment.sliceIndex !== this.lastBeatSliceIndex
    ) {
      this.lastBeatSliceIndex = segment.sliceIndex;
      this.beatPulse = Math.max(this.beatPulse, 0.36);
      this.surfMomentum = Math.min(1.0, this.surfMomentum + 0.04);
    }

    // 1. Update active HOLD ribbons, CHORD partial expiry, RUSH expiry, late MISS & Hazard collisions
    const cfg = DIFFICULTY_CONFIG[this.difficulty];
    const goodSec = cfg.goodMs / 1000;
    const allTargets = this.terrain.getAllTargets();

    while (
      this.firstUnresolvedIdx < allTargets.length &&
      allTargets[this.firstUnresolvedIdx]!.resolved
    ) {
      this.firstUnresolvedIdx++;
    }

    const highY = this.terrain.getLaneHighScreenY();
    const lowY = this.terrain.getLaneLowScreenY();
    const midY = (highY + lowY) * 0.5;
    let activeHoldLane: SlashLane | null = null;

    for (let i = this.firstUnresolvedIdx; i < allTargets.length; i++) {
      const target = allTargets[i]!;
      if (target.resolved) continue;
      if (target.timeSec > effectiveAudioSec + goodSec + 0.35) break;

      if (target.kind === 'chord') {
        if (target.chordPartialLane !== undefined && target.chordPartialSec !== undefined) {
          if (
            effectiveAudioSec - target.chordPartialSec > CHORD_SYNC_WINDOW_SEC ||
            effectiveAudioSec > target.timeSec + goodSec
          ) {
            // [Fix 4] Single-hand CHORD partial expires -> settle as 50% GOOD hit (zero stuck targets)
            target.resolved = true;
            target.hitGrade = 'GOOD';
            this.scoreJudge.recordOrbCollected();
            const partialLane = target.chordPartialLane;
            const py = partialLane === 'high' ? highY : lowY;
            this.collectPrismStarIfPresent(target, reticleScreenX, py);
            this.audio.sfx.playSlashHit(partialLane, 'GOOD', false);
            this.emitSlashJudgment(
              'GOOD',
              reticleScreenX,
              py,
              Math.abs(target.chordPartialSignedMs ?? 0),
              260,
              target.chordPartialSignedMs,
              false,
              partialLane
            );
            this.vfx.spawnSlicedEnemy(
              reticleScreenX,
              py,
              target.radius * 0.85,
              partialLane === 'high' ? -0.4 : 0.4,
              GOLD_RGB,
              Boolean(target.isPrismStar)
            );
          }
        } else if (effectiveAudioSec > target.timeSec + goodSec) {
          target.resolved = true;
          target.hitGrade = 'MISS';
          this.handleMissedTarget(target, true);
        }
        continue;
      }

      if (target.kind === 'hold') {
        const endSec = target.endTimeSec ?? target.timeSec + 0.5;
        if (target.holdActive) {
          const laneY = target.lane === 'high' ? highY : lowY;
          const isHeld =
            this.laneChordHeld ||
            (target.lane === 'high' ? this.laneHighHeld : this.laneLowHeld);

          if (effectiveAudioSec >= endSec - 0.05) {
            // [Fix 4] HOLD ribbon tail completion
            target.holdActive = false;
            target.resolved = true;
            this.scoreJudge.recordGimmickTriggered();
            const tailBonus = Math.round(
              240 *
                this.playerController.profile.chordHoldScoreMult *
                this.getActiveScoreMultiplier()
            );
            this.scoreJudge.addRawScore(tailBonus);
            this.addResonanceGauge(4.5 * this.playerController.profile.gaugeChargeMult);
            this.audio.sfx.playSlashHit(target.lane, 'PERFECT', true);
            this.vfx.spawnSlicedEnemy(
              reticleScreenX,
              laneY,
              target.radius,
              target.lane === 'high' ? -0.35 : 0.35,
              target.lane === 'high' ? CYAN_RGB : CRIMSON_RGB,
              false
            );
            this.vfx.spawnBurst(
              reticleScreenX,
              laneY,
              target.lane === 'high' ? CYAN_RGB : CRIMSON_RGB,
              12
            );
          } else if (isHeld) {
            activeHoldLane = target.lane;
            target.holdReleaseGraceSec = 0.075;
            let safetyTicks = 0;
            while (
              effectiveAudioSec >= (target.holdNextTickSec ?? effectiveAudioSec) &&
              safetyTicks < 4
            ) {
              safetyTicks++;
              target.holdNextTickSec = (target.holdNextTickSec ?? effectiveAudioSec) + 0.1;
              const holdMult =
                this.playerController.profile.chordHoldScoreMult *
                this.getActiveScoreMultiplier();
              this.scoreJudge.addHoldRailTick(holdMult);
              this.addResonanceGauge(1.4 * this.playerController.profile.gaugeChargeMult);
              this.surfMomentum = Math.min(1.0, this.surfMomentum + 0.03);
              this.audio.sfx.playHoldTick();
              this.vfx.spawnParticle(
                reticleScreenX - 6,
                laneY,
                -150 - Math.random() * 110,
                (Math.random() - 0.5) * 90,
                4.0,
                target.lane === 'high' ? CYAN_RGB : CRIMSON_RGB,
                1.0,
                0.24
              );
            }
          } else {
            target.holdReleaseGraceSec = (target.holdReleaseGraceSec ?? 0.075) - dt;
            if (target.holdReleaseGraceSec <= 0) {
              target.holdActive = false;
              target.resolved = true;
            } else {
              activeHoldLane = target.lane;
            }
          }
        } else if (effectiveAudioSec > target.timeSec + goodSec) {
          target.resolved = true;
          target.hitGrade = 'MISS';
          this.handleMissedTarget(target, false);
        }
        continue;
      }

      if (target.kind === 'rush') {
        const endSec = target.endTimeSec ?? target.timeSec + 1.2;
        if (effectiveAudioSec > endSec) {
          target.resolved = true;
          const hits = target.rushHits ?? 0;
          const req = target.rushTargetHits ?? 8;
          this.activeRushCombo = 0;
          this.hudDirty = true;

          if (hits >= Math.ceil(req * 0.5)) {
            target.hitGrade = 'GREAT';
            this.scoreJudge.recordOrbCollected();
            this.collectPrismStarIfPresent(target, reticleScreenX, midY);
            this.audio.sfx.playSlashHit('chord', 'GREAT', false);
            this.emitSlashJudgment('GREAT', reticleScreenX, midY, 0, 380, 0, false, 'chord');
            this.vfx.spawnSlicedEnemy(reticleScreenX, midY, target.radius, -0.45, GOLD_RGB);
          } else if (hits > 0) {
            target.hitGrade = 'GOOD';
            this.scoreJudge.recordOrbCollected();
            this.collectPrismStarIfPresent(target, reticleScreenX, midY);
            this.audio.sfx.playSlashHit('chord', 'GOOD', false);
            this.emitSlashJudgment('GOOD', reticleScreenX, midY, 0, 200, 0, false, 'chord');
            this.vfx.spawnSlicedEnemy(reticleScreenX, midY, target.radius, -0.35, CYAN_RGB);
          } else {
            target.hitGrade = 'MISS';
            this.handleMissedTarget(target, true);
          }
        }
        continue;
      }

      if (target.kind === 'high' || target.kind === 'low') {
        if (effectiveAudioSec > target.timeSec + goodSec) {
          target.resolved = true;
          target.hitGrade = 'MISS';
          this.handleMissedTarget(target, false);
        }
        continue;
      }

      if (target.kind === 'sawblade' || target.kind === 'mine') {
        const hazY = target.lane === 'high' ? highY : lowY;
        const deltaSec = effectiveAudioSec - target.timeSec;

        if (Math.abs(deltaSec) <= 0.055) {
          if (this.overdriveTimer > 0) {
            // Overdrive shatters hazards ONLY (never auto-plays slash targets)
            target.resolved = true;
            this.scoreJudge.recordTrapDestroyed();
            this.scoreJudge.addRawScore(Math.round(250 * this.getActiveScoreMultiplier()));
            this.audio.sfx.playHazardShatter();
            this.vfx.spawnSlicedEnemy(reticleScreenX, hazY, target.radius, -0.42, GOLD_RGB);
            this.vfx.spawnBurst(reticleScreenX, hazY, GOLD_RGB, 14);
          } else if (this.playerLane === target.lane && this.chordPoseTimer <= 0) {
            target.resolved = true;
            target.hitGrade = 'MISS';
            this.applyHazardDamage();
            this.scoreJudge.recordJudgment('MISS', undefined, 0, 1, undefined, {
              lane: target.lane,
            });
            this.audio.sfx.playMiss();
            this.triggerScreenShake(0.24, 7.5);
            this.vfx.spawnBurst(reticleScreenX, hazY, CRIMSON_RGB, 18);
            this.setBanner({ key: 'hazardHit' }, 1.15);
          }
        } else if (deltaSec > 0.055) {
          // Cleanly dodged opposite-lane hazard via active Attack=Dodge positioning!
          target.resolved = true;
          this.scoreJudge.recordGimmickTriggered();
          const dodgeBonus = Math.round(180 * this.getActiveScoreMultiplier());
          this.scoreJudge.addRawScore(dodgeBonus);
          this.addResonanceGauge(3.8 * this.playerController.profile.gaugeChargeMult);
          this.audio.sfx.playCleanDodge();
          this.vfx.spawnAfterimage(
            this.getPlayerRenderScreenX(),
            this.getRenderPlayerY(),
            this.playerRotation,
            this.activeForm,
            0.72
          );
          this.setBanner({ key: 'cleanDodge', params: { bonus: dodgeBonus } }, 0.95);
        }
      }
    }

    // 2. Update Crewmate 2-Lane Posture, Live Music Band Resonance & Auto-Return from HIGH hang (`0.48s`)
    this.isGrinding = activeHoldLane !== null;
    if (activeHoldLane !== null) {
      if (this.overdriveTimer <= 0) {
        const holdForm: ResonanceFormType = activeHoldLane === 'low' ? 'bass' : 'synth';
        if (!(this.activeForm === 'treble' && this.resonanceHoldTimer > 0.18)) {
          this.shiftActiveForm(holdForm, 0.18);
        }
      }
      if (this.playerLane !== activeHoldLane) {
        this.playerLane = activeHoldLane;
        this.hudDirty = true;
      }
      if (activeHoldLane === 'high') {
        this.highAirHangTimer = Math.max(this.highAirHangTimer, 0.14);
      }
    }

    if (this.overdriveTimer > 0) {
      this.shiftActiveForm('treble', 0.1);
    } else if (this.resonanceHoldTimer <= 0) {
      const bandForm: ResonanceFormType =
        this.currentSectionIntensity === 'drop' &&
        freq.high >= 0.48 &&
        freq.high >= freq.low
          ? 'treble'
          : (segment?.energyBand ?? 'synth');
      this.shiftActiveForm(bandForm, 0.18);
    }

    if (this.chordPoseTimer > 0) {
      this.chordPoseTimer = Math.max(0, this.chordPoseTimer - dt);
    } else if (this.playerLane === 'high') {
      if (this.laneHighHeld) {
        this.highAirHangTimer = Math.max(this.highAirHangTimer, 0.1);
      } else {
        this.highAirHangTimer = Math.max(0, this.highAirHangTimer - dt);
        if (this.highAirHangTimer === 0) {
          this.playerLane = 'low';
          this.hudDirty = true;
        }
      }
      const targetY = this.playerLane === 'high' ? highY : lowY;
      this.playerY += (targetY - this.playerY) * Math.min(1, dt * 26);
      this.playerRotation += (-0.08 - this.playerRotation) * Math.min(1, dt * 14);
    } else {
      const scaledPlayerOffset = this.terrain.getFloorScreenY() - lowY;
      const groundTargetY = Math.min(lowY, floorY - scaledPlayerOffset);
      this.playerY += (groundTargetY - this.playerY) * Math.min(1, dt * 28);
      this.playerRotation += (angleRad - this.playerRotation) * Math.min(1, dt * 16);

      if (Math.random() < 0.28) {
        this.vfx.spawnParticle(
          this.getPlayerRenderScreenX() - 10,
          floorY - 2,
          -125 - Math.random() * 105,
          -20 - Math.random() * 50,
          2.6,
          FORM_CONFIG[this.activeForm].secondaryRgb,
          0.85,
          0.2
        );
      }
    }

    const momentumDecay = 0.02 * dt;
    this.surfMomentum = Math.max(0.22, Math.min(1.0, this.surfMomentum - momentumDecay));

    if (
      (this.overdriveTimer > 0 || this.surfMomentum > 0.74) &&
      Math.floor(this.elapsedSec * 24) % 2 === 0
    ) {
      const formsOrder: readonly ResonanceFormType[] = ['bass', 'synth', 'treble'];
      const trailForm =
        this.overdriveTimer > 0
          ? formsOrder[Math.floor(this.elapsedSec * 24) % 3]!
          : this.activeForm;
      this.vfx.spawnAfterimage(
        this.getPlayerRenderScreenX(),
        this.playerY,
        this.playerRotation,
        trailForm,
        this.overdriveTimer > 0 ? 0.7 : 0.4
      );
    }
  }

  private renderCurrentState(audioSec: number, freq: FrequencyBands): void {
    const effectiveZoomScale = this.getEffectiveZoomScale();
    const { fx: effectiveFocalX, fy: effectiveFocalY } = this.getEffectiveFocalPoint();

    let shakeX = 0;
    let shakeY = 0;
    if (this.shakeTimer > 0 && !this.paused) {
      const decay = this.shakeTimer / Math.max(0.01, this.shakeDuration);
      shakeX = Math.sin(this.elapsedSec * 67) * this.shakeIntensity * decay;
      shakeY = Math.cos(this.elapsedSec * 53) * this.shakeIntensity * decay;
    }
    if (this.hitstopTimer > 0 && !this.paused) {
      shakeX += Math.sin(this.elapsedSec * 190) * 2.2;
      shakeY += Math.cos(this.elapsedSec * 163) * 1.6;
    }

    this.renderer?.renderGameFrame({
      width: this.width,
      height: this.height,
      timeSec: this.elapsedSec,
      audioSec,
      worldPxPerSec: this.baseSpeed,
      beatPulse: this.beatPulse,
      combo: this.scoreJudge.combo,
      overdriveActive: this.overdriveTimer > 0,
      overdriveRatio: this.overdriveTimer / OVERDRIVE_DURATION_SEC,
      shakeX,
      shakeY,
      zoomScale: effectiveZoomScale,
      cameraX: this.getRenderCameraX(),
      focalScreenX: effectiveFocalX,
      focalScreenY: effectiveFocalY,
      panX: this.panX,
      panY: this.panY,
      activeForm: this.activeForm,
      skinId: this.selectedSkin,
      resonanceGauge: this.resonanceGauge,
      frequency: freq,
      segments: this.terrain.getSegments(),
      reticleScreenX: this.getReticleScreenX(),
      laneHighScreenY: this.terrain.getLaneHighScreenY(),
      laneLowScreenY: this.terrain.getLaneLowScreenY(),
      playerLane: this.playerLane,
      reticlePulseHigh: this.reticlePulseHigh,
      reticlePulseLow: this.reticlePulseLow,
      targets: this.terrain.getTargets(),
      slicedHalves: this.vfx.getSlicedHalves(),
      playerScreenX: this.getPlayerRenderScreenX(),
      playerScreenY: this.getRenderPlayerY(),
      playerRotation: this.playerRotation,
      playerRadius: this.playerRadius,
      isGrinding: this.isGrinding,
      surfMomentum: this.surfMomentum,
      sectionIntensity: this.currentSectionIntensity,
      invulnerableTimer: this.invulnerableTimer,
      runCycleTime: this.getRenderRunCycleTime(),
      shockwaves: this.vfx.getShockwaves(),
      afterimages: this.vfx.getAfterimages(),
      particles: this.vfx.getParticles(),
      slashes: this.vfx.getSlashes(),
    });
  }

  private publishHud(
    progress: number,
    speedMultiplier: number,
    isFinished: boolean
  ): void {
    const { accuracy, rank } = this.scoreJudge.computeAccuracyAndRank();
    const neutralPan = this.paused ? this.getClampedNeutralPausedPan() : { panX: 0, panY: 0 };
    const isPanned =
      Math.abs(this.panX - neutralPan.panX) > 1 ||
      Math.abs(this.panY - neutralPan.panY) > 1 ||
      Math.abs(this.userZoom - 1) > 0.01;

    this.onHudUpdate({
      rendererMode: this.rendererMode,
      difficulty: this.difficulty,
      sfxMode: this.audio.getSfxMode(),
      fps: this.currentFps,
      zoomDisplay: Number(this.getEffectiveZoomScale().toFixed(2)),
      cinematicCamera: this.cinematicCamera,
      score: Math.floor(this.scoreJudge.score),
      combo: this.scoreJudge.combo,
      maxCombo: this.scoreJudge.maxCombo,
      progress,
      activeForm: this.activeForm,
      resonanceGauge: Math.min(100, Math.max(0, Math.round(this.resonanceGauge))),
      grooveHp: Math.round(this.grooveHp),
      maxGrooveHp: this.maxGrooveHp,
      isFailed: this.isFailed,
      overdriveReady: this.overdriveTimer <= 0 && this.resonanceGauge >= 100,
      overdriveActive: this.overdriveTimer > 0,
      statusBanner: this.statusBanner,
      isFinished,
      trapsDestroyed: this.scoreJudge.trapsDestroyed,
      surfMomentum: Number(this.surfMomentum.toFixed(2)),
      speedMultiplier: Number(speedMultiplier.toFixed(1)),
      orbsCollected: this.scoreJudge.orbsCollected,
      totalOrbs: this.terrain.getTotalSlashTargetCount(),
      starsCollected: this.scoreJudge.starsCollected,
      totalStars: this.terrain.getTotalStarCount() || 3,
      sectionIntensity: this.currentSectionIntensity,
      accuracy,
      rank,
      judgment: this.scoreJudge.activeJudgment,
      judgmentCounts: this.scoreJudge.snapshotCounts(),
      gimmicksTriggered: this.scoreJudge.gimmicksTriggered,
      isNewRecord: this.lastIsNewRecord,
      scoreDelta: this.lastScoreDelta,
      isPaused: this.paused,
      userZoom: Number(this.userZoom.toFixed(2)),
      isPanned,
      playerLane: this.playerLane,
      highKeyFlash: this.laneHighHeld || this.highKeyFlashTimer > 0,
      lowKeyFlash: this.laneLowHeld || this.lowKeyFlashTimer > 0,
      chordKeyFlash: this.laneChordHeld || this.chordKeyFlashTimer > 0,
      rushCombo: this.activeRushCombo > 0 ? this.activeRushCombo : undefined,
      audioOffsetMs: this.audio.getAudioOffsetMs(),
    });
  }

  private setBanner(message: BannerMessage, durationSec: number): void {
    this.statusBanner = message;
    this.statusBannerTimer = durationSec;
    this.hudDirty = true;
  }
}
