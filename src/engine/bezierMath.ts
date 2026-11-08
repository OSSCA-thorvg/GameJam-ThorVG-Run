import type { BezierSegment } from '../types/game';

/**
 * Evaluates a 1D Cubic Bezier curve at parameter t in [0, 1].
 * B(t) = (1-t)^3 * p0 + 3*(1-t)^2 * t * c1 + 3*(1-t) * t^2 * c2 + t^3 * p1
 */
export function evaluateCubicBezier(
  p0: number,
  c1: number,
  c2: number,
  p1: number,
  t: number
): number {
  const clamped = Math.max(0, Math.min(1, t));
  const u = 1 - clamped;
  const uu = u * u;
  const uuu = uu * u;
  const tt = clamped * clamped;
  const ttt = tt * clamped;

  return uuu * p0 + 3 * uu * clamped * c1 + 3 * u * tt * c2 + ttt * p1;
}

/**
 * Evaluates the first derivative dB/dt of a 1D Cubic Bezier curve at parameter t in [0, 1].
 */
export function evaluateCubicBezierDerivative(
  p0: number,
  c1: number,
  c2: number,
  p1: number,
  t: number
): number {
  const clamped = Math.max(0, Math.min(1, t));
  const u = 1 - clamped;
  return (
    3 * u * u * (c1 - p0) +
    6 * u * clamped * (c2 - c1) +
    3 * clamped * clamped * (p1 - c2)
  );
}

/**
 * Lightweight formula-based floor height and slope lookup at horizontal world coordinate X.
 * Avoids heavy physics engines (Box2D/Clipper2) to guarantee 60fps.
 */
export function evaluateBezierFloor(
  segments: readonly BezierSegment[],
  worldX: number,
  fallbackY: number
): { floorY: number; slope: number; angleRad: number } {
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    if (worldX >= seg.x0 && worldX <= seg.x1) {
      const span = Math.max(1, seg.x1 - seg.x0);
      const t = (worldX - seg.x0) / span;
      const floorY = evaluateCubicBezier(seg.y0, seg.cy1, seg.cy2, seg.y1, t);
      const dYdT = evaluateCubicBezierDerivative(seg.y0, seg.cy1, seg.cy2, seg.y1, t);
      const slope = dYdT / span;
      return {
        floorY,
        slope,
        angleRad: Math.atan(slope),
      };
    }
  }
  return { floorY: fallbackY, slope: 0, angleRad: 0 };
}

