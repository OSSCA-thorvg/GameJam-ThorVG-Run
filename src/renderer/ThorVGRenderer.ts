import ThorVG, {
  type ThorVGNamespace,
  type Canvas as TvgCanvas,
  type Shape as TvgShape,
} from '@thorvg/webcanvas';
import wasmUrl from '@thorvg/webcanvas/dist/thorvg.wasm?url';
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
  private waveGlowShape: TvgShape | null = null;
  private waveCoreShape: TvgShape | null = null;
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
      this.waveGlowShape = new TVG.Shape();
      this.waveCoreShape = new TVG.Shape();
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
        this.waveGlowShape,
        this.waveCoreShape,
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
        .add(this.waveGlowShape)
        .add(this.waveCoreShape)
        .add(this.trapsShape)
        .add(this.portalsShape)
        .add(this.effectsShape)
        .add(this.playerGlowShape)
        .add(this.playerCoreShape)
        .add(this.particlesShape);
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

    // 3. Animated Cubic Bezier Audio Waveform
    const baseFloorY = height * 0.68;
    const segCount = 6;
    const segWidth = width / segCount;

    this.waveFillShape!.reset().moveTo(0, height).lineTo(0, baseFloorY);
    this.waveGlowShape!.reset().moveTo(0, baseFloorY);
    this.waveCoreShape!.reset().moveTo(0, baseFloorY);

    let prevY = baseFloorY;
    for (let i = 0; i < segCount; i++) {
      const x0 = i * segWidth;
      const x1 = (i + 1) * segWidth;
      const amp1 = Math.sin(timeSec * 3.2 + i * 1.3) * 55;
      const amp2 = Math.cos(timeSec * 2.6 + (i + 1) * 1.1) * 55;
      const y1 = baseFloorY + Math.sin(timeSec * 2.2 + (i + 1) * 0.9) * 38;

      const cx1 = x0 + segWidth * 0.35;
      const cy1 = prevY + amp1;
      const cx2 = x0 + segWidth * 0.65;
      const cy2 = y1 + amp2;

      this.waveFillShape!.cubicTo(cx1, cy1, cx2, cy2, x1, y1);
      this.waveGlowShape!.cubicTo(cx1, cy1, cx2, cy2, x1, y1);
      this.waveCoreShape!.cubicTo(cx1, cy1, cx2, cy2, x1, y1);
      prevY = y1;
    }

    this.waveFillShape!.lineTo(width, height).close().fill(r, g, b, 34);
    this.waveGlowShape!.stroke({ width: 10, color: [r, g, b, 85] });
    this.waveCoreShape!.stroke({ width: 3.5, color: [255, 255, 255, 240] });

    // Clear unused gameplay shapes in preview
    this.trapsShape!.reset();
    this.portalsShape!.reset();
    this.effectsShape!.reset();
    this.particlesShape!.reset();

    // 4. Preview Resonance Polygon Character
    const playerX = width * 0.25;
    const playerY = baseFloorY - 48 + Math.sin(timeSec * 4.5) * 14;
    this.drawPlayerPolygon(playerX, playerY, 26, timeSec * 1.2, previewForm, 1.0);

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

    // 3. Render Shockwaves & Afterimage Effects
    this.effectsShape!.reset();
    for (const sw of state.shockwaves) {
      this.effectsShape!.appendCircle(tx(sw.x), ty(sw.y), ts(sw.radius), ts(sw.radius));
    }
    for (const ai of state.afterimages) {
      this.appendPolygonPath(this.effectsShape!, tx(ai.x), ty(ai.y), ts(state.playerRadius * 0.85), ai.rotation, ai.form);
    }
    if (state.shockwaves.length > 0 || state.afterimages.length > 0) {
      this.effectsShape!.stroke({ width: 3, color: [fr, fg, fb, 190] });
    }

    // 4. Render Player Character Polygon (Bass Hexagon / Synth Diamond / Treble Arrowhead)
    this.drawPlayerPolygon(
      tx(state.playerScreenX),
      ty(state.playerScreenY),
      ts(state.playerRadius),
      state.playerRotation,
      activeForm,
      state.invulnerableTimer > 0 ? 0.55 : 1.0
    );

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
    const { width, height, segments, traps, divingNodes, activeForm, cameraX } = state;
    const [fr, fg, fb] = FORM_CONFIG[activeForm].rgb;

    this.waveFillShape!.reset();
    this.waveGlowShape!.reset();
    this.waveCoreShape!.reset();

    if (segments.length > 0) {
      const first = segments[0]!;
      const startX = tx(first.x0 - cameraX);
      const startY = ty(first.y0);

      this.waveFillShape!.moveTo(startX, height).lineTo(startX, startY);
      this.waveGlowShape!.moveTo(startX, startY);
      this.waveCoreShape!.moveTo(startX, startY);

      let endX = startX;
      for (const seg of segments) {
        const cx1 = tx(seg.cx1 - cameraX);
        const cy1 = ty(seg.cy1);
        const cx2 = tx(seg.cx2 - cameraX);
        const cy2 = ty(seg.cy2);
        const x1 = tx(seg.x1 - cameraX);
        const y1 = ty(seg.y1);

        this.waveFillShape!.cubicTo(cx1, cy1, cx2, cy2, x1, y1);
        this.waveGlowShape!.cubicTo(cx1, cy1, cx2, cy2, x1, y1);
        this.waveCoreShape!.cubicTo(cx1, cy1, cx2, cy2, x1, y1);
        endX = x1;
      }

      this.waveFillShape!.lineTo(Math.max(width, endX), height).close().fill(fr, fg, fb, 38);
      this.waveGlowShape!.stroke({ width: ts(9), color: [fr, fg, fb, 95] });
      this.waveCoreShape!.stroke({ width: ts(3), color: [255, 255, 255, 245] });
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
    this.waveGlowShape!.reset();
    this.waveCoreShape!.reset();

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

  private drawPlayerPolygon(
    cx: number,
    cy: number,
    radius: number,
    rotation: number,
    form: ResonanceFormType,
    alphaRatio: number
  ): void {
    const [r, g, b] = FORM_CONFIG[form].rgb;
    const alpha = Math.floor(255 * alphaRatio);

    this.playerGlowShape!.reset();
    this.playerCoreShape!.reset();

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
