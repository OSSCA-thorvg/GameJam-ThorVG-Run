import type { Matrix } from '@thorvg/webcanvas';

/**
 * Builds a 2D affine matrix that rotates by `rotation` (radians) and mirrors vertically when
 * `flip = -1`, both around the local pivot (pivotX, pivotY), then places that pivot at (cx, cy).
 * Scale is intentionally excluded: it is applied through Picture.size() to avoid double scaling.
 */
export function buildCharacterMatrix(
  cx: number,
  cy: number,
  pivotX: number,
  pivotY: number,
  rotation: number,
  flip: 1 | -1
): Matrix {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const e11 = cos;
  const e12 = -sin * flip;
  const e21 = sin;
  const e22 = cos * flip;
  return {
    e11,
    e12,
    e13: cx - (e11 * pivotX + e12 * pivotY),
    e21,
    e22,
    e23: cy - (e21 * pivotX + e22 * pivotY),
    e31: 0,
    e32: 0,
    e33: 1,
  };
}
