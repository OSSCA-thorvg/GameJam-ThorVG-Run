import { AudioEngine } from '../audio/AudioEngine';
import { analyzeTrackBlueprint, WORLD_PX_PER_SEC } from '../audio/TrackAnalyzer';
import { ThorVGRenderer } from '../renderer/ThorVGRenderer';
import {
  DIFFICULTY_CONFIG,
  FORM_CONFIG,
  type BannerMessage,
  type DifficultyMode,
  type GamePhase,
  type HUDTelemetry,
  type JudgmentGrade,
  type LoadingProgress,
  type MicroGate,
  type RendererMode,
  type ResonanceFormType,
  type ResonanceOrb,
  type SectionIntensity,
  type SfxMode,
  type TrackBlueprint,
  type TrackMetadata,
} from '../types/game';
import { BezierTerrain } from './BezierTerrain';
import { PlayerController } from './PlayerController';
import { nextSfxMode, saveTrackRunResult } from './recordsStore';
import { ScoreJudgeSystem } from './systems/ScoreJudgeSystem';
import { VfxPoolSystem } from './systems/VfxPoolSystem';

export const PLAYER_HIT_X_RATIO = 0.24;
const OVERDRIVE_DURATION_SEC = 8.0;
const ZOOM_THRESHOLD = 50.0;
const HUD_PUBLISH_INTERVAL_SEC = 0.05; // 20Hz steady telemetry + 0ms instant flush on discrete dirty events

/**
 * Core 60fps Hybrid Rhythm-Runner Coordinator:
 * - Zero-offset 1:1 Audio-to-Player synchronization (`playerWorldX = audioSec * baseSpeed`)
 * - Composes `BezierTerrain` (O(log N + K) streaming), `PlayerController`, `ScoreJudgeSystem`, and `VfxPoolSystem`
 * - Publishes HUD telemetry at 20Hz with immediate dirty-flag flushing on judgments, combos, and phase transitions
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
  private difficulty: DifficultyMode = 'normal';

  private activeBlueprint: TrackBlueprint | null = null;
  private currentTrackMeta: TrackMetadata | null = null;
  private finishRecorded: boolean = false;
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

  // Phase & Infinite Zoom State (Origin Rebasing)
  private phase: GamePhase = 'MACRO';
  private zoomScale: number = 1.0;
  private rebasedZoomDisplay: number = 1.0;
  private transitionTimer: number = 0;
  private focalScreenX: number = 640;
  private focalScreenY: number = 360;

  // World & Runner Physics State
  private cameraX: number = 0;
  private baseSpeed: number = WORLD_PX_PER_SEC;
  private playerY: number = 360;
  private playerVy: number = 0;
  private playerRotation: number = 0;
  private readonly playerRadius: number = 22;
  private isGrounded: boolean = false;
  private jumpsRemaining: number = 2;
  private dashTimer: number = 0;
  private strikeTimer: number = 0;
  private airBoostTimer: number = 0;
  private dashCooldown: number = 0;
  private isGrinding: boolean = false;
  private isDiveHeld: boolean = false;
  private isJumpHeld: boolean = false;
  private lastActionAudioSec: number = -10;
  private holdTickAccum: number = 0;
  private surfMomentum: number = 0.25;
  private beatPulse: number = 0;
  private lastBeatSliceIndex: number = -1;
  private currentSectionIntensity: SectionIntensity = 'calm';
  private slamActive: boolean = false;
  private invulnerableTimer: number = 0;
  private runCycleTime: number = 0;
  private hitXRatio: number = PLAYER_HIT_X_RATIO;

  // Screen Shake State
  private shakeTimer: number = 0;
  private shakeDuration: number = 0.2;
  private shakeIntensity: number = 0;

  // Resonance Swap, Manual Overdrive & Micro View State
  private activeForm: ResonanceFormType = 'synth';
  private divingTargetForm: ResonanceFormType = 'bass';
  private resonanceGauge: number = 35;
  private microSyncProgress: number = 0;
  private overdriveTimer: number = 0;
  private overdriveNotifiedReady: boolean = false;
  private microPolarity: 1 | -1 = -1;
  private microGates: MicroGate[] = [];
  private nextMicroGateX: number = 0;
  private nextMicroGateId: number = 1;

  // Status Banner State
  private statusBanner: BannerMessage | null = null;
  private statusBannerTimer: number = 0;

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
    this.renderer = renderer;
    this.rendererMode = mode;
    this.width = width;
    this.height = height;
    this.hudDirty = true;
  }

  public setDifficulty(difficulty: DifficultyMode): void {
    this.difficulty = difficulty;
    this.hudDirty = true;
  }

  public getDifficulty(): DifficultyMode {
    return this.difficulty;
  }

  public setSfxMode(mode: SfxMode): void {
    this.audio.setSfxMode(mode);
    this.hudDirty = true;
  }

  public getSfxMode(): SfxMode {
    return this.audio.getSfxMode();
  }

  public cycleSfxMode(): SfxMode {
    const next = nextSfxMode(this.audio.getSfxMode());
    this.audio.setSfxMode(next);
    this.hudDirty = true;
    return next;
  }

  public activateOverdrive(): boolean {
    if (
      !this.running ||
      this.phase !== 'MACRO' ||
      this.overdriveTimer > 0 ||
      this.resonanceGauge < 100
    ) {
      return false;
    }

    this.overdriveTimer = OVERDRIVE_DURATION_SEC;
    this.overdriveNotifiedReady = false;
    this.invulnerableTimer = Math.max(this.invulnerableTimer, OVERDRIVE_DURATION_SEC + 0.15);
    this.dashCooldown = 0;
    this.jumpsRemaining = this.playerController.profile.maxJumps;
    this.surfMomentum = 1.0;
    this.beatPulse = 1.0;
    this.hudDirty = true;

    const sx = this.getPlayerScreenX();
    this.audio.sfx.playOverdriveBurst();
    this.triggerScreenShake(0.32, 9.5);
    this.vfx.spawnShockwave(sx, this.playerY, 24, 340, [255, 230, 0], 1.0);
    this.vfx.spawnShockwave(sx, this.playerY, 16, 220, FORM_CONFIG[this.activeForm].rgb, 0.95);
    this.vfx.spawnBurst(sx, this.playerY, [255, 230, 0], 26);
    this.setBanner({ key: 'overdriveActivate' }, 2.4);
    return true;
  }

  private triggerScreenShake(durationSec: number, intensityPx: number): void {
    if (intensityPx >= this.shakeIntensity || this.shakeTimer <= 0.04) {
      this.shakeDuration = Math.max(0.05, durationSec);
      this.shakeTimer = this.shakeDuration;
      this.shakeIntensity = intensityPx;
    }
  }

  public resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.renderer?.resize(width, height);
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
    } else {
      this.currentTrackMeta = await this.audio.loadTrack(track);
    }

    this.resetState();
    await this.audio.startPlayback();

    this.running = true;
    this.lastFrameTime = performance.now();
    cancelAnimationFrame(this.rafId);
    this.rafId = requestAnimationFrame(this.loop);
  }

  public stopRun(): void {
    this.running = false;
    this.isDiveHeld = false;
    this.isJumpHeld = false;
    cancelAnimationFrame(this.rafId);
    this.audio.stop();
  }

  private getPlayerScreenX(): number {
    return this.width * this.hitXRatio;
  }

  private resetState(): void {
    this.elapsedSec = 0;
    this.hudPublishAccum = 0;
    this.hudDirty = true;
    this.finishRecorded = false;
    this.lastIsNewRecord = false;
    this.lastScoreDelta = 0;
    this.phase = 'MACRO';
    this.zoomScale = 1.0;
    this.rebasedZoomDisplay = 1.0;
    this.transitionTimer = 0;
    this.hitXRatio = PLAYER_HIT_X_RATIO;
    this.baseSpeed =
      this.activeBlueprint?.worldPxPerSec ?? DIFFICULTY_CONFIG[this.difficulty].worldPxPerSec;

    const playerScreenX = this.getPlayerScreenX();
    // At audioSec = 0, playerWorldX = cameraX + playerScreenX === 0!
    this.cameraX = -playerScreenX;

    if (this.activeBlueprint) {
      this.terrain.loadBlueprint(this.activeBlueprint, this.width, this.height);
    } else {
      this.terrain.reset(this.width, this.height);
    }

    const { floorY } = this.terrain.sampleFloor(0);
    this.playerY = floorY - this.playerRadius;
    this.playerVy = 0;
    this.playerRotation = 0;
    this.isGrounded = true;
    this.jumpsRemaining = 2;
    this.dashTimer = 0;
    this.strikeTimer = 0;
    this.airBoostTimer = 0;
    this.dashCooldown = 0;
    this.isGrinding = false;
    this.isDiveHeld = false;
    this.isJumpHeld = false;
    this.lastActionAudioSec = -10;
    this.holdTickAccum = 0;
    this.surfMomentum = 0.25;
    this.beatPulse = 0;
    this.lastBeatSliceIndex = -1;
    this.currentSectionIntensity = 'calm';
    this.slamActive = false;
    this.invulnerableTimer = 0;
    this.runCycleTime = 0;
    this.shakeTimer = 0;
    this.shakeIntensity = 0;

    this.playerController.reset('synth');
    this.activeForm = this.playerController.form;
    this.divingTargetForm = 'bass';
    this.resonanceGauge = 40;
    this.microSyncProgress = 0;
    this.overdriveTimer = 0;
    this.overdriveNotifiedReady = false;
    this.microPolarity = -1;
    this.microGates = [];

    this.scoreJudge.reset();
    this.vfx.reset();
    this.setBanner({ key: 'ready' }, 2.4);
  }

  public setJumpHeld(held: boolean): void {
    this.isJumpHeld = held;
  }

  public setDiveHeld(held: boolean): void {
    if (!this.running) {
      this.isDiveHeld = false;
      return;
    }
    if (held && this.phase === 'MICRO' && !this.isDiveHeld) {
      this.handlePrimaryAction();
    }
    this.isDiveHeld = held;
  }

  private addResonanceGauge(amount: number): void {
    if (this.overdriveTimer > 0) return;
    const prev = this.resonanceGauge;
    this.resonanceGauge = Math.min(100, this.resonanceGauge + amount);
    if (prev < 100 && this.resonanceGauge >= 100 && !this.overdriveNotifiedReady) {
      this.overdriveNotifiedReady = true;
      this.hudDirty = true;
      if (this.phase === 'MACRO') {
        this.setBanner({ key: 'overdriveReady' }, 1.9);
      }
    }
  }

  private getActiveScoreMultiplier(): number {
    const overdriveMult = this.overdriveTimer > 0 ? 2.0 : 1.0;
    const dropMult = this.currentSectionIntensity === 'drop' ? 1.25 : 1.0;
    return overdriveMult * dropMult;
  }

  private emitJudgment(
    grade: JudgmentGrade,
    screenX: number,
    screenY: number,
    deltaMs?: number,
    basePoints: number = 220,
    signedDeltaMs?: number,
    suppressGaugeGain: boolean = false
  ): void {
    this.scoreJudge.recordJudgment(
      grade,
      deltaMs,
      basePoints,
      this.getActiveScoreMultiplier(),
      signedDeltaMs
    );

    if (grade === 'PERFECT') {
      this.beatPulse = 1.0;
      this.surfMomentum = Math.min(1.0, this.surfMomentum + 0.1);
      if (!suppressGaugeGain) this.addResonanceGauge(4);
      this.vfx.spawnShockwave(screenX, screenY, 14, 92, [255, 230, 0], 0.95);
      this.vfx.spawnBurst(screenX, screenY, [255, 230, 0], 12);
    } else if (grade === 'GREAT') {
      this.beatPulse = Math.max(this.beatPulse, 0.55);
      this.surfMomentum = Math.min(1.0, this.surfMomentum + 0.06);
      if (!suppressGaugeGain) this.addResonanceGauge(2.5);
      this.vfx.spawnBurst(screenX, screenY, [5, 213, 255], 8);
    } else if (grade === 'GOOD') {
      if (!suppressGaugeGain) this.addResonanceGauge(1.2);
    } else if (grade === 'MISS') {
      this.surfMomentum = Math.max(0.15, this.surfMomentum * 0.5);
    }
  }

  private collectOrbWithSynergy(
    orb: ResonanceOrb,
    playerScreenX: number,
    audioSec: number
  ): void {
    orb.collected = true;
    this.scoreJudge.recordOrbCollected();
    const oy = orb.screenY ?? orb.worldY;

    if (orb.isPrismStar) {
      this.scoreJudge.recordStarCollected();
      this.addResonanceGauge(20);
      this.audio.sfx.playPrismStar();
      this.triggerScreenShake(0.22, 6.5);
      this.vfx.spawnShockwave(playerScreenX, oy, 18, 165, [255, 230, 0], 1.0);
      this.vfx.spawnBurst(playerScreenX, oy, [255, 230, 0], 24);
      this.emitJudgment('PERFECT', playerScreenX, oy, 0, 1500, 0, true);
      this.setBanner(
        {
          key: 'prismStar',
          params: {
            collected: this.scoreJudge.starsCollected,
            total: this.terrain.getTotalStarCount() || 3,
          },
        },
        1.65
      );
      return;
    }

    const targetSec = orb.timeSec ?? orb.worldX / this.baseSpeed;
    const rawSignedMs = Math.round((audioSec - targetSec) * 1000);
    const deltaMs = Math.abs(rawSignedMs);
    const grade = this.scoreJudge.classifyDeltaMs(deltaMs, this.difficulty);
    const isBandMatch = this.overdriveTimer > 0 || this.activeForm === orb.band;
    if (isBandMatch) {
      this.addResonanceGauge(2.5);
    }
    this.audio.sfx.playNoteHit(orb.band, grade, isBandMatch);
    const basePts = (orb.isBeatTarget ? 250 : 170) * (isBandMatch ? 1.5 : 1.0);
    this.emitJudgment(grade, playerScreenX, oy, deltaMs, Math.round(basePts), rawSignedMs);
    if (isBandMatch) {
      this.vfx.spawnBurst(playerScreenX, oy, FORM_CONFIG[orb.band].rgb, 7);
    }
  }

  /**
   * When the player actively presses Jump or Skill/Dash, snaps nearby beat targets
   * within a tight vertical window (`dy <= 68px`) so deliberate rhythm tapping feels razor-sharp
   * without vacuuming upper-deck notes prematurely!
   */
  private judgeNearbyBeatTargetOnInput(playerScreenX: number, playerWorldX: number): void {
    const audioSec = this.audio.getElapsedSec();
    this.lastActionAudioSec = audioSec;
    const cfg = DIFFICULTY_CONFIG[this.difficulty];
    const windowPx = (cfg.goodMs / 1000) * this.baseSpeed + 24;

    // 1. Check Airborne Dash Rings first
    for (const ring of this.terrain.getDashRings()) {
      if (ring.triggered) continue;
      const dx = Math.abs(ring.worldX - playerWorldX);
      const ry = ring.screenY ?? ring.worldY;
      const dy = Math.abs(ry - this.playerY);
      if (dx <= windowPx + ring.radius && dy <= ring.radius + this.playerRadius + 46) {
        this.activateDashRing(ring, playerScreenX, audioSec);
        return;
      }
    }

    // 2. Check closest uncollected Beat Note within tight vertical reach
    let bestOrb: ResonanceOrb | null = null;
    let bestDx = Infinity;
    for (const orb of this.terrain.getOrbs()) {
      if (orb.collected) continue;
      const dx = Math.abs(orb.worldX - playerWorldX);
      const oy = orb.screenY ?? orb.worldY;
      const dy = Math.abs(oy - this.playerY);
      const maxVerticalSnap = orb.isPrismStar ? 48 : 68;
      if (dx <= windowPx && dy <= maxVerticalSnap && dx < bestDx) {
        bestDx = dx;
        bestOrb = orb;
      }
    }

    if (bestOrb) {
      this.collectOrbWithSynergy(bestOrb, playerScreenX, audioSec);
    }
  }

  public handlePrimaryAction(): void {
    if (!this.running) return;
    this.isJumpHeld = true;

    const playerScreenX = this.getPlayerScreenX();
    const playerWorldX = this.cameraX + playerScreenX;

    if (this.phase === 'MICRO') {
      this.microPolarity = this.microPolarity === -1 ? 1 : -1;
      const targetLaneY =
        this.microPolarity === -1 ? this.height * 0.34 : this.height * 0.66;
      this.playerY = targetLaneY;
      this.vfx.spawnBurst(
        playerScreenX,
        this.playerY,
        FORM_CONFIG[this.divingTargetForm].rgb,
        10
      );
      this.scoreJudge.addRawScore(35 * this.scoreJudge.combo);
      return;
    }

    if (this.phase !== 'MACRO') return;

    this.judgeNearbyBeatTargetOnInput(playerScreenX, playerWorldX);

    // If activateDashRing just triggered an air boost, don't overwrite its horizontal trajectory
    if (this.airBoostTimer > 0.24) return;

    const profile = this.playerController.profile;
    if (this.isGrounded || this.jumpsRemaining > 0) {
      const isSecondJump = !this.isGrounded;
      this.playerVy = isSecondJump ? profile.secondJumpVelocity : profile.jumpVelocity;
      this.isGrounded = false;
      this.isGrinding = false;
      this.jumpsRemaining = Math.max(
        0,
        (isSecondJump ? this.jumpsRemaining : profile.maxJumps) - 1
      );
      this.audio.sfx.playJump(isSecondJump);
      this.vfx.spawnBurst(
        playerScreenX,
        this.playerY + this.playerRadius,
        FORM_CONFIG[this.activeForm].rgb,
        9
      );
    }
  }

  public handleFormSwap(targetForm?: ResonanceFormType): void {
    if (!this.running) return;
    const nextForm = targetForm ?? this.playerController.cycleForm();
    this.playerController.swapForm(nextForm);
    this.activeForm = nextForm;
    const maxJumps = this.playerController.profile.maxJumps;
    if (this.isGrounded) {
      this.jumpsRemaining = maxJumps;
    } else {
      this.jumpsRemaining = Math.min(this.jumpsRemaining, maxJumps);
    }
    this.hudDirty = true;
    const playerScreenX = this.getPlayerScreenX();
    this.vfx.spawnBurst(playerScreenX, this.playerY, FORM_CONFIG[nextForm].rgb, 18);
    this.setBanner({ key: 'manualSwap', params: { form: nextForm } }, 1.6);
  }

  public handleSecondaryAction(): void {
    if (!this.running) return;

    if (this.phase === 'MICRO') {
      this.handlePrimaryAction();
      return;
    }

    if (this.phase !== 'MACRO' || this.dashCooldown > 0) return;

    const profile = this.playerController.profile;
    const playerScreenX = this.getPlayerScreenX();
    const playerWorldX = this.cameraX + playerScreenX;

    this.strikeTimer = 0.28;
    this.judgeNearbyBeatTargetOnInput(playerScreenX, playerWorldX);

    if (this.activeForm === 'bass') {
      if (!this.isGrounded) {
        this.playerVy = 1320;
        this.slamActive = true;
        this.dashCooldown = profile.dashCooldownSec;
      } else {
        this.dashCooldown = profile.dashCooldownSec;
        this.triggerBassShockwave(playerScreenX, this.playerY, playerWorldX);
      }
      return;
    }

    this.dashTimer = profile.dashDurationSec;
    this.dashCooldown = profile.dashCooldownSec;
    this.playerVy = 0;
    this.surfMomentum = Math.min(1.0, this.surfMomentum + 0.25);

    if (profile.piercesTrapsDuringDash) {
      this.invulnerableTimer = Math.max(this.invulnerableTimer, profile.dashDurationSec + 0.1);
      this.setBanner({ key: 'blinkDash' }, 0.9);
    }
  }

  private activateDashRing(
    ring: { worldX: number; worldY: number; screenY?: number; timeSec: number; triggered: boolean },
    playerScreenX: number,
    audioSec: number
  ): void {
    ring.triggered = true;
    this.scoreJudge.recordGimmickTriggered();
    const ry = ring.screenY ?? ring.worldY;
    this.playerY = ry;
    this.playerVy = 0;
    this.isGrounded = false;
    this.airBoostTimer = 0.3;
    this.strikeTimer = 0.32;
    this.invulnerableTimer = Math.max(this.invulnerableTimer, 0.36);
    this.jumpsRemaining = this.playerController.profile.maxJumps;
    this.surfMomentum = Math.min(1.0, this.surfMomentum + 0.3);
    this.audio.sfx.playDashRing();

    const rawSignedMs = Math.round((audioSec - ring.timeSec) * 1000);
    const deltaMs = Math.abs(rawSignedMs);
    const inputRecent = Math.abs(audioSec - this.lastActionAudioSec) <= 0.16;
    const grade: JudgmentGrade = inputRecent
      ? this.scoreJudge.classifyDeltaMs(deltaMs, this.difficulty)
      : 'GREAT';
    this.emitJudgment(grade, playerScreenX, ry, deltaMs, 320, rawSignedMs);
    this.setBanner({ key: 'wavePump' }, 1.1);
  }

  private loop = (now: number): void => {
    if (!this.running) return;

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
    this.rafId = requestAnimationFrame(this.loop);
  };

  private updateFrame(dt: number): void {
    const freq = this.audio.getFrequencyData();
    const audioSec = this.audio.getElapsedSec();

    if (this.statusBannerTimer > 0) {
      this.statusBannerTimer = Math.max(0, this.statusBannerTimer - dt);
      if (this.statusBannerTimer === 0 && this.statusBanner !== null) {
        this.statusBanner = null;
        this.hudDirty = true;
      }
    }
    this.scoreJudge.tick(dt);

    if (this.dashCooldown > 0) this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    if (this.strikeTimer > 0) this.strikeTimer = Math.max(0, this.strikeTimer - dt);
    if (this.invulnerableTimer > 0) {
      this.invulnerableTimer = Math.max(0, this.invulnerableTimer - dt);
    }
    if (this.shakeTimer > 0) {
      this.shakeTimer = Math.max(0, this.shakeTimer - dt);
    }
    if (this.overdriveTimer > 0) {
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

    // Forward hit-line surge during OVERDRIVE (0.30W) and DROP (0.265W), keeping 0.0ms beat sync!
    const targetHitRatio =
      this.phase === 'MACRO'
        ? this.overdriveTimer > 0
          ? 0.3
          : this.currentSectionIntensity === 'drop'
            ? 0.265
            : PLAYER_HIT_X_RATIO
        : PLAYER_HIT_X_RATIO;
    this.hitXRatio += (targetHitRatio - this.hitXRatio) * Math.min(1, dt * 4.5);

    let speedMultiplier = 1.0 + this.surfMomentum * 0.65 + freq.overall * 0.15;
    if (this.overdriveTimer > 0) {
      speedMultiplier += 0.35;
    }
    if (this.airBoostTimer > 0) {
      this.airBoostTimer = Math.max(0, this.airBoostTimer - dt);
      speedMultiplier = 2.35;
    } else if (this.dashTimer > 0) {
      this.dashTimer = Math.max(0, this.dashTimer - dt);
      speedMultiplier = this.activeForm === 'treble' ? 2.4 : 1.95;
    } else if (this.isGrinding) {
      speedMultiplier += 0.35;
    }

    const playerScreenX = this.getPlayerScreenX();
    // Exact 0.0ms synchronization: advance by baseSpeed * dt first, then correct residual clock drift!
    const targetCameraX = audioSec * this.baseSpeed - playerScreenX;
    const prevCameraX = this.cameraX;
    if (this.audio.playing) {
      const predictedCameraX = this.cameraX + this.baseSpeed * dt;
      const drift = targetCameraX - predictedCameraX;
      if (Math.abs(drift) > this.baseSpeed * 0.6) {
        this.cameraX = targetCameraX;
      } else {
        this.cameraX = predictedCameraX + drift * Math.min(1, dt * 18);
      }
    } else {
      this.cameraX += this.baseSpeed * dt;
    }
    const stepX = Math.max(0, this.cameraX - prevCameraX);

    if ((this.phase === 'MACRO' && (this.isGrounded || this.isGrinding)) || this.phase === 'MICRO') {
      this.runCycleTime += dt * speedMultiplier * 1.12;
    }

    const playerWorldX = this.cameraX + playerScreenX;

    this.terrain.update(this.cameraX, this.width, this.height, this.elapsedSec, freq);

    if (this.phase === 'MACRO') {
      this.updateMacroPhase(dt, playerScreenX, playerWorldX, audioSec, speedMultiplier);
    } else if (this.phase === 'ZOOM_IN') {
      this.updateZoomInTransition(dt, playerScreenX);
    } else if (this.phase === 'MICRO') {
      this.updateMicroPhase(dt, playerScreenX, playerWorldX);
    } else if (this.phase === 'ZOOM_OUT') {
      this.updateZoomOutTransition(dt, playerScreenX, playerWorldX);
    }

    this.vfx.update(dt, stepX);

    // Beat Camera Zoom Punch & Damped Impact Shake in MACRO phase
    const punchScale =
      this.overdriveTimer > 0
        ? 0.052
        : this.currentSectionIntensity === 'drop'
          ? 0.044
          : 0.028;
    const effectiveZoomScale =
      this.phase === 'MACRO' ? 1.0 + this.beatPulse * punchScale : this.zoomScale;
    const effectiveFocalX = this.phase === 'MACRO' ? playerScreenX : this.focalScreenX;
    const effectiveFocalY = this.phase === 'MACRO' ? this.playerY : this.focalScreenY;

    let shakeX = 0;
    let shakeY = 0;
    if (this.shakeTimer > 0) {
      const decay = this.shakeTimer / Math.max(0.01, this.shakeDuration);
      shakeX = Math.sin(this.elapsedSec * 67) * this.shakeIntensity * decay;
      shakeY = Math.cos(this.elapsedSec * 53) * this.shakeIntensity * decay;
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
      phase: this.phase,
      zoomScale: effectiveZoomScale,
      rebasedZoomDisplay: this.rebasedZoomDisplay,
      cameraX: this.cameraX,
      focalScreenX: effectiveFocalX,
      focalScreenY: effectiveFocalY,
      activeForm: this.activeForm,
      divingTargetForm: this.divingTargetForm,
      resonanceGauge: this.resonanceGauge,
      frequency: freq,
      segments: this.terrain.getSegments(),
      orbs: this.terrain.getOrbs(),
      skyPlatforms: this.terrain.getSkyPlatforms(),
      jumpPads: this.terrain.getJumpPads(),
      dashRings: this.terrain.getDashRings(),
      holdRails: this.terrain.getHoldRails(),
      traps: this.terrain.getTraps(),
      divingNodes: this.terrain.getDivingNodes(),
      microGates: this.microGates,
      microPolarity: this.microPolarity,
      playerScreenX,
      playerScreenY: this.playerY,
      playerRotation: this.playerRotation,
      playerRadius: this.playerRadius,
      isDashing: this.dashTimer > 0 || this.airBoostTimer > 0 || this.strikeTimer > 0,
      isGrinding: this.isGrinding,
      isDiving: this.isDiveHeld,
      surfMomentum: this.surfMomentum,
      sectionIntensity: this.currentSectionIntensity,
      invulnerableTimer: this.invulnerableTimer,
      runCycleTime: this.runCycleTime,
      shockwaves: this.vfx.getShockwaves(),
      afterimages: this.vfx.getAfterimages(),
      particles: this.vfx.getParticles(),
    });

    const progress = this.audio.getProgress();
    const isFinished = progress >= 0.995 || (!this.audio.playing && this.elapsedSec > 2.0);
    if (isFinished) {
      this.running = false;
      if (!this.finishRecorded) {
        this.finishRecorded = true;
        if (this.currentTrackMeta) {
          const { accuracy, rank } = this.scoreJudge.computeAccuracyAndRank();
          const saved = saveTrackRunResult(this.currentTrackMeta, this.difficulty, {
            score: Math.floor(this.scoreJudge.score),
            rank,
            accuracy,
            maxCombo: this.scoreJudge.maxCombo,
            starsCollected: this.scoreJudge.starsCollected,
            judgmentCounts: this.scoreJudge.snapshotCounts(),
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

  private publishHud(
    progress: number,
    speedMultiplier: number,
    isFinished: boolean
  ): void {
    const { accuracy, rank } = this.scoreJudge.computeAccuracyAndRank();

    this.onHudUpdate({
      rendererMode: this.rendererMode,
      difficulty: this.difficulty,
      sfxMode: this.audio.getSfxMode(),
      fps: this.currentFps,
      phase: this.phase,
      zoomDisplay: Number(this.rebasedZoomDisplay.toFixed(1)),
      score: Math.floor(this.scoreJudge.score),
      combo: this.scoreJudge.combo,
      maxCombo: this.scoreJudge.maxCombo,
      progress,
      activeForm: this.activeForm,
      resonanceGauge: Math.min(100, Math.max(0, Math.round(this.resonanceGauge))),
      microSyncProgress: Math.min(100, Math.max(0, Math.round(this.microSyncProgress))),
      overdriveReady:
        this.phase === 'MACRO' && this.overdriveTimer <= 0 && this.resonanceGauge >= 100,
      overdriveActive: this.overdriveTimer > 0,
      acousticFilter: this.audio.getAcousticZoomMode(),
      statusBanner: this.statusBanner,
      isFinished,
      trapsDestroyed: this.scoreJudge.trapsDestroyed,
      divesCompleted: this.scoreJudge.divesCompleted + this.scoreJudge.gimmicksTriggered,
      surfMomentum: Number(this.surfMomentum.toFixed(2)),
      speedMultiplier: Number(speedMultiplier.toFixed(1)),
      orbsCollected: this.scoreJudge.orbsCollected,
      totalOrbs: this.terrain.getTotalOrbCount(),
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
    });
  }

  private updateMacroPhase(
    dt: number,
    playerScreenX: number,
    playerWorldX: number,
    audioSec: number,
    speedMultiplier: number
  ): void {
    const { floorY, angleRad, isGap, segment } = this.terrain.sampleFloor(playerWorldX);

    const nextIntensity = segment?.intensity ?? 'groove';
    if (nextIntensity !== this.currentSectionIntensity) {
      if (nextIntensity === 'drop') {
        this.setBanner({ key: 'dropSection' }, 1.8);
        this.beatPulse = 1.0;
        this.vfx.spawnBurst(playerScreenX, this.playerY, FORM_CONFIG[this.activeForm].rgb, 20);
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
      this.surfMomentum = Math.min(1.0, this.surfMomentum + 0.05);
    }

    // 1. Check Active Hold Note Rail (`HoldRail`) lock-on & grinding!
    let ridingRail = false;
    for (const rail of this.terrain.getHoldRails()) {
      if (rail.completed) continue;
      if (playerWorldX >= rail.x0 - 18 && playerWorldX <= rail.x1 + 18) {
        const railY = rail.screenY ?? rail.worldY;
        const closeEnough = Math.abs(this.playerY - railY) <= this.playerRadius + 30;
        if (closeEnough && (this.isJumpHeld || rail.active || this.playerVy >= -40)) {
          rail.active = true;
          ridingRail = true;
          this.isGrounded = true;
          this.isGrinding = true;
          this.playerY += (railY - this.playerY) * Math.min(1, dt * 28);
          this.playerVy = 0;
          this.playerRotation = 0;
          this.jumpsRemaining = this.activeForm === 'synth' ? 2 : 1;

          // Emit continuous rail sparks & combo ticks every 0.10s
          this.holdTickAccum += dt;
          if (this.holdTickAccum >= 0.1) {
            this.holdTickAccum -= 0.1;
            const bandRailMult =
              this.overdriveTimer > 0 || this.activeForm === rail.band ? 1.5 : 1.0;
            this.scoreJudge.addHoldRailTick(bandRailMult * this.getActiveScoreMultiplier());
            this.addResonanceGauge(bandRailMult > 1 ? 1.2 : 0.6);
            this.surfMomentum = Math.min(1.0, this.surfMomentum + 0.04);
            this.vfx.spawnParticle(
              playerScreenX - 10,
              railY + this.playerRadius * 0.65,
              -150 - Math.random() * 120,
              -30 - Math.random() * 80,
              4.2,
              FORM_CONFIG[rail.band].rgb,
              1.0,
              0.26
            );
          }

          if (playerWorldX >= rail.x1 - 20) {
            rail.completed = true;
            this.scoreJudge.recordGimmickTriggered();
            this.scoreJudge.recordOrbCollected();
            this.audio.sfx.playNoteHit(
              rail.band,
              'PERFECT',
              this.overdriveTimer > 0 || this.activeForm === rail.band
            );
            this.emitJudgment('PERFECT', playerScreenX, railY, 0, 320, 0);
            this.setBanner({ key: 'beatBounce' }, 1.1);
          }
          break;
        }
      }
    }
    if (!ridingRail) {
      this.isGrinding = false;
    }

    // 2. Vertical Physics, One-Way 2F Sky Platform & Ground Road / Chasm Gap Resolution
    const prevBottomY = this.playerY + this.playerRadius;

    if (!ridingRail) {
      if (this.airBoostTimer > 0 || (this.dashTimer > 0 && this.activeForm === 'treble')) {
        this.playerVy = 0;
        this.playerRotation = 0;
        this.vfx.spawnAfterimage(playerScreenX, this.playerY, 0, this.activeForm, 0.82);
      } else {
        const baseGravity = this.playerController.profile.gravity;
        const fastDropMult = !this.isGrounded && this.isDiveHeld ? 2.45 : 1.0;
        this.playerVy += baseGravity * fastDropMult * dt;
        this.playerY += this.playerVy * dt;
      }

      const nextBottomY = this.playerY + this.playerRadius;

      // 2A. Check One-Way 2F Sky Platform Landing
      const skyPlat =
        this.playerVy >= 0
          ? this.terrain.sampleSkyPlatform(playerWorldX, prevBottomY, nextBottomY, this.isDiveHeld)
          : null;

      if (skyPlat) {
        const platY = skyPlat.screenY ?? skyPlat.worldY;
        const wasAir = !this.isGrounded;
        this.playerY = platY - this.playerRadius;
        this.playerVy = 0;
        this.isGrounded = true;
        this.jumpsRemaining = this.playerController.profile.maxJumps;
        this.playerRotation = 0;
        if (wasAir) {
          if (this.overdriveTimer > 0 || this.activeForm === skyPlat.band) {
            // 3-Color Band Passive Synergy: instant Dash/Skill refresh on matching SkyPlatform!
            this.dashCooldown = 0;
            this.addResonanceGauge(3);
          }
          this.vfx.spawnBurst(playerScreenX, platY, FORM_CONFIG[skyPlat.band].secondaryRgb, 8);
        }
      } else if (!isGap) {
        // 2B. Solid 1F Ground Sprint Road
        const targetGroundY = floorY - this.playerRadius;
        if (this.playerY >= targetGroundY) {
          const wasAirborne = !this.isGrounded;
          this.playerY = targetGroundY;
          this.playerVy = 0;
          this.isGrounded = true;
          this.jumpsRemaining = this.activeForm === 'synth' ? 2 : 1;
          this.playerRotation = angleRad;

          // Subtle sprint dust sparks while running fast
          if (Math.random() < 0.35) {
            this.vfx.spawnParticle(
              playerScreenX - 10,
              floorY - 2,
              -120 - Math.random() * 110,
              -25 - Math.random() * 55,
              2.8,
              FORM_CONFIG[this.activeForm].secondaryRgb,
              0.9,
              0.22
            );
          }

          if (wasAirborne && this.activeForm === 'bass' && this.slamActive) {
            this.slamActive = false;
            this.triggerBassShockwave(playerScreenX, this.playerY, playerWorldX);
          }
        } else {
          this.isGrounded = false;
          this.playerRotation = Math.max(-0.55, Math.min(0.65, (this.playerVy / 950) * 0.48));
        }
      } else {
        // 2C. Over an Abyss Chasm Gap (`isGap === true`)!
        this.isGrounded = false;
        this.playerRotation = Math.max(-0.55, Math.min(0.65, (this.playerVy / 950) * 0.48));

        // Fell into the chasm -> Emergency Bounce Rescue + MISS!
        if (this.playerY > floorY + 58) {
          this.playerY = floorY - this.playerRadius - 14;
          this.playerVy = -680;
          this.jumpsRemaining = 1;
          this.invulnerableTimer = 1.1;
          this.audio.sfx.playMiss();
          this.triggerScreenShake(0.26, 8.0);
          this.emitJudgment('MISS', playerScreenX, floorY);
          this.setBanner({ key: 'gapFall' }, 1.25);
          this.vfx.spawnBurst(playerScreenX, floorY, [255, 50, 95], 18);
        }
      }
    }

    // Gentle momentum baseline while sprinting cleanly
    this.surfMomentum = Math.max(0.22, Math.min(1.0, this.surfMomentum - 0.06 * dt + 0.04 * dt));

    if (
      (this.overdriveTimer > 0 || this.surfMomentum > 0.72) &&
      Math.floor(this.elapsedSec * 24) % 2 === 0
    ) {
      const formsOrder: ResonanceFormType[] = ['bass', 'synth', 'treble'];
      const trailForm =
        this.overdriveTimer > 0
          ? formsOrder[Math.floor(this.elapsedSec * 24) % 3]!
          : this.activeForm;
      this.vfx.spawnAfterimage(
        playerScreenX,
        this.playerY,
        this.playerRotation,
        trailForm,
        this.overdriveTimer > 0 ? 0.72 : 0.42
      );
    }

    // Continuous sprint distance score (with smooth soft-cap on ultra-high combos)
    const runComboFactor = Math.max(1, Math.min(250, this.scoreJudge.combo) * 0.35);
    this.scoreJudge.addRawScore(
      dt * 75 * speedMultiplier * runComboFactor * this.getActiveScoreMultiplier()
    );

    // 3. Check Beat Jump Pads & SlamPads (`JumpPad`)
    for (const pad of this.terrain.getJumpPads()) {
      if (pad.triggered) continue;
      const padY = pad.screenY ?? pad.worldY;
      const dx = Math.abs(pad.worldX - playerWorldX);
      const playerBottom = this.playerY + this.playerRadius;
      if (dx <= 36 && Math.abs(playerBottom - padY) <= 34) {
        pad.triggered = true;
        this.scoreJudge.recordGimmickTriggered();
        if (pad.kind === 'slam') {
          const isSlamHit =
            this.overdriveTimer > 0 || this.isDiveHeld || this.slamActive || this.playerVy > 420;
          this.slamActive = false;
          this.isGrounded = false;
          this.jumpsRemaining = this.playerController.profile.maxJumps;
          if (isSlamHit) {
            this.playerVy = -895;
            this.addResonanceGauge(12);
            this.audio.sfx.playSlamImpact();
            this.triggerScreenShake(0.26, 8.5);
            this.vfx.spawnShockwave(playerScreenX, padY, 22, 310, [255, 210, 50], 1.0);
            this.vfx.spawnBurst(playerScreenX, padY, [255, 230, 0], 22);
            // Shatter nearby hazards with the SlamPad shockwave!
            for (const trap of this.terrain.getTraps()) {
              if (
                !trap.destroyed &&
                trap.worldX >= playerWorldX - 90 &&
                trap.worldX <= playerWorldX + 380
              ) {
                trap.destroyed = true;
                this.scoreJudge.recordTrapDestroyed();
              }
            }
            this.emitJudgment('PERFECT', playerScreenX, padY - 14, 0, 400, 0, true);
            this.setBanner({ key: 'slamImpact' }, 1.35);
          } else {
            this.playerVy = -560;
            this.audio.sfx.playJumpPad();
            this.emitJudgment('GOOD', playerScreenX, padY - 12, undefined, 170, undefined, true);
          }
        } else {
          this.playerVy = -855; // High super-bounce onto 2F Sky Platform or across wide chasm!
          this.isGrounded = false;
          this.jumpsRemaining = this.playerController.profile.maxJumps;
          this.audio.sfx.playJumpPad();
          const rawSignedMs = Math.round((audioSec - pad.timeSec) * 1000);
          const deltaMs = Math.abs(rawSignedMs);
          const inputRecent = Math.abs(audioSec - this.lastActionAudioSec) <= 0.15;
          this.emitJudgment(
            inputRecent
              ? this.scoreJudge.classifyDeltaMs(deltaMs, this.difficulty)
              : 'PERFECT',
            playerScreenX,
            padY - 12,
            deltaMs,
            300,
            rawSignedMs
          );
          this.setBanner({ key: 'crestLaunch' }, 1.15);
        }
      }
    }

    // 4. Check Airborne Dash Rings (`DashRing`)
    for (const ring of this.terrain.getDashRings()) {
      if (ring.triggered) continue;
      const ry = ring.screenY ?? ring.worldY;
      const dist = Math.hypot(ring.worldX - playerWorldX, ry - this.playerY);
      if (dist <= ring.radius + this.playerRadius + 14) {
        this.activateDashRing(ring, playerScreenX, audioSec);
      }
    }

    // 5. Collect Rhythm Beat Notes & Prism Stars (`ResonanceOrb`) + 3-Color Band Magnetism
    for (const orb of this.terrain.getOrbs()) {
      if (orb.collected) continue;
      let orbY = orb.screenY ?? orb.worldY;
      const isBandMatch = this.overdriveTimer > 0 || this.activeForm === orb.band;
      const magnetRadius = this.overdriveTimer > 0 ? 185 : !orb.isPrismStar && isBandMatch ? 118 : 0;

      if (magnetRadius > 0) {
        const distToPlayer = Math.hypot(orb.worldX - playerWorldX, orbY - this.playerY);
        if (distToPlayer <= magnetRadius && distToPlayer > 1) {
          const pull = Math.min(1, dt * (this.overdriveTimer > 0 ? 17 : 12.5));
          orb.worldX += (playerWorldX - orb.worldX) * pull;
          orbY += (this.playerY - orbY) * pull;
          orb.screenY = orbY;
        }
      }

      const dx = orb.worldX - playerWorldX;
      const dy = orbY - this.playerY;
      const collectRadius =
        orb.radius +
        this.playerRadius +
        (this.overdriveTimer > 0 || this.dashTimer > 0 || this.airBoostTimer > 0 ? 22 : 14);
      if (dx * dx + dy * dy <= collectRadius * collectRadius) {
        this.collectOrbWithSynergy(orb, playerScreenX, audioSec);
      }
    }

    // 6. Check Frequency Diving Node Collision -> Trigger Infinite Scale Transition
    for (const node of this.terrain.getDivingNodes()) {
      if (node.activated) continue;
      const dist = Math.hypot(node.worldX - playerWorldX, node.worldY - this.playerY);
      if (dist <= node.radius + this.playerRadius + 16) {
        node.activated = true;
        this.beginScaleZoomIn(node.targetForm, playerScreenX, node.worldY);
        return;
      }
    }

    // 7. Check Ground Beat Traps & Aerial BeatDrones
    const isStriking =
      this.overdriveTimer > 0 ||
      this.strikeTimer > 0 ||
      this.dashTimer > 0 ||
      this.airBoostTimer > 0 ||
      this.slamActive;

    for (const trap of this.terrain.getTraps()) {
      if (trap.destroyed) continue;

      if (trap.isAerialDrone) {
        const droneY = trap.screenFloorY ?? floorY - 72;
        if (!trap.passed && trap.worldX < playerWorldX - trap.width) {
          trap.passed = true;
        }
        const dist = Math.hypot(trap.worldX - playerWorldX, droneY - this.playerY);
        const hitRadius = trap.width * 0.5 + this.playerRadius + (isStriking ? 30 : -3);
        if (dist <= hitRadius) {
          if (isStriking) {
            trap.destroyed = true;
            this.scoreJudge.recordTrapDestroyed();
            this.scoreJudge.recordGimmickTriggered();
            // Slicing a BeatDrone instantly refills Dash/Skill & Air Jumps!
            this.dashCooldown = 0;
            this.jumpsRemaining = this.playerController.profile.maxJumps;
            this.addResonanceGauge(8);
            this.audio.sfx.playHazardShatter();
            this.triggerScreenShake(0.18, 6.0);
            this.vfx.spawnShockwave(playerScreenX, droneY, 16, 155, [5, 213, 255], 1.0);
            this.vfx.spawnBurst(playerScreenX, droneY, [255, 42, 109], 20);
            this.emitJudgment('PERFECT', playerScreenX, droneY, 0, 340, 0, true);
            this.setBanner({ key: 'droneShatter' }, 1.25);
          } else if (this.invulnerableTimer <= 0) {
            trap.destroyed = true;
            this.invulnerableTimer = 1.1;
            this.playerVy = -380;
            this.audio.sfx.playMiss();
            this.triggerScreenShake(0.24, 7.5);
            this.emitJudgment('MISS', playerScreenX, droneY);
            this.setBanner({ key: 'trapHit' }, 1.2);
            this.vfx.spawnBurst(playerScreenX, droneY, [255, 50, 95], 16);
          }
        }
        continue;
      }

      const trapFloorY = trap.screenFloorY ?? floorY;
      const dx = Math.abs(trap.worldX - playerWorldX);

      if (!trap.passed && trap.worldX < playerWorldX - trap.width) {
        trap.passed = true;
        this.emitJudgment('GREAT', playerScreenX, this.playerY - 12, undefined, 150);
      }

      if (dx < trap.width * 0.55 + this.playerRadius * 0.65) {
        const playerBottom = this.playerY + this.playerRadius;
        if (playerBottom > trapFloorY - trap.height + 6) {
          if (
            this.overdriveTimer > 0 ||
            this.airBoostTimer > 0 ||
            (this.dashTimer > 0 && this.activeForm === 'treble')
          ) {
            trap.destroyed = true;
            this.scoreJudge.recordTrapDestroyed();
            this.audio.sfx.playHazardShatter();
            this.triggerScreenShake(0.16, 5.5);
            this.vfx.spawnBurst(playerScreenX, trapFloorY - 20, [255, 230, 0], 14);
            this.emitJudgment('PERFECT', playerScreenX, trapFloorY - 20, 0, 300, 0);
          } else if (this.invulnerableTimer <= 0) {
            trap.destroyed = true;
            this.invulnerableTimer = 1.1;
            this.playerVy = -430;
            this.audio.sfx.playMiss();
            this.triggerScreenShake(0.25, 8.0);
            this.emitJudgment('MISS', playerScreenX, this.playerY);
            this.setBanner({ key: 'trapHit' }, 1.2);
            this.vfx.spawnBurst(playerScreenX, this.playerY, [255, 50, 95], 16);
          }
        }
      }
    }
  }

  private triggerBassShockwave(
    screenX: number,
    screenY: number,
    playerWorldX: number
  ): void {
    this.audio.sfx.playSlamImpact();
    this.triggerScreenShake(0.22, 7.0);
    this.vfx.spawnShockwave(screenX, screenY, 24, 360, FORM_CONFIG.bass.rgb, 1.0);
    this.vfx.spawnBurst(screenX, screenY, FORM_CONFIG.bass.rgb, 20);

    let shattered = 0;
    for (const trap of this.terrain.getTraps()) {
      if (
        !trap.destroyed &&
        trap.worldX >= playerWorldX - 80 &&
        trap.worldX <= playerWorldX + 420
      ) {
        trap.destroyed = true;
        shattered++;
      }
    }
    if (shattered > 0) {
      this.scoreJudge.recordTrapDestroyed(shattered);
      this.audio.sfx.playHazardShatter();
      this.emitJudgment('PERFECT', screenX, screenY, 0, 280 * shattered, 0);
    }
    this.setBanner(
      shattered > 0
        ? { key: 'shockwave', params: { count: shattered } }
        : { key: 'shockwaveNoHit' },
      1.3
    );
  }

  private beginScaleZoomIn(
    targetForm: ResonanceFormType,
    focalX: number,
    focalY: number
  ): void {
    this.phase = 'ZOOM_IN';
    this.divingTargetForm = targetForm;
    this.transitionTimer = 0;
    this.focalScreenX = focalX;
    this.focalScreenY = focalY;
    // Preserve player's hard-earned `resonanceGauge`! Track MICRO tunnel progress independently.
    this.microSyncProgress = 18;
    this.hudDirty = true;

    this.audio.setAcousticZoom(targetForm);
    this.setBanner({ key: 'zoomIn', params: { form: targetForm } }, 1.5);
  }

  private updateZoomInTransition(dt: number, playerScreenX: number): void {
    const duration = 0.65;
    this.transitionTimer += dt;
    const progress = Math.min(1.0, this.transitionTimer / duration);

    this.zoomScale = Math.pow(ZOOM_THRESHOLD, progress);
    this.rebasedZoomDisplay = this.zoomScale;
    this.focalScreenX = playerScreenX;
    this.focalScreenY = this.playerY;

    if (this.zoomScale >= ZOOM_THRESHOLD) {
      this.zoomScale = 1.0;
      this.rebasedZoomDisplay = 64.0;
      this.phase = 'MICRO';
      this.hudDirty = true;
      this.microPolarity = -1;
      this.playerY = this.height * 0.34;
      this.playerRotation = 0;

      const playerWorldX = this.cameraX + playerScreenX;
      this.microGates = [];
      this.nextMicroGateX = playerWorldX + 380;
      for (let i = 0; i < 7; i++) {
        this.microGates.push({
          id: this.nextMicroGateId++,
          worldX: this.nextMicroGateX,
          safePolarity: i % 2 === 0 ? -1 : 1,
          passed: false,
          hit: false,
        });
        this.nextMicroGateX += 270;
      }

      this.setBanner({ key: 'microEnter' }, 2.2);
    }
  }

  private updateMicroPhase(
    dt: number,
    playerScreenX: number,
    playerWorldX: number
  ): void {
    const targetLaneY =
      this.microPolarity === -1 ? this.height * 0.34 : this.height * 0.66;
    this.playerY += (targetLaneY - this.playerY) * Math.min(1, dt * 26);
    this.playerRotation = 0;

    this.microSyncProgress = Math.min(100, this.microSyncProgress + dt * 18);
    this.scoreJudge.addRawScore(dt * 110 * Math.min(250, this.scoreJudge.combo));

    for (const gate of this.microGates) {
      const dx = Math.abs(gate.worldX - playerWorldX);
      if (dx < 26 && !gate.passed && !gate.hit) {
        if (this.microPolarity === gate.safePolarity) {
          gate.passed = true;
          this.microSyncProgress = Math.min(100, this.microSyncProgress + 15);
          this.audio.sfx.playNoteHit(this.divingTargetForm, 'PERFECT', true);
          this.emitJudgment('PERFECT', playerScreenX, this.playerY, 0, 260, 0, true);
        } else {
          gate.hit = true;
          this.microSyncProgress = Math.max(10, this.microSyncProgress - 8);
          this.audio.sfx.playMiss();
          this.triggerScreenShake(0.2, 6.0);
          this.emitJudgment('MISS', playerScreenX, this.playerY, undefined, 0, undefined, true);
          this.vfx.spawnBurst(playerScreenX, this.playerY, [255, 50, 95], 12);
        }
      }
    }

    const lastGate = this.microGates[this.microGates.length - 1];
    if (
      this.microSyncProgress >= 100 ||
      (lastGate && playerWorldX > lastGate.worldX + 180)
    ) {
      this.microSyncProgress = 100;
      this.addResonanceGauge(25);
      this.playerController.swapForm(this.divingTargetForm);
      this.activeForm = this.playerController.form;
      this.surfMomentum = Math.min(1.0, this.surfMomentum + 0.35);
      this.scoreJudge.recordDiveCompleted();
      this.phase = 'ZOOM_OUT';
      this.hudDirty = true;
      this.transitionTimer = 0;
      this.zoomScale = 8.0;
      this.audio.setAcousticZoom('macro');
      this.vfx.spawnBurst(
        playerScreenX,
        this.playerY,
        FORM_CONFIG[this.activeForm].rgb,
        32
      );
      this.setBanner({ key: 'resonanceSwap', params: { form: this.activeForm } }, 2.4);
    }
  }

  private updateZoomOutTransition(
    dt: number,
    playerScreenX: number,
    playerWorldX: number
  ): void {
    const duration = 0.45;
    this.transitionTimer += dt;
    const progress = Math.min(1.0, this.transitionTimer / duration);

    this.zoomScale = 8.0 - 7.0 * progress;
    this.rebasedZoomDisplay = 64.0 * (1 - progress) + 1.0 * progress;
    this.focalScreenX = playerScreenX;

    const { floorY } = this.terrain.sampleFloor(playerWorldX);
    this.playerY = floorY - this.playerRadius - 40 * (1 - progress);
    this.focalScreenY = this.playerY;

    if (progress >= 1.0) {
      this.zoomScale = 1.0;
      this.rebasedZoomDisplay = 1.0;
      this.phase = 'MACRO';
      this.hudDirty = true;
      this.isGrounded = true;
      this.jumpsRemaining = this.activeForm === 'synth' ? 2 : 1;
    }
  }

  private setBanner(message: BannerMessage, durationSec: number): void {
    this.statusBanner = message;
    this.statusBannerTimer = durationSec;
    this.hudDirty = true;
  }
}
