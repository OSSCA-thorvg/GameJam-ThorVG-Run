import { AudioEngine } from '../audio/AudioEngine';
import { ThorVGRenderer } from '../renderer/ThorVGRenderer';
import {
  FORM_CONFIG,
  type AfterimageTrail,
  type GamePhase,
  type HUDTelemetry,
  type MicroGate,
  type RendererMode,
  type ResonanceFormType,
  type ShockwaveEffect,
  type TrackMetadata,
  type VectorParticle,
} from '../types/game';
import { BezierTerrain } from './BezierTerrain';
import { PlayerController } from './PlayerController';

const PLAYER_SCREEN_X_RATIO = 0.24;
const ZOOM_THRESHOLD = 50.0;

/**
 * Core 60fps Game Engine managing Macro View, Infinite Scale Diving (with Origin Rebasing),
 * Acoustic Zoom synchronization, and Micro View Phase Invert gameplay.
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
  private zoomScale: number = 1.0;          // Matrix scale (resets to 1.0 on Origin Rebasing)
  private rebasedZoomDisplay: number = 1.0; // Effective magnification shown on HUD (1.0x ~ 64.0x)
  private transitionTimer: number = 0;
  private focalScreenX: number = 640;
  private focalScreenY: number = 360;

  // World & Player State
  private cameraX: number = 0;
  private baseSpeed: number = 430;
  private playerY: number = 360;
  private playerVy: number = 0;
  private playerRotation: number = 0;
  private playerRadius: number = 22;
  private isGrounded: boolean = false;
  private jumpsRemaining: number = 1;
  private dashTimer: number = 0;
  private dashCooldown: number = 0;
  private isGrinding: boolean = false;
  private slamActive: boolean = false;
  private invulnerableTimer: number = 0;

  // Resonance Swap & Micro View State
  private activeForm: ResonanceFormType = 'synth';
  private divingTargetForm: ResonanceFormType = 'bass';
  private resonanceGauge: number = 35; // 0 ~ 100
  private microPolarity: 1 | -1 = -1;  // -1 = top lane, +1 = bottom lane
  private microGates: MicroGate[] = [];
  private nextMicroGateX: number = 0;
  private nextMicroGateId: number = 1;

  // Score & Visual Effects
  private score: number = 0;
  private combo: number = 1;
  private maxCombo: number = 1;
  private trapsDestroyed: number = 0;
  private divesCompleted: number = 0;
  private statusBanner: string | null = null;
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

  public resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.renderer?.resize(width, height);
  }

  public async startRun(track: TrackMetadata): Promise<void> {
    await this.audio.loadTrack(track);
    this.resetState();
    await this.audio.startPlayback();

    this.running = true;
    this.lastFrameTime = performance.now();
    cancelAnimationFrame(this.rafId);
    this.rafId = requestAnimationFrame(this.loop);
  }

  public stopRun(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    this.audio.stop();
  }

  private resetState(): void {
    this.elapsedSec = 0;
    this.phase = 'MACRO';
    this.zoomScale = 1.0;
    this.rebasedZoomDisplay = 1.0;
    this.transitionTimer = 0;
    this.cameraX = 0;
    this.baseSpeed = 430;

    this.terrain.reset(this.width, this.height);
    const startWorldX = this.width * PLAYER_SCREEN_X_RATIO;
    const { floorY } = this.terrain.sampleFloor(startWorldX);
    this.playerY = floorY - this.playerRadius;
    this.playerVy = 0;
    this.playerRotation = 0;
    this.isGrounded = true;
    this.jumpsRemaining = 2;
    this.dashTimer = 0;
    this.dashCooldown = 0;
    this.isGrinding = false;
    this.slamActive = false;
    this.invulnerableTimer = 0;

    this.playerController.reset('synth');
    this.activeForm = this.playerController.form;
    this.divingTargetForm = 'bass';
    this.resonanceGauge = 40;
    this.microPolarity = -1;
    this.microGates = [];

    this.score = 0;
    this.combo = 1;
    this.maxCombo = 1;
    this.trapsDestroyed = 0;
    this.divesCompleted = 0;
    this.shockwaves = [];
    this.afterimages = [];
    this.particles = [];
    this.setBanner('SYNTH FORM READY — JUMP [SPACE] / DASH [SHIFT]', 2.4);
  }

  /**
   * Primary Action Input (Space / Left Click / W / ArrowUp):
   * - In MACRO View: Jump (or Double Jump in Synth Form)
   * - In MICRO View: Phase Invert (+A <-> -A immediate control-point snap)
   */
  public handlePrimaryAction(): void {
    if (!this.running) return;

    if (this.phase === 'MICRO') {
      this.microPolarity = this.microPolarity === -1 ? 1 : -1;
      const targetLaneY =
        this.microPolarity === -1 ? this.height * 0.34 : this.height * 0.66;
      this.playerY = targetLaneY;
      this.spawnBurst(
        this.width * PLAYER_SCREEN_X_RATIO,
        this.playerY,
        FORM_CONFIG[this.divingTargetForm].rgb,
        10
      );
      this.score += 25 * this.combo;
      return;
    }

    if (this.phase !== 'MACRO') return;

    const profile = this.playerController.profile;
    if (this.isGrounded || this.jumpsRemaining > 0) {
      const isSecondJump = !this.isGrounded;
      this.playerVy = isSecondJump ? profile.secondJumpVelocity : profile.jumpVelocity;
      this.isGrounded = false;
      this.jumpsRemaining = Math.max(
        0,
        (isSecondJump ? this.jumpsRemaining : profile.maxJumps) - 1
      );
      this.spawnBurst(
        this.width * PLAYER_SCREEN_X_RATIO,
        this.playerY + this.playerRadius,
        FORM_CONFIG[this.activeForm].rgb,
        8
      );
    }
  }

  /**
   * Allows manual or tactical Resonance Swap (1/2/3 or Q key) in addition to Micro View absorption.
   */
  public handleFormSwap(targetForm?: ResonanceFormType): void {
    if (!this.running) return;
    const nextForm = targetForm ?? this.playerController.cycleForm();
    this.playerController.swapForm(nextForm);
    this.activeForm = nextForm;
    this.jumpsRemaining = this.playerController.profile.maxJumps;
    const playerScreenX = this.width * PLAYER_SCREEN_X_RATIO;
    this.spawnBurst(playerScreenX, this.playerY, FORM_CONFIG[nextForm].rgb, 18);
    this.setBanner(
      `🔄 RESONANCE SWAP: ${FORM_CONFIG[nextForm].name} (${FORM_CONFIG[nextForm].skillName})`,
      1.6
    );
  }

  /**
   * Secondary Action Input (Shift / Right Click / S / ArrowDown):
   * - Bass Form: Airborne Slam or Ground Shockwave that destroys forward Beat Traps
   * - Synth Form: High-Speed Air Dash & Slope Boost
   * - Treble Form: Zero-Gravity Blink Dash piercing through obstacles invulnerably
   */
  public handleSecondaryAction(): void {
    if (!this.running) return;

    if (this.phase === 'MICRO') {
      this.handlePrimaryAction();
      return;
    }

    if (this.phase !== 'MACRO' || this.dashCooldown > 0) return;

    const profile = this.playerController.profile;
    const playerScreenX = this.width * PLAYER_SCREEN_X_RATIO;
    const playerWorldX = this.cameraX + playerScreenX;

    if (this.activeForm === 'bass') {
      if (!this.isGrounded) {
        // Bass Form Airborne: High-velocity slam into Landing Shockwave
        this.playerVy = 1200;
        this.slamActive = true;
        this.dashCooldown = profile.dashCooldownSec;
      } else {
        // Bass Form Grounded: Immediate Shockwave pulse
        this.dashCooldown = profile.dashCooldownSec;
        this.triggerBassShockwave(playerScreenX, this.playerY, playerWorldX);
      }
      return;
    }

    this.dashTimer = profile.dashDurationSec;
    this.dashCooldown = profile.dashCooldownSec;
    this.playerVy = 0;

    if (profile.piercesTrapsDuringDash) {
      // Treble Form: Blink Dash grants temporary invulnerability to pierce Beat Traps
      this.invulnerableTimer = Math.max(this.invulnerableTimer, profile.dashDurationSec + 0.08);
      this.setBanner('⚡ TREBLE BLINK DASH — PIERCE ACTIVE', 0.9);
    }
  }

  private loop = (now: number): void => {
    if (!this.running) return;

    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastFrameTime) / 1000));
    this.lastFrameTime = now;
    this.elapsedSec += dt;

    // Measure live FPS
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
    const playerScreenX = this.width * PLAYER_SCREEN_X_RATIO;

    if (this.statusBannerTimer > 0) {
      this.statusBannerTimer = Math.max(0, this.statusBannerTimer - dt);
      if (this.statusBannerTimer === 0) this.statusBanner = null;
    }
    if (this.dashCooldown > 0) this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    if (this.invulnerableTimer > 0)
      this.invulnerableTimer = Math.max(0, this.invulnerableTimer - dt);

    // Advance camera speed according to form, dash, and slope grind
    let speedMultiplier = 1.0 + freq.overall * 0.22;
    if (this.dashTimer > 0) {
      this.dashTimer = Math.max(0, this.dashTimer - dt);
      speedMultiplier = this.activeForm === 'treble' ? 2.45 : 1.75;
    } else if (this.isGrinding && this.activeForm === 'synth') {
      speedMultiplier += 0.38;
    }

    const stepX = this.baseSpeed * speedMultiplier * dt;
    this.cameraX += stepX;
    const playerWorldX = this.cameraX + playerScreenX;

    this.terrain.update(this.cameraX, this.width, this.height, this.elapsedSec, freq);

    // Phase State Machine
    if (this.phase === 'MACRO') {
      this.updateMacroPhase(dt, playerScreenX, playerWorldX);
    } else if (this.phase === 'ZOOM_IN') {
      this.updateZoomInTransition(dt, playerScreenX);
    } else if (this.phase === 'MICRO') {
      this.updateMicroPhase(dt, playerScreenX, playerWorldX);
    } else if (this.phase === 'ZOOM_OUT') {
      this.updateZoomOutTransition(dt, playerScreenX, playerWorldX);
    }

    this.updateVisualEffects(dt, stepX);

    // Render frame via ThorVG WASM
    this.renderer?.renderGameFrame({
      width: this.width,
      height: this.height,
      timeSec: this.elapsedSec,
      phase: this.phase,
      zoomScale: this.zoomScale,
      rebasedZoomDisplay: this.rebasedZoomDisplay,
      cameraX: this.cameraX,
      focalScreenX: this.focalScreenX,
      focalScreenY: this.focalScreenY,
      activeForm: this.activeForm,
      divingTargetForm: this.divingTargetForm,
      resonanceGauge: this.resonanceGauge,
      frequency: freq,
      segments: this.terrain.getSegments(),
      traps: this.terrain.getTraps(),
      divingNodes: this.terrain.getDivingNodes(),
      microGates: this.microGates,
      microPolarity: this.microPolarity,
      playerScreenX,
      playerScreenY: this.playerY,
      playerRotation: this.playerRotation,
      playerRadius: this.playerRadius,
      isDashing: this.dashTimer > 0,
      isGrinding: this.isGrinding,
      invulnerableTimer: this.invulnerableTimer,
      shockwaves: this.shockwaves,
      afterimages: this.afterimages,
      particles: this.particles,
    });

    const progress = this.audio.getProgress();
    const isFinished = progress >= 0.995 || (!this.audio.playing && this.elapsedSec > 2.0);
    if (isFinished) {
      this.running = false;
    }

    this.onHudUpdate({
      rendererMode: this.rendererMode,
      fps: this.currentFps,
      phase: this.phase,
      zoomDisplay: Number(this.rebasedZoomDisplay.toFixed(1)),
      score: Math.floor(this.score),
      combo: this.combo,
      maxCombo: this.maxCombo,
      progress,
      activeForm: this.activeForm,
      resonanceGauge: Math.min(100, Math.max(0, Math.round(this.resonanceGauge))),
      acousticFilterLabel: this.audio.getAcousticFilterLabel(),
      statusBanner: this.statusBanner,
      isFinished,
      trapsDestroyed: this.trapsDestroyed,
      divesCompleted: this.divesCompleted,
    });
  }

  private updateMacroPhase(
    dt: number,
    playerScreenX: number,
    playerWorldX: number
  ): void {
    const { floorY, slope, angleRad } = this.terrain.sampleFloor(playerWorldX);
    const targetGroundY = floorY - this.playerRadius;

    if (this.dashTimer > 0 && this.activeForm === 'treble') {
      // Treble Blink Dash ignores gravity and leaves sharp vector afterimages
      this.playerVy = 0;
      this.afterimages.push({
        x: playerScreenX,
        y: this.playerY,
        rotation: 0,
        form: this.activeForm,
        alpha: 0.85,
      });
    } else {
      const gravity = 1950;
      this.playerVy += gravity * dt;
      this.playerY += this.playerVy * dt;
    }

    // Formula-based Bezier Floor Landing Check: y >= y_floor
    if (this.playerY >= targetGroundY) {
      const wasAirborne = !this.isGrounded;
      this.playerY = targetGroundY;
      this.playerVy = 0;
      this.isGrounded = true;
      this.jumpsRemaining = this.activeForm === 'synth' ? 2 : 1;
      this.playerRotation = angleRad;

      // Synth Form Slope Grind check
      this.isGrinding = this.activeForm === 'synth' && slope > 0.08;
      if (this.isGrinding) {
        this.score += 140 * dt * this.combo;
      }

      // Bass Form Landing Shockwave check
      if (wasAirborne && this.activeForm === 'bass' && this.slamActive) {
        this.slamActive = false;
        this.triggerBassShockwave(playerScreenX, this.playerY, playerWorldX);
      }
    } else {
      this.isGrounded = false;
      this.isGrinding = false;
      this.playerRotation += dt * (this.dashTimer > 0 ? 12 : 5.5);
    }

    // Score accumulation
    this.score += dt * 60 * this.combo;

    // Check Frequency Diving Node Collision -> Trigger Infinite Scale Transition
    for (const node of this.terrain.getDivingNodes()) {
      if (node.activated) continue;
      const dx = node.worldX - playerWorldX;
      const dy = node.worldY - this.playerY;
      const dist = Math.hypot(dx, dy);
      if (dist <= node.radius + this.playerRadius + 14) {
        node.activated = true;
        this.beginScaleZoomIn(node.targetForm, playerScreenX, node.worldY);
        return;
      }
    }

    // Check Beat Trap Collision
    for (const trap of this.terrain.getTraps()) {
      if (trap.destroyed) continue;
      const trapFloorY = trap.screenFloorY ?? floorY;
      const dx = Math.abs(trap.worldX - playerWorldX);

      if (!trap.passed && trap.worldX < playerWorldX - trap.width) {
        trap.passed = true;
        this.combo = Math.min(16, this.combo + 1);
        this.maxCombo = Math.max(this.maxCombo, this.combo);
        this.score += 120 * this.combo;
      }

      if (dx < trap.width * 0.55 + this.playerRadius * 0.65) {
        const playerBottom = this.playerY + this.playerRadius;
        if (playerBottom > trapFloorY - trap.height + 6) {
          if (this.dashTimer > 0 && this.activeForm === 'treble') {
            // Treble Blink Dash pierces and shatters Beat Traps
            trap.destroyed = true;
            this.trapsDestroyed++;
            this.score += 250 * this.combo;
            this.spawnBurst(playerScreenX, trapFloorY - 20, [255, 230, 0], 14);
          } else if (this.invulnerableTimer <= 0) {
            // Hit penalty (non-fatal rhythm break so player can finish track)
            trap.destroyed = true;
            this.combo = 1;
            this.invulnerableTimer = 1.1;
            this.playerVy = -420;
            this.setBanner('⚠️ BEAT TRAP IMPACT — COMBO RESET', 1.2);
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
      maxRadius: 340,
      color: FORM_CONFIG.bass.rgb,
      alpha: 1.0,
    });
    this.spawnBurst(screenX, screenY, FORM_CONFIG.bass.rgb, 20);

    let shattered = 0;
    for (const trap of this.terrain.getTraps()) {
      if (
        !trap.destroyed &&
        trap.worldX >= playerWorldX - 80 &&
        trap.worldX <= playerWorldX + 380
      ) {
        trap.destroyed = true;
        shattered++;
        this.trapsDestroyed++;
      }
    }
    this.combo = Math.min(16, this.combo + Math.max(1, shattered));
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.score += (300 + shattered * 250) * this.combo;
    this.setBanner(
      `💥 BASS SHOCKWAVE! ${shattered > 0 ? `${shattered} TRAPS SHATTERED` : 'IMPACT'}`,
      1.3
    );
  }

  /**
   * Initiates Scale Transition (1.0x -> 50.0x) and engages BiquadFilterNode Acoustic Zoom.
   */
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

    // Activate Web Audio BiquadFilterNode Acoustic Zoom for the selected frequency layer
    this.audio.setAcousticZoom(targetForm);
    this.setBanner(
      `🔍 ACOUSTIC ZOOM IN: ${FORM_CONFIG[targetForm].bandLabel}`,
      1.5
    );
  }

  private updateZoomInTransition(dt: number, playerScreenX: number): void {
    const duration = 0.65;
    this.transitionTimer += dt;
    const progress = Math.min(1.0, this.transitionTimer / duration);

    // Exponential zoom scale from 1.0x up to ZOOM_THRESHOLD (50.0x)
    this.zoomScale = Math.pow(ZOOM_THRESHOLD, progress);
    this.rebasedZoomDisplay = this.zoomScale;
    this.focalScreenX = playerScreenX;
    this.focalScreenY = this.playerY;

    if (this.zoomScale >= ZOOM_THRESHOLD) {
      // ORIGIN REBASING: Reset internal rendering coordinate scale to 1.0x
      // to eliminate floating-point jitter while transitioning into Micro View!
      this.zoomScale = 1.0;
      this.rebasedZoomDisplay = 64.0;
      this.phase = 'MICRO';
      this.microPolarity = -1;
      this.playerY = this.height * 0.34;
      this.playerRotation = 0;

      // Spawn Micro View Phase Gates ahead
      this.microGates = [];
      this.nextMicroGateX = this.cameraX + 460;
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

      this.setBanner(
        `⚡ MICRO VIEW [64.0x REBASED] — PRESS [SPACE] TO PHASE INVERT (+A ↔ -A)`,
        2.2
      );
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

    // Charge Resonance Gauge over time & via gate passes
    this.resonanceGauge = Math.min(100, this.resonanceGauge + dt * 16);
    this.score += dt * 110 * this.combo;

    for (const gate of this.microGates) {
      const dx = Math.abs(gate.worldX - playerWorldX);
      if (dx < 26 && !gate.passed && !gate.hit) {
        if (this.microPolarity === gate.safePolarity) {
          gate.passed = true;
          this.resonanceGauge = Math.min(100, this.resonanceGauge + 14);
          this.combo = Math.min(16, this.combo + 1);
          this.maxCombo = Math.max(this.maxCombo, this.combo);
          this.score += 320 * this.combo;
          this.spawnBurst(
            playerScreenX,
            this.playerY,
            FORM_CONFIG[this.divingTargetForm].rgb,
            12
          );
        } else {
          gate.hit = true;
          this.combo = 1;
          this.resonanceGauge = Math.max(10, this.resonanceGauge - 8);
          this.spawnBurst(playerScreenX, this.playerY, [255, 50, 95], 12);
        }
      }
    }

    // Complete Micro View when Resonance Gauge reaches 100% or all gates cleared
    const lastGate = this.microGates[this.microGates.length - 1];
    if (
      this.resonanceGauge >= 100 ||
      (lastGate && playerWorldX > lastGate.worldX + 180)
    ) {
      this.resonanceGauge = 100;
      this.playerController.swapForm(this.divingTargetForm);
      this.activeForm = this.playerController.form;
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
      this.setBanner(
        `🔥 RESONANCE SWAP: ${FORM_CONFIG[this.activeForm].name} ACTIVATED!`,
        2.4
      );
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

  private setBanner(text: string, durationSec: number): void {
    this.statusBanner = text;
    this.statusBannerTimer = durationSec;
  }
}
