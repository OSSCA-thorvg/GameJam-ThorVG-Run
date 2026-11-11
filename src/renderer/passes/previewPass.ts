import { FORM_CONFIG, type ResonanceFormType } from '../../types/game';
import type { TvgShapePool } from './shapePool';

export interface PreviewPlayerAnchor {
  playerX: number;
  playerY: number;
  runCycle: number;
}

/**
 * Stateless Start-Menu Preview Render Pass:
 * Draws scrolling cyber grid, stepped sprint decks, sample 2F sky platform, jump pad,
 * beat notes with shrinking timing rings, and returns the preview player anchor.
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
  const [sr, sg, sb] = formCfg.secondaryRgb;

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

  // 3. Flat Stepped Sprint Decks + Sample 2F Sky Platform + Shrinking Timing Rings
  const baseFloorY = height * 0.7;
  const tileW = 240;
  const firstTile = Math.floor(scrollPx / tileW) - 1;
  const tileCount = Math.ceil(width / tileW) + 3;

  shapes.waveFill.reset();
  shapes.spectrum.reset();
  shapes.waveGlow.reset();
  shapes.waveCore.reset();
  shapes.platforms.reset();
  shapes.gimmicks.reset();
  shapes.timingRings.reset();
  shapes.orbs.reset();

  let hasPlatforms = false;
  let hasGimmicks = false;
  let hasRings = false;

  for (let i = 0; i < tileCount; i++) {
    const tileIdx = firstTile + i;
    const x0 = tileIdx * tileW - scrollPx;
    const x1 = x0 + tileW;
    const mod = ((tileIdx % 7) + 7) % 7;
    const isGap = mod === 5;
    const deckStep = mod === 2 || mod === 3 ? -36 : 0;
    const y = baseFloorY + deckStep;

    if (!isGap) {
      shapes.waveFill
        .moveTo(x0, height)
        .lineTo(x0, y)
        .lineTo(x1, y)
        .lineTo(x1, height)
        .close();
      shapes.waveGlow.moveTo(x0, y).lineTo(x1, y);
      shapes.waveCore.moveTo(x0, y).lineTo(x1, y);

      // Equalizer bars beneath solid sprint deck
      for (let bIdx = 0; bIdx < 3; bIdx++) {
        const barW = tileW * 0.18;
        const bx = x0 + (bIdx + 0.25) * (tileW / 3);
        const pulse = 0.35 + 0.45 * Math.abs(Math.sin(timeSec * 5.2 + tileIdx * 0.9 + bIdx));
        const barH = Math.max(20, (height - y - 16) * pulse);
        shapes.spectrum.appendRect(bx, height - barH, barW, barH, { rx: 2, ry: 2 });
      }

      // Beat Note + Shrinking Timing Ring
      const orbX = (x0 + x1) * 0.5;
      const orbY = y - 34;
      shapes.orbs.appendCircle(orbX, orbY, 8.5, 8.5);
      if (orbX > width * 0.24 && orbX < width * 0.85) {
        const shrinkRatio = Math.max(0, Math.min(1, (orbX - width * 0.24) / (width * 0.55)));
        const ringR = 8.5 * (1.15 + shrinkRatio * 1.85);
        shapes.timingRings.appendCircle(orbX, orbY, ringR, ringR);
        hasRings = true;
      }
    }

    // Preview 2F Sky Platform & JumpPad before the chasm
    if (mod === 4) {
      const padX = x1 - 36;
      shapes.gimmicks.appendRect(padX - 18, y - 9, 36, 9, { rx: 3, ry: 3 });
      hasGimmicks = true;
    }
    if (mod === 5) {
      const skyY = baseFloorY - 122;
      shapes.platforms.appendRect(x0 - 20, skyY, tileW + 40, 10, { rx: 4, ry: 4 });
      shapes.orbs.appendCircle((x0 + x1) * 0.5, skyY - 30, 9, 9);
      hasPlatforms = true;
    }
  }

  shapes.waveFill.fill(r, g, b, 38);
  shapes.spectrum.fill(r, g, b, 68);
  shapes.waveGlow.stroke({ width: 9, color: [r, g, b, 95] });
  shapes.waveCore.stroke({ width: 3.4, color: [255, 255, 255, 242] });
  if (hasPlatforms) {
    shapes.platforms
      .fill(sr, sg, sb, 155)
      .stroke({ width: 2.2, color: [255, 255, 255, 235] });
  }
  if (hasGimmicks) {
    shapes.gimmicks
      .fill(255, 224, 65, 200)
      .stroke({ width: 2.2, color: [255, 250, 190, 245] });
  }
  if (hasRings) {
    shapes.timingRings.stroke({ width: 2, color: [255, 238, 120, 205] });
  }
  shapes.orbs.fill(sr, sg, sb, 225).stroke({ width: 2, color: [255, 255, 255, 245] });

  shapes.traps.reset();
  shapes.portals.reset();
  shapes.effects.reset();
  shapes.particles.reset();

  const playerX = width * 0.24;
  const playerTile = Math.floor((scrollPx + playerX) / tileW);
  const playerMod = ((playerTile % 7) + 7) % 7;
  const hopOffset = playerMod === 5 ? -135 : playerMod === 2 || playerMod === 3 ? -36 : 0;
  const playerY = baseFloorY + hopOffset - 22;
  const runCycle = timeSec * (previewSpeedPxPerSec / 460);

  return { playerX, playerY, runCycle };
}
