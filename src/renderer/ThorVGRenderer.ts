import ThorVG, {
  type ThorVGNamespace,
  type Animation as TvgAnimation,
  type AnimationInfo,
  type Canvas as TvgCanvas,
} from '@thorvg/webcanvas';
import wasmUrl from '@thorvg/webcanvas/dist/thorvg.wasm?url';
import splashLottie from '../logo/powred.by.thorvg.1.json?raw';
import crewmateLottie from '../asset/Loading 50 _ Among Us.json?raw';
import {
  FORM_CONFIG,
  type RendererMode,
  type ResonanceFormType,
  type RenderFrameState,
} from '../types/game';
import { buildCharacterMatrix } from './characterMatrix';
import { renderMacroWorldPass } from './passes/macroWorldPass';
import { renderMicroTunnelPass } from './passes/microTunnelPass';
import { appendPolygonPath, drawPlayerPolygon } from './passes/playerGeometry';
import { renderMenuPreviewPass } from './passes/previewPass';
import type { TvgShapePool } from './passes/shapePool';
import { prepareSplashLottie } from './splashLottie';

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
 * over all 27 frames, measured by rendering each frame with ThorVG SwCanvas.
 */
const CREW_BOX: ContentBox = { x: 181, y: 169, width: 145, height: 192 };

/**
 * ThorVG WebAssembly Vector Graphics Lifecycle Facade:
 * - Owns WASM module serialization (`enqueueEngineJob`), explicit `ownedObjects` disposal,
 *   pooled `TvgShapePool` creation in Painter's-Algorithm z-order, and Lottie animations
 * - Delegates stateless 60fps vector geometry passes to `passes/*`
 */
export class ThorVGRenderer {
  private tvg: ThorVGNamespace | null = null;
  private canvas: TvgCanvas | null = null;
  private shapes: TvgShapePool | null = null;
  private readonly mode: RendererMode;
  private width: number = 1280;
  private height: number = 720;
  private disposed: boolean = false;

  /**
   * Every WASM object this renderer creates. Disposed explicitly before `term()` so
   * FinalizationRegistry never frees an older module's pointer on a newer WASM heap.
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

  public async init(
    canvasElement: HTMLCanvasElement,
    width: number,
    height: number
  ): Promise<void> {
    this.width = width;
    this.height = height;

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

      const shapes: TvgShapePool = {
        bg: new TVG.Shape(),
        grid: new TVG.Shape(),
        waveFill: new TVG.Shape(),
        spectrum: new TVG.Shape(),
        waveGlow: new TVG.Shape(),
        waveCore: new TVG.Shape(),
        platforms: new TVG.Shape(),
        gimmicks: new TVG.Shape(),
        timingRings: new TVG.Shape(),
        orbs: new TVG.Shape(),
        traps: new TVG.Shape(),
        portals: new TVG.Shape(),
        effects: new TVG.Shape(),
        playerGlow: new TVG.Shape(),
        playerCore: new TVG.Shape(),
        particles: new TVG.Shape(),
      };
      this.shapes = shapes;

      this.ownedObjects.push(
        shapes.bg,
        shapes.grid,
        shapes.waveFill,
        shapes.spectrum,
        shapes.waveGlow,
        shapes.waveCore,
        shapes.platforms,
        shapes.gimmicks,
        shapes.timingRings,
        shapes.orbs,
        shapes.traps,
        shapes.portals,
        shapes.effects,
        shapes.playerGlow,
        shapes.playerCore,
        shapes.particles
      );

      this.canvas
        .add(shapes.bg)
        .add(shapes.grid)
        .add(shapes.waveFill)
        .add(shapes.spectrum)
        .add(shapes.waveGlow)
        .add(shapes.waveCore)
        .add(shapes.platforms)
        .add(shapes.gimmicks)
        .add(shapes.timingRings)
        .add(shapes.orbs)
        .add(shapes.traps)
        .add(shapes.portals)
        .add(shapes.effects)
        .add(shapes.playerGlow)
        .add(shapes.playerCore);

      // Character draws above its aura and below particles.
      this.loadCrewmate(TVG);
      this.canvas.add(shapes.particles);

      // Added last so it draws above everything while active.
      this.loadSplash(TVG);
    });
  }

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

  private clearGameplayLayers(): void {
    const shapes = this.shapes;
    if (!shapes) return;
    shapes.bg.reset().appendRect(0, 0, this.width, this.height).fill(0, 0, 0, 255);
    shapes.grid.reset();
    shapes.waveFill.reset();
    shapes.spectrum.reset();
    shapes.waveGlow.reset();
    shapes.waveCore.reset();
    shapes.platforms.reset();
    shapes.gimmicks.reset();
    shapes.timingRings.reset();
    shapes.orbs.reset();
    shapes.traps.reset();
    shapes.portals.reset();
    shapes.effects.reset();
    shapes.playerGlow.reset();
    shapes.playerCore.reset();
    shapes.particles.reset();
    this.hideCrewmate();
  }

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

  public renderPreviewFrame(
    timeSec: number,
    previewForm: ResonanceFormType = 'synth',
    previewSpeedPxPerSec: number = 550
  ): void {
    if (!this.canvas || !this.tvg || !this.shapes || this.disposed) return;

    const { playerX, playerY, runCycle } = renderMenuPreviewPass(
      this.shapes,
      this.width,
      this.height,
      timeSec,
      previewForm,
      previewSpeedPxPerSec
    );

    if (this.crewAnim) {
      const heightPx = 24 * CREW_HEIGHT_RATIO;
      const cy = playerY + 24 - heightPx / 2;
      drawPlayerPolygon(
        this.shapes.playerGlow,
        this.shapes.playerCore,
        playerX,
        cy,
        24,
        0,
        previewForm,
        1.0,
        true
      );
      this.drawCrewmate(playerX, cy, heightPx, 0, 1, runCycle, 255);
    } else {
      drawPlayerPolygon(
        this.shapes.playerGlow,
        this.shapes.playerCore,
        playerX,
        playerY,
        24,
        timeSec * 1.2,
        previewForm,
        1.0
      );
    }

    this.canvas.update().render();
  }

  public renderGameFrame(state: RenderFrameState): void {
    if (!this.canvas || !this.tvg || !this.shapes || this.disposed) return;

    const shapes = this.shapes;
    const { width, height, phase, activeForm, frequency } = state;
    const [fr, fg, fb] = FORM_CONFIG[activeForm].rgb;

    const zoom = state.zoomScale;
    const fx = state.focalScreenX;
    const fy = state.focalScreenY;
    const tx = (x: number) => (zoom === 1 ? x : fx + (x - fx) * zoom);
    const ty = (y: number) => (zoom === 1 ? y : fy + (y - fy) * zoom);
    const ts = (s: number) => s * Math.min(zoom, 8);

    // 1. Background
    const pulseBoost = Math.floor((frequency.low * 0.6 + (state.beatPulse ?? 0) * 0.5) * 28);
    if (phase === 'MICRO') {
      const [mr, mg, mb] = FORM_CONFIG[state.divingTargetForm].rgb;
      shapes.bg
        .reset()
        .appendRect(0, 0, width, height)
        .fill(
          Math.min(45, 8 + Math.floor(mr * 0.12)),
          Math.min(45, 8 + Math.floor(mg * 0.12)),
          Math.min(55, 16 + Math.floor(mb * 0.14)),
          255
        );
    } else {
      shapes.bg
        .reset()
        .appendRect(0, 0, width, height)
        .fill(
          7 + Math.floor(pulseBoost * 0.5),
          9 + Math.floor(pulseBoost * 0.3),
          20 + pulseBoost,
          255
        );
    }

    // 2. Dynamic Speed Grid
    shapes.grid.reset();
    const gridStep = 80;
    const offsetX = -(((state.cameraX % gridStep) + gridStep) % gridStep);
    for (let x = offsetX; x <= width; x += gridStep) {
      const sx = tx(x);
      if (sx >= -20 && sx <= width + 20) {
        shapes.grid.moveTo(sx, 0).lineTo(sx, height);
      }
    }
    for (let y = 90; y < height; y += gridStep) {
      const sy = ty(y);
      if (sy >= -20 && sy <= height + 20) {
        shapes.grid.moveTo(0, sy).lineTo(width, sy);
      }
    }
    shapes.grid.stroke({
      width: 1,
      color: phase === 'MICRO' ? [fr, fg, fb, 65] : [40, 65, 110, 82],
    });

    if (phase === 'MICRO') {
      renderMicroTunnelPass(shapes, state);
    } else {
      renderMacroWorldPass(shapes, state, tx, ty, ts);
    }

    // 3. Shockwaves, Afterimage Trails & High-Speed Sprint Lines
    shapes.effects.reset();
    let hasEffects = false;
    for (const sw of state.shockwaves) {
      shapes.effects.appendCircle(tx(sw.x), ty(sw.y), ts(sw.radius), ts(sw.radius));
      hasEffects = true;
    }
    for (const ai of state.afterimages) {
      appendPolygonPath(
        shapes.effects,
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
        shapes.effects.moveTo(lx, ly).lineTo(lx + len, ly);
        hasEffects = true;
      }
    }
    if (hasEffects) {
      shapes.effects.stroke({ width: 2.5, color: [fr, fg, fb, 185] });
    }

    // 4. Player Character (Crewmate Lottie + Resonance Aura, or Form Polygon fallback)
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
      drawPlayerPolygon(
        shapes.playerGlow,
        shapes.playerCore,
        cx,
        cy,
        pr,
        rotation,
        activeForm,
        isInvulnerable ? 0.55 : 1.0,
        true
      );
      const blink = isInvulnerable && Math.floor(state.timeSec * 12) % 2 === 0;
      this.drawCrewmate(cx, cy, heightPx, rotation, flip, state.runCycleTime, blink ? 90 : 255);
    } else {
      drawPlayerPolygon(
        shapes.playerGlow,
        shapes.playerCore,
        px,
        py,
        pr,
        state.playerRotation,
        activeForm,
        isInvulnerable ? 0.55 : 1.0
      );
    }

    // 5. Vector Particles
    shapes.particles.reset();
    for (const pt of state.particles) {
      const rad = Math.max(1.5, pt.radius);
      shapes.particles.appendCircle(tx(pt.x), ty(pt.y), rad, rad);
    }
    if (state.particles.length > 0) {
      shapes.particles.fill(fr, fg, fb, 215);
    }

    this.canvas.update().render();
  }

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
      this.shapes = null;
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
