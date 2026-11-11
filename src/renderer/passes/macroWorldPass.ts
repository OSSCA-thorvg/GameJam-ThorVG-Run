import {
  FORM_CONFIG,
  type BeatTrap,
  type BezierSegment,
  type RenderFrameState,
} from '../../types/game';
import type { TvgShapePool } from './shapePool';

/**
 * Stateless Phase 1 (Macro View) Render Pass:
 * Draws multi-elevation Bezier sprint decks, chasm gaps & takeoff lips, spectrum equalizer bars,
 * 2F sky platforms, 3 track gimmicks (`HoldRail`, `JumpPad`, `DashRing`), shrinking timing rings,
 * beat notes, crimson beat traps, and frequency diving portals onto pooled ThorVG shapes.
 */
export function renderMacroWorldPass(
  shapes: TvgShapePool,
  state: RenderFrameState,
  tx: (x: number) => number,
  ty: (y: number) => number,
  ts: (s: number) => number
): void {
  const { width, height, segments, traps, divingNodes, activeForm, cameraX, frequency } = state;
  const [fr, fg, fb] = FORM_CONFIG[activeForm].rgb;
  const [sr, sg, sb] = FORM_CONFIG[activeForm].secondaryRgb;
  const isDrop = state.sectionIntensity === 'drop';

  shapes.waveFill.reset();
  shapes.spectrum.reset();
  shapes.waveGlow.reset();
  shapes.waveCore.reset();
  shapes.platforms.reset();
  shapes.gimmicks.reset();
  shapes.timingRings.reset();
  shapes.orbs.reset();
  shapes.traps.reset();

  let hasTraps = false;

  // 1. Group contiguous solid road segments so chasm gaps (`seg.isGap`) open cleanly into the abyss!
  if (segments.length > 0) {
    const solidRuns: BezierSegment[][] = [];
    let currentRun: BezierSegment[] = [];

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]!;
      if (seg.isGap) {
        if (currentRun.length > 0) {
          solidRuns.push(currentRun);
          currentRun = [];
        }
        const prevSeg = i > 0 ? segments[i - 1] : undefined;
        if (prevSeg && !prevSeg.isGap) {
          const lipX = tx(seg.x0 - cameraX);
          const lipY = ty(prevSeg.y1);
          if (lipX >= -40 && lipX <= width + 40) {
            shapes.traps.appendRect(lipX - ts(10), lipY - ts(16), ts(10), ts(18), {
              rx: ts(2),
              ry: ts(2),
            });
            hasTraps = true;
          }
        }
      } else {
        currentRun.push(seg);
      }
    }
    if (currentRun.length > 0) {
      solidRuns.push(currentRun);
    }

    const harmonicOffset = ts(28 + frequency.mid * 20);
    let hasSpectrum = false;

    for (let rIdx = 0; rIdx < solidRuns.length; rIdx++) {
      const run = solidRuns[rIdx]!;
      const first = run[0]!;
      const last = run[run.length - 1]!;
      const startX = tx(first.x0 - cameraX);
      const startY = ty(first.y0);
      const endX = tx(last.x1 - cameraX);
      const endY = ty(last.y1);

      shapes.waveFill.moveTo(startX, height).lineTo(startX, startY);
      shapes.waveGlow.moveTo(startX, startY);
      shapes.waveCore.moveTo(startX, startY);

      for (const seg of run) {
        const x0 = tx(seg.x0 - cameraX);
        const y0 = ty(seg.y0);
        const cx1 = tx(seg.cx1 - cameraX);
        const cy1 = ty(seg.cy1);
        const cx2 = tx(seg.cx2 - cameraX);
        const cy2 = ty(seg.cy2);
        const x1 = tx(seg.x1 - cameraX);
        const y1 = ty(seg.y1);

        shapes.waveFill.cubicTo(cx1, cy1, cx2, cy2, x1, y1);
        shapes.waveGlow.cubicTo(cx1, cy1, cx2, cy2, x1, y1);
        shapes.waveCore.cubicTo(cx1, cy1, cx2, cy2, x1, y1);

        if (x1 >= -30 && x0 <= width + 30) {
          const spanW = Math.max(12, x1 - x0);
          const subBars = 3;
          const slotW = spanW / subBars;
          const barW = Math.max(3, slotW * 0.56);
          const segLow = seg.low ?? frequency.low;
          const segMid = seg.mid ?? frequency.mid;
          const segHigh = seg.high ?? frequency.high;

          for (let b = 0; b < subBars; b++) {
            const u = (b + 0.5) / subBars;
            const bx = x0 + b * slotW + (slotW - barW) * 0.5;
            const approxWaveY = y0 + (y1 - y0) * u + ts(12);
            const availH = Math.max(12, height - approxWaveY);
            const bandVal = b === 0 ? segLow : b === 1 ? segMid : segHigh;
            const barH = Math.min(availH, availH * (0.2 + bandVal * 0.72));
            if (barH > 6) {
              shapes.spectrum.appendRect(bx, height - barH, barW, barH, { rx: 2, ry: 2 });
              hasSpectrum = true;
            }
          }
        }
      }

      shapes.waveFill.lineTo(endX, height).close();

      if (rIdx > 0) {
        shapes.waveCore.moveTo(startX, startY).lineTo(startX, height);
        shapes.waveGlow.moveTo(startX, startY).lineTo(startX, height);
      }
      if (rIdx < solidRuns.length - 1) {
        shapes.waveCore.moveTo(endX, endY).lineTo(endX, height);
        shapes.waveGlow.moveTo(endX, endY).lineTo(endX, height);
      }

      shapes.waveGlow.moveTo(startX, startY + harmonicOffset);
      for (const seg of run) {
        const cx1 = tx(seg.cx1 - cameraX);
        const cy1 = ty(seg.cy1) + harmonicOffset;
        const cx2 = tx(seg.cx2 - cameraX);
        const cy2 = ty(seg.cy2) + harmonicOffset;
        const x1 = tx(seg.x1 - cameraX);
        const y1 = ty(seg.y1) + harmonicOffset;
        shapes.waveGlow.cubicTo(cx1, cy1, cx2, cy2, x1, y1);
      }
    }

    if (solidRuns.length > 0) {
      const fillAlpha = isDrop ? 56 : 40;
      const glowWidth = ts(isDrop || frequency.isBeat ? 11 : 8);
      const glowAlpha = isDrop || frequency.isBeat ? 128 : 92;

      shapes.waveFill.fill(fr, fg, fb, fillAlpha);
      if (hasSpectrum) {
        shapes.spectrum
          .fill(fr, fg, fb, isDrop ? 82 : 52)
          .stroke({ width: ts(1.2), color: [sr, sg, sb, 115] });
      }
      shapes.waveGlow.stroke({ width: glowWidth, color: [fr, fg, fb, glowAlpha] });
      shapes.waveCore.stroke({ width: ts(3.4), color: [255, 255, 255, 245] });
    }
  }

  // 2. Render 2nd-Floor One-Way Sky Platforms (`SkyPlatform`)
  let hasPlatforms = false;
  for (const plat of state.skyPlatforms ?? []) {
    const sx0 = tx(plat.x0 - cameraX);
    const sx1 = tx(plat.x1 - cameraX);
    if (sx1 < -40 || sx0 > width + 40) continue;
    const sy = ty(plat.screenY ?? plat.worldY);
    const pw = Math.max(ts(24), sx1 - sx0);
    const ph = ts(11);

    shapes.platforms
      .appendRect(sx0, sy, pw, ph, { rx: ts(4), ry: ts(4) })
      .appendRect(sx0 + ts(8), sy + ph, ts(4), ts(10))
      .appendRect(sx0 + pw - ts(12), sy + ph, ts(4), ts(10));
    hasPlatforms = true;
  }
  if (hasPlatforms) {
    shapes.platforms
      .fill(sr, sg, sb, 170)
      .stroke({ width: ts(2.4), color: [255, 255, 255, 245] });
  }

  // 3. Render 3 Track Gimmick Objects (`HoldRail`, `JumpPad`, `DashRing`)
  let hasGimmicks = false;
  let hasTimingRings = false;

  for (const rail of state.holdRails ?? []) {
    if (rail.completed) continue;
    const rx0 = tx(rail.x0 - cameraX);
    const rx1 = tx(rail.x1 - cameraX);
    if (rx1 < -40 || rx0 > width + 40) continue;
    const ry = ty(rail.screenY ?? rail.worldY);
    const beamH = ts(rail.active ? 11 : 8);
    shapes.gimmicks
      .appendRect(rx0, ry - beamH * 0.5, Math.max(ts(20), rx1 - rx0), beamH, {
        rx: beamH * 0.5,
        ry: beamH * 0.5,
      })
      .appendCircle(rx0, ry, ts(9.5), ts(9.5))
      .appendCircle(rx1, ry, ts(11), ts(11));
    hasGimmicks = true;
  }

  for (const pad of state.jumpPads ?? []) {
    const px = tx(pad.worldX - cameraX);
    if (px < -40 || px > width + 40) continue;
    const py = ty(pad.screenY ?? pad.worldY);
    const padW = ts(42);
    const padH = ts(10);
    const lift = pad.triggered ? ts(26) : ts(16);
    shapes.gimmicks
      .appendRect(px - padW * 0.5, py - padH, padW, padH, {
        rx: ts(3),
        ry: ts(3),
      })
      .moveTo(px - ts(12), py - lift)
      .lineTo(px, py - lift - ts(12))
      .lineTo(px + ts(12), py - lift)
      .close();
    hasGimmicks = true;
  }

  for (const ring of state.dashRings ?? []) {
    if (ring.triggered) continue;
    const rx = tx(ring.worldX - cameraX);
    if (rx < -60 || rx > width + 60) continue;
    const ry = ty(ring.screenY ?? ring.worldY);
    const rad = ts(ring.radius);
    shapes.gimmicks
      .appendCircle(rx, ry, rad, rad)
      .appendCircle(rx, ry, rad * 0.58, rad * 0.58)
      .moveTo(rx - rad * 0.18, ry - rad * 0.28)
      .lineTo(rx + rad * 0.28, ry)
      .lineTo(rx - rad * 0.18, ry + rad * 0.28)
      .close();
    hasGimmicks = true;

    const dtRing = ring.timeSec - (state.audioSec ?? state.timeSec);
    if (dtRing >= -0.06 && dtRing <= 0.7) {
      const ratio = Math.max(0, Math.min(1, dtRing / 0.65));
      const approachRad = rad * (1.06 + ratio * 1.15);
      shapes.timingRings.appendCircle(rx, ry, approachRad, approachRad);
      hasTimingRings = true;
    }
  }

  if (hasGimmicks) {
    shapes.gimmicks
      .fill(255, 218, 55, 130)
      .stroke({ width: ts(2.8), color: [255, 248, 175, 250] });
  }

  // 4. Rhythm Beat Notes (`ResonanceOrb`) + Shrinking Beat Timing Rings
  const orbs = state.orbs ?? [];
  let hasOrbs = false;
  for (const orb of orbs) {
    if (orb.collected) continue;
    const ox = tx(orb.worldX - cameraX);
    if (ox < -45 || ox > width + 45) continue;
    const oy = ty(orb.screenY ?? orb.worldY);
    const pulse = 1 + Math.sin(state.timeSec * 8 + orb.id * 0.7) * 0.14;
    const rad = ts(orb.radius * pulse);

    if (orb.isArcOrb) {
      shapes.orbs
        .moveTo(ox, oy - rad * 1.35)
        .lineTo(ox + rad * 1.35, oy)
        .lineTo(ox, oy + rad * 1.35)
        .lineTo(ox - rad * 1.35, oy)
        .close();
    } else {
      shapes.orbs.appendCircle(ox, oy, rad, rad);
    }
    hasOrbs = true;

    if (orb.isBeatTarget && orb.timeSec !== undefined) {
      const dtBeat = orb.timeSec - (state.audioSec ?? state.timeSec);
      if (dtBeat >= -0.05 && dtBeat <= 0.65) {
        const ratio = Math.max(0, Math.min(1, dtBeat / 0.6));
        const ringRad = ts(orb.radius * (1.12 + ratio * 1.95));
        shapes.timingRings.appendCircle(ox, oy, ringRad, ringRad);
        hasTimingRings = true;
      }
    }
  }
  if (hasTimingRings) {
    shapes.timingRings.stroke({ width: ts(2.0), color: [255, 238, 120, 215] });
  }
  if (hasOrbs) {
    shapes.orbs
      .fill(sr, sg, sb, 230)
      .stroke({ width: ts(2.2), color: [255, 255, 255, 250] });
  }

  // 5. Beat Traps (Crimson Spikes on Solid Sprint Decks)
  for (const trap of traps) {
    if (trap.destroyed) continue;
    const sx = tx(trap.worldX - cameraX);
    if (sx < -60 || sx > width + 60) continue;
    const baseY = ty(
      (trap as BeatTrap & { screenFloorY?: number }).screenFloorY ?? height * 0.7
    );
    const halfW = ts(trap.width * 0.5);
    const spikeH = ts(trap.height);

    shapes.traps
      .moveTo(sx - halfW, baseY)
      .lineTo(sx, baseY - spikeH)
      .lineTo(sx + halfW, baseY)
      .close();
    hasTraps = true;
  }
  if (hasTraps) {
    shapes.traps.fill(255, 50, 95, 232).stroke({ width: 2, color: [255, 210, 220, 255] });
  }

  // 6. Frequency Diving Nodes (Portals)
  shapes.portals.reset();
  let portalColor: [number, number, number] = [5, 213, 255];
  let hasPortals = false;
  for (const node of divingNodes) {
    if (node.activated) continue;
    const sx = tx(node.worldX - cameraX);
    if (sx < -80 || sx > width + 80) continue;
    const sy = ty(node.worldY);
    const rad = ts(node.radius);
    portalColor = FORM_CONFIG[node.targetForm].rgb;

    shapes.portals
      .appendCircle(sx, sy, rad, rad)
      .appendCircle(sx, sy, rad * 0.58, rad * 0.58);
    hasPortals = true;
  }
  if (hasPortals) {
    shapes.portals
      .fill(portalColor[0], portalColor[1], portalColor[2], 70)
      .stroke({ width: 3.5, color: [portalColor[0], portalColor[1], portalColor[2], 255] });
  }
}
