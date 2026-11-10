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
import {
  FORM_CONFIG,
  type BeatTrap,
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

  /** Loads the splash Lottie. On failure the splash is skipped (playSplash resolves at once). */
  private loadSplash(TVG: ThorVGNamespace): void {
    try {
      const anim = new TVG.Animation();
      this.ownedObjects.push(anim);
      anim.load(splashLottie);
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

  /** Fits the 16:9 splash into the viewport (contain) and centers it. */
  private layoutSplash(): void {
    const picture = this.splashAnim?.picture;
    if (!picture) return;
    const srcW = 1920;
    const srcH = 1080;
    const scale = Math.min(this.width / srcW, this.height / srcH);
    picture.size(srcW * scale, srcH * scale);
    picture.translate((this.width - srcW * scale) / 2, (this.height - srcH * scale) / 2);
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
   * Renders an animated vector preview for the Start Menu / Renderer Verification.
   */
  public renderPreviewFrame(timeSec: number, previewForm: ResonanceFormType = 'synth'): void {
    if (!this.canvas || !this.tvg || this.disposed) return;
    const { width, height } = this;
    const formCfg = FORM_CONFIG[previewForm];
    const [r, g, b] = formCfg.rgb;

    // 1. Deep cyber background
    this.bgShape!.reset().appendRect(0, 0, width, height).fill(9, 11, 22, 255);

    // 2. Perspective neon grid
    this.gridShape!.reset();
    const gridSpacing = 64;
    const scrollOffset = (timeSec * 120) % gridSpacing;
    for (let x = -scrollOffset; x <= width; x += gridSpacing) {
      this.gridShape!.moveTo(x, 0).lineTo(x, height);
    }
    for (let y = 80; y < height; y += gridSpacing) {
      this.gridShape!.moveTo(0, y).lineTo(width, y);
    }
    this.gridShape!.stroke({ width: 1, color: [35, 55, 95, 110] });

    // 3. Animated Cubic Bezier Audio Waveform & Sub-Wave Spectrum Bars
    const baseFloorY = height * 0.66;
    const segCount = 8;
    const segWidth = width / segCount;

    this.waveFillShape!.reset().moveTo(0, height).lineTo(0, baseFloorY);
    this.spectrumShape!.reset();
    this.waveGlowShape!.reset().moveTo(0, baseFloorY);
    this.waveCoreShape!.reset().moveTo(0, baseFloorY);
    this.orbsShape!.reset();

    let prevY = baseFloorY;
    for (let i = 0; i < segCount; i++) {
      const x0 = i * segWidth;
      const x1 = (i + 1) * segWidth;
      const amp1 = Math.sin(timeSec * 3.4 + i * 1.3) * 68;
      const amp2 = Math.cos(timeSec * 2.8 + (i + 1) * 1.1) * 68;
      const y1 = baseFloorY + Math.sin(timeSec * 2.4 + (i + 1) * 1.1) * 56;

      const cx1 = x0 + segWidth * 0.35;
      const cy1 = prevY + amp1;
      const cx2 = x0 + segWidth * 0.65;
      const cy2 = y1 + amp2;

      this.waveFillShape!.cubicTo(cx1, cy1, cx2, cy2, x1, y1);
      this.waveGlowShape!.cubicTo(cx1, cy1, cx2, cy2, x1, y1);
      this.waveCoreShape!.cubicTo(cx1, cy1, cx2, cy2, x1, y1);

      // Sub-wave spectrum bars
      const barW = Math.max(6, segWidth * 0.24);
      const midWaveY = (prevY + y1) * 0.5 + 16;
      const barH = Math.max(24, (height - midWaveY) * (0.45 + 0.35 * Math.sin(timeSec * 4 + i)));
      this.spectrumShape!.appendRect(x0 + segWidth * 0.38, height - barH, barW, barH, { rx: 3, ry: 3 });

      // Preview rhythm orbs along the wave
      const orbX = (x0 + x1) * 0.5;
      const orbY = (prevY + y1) * 0.5 - 30;
      this.orbsShape!.appendCircle(orbX, orbY, 7, 7);

      prevY = y1;
    }

    this.waveFillShape!.lineTo(width, height).close().fill(r, g, b, 36);
    this.spectrumShape!.fill(r, g, b, 68);
    this.waveGlowShape!.stroke({ width: 10, color: [r, g, b, 92] });
    this.waveCoreShape!.stroke({ width: 3.5, color: [255, 255, 255, 240] });
    this.orbsShape!.fill(r, g, b, 210).stroke({ width: 2, color: [255, 255, 255, 240] });

    // Clear unused gameplay shapes in preview
    this.trapsShape!.reset();
    this.portalsShape!.reset();
    this.effectsShape!.reset();
    this.particlesShape!.reset();

    // 4. Preview Resonance Polygon Character
    const playerX = width * 0.25;
    const playerY = baseFloorY - 48 + Math.sin(timeSec * 4.5) * 14;
    if (this.crewAnim) {
      this.drawPlayerPolygon(playerX, playerY, 26, timeSec * 1.2, previewForm, 1.0, true);
      this.drawCrewmate(playerX, playerY - 26 * 0.3, 26 * CREW_HEIGHT_RATIO, 0, 1, timeSec, 255);
    } else {
      this.drawPlayerPolygon(playerX, playerY, 26, timeSec * 1.2, previewForm, 1.0);
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

    // Transform helper for Infinite Zoom around the focal point (Origin Rebasing aware)
    const zoom = state.zoomScale;
    const fx = state.focalScreenX;
    const fy = state.focalScreenY;
    const tx = (x: number) => (zoom === 1 ? x : fx + (x - fx) * zoom);
    const ty = (y: number) => (zoom === 1 ? y : fy + (y - fy) * zoom);
    const ts = (s: number) => s * Math.min(zoom, 8);

    // 1. Background
    const bgPulse = Math.floor(frequency.low * 24);
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
        .fill(7 + Math.floor(bgPulse * 0.5), 9 + Math.floor(bgPulse * 0.3), 20 + bgPulse, 255);
    }

    // 2. Dynamic Grid & Frequency Pillars
    this.gridShape!.reset();
    const gridStep = 80;
    const offsetX = -(state.cameraX % gridStep);
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
      color: phase === 'MICRO' ? [fr, fg, fb, 65] : [40, 65, 110, 85],
    });

    if (phase === 'MICRO') {
      this.renderMicroTunnel(state);
    } else {
      this.renderMacroWorld(state, tx, ty, ts);
    }

    // 3. Render Shockwaves, Afterimage Effects & High-Speed Surf Lines
    this.effectsShape!.reset();
    let hasEffects = false;
    for (const sw of state.shockwaves) {
      this.effectsShape!.appendCircle(tx(sw.x), ty(sw.y), ts(sw.radius), ts(sw.radius));
      hasEffects = true;
    }
    for (const ai of state.afterimages) {
      this.appendPolygonPath(this.effectsShape!, tx(ai.x), ty(ai.y), ts(state.playerRadius * 0.85), ai.rotation, ai.form);
      hasEffects = true;
    }
    const surfMomentum = state.surfMomentum ?? 0;
    if (surfMomentum > 0.42 || state.isDashing) {
      const lineCount = state.isDashing ? 8 : Math.floor(surfMomentum * 7);
      for (let i = 0; i < lineCount; i++) {
        const seed = (i * 197 + Math.floor(state.timeSec * 22)) % 100;
        const lx = ((width - ((state.timeSec * 1450 + i * 230) % (width + 260))) + width) % width;
        const ly = i % 2 === 0 ? 45 + (seed % 140) : height - 55 - (seed % 140);
        const len = 65 + surfMomentum * 95;
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
      const height = pr * CREW_HEIGHT_RATIO;
      const cx = px;
      let cy: number;
      let rotation = 0;
      let flip: 1 | -1 = 1;
      if (phase === 'MICRO') {
        // Phase Invert: feet on the active rail, body toward the tunnel center.
        flip = state.microPolarity === -1 ? -1 : 1;
        cy = py + (flip === -1 ? height / 2 : -height / 2);
      } else {
        // Feet rest on the engine's landing line (playerY + playerRadius).
        rotation = state.playerRotation;
        cy = py + pr - height / 2;
      }
      // Aura is centered on the drawn character (in Micro View it is offset from the rail).
      this.drawPlayerPolygon(cx, cy, pr, rotation, activeForm, isInvulnerable ? 0.55 : 1.0, true);
      const blink = isInvulnerable && Math.floor(state.timeSec * 12) % 2 === 0;
      this.drawCrewmate(cx, cy, height, rotation, flip, state.runCycleTime, blink ? 90 : 255);
    } else {
      this.drawPlayerPolygon(px, py, pr, state.playerRotation, activeForm, isInvulnerable ? 0.55 : 1.0);
    }

    // 5. Render Vector Particles
    this.particlesShape!.reset();
    for (const pt of state.particles) {
      this.particlesShape!.appendCircle(tx(pt.x), ty(pt.y), Math.max(1.5, pt.radius), Math.max(1.5, pt.radius));
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
    this.orbsShape!.reset();

    if (segments.length > 0) {
      const first = segments[0]!;
      const startX = tx(first.x0 - cameraX);
      const startY = ty(first.y0);
      const harmonicOffset = ts(32 + frequency.mid * 24);

      this.waveFillShape!.moveTo(startX, height).lineTo(startX, startY);
      this.waveGlowShape!.moveTo(startX, startY);
      this.waveCoreShape!.moveTo(startX, startY);
      this.spectrumShape!.moveTo(startX, startY + harmonicOffset);

      let endX = startX;
      for (const seg of segments) {
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

        // Secondary harmonic echo ribbon beneath main wave
        this.spectrumShape!.cubicTo(
          cx1,
          cy1 + harmonicOffset,
          cx2,
          cy2 + harmonicOffset,
          x1,
          y1 + harmonicOffset
        );

        // Pre-computed audio spectrum pillar inside the wave body
        if (x1 >= -20 && x0 <= width + 20) {
          const spanW = Math.max(8, x1 - x0);
          const barW = Math.max(4, spanW * 0.28);
          const segEnergy = seg.overall ?? frequency.overall;
          const midWaveY = Math.max(y0, y1) + ts(10);
          const maxBarSpace = Math.max(16, height - midWaveY);
          const barH = Math.min(maxBarSpace, maxBarSpace * (0.28 + segEnergy * 0.68));
          if (barH > 8) {
            this.spectrumShape!.appendRect(
              x0 + (spanW - barW) * 0.5,
              height - barH,
              barW,
              barH,
              { rx: 3, ry: 3 }
            );
          }
        }

        endX = x1;
      }

      const fillAlpha = isDrop ? 54 : 38;
      const glowWidth = ts(isDrop || frequency.isBeat ? 12.5 : 9);
      const glowAlpha = isDrop || frequency.isBeat ? 135 : 95;

      this.waveFillShape!.lineTo(Math.max(width, endX), height).close().fill(fr, fg, fb, fillAlpha);
      this.spectrumShape!
        .fill(fr, fg, fb, isDrop ? 78 : 54)
        .stroke({ width: ts(1.8), color: [sr, sg, sb, 130] });
      this.waveGlowShape!.stroke({ width: glowWidth, color: [fr, fg, fb, glowAlpha] });
      this.waveCoreShape!.stroke({ width: ts(3.2), color: [255, 255, 255, 245] });
    }

    // Rhythm Resonance Orbs (along the wave contour & airborne Crest Launch arcs)
    const orbs = state.orbs ?? [];
    let hasOrbs = false;
    for (const orb of orbs) {
      if (orb.collected) continue;
      const ox = tx(orb.worldX - cameraX);
      if (ox < -40 || ox > width + 40) continue;
      const oy = ty(orb.screenY ?? orb.worldY);
      const pulse = 1 + Math.sin(state.timeSec * 8 + orb.id * 0.7) * 0.14;
      const rad = ts(orb.radius * pulse);

      if (orb.isArcOrb) {
        // Diamond star for airborne Crest Launch arc orbs
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
    }
    if (hasOrbs) {
      this.orbsShape!
        .fill(sr, sg, sb, 225)
        .stroke({ width: ts(2.2), color: [255, 255, 255, 250] });
    }

    // Beat Traps (Spikes on the waveform)
    this.trapsShape!.reset();
    let hasTraps = false;
    for (const trap of traps) {
      if (trap.destroyed) continue;
      const sx = tx(trap.worldX - cameraX);
      if (sx < -60 || sx > width + 60) continue;
      // Floor height is attached to trap's dynamic y stored in width/height context by GameEngine
      const baseY = ty((trap as BeatTrap & { screenFloorY?: number }).screenFloorY ?? height * 0.68);
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
      this.trapsShape!.fill(255, 50, 95, 230).stroke({ width: 2, color: [255, 210, 220, 255] });
    }

    // Frequency Diving Nodes (Portals)
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
    const { width, height, timeSec, divingTargetForm, frequency, microGates, cameraX, microPolarity } = state;
    const [mr, mg, mb] = FORM_CONFIG[divingTargetForm].rgb;

    const topLaneY = height * 0.34;
    const bottomLaneY = height * 0.66;
    const steps = 24;
    const stepW = width / steps;

    this.waveFillShape!.reset();
    this.spectrumShape!.reset();
    this.waveGlowShape!.reset();
    this.waveCoreShape!.reset();
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

      // Danger barrier is on the opposite polarity lane of safePolarity
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
      // Bass Form: Heavy Hexagonal Armor Polygon (6 vertices)
      for (let i = 0; i < 6; i++) {
        const angle = rotation + (i * Math.PI) / 3;
        const vx = cx + Math.cos(angle) * radius;
        const vy = cy + Math.sin(angle) * radius;
        if (i === 0) shape.moveTo(vx, vy);
        else shape.lineTo(vx, vy);
      }
      shape.close();
    } else if (form === 'synth') {
      // Synth Form: Streamlined Diamond Polygon (4 stretched vertices)
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
      // Treble Form: Sharp Triangular Arrowhead (Dart polygon)
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
      // Order matters (both steps must happen before term(), see `ownedObjects`):
      // 1) Drop our references while the canvas and its WebGL context are still alive.
      //    The main scene still holds each paint, so nothing is freed yet.
      // 2) canvas.destroy() clears the scene, which frees the paints with a valid context.
      //    Disposing after destroy() would free into a deleted GL context and throw.
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
