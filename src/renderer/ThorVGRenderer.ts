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
import { resetWorldShapeLayers, type TvgShapePool } from './passes/shapePool';
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
        evenOddRule: TVG.FillRule.EvenOdd,
        bg: new TVG.Shape(),
        aurora: new TVG.Shape(),
        grid: new TVG.Shape(),
        waveFill: new TVG.Shape(),
        spectrum: new TVG.Shape(),
        waveGlow: new TVG.Shape(),
        waveCore: new TVG.Shape(),
        bandBass: new TVG.Shape(),
        bandSynth: new TVG.Shape(),
        bandTreble: new TVG.Shape(),
        gimmicks: new TVG.Shape(),
        prismStars: new TVG.Shape(),
        timingRings: new TVG.Shape(),
        traps: new TVG.Shape(),
        portals: new TVG.Shape(),
        effects: new TVG.Shape(),
        playerGlow: new TVG.Shape(),
        playerCore: new TVG.Shape(),
        vfxGold: new TVG.Shape(),
        vfxCyan: new TVG.Shape(),
        vfxCrimson: new TVG.Shape(),
      };
      this.shapes = shapes;

      // Configure hardware/software additive neon bloom (`BlendMethod.Add`) once at init (zero per-frame alloc!)
      const addBlend = TVG.BlendMethod.Add;
      shapes.aurora.blend(addBlend);
      shapes.waveGlow.blend(addBlend);
      shapes.timingRings.blend(addBlend);
      shapes.playerGlow.blend(addBlend);
      shapes.vfxGold.blend(addBlend);
      shapes.vfxCyan.blend(addBlend);
      shapes.vfxCrimson.blend(addBlend);

      this.ownedObjects.push(
        shapes.bg,
        shapes.aurora,
        shapes.grid,
        shapes.waveFill,
        shapes.spectrum,
        shapes.waveGlow,
        shapes.waveCore,
        shapes.bandBass,
        shapes.bandSynth,
        shapes.bandTreble,
        shapes.gimmicks,
        shapes.prismStars,
        shapes.timingRings,
        shapes.traps,
        shapes.portals,
        shapes.effects,
        shapes.playerGlow,
        shapes.playerCore,
        shapes.vfxGold,
        shapes.vfxCyan,
        shapes.vfxCrimson
      );

      this.canvas
        .add(shapes.bg)
        .add(shapes.aurora)
        .add(shapes.grid)
        .add(shapes.waveFill)
        .add(shapes.spectrum)
        .add(shapes.waveGlow)
        .add(shapes.waveCore)
        .add(shapes.bandBass)
        .add(shapes.bandSynth)
        .add(shapes.bandTreble)
        .add(shapes.gimmicks)
        .add(shapes.prismStars)
        .add(shapes.timingRings)
        .add(shapes.traps)
        .add(shapes.portals)
        .add(shapes.effects)
        .add(shapes.playerGlow)
        .add(shapes.playerCore);

      // Character draws above its aura and below multi-color additive VFX shards.
      this.loadCrewmate(TVG);
      this.canvas
        .add(shapes.vfxGold)
        .add(shapes.vfxCyan)
        .add(shapes.vfxCrimson);

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
    resetWorldShapeLayers(shapes);
    shapes.effects.reset();
    shapes.playerGlow.reset();
    shapes.playerCore.reset();
    shapes.vfxGold.reset();
    shapes.vfxCyan.reset();
    shapes.vfxCrimson.reset();
    this.hideCrewmate();
  }

  /**
   * Immediately resets all 21 pooled TvgShape layers, hides character/splash pictures,
   * fills an opaque #070914 background, and flushes the canvas so zero menu/scene
   * remnants survive across screen transitions.
   */
  public clearForTransition(): void {
    if (!this.canvas || !this.tvg || !this.shapes || this.disposed) return;
    const shapes = this.shapes;
    shapes.bg.reset().appendRect(0, 0, this.width, this.height).fill(7, 9, 20, 255);
    shapes.grid.reset();
    resetWorldShapeLayers(shapes);
    shapes.effects.reset();
    shapes.playerGlow.reset();
    shapes.playerCore.reset();
    shapes.vfxGold.reset();
    shapes.vfxCyan.reset();
    shapes.vfxCrimson.reset();
    this.hideCrewmate();
    if (!this.splashActive && this.splashAnim?.picture) {
      this.splashAnim.picture.visible(false);
    }
    this.canvas.update().render();
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
        if (!this.disposed) {
          picture.visible(false);
          try {
            this.canvas?.remove(picture);
          } catch {
            // Ignore if already detached from scene
          }
        }
        this.splashAnim = null;
        this.splashInfo = null;
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
    const sxOff = state.shakeX ?? 0;
    const syOff = state.shakeY ?? 0;
    const tx = (x: number) => (zoom === 1 ? x : fx + (x - fx) * zoom) + sxOff;
    const ty = (y: number) => (zoom === 1 ? y : fy + (y - fy) * zoom) + syOff;
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

    // 3. Afterimage Trails, Speed Lines (`effects`) & 3-Color Additive Shockwaves + Diamond Shards (`vfx*`)
    shapes.effects.reset();
    shapes.vfxGold.reset();
    shapes.vfxCyan.reset();
    shapes.vfxCrimson.reset();

    let hasEffects = false;
    let hasGold = false;
    let hasCyan = false;
    let hasCrimson = false;

    const pickVfxBucket = (rgb: [number, number, number]) => {
      if (rgb[0] >= 200 && rgb[1] >= 180) {
        hasGold = true;
        return shapes.vfxGold;
      }
      if (rgb[2] >= 180 && rgb[0] < 160) {
        hasCyan = true;
        return shapes.vfxCyan;
      }
      hasCrimson = true;
      return shapes.vfxCrimson;
    };

    for (const sw of state.shockwaves) {
      const target = pickVfxBucket(sw.color);
      const rOuter = ts(sw.radius);
      const rInner = Math.max(2, rOuter - ts(3.2));
      // Append thin ring path so fill() paints both shockwaves & diamond shards in one additive pass!
      target.appendCircle(tx(sw.x), ty(sw.y), rOuter, rOuter);
      target.appendCircle(tx(sw.x), ty(sw.y), rInner, rInner);
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
    const isOverdrive = Boolean(state.overdriveActive);
    if (isOverdrive || surfMomentum > 0.38 || state.isDashing || state.isGrinding) {
      const lineCount = isOverdrive
        ? 12
        : state.isDashing
          ? 9
          : state.isGrinding
            ? 7
            : Math.floor(surfMomentum * 7);
      for (let i = 0; i < lineCount; i++) {
        const seed = (i * 197 + Math.floor(state.timeSec * 22)) % 100;
        const lx =
          ((width - ((state.timeSec * 1550 + i * 230) % (width + 260))) + width) % width;
        const ly = i % 2 === 0 ? 45 + (seed % 140) : height - 55 - (seed % 140);
        const len = 70 + surfMomentum * 115;
        shapes.effects.moveTo(lx, ly).lineTo(lx + len, ly);
        hasEffects = true;
      }
    }
    if (hasEffects) {
      shapes.effects.stroke({
        width: isOverdrive ? 3.0 : 2.4,
        color: isOverdrive ? [255, 232, 95, 210] : [fr, fg, fb, 185],
      });
    }

    // 4. Player Character (Crewmate Lottie + Resonance Aura & Sacred Combo Halo, or Form Polygon fallback)
    const isInvulnerable = state.invulnerableTimer > 0 && !isOverdrive;
    const px = tx(state.playerScreenX);
    const py = ty(state.playerScreenY);
    const pr = ts(state.playerRadius);
    const combo = state.combo ?? 1;
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
        true,
        combo,
        state.timeSec,
        isOverdrive
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
        isInvulnerable ? 0.55 : 1.0,
        false,
        combo,
        state.timeSec,
        isOverdrive
      );
    }

    // 5. Crisp 4-Point Vector Diamond Shards routed into 3-Color Additive VFX Buckets
    for (const pt of state.particles) {
      const target = pickVfxBucket(pt.color);
      const rad = Math.max(2.0, pt.radius * 1.25);
      const sx = tx(pt.x);
      const sy = ty(pt.y);
      target
        .moveTo(sx, sy - rad * 1.35)
        .lineTo(sx + rad, sy)
        .lineTo(sx, sy + rad * 1.35)
        .lineTo(sx - rad, sy)
        .close();
    }
    if (hasGold) {
      shapes.vfxGold
        .fillRule(shapes.evenOddRule)
        .fill(255, 230, 65, 220)
        .stroke({ width: 1.4, color: [255, 250, 190, 235] });
    }
    if (hasCyan) {
      shapes.vfxCyan
        .fillRule(shapes.evenOddRule)
        .fill(5, 213, 255, 220)
        .stroke({ width: 1.4, color: [195, 248, 255, 235] });
    }
    if (hasCrimson) {
      shapes.vfxCrimson
        .fillRule(shapes.evenOddRule)
        .fill(255, 45, 108, 220)
        .stroke({ width: 1.4, color: [255, 200, 220, 235] });
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
