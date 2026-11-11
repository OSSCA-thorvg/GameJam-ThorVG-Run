import { FORM_CONFIG, type RenderFrameState } from '../../types/game';
import type { ScreenTransformFn } from './macroWorldPass';
import { resetWorldShapeLayers, type TvgShapePool } from './shapePool';

/**
 * Stateless Phase 2 (Micro View) Render Pass:
 * Draws oscillating raw frequency tunnel walls, polarity rails (+A / -A),
 * phase barriers, and resonance charge pulses onto pooled ThorVG shapes.
 */
export function renderMicroTunnelPass(
  shapes: TvgShapePool,
  state: RenderFrameState,
  tx: ScreenTransformFn,
  ty: ScreenTransformFn,
  ts: ScreenTransformFn,
  invTx: ScreenTransformFn
): void {
  const {
    width,
    height,
    timeSec,
    divingTargetForm,
    frequency,
    microGates,
    cameraX,
    microPolarity,
  } = state;
  const [mr, mg, mb] = FORM_CONFIG[divingTargetForm].rgb;
  const tw = (w: number) => Math.max(0.8, Math.min(w * 12, ts(w)));

  const topLaneY = height * 0.34;
  const bottomLaneY = height * 0.66;
  const topLaneScreenY = ty(topLaneY);
  const bottomLaneScreenY = ty(bottomLaneY);
  const steps = 32;

  resetWorldShapeLayers(shapes);

  const upperWallBase = height * 0.16;
  const lowerWallBase = height * 0.84;

  for (let i = 0; i <= steps; i++) {
    const sx = (i / steps) * width;
    const worldX = cameraX + invTx(sx);
    const phaseArg = timeSec * 18 + worldX * 0.016;
    const rawOsc = Math.sin(phaseArg) * (18 + frequency.high * 34) * microPolarity;
    const upperScreenY = ty(upperWallBase + rawOsc);
    if (i === 0) {
      shapes.waveGlow.moveTo(sx, upperScreenY);
      shapes.waveCore.moveTo(sx, upperScreenY);
    } else {
      shapes.waveGlow.lineTo(sx, upperScreenY);
      shapes.waveCore.lineTo(sx, upperScreenY);
    }
  }

  for (let i = 0; i <= steps; i++) {
    const sx = (i / steps) * width;
    const worldX = cameraX + invTx(sx);
    const phaseArg = timeSec * 18 + worldX * 0.016;
    const rawOsc = Math.cos(phaseArg) * (18 + frequency.low * 34) * -microPolarity;
    const lowerScreenY = ty(lowerWallBase + rawOsc);
    if (i === 0) {
      shapes.waveGlow.moveTo(sx, lowerScreenY);
      shapes.waveCore.moveTo(sx, lowerScreenY);
    } else {
      shapes.waveGlow.lineTo(sx, lowerScreenY);
      shapes.waveCore.lineTo(sx, lowerScreenY);
    }
  }

  shapes.waveGlow
    .moveTo(0, topLaneScreenY)
    .lineTo(width, topLaneScreenY)
    .moveTo(0, bottomLaneScreenY)
    .lineTo(width, bottomLaneScreenY);

  shapes.waveGlow.stroke({ width: tw(5), color: [mr, mg, mb, 120] });
  shapes.waveCore.stroke({ width: tw(2.5), color: [255, 255, 255, 235] });

  let hasBarriers = false;
  let hasPulses = false;
  const cullPad = Math.max(80, ts(80));
  const halfBarrierW = ts(14);
  const barrierW = ts(28);
  const barrierH = ts(76);
  const barrierRx = ts(6);
  const pulseR = ts(14);

  for (const gate of microGates) {
    const sx = tx(gate.worldX - cameraX);
    if (sx < -cullPad || sx > width + cullPad) continue;

    const dangerY = gate.safePolarity === -1 ? bottomLaneY : topLaneY;
    const safeY = gate.safePolarity === -1 ? topLaneY : bottomLaneY;
    const dangerScreenY = ty(dangerY);
    const safeScreenY = ty(safeY);

    if (!gate.hit) {
      shapes.traps.appendRect(sx - halfBarrierW, dangerScreenY - barrierH * 0.5, barrierW, barrierH, {
        rx: barrierRx,
        ry: barrierRx,
      });
      hasBarriers = true;
    }
    if (!gate.passed) {
      shapes.portals.appendCircle(sx, safeScreenY, pulseR, pulseR);
      hasPulses = true;
    }
  }

  if (hasBarriers) {
    shapes.traps.fill(255, 45, 95, 225).stroke({ width: tw(2), color: [255, 200, 210, 255] });
  }
  if (hasPulses) {
    shapes.portals.fill(mr, mg, mb, 210).stroke({ width: tw(2), color: [255, 255, 255, 255] });
  }
}
