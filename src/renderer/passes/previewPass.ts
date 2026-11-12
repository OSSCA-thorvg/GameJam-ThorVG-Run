import { FORM_CONFIG, type ResonanceFormType, type SlashLane } from '../../types/game';
import {
  appendCutSeamQuad,
  appendHalfPolygonShard,
  appendHollowPolygonRing,
  appendRegularPolygonPath,
  appendStarPath,
  appendTaperedBlade,
} from './playerGeometry';
import { resetWorldShapeLayers, type TvgShapePool } from './shapePool';

export interface PreviewPlayerAnchor {
  playerX: number;
  playerY: number;
  runCycle: number;
  playerLane: SlashLane;
  playerRotation: number;
}

type PreviewTargetKind = 'low' | 'high' | 'chord' | 'prismHigh' | 'sawblade';

const PREVIEW_PATTERN: readonly PreviewTargetKind[] = [
  'low',
  'high',
  'low',
  'chord',
  'high',
  'low',
  'prismHigh',
  'sawblade',
];

/**
 * Stateless Start-Menu 2-Lane Rhythm Slasher Demo Render Pass:
 * Renders a live, beat-synchronized 2-Lane Slasher showcase in the background & left gutter:
 * - Continuous 1F neon stage deck + equalizer spectrum + 2F Cyan sky rail guide line
 * - Fixed Dual Neon Target Reticles (Cyan 2F HIGH, Crimson 1F LOW) + beat sync beam
 * - Incoming Cyan drones, Crimson hex cores, Twin Gold shield chords, Prism Stars & 1F Sawblades
 * - Periodic auto-slash 3rd-order Bezier katana arcs & NonZero vector polygon bisection shards!
 */
export function renderMenuPreviewPass(
  shapes: TvgShapePool,
  width: number,
  height: number,
  timeSec: number,
  previewForm: ResonanceFormType,
  previewSpeedPxPerSec: number
): PreviewPlayerAnchor {
  const speed = Math.max(360, previewSpeedPxPerSec);
  const formCfg = FORM_CONFIG[previewForm];
  const [r, g, b] = formCfg.rgb;

  // Unobstructed left-gutter preview anchor (at 1280x720: cardWidth=880, leftGutter=200 -> playerX=102, reticleX=148)
  const cardWidth = Math.min(width - 40, 880);
  const leftGutter = Math.max(0, (width - cardWidth) * 0.5);
  const basePlayerX =
    leftGutter >= 140 ? Math.min(width * 0.22, leftGutter * 0.51) : width * 0.20;
  const reticleX = basePlayerX + 46;

  const laneHighY = height * 0.45;
  const laneLowY = height * 0.69;
  const floorY = laneLowY + 22;

  // 1. Deep cyber background
  shapes.bg.reset().appendRect(0, 0, width, height).fill(9, 11, 22, 255);

  // 2. Fast-scrolling neon rhythm grid
  shapes.grid.reset().fill(0, 0, 0, 0);
  const gridSpacing = 72;
  const scrollPx = timeSec * speed;
  const scrollOffset = scrollPx % gridSpacing;
  for (let x = -scrollOffset; x <= width; x += gridSpacing) {
    shapes.grid.moveTo(x, 0).lineTo(x, height);
  }
  for (let y = 76; y < height; y += gridSpacing) {
    shapes.grid.moveTo(0, y).lineTo(width, y);
  }
  shapes.grid.stroke({ width: 1, color: [35, 55, 95, 98] });

  // Reset all pooled world & VFX layers cleanly with zero paint bleed
  resetWorldShapeLayers(shapes);
  shapes.effects.reset().fill(0, 0, 0, 0);
  shapes.vfxGold.reset().fill(0, 0, 0, 0);
  shapes.vfxCyan.reset().fill(0, 0, 0, 0);
  shapes.vfxCrimson.reset().fill(0, 0, 0, 0);
  shapes.vfxSlicedGold.reset().fill(0, 0, 0, 0);
  shapes.vfxSlicedCyan.reset().fill(0, 0, 0, 0);
  shapes.vfxSlicedCrimson.reset().fill(0, 0, 0, 0);
  shapes.vfxSlashGold.reset().fill(0, 0, 0, 0);
  shapes.vfxSlashCyan.reset().fill(0, 0, 0, 0);
  shapes.vfxSlashCrimson.reset().fill(0, 0, 0, 0);
  shapes.vfxSlashCore.reset().fill(0, 0, 0, 0);

  // 3. 2F Cyan Sky Rail Guide Line + Beat Pulse Ticks (`shapes.aurora`)
  const beatSpacing = 228;
  const beatPhase = ((scrollPx + reticleX) % beatSpacing) / beatSpacing;
  const beatPulse = Math.pow(Math.max(0, 1 - beatPhase * 2.2), 2);

  shapes.aurora.moveTo(0, laneHighY).lineTo(width, laneHighY);
  const tickStep = 114;
  const tickOffset = scrollPx % tickStep;
  for (let x = -tickOffset; x <= width + tickStep; x += tickStep) {
    const tickH = 5.5 + beatPulse * 3.5;
    shapes.aurora.moveTo(x, laneHighY - tickH).lineTo(x, laneHighY + tickH);
  }
  shapes.aurora
    .fill(0, 0, 0, 0)
    .stroke({ width: 1.9, color: [5, 213, 255, Math.round(86 + beatPulse * 48)] });

  // 4. Continuous 1F Neon Stage Deck + Equalizer Bars
  shapes.waveFill
    .moveTo(0, height)
    .lineTo(0, floorY)
    .lineTo(width, floorY)
    .lineTo(width, height)
    .close()
    .fill(r, g, b, 38)
    .stroke({ width: 0, color: [0, 0, 0, 0] });

  const specTileW = 190;
  const firstTile = Math.floor(scrollPx / specTileW) - 1;
  const tileCount = Math.ceil(width / specTileW) + 3;
  for (let i = 0; i < tileCount; i++) {
    const tileIdx = firstTile + i;
    const x0 = tileIdx * specTileW - scrollPx;
    for (let bIdx = 0; bIdx < 3; bIdx++) {
      const barW = specTileW * 0.19;
      const bx = x0 + (bIdx + 0.22) * (specTileW / 3);
      const eq = 0.28 + 0.50 * Math.abs(Math.sin(timeSec * 5.4 + tileIdx * 0.85 + bIdx));
      const bh = Math.max(16, (height - floorY - 14) * eq);
      shapes.spectrum.appendRect(bx, height - bh, barW, bh, { rx: 2, ry: 2 });
    }
  }
  shapes.spectrum.fill(r, g, b, 64).stroke({ width: 1, color: [r, g, b, 95] });

  shapes.waveGlow
    .moveTo(0, floorY)
    .lineTo(width, floorY)
    .moveTo(reticleX, laneLowY)
    .lineTo(width, laneLowY)
    .fill(0, 0, 0, 0)
    .stroke({ width: 7, color: [255, 42, 109, 92] });

  shapes.waveCore
    .moveTo(0, floorY)
    .lineTo(width, floorY)
    .fill(0, 0, 0, 0)
    .stroke({ width: 3.2, color: [255, 255, 255, 242] });

  // 5. Incoming Beat Targets, Auto-Slash Katana Arcs & Live Sliced Polygon Halves
  let hasBass = true;
  let hasSynth = true;
  let hasTreble = false;
  let hasWhiteCore = true;
  let hasPrismStars = false;
  let hasTimingRings = false;
  let hasTraps = false;

  let hasVfxGold = false;
  let hasVfxCyan = false;
  let hasVfxCrimson = false;
  let slicedGoldAlpha = 0;
  let slicedCyanAlpha = 0;
  let slicedCrimsonAlpha = 0;
  let hasSlashGold = false;
  let hasSlashCyan = false;
  let hasSlashCrimson = false;
  let hasSlashCore = false;

  let reticlePulseHigh = 0;
  let reticlePulseLow = 0;

  const firstBeat = Math.floor((scrollPx - 240) / beatSpacing);
  const lastBeat = Math.ceil((scrollPx + width + 140) / beatSpacing);

  for (let bIdx = firstBeat; bIdx <= lastBeat; bIdx++) {
    const kind = PREVIEW_PATTERN[((bIdx % PREVIEW_PATTERN.length) + PREVIEW_PATTERN.length) % PREVIEW_PATTERN.length]!;
    const worldX = bIdx * beatSpacing;
    const sx = worldX - scrollPx;
    const dx = sx - reticleX;
    const dtSec = dx / speed; // > 0 approaching reticle, < 0 past reticle

    if (kind === 'sawblade') {
      if (sx < -60 || sx > width + 60) continue;
      // 1F Serrated Sawblade scrolls past cleanly while Crewmate dodges on 2F HIGH
      const spin = -timeSec * 11 + bIdx;
      const rad = 18;
      const teeth = 10;
      const step = (Math.PI * 2) / teeth;
      for (let t = 0; t < teeth; t++) {
        const a0 = spin + t * step;
        const aTip = a0 + step * 0.28;
        const aGul = a0 + step * 0.74;
        const x0p = sx + Math.cos(a0) * (rad * 0.7);
        const y0p = laneLowY + Math.sin(a0) * (rad * 0.7);
        if (t === 0) shapes.traps.moveTo(x0p, y0p);
        else shapes.traps.lineTo(x0p, y0p);
        shapes.traps
          .lineTo(sx + Math.cos(aTip) * (rad * 1.22), laneLowY + Math.sin(aTip) * (rad * 1.22))
          .lineTo(sx + Math.cos(aGul) * (rad * 0.62), laneLowY + Math.sin(aGul) * (rad * 0.62));
      }
      shapes.traps.close();
      appendRegularPolygonPath(shapes.traps, sx, laneLowY, rad * 0.28, 8, -spin, false);
      hasTraps = true;
      continue;
    }

    if (dtSec > 0) {
      // Intact incoming beat target approaching the Dual Reticles
      if (sx > width + 60) continue;
      const rad = 16.5;

      if (dtSec <= 0.28) {
        const ratio = Math.max(0, Math.min(1, dtSec / 0.28));
        const ringR = rad * (1.08 + ratio * 1.45);
        if (kind === 'chord') {
          shapes.timingRings.appendCircle(sx, laneHighY, ringR, ringR);
          shapes.timingRings.appendCircle(sx, laneLowY, ringR, ringR);
        } else {
          const tyLane = kind === 'low' ? laneLowY : laneHighY;
          shapes.timingRings.appendCircle(sx, tyLane, ringR, ringR);
        }
        hasTimingRings = true;
      }

      if (kind === 'prismHigh') {
        appendStarPath(shapes.prismStars, sx, laneHighY, rad * 1.95, rad * 1.26, 8, timeSec * 2.5);
        appendRegularPolygonPath(shapes.prismStars, sx, laneHighY, rad * 1.06, 8, timeSec * 2.5, false);
        hasPrismStars = true;
      }

      if (kind === 'high' || kind === 'prismHigh') {
        shapes.bandSynth
          .moveTo(sx - rad * 1.32, laneHighY)
          .lineTo(sx + rad * 0.86, laneHighY - rad * 1.1)
          .lineTo(sx + rad * 0.42, laneHighY - rad * 0.28)
          .lineTo(sx + rad * 0.94, laneHighY)
          .lineTo(sx + rad * 0.42, laneHighY + rad * 0.28)
          .lineTo(sx + rad * 0.86, laneHighY + rad * 1.1)
          .close();
        appendRegularPolygonPath(shapes.gimmicks, sx - rad * 0.06, laneHighY, rad * 0.46, 4, 0, true);
      } else if (kind === 'low') {
        appendRegularPolygonPath(shapes.bandBass, sx, laneLowY, rad * 1.12, 6, 0, true);
        shapes.gimmicks.appendCircle(sx + rad * 0.14, laneLowY, rad * 0.34, rad * 0.34);
        shapes.gimmicks
          .moveTo(sx - rad * 0.1, laneLowY - rad * 0.42)
          .lineTo(sx - rad * 0.58, laneLowY)
          .lineTo(sx - rad * 0.1, laneLowY + rad * 0.42)
          .lineTo(sx - rad * 0.32, laneLowY)
          .close();
      } else if (kind === 'chord') {
        const octR = rad * 1.14;
        shapes.bandTreble.appendRect(
          sx - 4.5,
          laneHighY + octR * 0.78,
          9,
          laneLowY - laneHighY - octR * 1.56
        );
        shapes.gimmicks.appendRect(
          sx - 1.8,
          laneHighY + octR * 0.78,
          3.6,
          laneLowY - laneHighY - octR * 1.56
        );
        appendRegularPolygonPath(shapes.bandTreble, sx, laneHighY, octR, 8, Math.PI / 8, true);
        appendRegularPolygonPath(shapes.bandTreble, sx, laneLowY, octR, 8, Math.PI / 8, true);
        appendRegularPolygonPath(shapes.gimmicks, sx, laneHighY, octR * 0.46, 8, Math.PI / 8, true);
        appendRegularPolygonPath(shapes.gimmicks, sx, laneLowY, octR * 0.46, 8, Math.PI / 8, true);
        hasTreble = true;
      }
      continue;
    }

    // Target just crossed `reticleX` -> Auto-Slash Katana Arc + Vector Polygon Bisection!
    const age = -dtSec;
    if (age >= 0 && age <= 0.40) {
      const reticlePulse = Math.max(0, 1 - age / 0.18);
      if (kind === 'chord') {
        reticlePulseHigh = Math.max(reticlePulseHigh, reticlePulse);
        reticlePulseLow = Math.max(reticlePulseLow, reticlePulse);
      } else if (kind === 'low') {
        reticlePulseLow = Math.max(reticlePulseLow, reticlePulse);
      } else {
        reticlePulseHigh = Math.max(reticlePulseHigh, reticlePulse);
      }

      // Katana slash arc during first 0.16s
      if (age <= 0.16) {
        const p = age / 0.16;
        const ease = 1 - Math.pow(1 - p, 3);
        const thin = Math.pow(1 - p, 1.5);
        const halfLen = 68 * (0.45 + 0.65 * ease);
        const halfThick = 11 * thin;
        if (kind === 'chord') {
          const midY = (laneHighY + laneLowY) * 0.5;
          appendTaperedBlade(shapes.vfxSlashGold, reticleX, midY, -0.58, halfLen * 1.35, halfThick, 5);
          appendTaperedBlade(shapes.vfxSlashGold, reticleX, midY, 0.58, halfLen * 1.35, halfThick, -5);
          appendTaperedBlade(shapes.vfxSlashCore, reticleX, midY, -0.58, halfLen * 1.18, halfThick * 0.48, 2.5);
          appendTaperedBlade(shapes.vfxSlashCore, reticleX, midY, 0.58, halfLen * 1.18, halfThick * 0.48, -2.5);
          hasSlashGold = true;
          hasSlashCore = true;
        } else {
          const sy = kind === 'low' ? laneLowY : laneHighY;
          const angle = kind === 'low' ? 0.36 : -0.42;
          const bucket =
            kind === 'prismHigh'
              ? shapes.vfxSlashGold
              : kind === 'low'
                ? shapes.vfxSlashCrimson
                : shapes.vfxSlashCyan;
          if (kind === 'prismHigh') hasSlashGold = true;
          else if (kind === 'low') hasSlashCrimson = true;
          else hasSlashCyan = true;

          appendTaperedBlade(bucket, reticleX, sy, angle, halfLen, halfThick, halfThick * 0.5);
          appendTaperedBlade(
            shapes.vfxSlashCore,
            reticleX,
            sy,
            angle,
            halfLen * 0.88,
            halfThick * 0.48,
            halfThick * 0.25
          );
          hasSlashCore = true;
        }
      }

      // Expanding shockwave + 2 flying half-polygon shards (`vfxSliced*` NonZero)
      const progress = Math.min(1, age / 0.40);
      const alpha = Math.round(255 * Math.pow(1 - progress, 0.75));
      const centersY =
        kind === 'chord' ? [laneHighY, laneLowY] : [kind === 'low' ? laneLowY : laneHighY];
      const baseCutAngle = kind === 'low' ? 0.36 : kind === 'chord' ? -0.52 : -0.42;

      for (let cIdx = 0; cIdx < centersY.length; cIdx++) {
        const cy0 = centersY[cIdx]!;
        if (age <= 0.24) {
          const swP = age / 0.24;
          const swOuter = 16 + swP * 38;
          const swInner = Math.max(2, swOuter - 3.0);
          const swTarget =
            kind === 'chord' || kind === 'prismHigh'
              ? shapes.vfxGold
              : kind === 'low'
                ? shapes.vfxCrimson
                : shapes.vfxCyan;
          if (kind === 'chord' || kind === 'prismHigh') hasVfxGold = true;
          else if (kind === 'low') hasVfxCrimson = true;
          else hasVfxCyan = true;
          swTarget.appendCircle(reticleX, cy0, swOuter, swOuter);
          swTarget.appendCircle(reticleX, cy0, swInner, swInner);
        }

        const shardTarget =
          kind === 'chord' || kind === 'prismHigh'
            ? shapes.vfxSlicedGold
            : kind === 'low'
              ? shapes.vfxSlicedCrimson
              : shapes.vfxSlicedCyan;
        if (kind === 'chord' || kind === 'prismHigh') {
          slicedGoldAlpha = Math.max(slicedGoldAlpha, alpha);
        } else if (kind === 'low') {
          slicedCrimsonAlpha = Math.max(slicedCrimsonAlpha, alpha);
        } else {
          slicedCyanAlpha = Math.max(slicedCyanAlpha, alpha);
        }

        for (const side of [1, -1] as const) {
          const sep = 6 + age * 88;
          const nx = -Math.sin(baseCutAngle) * side;
          const ny = Math.cos(baseCutAngle) * side;
          const hx = reticleX - age * speed * 0.32 + nx * sep;
          const hy = cy0 + ny * sep + 0.5 * 360 * age * age;
          const spinAngle = baseCutAngle + side * age * 4.8;
          appendHalfPolygonShard(shardTarget, hx, hy, 16, spinAngle, side);
          if (progress < 0.70) {
            const seamRatio = 1 - progress / 0.70;
            appendCutSeamQuad(
              shapes.vfxSlashCore,
              hx,
              hy,
              16,
              spinAngle,
              side,
              0.9 + 2.2 * seamRatio,
              1.05
            );
            hasSlashCore = true;
          }
        }
      }
    }
  }

  // 6. Determine Active Player Demo Lane & Dual Neon Reticle Geometry
  const activeBeatIdx = Math.round((scrollPx + reticleX + beatSpacing * 0.18) / beatSpacing);
  const activeKind =
    PREVIEW_PATTERN[
      ((activeBeatIdx % PREVIEW_PATTERN.length) + PREVIEW_PATTERN.length) % PREVIEW_PATTERN.length
    ]!;
  const playerLane: SlashLane =
    activeKind === 'high' || activeKind === 'prismHigh' || activeKind === 'sawblade'
      ? 'high'
      : 'low';

  const rHigh = (playerLane === 'high' ? 22 : 19.5) * (1 + reticlePulseHigh * 0.38);
  const rLow = (playerLane === 'low' ? 22 : 19.5) * (1 + reticlePulseLow * 0.38);
  const rotH = timeSec * 1.0 + reticlePulseHigh * 0.4;
  const rotL = -timeSec * 1.0 - reticlePulseLow * 0.4;

  appendHollowPolygonRing(shapes.bandSynth, reticleX, laneHighY, rHigh * 1.18, rHigh * 0.96, 6, rotH);
  appendHollowPolygonRing(shapes.bandSynth, reticleX, laneHighY, rHigh * 0.62, rHigh * 0.46, 4, -rotH);
  appendHollowPolygonRing(shapes.bandBass, reticleX, laneLowY, rLow * 1.18, rLow * 0.96, 6, rotL);
  appendHollowPolygonRing(shapes.bandBass, reticleX, laneLowY, rLow * 0.62, rLow * 0.46, 4, -rotL);

  appendRegularPolygonPath(shapes.reticles, reticleX, laneHighY, rHigh * 1.28, 6, rotH, true);
  appendRegularPolygonPath(shapes.reticles, reticleX, laneLowY, rLow * 1.28, 6, rotL, true);
  shapes.reticles
    .moveTo(reticleX, laneHighY + rHigh * 1.22)
    .lineTo(reticleX, laneLowY - rLow * 1.22);

  // 7. Commit All Preview Paint Styles
  if (hasBass) {
    shapes.bandBass.fill(255, 42, 109, 236).stroke({ width: 2.1, color: [255, 230, 240, 248] });
  }
  if (hasSynth) {
    shapes.bandSynth.fill(5, 213, 255, 236).stroke({ width: 2.1, color: [225, 252, 255, 248] });
  }
  if (hasTreble) {
    shapes.bandTreble.fill(255, 226, 24, 242).stroke({ width: 2.3, color: [255, 252, 215, 252] });
  }
  if (hasWhiteCore) {
    shapes.gimmicks.fill(255, 255, 255, 248).stroke({ width: 1.4, color: [215, 248, 255, 240] });
  }
  if (hasPrismStars) {
    shapes.prismStars.fill(255, 232, 62, 246).stroke({ width: 2.2, color: [255, 255, 230, 255] });
  }
  if (hasTimingRings) {
    shapes.timingRings.fill(0, 0, 0, 0).stroke({ width: 2.0, color: [210, 248, 255, 205] });
  }
  if (hasTraps) {
    shapes.traps.fill(250, 48, 76, 240).stroke({ width: 2.0, color: [255, 212, 185, 250] });
  }

  const retPulse = Math.max(reticlePulseHigh, reticlePulseLow, beatPulse * 0.6);
  const retRgb: [number, number, number] =
    playerLane === 'high' ? [110, 236, 255] : [255, 118, 168];
  shapes.reticles
    .fill(0, 0, 0, 0)
    .stroke({
      width: 1.8 + retPulse * 1.2,
      color: [retRgb[0], retRgb[1], retRgb[2], Math.round(145 + retPulse * 95)],
    });

  if (hasVfxGold) {
    shapes.vfxGold
      .fillRule(shapes.evenOddRule)
      .fill(255, 230, 65, 215)
      .stroke({ width: 1.4, color: [255, 250, 190, 230] });
  }
  if (hasVfxCyan) {
    shapes.vfxCyan
      .fillRule(shapes.evenOddRule)
      .fill(5, 213, 255, 215)
      .stroke({ width: 1.4, color: [195, 248, 255, 230] });
  }
  if (hasVfxCrimson) {
    shapes.vfxCrimson
      .fillRule(shapes.evenOddRule)
      .fill(255, 45, 108, 215)
      .stroke({ width: 1.4, color: [255, 200, 220, 230] });
  }

  if (slicedGoldAlpha > 0) {
    shapes.vfxSlicedGold
      .fill(255, 226, 48, Math.round(slicedGoldAlpha * 0.9))
      .stroke({ width: 1.6, color: [255, 252, 200, slicedGoldAlpha] });
  }
  if (slicedCyanAlpha > 0) {
    shapes.vfxSlicedCyan
      .fill(5, 213, 255, Math.round(slicedCyanAlpha * 0.9))
      .stroke({ width: 1.6, color: [210, 250, 255, slicedCyanAlpha] });
  }
  if (slicedCrimsonAlpha > 0) {
    shapes.vfxSlicedCrimson
      .fill(255, 42, 109, Math.round(slicedCrimsonAlpha * 0.9))
      .stroke({ width: 1.6, color: [255, 205, 225, slicedCrimsonAlpha] });
  }

  if (hasSlashGold) {
    shapes.vfxSlashGold
      .fill(255, 230, 0, 225)
      .stroke({ width: 1.4, color: [255, 245, 150, 210] });
  }
  if (hasSlashCyan) {
    shapes.vfxSlashCyan
      .fill(5, 213, 255, 225)
      .stroke({ width: 1.4, color: [190, 248, 255, 210] });
  }
  if (hasSlashCrimson) {
    shapes.vfxSlashCrimson
      .fill(255, 42, 109, 225)
      .stroke({ width: 1.4, color: [255, 165, 198, 210] });
  }
  if (hasSlashCore) {
    shapes.vfxSlashCore
      .fill(255, 255, 255, 248)
      .stroke({ width: 1.1, color: [255, 255, 255, 225] });
  }

  const slashLunge = Math.max(reticlePulseHigh, reticlePulseLow) * 10;
  const playerX = basePlayerX + slashLunge;
  const targetY =
    activeKind === 'chord'
      ? (laneHighY + laneLowY) * 0.5
      : playerLane === 'high'
        ? laneHighY
        : laneLowY;
  const playerY = targetY + Math.sin(timeSec * 8.0) * 2.5;
  const playerRotation = playerLane === 'high' ? 0.06 : 0.09;
  const runCycle = timeSec * (speed / 440);

  return { playerX, playerY, runCycle, playerLane, playerRotation };
}
