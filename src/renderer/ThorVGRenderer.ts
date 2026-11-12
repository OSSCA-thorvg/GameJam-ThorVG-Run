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
import {
  CREWMATE_SKIN_CONFIG,
  FORM_CONFIG,
  type CrewmateSkinId,
  type RendererMode,
  type ResonanceFormType,
  type RenderFrameState,
} from '../types/game';
import { buildCharacterMatrix } from './characterMatrix';
import { renderMacroWorldPass } from './passes/macroWorldPass';
import {
  appendSkinAfterimagePath,
  drawCrewmateSkinOrnaments,
  drawPlayerPolygon,
} from './passes/playerGeometry';
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
 * Appends a razor-sharp 3rd-order Bezier tapered vector blade (zero thickness at both tips
 * `P0` and `P1`, arched mid-body along `curveBend`) with consistent NonZero winding so
 * intersecting `'cross'` / `'slam'` arcs never XOR-cancel at their centers.
 */
function appendTaperedBlade(
  shape: TvgShape,
  cx: number,
  cy: number,
  angle: number,
  halfLen: number,
  halfThick: number,
  curveBend: number
): void {
  if (halfLen < 0.5 || halfThick < 0.2) return;

  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const nx = -uy;
  const ny = ux;

  const p0x = cx - ux * halfLen;
  const p0y = cy - uy * halfLen;
  const p1x = cx + ux * halfLen;
  const p1y = cy + uy * halfLen;

  const ctrlU = 0.36 * halfLen;
  const upperN = halfThick * 1.18 + curveBend;
  const lowerN = -halfThick * 1.05 + curveBend * 0.58;

  const u1x = cx - ux * ctrlU + nx * upperN;
  const u1y = cy - uy * ctrlU + ny * upperN;
  const u2x = cx + ux * ctrlU + nx * upperN;
  const u2y = cy + uy * ctrlU + ny * upperN;

  const l1x = cx + ux * ctrlU + nx * lowerN;
  const l1y = cy + uy * ctrlU + ny * lowerN;
  const l2x = cx - ux * ctrlU + nx * lowerN;
  const l2y = cy - uy * ctrlU + ny * lowerN;

  shape
    .moveTo(p0x, p0y)
    .cubicTo(u1x, u1y, u2x, u2y, p1x, p1y)
    .cubicTo(l1x, l1y, l2x, l2y, p0x, p0y)
    .close();
}

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
        effects: new TVG.Shape(),
        playerGlow: new TVG.Shape(),
        playerCore: new TVG.Shape(),
        skinFront: new TVG.Shape(),
        skinFrontGlow: new TVG.Shape(),
        vfxGold: new TVG.Shape(),
        vfxCyan: new TVG.Shape(),
        vfxCrimson: new TVG.Shape(),
        vfxSlashGold: new TVG.Shape(),
        vfxSlashCyan: new TVG.Shape(),
        vfxSlashCrimson: new TVG.Shape(),
        vfxSlashCore: new TVG.Shape(),
      };
      this.shapes = shapes;

      // Configure hardware/software additive neon bloom (`BlendMethod.Add`) once at init (zero per-frame alloc!)
      const addBlend = TVG.BlendMethod.Add;
      shapes.aurora.blend(addBlend);
      shapes.waveGlow.blend(addBlend);
      shapes.timingRings.blend(addBlend);
      shapes.playerGlow.blend(addBlend);
      shapes.skinFrontGlow.blend(addBlend);
      shapes.vfxGold.blend(addBlend);
      shapes.vfxCyan.blend(addBlend);
      shapes.vfxCrimson.blend(addBlend);
      shapes.vfxSlashGold.blend(addBlend);
      shapes.vfxSlashCyan.blend(addBlend);
      shapes.vfxSlashCrimson.blend(addBlend);
      shapes.vfxSlashCore.blend(addBlend);

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
        shapes.effects,
        shapes.playerGlow,
        shapes.playerCore,
        shapes.skinFront,
        shapes.skinFrontGlow,
        shapes.vfxGold,
        shapes.vfxCyan,
        shapes.vfxCrimson,
        shapes.vfxSlashGold,
        shapes.vfxSlashCyan,
        shapes.vfxSlashCrimson,
        shapes.vfxSlashCore
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
        .add(shapes.effects)
        .add(shapes.playerGlow)
        .add(shapes.playerCore);

      // Character draws above its back aura/wings and below front crown/tiara/halo & additive VFX blades.
      this.loadCrewmate(TVG);
      this.canvas
        .add(shapes.skinFront)
        .add(shapes.skinFrontGlow)
        .add(shapes.vfxGold)
        .add(shapes.vfxCyan)
        .add(shapes.vfxCrimson)
        .add(shapes.vfxSlashGold)
        .add(shapes.vfxSlashCyan)
        .add(shapes.vfxSlashCrimson)
        .add(shapes.vfxSlashCore);

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
    shapes.effects.reset().fill(0, 0, 0, 0);
    shapes.playerGlow.reset();
    shapes.playerCore.reset();
    shapes.skinFront.reset();
    shapes.skinFrontGlow.reset();
    shapes.vfxGold.reset();
    shapes.vfxCyan.reset();
    shapes.vfxCrimson.reset();
    shapes.vfxSlashGold.reset();
    shapes.vfxSlashCyan.reset();
    shapes.vfxSlashCrimson.reset();
    shapes.vfxSlashCore.reset();
    this.hideCrewmate();
  }

  /**
   * Immediately resets all pooled TvgShape layers, hides character/splash pictures,
   * fills an opaque #070914 background, and flushes the canvas so zero menu/scene
   * remnants survive across screen transitions.
   */
  public clearForTransition(): void {
    if (!this.canvas || !this.tvg || !this.shapes || this.disposed) return;
    const shapes = this.shapes;
    shapes.bg.reset().appendRect(0, 0, this.width, this.height).fill(7, 9, 20, 255);
    shapes.grid.reset();
    resetWorldShapeLayers(shapes);
    shapes.effects.reset().fill(0, 0, 0, 0);
    shapes.playerGlow.reset();
    shapes.playerCore.reset();
    shapes.skinFront.reset();
    shapes.skinFrontGlow.reset();
    shapes.vfxGold.reset();
    shapes.vfxCyan.reset();
    shapes.vfxCrimson.reset();
    shapes.vfxSlashGold.reset();
    shapes.vfxSlashCyan.reset();
    shapes.vfxSlashCrimson.reset();
    shapes.vfxSlashCore.reset();
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
    previewSpeedPxPerSec: number = 550,
    previewSkin: CrewmateSkinId = 'classic'
  ): void {
    if (!this.canvas || !this.tvg || !this.shapes || this.disposed) return;

    this.shapes.skinFront.reset();
    this.shapes.skinFrontGlow.reset();
    this.shapes.vfxSlashGold.reset();
    this.shapes.vfxSlashCyan.reset();
    this.shapes.vfxSlashCrimson.reset();
    this.shapes.vfxSlashCore.reset();

    const { playerX, playerY, runCycle } = renderMenuPreviewPass(
      this.shapes,
      this.width,
      this.height,
      timeSec,
      previewForm,
      previewSpeedPxPerSec
    );

    const heightPx = 24 * CREW_HEIGHT_RATIO;
    const cy = this.crewAnim ? playerY + 24 - heightPx / 2 : playerY;

    // 3 semi-transparent trail ghosts behind the preview Crewmate (x = 86, 64, 42 at 1280px -> never clips < 0)
    const trailOffsets = [22, 44, 66] as const;
    for (let idx = 0; idx < trailOffsets.length; idx++) {
      const offset = trailOffsets[idx]!;
      const gx = playerX - offset;
      const gy = cy + Math.sin(timeSec * 7.5 - idx * 0.9) * 2.5;
      const gRadius = 20 * (1 - idx * 0.16);
      const gRot = previewSkin === 'flawless' ? 0 : timeSec * 1.8 + idx * 0.35;
      appendSkinAfterimagePath(
        this.shapes.effects,
        gx,
        gy,
        gRadius,
        gRot,
        previewForm,
        previewSkin
      );
    }
    const [tr, tg, tb] =
      previewSkin === 'classic'
        ? FORM_CONFIG[previewForm].rgb
        : CREWMATE_SKIN_CONFIG[previewSkin].primaryRgb;
    this.shapes.effects
      .fill(tr, tg, tb, previewSkin === 'classic' ? 38 : 62)
      .stroke({
        width: previewSkin === 'classic' ? 1.8 : 2.2,
        color: [tr, tg, tb, previewSkin === 'classic' ? 155 : 215],
      });

    if (this.crewAnim) {
      drawCrewmateSkinOrnaments({
        playerGlowShape: this.shapes.playerGlow,
        playerCoreShape: this.shapes.playerCore,
        skinFrontShape: this.shapes.skinFront,
        skinFrontGlowShape: this.shapes.skinFrontGlow,
        cx: playerX,
        cy,
        radius: 24,
        rotation: 0,
        form: previewForm,
        skinId: previewSkin,
        alphaRatio: 1,
        combo: previewSkin === 'grandmaster' ? 30 : 1,
        timeSec,
        overdriveActive: false,
      });
      this.drawCrewmate(playerX, cy, heightPx, 0, 1, runCycle, 255);
    } else {
      this.shapes.skinFront.reset();
      this.shapes.skinFrontGlow.reset();
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
    const { width, height, activeForm, frequency } = state;
    const activeSkin: CrewmateSkinId = state.skinId ?? 'classic';

    const zoom = Math.max(0.05, state.zoomScale);
    const fx = state.focalScreenX;
    const fy = state.focalScreenY;
    const panX = state.panX ?? 0;
    const panY = state.panY ?? 0;
    const sxOff = state.shakeX ?? 0;
    const syOff = state.shakeY ?? 0;
    const tx = (x: number) => fx + (x - panX - fx) * zoom + sxOff;
    const ty = (y: number) => fy + (y - panY - fy) * zoom + syOff;
    const invTx = (sx: number) => panX + fx + (sx - sxOff - fx) / zoom;
    const invTy = (sy: number) => panY + fy + (sy - syOff - fy) / zoom;
    // Linear up to 48x so calm close-up (1.42x) * 20.0x paused user zoom (28.4x) has 0.0px foot-to-floor error, while extreme zoom remains bounded on CPU SwCanvas
    const ts = (s: number) => s * Math.min(zoom, 48);

    // 1. Background
    const pulseBoost = Math.floor((frequency.low * 0.6 + (state.beatPulse ?? 0) * 0.5) * 28);
    shapes.bg
      .reset()
      .appendRect(0, 0, width, height)
      .fill(
        7 + Math.floor(pulseBoost * 0.5),
        9 + Math.floor(pulseBoost * 0.3),
        20 + pulseBoost,
        255
      );

    // 2. Dynamic Speed Grid (Inverse-projected full-viewport adaptive vector grid)
    shapes.grid.reset();
    let gridStep = 80;
    while (gridStep * zoom < 28) gridStep *= 2;
    while (gridStep * zoom > 220 && gridStep > 20) gridStep *= 0.5;

    const minWorldX = state.cameraX + invTx(-20);
    const maxWorldX = state.cameraX + invTx(width + 20);
    const firstWorldX = Math.floor(minWorldX / gridStep) * gridStep;
    for (let wx = firstWorldX; wx <= maxWorldX; wx += gridStep) {
      const sx = tx(wx - state.cameraX);
      shapes.grid.moveTo(sx, 0).lineTo(sx, height);
    }

    const minWorldY = invTy(-20);
    const maxWorldY = invTy(height + 20);
    const firstWorldY = Math.floor(minWorldY / gridStep) * gridStep;
    for (let wy = firstWorldY; wy <= maxWorldY; wy += gridStep) {
      const sy = ty(wy);
      shapes.grid.moveTo(0, sy).lineTo(width, sy);
    }
    shapes.grid.stroke({
      width: 1,
      color: [40, 65, 110, 82],
    });

    renderMacroWorldPass(shapes, state, tx, ty, ts);

    // 3. Afterimage Trails, Speed Lines (`effects`) & 3-Color Additive Shockwaves + Diamond Shards (`vfx*`)
    shapes.effects.reset();
    shapes.skinFront.reset();
    shapes.skinFrontGlow.reset();
    shapes.vfxGold.reset();
    shapes.vfxCyan.reset();
    shapes.vfxCrimson.reset();
    shapes.vfxSlashGold.reset();
    shapes.vfxSlashCyan.reset();
    shapes.vfxSlashCrimson.reset();
    shapes.vfxSlashCore.reset();

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
      const rOuter = Math.max(2.5, ts(sw.radius));
      const rInner = Math.max(1.2, rOuter - Math.max(1.2, ts(3.2)));
      // Append thin ring path so fill() paints both shockwaves & diamond shards in one additive pass!
      target.appendCircle(tx(sw.x), ty(sw.y), rOuter, rOuter);
      target.appendCircle(tx(sw.x), ty(sw.y), rInner, rInner);
    }

    const pr = ts(state.playerRadius);
    for (const tr of state.afterimages) {
      appendSkinAfterimagePath(
        shapes.effects,
        tx(tr.x),
        ty(tr.y),
        pr * 0.9,
        tr.rotation,
        tr.form,
        activeSkin
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
      const [er, eg, eb] = isOverdrive
        ? [255, 232, 95]
        : activeSkin === 'classic'
          ? FORM_CONFIG[state.activeForm].rgb
          : CREWMATE_SKIN_CONFIG[activeSkin].primaryRgb;
      shapes.effects
        .fill(er, eg, eb, activeSkin === 'classic' ? 0 : 48)
        .stroke({
          width: isOverdrive ? 3.0 : 2.4,
          color: [er, eg, eb, isOverdrive ? 210 : 195],
        });
    }

    // 4. Player Character (Crewmate Lottie + Procedural Vector Suit Ornaments, or Form Polygon fallback)
    const isInvulnerable = state.invulnerableTimer > 0 && !isOverdrive;
    const blink = isInvulnerable && Math.floor(state.timeSec * 12) % 2 === 0;
    const alphaRatio = blink ? 0.35 : isInvulnerable ? 0.65 : 1.0;
    const px = tx(state.playerScreenX);
    const py = ty(state.playerScreenY);
    const combo = state.combo ?? 1;
    if (this.crewAnim) {
      const heightPx = pr * CREW_HEIGHT_RATIO;
      const cx = px;
      const rotation = state.playerRotation;
      const cy = py + pr - heightPx / 2;
      drawCrewmateSkinOrnaments({
        playerGlowShape: shapes.playerGlow,
        playerCoreShape: shapes.playerCore,
        skinFrontShape: shapes.skinFront,
        skinFrontGlowShape: shapes.skinFrontGlow,
        cx,
        cy,
        radius: pr,
        rotation,
        form: activeForm,
        skinId: activeSkin,
        alphaRatio,
        combo,
        timeSec: state.timeSec,
        overdriveActive: isOverdrive,
      });
      this.drawCrewmate(cx, cy, heightPx, rotation, 1, state.runCycleTime, blink ? 90 : 255);
    } else {
      shapes.skinFront.reset();
      shapes.skinFrontGlow.reset();
      drawPlayerPolygon(
        shapes.playerGlow,
        shapes.playerCore,
        px,
        py,
        pr,
        state.playerRotation,
        activeForm,
        alphaRatio,
        false,
        combo,
        state.timeSec,
        isOverdrive
      );
    }

    // 5. Crisp 4-Point Vector Diamond Shards routed into 3-Color Additive VFX Buckets
    for (const pt of state.particles) {
      const target = pickVfxBucket(pt.color);
      const rad = Math.max(1.4, ts(pt.radius * 1.25));
      const sx = tx(pt.x);
      const sy = ty(pt.y);
      target
        .moveTo(sx, sy - rad * 1.35)
        .lineTo(sx + rad, sy)
        .lineTo(sx, sy + rad * 1.35)
        .lineTo(sx - rad, sy)
        .close();
    }
    const vfxStrokeW = Math.max(0.8, Math.min(4.0, ts(1.4)));
    if (hasGold) {
      shapes.vfxGold
        .fillRule(shapes.evenOddRule)
        .fill(255, 230, 65, 220)
        .stroke({ width: vfxStrokeW, color: [255, 250, 190, 235] });
    }
    if (hasCyan) {
      shapes.vfxCyan
        .fillRule(shapes.evenOddRule)
        .fill(5, 213, 255, 220)
        .stroke({ width: vfxStrokeW, color: [195, 248, 255, 235] });
    }
    if (hasCrimson) {
      shapes.vfxCrimson
        .fillRule(shapes.evenOddRule)
        .fill(255, 45, 108, 220)
        .stroke({ width: vfxStrokeW, color: [255, 200, 220, 235] });
    }

    // 6. Pure 3rd-Order Bezier Tapered Vector Blades (`vfxSlash*` — NonZero additive winding)
    let hasSlashGold = false;
    let hasSlashCyan = false;
    let hasSlashCrimson = false;
    let hasSlashCore = false;

    const pickSlashBucket = (rgb: [number, number, number]) => {
      if (rgb[0] >= 200 && rgb[1] >= 180) {
        hasSlashGold = true;
        return shapes.vfxSlashGold;
      }
      if (rgb[2] >= 180 && rgb[0] < 160) {
        hasSlashCyan = true;
        return shapes.vfxSlashCyan;
      }
      hasSlashCrimson = true;
      return shapes.vfxSlashCrimson;
    };

    const appendCoreBlade = (
      cx: number,
      cy: number,
      angle: number,
      cHalfLen: number,
      cHalfThick: number,
      cBend: number
    ) => {
      if (cHalfLen < 0.5 || cHalfThick < 0.2) return;
      hasSlashCore = true;
      appendTaperedBlade(shapes.vfxSlashCore, cx, cy, angle, cHalfLen, cHalfThick, cBend);
    };

    for (let i = 0; i < state.slashes.length; i += 1) {
      const slash = state.slashes[i]!;
      const p = Math.min(1, Math.max(0, slash.life / Math.max(0.001, slash.maxLife)));
      const easeOut = 1 - Math.pow(1 - p, 3);
      const thin = Math.pow(1 - p, 1.55);
      const sx = tx(slash.x);
      const sy = ty(slash.y);
      const halfLen = ts(slash.length * 0.5 * (0.42 + 0.68 * easeOut));
      const halfThick = ts(slash.width * 0.5 * thin);
      if (halfLen < 0.5 || halfThick < 0.2) continue;

      const outerBucket = pickSlashBucket(slash.color);

      if (slash.kind === 'cross') {
        const mainBend = halfThick * 0.55;
        appendTaperedBlade(outerBucket, sx, sy, slash.angle, halfLen, halfThick, mainBend);
        appendCoreBlade(
          sx,
          sy,
          slash.angle,
          halfLen * 0.88,
          halfThick * 0.48,
          mainBend * 0.55
        );

        const subAngle = slash.angle + 0.92;
        const subLen = halfLen * 0.82;
        const subThick = halfThick * 0.82;
        const subBend = -halfThick * 0.45;
        appendTaperedBlade(outerBucket, sx, sy, subAngle, subLen, subThick, subBend);
        appendCoreBlade(
          sx,
          sy,
          subAngle,
          subLen * 0.88,
          subThick * 0.48,
          subBend * 0.55
        );
      } else if (slash.kind === 'pierce') {
        appendTaperedBlade(outerBucket, sx, sy, slash.angle, halfLen * 1.12, halfThick, 0);
        appendCoreBlade(sx, sy, slash.angle, halfLen * 0.94, halfThick * 0.5, 0);

        const wakeCx = sx - Math.cos(slash.angle) * halfLen * 0.18;
        const wakeCy = sy - Math.sin(slash.angle) * halfLen * 0.18;
        const wakeLen = halfLen * 0.62;
        const wakeThick = halfThick * 0.48;
        const wakeBend = halfThick * 0.3;

        appendTaperedBlade(
          outerBucket,
          wakeCx,
          wakeCy,
          slash.angle + 0.22,
          wakeLen,
          wakeThick,
          wakeBend
        );
        appendCoreBlade(
          wakeCx,
          wakeCy,
          slash.angle + 0.22,
          wakeLen * 0.86,
          wakeThick * 0.5,
          wakeBend * 0.55
        );

        appendTaperedBlade(
          outerBucket,
          wakeCx,
          wakeCy,
          slash.angle - 0.22,
          wakeLen,
          wakeThick,
          -wakeBend
        );
        appendCoreBlade(
          wakeCx,
          wakeCy,
          slash.angle - 0.22,
          wakeLen * 0.86,
          wakeThick * 0.5,
          -wakeBend * 0.55
        );
      } else {
        const slamBend = -halfThick * 1.35;
        appendTaperedBlade(
          outerBucket,
          sx,
          sy,
          slash.angle,
          halfLen * 1.05,
          halfThick * 1.15,
          slamBend
        );
        appendCoreBlade(
          sx,
          sy,
          slash.angle,
          halfLen * 0.9,
          halfThick * 0.52,
          -halfThick * 0.72
        );

        const spikeAngle = -Math.PI * 0.5;
        const spikeLen = halfLen * 0.68;
        const spikeThick = halfThick * 0.78;
        appendTaperedBlade(outerBucket, sx, sy, spikeAngle, spikeLen, spikeThick, 0);
        appendCoreBlade(
          sx,
          sy,
          spikeAngle,
          spikeLen * 0.88,
          spikeThick * 0.48,
          0
        );
      }
    }

    if (hasSlashGold) {
      shapes.vfxSlashGold
        .fill(255, 230, 0, 225)
        .stroke({ width: Math.max(1, ts(1.4)), color: [255, 245, 150, 210] });
    }
    if (hasSlashCyan) {
      shapes.vfxSlashCyan
        .fill(5, 213, 255, 225)
        .stroke({ width: Math.max(1, ts(1.4)), color: [190, 248, 255, 210] });
    }
    if (hasSlashCrimson) {
      shapes.vfxSlashCrimson
        .fill(255, 42, 109, 225)
        .stroke({ width: Math.max(1, ts(1.4)), color: [255, 165, 198, 210] });
    }
    if (hasSlashCore) {
      shapes.vfxSlashCore
        .fill(255, 255, 255, 248)
        .stroke({ width: Math.max(0.8, ts(1.1)), color: [255, 255, 255, 225] });
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
