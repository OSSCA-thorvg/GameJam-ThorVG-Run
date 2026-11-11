import { FORM_CONFIG, type RenderFrameState } from '../../types/game';
import { resetWorldShapeLayers, type TvgShapePool } from './shapePool';

/**
 * Stateless Phase 2 (Micro View) Render Pass:
 * Draws oscillating raw frequency tunnel walls, polarity rails (+A / -A),
 * phase barriers, and resonance charge pulses onto pooled ThorVG shapes.
 */
export function renderMicroTunnelPass(shapes: TvgShapePool, state: RenderFrameState): void {
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

  const topLaneY = height * 0.34;
  const bottomLaneY = height * 0.66;
  const steps = 24;
  const stepW = width / steps;

  resetWorldShapeLayers(shapes);

  const upperWallBase = height * 0.16;
  const lowerWallBase = height * 0.84;

  shapes.waveGlow.moveTo(0, upperWallBase);
  shapes.waveCore.moveTo(0, upperWallBase);

  for (let i = 1; i <= steps; i++) {
    const x = i * stepW;
    const rawOsc =
      Math.sin(timeSec * 18 + i * 0.85) * (18 + frequency.high * 34) * microPolarity;
    shapes.waveGlow.lineTo(x, upperWallBase + rawOsc);
    shapes.waveCore.lineTo(x, upperWallBase + rawOsc);
  }

  shapes.waveGlow.moveTo(0, lowerWallBase);
  shapes.waveCore.moveTo(0, lowerWallBase);
  for (let i = 1; i <= steps; i++) {
    const x = i * stepW;
    const rawOsc =
      Math.cos(timeSec * 18 + i * 0.85) * (18 + frequency.low * 34) * -microPolarity;
    shapes.waveGlow.lineTo(x, lowerWallBase + rawOsc);
    shapes.waveCore.lineTo(x, lowerWallBase + rawOsc);
  }

  shapes.waveGlow
    .moveTo(0, topLaneY)
    .lineTo(width, topLaneY)
    .moveTo(0, bottomLaneY)
    .lineTo(width, bottomLaneY);

  shapes.waveGlow.stroke({ width: 5, color: [mr, mg, mb, 120] });
  shapes.waveCore.stroke({ width: 2.5, color: [255, 255, 255, 235] });

  let hasBarriers = false;
  let hasPulses = false;

  for (const gate of microGates) {
    const sx = gate.worldX - cameraX;
    if (sx < -60 || sx > width + 60) continue;

    const dangerY = gate.safePolarity === -1 ? bottomLaneY : topLaneY;
    const safeY = gate.safePolarity === -1 ? topLaneY : bottomLaneY;

    if (!gate.hit) {
      shapes.traps.appendRect(sx - 14, dangerY - 38, 28, 76, { rx: 6, ry: 6 });
      hasBarriers = true;
    }
    if (!gate.passed) {
      shapes.portals.appendCircle(sx, safeY, 14, 14);
      hasPulses = true;
    }
  }

  if (hasBarriers) {
    shapes.traps.fill(255, 45, 95, 225).stroke({ width: 2, color: [255, 200, 210, 255] });
  }
  if (hasPulses) {
    shapes.portals.fill(mr, mg, mb, 210).stroke({ width: 2, color: [255, 255, 255, 255] });
  }
}
