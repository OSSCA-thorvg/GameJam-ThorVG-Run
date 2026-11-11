import ThorVG, {
  type ThorVGNamespace,
  type Animation as TvgAnimation,
  type AnimationInfo,
  type Canvas as TvgCanvas,
  type Shape as TvgShape,
} from '@thorvg/webcanvas';
import wasmUrl from '@thorvg/webcanvas/dist/thorvg.wasm?url';
import splashLottie from '../logo/powred.by.thorvg.1.json?raw';
import crewmateLottie from '../asset/Loading 50 _ Among Us.json?raw';
import { buildCharacterMatrix } from './characterMatrix';
import { prepareSplashLottie } from './splashLottie';
import {
  FORM_CONFIG,
  type BeatTrap,
  type BezierSegment,
  type RendererMode,
  type ResonanceFormType,
  type RenderFrameState,
} from '../types/game';

/**
 * Serializes ThorVG.init()/term() across renderer instances. Each job starts only after
 * the previous one settles; a failed job does not block later ones.
 */
let engineQueue: Promise<unknown> = Promise.resolve();

function enqueueEngineJob<T>(job: () => Promise<T> | T): Promise<T> {
  const run = engineQueue.then(job, job);
  engineQueue = run.catch(() => undefined);
  return run;
}

interface ContentBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Splash core logo fits within ~54% of the viewport so even the peak upward bounce
 * at frame 160 (origY ≈ -430) stays 100% inside a 16:9 viewport without touching the top edge.
 */
const SPLASH_VIEWPORT_FIT = 0.54;

/** The crewmate Lottie composition is 500x500. */
const CREW_SOURCE_SIZE = 500;
/** Visible crewmate height relative to the physics radius (collision circle diameter = 2.0). */
const CREW_HEIGHT_RATIO = 2.6;
/**
 * Visible crewmate area inside the 500x500 composition: the union of non-transparent pixels
 * over all 27 frames, measured by rendering each frame with ThorVG SwCanvas. (Picture.bounds()
 * cannot be used: it reports the whole 500x500 picture box, not the drawn content.)
 */
const CREW_BOX: ContentBox = { x: 181, y: 169, width: 145, height: 192 };

/**
 * ThorVG WebAssembly Vector Graphics Renderer Wrapper.
 * Strictly handles 2D vector drawing via @thorvg/webcanvas ('sw' SwCanvas or 'gl' GlCanvas).
 */
export class ThorVGRenderer {
  private tvg: ThorVGNamespace | null = null;
  private canvas: TvgCanvas | null = null;
  private mode: RendererMode;
  private width: number = 1280;
  private height: number = 720;
  private disposed: boolean = false;

  // Pooled Shape instances (Zero-allocation per 60fps frame)
  private bgShape: TvgShape | null = null;
  private gridShape: TvgShape | null = null;
  private waveFillShape: TvgShape | null = null;
  private spectrumShape: TvgShape | null = null;
  private waveGlowShape: TvgShape | null = null;
  private waveCoreShape: TvgShape | null = null;
  private platformsShape: TvgShape | null = null;
  private gimmicksShape: TvgShape | null = null;
  private timingRingsShape: TvgShape | null = null;
  private orbsShape: TvgShape | null = null;
  private trapsShape: TvgShape | null = null;
  private portalsShape: TvgShape | null = null;
  private effectsShape: TvgShape | null = null;
  private playerGlowShape: TvgShape | null = null;
  private playerCoreShape: TvgShape | null = null;
  private particlesShape: TvgShape | null = null;

  /**
   * Every WASM object this renderer creates. They are disposed explicitly before term():
   * @thorvg/webcanvas frees GC'd objects through a FinalizationRegistry using whatever
   * WASM module is *current*, so an undisposed object from a terminated module would
   * later be freed on the next module's heap ("memory access out of bounds").
   */
  private ownedObjects: Array<{ dispose(): void }> = [];

  // Startup splash ("Powered by ThorVG" Lottie). Kept hidden after it finishes.
  private splashAnim: TvgAnimation | null = null;
  private splashInfo: AnimationInfo | null = null;
  private splashActive: boolean = false;
  private splashWidth: number = 1920;
  private splashHeight: number = 1080;
  private splashCoreWidth: number = 1920;
  private splashCoreHeight: number = 1080;

  // Main character: Among Us crewmate run-cycle Lottie (falls back to the form polygon).
  private crewAnim: TvgAnimation | null = null;
  private crewInfo: AnimationInfo | null = null;

  constructor(mode: RendererMode) {
    this.mode = mode;
  }

  public async init(canvasElement: HTMLCanvasElement, width: number, height: number): Promise<void> {
    this.width = width;
    this.height = height;

    // ThorVG.init()/term() mutate a single global WASM module. Running them through one
    // queue guarantees a disposed renderer's term() can never land on top of a newer
    // renderer's init() (React StrictMode double effects, rapid CPU <-> GPU switching).
    await enqueueEngineJob(async () => {
      if (this.disposed) return;

      const TVG = await ThorVG.init({
        renderer: this.mode,
        locateFile: (path: string) => {
          const filename = path.split('/').pop() || 'thorvg.wasm';
          return wasmUrl.replace('thorvg.wasm', filename);
        },
      });

      if (this.disposed) {
        TVG.term();
        return;
      }

      this.tvg = TVG;
      this.canvas = new TVG.Canvas(canvasElement, {
        width,
        height,
        enableDevicePixelRatio: true,
      });

      // Initialize pooled shapes in painter's algorithm order
      this.bgShape = new TVG.Shape();
      this.gridShape = new TVG.Shape();
      this.waveFillShape = new TVG.Shape();
      this.spectrumShape = new TVG.Shape();
      this.waveGlowShape = new TVG.Shape();
      this.waveCoreShape = new TVG.Shape();
      this.platformsShape = new TVG.Shape();
      this.gimmicksShape = new TVG.Shape();
      this.timingRingsShape = new TVG.Shape();
      this.orbsShape = new TVG.Shape();
      this.trapsShape = new TVG.Shape();
      this.portalsShape = new TVG.Shape();
      this.effectsShape = new TVG.Shape();
      this.playerGlowShape = new TVG.Shape();
      this.playerCoreShape = new TVG.Shape();
      this.particlesShape = new TVG.Shape();
      this.ownedObjects.push(
        this.bgShape,
        this.gridShape,
        this.waveFillShape,
        this.spectrumShape,
        this.waveGlowShape,
        this.waveCoreShape,
        this.platformsShape,
        this.gimmicksShape,
        this.timingRingsShape,
        this.orbsShape,
        this.trapsShape,
        this.portalsShape,
        this.effectsShape,
        this.playerGlowShape,
        this.playerCoreShape,
        this.particlesShape
      );

      this.canvas
        .add(this.bgShape)
        .add(this.gridShape)
        .add(this.waveFillShape)
        .add(this.spectrumShape)
        .add(this.waveGlowShape)
        .add(this.waveCoreShape)
        .add(this.platformsShape)
        .add(this.gimmicksShape)
        .add(this.timingRingsShape)
        .add(this.orbsShape)
        .add(this.trapsShape)
        .add(this.portalsShape)
        .add(this.effectsShape)
        .add(this.playerGlowShape)
        .add(this.playerCoreShape);

      // Character draws above its aura and below particles.
      this.loadCrewmate(TVG);
      this.canvas.add(this.particlesShape);

      // Added last so it draws above everything while active.
      this.loadSplash(TVG);
    });
  }

  /** Loads the unclipped splash Lottie. On failure the splash is skipped (playSplash resolves at once). */
  private loadSplash(TVG: ThorVGNamespace): void {
    try {
      const prepared = prepareSplashLottie(splashLottie);
      this.splashWidth = prepared.width;
      this.splashHeight = prepared.height;
      this.splashCoreWidth = prepared.coreWidth;
      this.splashCoreHeight = prepared.coreHeight;

      const anim = new TVG.Animation();
      this.ownedObjects.push(anim);
      anim.load(prepared.json);
      const info = anim.info();
      const picture = anim.picture;
      if (!info || info.totalFrames <= 0 || !picture) {
        throw new Error('splash Lottie has no frames');
      }
      picture.visible(false);
      this.canvas!.add(picture);
      this.splashAnim = anim;
      this.splashInfo = info;
    } catch (err) {
      console.warn('Splash Lottie unavailable, skipping splash:', err);
      this.splashAnim = null;
      this.splashInfo = null;
    }
  }

  /** Loads the crewmate Lottie. On failure the polygon character is used. */
  private loadCrewmate(TVG: ThorVGNamespace): void {
    try {
      const anim = new TVG.Animation();
      this.ownedObjects.push(anim);
      anim.load(crewmateLottie);
      const info = anim.info();
      const picture = anim.picture;
      if (!info || info.totalFrames <= 0 || !picture) {
        throw new Error('crewmate Lottie has no frames');
      }
      picture.size(CREW_SOURCE_SIZE, CREW_SOURCE_SIZE);
      picture.visible(false);
      this.canvas!.add(picture);
      this.crewAnim = anim;
      this.crewInfo = info;
    } catch (err) {
      console.warn('Crewmate Lottie unavailable, using polygon character:', err);
      this.crewAnim = null;
      this.crewInfo = null;
    }
  }

  /**
   * Draws the crewmate centered at (cx, cy) with total visible height `height`.
   * `flip = -1` mirrors it vertically (running upside down on the Micro View ceiling).
   */
  private drawCrewmate(
    cx: number,
    cy: number,
    height: number,
    rotation: number,
    flip: 1 | -1,
    runCycleTime: number,
    alpha: number
  ): void {
    const anim = this.crewAnim;
    const info = this.crewInfo;
    const picture = anim?.picture;
    if (!anim || !info || !picture) return;

    const k = height / CREW_BOX.height;
    picture.size(CREW_SOURCE_SIZE * k, CREW_SOURCE_SIZE * k);
    const frame = (runCycleTime * info.fps) % info.totalFrames;
    anim.frame(frame);

    const pivotX = (CREW_BOX.x + CREW_BOX.width / 2) * k;
    const pivotY = (CREW_BOX.y + CREW_BOX.height / 2) * k;
    picture.transform(buildCharacterMatrix(cx, cy, pivotX, pivotY, rotation, flip));
    picture.opacity(Math.max(0, Math.min(255, Math.round(alpha))));
    picture.visible(true);
  }

  private hideCrewmate(): void {
    this.crewAnim?.picture?.visible(false);
  }

  /**
   * Fits the core 1920x1080 splash composition to 60% of the viewport (`SPLASH_VIEWPORT_FIT`)
   * while rendering the expanded unclipped bounds centered seamlessly on the black canvas.
   */
  private layoutSplash(): void {
    const picture = this.splashAnim?.picture;
    if (!picture) return;
    const coreScale =
      Math.min(this.width / this.splashCoreWidth, this.height / this.splashCoreHeight) *
      SPLASH_VIEWPORT_FIT;
    const drawW = this.splashWidth * coreScale;
    const drawH = this.splashHeight * coreScale;
    picture.size(drawW, drawH);
    picture.translate((this.width - drawW) / 2, (this.height - drawH) / 2);
  }

  /** Clears every gameplay layer, leaving a black background that matches the splash Lottie. */
  private clearGameplayLayers(): void {
    this.bgShape!.reset().appendRect(0, 0, this.width, this.height).fill(0, 0, 0, 255);
    for (const shape of [
      this.gridShape,
      this.waveFillShape,
      this.spectrumShape,
      this.waveGlowShape,
      this.waveCoreShape,
      this.platformsShape,
      this.gimmicksShape,
      this.timingRingsShape,
      this.orbsShape,
      this.trapsShape,
      this.portalsShape,
      this.effectsShape,
      this.playerGlowShape,
      this.playerCoreShape,
      this.particlesShape,
    ]) {
      shape!.reset();
    }
    this.hideCrewmate();
  }

  /**
   * Plays the splash Lottie once from the first to the last frame, then hides it.
   * Frames are driven manually from elapsed time so completion is deterministic.
   * Resolves immediately if the splash failed to load, and is guarded by a safety
   * timeout (duration + 1.5s) in case frames stop arriving.
   */
  public playSplash(): Promise<void> {
    const anim = this.splashAnim;
    const info = this.splashInfo;
    const picture = anim?.picture;
    if (!this.ready || !anim || !info || !picture) return Promise.resolve();

    return new Promise<void>((resolve) => {
      let rafId = 0;
      let finished = false;
      const lastFrame = Math.max(0, info.totalFrames - 1);
      const durationSec = lastFrame / info.fps;

      const finish = () => {
        if (finished) return;
        finished = true;
        cancelAnimationFrame(rafId);
        clearTimeout(safetyTimer);
        this.splashActive = false;
        if (!this.disposed) picture.visible(false);
        resolve();
      };
      const safetyTimer = setTimeout(finish, (durationSec + 1.5) * 1000);

      this.splashActive = true;
      this.clearGameplayLayers();
      this.layoutSplash();
      picture.visible(true);

      const start = performance.now();
      const tick = (now: number) => {
        if (this.disposed || !this.canvas) {
          finish();
          return;
        }
        const elapsedSec = (now - start) / 1000;
        anim.frame(Math.min(lastFrame, elapsedSec * info.fps));
        this.canvas.update().render();
        if (elapsedSec >= durationSec) {
          finish();
          return;
        }
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
    });
  }

  /** True once init() has completed successfully and destroy() has not been called. */
  public get ready(): boolean {
    return !this.disposed && this.canvas !== null;
  }

  public get activeBackend(): string {
    return this.canvas?.renderer ?? this.mode;
  }

  public resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    if (this.canvas && !this.disposed) {
      this.canvas.resize(width, height);
      if (this.splashActive) {
        this.clearGameplayLayers();
        this.layoutSplash();
      }
    }
  }

  /**
   * Renders an animated Hybrid Rhythm-Runner vector preview for the Start Menu,
   * reflecting the selected difficulty's scroll speed in real time.
   */
  public renderPreviewFrame(
    timeSec: number,
    previewForm: ResonanceFormType = 'synth',
    previewSpeedPxPerSec: number = 550
  ): void {
    if (!this.canvas || !this.tvg || this.disposed) return;
    const { width, height } = this;
    const formCfg = FORM_CONFIG[previewForm];
    const [r, g, b] = formCfg.rgb;
    const [sr, sg, sb] = formCfg.secondaryRgb;

    // 1. Deep cyber background
    this.bgShape!.reset().appendRect(0, 0, width, height).fill(9, 11, 22, 255);

    // 2. Fast-scrolling neon rhythm grid
    this.gridShape!.reset();
    const gridSpacing = 72;
    const scrollPx = timeSec * previewSpeedPxPerSec;
    const scrollOffset = scrollPx % gridSpacing;
    for (let x = -scrollOffset; x <= width; x += gridSpacing) {
      this.gridShape!.moveTo(x, 0).lineTo(x, height);
    }
    for (let y = 80; y < height; y += gridSpacing) {
      this.gridShape!.moveTo(0, y).lineTo(width, y);
    }
    this.gridShape!.stroke({ width: 1, color: [35, 55, 95, 105] });

    // 3. Flat Stepped Sprint Decks + Sample 2F Sky Platform + Shrinking Timing Rings
    const baseFloorY = height * 0.7;
    const tileW = 240;
    const firstTile = Math.floor(scrollPx / tileW) - 1;
    const tileCount = Math.ceil(width / tileW) + 3;

    this.waveFillShape!.reset();
    this.spectrumShape!.reset();
    this.waveGlowShape!.reset();
    this.waveCoreShape!.reset();
    this.platformsShape!.reset();
    this.gimmicksShape!.reset();
    this.timingRingsShape!.reset();
    this.orbsShape!.reset();

    let hasPlatforms = false;
    let hasGimmicks = false;
    let hasRings = false;

    for (let i = 0; i < tileCount; i++) {
      const tileIdx = firstTile + i;
      const x0 = tileIdx * tileW - scrollPx;
      const x1 = x0 + tileW;
      const mod = ((tileIdx % 7) + 7) % 7;
      const isGap = mod === 5;
      const deckStep = mod === 2 || mod === 3 ? -36 : 0;
      const y = baseFloorY + deckStep;

      if (!isGap) {
        this.waveFillShape!
          .moveTo(x0, height)
          .lineTo(x0, y)
          .lineTo(x1, y)
          .lineTo(x1, height)
          .close();
        this.waveGlowShape!.moveTo(x0, y).lineTo(x1, y);
        this.waveCoreShape!.moveTo(x0, y).lineTo(x1, y);

        // Equalizer bars beneath solid sprint deck
        for (let b = 0; b < 3; b++) {
          const barW = tileW * 0.18;
          const bx = x0 + (b + 0.25) * (tileW / 3);
          const pulse = 0.35 + 0.45 * Math.abs(Math.sin(timeSec * 5.2 + tileIdx * 0.9 + b));
          const barH = Math.max(20, (height - y - 16) * pulse);
          this.spectrumShape!.appendRect(bx, height - barH, barW, barH, { rx: 2, ry: 2 });
        }

        // Beat Note + Shrinking Timing Ring
        const orbX = (x0 + x1) * 0.5;
        const orbY = y - 34;
        this.orbsShape!.appendCircle(orbX, orbY, 8.5, 8.5);
        if (orbX > width * 0.24 && orbX < width * 0.85) {
          const shrinkRatio = Math.max(0, Math.min(1, (orbX - width * 0.24) / (width * 0.55)));
          const ringR = 8.5 * (1.15 + shrinkRatio * 1.85);
          this.timingRingsShape!.appendCircle(orbX, orbY, ringR, ringR);
          hasRings = true;
        }
      }

      // Preview 2F Sky Platform & JumpPad before the chasm
      if (mod === 4) {
        const padX = x1 - 36;
        this.gimmicksShape!.appendRect(padX - 18, y - 9, 36, 9, { rx: 3, ry: 3 });
        hasGimmicks = true;
      }
      if (mod === 5) {
        const skyY = baseFloorY - 122;
        this.platformsShape!.appendRect(x0 - 20, skyY, tileW + 40, 10, { rx: 4, ry: 4 });
        this.orbsShape!.appendCircle((x0 + x1) * 0.5, skyY - 30, 9, 9);
        hasPlatforms = true;
      }
    }

    this.waveFillShape!.fill(r, g, b, 38);
    this.spectrumShape!.fill(r, g, b, 68);
    this.waveGlowShape!.stroke({ width: 9, color: [r, g, b, 95] });
    this.waveCoreShape!.stroke({ width: 3.4, color: [255, 255, 255, 242] });
    if (hasPlatforms) {
      this.platformsShape!
        .fill(sr, sg, sb, 155)
        .stroke({ width: 2.2, color: [255, 255, 255, 235] });
    }
    if (hasGimmicks) {
      this.gimmicksShape!
        .fill(255, 224, 65, 200)
        .stroke({ width: 2.2, color: [255, 250, 190, 245] });
    }
    if (hasRings) {
      this.timingRingsShape!.stroke({ width: 2, color: [255, 238, 120, 205] });
    }
    this.orbsShape!.fill(sr, sg, sb, 225).stroke({ width: 2, color: [255, 255, 255, 245] });

    // Clear unused gameplay shapes in preview
    this.trapsShape!.reset();
    this.portalsShape!.reset();
    this.effectsShape!.reset();
    this.particlesShape!.reset();

    // 4. Preview Sprinting Crewmate at the 24% hit-line
    const playerX = width * 0.24;
    const playerTile = Math.floor((scrollPx + playerX) / tileW);
    const playerMod = ((playerTile % 7) + 7) % 7;
    const hopOffset =
      playerMod === 5 ? -135 : playerMod === 2 || playerMod === 3 ? -36 : 0;
    const playerY = baseFloorY + hopOffset - 22;
    const runCycle = timeSec * (previewSpeedPxPerSec / 460);

    if (this.crewAnim) {
      const heightPx = 24 * CREW_HEIGHT_RATIO;
      const cy = playerY + 24 - heightPx / 2;
      this.drawPlayerPolygon(playerX, cy, 24, 0, previewForm, 1.0, true);
      this.drawCrewmate(playerX, cy, heightPx, 0, 1, runCycle, 255);
    } else {
      this.drawPlayerPolygon(playerX, playerY, 24, timeSec * 1.2, previewForm, 1.0);
    }

    this.canvas.update().render();
  }

  /**
   * Renders a full 60fps gameplay frame (Macro View, Infinite Zoom Transition, or Micro View).
   */
  public renderGameFrame(state: RenderFrameState): void {
    if (!this.canvas || !this.tvg || this.disposed) return;

    const { width, height, phase, activeForm, frequency } = state;
    const formCfg = FORM_CONFIG[activeForm];
    const [fr, fg, fb] = formCfg.rgb;

    // Transform helper for Infinite Zoom / Beat Camera Zoom Punch around the focal point
    const zoom = state.zoomScale;
    const fx = state.focalScreenX;
    const fy = state.focalScreenY;
    const tx = (x: number) => (zoom === 1 ? x : fx + (x - fx) * zoom);
    const ty = (y: number) => (zoom === 1 ? y : fy + (y - fy) * zoom);
    const ts = (s: number) => s * Math.min(zoom, 8);

    // 1. Background (pulses subtly with beatPulse + bass energy)
    const pulseBoost = Math.floor((frequency.low * 0.6 + (state.beatPulse ?? 0) * 0.5) * 28);
    if (phase === 'MICRO') {
      const [mr, mg, mb] = FORM_CONFIG[state.divingTargetForm].rgb;
      this.bgShape!
        .reset()
        .appendRect(0, 0, width, height)
        .fill(
          Math.min(45, 8 + Math.floor(mr * 0.12)),
          Math.min(45, 8 + Math.floor(mg * 0.12)),
          Math.min(55, 16 + Math.floor(mb * 0.14)),
          255
        );
    } else {
      this.bgShape!
        .reset()
        .appendRect(0, 0, width, height)
        .fill(
          7 + Math.floor(pulseBoost * 0.5),
          9 + Math.floor(pulseBoost * 0.3),
          20 + pulseBoost,
          255
        );
    }

    // 2. Dynamic Speed Grid & Beat Hit-Line Guide
    this.gridShape!.reset();
    const gridStep = 80;
    const offsetX = -(((state.cameraX % gridStep) + gridStep) % gridStep);
    for (let x = offsetX; x <= width; x += gridStep) {
      const sx = tx(x);
      if (sx >= -20 && sx <= width + 20) {
        this.gridShape!.moveTo(sx, 0).lineTo(sx, height);
      }
    }
    for (let y = 90; y < height; y += gridStep) {
      const sy = ty(y);
      if (sy >= -20 && sy <= height + 20) {
        this.gridShape!.moveTo(0, sy).lineTo(width, sy);
      }
    }
    this.gridShape!.stroke({
      width: 1,
      color: phase === 'MICRO' ? [fr, fg, fb, 65] : [40, 65, 110, 82],
    });

    if (phase === 'MICRO') {
      this.renderMicroTunnel(state);
    } else {
      this.renderMacroWorld(state, tx, ty, ts);
    }

    // 3. Render Shockwaves, Afterimage Effects & High-Speed Sprint Lines
    this.effectsShape!.reset();
    let hasEffects = false;
    for (const sw of state.shockwaves) {
      this.effectsShape!.appendCircle(tx(sw.x), ty(sw.y), ts(sw.radius), ts(sw.radius));
      hasEffects = true;
    }
    for (const ai of state.afterimages) {
      this.appendPolygonPath(
        this.effectsShape!,
        tx(ai.x),
        ty(ai.y),
        ts(state.playerRadius * 0.85),
        ai.rotation,
        ai.form
      );
      hasEffects = true;
    }
    const surfMomentum = state.surfMomentum ?? 0;
    if (surfMomentum > 0.38 || state.isDashing || state.isGrinding) {
      const lineCount = state.isDashing ? 9 : state.isGrinding ? 7 : Math.floor(surfMomentum * 7);
      for (let i = 0; i < lineCount; i++) {
        const seed = (i * 197 + Math.floor(state.timeSec * 22)) % 100;
        const lx =
          ((width - ((state.timeSec * 1550 + i * 230) % (width + 260))) + width) % width;
        const ly = i % 2 === 0 ? 45 + (seed % 140) : height - 55 - (seed % 140);
        const len = 70 + surfMomentum * 105;
        this.effectsShape!.moveTo(lx, ly).lineTo(lx + len, ly);
        hasEffects = true;
      }
    }
    if (hasEffects) {
      this.effectsShape!.stroke({ width: 2.5, color: [fr, fg, fb, 185] });
    }

    // 4. Player: Among Us crewmate over a form-colored aura (polygon character as fallback).
    const isInvulnerable = state.invulnerableTimer > 0;
    const px = tx(state.playerScreenX);
    const py = ty(state.playerScreenY);
    const pr = ts(state.playerRadius);
    if (this.crewAnim) {
      const heightPx = pr * CREW_HEIGHT_RATIO;
      const cx = px;
      let cy: number;
      let rotation = 0;
      let flip: 1 | -1 = 1;
      if (phase === 'MICRO') {
        flip = state.microPolarity === -1 ? -1 : 1;
        cy = py + (flip === -1 ? heightPx / 2 : -heightPx / 2);
      } else {
        rotation = state.playerRotation;
        cy = py + pr - heightPx / 2;
      }
      this.drawPlayerPolygon(cx, cy, pr, rotation, activeForm, isInvulnerable ? 0.55 : 1.0, true);
      const blink = isInvulnerable && Math.floor(state.timeSec * 12) % 2 === 0;
      this.drawCrewmate(cx, cy, heightPx, rotation, flip, state.runCycleTime, blink ? 90 : 255);
    } else {
      this.drawPlayerPolygon(
        px,
        py,
        pr,
        state.playerRotation,
        activeForm,
        isInvulnerable ? 0.55 : 1.0
      );
    }

    // 5. Render Vector Particles
    this.particlesShape!.reset();
    for (const pt of state.particles) {
      const rad = Math.max(1.5, pt.radius);
      this.particlesShape!.appendCircle(tx(pt.x), ty(pt.y), rad, rad);
    }
    if (state.particles.length > 0) {
      this.particlesShape!.fill(fr, fg, fb, 215);
    }

    this.canvas.update().render();
  }

  private renderMacroWorld(
    state: RenderFrameState,
    tx: (x: number) => number,
    ty: (y: number) => number,
    ts: (s: number) => number
  ): void {
    const { width, height, segments, traps, divingNodes, activeForm, cameraX, frequency } = state;
    const [fr, fg, fb] = FORM_CONFIG[activeForm].rgb;
    const [sr, sg, sb] = FORM_CONFIG[activeForm].secondaryRgb;
    const isDrop = state.sectionIntensity === 'drop';

    this.waveFillShape!.reset();
    this.spectrumShape!.reset();
    this.waveGlowShape!.reset();
    this.waveCoreShape!.reset();
    this.platformsShape!.reset();
    this.gimmicksShape!.reset();
    this.timingRingsShape!.reset();
    this.orbsShape!.reset();
    this.trapsShape!.reset();

    let hasTraps = false;

    // 1. Group contiguous solid road segments so chasm gaps (`seg.isGap`) open cleanly into the abyss!
    if (segments.length > 0) {
      const solidRuns: BezierSegment[][] = [];
      let currentRun: BezierSegment[] = [];

      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i]!;
        if (seg.isGap) {
          if (currentRun.length > 0) {
            solidRuns.push(currentRun);
            currentRun = [];
          }
          // Draw bright crimson takeoff hazard lip marker at the start of a chasm gap
          const prevSeg = i > 0 ? segments[i - 1] : undefined;
          if (prevSeg && !prevSeg.isGap) {
            const lipX = tx(seg.x0 - cameraX);
            const lipY = ty(prevSeg.y1);
            if (lipX >= -40 && lipX <= width + 40) {
              this.trapsShape!.appendRect(lipX - ts(10), lipY - ts(16), ts(10), ts(18), {
                rx: ts(2),
                ry: ts(2),
              });
              hasTraps = true;
            }
          }
        } else {
          currentRun.push(seg);
        }
      }
      if (currentRun.length > 0) {
        solidRuns.push(currentRun);
      }

      const harmonicOffset = ts(28 + frequency.mid * 20);
      let hasSpectrum = false;

      for (let rIdx = 0; rIdx < solidRuns.length; rIdx++) {
        const run = solidRuns[rIdx]!;
        const first = run[0]!;
        const last = run[run.length - 1]!;
        const startX = tx(first.x0 - cameraX);
        const startY = ty(first.y0);
        const endX = tx(last.x1 - cameraX);
        const endY = ty(last.y1);

        this.waveFillShape!.moveTo(startX, height).lineTo(startX, startY);
        this.waveGlowShape!.moveTo(startX, startY);
        this.waveCoreShape!.moveTo(startX, startY);

        for (const seg of run) {
          const x0 = tx(seg.x0 - cameraX);
          const y0 = ty(seg.y0);
          const cx1 = tx(seg.cx1 - cameraX);
          const cy1 = ty(seg.cy1);
          const cx2 = tx(seg.cx2 - cameraX);
          const cy2 = ty(seg.cy2);
          const x1 = tx(seg.x1 - cameraX);
          const y1 = ty(seg.y1);

          this.waveFillShape!.cubicTo(cx1, cy1, cx2, cy2, x1, y1);
          this.waveGlowShape!.cubicTo(cx1, cy1, cx2, cy2, x1, y1);
          this.waveCoreShape!.cubicTo(cx1, cy1, cx2, cy2, x1, y1);

          // Pre-computed audio spectrum equalizer bars under each solid sprint segment
          if (x1 >= -30 && x0 <= width + 30) {
            const spanW = Math.max(12, x1 - x0);
            const subBars = 3;
            const slotW = spanW / subBars;
            const barW = Math.max(3, slotW * 0.56);
            const segLow = seg.low ?? frequency.low;
            const segMid = seg.mid ?? frequency.mid;
            const segHigh = seg.high ?? frequency.high;
            const bands = [segLow, segMid, segHigh];

            for (let b = 0; b < subBars; b++) {
              const u = (b + 0.5) / subBars;
              const bx = x0 + b * slotW + (slotW - barW) * 0.5;
              const approxWaveY = y0 + (y1 - y0) * u + ts(12);
              const availH = Math.max(12, height - approxWaveY);
              const bandVal = bands[b] ?? 0.3;
              const barH = Math.min(availH, availH * (0.2 + bandVal * 0.72));
              if (barH > 6) {
                this.spectrumShape!.appendRect(bx, height - barH, barW, barH, { rx: 2, ry: 2 });
                hasSpectrum = true;
              }
            }
          }
        }

        this.waveFillShape!.lineTo(endX, height).close();

        // Crisp cliff walls bordering chasm gaps
        if (rIdx > 0) {
          this.waveCoreShape!.moveTo(startX, startY).lineTo(startX, height);
          this.waveGlowShape!.moveTo(startX, startY).lineTo(startX, height);
        }
        if (rIdx < solidRuns.length - 1) {
          this.waveCoreShape!.moveTo(endX, endY).lineTo(endX, height);
          this.waveGlowShape!.moveTo(endX, endY).lineTo(endX, height);
        }

        // Secondary harmonic echo curve under solid deck run
        this.waveGlowShape!.moveTo(startX, startY + harmonicOffset);
        for (const seg of run) {
          const cx1 = tx(seg.cx1 - cameraX);
          const cy1 = ty(seg.cy1) + harmonicOffset;
          const cx2 = tx(seg.cx2 - cameraX);
          const cy2 = ty(seg.cy2) + harmonicOffset;
          const x1 = tx(seg.x1 - cameraX);
          const y1 = ty(seg.y1) + harmonicOffset;
          this.waveGlowShape!.cubicTo(cx1, cy1, cx2, cy2, x1, y1);
        }
      }

      if (solidRuns.length > 0) {
        const fillAlpha = isDrop ? 56 : 40;
        const glowWidth = ts(isDrop || frequency.isBeat ? 11 : 8);
        const glowAlpha = isDrop || frequency.isBeat ? 128 : 92;

        this.waveFillShape!.fill(fr, fg, fb, fillAlpha);
        if (hasSpectrum) {
          this.spectrumShape!
            .fill(fr, fg, fb, isDrop ? 82 : 52)
            .stroke({ width: ts(1.2), color: [sr, sg, sb, 115] });
        }
        this.waveGlowShape!.stroke({ width: glowWidth, color: [fr, fg, fb, glowAlpha] });
        this.waveCoreShape!.stroke({ width: ts(3.4), color: [255, 255, 255, 245] });
      }
    }

    // 2. Render 2nd-Floor One-Way Sky Platforms (`SkyPlatform`)
    let hasPlatforms = false;
    for (const plat of state.skyPlatforms ?? []) {
      const sx0 = tx(plat.x0 - cameraX);
      const sx1 = tx(plat.x1 - cameraX);
      if (sx1 < -40 || sx0 > width + 40) continue;
      const sy = ty(plat.screenY ?? plat.worldY);
      const pw = Math.max(ts(24), sx1 - sx0);
      const ph = ts(11);

      this.platformsShape!.appendRect(sx0, sy, pw, ph, { rx: ts(4), ry: ts(4) });
      // Support accent struts under platform ends
      this.platformsShape!
        .appendRect(sx0 + ts(8), sy + ph, ts(4), ts(10))
        .appendRect(sx0 + pw - ts(12), sy + ph, ts(4), ts(10));
      hasPlatforms = true;
    }
    if (hasPlatforms) {
      this.platformsShape!
        .fill(sr, sg, sb, 170)
        .stroke({ width: ts(2.4), color: [255, 255, 255, 245] });
    }

    // 3. Render 3 Track Gimmick Objects (`HoldRail`, `JumpPad`, `DashRing`)
    let hasGimmicks = false;
    let hasTimingRings = false;

    // 3A. Hold Note Rails
    for (const rail of state.holdRails ?? []) {
      if (rail.completed) continue;
      const rx0 = tx(rail.x0 - cameraX);
      const rx1 = tx(rail.x1 - cameraX);
      if (rx1 < -40 || rx0 > width + 40) continue;
      const ry = ty(rail.screenY ?? rail.worldY);
      const beamH = ts(rail.active ? 11 : 8);
      this.gimmicksShape!
        .appendRect(rx0, ry - beamH * 0.5, Math.max(ts(20), rx1 - rx0), beamH, {
          rx: beamH * 0.5,
          ry: beamH * 0.5,
        })
        .appendCircle(rx0, ry, ts(9.5), ts(9.5))
        .appendCircle(rx1, ry, ts(11), ts(11));
      hasGimmicks = true;
    }

    // 3B. Beat Jump Pads
    for (const pad of state.jumpPads ?? []) {
      const px = tx(pad.worldX - cameraX);
      if (px < -40 || px > width + 40) continue;
      const py = ty(pad.screenY ?? pad.worldY);
      const padW = ts(42);
      const padH = ts(10);
      this.gimmicksShape!.appendRect(px - padW * 0.5, py - padH, padW, padH, {
        rx: ts(3),
        ry: ts(3),
      });
      // Upward launch chevron above the pad
      const lift = pad.triggered ? ts(26) : ts(16);
      this.gimmicksShape!
        .moveTo(px - ts(12), py - lift)
        .lineTo(px, py - lift - ts(12))
        .lineTo(px + ts(12), py - lift)
        .close();
      hasGimmicks = true;
    }

    // 3C. Airborne Dash Rings
    for (const ring of state.dashRings ?? []) {
      if (ring.triggered) continue;
      const rx = tx(ring.worldX - cameraX);
      if (rx < -60 || rx > width + 60) continue;
      const ry = ty(ring.screenY ?? ring.worldY);
      const rad = ts(ring.radius);
      this.gimmicksShape!
        .appendCircle(rx, ry, rad, rad)
        .appendCircle(rx, ry, rad * 0.58, rad * 0.58)
        .moveTo(rx - rad * 0.18, ry - rad * 0.28)
        .lineTo(rx + rad * 0.28, ry)
        .lineTo(rx - rad * 0.18, ry + rad * 0.28)
        .close();
      hasGimmicks = true;

      const dtRing = ring.timeSec - (state.audioSec ?? state.timeSec);
      if (dtRing >= -0.06 && dtRing <= 0.7) {
        const ratio = Math.max(0, Math.min(1, dtRing / 0.65));
        const approachRad = rad * (1.06 + ratio * 1.15);
        this.timingRingsShape!.appendCircle(rx, ry, approachRad, approachRad);
        hasTimingRings = true;
      }
    }

    if (hasGimmicks) {
      this.gimmicksShape!
        .fill(255, 218, 55, 130)
        .stroke({ width: ts(2.8), color: [255, 248, 175, 250] });
    }

    // 4. Rhythm Beat Notes (`ResonanceOrb`) + Shrinking Beat Timing Rings
    const orbs = state.orbs ?? [];
    let hasOrbs = false;
    for (const orb of orbs) {
      if (orb.collected) continue;
      const ox = tx(orb.worldX - cameraX);
      if (ox < -45 || ox > width + 45) continue;
      const oy = ty(orb.screenY ?? orb.worldY);
      const pulse = 1 + Math.sin(state.timeSec * 8 + orb.id * 0.7) * 0.14;
      const rad = ts(orb.radius * pulse);

      if (orb.isArcOrb) {
        this.orbsShape!
          .moveTo(ox, oy - rad * 1.35)
          .lineTo(ox + rad * 1.35, oy)
          .lineTo(ox, oy + rad * 1.35)
          .lineTo(ox - rad * 1.35, oy)
          .close();
      } else {
        this.orbsShape!.appendCircle(ox, oy, rad, rad);
      }
      hasOrbs = true;

      // Shrinking timing ring around beat targets within 0.65s of the player hit-line
      if (orb.isBeatTarget && orb.timeSec !== undefined) {
        const dtBeat = orb.timeSec - (state.audioSec ?? state.timeSec);
        if (dtBeat >= -0.05 && dtBeat <= 0.65) {
          const ratio = Math.max(0, Math.min(1, dtBeat / 0.6));
          const ringRad = ts(orb.radius * (1.12 + ratio * 1.95));
          this.timingRingsShape!.appendCircle(ox, oy, ringRad, ringRad);
          hasTimingRings = true;
        }
      }
    }
    if (hasTimingRings) {
      this.timingRingsShape!.stroke({ width: ts(2.0), color: [255, 238, 120, 215] });
    }
    if (hasOrbs) {
      this.orbsShape!
        .fill(sr, sg, sb, 230)
        .stroke({ width: ts(2.2), color: [255, 255, 255, 250] });
    }

    // 5. Beat Traps (Crimson Spikes on Solid Sprint Decks)
    for (const trap of traps) {
      if (trap.destroyed) continue;
      const sx = tx(trap.worldX - cameraX);
      if (sx < -60 || sx > width + 60) continue;
      const baseY = ty(
        (trap as BeatTrap & { screenFloorY?: number }).screenFloorY ?? height * 0.7
      );
      const halfW = ts(trap.width * 0.5);
      const spikeH = ts(trap.height);

      this.trapsShape!
        .moveTo(sx - halfW, baseY)
        .lineTo(sx, baseY - spikeH)
        .lineTo(sx + halfW, baseY)
        .close();
      hasTraps = true;
    }
    if (hasTraps) {
      this.trapsShape!.fill(255, 50, 95, 232).stroke({ width: 2, color: [255, 210, 220, 255] });
    }

    // 6. Frequency Diving Nodes (Portals)
    this.portalsShape!.reset();
    let portalColor: [number, number, number] = [5, 213, 255];
    let hasPortals = false;
    for (const node of divingNodes) {
      if (node.activated) continue;
      const sx = tx(node.worldX - cameraX);
      if (sx < -80 || sx > width + 80) continue;
      const sy = ty(node.worldY);
      const rad = ts(node.radius);
      portalColor = FORM_CONFIG[node.targetForm].rgb;

      this.portalsShape!
        .appendCircle(sx, sy, rad, rad)
        .appendCircle(sx, sy, rad * 0.58, rad * 0.58);
      hasPortals = true;
    }
    if (hasPortals) {
      this.portalsShape!
        .fill(portalColor[0], portalColor[1], portalColor[2], 70)
        .stroke({ width: 3.5, color: [portalColor[0], portalColor[1], portalColor[2], 255] });
    }
  }

  /**
   * Renders Phase 2: Micro View high-speed raw frequency tunnel and phase gates.
   */
  private renderMicroTunnel(state: RenderFrameState): void {
    const {
      width,
      height,
      timeSec,
      divingTargetForm,
      frequency,
      microGates,
      cameraX,
      microPolarity,
    } = state;
    const [mr, mg, mb] = FORM_CONFIG[divingTargetForm].rgb;

    const topLaneY = height * 0.34;
    const bottomLaneY = height * 0.66;
    const steps = 24;
    const stepW = width / steps;

    this.waveFillShape!.reset();
    this.spectrumShape!.reset();
    this.waveGlowShape!.reset();
    this.waveCoreShape!.reset();
    this.platformsShape!.reset();
    this.gimmicksShape!.reset();
    this.timingRingsShape!.reset();
    this.orbsShape!.reset();

    // Upper and Lower raw oscillating waveform tunnel walls
    const upperWallBase = height * 0.16;
    const lowerWallBase = height * 0.84;

    this.waveGlowShape!.moveTo(0, upperWallBase);
    this.waveCoreShape!.moveTo(0, upperWallBase);

    for (let i = 1; i <= steps; i++) {
      const x = i * stepW;
      const rawOsc =
        Math.sin(timeSec * 18 + i * 0.85) * (18 + frequency.high * 34) * microPolarity;
      this.waveGlowShape!.lineTo(x, upperWallBase + rawOsc);
      this.waveCoreShape!.lineTo(x, upperWallBase + rawOsc);
    }

    this.waveGlowShape!.moveTo(0, lowerWallBase);
    this.waveCoreShape!.moveTo(0, lowerWallBase);
    for (let i = 1; i <= steps; i++) {
      const x = i * stepW;
      const rawOsc =
        Math.cos(timeSec * 18 + i * 0.85) * (18 + frequency.low * 34) * -microPolarity;
      this.waveGlowShape!.lineTo(x, lowerWallBase + rawOsc);
      this.waveCoreShape!.lineTo(x, lowerWallBase + rawOsc);
    }

    // Center phase guide rails (+A / -A)
    this.waveGlowShape!
      .moveTo(0, topLaneY)
      .lineTo(width, topLaneY)
      .moveTo(0, bottomLaneY)
      .lineTo(width, bottomLaneY);

    this.waveGlowShape!.stroke({ width: 5, color: [mr, mg, mb, 110] });
    this.waveCoreShape!.stroke({ width: 2.5, color: [255, 255, 255, 235] });

    // Micro Phase Barriers & Resonance Pulses
    this.trapsShape!.reset();
    this.portalsShape!.reset();
    let hasBarriers = false;
    let hasPulses = false;

    for (const gate of microGates) {
      const sx = gate.worldX - cameraX;
      if (sx < -60 || sx > width + 60) continue;

      const dangerY = gate.safePolarity === -1 ? bottomLaneY : topLaneY;
      const safeY = gate.safePolarity === -1 ? topLaneY : bottomLaneY;

      if (!gate.hit) {
        this.trapsShape!.appendRect(sx - 14, dangerY - 38, 28, 76, { rx: 6, ry: 6 });
        hasBarriers = true;
      }
      if (!gate.passed) {
        this.portalsShape!.appendCircle(sx, safeY, 14, 14);
        hasPulses = true;
      }
    }

    if (hasBarriers) {
      this.trapsShape!.fill(255, 45, 95, 225).stroke({ width: 2, color: [255, 200, 210, 255] });
    }
    if (hasPulses) {
      this.portalsShape!.fill(mr, mg, mb, 210).stroke({ width: 2, color: [255, 255, 255, 255] });
    }
  }

  /**
   * Draws the form polygon. With `auraOnly`, only a larger translucent glow is drawn
   * (used behind the crewmate so the active resonance form stays readable).
   */
  private drawPlayerPolygon(
    cx: number,
    cy: number,
    radius: number,
    rotation: number,
    form: ResonanceFormType,
    alphaRatio: number,
    auraOnly: boolean = false
  ): void {
    const [r, g, b] = FORM_CONFIG[form].rgb;
    const alpha = Math.floor(255 * alphaRatio);

    this.playerGlowShape!.reset();
    this.playerCoreShape!.reset();

    if (auraOnly) {
      this.appendPolygonPath(this.playerGlowShape!, cx, cy, radius * 1.45, rotation, form);
      this.playerGlowShape!
        .fill(r, g, b, Math.floor(70 * alphaRatio))
        .stroke({ width: 2, color: [r, g, b, Math.floor(200 * alphaRatio)] });
      return;
    }

    this.appendPolygonPath(this.playerGlowShape!, cx, cy, radius * 1.28, rotation, form);
    this.playerGlowShape!.fill(r, g, b, Math.floor(90 * alphaRatio));

    this.appendPolygonPath(this.playerCoreShape!, cx, cy, radius, rotation, form);
    this.playerCoreShape!
      .fill(r, g, b, alpha)
      .stroke({ width: 2.5, color: [255, 255, 255, alpha] });
  }

  private appendPolygonPath(
    shape: TvgShape,
    cx: number,
    cy: number,
    radius: number,
    rotation: number,
    form: ResonanceFormType
  ): void {
    if (form === 'bass') {
      for (let i = 0; i < 6; i++) {
        const angle = rotation + (i * Math.PI) / 3;
        const vx = cx + Math.cos(angle) * radius;
        const vy = cy + Math.sin(angle) * radius;
        if (i === 0) shape.moveTo(vx, vy);
        else shape.lineTo(vx, vy);
      }
      shape.close();
    } else if (form === 'synth') {
      const pts: Array<[number, number]> = [
        [radius * 1.35, 0],
        [0, radius * 0.85],
        [-radius * 1.15, 0],
        [0, -radius * 0.85],
      ];
      pts.forEach(([lx, ly], idx) => {
        const cos = Math.cos(rotation);
        const sin = Math.sin(rotation);
        const vx = cx + lx * cos - ly * sin;
        const vy = cy + lx * sin + ly * cos;
        if (idx === 0) shape.moveTo(vx, vy);
        else shape.lineTo(vx, vy);
      });
      shape.close();
    } else {
      const pts: Array<[number, number]> = [
        [radius * 1.45, 0],
        [-radius * 1.0, radius * 0.82],
        [-radius * 0.45, 0],
        [-radius * 1.0, -radius * 0.82],
      ];
      pts.forEach(([lx, ly], idx) => {
        const cos = Math.cos(rotation);
        const sin = Math.sin(rotation);
        const vx = cx + lx * cos - ly * sin;
        const vy = cy + lx * sin + ly * cos;
        if (idx === 0) shape.moveTo(vx, vy);
        else shape.lineTo(vx, vy);
      });
      shape.close();
    }
  }

  /**
   * Marks the renderer disposed immediately (all draw calls become no-ops) and
   * releases WASM resources through the engine queue, after any pending init().
   */
  public destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    void enqueueEngineJob(() => {
      for (const obj of this.ownedObjects) {
        try {
          obj.dispose();
        } catch (err) {
          console.warn('ThorVG object dispose failed:', err);
        }
      }
      this.ownedObjects = [];
      try {
        this.canvas?.destroy();
      } catch (err) {
        console.warn('ThorVG canvas destroy failed:', err);
      }
      try {
        this.tvg?.term();
      } catch (err) {
        console.warn('ThorVG term failed:', err);
      }
      this.canvas = null;
      this.tvg = null;
    });
  }
}
