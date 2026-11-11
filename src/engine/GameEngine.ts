import { AudioEngine } from '../audio/AudioEngine';
import { analyzeTrackBlueprint, WORLD_PX_PER_SEC } from '../audio/TrackAnalyzer';
import { ThorVGRenderer } from '../renderer/ThorVGRenderer';
import {
  DIFFICULTY_CONFIG,
  FORM_CONFIG,
  type AfterimageTrail,
  type BannerMessage,
  type DifficultyMode,
  type GamePhase,
  type HUDTelemetry,
  type JudgmentCounts,
  type JudgmentFeedback,
  type JudgmentGrade,
  type LoadingProgress,
  type MicroGate,
  type RendererMode,
  type ResonanceFormType,
  type ResultRank,
  type SectionIntensity,
  type ShockwaveEffect,
  type TrackBlueprint,
  type TrackMetadata,
  type VectorParticle,
} from '../types/game';
import { BezierTerrain } from './BezierTerrain';
import { PlayerController } from './PlayerController';

export const PLAYER_HIT_X_RATIO = 0.24;
const ZOOM_THRESHOLD = 50.0;

/**
 * Core 60fps Hybrid Rhythm-Runner Engine:
 * - Zero-offset 1:1 Audio-to-Player synchronization (`playerWorldX = audioSec * baseSpeed`)
 * - Multi-tier Sprint Decks, Abyss Chasm Gaps & One-Way 2F Sky Platforms
 * - 3 Track Gimmicks: Beat Jump Pads, Airborne Dash Rings & Hold Note Rails
 * - Real-time Timing Judgments (`PERFECT / GREAT / GOOD / MISS`) & Beat Camera Punch
 */
export class GameEngine {
  private audio: AudioEngine;
  private terrain: BezierTerrain;
  private playerController: PlayerController;
  private renderer: ThorVGRenderer | null = null;
  private onHudUpdate: (hud: HUDTelemetry) => void;

  private width: number = 1280;
  private height: number = 720;
  private rendererMode: RendererMode = 'sw';
  private difficulty: DifficultyMode = 'normal';

  private activeBlueprint: TrackBlueprint | null = null;

  // Loop & Timing
  private rafId: number = 0;
  private running: boolean = false;
  private lastFrameTime: number = 0;
  private elapsedSec: number = 0;
  private fpsFrames: number = 0;
  private fpsAccum: number = 0;
  private currentFps: number = 60;

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
  private playerRadius: number = 22;
  private isGrounded: boolean = false;
  private jumpsRemaining: number = 2;
  private dashTimer: number = 0;
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

  // Resonance Swap & Micro View State
  private activeForm: ResonanceFormType = 'synth';
  private divingTargetForm: ResonanceFormType = 'bass';
  private resonanceGauge: number = 35;
  private microPolarity: 1 | -1 = -1;
  private microGates: MicroGate[] = [];
  private nextMicroGateX: number = 0;
  private nextMicroGateId: number = 1;

  // Score, Rhythm Judgments & Visual Effects
  private score: number = 0;
  private combo: number = 1;
  private maxCombo: number = 1;
  private orbsCollected: number = 0;
  private trapsDestroyed: number = 0;
  private divesCompleted: number = 0;
  private gimmicksTriggered: number = 0;
  private judgmentCounts: JudgmentCounts = { perfect: 0, great: 0, good: 0, miss: 0 };
  private activeJudgment: JudgmentFeedback | null = null;
  private judgmentTimer: number = 0;
  private nextJudgmentId: number = 1;
  private statusBanner: BannerMessage | null = null;
  private statusBannerTimer: number = 0;

  private shockwaves: ShockwaveEffect[] = [];
  private afterimages: AfterimageTrail[] = [];
  private particles: VectorParticle[] = [];

  constructor(audio: AudioEngine, onHudUpdate: (hud: HUDTelemetry) => void) {
    this.audio = audio;
    this.terrain = new BezierTerrain();
    this.playerController = new PlayerController();
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
  }

  public setDifficulty(difficulty: DifficultyMode): void {
    this.difficulty = difficulty;
  }

  public getDifficulty(): DifficultyMode {
    return this.difficulty;
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
      await this.audio.loadTrack(track);
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
    return this.width * PLAYER_HIT_X_RATIO;
  }

  private resetState(): void {
    this.elapsedSec = 0;
    this.phase = 'MACRO';
    this.zoomScale = 1.0;
    this.rebasedZoomDisplay = 1.0;
    this.transitionTimer = 0;
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

    this.playerController.reset('synth');
    this.activeForm = this.playerController.form;
    this.divingTargetForm = 'bass';
    this.resonanceGauge = 40;
    this.microPolarity = -1;
    this.microGates = [];

    this.score = 0;
    this.combo = 1;
    this.maxCombo = 1;
    this.orbsCollected = 0;
    this.trapsDestroyed = 0;
    this.divesCompleted = 0;
    this.gimmicksTriggered = 0;
    this.judgmentCounts = { perfect: 0, great: 0, good: 0, miss: 0 };
    this.activeJudgment = null;
    this.judgmentTimer = 0;
    this.shockwaves = [];
    this.afterimages = [];
    this.particles = [];
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

  /**
   * Evaluates a timing offset (ms) against the current difficulty's judgment windows.
   */
  private classifyDeltaMs(deltaMs: number): JudgmentGrade {
    const cfg = DIFFICULTY_CONFIG[this.difficulty];
    if (deltaMs <= cfg.perfectMs) return 'PERFECT';
    if (deltaMs <= cfg.greatMs) return 'GREAT';
    return 'GOOD';
  }

  private emitJudgment(
    grade: JudgmentGrade,
    screenX: number,
    screenY: number,
    deltaMs?: number,
    basePoints: number = 220
  ): void {
    if (grade === 'PERFECT') {
      this.judgmentCounts.perfect++;
      this.combo = Math.min(99, this.combo + 2);
      this.beatPulse = 1.0;
      this.surfMomentum = Math.min(1.0, this.surfMomentum + 0.1);
      this.resonanceGauge = Math.min(100, this.resonanceGauge + 4);
      const pts = Math.round(basePoints * 1.5 * Math.max(1, this.combo * 0.25));
      this.score += pts;
      this.activeJudgment = { id: this.nextJudgmentId++, grade, deltaMs, bonusScore: pts };
      this.judgmentTimer = 0.72;
      this.shockwaves.push({
        x: screenX,
        y: screenY,
        radius: 14,
        maxRadius: 92,
        color: [255, 230, 0],
        alpha: 0.95,
      });
      this.spawnBurst(screenX, screenY, [255, 230, 0], 12);
    } else if (grade === 'GREAT') {
      this.judgmentCounts.great++;
      this.combo = Math.min(99, this.combo + 1);
      this.beatPulse = Math.max(this.beatPulse, 0.55);
      this.surfMomentum = Math.min(1.0, this.surfMomentum + 0.06);
      this.resonanceGauge = Math.min(100, this.resonanceGauge + 2.5);
      const pts = Math.round(basePoints * 1.15 * Math.max(1, this.combo * 0.22));
      this.score += pts;
      this.activeJudgment = { id: this.nextJudgmentId++, grade, deltaMs, bonusScore: pts };
      this.judgmentTimer = 0.65;
      this.spawnBurst(screenX, screenY, [5, 213, 255], 8);
    } else if (grade === 'GOOD') {
      this.judgmentCounts.good++;
      this.combo = Math.min(99, this.combo + 1);
      const pts = Math.round(basePoints * 0.8 * Math.max(1, this.combo * 0.18));
      this.score += pts;
      this.activeJudgment = { id: this.nextJudgmentId++, grade, deltaMs, bonusScore: pts };
      this.judgmentTimer = 0.55;
    } else {
      this.judgmentCounts.miss++;
      this.combo = 1;
      this.surfMomentum = Math.max(0.15, this.surfMomentum * 0.5);
      this.activeJudgment = { id: this.nextJudgmentId++, grade: 'MISS', bonusScore: 0 };
      this.judgmentTimer = 0.85;
    }
    this.maxCombo = Math.max(this.maxCombo, this.combo);
  }

  /**
   * When the player actively presses Jump or Skill/Dash, snaps nearby beat targets
   * within the timing window so deliberate rhythm tapping feels razor-sharp!
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

    // 2. Check closest uncollected Beat Note within judgment window
    let bestOrb = null;
    let bestDx = Infinity;
    for (const orb of this.terrain.getOrbs()) {
      if (orb.collected) continue;
      const dx = Math.abs(orb.worldX - playerWorldX);
      const oy = orb.screenY ?? orb.worldY;
      const dy = Math.abs(oy - this.playerY);
      if (dx <= windowPx && dy <= 115 && dx < bestDx) {
        bestDx = dx;
        bestOrb = orb;
      }
    }

    if (bestOrb) {
      bestOrb.collected = true;
      this.orbsCollected++;
      const targetSec = bestOrb.timeSec ?? bestOrb.worldX / this.baseSpeed;
      const deltaMs = Math.round(Math.abs(audioSec - targetSec) * 1000);
      const grade = this.classifyDeltaMs(deltaMs);
      const oy = bestOrb.screenY ?? bestOrb.worldY;
      this.emitJudgment(grade, playerScreenX, oy, deltaMs, bestOrb.isBeatTarget ? 260 : 180);
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
      this.spawnBurst(
        playerScreenX,
        this.playerY,
        FORM_CONFIG[this.divingTargetForm].rgb,
        10
      );
      this.score += 35 * this.combo;
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
      this.spawnBurst(
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
    this.jumpsRemaining = this.playerController.profile.maxJumps;
    const playerScreenX = this.getPlayerScreenX();
    this.spawnBurst(playerScreenX, this.playerY, FORM_CONFIG[nextForm].rgb, 18);
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
    this.gimmicksTriggered++;
    const ry = ring.screenY ?? ring.worldY;
    this.playerY = ry;
    this.playerVy = 0;
    this.isGrounded = false;
    this.airBoostTimer = 0.3;
    this.invulnerableTimer = Math.max(this.invulnerableTimer, 0.36);
    this.jumpsRemaining = this.activeForm === 'synth' ? 2 : 1;
    this.surfMomentum = Math.min(1.0, this.surfMomentum + 0.3);

    const deltaMs = Math.round(Math.abs(audioSec - ring.timeSec) * 1000);
    const inputRecent = Math.abs(audioSec - this.lastActionAudioSec) <= 0.16;
    const grade: JudgmentGrade = inputRecent ? this.classifyDeltaMs(deltaMs) : 'GREAT';
    this.emitJudgment(grade, playerScreenX, ry, deltaMs, 320);
    this.setBanner({ key: 'wavePump' }, 1.1);
  }

  private computeAccuracyAndRank(): { accuracy: number; rank: ResultRank } {
    const { perfect, great, good, miss } = this.judgmentCounts;
    const total = perfect + great + good + miss;
    if (total === 0) {
      return { accuracy: 100, rank: 'S' };
    }
    const weighted = perfect * 1.0 + great * 0.78 + good * 0.45;
    const accuracy = Number(Math.min(100, (weighted / total) * 100).toFixed(1));
    const rank: ResultRank =
      accuracy >= 92 ? 'S' : accuracy >= 82 ? 'A' : accuracy >= 70 ? 'B' : 'C';
    return { accuracy, rank };
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
      if (this.statusBannerTimer === 0) this.statusBanner = null;
    }
    if (this.judgmentTimer > 0) {
      this.judgmentTimer = Math.max(0, this.judgmentTimer - dt);
      if (this.judgmentTimer === 0) this.activeJudgment = null;
    }
    if (this.dashCooldown > 0) this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    if (this.invulnerableTimer > 0) {
      this.invulnerableTimer = Math.max(0, this.invulnerableTimer - dt);
    }
    if (this.beatPulse > 0) {
      this.beatPulse = Math.max(0, this.beatPulse - dt * 5.2);
    }
    if (freq.isBeat) {
      this.beatPulse = Math.max(this.beatPulse, 0.42);
    }

    let speedMultiplier = 1.0 + this.surfMomentum * 0.65 + freq.overall * 0.15;
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
    // Exact 0ms synchronization: playerWorldX = cameraX + playerScreenX === audioSec * baseSpeed!
    const targetCameraX = audioSec * this.baseSpeed - playerScreenX;
    const prevCameraX = this.cameraX;
    if (this.audio.playing) {
      const drift = targetCameraX - this.cameraX;
      if (Math.abs(drift) > this.baseSpeed * 0.6) {
        this.cameraX = targetCameraX;
      } else {
        this.cameraX += this.baseSpeed * dt + drift * Math.min(1, dt * 16);
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

    this.updateVisualEffects(dt, stepX);

    // Subtle Beat Camera Zoom Punch in MACRO phase (1.000x ~ 1.030x)
    const effectiveZoomScale =
      this.phase === 'MACRO' ? 1.0 + this.beatPulse * 0.028 : this.zoomScale;
    const effectiveFocalX = this.phase === 'MACRO' ? playerScreenX : this.focalScreenX;
    const effectiveFocalY = this.phase === 'MACRO' ? this.playerY : this.focalScreenY;

    this.renderer?.renderGameFrame({
      width: this.width,
      height: this.height,
      timeSec: this.elapsedSec,
      audioSec,
      worldPxPerSec: this.baseSpeed,
      beatPulse: this.beatPulse,
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
      isDashing: this.dashTimer > 0 || this.airBoostTimer > 0,
      isGrinding: this.isGrinding,
      isDiving: this.isDiveHeld,
      surfMomentum: this.surfMomentum,
      sectionIntensity: this.currentSectionIntensity,
      invulnerableTimer: this.invulnerableTimer,
      runCycleTime: this.runCycleTime,
      shockwaves: this.shockwaves,
      afterimages: this.afterimages,
      particles: this.particles,
    });

    const progress = this.audio.getProgress();
    const isFinished = progress >= 0.995 || (!this.audio.playing && this.elapsedSec > 2.0);
    if (isFinished) {
      this.running = false;
    }

    const { accuracy, rank } = this.computeAccuracyAndRank();

    this.onHudUpdate({
      rendererMode: this.rendererMode,
      difficulty: this.difficulty,
      fps: this.currentFps,
      phase: this.phase,
      zoomDisplay: Number(this.rebasedZoomDisplay.toFixed(1)),
      score: Math.floor(this.score),
      combo: this.combo,
      maxCombo: this.maxCombo,
      progress,
      activeForm: this.activeForm,
      resonanceGauge: Math.min(100, Math.max(0, Math.round(this.resonanceGauge))),
      acousticFilter: this.audio.getAcousticZoomMode(),
      statusBanner: this.statusBanner,
      isFinished,
      trapsDestroyed: this.trapsDestroyed,
      divesCompleted: this.divesCompleted + this.gimmicksTriggered,
      surfMomentum: Number(this.surfMomentum.toFixed(2)),
      speedMultiplier: Number(speedMultiplier.toFixed(1)),
      orbsCollected: this.orbsCollected,
      totalOrbs: this.terrain.getTotalOrbCount(),
      sectionIntensity: this.currentSectionIntensity,
      accuracy,
      rank,
      judgment: this.activeJudgment,
      judgmentCounts: { ...this.judgmentCounts },
      gimmicksTriggered: this.gimmicksTriggered,
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
    if (nextIntensity === 'drop' && this.currentSectionIntensity !== 'drop') {
      this.setBanner({ key: 'dropSection' }, 1.8);
      this.beatPulse = 1.0;
      this.spawnBurst(playerScreenX, this.playerY, FORM_CONFIG[this.activeForm].rgb, 20);
    }
    this.currentSectionIntensity = nextIntensity;

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
            this.combo = Math.min(99, this.combo + 1);
            this.maxCombo = Math.max(this.maxCombo, this.combo);
            this.score += 85 * this.combo;
            this.surfMomentum = Math.min(1.0, this.surfMomentum + 0.04);
            this.particles.push({
              x: playerScreenX - 10,
              y: railY + this.playerRadius * 0.65,
              vx: -150 - Math.random() * 120,
              vy: -30 - Math.random() * 80,
              radius: 4.2,
              color: FORM_CONFIG[rail.band].rgb,
              alpha: 1.0,
              life: 0,
              maxLife: 0.26,
            });
          }

          if (playerWorldX >= rail.x1 - 20) {
            rail.completed = true;
            this.gimmicksTriggered++;
            this.orbsCollected++;
            this.emitJudgment('PERFECT', playerScreenX, railY, 0, 320);
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
        this.afterimages.push({
          x: playerScreenX,
          y: this.playerY,
          rotation: 0,
          form: this.activeForm,
          alpha: 0.82,
        });
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
        this.jumpsRemaining = this.activeForm === 'synth' ? 2 : 1;
        this.playerRotation = 0;
        if (wasAir) {
          this.spawnBurst(playerScreenX, platY, FORM_CONFIG[skyPlat.band].secondaryRgb, 8);
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
            this.particles.push({
              x: playerScreenX - 10,
              y: floorY - 2,
              vx: -120 - Math.random() * 110,
              vy: -25 - Math.random() * 55,
              radius: 2.8,
              color: FORM_CONFIG[this.activeForm].secondaryRgb,
              alpha: 0.9,
              life: 0,
              maxLife: 0.22,
            });
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
          this.emitJudgment('MISS', playerScreenX, floorY);
          this.setBanner({ key: 'gapFall' }, 1.25);
          this.spawnBurst(playerScreenX, floorY, [255, 50, 95], 18);
        }
      }
    }

    // Gentle momentum baseline while sprinting cleanly
    this.surfMomentum = Math.max(0.22, Math.min(1.0, this.surfMomentum - 0.06 * dt + 0.04 * dt));

    if (this.surfMomentum > 0.72 && Math.floor(this.elapsedSec * 24) % 2 === 0) {
      this.afterimages.push({
        x: playerScreenX,
        y: this.playerY,
        rotation: this.playerRotation,
        form: this.activeForm,
        alpha: 0.42,
      });
    }

    // Continuous sprint distance score
    this.score += dt * 75 * speedMultiplier * Math.max(1, this.combo * 0.35);

    // 3. Check Beat Jump Pads (`JumpPad`)
    for (const pad of this.terrain.getJumpPads()) {
      if (pad.triggered) continue;
      const padY = pad.screenY ?? pad.worldY;
      const dx = Math.abs(pad.worldX - playerWorldX);
      const playerBottom = this.playerY + this.playerRadius;
      if (dx <= 34 && Math.abs(playerBottom - padY) <= 32) {
        pad.triggered = true;
        this.gimmicksTriggered++;
        this.playerVy = -855; // High super-bounce onto 2F Sky Platform or across wide chasm!
        this.isGrounded = false;
        this.jumpsRemaining = this.activeForm === 'synth' ? 2 : 1;
        const deltaMs = Math.round(Math.abs(audioSec - pad.timeSec) * 1000);
        const inputRecent = Math.abs(audioSec - this.lastActionAudioSec) <= 0.15;
        this.emitJudgment(
          inputRecent ? this.classifyDeltaMs(deltaMs) : 'PERFECT',
          playerScreenX,
          padY - 12,
          deltaMs,
          300
        );
        this.setBanner({ key: 'crestLaunch' }, 1.15);
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

    // 5. Collect Rhythm Beat Notes (`ResonanceOrb`) with Real-Time Timing Judgment
    for (const orb of this.terrain.getOrbs()) {
      if (orb.collected) continue;
      const orbY = orb.screenY ?? orb.worldY;
      const dx = orb.worldX - playerWorldX;
      const dy = orbY - this.playerY;
      const collectRadius =
        orb.radius + this.playerRadius + (this.dashTimer > 0 || this.airBoostTimer > 0 ? 22 : 14);
      if (dx * dx + dy * dy <= collectRadius * collectRadius) {
        orb.collected = true;
        this.orbsCollected++;
        const targetSec = orb.timeSec ?? orb.worldX / this.baseSpeed;
        const deltaMs = Math.round(Math.abs(audioSec - targetSec) * 1000);
        const grade = this.classifyDeltaMs(deltaMs);
        this.emitJudgment(grade, playerScreenX, orbY, deltaMs, orb.isBeatTarget ? 240 : 160);
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

    // 7. Check Beat Trap Collision
    for (const trap of this.terrain.getTraps()) {
      if (trap.destroyed) continue;
      const trapFloorY = trap.screenFloorY ?? floorY;
      const dx = Math.abs(trap.worldX - playerWorldX);

      if (!trap.passed && trap.worldX < playerWorldX - trap.width) {
        trap.passed = true;
        this.emitJudgment('GREAT', playerScreenX, this.playerY - 12, undefined, 150);
      }

      if (dx < trap.width * 0.55 + this.playerRadius * 0.65) {
        const playerBottom = this.playerY + this.playerRadius;
        if (playerBottom > trapFloorY - trap.height + 6) {
          if (this.airBoostTimer > 0 || (this.dashTimer > 0 && this.activeForm === 'treble')) {
            trap.destroyed = true;
            this.trapsDestroyed++;
            this.emitJudgment('PERFECT', playerScreenX, trapFloorY - 20, 0, 280);
          } else if (this.invulnerableTimer <= 0) {
            trap.destroyed = true;
            this.invulnerableTimer = 1.1;
            this.playerVy = -430;
            this.emitJudgment('MISS', playerScreenX, this.playerY);
            this.setBanner({ key: 'trapHit' }, 1.2);
            this.spawnBurst(playerScreenX, this.playerY, [255, 50, 95], 16);
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
    this.shockwaves.push({
      x: screenX,
      y: screenY,
      radius: 24,
      maxRadius: 360,
      color: FORM_CONFIG.bass.rgb,
      alpha: 1.0,
    });
    this.spawnBurst(screenX, screenY, FORM_CONFIG.bass.rgb, 20);

    let shattered = 0;
    for (const trap of this.terrain.getTraps()) {
      if (
        !trap.destroyed &&
        trap.worldX >= playerWorldX - 80 &&
        trap.worldX <= playerWorldX + 420
      ) {
        trap.destroyed = true;
        shattered++;
        this.trapsDestroyed++;
      }
    }
    if (shattered > 0) {
      this.emitJudgment('PERFECT', screenX, screenY, 0, 280 * shattered);
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
    this.resonanceGauge = 20;

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

    this.resonanceGauge = Math.min(100, this.resonanceGauge + dt * 16);
    this.score += dt * 110 * this.combo;

    for (const gate of this.microGates) {
      const dx = Math.abs(gate.worldX - playerWorldX);
      if (dx < 26 && !gate.passed && !gate.hit) {
        if (this.microPolarity === gate.safePolarity) {
          gate.passed = true;
          this.resonanceGauge = Math.min(100, this.resonanceGauge + 14);
          this.emitJudgment('PERFECT', playerScreenX, this.playerY, 0, 260);
        } else {
          gate.hit = true;
          this.resonanceGauge = Math.max(10, this.resonanceGauge - 8);
          this.emitJudgment('MISS', playerScreenX, this.playerY);
          this.spawnBurst(playerScreenX, this.playerY, [255, 50, 95], 12);
        }
      }
    }

    const lastGate = this.microGates[this.microGates.length - 1];
    if (
      this.resonanceGauge >= 100 ||
      (lastGate && playerWorldX > lastGate.worldX + 180)
    ) {
      this.resonanceGauge = 100;
      this.playerController.swapForm(this.divingTargetForm);
      this.activeForm = this.playerController.form;
      this.surfMomentum = Math.min(1.0, this.surfMomentum + 0.35);
      this.divesCompleted++;
      this.phase = 'ZOOM_OUT';
      this.transitionTimer = 0;
      this.zoomScale = 8.0;
      this.audio.setAcousticZoom('macro');
      this.spawnBurst(
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
      this.isGrounded = true;
      this.jumpsRemaining = this.activeForm === 'synth' ? 2 : 1;
    }
  }

  private updateVisualEffects(dt: number, stepX: number): void {
    for (const sw of this.shockwaves) {
      sw.radius += dt * 780;
      sw.alpha = Math.max(0, 1 - sw.radius / sw.maxRadius);
    }
    this.shockwaves = this.shockwaves.filter((sw) => sw.radius < sw.maxRadius);

    for (const ai of this.afterimages) {
      ai.x -= stepX * 0.65;
      ai.alpha -= dt * 3.2;
    }
    this.afterimages = this.afterimages.filter((ai) => ai.alpha > 0.05);

    for (const pt of this.particles) {
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.life += dt;
      pt.radius = Math.max(0.5, pt.radius * (1 - dt * 1.8));
    }
    this.particles = this.particles.filter((pt) => pt.life < pt.maxLife);
  }

  private spawnBurst(
    x: number,
    y: number,
    color: [number, number, number],
    count: number
  ): void {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.35;
      const speed = 90 + Math.random() * 260;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 3.5 + Math.random() * 4.5,
        color,
        alpha: 1.0,
        life: 0,
        maxLife: 0.38 + Math.random() * 0.25,
      });
    }
  }

  private setBanner(message: BannerMessage, durationSec: number): void {
    this.statusBanner = message;
    this.statusBannerTimer = durationSec;
  }
}
