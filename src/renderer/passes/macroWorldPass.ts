import type { Shape as TvgShape } from '@thorvg/webcanvas';
import {
  FORM_CONFIG,
  type BeatTrap,
  type BezierSegment,
  type RenderFrameState,
  type ResonanceFormType,
} from '../../types/game';
import { appendStarPath } from './playerGeometry';
import { resetWorldShapeLayers, type TvgShapePool } from './shapePool';

export type ScreenTransformFn = (val: number) => number;

/**
 * Stateless Runner World Render Pass:
 * - Horizon aurora ribbons during `DROP` & `RESONANCE OVERDRIVE`
 * - Contiguous cubic-bezier sprint decks with abyss chasm breaks & equalizer bars
 * - True 3-Color Band Neon Separation (`Bass` #FF2A6D, `Synth` #05D5FF, `Treble` #FFE600)
 *   for 2F Sky Platforms, Hold Rails & Rhythm Beat Notes (omni-resonant neon clarity across all bands)
 * - `JumpPad`, `SlamPad` (downward double-chevron anvil), `DashRing`, `★ Prism Stars`,
 *   ground `BeatTrap` spikes, and spinning aerial `BeatDrone` rotors
 */
export function renderMacroWorldPass(
  shapes: TvgShapePool,
  state: RenderFrameState,
  tx: ScreenTransformFn,
  ty: ScreenTransformFn,
  ts: ScreenTransformFn
): void {
  const { width, height, activeForm, frequency, segments, traps, cameraX } = state;
  const formCfg = FORM_CONFIG[activeForm];
  const [fr, fg, fb] = formCfg.rgb;
  const [sr, sg, sb] = formCfg.secondaryRgb;
  const isDrop = state.sectionIntensity === 'drop';
  const isOverdrive = Boolean(state.overdriveActive);
  const combo = state.combo ?? 1;
  const tw = (w: number) => Math.max(0.75, Math.min(w * 14, ts(w)));
  const cullPad = Math.max(80, ts(95));

  resetWorldShapeLayers(shapes);

  // 0. Horizon Aurora Ribbons during DROP, OVERDRIVE, or 25+ Combo Streak (`BlendMethod.Add`)
  if (isDrop || isOverdrive || combo >= 25) {
    const steps = 10;
    const stepW = width / steps;
    const amp = isOverdrive ? 36 : isDrop ? 28 : 16;
    const baseY1 = height * 0.2;
    const baseY2 = height * 0.3;

    shapes.aurora.moveTo(0, baseY1);
    for (let i = 1; i <= steps; i++) {
      const x = i * stepW;
      const y =
        baseY1 +
        Math.sin(state.timeSec * 3.4 + i * 0.7) * amp +
        frequency.mid * 18;
      shapes.aurora.lineTo(x, y);
    }
    shapes.aurora.moveTo(0, baseY2);
    for (let i = 1; i <= steps; i++) {
      const x = i * stepW;
      const y =
        baseY2 +
        Math.cos(state.timeSec * 2.7 + i * 0.65) * (amp * 0.85) -
        frequency.high * 16;
      shapes.aurora.lineTo(x, y);
    }

    const auroraColor: [number, number, number] = isOverdrive
      ? [255, 225, 95]
      : [fr, fg, fb];
    shapes.aurora.stroke({
      width: isOverdrive ? 18 : isDrop ? 13 : 8,
      color: [
        auroraColor[0],
        auroraColor[1],
        auroraColor[2],
        isOverdrive ? 78 : isDrop ? 56 : 34,
      ],
    });
  }

  let hasTraps = false;

  // 1. Render Solid Sprint Decks with Clean Chasm Breaks (`isGap`)
  if (segments.length > 0) {
    const bottomY = Math.max(height + 40, ty(height + 160));
    const cullSegPad = Math.max(40, ts(40));
    const solidRuns: BezierSegment[][] = [];
    let currentRun: BezierSegment[] = [];

    for (const seg of segments) {
      if (seg.isGap) {
        if (currentRun.length > 0) {
          solidRuns.push(currentRun);
          currentRun = [];
        }
        const gx0 = tx(seg.x0 - cameraX);
        const gx1 = tx(seg.x1 - cameraX);
        if (gx1 >= -cullSegPad && gx0 <= width + cullSegPad) {
          const gy = ty(Math.max(seg.y0, seg.y1) + 46);
          shapes.traps.moveTo(gx0, gy).lineTo(gx1, gy);
          hasTraps = true;
        }
      } else {
        currentRun.push(seg);
      }
    }
    if (currentRun.length > 0) {
      solidRuns.push(currentRun);
    }

    let hasSpectrum = false;
    const harmonicAmp = (frequency.high * 8 + (isDrop ? 4 : 0)) * Math.min(state.zoomScale, 4);

    for (const run of solidRuns) {
      const first = run[0]!;
      const last = run[run.length - 1]!;
      const startX = tx(first.x0 - cameraX);
      const startY = ty(first.y0);
      const endX = tx(last.x1 - cameraX);

      shapes.waveFill.moveTo(startX, bottomY).lineTo(startX, startY);
      shapes.waveGlow.moveTo(startX, startY);
      shapes.waveCore.moveTo(startX, startY);

      for (const seg of run) {
        const cx1 = tx(seg.cx1 - cameraX);
        const cy1 = ty(seg.cy1);
        const cx2 = tx(seg.cx2 - cameraX);
        const cy2 = ty(seg.cy2);
        const x1 = tx(seg.x1 - cameraX);
        const y1 = ty(seg.y1);

        shapes.waveFill.cubicTo(cx1, cy1, cx2, cy2, x1, y1);
        shapes.waveGlow.cubicTo(cx1, cy1, cx2, cy2, x1, y1);
        shapes.waveCore.cubicTo(cx1, cy1, cx2, cy2, x1, y1);

        const x0 = tx(seg.x0 - cameraX);
        if (x1 >= -cullSegPad && x0 <= width + cullSegPad) {
          const eLow = (seg.low ?? 0.25) * (0.65 + frequency.low * 0.65);
          const eMid = (seg.mid ?? 0.25) * (0.65 + frequency.mid * 0.65);
          const eHigh = (seg.high ?? 0.25) * (0.65 + frequency.high * 0.65);
          const energies = [eLow, eMid, eHigh];
          const midRoadY = (ty(seg.y0) + y1) * 0.5;
          const specBottomY = Math.min(height, bottomY);
          const availDepth = specBottomY - midRoadY - Math.max(4, ts(10));

          if (availDepth > 12 && midRoadY < height - 18) {
            const segSpan = Math.max(ts(12), x1 - x0);
            const barW = Math.max(1.5, segSpan * 0.22);
            for (let bIdx = 0; bIdx < 3; bIdx++) {
              const bx = x0 + (bIdx + 0.22) * (segSpan / 3);
              const bh = Math.max(4, Math.min(availDepth * 0.85, availDepth * energies[bIdx]!));
              const rx = Math.max(1, ts(2));
              shapes.spectrum.appendRect(bx, specBottomY - bh, barW, bh, { rx, ry: rx });
              hasSpectrum = true;
            }
          }
        }
      }

      shapes.waveFill.lineTo(endX, bottomY).close();

      // Secondary harmonic shimmer line underneath solid deck edge
      const harmonicOffset = ts(11) + Math.sin(state.timeSec * 12) * harmonicAmp * 0.2;
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
      const fillAlpha = isOverdrive ? 70 : isDrop ? 56 : 40;
      const glowWidth = Math.max(2.0, ts(isOverdrive ? 14 : isDrop || frequency.isBeat ? 11 : 8));
      const glowAlpha = isOverdrive ? 165 : isDrop || frequency.isBeat ? 132 : 94;

      shapes.waveFill.fill(fr, fg, fb, fillAlpha);
      if (hasSpectrum) {
        shapes.spectrum
          .fill(fr, fg, fb, isDrop || isOverdrive ? 88 : 52)
          .stroke({ width: tw(1.2), color: [sr, sg, sb, 115] });
      }
      shapes.waveGlow.stroke({ width: glowWidth, color: [fr, fg, fb, glowAlpha] });
      shapes.waveCore.stroke({ width: tw(3.4), color: [255, 255, 255, 245] });
    }
  }

  // Band routing helper for true 3-color neon rendering (`Bass` / `Synth` / `Treble`)
  const hasBandContent: Record<ResonanceFormType, boolean> = {
    bass: false,
    synth: false,
    treble: false,
  };
  const getBandShape = (band: ResonanceFormType): TvgShape => {
    hasBandContent[band] = true;
    if (band === 'bass') return shapes.bandBass;
    if (band === 'synth') return shapes.bandSynth;
    return shapes.bandTreble;
  };

  // 2. Render 2nd-Floor One-Way Sky Platforms (`SkyPlatform`) in true band color!
  for (const plat of state.skyPlatforms ?? []) {
    const sx0 = tx(plat.x0 - cameraX);
    const sx1 = tx(plat.x1 - cameraX);
    if (sx1 < -cullPad || sx0 > width + cullPad) continue;
    const sy = ty(plat.screenY ?? plat.worldY);
    const pw = Math.max(ts(24), sx1 - sx0);
    const ph = ts(11);
    const target = getBandShape(plat.band);

    target
      .appendRect(sx0, sy, pw, ph, { rx: ts(4), ry: ts(4) })
      .appendRect(sx0 + ts(8), sy + ph, ts(4), ts(10))
      .appendRect(sx0 + pw - ts(12), sy + ph, ts(4), ts(10));
  }

  // 3. Render Hold Rails (band-colored) + JumpPads, SlamPads & DashRings (`shapes.gimmicks`)
  let hasGimmicks = false;
  let hasTimingRings = false;

  for (const rail of state.holdRails ?? []) {
    if (rail.completed) continue;
    const rx0 = tx(rail.x0 - cameraX);
    const rx1 = tx(rail.x1 - cameraX);
    if (rx1 < -cullPad || rx0 > width + cullPad) continue;
    const ry = ty(rail.screenY ?? rail.worldY);
    const beamH = ts(rail.active ? 12 : 8.5);
    const target = getBandShape(rail.band);

    target
      .appendRect(rx0, ry - beamH * 0.5, Math.max(ts(20), rx1 - rx0), beamH, {
        rx: beamH * 0.5,
        ry: beamH * 0.5,
      })
      .appendCircle(rx0, ry, ts(9.5), ts(9.5))
      .appendCircle(rx1, ry, ts(11), ts(11));
  }

  for (const pad of state.jumpPads ?? []) {
    const px = tx(pad.worldX - cameraX);
    if (px < -cullPad || px > width + cullPad) continue;
    const py = ty(pad.screenY ?? pad.worldY);

    if (pad.kind === 'slam') {
      // SlamPad: Wide anvil drum pad + downward double-chevron emblem inviting Fast-Drop [S/Down]!
      const padW = ts(52);
      const padH = ts(12);
      const hover = ts(pad.triggered ? 18 : 30 + Math.sin(state.timeSec * 9) * 3);
      shapes.gimmicks
        .appendRect(px - padW * 0.5, py - padH, padW, padH, { rx: ts(4), ry: ts(4) })
        .moveTo(px - ts(13), py - hover - ts(12))
        .lineTo(px, py - hover)
        .lineTo(px + ts(13), py - hover - ts(12))
        .close()
        .moveTo(px - ts(9), py - hover - ts(22))
        .lineTo(px, py - hover - ts(12))
        .lineTo(px + ts(9), py - hover - ts(22))
        .close();
      hasGimmicks = true;
    } else {
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
  }

  for (const ring of state.dashRings ?? []) {
    if (ring.triggered) continue;
    const rx = tx(ring.worldX - cameraX);
    if (rx < -cullPad || rx > width + cullPad) continue;
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
      .fillRule(shapes.evenOddRule)
      .fill(255, 212, 50, 150)
      .stroke({ width: tw(2.8), color: [255, 250, 185, 252] });
  }

  // 4. Rhythm Beat Notes (`bandBass` / `bandSynth` / `bandTreble`) & `★ Prism Stars` (`prismStars`)
  const orbs = state.orbs ?? [];
  let hasPrismStars = false;

  for (const orb of orbs) {
    if (orb.collected) continue;
    const ox = tx(orb.worldX - cameraX);
    if (ox < -cullPad || ox > width + cullPad) continue;
    const oy = ty(orb.screenY ?? orb.worldY);
    const pulse = 1 + Math.sin(state.timeSec * 8 + orb.id * 0.7) * (isOverdrive ? 0.2 : 0.17);
    const rad = ts(orb.radius * pulse);

    if (orb.isPrismStar) {
      appendStarPath(shapes.prismStars, ox, oy, rad * 1.5, rad * 0.58, 8, state.timeSec * 2.4);
      shapes.timingRings.appendCircle(ox, oy, rad * 1.85, rad * 1.85);
      hasPrismStars = true;
      hasTimingRings = true;
      continue;
    }

    const target = getBandShape(orb.band);
    if (orb.isArcOrb) {
      target
        .moveTo(ox, oy - rad * 1.35)
        .lineTo(ox + rad * 1.35, oy)
        .lineTo(ox, oy + rad * 1.35)
        .lineTo(ox - rad * 1.35, oy)
        .close();
    } else {
      target.appendCircle(ox, oy, rad, rad);
    }

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

  // Paint all 3 frequency band layers with crisp, vibrant neon core & bright stroke
  const bandsOrder: ResonanceFormType[] = ['bass', 'synth', 'treble'];
  for (const b of bandsOrder) {
    if (!hasBandContent[b]) continue;
    const [br, bgc, bb] = FORM_CONFIG[b].rgb;
    const shape = b === 'bass' ? shapes.bandBass : b === 'synth' ? shapes.bandSynth : shapes.bandTreble;
    shape
      .fill(br, bgc, bb, 240)
      .stroke({
        width: tw(isOverdrive ? 2.7 : 2.4),
        color: isOverdrive ? [255, 238, 120, 255] : [255, 255, 255, 248],
      });
  }

  if (hasPrismStars) {
    shapes.prismStars
      .fill(255, 232, 70, 248)
      .stroke({ width: tw(2.8), color: [255, 255, 255, 255] });
  }
  if (hasTimingRings) {
    shapes.timingRings.stroke({ width: tw(2.1), color: [255, 238, 120, 215] });
  }

  // 5. Ground Beat Traps (Crimson Spikes) & Aerial BeatDrones (Spinning 4-Blade Spiked Rotors)
  for (const trap of traps) {
    if (trap.destroyed) continue;
    const sx = tx(trap.worldX - cameraX);
    if (sx < -cullPad || sx > width + cullPad) continue;

    if (trap.isAerialDrone) {
      const cy = ty(
        (trap as BeatTrap & { screenFloorY?: number }).screenFloorY ?? height * 0.55
      );
      const outerR = ts(trap.width * 0.64);
      const innerR = outerR * 0.34;
      appendStarPath(shapes.traps, sx, cy, outerR, innerR, 4, state.timeSec * 6.5 + trap.id);
      shapes.traps.appendCircle(sx, cy, innerR * 0.72, innerR * 0.72);
      hasTraps = true;
      continue;
    }

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
    shapes.traps.fill(255, 45, 95, 236).stroke({ width: tw(2.1), color: [255, 215, 225, 255] });
  }
}
