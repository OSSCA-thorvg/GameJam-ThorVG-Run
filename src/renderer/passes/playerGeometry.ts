import type { Shape as TvgShape } from '@thorvg/webcanvas';
import { FORM_CONFIG, type ResonanceFormType } from '../../types/game';

const SYNTH_LOCAL_VERTS: ReadonlyArray<readonly [number, number]> = [
  [1.35, 0],
  [0, 0.85],
  [-1.15, 0],
  [0, -0.85],
];

const TREBLE_LOCAL_VERTS: ReadonlyArray<readonly [number, number]> = [
  [1.45, 0],
  [-1.0, 0.82],
  [-0.45, 0],
  [-1.0, -0.82],
];

export function appendPolygonPath(
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
    return;
  }

  const verts = form === 'synth' ? SYNTH_LOCAL_VERTS : TREBLE_LOCAL_VERTS;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  for (let i = 0; i < verts.length; i++) {
    const [nx, ny] = verts[i]!;
    const lx = nx * radius;
    const ly = ny * radius;
    const vx = cx + lx * cos - ly * sin;
    const vy = cy + lx * sin + ly * cos;
    if (i === 0) shape.moveTo(vx, vy);
    else shape.lineTo(vx, vy);
  }
  shape.close();
}

/**
 * Draws the Resonance Form polygon or translucent form-colored aura behind the crewmate Lottie.
 */
export function drawPlayerPolygon(
  playerGlowShape: TvgShape,
  playerCoreShape: TvgShape,
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

  playerGlowShape.reset();
  playerCoreShape.reset();

  if (auraOnly) {
    appendPolygonPath(playerGlowShape, cx, cy, radius * 1.45, rotation, form);
    playerGlowShape
      .fill(r, g, b, Math.floor(70 * alphaRatio))
      .stroke({ width: 2, color: [r, g, b, Math.floor(200 * alphaRatio)] });
    return;
  }

  appendPolygonPath(playerGlowShape, cx, cy, radius * 1.28, rotation, form);
  playerGlowShape.fill(r, g, b, Math.floor(90 * alphaRatio));

  appendPolygonPath(playerCoreShape, cx, cy, radius, rotation, form);
  playerCoreShape
    .fill(r, g, b, alpha)
    .stroke({ width: 2.5, color: [255, 255, 255, alpha] });
}
