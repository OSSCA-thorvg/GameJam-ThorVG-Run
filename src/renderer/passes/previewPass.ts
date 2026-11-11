import { FORM_CONFIG, type ResonanceFormType } from '../../types/game';
import { appendStarPath } from './playerGeometry';
import { resetWorldShapeLayers, type TvgShapePool } from './shapePool';

export interface PreviewPlayerAnchor {
  playerX: number;
  playerY: number;
  runCycle: number;
}

const BAND_CYCLE: readonly ResonanceFormType[] = ['bass', 'synth', 'treble'];

/**
 * Stateless Start-Menu Preview Render Pass:
 * Draws scrolling cyber grid, stepped sprint decks, 3-band neon notes & 2F sky platforms,
 * sample SlamPad & Prism Star, and returns the preview player anchor.
 */
export function renderMenuPreviewPass(
  shapes: TvgShapePool,
  width: number,
  height: number,
  timeSec: number,
  previewForm: ResonanceFormType,
  previewSpeedPxPerSec: number
): PreviewPlayerAnchor {
  const formCfg = FORM_CONFIG[previewForm];
  const [r, g, b] = formCfg.rgb;

  // 1. Deep cyber background
  shapes.bg.reset().appendRect(0, 0, width, height).fill(9, 11, 22, 255);

  // 2. Fast-scrolling neon rhythm grid
  shapes.grid.reset();
  const gridSpacing = 72;
  const scrollPx = timeSec * previewSpeedPxPerSec;
  const scrollOffset = scrollPx % gridSpacing;
  for (let x = -scrollOffset; x <= width; x += gridSpacing) {
    shapes.grid.moveTo(x, 0).lineTo(x, height);
  }
  for (let y = 80; y < height; y += gridSpacing) {
    shapes.grid.moveTo(0, y).lineTo(width, y);
  }
  shapes.grid.stroke({ width: 1, color: [35, 55, 95, 105] });

  // 3. Flat Stepped Sprint Decks + 3-Color Band Notes + Sample 2F Sky Platform + Prism Star
  const baseFloorY = height * 0.7;
  const tileW = 240;
  const firstTile = Math.floor(scrollPx / tileW) - 1;
  const tileCount = Math.ceil(width / tileW) + 3;

  resetWorldShapeLayers(shapes);
  shapes.effects.reset();
  shapes.vfxGold.reset();
  shapes.vfxCyan.reset();
  shapes.vfxCrimson.reset();

  const hasBand: Record<ResonanceFormType, boolean> = { bass: false, synth: false, treble: false };
  let hasGimmicks = false;
  let hasRings = false;
  let hasStars = false;

  for (let i = 0; i < tileCount; i++) {
    const tileIdx = firstTile + i;
    const x0 = tileIdx * tileW - scrollPx;
    const x1 = x0 + tileW;
    const mod = ((tileIdx % 7) + 7) % 7;
    const isGap = mod === 5;
    const deckStep = mod === 2 || mod === 3 ? -36 : 0;
    const y = baseFloorY + deckStep;
    const tileBand = BAND_CYCLE[((tileIdx % 3) + 3) % 3]!;
    const bandShape =
      tileBand === 'bass'
        ? shapes.bandBass
        : tileBand === 'synth'
          ? shapes.bandSynth
          : shapes.bandTreble;

    if (!isGap) {
      shapes.waveFill
        .moveTo(x0, height)
        .lineTo(x0, y)
        .lineTo(x1, y)
        .lineTo(x1, height)
        .close();
      shapes.waveGlow.moveTo(x0, y).lineTo(x1, y);
      shapes.waveCore.moveTo(x0, y).lineTo(x1, y);

      for (let bIdx = 0; bIdx < 3; bIdx++) {
        const barW = tileW * 0.18;
        const bx = x0 + (bIdx + 0.25) * (tileW / 3);
        const pulse = 0.35 + 0.45 * Math.abs(Math.sin(timeSec * 5.2 + tileIdx * 0.9 + bIdx));
        const barH = Math.max(20, (height - y - 16) * pulse);
        shapes.spectrum.appendRect(bx, height - barH, barW, barH, { rx: 2, ry: 2 });
      }

      const orbX = (x0 + x1) * 0.5;
      const orbY = y - 34;
      bandShape.appendCircle(orbX, orbY, 9, 9);
      hasBand[tileBand] = true;

      if (orbX > width * 0.24 && orbX < width * 0.85) {
        const shrinkRatio = Math.max(0, Math.min(1, (orbX - width * 0.24) / (width * 0.55)));
        const ringR = 9 * (1.15 + shrinkRatio * 1.85);
        shapes.timingRings.appendCircle(orbX, orbY, ringR, ringR);
        hasRings = true;
      }
    }

    if (mod === 4) {
      const padX = x1 - 36;
      shapes.gimmicks.appendRect(padX - 18, y - 9, 36, 9, { rx: 3, ry: 3 });
      hasGimmicks = true;
    }
    if (mod === 5) {
      const skyY = baseFloorY - 122;
      shapes.bandSynth.appendRect(x0 - 20, skyY, tileW + 40, 10, { rx: 4, ry: 4 });
      hasBand.synth = true;
      appendStarPath(shapes.prismStars, (x0 + x1) * 0.5, skyY - 42, 18, 7.5, 8, timeSec * 2.4);
      hasStars = true;
    }
  }

  shapes.waveFill.fill(r, g, b, 38);
  shapes.spectrum.fill(r, g, b, 68);
  shapes.waveGlow.stroke({ width: 9, color: [r, g, b, 105] });
  shapes.waveCore.stroke({ width: 3.4, color: [255, 255, 255, 242] });

  for (const bName of BAND_CYCLE) {
    if (!hasBand[bName]) continue;
    const [br, bgc, bb] = FORM_CONFIG[bName].rgb;
    const target =
      bName === 'bass'
        ? shapes.bandBass
        : bName === 'synth'
          ? shapes.bandSynth
          : shapes.bandTreble;
    target.fill(br, bgc, bb, 228).stroke({ width: 2.1, color: [255, 255, 255, 245] });
  }

  if (hasGimmicks) {
    shapes.gimmicks
      .fill(255, 224, 65, 200)
      .stroke({ width: 2.2, color: [255, 250, 190, 245] });
  }
  if (hasStars) {
    shapes.prismStars
      .fill(255, 232, 70, 248)
      .stroke({ width: 2.4, color: [255, 255, 255, 255] });
  }
  if (hasRings) {
    shapes.timingRings.stroke({ width: 2, color: [255, 238, 120, 205] });
  }

  const playerX = width * 0.24;
  const playerTile = Math.floor((scrollPx + playerX) / tileW);
  const playerMod = ((playerTile % 7) + 7) % 7;
  const hopOffset = playerMod === 5 ? -135 : playerMod === 2 || playerMod === 3 ? -36 : 0;
  const playerY = baseFloorY + hopOffset - 22;
  const runCycle = timeSec * (previewSpeedPxPerSec / 460);

  return { playerX, playerY, runCycle };
}
