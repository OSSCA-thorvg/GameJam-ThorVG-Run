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

export function appendStarPath(
  shape: TvgShape,
  cx: number,
  cy: number,
  outerRadius: number,
  innerRadius: number,
  points: number,
  rotation: number
): void {
  const totalVerts = points * 2;
  for (let i = 0; i < totalVerts; i++) {
    const r = i % 2 === 0 ? outerRadius : innerRadius;
    const angle = rotation + (i * Math.PI) / points;
    const vx = cx + Math.cos(angle) * r;
    const vy = cy + Math.sin(angle) * r;
    if (i === 0) shape.moveTo(vx, vy);
    else shape.lineTo(vx, vy);
  }
  shape.close();
}

function appendSacredComboHalo(
  shape: TvgShape,
  cx: number,
  cy: number,
  radius: number,
  combo: number,
  timeSec: number,
  overdriveActive: boolean
): void {
  if (!overdriveActive && combo < 25) return;

  const haloR = radius * (overdriveActive ? 2.15 : 1.88);
  shape.appendCircle(cx, cy, haloR, haloR);

  const satCount = overdriveActive ? 6 : combo >= 50 ? 4 : 3;
  const spin = timeSec * (overdriveActive ? 4.4 : 2.6);
  const satR = Math.max(3.2, radius * 0.22);
  for (let i = 0; i < satCount; i++) {
    const a = spin + (i * Math.PI * 2) / satCount;
    const sx = cx + Math.cos(a) * haloR;
    const sy = cy + Math.sin(a) * haloR;
    shape
      .moveTo(sx, sy - satR)
      .lineTo(sx + satR, sy)
      .lineTo(sx, sy + satR)
      .lineTo(sx - satR, sy)
      .close();
  }

  if (overdriveActive || combo >= 50) {
    appendStarPath(shape, cx, cy, haloR * 0.82, haloR * 0.56, 6, -spin * 0.7);
  }
}

/**
 * Draws the Resonance Form polygon or additive form-colored aura + sacred combo halo
 * behind the crewmate Lottie.
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
  auraOnly: boolean = false,
  combo: number = 1,
  timeSec: number = 0,
  overdriveActive: boolean = false
): void {
  const [r, g, b] = overdriveActive ? [255, 232, 85] : FORM_CONFIG[form].rgb;
  const alpha = Math.floor(255 * alphaRatio);

  playerGlowShape.reset();
  playerCoreShape.reset();

  if (auraOnly) {
    appendPolygonPath(playerGlowShape, cx, cy, radius * 1.45, rotation, form);
    appendSacredComboHalo(playerGlowShape, cx, cy, radius, combo, timeSec, overdriveActive);
    playerGlowShape
      .fill(r, g, b, Math.floor((overdriveActive ? 95 : 68) * alphaRatio))
      .stroke({
        width: overdriveActive ? 2.8 : 2,
        color: [r, g, b, Math.floor(215 * alphaRatio)],
      });
    return;
  }

  appendPolygonPath(playerGlowShape, cx, cy, radius * 1.28, rotation, form);
  appendSacredComboHalo(playerGlowShape, cx, cy, radius, combo, timeSec, overdriveActive);
  playerGlowShape
    .fill(r, g, b, Math.floor(90 * alphaRatio))
    .stroke({ width: 1.8, color: [r, g, b, Math.floor(190 * alphaRatio)] });

  appendPolygonPath(playerCoreShape, cx, cy, radius, rotation, form);
  playerCoreShape
    .fill(r, g, b, alpha)
    .stroke({ width: 2.5, color: [255, 255, 255, alpha] });
}
