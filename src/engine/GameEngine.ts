import { AudioEngine } from '../audio/AudioEngine';
import { analyzeTrackBlueprint, WORLD_PX_PER_SEC } from '../audio/TrackAnalyzer';
import { ThorVGRenderer } from '../renderer/ThorVGRenderer';
import {
  FORM_CONFIG,
  type AfterimageTrail,
  type BannerMessage,
  type GamePhase,
  type HUDTelemetry,
  type LoadingProgress,
  type MicroGate,
  type RendererMode,
  type ResonanceFormType,
  type SectionIntensity,
  type ShockwaveEffect,
  type TrackBlueprint,
  type TrackMetadata,
  type VectorParticle,
} from '../types/game';
import { BezierTerrain } from './BezierTerrain';
import { PlayerController } from './PlayerController';

const PLAYER_SCREEN_X_RATIO = 0.22;
const ZOOM_THRESHOLD = 50.0;

/**
 * Core 60fps Game Engine managing Pre-Computed Audio Blueprint playback,
 * Tiny Wings / Alto-style Hybrid Wave-Surfing Physics, Infinite Scale Diving (Origin Rebasing),
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

  // Pre-computed Track Blueprint
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
  private zoomScale: number = 1.0;          // Matrix scale (resets to 1.0 on Origin Rebasing)
  private rebasedZoomDisplay: number = 1.0; // Effective magnification shown on HUD (1.0x ~ 64.0x)
  private transitionTimer: number = 0;
  private focalScreenX: number = 640;
  private focalScreenY: number = 360;

  // World & Wave-Surfing Physics State
  private cameraX: number = 0;
  private baseSpeed: number = WORLD_PX_PER_SEC; // 480px/s locked 1:1 with pre-computed blueprint
  private playerY: number = 360;
  private playerVy: number = 0;
  private playerRotation: number = 0;
  private playerRadius: number = 22;
  private isGrounded: boolean = false;
  private jumpsRemaining: number = 1;
  private dashTimer: number = 0;
  private dashCooldown: number = 0;
  private isGrinding: boolean = false;
  private isDiveHeld: boolean = false;
  private surfMomentum: number = 0.15; // 0.0 ~ 1.0 wave-surfing momentum
  private lastCrestLaunchSec: number = -1;
  private lastPumpBannerSec: number = -5;
  private lastBeatSliceIndex: number = -1;
  private currentSectionIntensity: SectionIntensity = 'calm';
  private slamActive: boolean = false;
  private invulnerableTimer: number = 0;
  /** Drives the character run-cycle animation (visual only, no effect on physics). */
  private runCycleTime: number = 0;

  // Resonance Swap & Micro View State
  private activeForm: ResonanceFormType = 'synth';
  private divingTargetForm: ResonanceFormType = 'bass';
  private resonanceGauge: number = 35; // 0 ~ 100
  private microPolarity: 1 | -1 = -1;  // -1 = top lane, +1 = bottom lane
  private microGates: MicroGate[] = [];
  private nextMicroGateX: number = 0;
  private nextMicroGateId: number = 1;

  // Score, Orbs & Visual Effects
  private score: number = 0;
  private combo: number = 1;
  private maxCombo: number = 1;
  private orbsCollected: number = 0;
  private trapsDestroyed: number = 0;
  private divesCompleted: number = 0;
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

  public resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.renderer?.resize(width, height);
  }

  /**
   * Decodes the audio track and pre-computes the full TrackBlueprint during the loading screen.
   */
  public async prepareRun(
    track: TrackMetadata,
    onProgress?: (status: LoadingProgress) => void
  ): Promise<TrackBlueprint> {
    this.stopRun();
    onProgress?.({ progress: 0.08, stage: 'decoding' });
    const loadedTrack = await this.audio.loadTrack(track);
    const buffer = this.audio.getBuffer();
    if (!buffer) {
      throw new Error('AudioBuffer unavailable after loadTrack');
    }
    const blueprint = await analyzeTrackBlueprint(buffer, loadedTrack, onProgress);
    this.activeBlueprint = blueprint;
    return blueprint;
  }

  /**
   * Starts gameplay immediately if `prepareRun` already built the blueprint,
   * or runs `prepareRun` automatically first.
   */
  public async startRun(
    track: TrackMetadata,
    onProgress?: (status: LoadingProgress) => void
  ): Promise<void> {
    if (!this.activeBlueprint || this.activeBlueprint.trackId !== track.id) {
      await this.prepareRun(track, onProgress);
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
    this.baseSpeed = this.activeBlueprint?.worldPxPerSec ?? WORLD_PX_PER_SEC;

    if (this.activeBlueprint) {
      this.terrain.loadBlueprint(this.activeBlueprint, this.width, this.height);
    } else {
      this.terrain.reset(this.width, this.height);
    }

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
    this.isDiveHeld = false;
    this.surfMomentum = 0.18;
    this.lastCrestLaunchSec = -1;
    this.lastPumpBannerSec = -5;
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
    this.shockwaves = [];
    this.afterimages = [];
    this.particles = [];
    this.setBanner({ key: 'ready' }, 2.4);
  }

  /**
   * Sets the Wave Dive / Downhill Pump hold state (S / ArrowDown).
   * - In air: dives rapidly into the downhill wave trough.
   * - On downhill wave: pumps the slope for high-speed surf acceleration.
   */
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
   * Primary Action Input (Space / Left Click / W / ArrowUp):
   * - In MACRO View: Jump (or Wave Crest Super Launch when jumping off an uphill slope)
   * - In MICRO View: Phase Invert (+A <-> -A immediate control-point snap)
   */
  public handlePrimaryAction(): void {
    if (!this.running) return;

    const playerScreenX = this.getEffectivePlayerScreenX();

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
      this.score += 25 * this.combo;
      return;
    }

    if (this.phase !== 'MACRO') return;

    const profile = this.playerController.profile;
    if (this.isGrounded || this.jumpsRemaining > 0) {
      const isSecondJump = !this.isGrounded;
      const playerWorldX = this.cameraX + playerScreenX;
      const { slope, segment } = this.terrain.sampleFloor(playerWorldX);

      // Wave Crest Super Launch: jumping while climbing an uphill wave or at a crest
      // converts wave slope + surfMomentum into extra upward launch velocity!
      const isCrestBoost =
        this.isGrounded && (slope < -0.08 || Boolean(segment?.isCrest)) && this.surfMomentum >= 0.2;

      if (isCrestBoost) {
        const slopeLift = Math.min(260, Math.abs(slope) * 280 * (0.75 + this.surfMomentum));
        this.playerVy = profile.jumpVelocity - slopeLift - 70 * this.surfMomentum;
        this.surfMomentum = Math.min(1.0, this.surfMomentum + 0.16);
        this.lastCrestLaunchSec = this.elapsedSec;
        this.score += Math.round(180 * this.combo * (1 + this.surfMomentum));
        this.setBanner({ key: 'crestLaunch' }, 1.3);
        this.spawnBurst(playerScreenX, this.playerY + this.playerRadius, [140, 245, 255], 16);
      } else {
        this.playerVy = isSecondJump ? profile.secondJumpVelocity : profile.jumpVelocity;
        this.spawnBurst(
          playerScreenX,
          this.playerY + this.playerRadius,
          FORM_CONFIG[this.activeForm].rgb,
          8
        );
      }

      this.isGrounded = false;
      this.jumpsRemaining = Math.max(
        0,
        (isSecondJump ? this.jumpsRemaining : profile.maxJumps) - 1
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
    const playerScreenX = this.getEffectivePlayerScreenX();
    this.spawnBurst(playerScreenX, this.playerY, FORM_CONFIG[nextForm].rgb, 18);
    this.setBanner({ key: 'manualSwap', params: { form: nextForm } }, 1.6);
  }

  /**
   * Secondary Action Input (Shift / Right Click):
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
    const playerScreenX = this.getEffectivePlayerScreenX();
    const playerWorldX = this.cameraX + playerScreenX;

    if (this.activeForm === 'bass') {
      if (!this.isGrounded) {
        // Bass Form Airborne: High-velocity slam into Landing Shockwave
        this.playerVy = 1280;
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
    this.surfMomentum = Math.min(1.0, this.surfMomentum + 0.25);

    if (profile.piercesTrapsDuringDash) {
      // Treble Form: Blink Dash grants temporary invulnerability to pierce Beat Traps
      this.invulnerableTimer = Math.max(this.invulnerableTimer, profile.dashDurationSec + 0.08);
      this.setBanner({ key: 'blinkDash' }, 0.9);
    }
  }

  private getEffectivePlayerScreenX(): number {
    const surgeOffset = this.surfMomentum * 0.085 + (this.dashTimer > 0 ? 0.035 : 0);
    return this.width * (PLAYER_SCREEN_X_RATIO + surgeOffset);
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

    if (this.statusBannerTimer > 0) {
      this.statusBannerTimer = Math.max(0, this.statusBannerTimer - dt);
      if (this.statusBannerTimer === 0) this.statusBanner = null;
    }
    if (this.dashCooldown > 0) this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    if (this.invulnerableTimer > 0) {
      this.invulnerableTimer = Math.max(0, this.invulnerableTimer - dt);
    }

    // Visual & scoring speed multiplier driven by wave-surfing momentum, dash, and grind
    let speedMultiplier = 1.0 + this.surfMomentum * 0.85 + freq.overall * 0.15;
    if (this.dashTimer > 0) {
      this.dashTimer = Math.max(0, this.dashTimer - dt);
      speedMultiplier = this.activeForm === 'treble' ? 2.4 : 1.95;
    } else if (this.isGrinding) {
      speedMultiplier += 0.25;
    }

    // Synchronize world scroll 1:1 with the audio playback clock so pre-computed
    // beat crests, drops, and portals arrive at the exact millisecond of the music!
    const audioSec = this.audio.getElapsedSec();
    const targetCameraX = audioSec * this.baseSpeed;
    const prevCameraX = this.cameraX;
    if (this.audio.playing && Math.abs(targetCameraX - this.cameraX) < this.baseSpeed * 1.5) {
      this.cameraX += this.baseSpeed * dt + (targetCameraX - this.cameraX) * Math.min(1, dt * 10);
    } else {
      this.cameraX += this.baseSpeed * dt;
    }
    const stepX = Math.max(0, this.cameraX - prevCameraX);

    if ((this.phase === 'MACRO' && this.isGrounded) || this.phase === 'MICRO') {
      this.runCycleTime += dt * speedMultiplier;
    }

    const playerScreenX = this.getEffectivePlayerScreenX();
    const playerWorldX = this.cameraX + playerScreenX;

    this.terrain.update(this.cameraX, this.width, this.height, this.elapsedSec, freq);

    // Phase State Machine
    if (this.phase === 'MACRO') {
      this.updateMacroPhase(dt, playerScreenX, playerWorldX, speedMultiplier);
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
      orbs: this.terrain.getOrbs(),
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
      acousticFilter: this.audio.getAcousticZoomMode(),
      statusBanner: this.statusBanner,
      isFinished,
      trapsDestroyed: this.trapsDestroyed,
      divesCompleted: this.divesCompleted,
      surfMomentum: Number(this.surfMomentum.toFixed(2)),
      speedMultiplier: Number(speedMultiplier.toFixed(1)),
      orbsCollected: this.orbsCollected,
      totalOrbs: this.terrain.getTotalOrbCount(),
      sectionIntensity: this.currentSectionIntensity,
    });
  }

  private updateMacroPhase(
    dt: number,
    playerScreenX: number,
    playerWorldX: number,
    speedMultiplier: number
  ): void {
    const { floorY, slope, angleRad, segment } = this.terrain.sampleFloor(playerWorldX);
    const { slope: aheadSlope } = this.terrain.sampleFloor(playerWorldX + 28);
    const targetGroundY = floorY - this.playerRadius;

    // Detect section intensity changes (Calm -> Groove -> Drop)
    const nextIntensity = segment?.intensity ?? 'groove';
    if (nextIntensity === 'drop' && this.currentSectionIntensity !== 'drop') {
      this.setBanner({ key: 'dropSection' }, 2.0);
      this.spawnBurst(playerScreenX, this.playerY, FORM_CONFIG[this.activeForm].rgb, 22);
    }
    this.currentSectionIntensity = nextIntensity;

    // Pre-computed Beat Bounce & Rhythm Pulse on beat onset slices
    if (
      segment?.isBeatOnset &&
      segment.sliceIndex !== undefined &&
      segment.sliceIndex !== this.lastBeatSliceIndex
    ) {
      this.lastBeatSliceIndex = segment.sliceIndex;
      this.surfMomentum = Math.min(1.0, this.surfMomentum + 0.08);
      this.resonanceGauge = Math.min(100, this.resonanceGauge + 1.5);
    }

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
      // Wave Dive (holding S / Down in the air pulls character rapidly into the wave trough)
      const baseGravity = this.playerController.profile.gravity;
      const diveMultiplier = !this.isGrounded && this.isDiveHeld ? 2.35 : 1.0;
      this.playerVy += baseGravity * diveMultiplier * dt;
      this.playerY += this.playerVy * dt;
    }

    // Formula-based Bezier Wave Surfing & Crest Tangent Launch Check
    if (this.playerY >= targetGroundY) {
      const wasAirborne = !this.isGrounded;
      const impactVy = this.playerVy;

      this.playerY = targetGroundY;
      this.playerVy = 0;
      this.isGrounded = true;
      this.jumpsRemaining = this.activeForm === 'synth' ? 2 : 1;
      this.playerRotation = angleRad;

      // 1. Landing on a downhill wave slope converts vertical fall speed into Surf Momentum!
      if (wasAirborne && slope > 0.03 && impactVy > 180) {
        const landingPump = Math.min(0.36, (impactVy / 1100) * (this.isDiveHeld ? 1.45 : 0.9));
        this.surfMomentum = Math.min(1.0, this.surfMomentum + landingPump);
        this.spawnBurst(playerScreenX, floorY, FORM_CONFIG[this.activeForm].secondaryRgb, 10);
      }

      // 2. Downhill Wave Surfing & Pumping (slope > 0 means going downhill on screen Y)
      if (slope > 0.05) {
        const pumpGain = slope * (this.isDiveHeld ? 1.85 : 0.92) * dt;
        this.surfMomentum = Math.min(1.0, this.surfMomentum + pumpGain);
        this.isGrinding = true;
        this.score += (this.isDiveHeld ? 240 : 140) * dt * this.combo;

        // Emit downhill carving sparks under character's feet
        if (Math.random() < (this.isDiveHeld ? 0.85 : 0.45)) {
          this.particles.push({
            x: playerScreenX - 8,
            y: floorY - 2,
            vx: -120 - Math.random() * 140,
            vy: -40 - Math.random() * 90,
            radius: this.isDiveHeld ? 4.5 : 3.2,
            color: this.isDiveHeld
              ? [255, 230, 0]
              : FORM_CONFIG[this.activeForm].secondaryRgb,
            alpha: 1.0,
            life: 0,
            maxLife: 0.28,
          });
        }

        if (
          this.isDiveHeld &&
          this.surfMomentum >= 0.65 &&
          this.elapsedSec - this.lastPumpBannerSec > 3.2
        ) {
          this.lastPumpBannerSec = this.elapsedSec;
          this.setBanner({ key: 'wavePump' }, 1.1);
        }
      } else {
        this.isGrinding = false;
        // Uphill or flat gently decays excess momentum unless dashing
        const decayRate = slope < -0.1 ? 0.22 : 0.14;
        this.surfMomentum = Math.max(0.12, this.surfMomentum - decayRate * dt);
      }

      // 3. Natural Wave Crest Tangent Launch (Tiny Wings / Alto style):
      // When climbing fast up an uphill ramp (slope < -0.13) and passing the crest inflection
      // where the wave bends downward (aheadSlope - slope > 0.18), launch into the air!
      const isPassingCrest =
        !this.isDiveHeld &&
        slope < -0.13 &&
        aheadSlope - slope > 0.18 &&
        this.surfMomentum >= 0.3 &&
        this.elapsedSec - this.lastCrestLaunchSec > 0.45;

      if (isPassingCrest) {
        const tangentVy = slope * this.baseSpeed * (0.85 + 0.65 * this.surfMomentum);
        this.playerVy = Math.max(-780, Math.min(-330, tangentVy - 130 * this.surfMomentum));
        this.isGrounded = false;
        this.lastCrestLaunchSec = this.elapsedSec;
        this.score += Math.round(140 * this.combo);
        this.spawnBurst(playerScreenX, floorY, FORM_CONFIG[this.activeForm].rgb, 12);
      }

      // 4. Bass Form Landing Shockwave check
      if (wasAirborne && this.activeForm === 'bass' && this.slamActive) {
        this.slamActive = false;
        this.triggerBassShockwave(playerScreenX, this.playerY, playerWorldX);
      }
    } else {
      this.isGrounded = false;
      this.isGrinding = false;
      this.playerRotation = Math.max(
        -0.65,
        Math.min(0.75, (this.playerVy / 900) * 0.55)
      );
    }

    // Leave subtle speed afterimages when surfing at very high momentum
    if (this.surfMomentum > 0.72 && Math.floor(this.elapsedSec * 24) % 2 === 0) {
      this.afterimages.push({
        x: playerScreenX,
        y: this.playerY,
        rotation: this.playerRotation,
        form: this.activeForm,
        alpha: 0.45,
      });
    }

    // Score accumulation scaled by surf speed
    this.score += dt * 65 * speedMultiplier * this.combo;

    // 5. Collect Rhythm Resonance Orbs along the waveform & airborne launch arcs
    for (const orb of this.terrain.getOrbs()) {
      if (orb.collected) continue;
      const orbY = orb.screenY ?? orb.worldY;
      const dx = orb.worldX - playerWorldX;
      const dy = orbY - this.playerY;
      const collectRadius = orb.radius + this.playerRadius + (this.dashTimer > 0 ? 22 : 14);
      if (dx * dx + dy * dy <= collectRadius * collectRadius) {
        orb.collected = true;
        this.orbsCollected++;
        this.combo = Math.min(32, this.combo + (orb.isArcOrb ? 2 : 1));
        this.maxCombo = Math.max(this.maxCombo, this.combo);
        this.score += (orb.isArcOrb ? 180 : 95) * this.combo;
        this.resonanceGauge = Math.min(100, this.resonanceGauge + (orb.isArcOrb ? 3.5 : 2.0));
        this.surfMomentum = Math.min(1.0, this.surfMomentum + 0.045);
        this.spawnBurst(playerScreenX, orbY, FORM_CONFIG[orb.band].rgb, 6);
      }
    }

    // 6. Check Frequency Diving Node Collision -> Trigger Infinite Scale Transition
    for (const node of this.terrain.getDivingNodes()) {
      if (node.activated) continue;
      const dx = node.worldX - playerWorldX;
      const dy = node.worldY - this.playerY;
      const dist = Math.hypot(dx, dy);
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
        this.combo = Math.min(32, this.combo + 1);
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
            this.surfMomentum = Math.max(0.12, this.surfMomentum * 0.45);
            this.invulnerableTimer = 1.1;
            this.playerVy = -420;
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
        trap.worldX <= playerWorldX + 400
      ) {
        trap.destroyed = true;
        shattered++;
        this.trapsDestroyed++;
      }
    }
    this.combo = Math.min(32, this.combo + Math.max(1, shattered));
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.score += (300 + shattered * 250) * this.combo;
    this.setBanner(
      shattered > 0
        ? { key: 'shockwave', params: { count: shattered } }
        : { key: 'shockwaveNoHit' },
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
    this.setBanner({ key: 'zoomIn', params: { form: targetForm } }, 1.5);
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

    // Charge Resonance Gauge over time & via gate passes
    this.resonanceGauge = Math.min(100, this.resonanceGauge + dt * 16);
    this.score += dt * 110 * this.combo;

    for (const gate of this.microGates) {
      const dx = Math.abs(gate.worldX - playerWorldX);
      if (dx < 26 && !gate.passed && !gate.hit) {
        if (this.microPolarity === gate.safePolarity) {
          gate.passed = true;
          this.resonanceGauge = Math.min(100, this.resonanceGauge + 14);
          this.combo = Math.min(32, this.combo + 1);
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
