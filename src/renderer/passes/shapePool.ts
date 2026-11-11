import type { Shape as TvgShape } from '@thorvg/webcanvas';

/**
 * Pooled ThorVG WASM Shape Layer Bundle:
 * Allocated once in `ThorVGRenderer.init()` in strict Painter's-Algorithm z-order
 * and passed into stateless 60fps render passes so zero WASM heap objects are created per frame.
 */
export interface TvgShapePool {
  bg: TvgShape;
  grid: TvgShape;
  waveFill: TvgShape;
  spectrum: TvgShape;
  waveGlow: TvgShape;
  waveCore: TvgShape;
  platforms: TvgShape;
  gimmicks: TvgShape;
  timingRings: TvgShape;
  orbs: TvgShape;
  traps: TvgShape;
  portals: TvgShape;
  effects: TvgShape;
  playerGlow: TvgShape;
  playerCore: TvgShape;
  particles: TvgShape;
}
