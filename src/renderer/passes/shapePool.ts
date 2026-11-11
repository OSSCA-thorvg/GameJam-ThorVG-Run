import type { Shape as TvgShape, ThorVGNamespace } from '@thorvg/webcanvas';

/**
 * Pooled ThorVG WASM Shape Layer Bundle:
 * Allocated once in `ThorVGRenderer.init()` in strict Painter's-Algorithm z-order
 * and passed into stateless 60fps render passes so zero WASM heap objects are created per frame.
 */
export interface TvgShapePool {
  evenOddRule: ThorVGNamespace['FillRule']['EvenOdd'];
  bg: TvgShape;
  aurora: TvgShape;
  grid: TvgShape;
  waveFill: TvgShape;
  spectrum: TvgShape;
  waveGlow: TvgShape;
  waveCore: TvgShape;
  bandBass: TvgShape;
  bandSynth: TvgShape;
  bandTreble: TvgShape;
  gimmicks: TvgShape;
  prismStars: TvgShape;
  timingRings: TvgShape;
  traps: TvgShape;
  effects: TvgShape;
  playerGlow: TvgShape;
  playerCore: TvgShape;
  vfxGold: TvgShape;
  vfxCyan: TvgShape;
  vfxCrimson: TvgShape;
}

/**
 * Resets all world & VFX shape layers so scene switches (`Gameplay` <-> `Preview`)
 * never leave stale vector paths on screen.
 */
export function resetWorldShapeLayers(shapes: TvgShapePool): void {
  shapes.aurora.reset();
  shapes.waveFill.reset();
  shapes.spectrum.reset();
  shapes.waveGlow.reset();
  shapes.waveCore.reset();
  shapes.bandBass.reset();
  shapes.bandSynth.reset();
  shapes.bandTreble.reset();
  shapes.gimmicks.reset();
  shapes.prismStars.reset();
  shapes.timingRings.reset();
  shapes.traps.reset();
}
