import type { Shape as TvgShape } from '@thorvg/webcanvas';
import {
  FORM_CONFIG,
  type CrewmateSkinId,
  type ResonanceFormType,
} from '../../types/game';

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

const FLAWLESS_CHEVRON_VERTS: ReadonlyArray<readonly [number, number]> = [
  [1.28, 0],
  [-0.88, 0.84],
  [-0.34, 0.22],
  [-0.68, 0],
  [-0.34, -0.22],
  [-0.88, -0.84],
];

/** Exact 4-segment cubic Bezier circle/ellipse control ratio (4 * (sqrt(2) - 1) / 3). */
const BEZIER_KAPPA = 0.55228475;

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

/**
 * Appends pure-vector skin-specific afterimage trail geometry (`0KB` procedural):
 * - `'classic'`: active playstyle polygon (`bass` hex / `synth` diamond / `treble` delta)
 * - `'prism'`: 8-point crystalline Valkyrie star
 * - `'flawless'`: 6-vertex tactical Cyber Aegis chevron-wing
 * - `'grandmaster'`: 6-point royal Solar Crest + counter-wound inner diamond core
 */
export function appendSkinAfterimagePath(
  shape: TvgShape,
  cx: number,
  cy: number,
  radius: number,
  rotation: number,
  form: ResonanceFormType,
  skinId: CrewmateSkinId = 'classic'
): void {
  if (skinId === 'classic') {
    appendPolygonPath(shape, cx, cy, radius, rotation, form);
    return;
  }

  if (skinId === 'prism') {
    appendStarPath(shape, cx, cy, radius * 1.08, radius * 0.42, 8, rotation);
    return;
  }

  if (skinId === 'flawless') {
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    for (let i = 0; i < FLAWLESS_CHEVRON_VERTS.length; i++) {
      const [nx, ny] = FLAWLESS_CHEVRON_VERTS[i]!;
      const lx = nx * radius;
      const ly = ny * radius;
      const vx = cx + lx * cos - ly * sin;
      const vy = cy + lx * sin + ly * cos;
      if (i === 0) shape.moveTo(vx, vy);
      else shape.lineTo(vx, vy);
    }
    shape.close();
    return;
  }

  // 'grandmaster': 6-point royal solar crest + counter-wound inner diamond core
  appendStarPath(shape, cx, cy, radius * 1.14, radius * 0.5, 6, rotation);
  const coreR = radius * 0.42;
  for (let i = 0; i < 4; i++) {
    const angle = rotation - (i * Math.PI) / 2;
    const vx = cx + Math.cos(angle) * coreR;
    const vy = cy + Math.sin(angle) * coreR;
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

export interface CrewmateSkinOrnamentParams {
  playerGlowShape: TvgShape;
  playerCoreShape: TvgShape;
  skinFrontShape: TvgShape;
  skinFrontGlowShape: TvgShape;
  cx: number;
  cy: number;
  radius: number;
  rotation: number;
  form: ResonanceFormType;
  skinId: CrewmateSkinId;
  alphaRatio: number;
  combo: number;
  timeSec: number;
  overdriveActive: boolean;
}

/**
 * Renders 100% mathematical (`0KB` asset) vector wings, thrusters, sovereign mantles,
 * tiaras, cyber halos, imperial crowns, and orbiting solar shards synchronized to the
 * Crewmate's bounding box (`lx in [-0.98, +0.98]`, helmet top `ly = -1.30`) and blink alpha.
 */
export function drawCrewmateSkinOrnaments(params: CrewmateSkinOrnamentParams): void {
  const {
    playerGlowShape,
    playerCoreShape,
    skinFrontShape,
    skinFrontGlowShape,
    cx,
    cy,
    radius,
    rotation,
    form,
    skinId,
    alphaRatio,
    combo,
    timeSec,
    overdriveActive,
  } = params;

  playerGlowShape.reset();
  playerCoreShape.reset();
  skinFrontShape.reset();
  skinFrontGlowShape.reset();

  if (radius <= 0.5 || alphaRatio <= 0.01) return;

  const [ar, ag, ab] = overdriveActive ? [255, 232, 85] : FORM_CONFIG[form].rgb;
  const sw = (baseAt24: number): number =>
    Math.max(0.85, Math.min(baseAt24 * 16, (radius / 24) * baseAt24));
  const clampAlpha = (a: number): number =>
    Math.max(0, Math.min(255, Math.round(a * alphaRatio)));

  // Always preserve playstyle shield aura + sacred combo halo on `playerGlowShape`
  appendPolygonPath(playerGlowShape, cx, cy, radius * 1.45, rotation, form);
  appendSacredComboHalo(playerGlowShape, cx, cy, radius, combo, timeSec, overdriveActive);

  if (skinId === 'classic') {
    playerGlowShape
      .fill(ar, ag, ab, clampAlpha(overdriveActive ? 95 : 68))
      .stroke({
        width: sw(overdriveActive ? 2.8 : 2.0),
        color: [ar, ag, ab, clampAlpha(215)],
      });
    return;
  }

  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const tx = (lx: number, ly: number): number => cx + (lx * cos - ly * sin) * radius;
  const ty = (lx: number, ly: number): number => cy + (lx * sin + ly * cos) * radius;

  const appendLocalPoly = (
    shape: TvgShape,
    pts: ReadonlyArray<readonly [number, number]>
  ): void => {
    for (let i = 0; i < pts.length; i++) {
      const [lx, ly] = pts[i]!;
      const sx = tx(lx, ly);
      const sy = ty(lx, ly);
      if (i === 0) shape.moveTo(sx, sy);
      else shape.lineTo(sx, sy);
    }
    shape.close();
  };

  const appendLocalDiamond = (
    shape: TvgShape,
    cxL: number,
    cyL: number,
    dx: number,
    dy: number,
    clockwise: boolean
  ): void => {
    if (clockwise) {
      appendLocalPoly(shape, [
        [cxL, cyL - dy],
        [cxL + dx, cyL],
        [cxL, cyL + dy],
        [cxL - dx, cyL],
      ]);
    } else {
      appendLocalPoly(shape, [
        [cxL, cyL - dy],
        [cxL - dx, cyL],
        [cxL, cyL + dy],
        [cxL + dx, cyL],
      ]);
    }
  };

  const appendLocalBezierFeather = (
    shape: TvgShape,
    rTop: readonly [number, number],
    u1: readonly [number, number],
    u2: readonly [number, number],
    tip: readonly [number, number],
    l1: readonly [number, number],
    l2: readonly [number, number],
    rBot: readonly [number, number]
  ): void => {
    shape
      .moveTo(tx(rTop[0], rTop[1]), ty(rTop[0], rTop[1]))
      .cubicTo(
        tx(u1[0], u1[1]),
        ty(u1[0], u1[1]),
        tx(u2[0], u2[1]),
        ty(u2[0], u2[1]),
        tx(tip[0], tip[1]),
        ty(tip[0], tip[1])
      )
      .cubicTo(
        tx(l1[0], l1[1]),
        ty(l1[0], l1[1]),
        tx(l2[0], l2[1]),
        ty(l2[0], l2[1]),
        tx(rBot[0], rBot[1]),
        ty(rBot[0], rBot[1])
      )
      .close();
  };

  const appendLocalTiltedEllipse = (
    shape: TvgShape,
    cxL: number,
    cyL: number,
    rxL: number,
    ryL: number,
    tiltRad: number,
    clockwise: boolean
  ): void => {
    const tc = Math.cos(tiltRad);
    const ts = Math.sin(tiltRad);
    const ex = (u: number, v: number): number => tx(cxL + u * tc - v * ts, cyL + u * ts + v * tc);
    const ey = (u: number, v: number): number => ty(cxL + u * tc - v * ts, cyL + u * ts + v * tc);
    const kx = rxL * BEZIER_KAPPA;
    const ky = ryL * BEZIER_KAPPA;

    if (clockwise) {
      shape
        .moveTo(ex(rxL, 0), ey(rxL, 0))
        .cubicTo(ex(rxL, ky), ey(rxL, ky), ex(kx, ryL), ey(kx, ryL), ex(0, ryL), ey(0, ryL))
        .cubicTo(ex(-kx, ryL), ey(-kx, ryL), ex(-rxL, ky), ey(-rxL, ky), ex(-rxL, 0), ey(-rxL, 0))
        .cubicTo(
          ex(-rxL, -ky),
          ey(-rxL, -ky),
          ex(-kx, -ryL),
          ey(-kx, -ryL),
          ex(0, -ryL),
          ey(0, -ryL)
        )
        .cubicTo(ex(kx, -ryL), ey(kx, -ryL), ex(rxL, -ky), ey(rxL, -ky), ex(rxL, 0), ey(rxL, 0))
        .close();
    } else {
      shape
        .moveTo(ex(rxL, 0), ey(rxL, 0))
        .cubicTo(ex(rxL, -ky), ey(rxL, -ky), ex(kx, -ryL), ey(kx, -ryL), ex(0, -ryL), ey(0, -ryL))
        .cubicTo(
          ex(-kx, -ryL),
          ey(-kx, -ryL),
          ex(-rxL, -ky),
          ey(-rxL, -ky),
          ex(-rxL, 0),
          ey(-rxL, 0)
        )
        .cubicTo(ex(-rxL, ky), ey(-rxL, ky), ex(-kx, ryL), ey(-kx, ryL), ex(0, ryL), ey(0, ryL))
        .cubicTo(ex(kx, ryL), ey(kx, ryL), ex(rxL, ky), ey(rxL, ky), ex(rxL, 0), ey(rxL, 0))
        .close();
    }
  };

  if (skinId === 'prism') {
    // PRISM VALKYRIE: 3 swept 3rd-order Bezier wing feathers (`lx` out to -2.44) + 3-spire Crystal Tiara
    const flap = Math.sin(timeSec * 8.5) * 0.16;

    // Outer wing aura echo on `playerGlowShape`
    appendLocalBezierFeather(
      playerGlowShape,
      [-0.58, -0.56],
      [-1.24, -1.10 + flap * 0.6],
      [-1.96, -1.24 + flap],
      [-2.54, -0.82 + flap * 1.15],
      [-1.98, -0.40 + flap * 0.85],
      [-1.24, -0.30 + flap * 0.35],
      [-0.60, -0.18]
    );
    playerGlowShape
      .fill(ar, ag, ab, clampAlpha(overdriveActive ? 95 : 70))
      .stroke({
        width: sw(overdriveActive ? 2.8 : 2.0),
        color: [ar, ag, ab, clampAlpha(218)],
      });

    // 3 swept Bezier Valkyrie wing feathers on `playerCoreShape`
    appendLocalBezierFeather(
      playerCoreShape,
      [-0.60, -0.52],
      [-1.20, -1.02 + flap * 0.6],
      [-1.90, -1.14 + flap],
      [-2.44, -0.78 + flap * 1.15],
      [-1.92, -0.44 + flap * 0.85],
      [-1.22, -0.34 + flap * 0.35],
      [-0.62, -0.22]
    );
    appendLocalBezierFeather(
      playerCoreShape,
      [-0.62, -0.18],
      [-1.18, -0.36 + flap * 0.45],
      [-1.74, -0.38 + flap * 0.85],
      [-2.18, -0.14 + flap],
      [-1.72, 0.08 + flap * 0.7],
      [-1.16, 0.06 + flap * 0.3],
      [-0.62, 0.08]
    );
    appendLocalBezierFeather(
      playerCoreShape,
      [-0.60, 0.12],
      [-1.08, 0.14 + flap * 0.35],
      [-1.50, 0.24 + flap * 0.65],
      [-1.84, 0.46 + flap * 0.85],
      [-1.44, 0.56 + flap * 0.6],
      [-1.02, 0.46 + flap * 0.25],
      [-0.56, 0.36]
    );
    playerCoreShape
      .fill(56, 189, 248, clampAlpha(238))
      .stroke({ width: sw(2.1), color: [255, 246, 190, clampAlpha(252)] });

    // Front: 3-spire crystalline Prism Tiara (`ly = -1.24` base up to `ly = -1.88` central peak)
    skinFrontShape
      .moveTo(tx(-0.44, -1.23), ty(-0.44, -1.23))
      .lineTo(tx(-0.46, -1.58), ty(-0.46, -1.58))
      .lineTo(tx(-0.23, -1.39), ty(-0.23, -1.39))
      .lineTo(tx(-0.02, -1.88), ty(-0.02, -1.88))
      .lineTo(tx(0.19, -1.39), ty(0.19, -1.39))
      .lineTo(tx(0.42, -1.58), ty(0.42, -1.58))
      .lineTo(tx(0.38, -1.23), ty(0.38, -1.23))
      .cubicTo(
        tx(0.14, -1.30),
        ty(0.14, -1.30),
        tx(-0.18, -1.30),
        ty(-0.18, -1.30),
        tx(-0.44, -1.23),
        ty(-0.44, -1.23)
      )
      .close();
    // Counter-wound center socket so `skinFrontGlowShape` renders a blazing gold crystal gem
    appendLocalDiamond(skinFrontShape, -0.02, -1.46, 0.105, 0.145, false);
    skinFrontShape
      .fill(56, 189, 248, clampAlpha(244))
      .stroke({ width: sw(1.95), color: [236, 252, 255, clampAlpha(255)] });

    // Glowing Gold Center Gem + Crystal Apex Starburst
    const gemPulse = 1 + 0.08 * Math.sin(timeSec * 6.5);
    appendLocalDiamond(
      skinFrontGlowShape,
      -0.02,
      -1.46,
      0.11 * gemPulse,
      0.15 * gemPulse,
      true
    );
    appendStarPath(
      skinFrontGlowShape,
      tx(-0.02, -1.90),
      ty(-0.02, -1.90),
      radius * 0.14 * gemPulse,
      radius * 0.045,
      4,
      rotation + timeSec * 2.2
    );
    skinFrontGlowShape
      .fill(255, 228, 42, clampAlpha(238))
      .stroke({ width: sw(1.35), color: [255, 250, 205, clampAlpha(242)] });
    return;
  }

  if (skinId === 'flawless') {
    // CYBER AEGIS: Twin Hex-Thruster Wing Blades (`lx = -2.34`) + Tilted Cyber Emerald Halo + Visor Crest
    const thrustPulse = Math.sin(timeSec * 15) * 0.08;

    // Outer plasma shock plumes on `playerGlowShape`
    appendLocalPoly(playerGlowShape, [
      [-1.05, -0.62],
      [-2.62 - thrustPulse, -0.82],
      [-1.85, -0.36],
    ]);
    appendLocalPoly(playerGlowShape, [
      [-1.05, 0.24],
      [-2.54 - thrustPulse, 0.64],
      [-1.78, 0.48],
    ]);
    playerGlowShape
      .fill(ar, ag, ab, clampAlpha(overdriveActive ? 95 : 70))
      .stroke({
        width: sw(overdriveActive ? 2.8 : 2.0),
        color: [ar, ag, ab, clampAlpha(218)],
      });

    // Upper & Lower Hex-Thruster Wing Blades + Central Stabilizer on `playerCoreShape`
    appendLocalPoly(playerCoreShape, [
      [-0.58, -0.48],
      [-1.14, -0.78],
      [-2.34, -0.68],
      [-2.02, -0.38],
      [-1.24, -0.28],
      [-0.60, -0.20],
    ]);
    appendLocalPoly(playerCoreShape, [
      [-0.60, 0.06],
      [-1.20, 0.14],
      [-1.98, 0.24],
      [-2.28, 0.48],
      [-1.12, 0.56],
      [-0.56, 0.32],
    ]);
    appendLocalPoly(playerCoreShape, [
      [-0.60, -0.13],
      [-1.58 - thrustPulse * 0.6, -0.05],
      [-1.36, 0.05],
      [-0.60, 0.01],
    ]);
    playerCoreShape
      .fill(52, 211, 153, clampAlpha(238))
      .stroke({ width: sw(2.05), color: [218, 255, 246, clampAlpha(252)] });

    // Front: Tilted hollow 3D Cyber Emerald Halo Ring (`ly = -1.56`) + V-shaped tactical visor crest
    const haloTilt = -0.11 + Math.sin(timeSec * 4.0) * 0.035;
    appendLocalTiltedEllipse(skinFrontShape, -0.03, -1.56, 0.76, 0.20, haloTilt, true);
    appendLocalTiltedEllipse(skinFrontShape, -0.03, -1.56, 0.50, 0.105, haloTilt, false);

    // Sleek V-shaped tactical visor crest centered near `(lx = +0.42, ly = -0.52)`
    appendLocalPoly(skinFrontShape, [
      [0.06, -0.60],
      [0.42, -0.45],
      [0.72, -0.68],
      [0.62, -0.47],
      [0.42, -0.32],
      [0.02, -0.49],
    ]);
    skinFrontShape
      .fill(52, 211, 153, clampAlpha(242))
      .stroke({ width: sw(1.85), color: [232, 255, 250, clampAlpha(255)] });

    // Additive emerald-cyan plasma exhaust jets (in unobstructed `lx < -1.20` back-space) + halo bloom
    appendLocalTiltedEllipse(skinFrontGlowShape, -0.03, -1.56, 0.80, 0.22, haloTilt, true);
    appendLocalTiltedEllipse(skinFrontGlowShape, -0.03, -1.56, 0.46, 0.09, haloTilt, false);
    appendLocalPoly(skinFrontGlowShape, [
      [-1.78, -0.64],
      [-2.68 - thrustPulse * 1.4, -0.76],
      [-1.96, -0.42],
    ]);
    appendLocalPoly(skinFrontGlowShape, [
      [-1.74, 0.28],
      [-2.60 - thrustPulse * 1.4, 0.56],
      [-1.88, 0.48],
    ]);
    appendLocalDiamond(skinFrontGlowShape, 0.42, -0.48, 0.09, 0.09, true);
    skinFrontGlowShape
      .fill(52, 211, 153, clampAlpha(185))
      .stroke({ width: sw(1.45), color: [165, 255, 235, clampAlpha(225)] });
    return;
  }

  // GRANDMASTER ('SOLAR EMPEROR'):
  // 5-Ray Solar Sovereign Wing-Mantle (`lx = -2.54`) + Counter-Rotating Sacred Ring +
  // 5-Spire Imperial Golden Crown (`ly = -1.24 .. -1.96`) with Crimson Ruby + 3 Orbiting Solar Shards
  const mantlePulse = Math.sin(timeSec * 6.0) * 0.07;

  // Counter-rotating 8-point sacred solar mandala star on `playerGlowShape`
  appendStarPath(
    playerGlowShape,
    cx,
    cy,
    radius * 1.98,
    radius * 1.46,
    8,
    rotation - timeSec * 1.85
  );
  playerGlowShape
    .fill(ar, ag, ab, clampAlpha(overdriveActive ? 98 : 74))
    .stroke({
      width: sw(overdriveActive ? 2.9 : 2.15),
      color: [ar, ag, ab, clampAlpha(225)],
    });

  // 5-Ray Curved Cubic-Bezier Solar Sovereign Wing-Mantle on `playerCoreShape`
  appendLocalBezierFeather(
    playerCoreShape,
    [-0.56, -0.62],
    [-1.16, -1.08],
    [-1.84, -1.22 + mantlePulse],
    [-2.38, -1.02 + mantlePulse],
    [-1.86, -0.72 + mantlePulse * 0.6],
    [-1.18, -0.58],
    [-0.58, -0.40]
  );
  appendLocalBezierFeather(
    playerCoreShape,
    [-0.60, -0.36],
    [-1.28, -0.66],
    [-1.98, -0.70 + mantlePulse * 0.5],
    [-2.52, -0.44 + mantlePulse * 0.5],
    [-1.94, -0.22],
    [-1.24, -0.18],
    [-0.62, -0.14]
  );
  appendLocalBezierFeather(
    playerCoreShape,
    [-0.62, -0.10],
    [-1.32, -0.22],
    [-2.04, -0.18],
    [-2.54 - mantlePulse * 0.5, 0.04],
    [-2.04, 0.22],
    [-1.32, 0.18],
    [-0.62, 0.10]
  );
  appendLocalBezierFeather(
    playerCoreShape,
    [-0.60, 0.14],
    [-1.24, 0.22],
    [-1.90, 0.34 - mantlePulse * 0.5],
    [-2.40, 0.56 - mantlePulse * 0.5],
    [-1.82, 0.64],
    [-1.18, 0.48],
    [-0.58, 0.32]
  );
  appendLocalBezierFeather(
    playerCoreShape,
    [-0.54, 0.36],
    [-1.08, 0.56],
    [-1.68, 0.78 - mantlePulse],
    [-2.12, 0.94 - mantlePulse],
    [-1.58, 0.90],
    [-1.04, 0.70],
    [-0.50, 0.52]
  );
  playerCoreShape
    .fill(255, 215, 0, clampAlpha(244))
    .stroke({ width: sw(2.2), color: [255, 240, 218, clampAlpha(255)] });

  // Front: 5-Spire Imperial Golden Crown (`ly = -1.24` band up to `ly = -1.96` central sovereign spire)
  skinFrontShape
    .moveTo(tx(-0.45, -1.22), ty(-0.45, -1.22))
    .lineTo(tx(-0.52, -1.66), ty(-0.52, -1.66))
    .lineTo(tx(-0.32, -1.40), ty(-0.32, -1.40))
    .lineTo(tx(-0.25, -1.82), ty(-0.25, -1.82))
    .lineTo(tx(-0.10, -1.44), ty(-0.10, -1.44))
    .lineTo(tx(-0.02, -1.96), ty(-0.02, -1.96))
    .lineTo(tx(0.06, -1.44), ty(0.06, -1.44))
    .lineTo(tx(0.21, -1.82), ty(0.21, -1.82))
    .lineTo(tx(0.28, -1.40), ty(0.28, -1.40))
    .lineTo(tx(0.48, -1.66), ty(0.48, -1.66))
    .lineTo(tx(0.41, -1.22), ty(0.41, -1.22))
    .cubicTo(
      tx(0.15, -1.30),
      ty(0.15, -1.30),
      tx(-0.19, -1.30),
      ty(-0.19, -1.30),
      tx(-0.45, -1.22),
      ty(-0.45, -1.22)
    )
    .close();
  // Sovereign sunburst finial jewel atop the central spire
  appendLocalDiamond(skinFrontShape, -0.02, -2.04, 0.065, 0.075, true);
  // Counter-wound Ruby Socket inside the golden crown band so crimson ruby glows purely
  appendLocalDiamond(skinFrontShape, -0.02, -1.43, 0.105, 0.135, false);

  // Crimson Center Ruby Jewel inside the crown socket
  const rubyPulse = 1 + 0.07 * Math.sin(timeSec * 7.2);
  appendLocalDiamond(
    skinFrontGlowShape,
    -0.02,
    -1.43,
    0.11 * rubyPulse,
    0.14 * rubyPulse,
    true
  );

  // 3 Orbiting Solar Diamond Shards (`orbitR = 1.68 * r`, `timeSec * 3.2 + i * 2pi/3`)
  const orbitR = 1.68;
  for (let i = 0; i < 3; i++) {
    const theta = timeSec * 3.2 + (i * Math.PI * 2) / 3;
    const ox = Math.cos(theta) * orbitR;
    const oy = Math.sin(theta) * orbitR;
    const ux = -Math.sin(theta);
    const uy = Math.cos(theta);
    const nx = Math.cos(theta);
    const ny = Math.sin(theta);

    const shardLong = 0.25;
    const shardShort = 0.125;
    appendLocalPoly(skinFrontShape, [
      [ox + ux * shardLong, oy + uy * shardLong],
      [ox + nx * shardShort, oy + ny * shardShort],
      [ox - ux * shardLong, oy - uy * shardLong],
      [ox - nx * shardShort, oy - ny * shardShort],
    ]);

    // Hollow crimson-rose solar corona wrapping each solid gold orbiting shard
    const glowLong = 0.34;
    const glowShort = 0.18;
    appendLocalPoly(skinFrontGlowShape, [
      [ox + ux * glowLong, oy + uy * glowLong],
      [ox + nx * glowShort, oy + ny * glowShort],
      [ox - ux * glowLong, oy - uy * glowLong],
      [ox - nx * glowShort, oy - ny * glowShort],
    ]);
    appendLocalPoly(skinFrontGlowShape, [
      [ox + ux * (shardLong * 0.92), oy + uy * (shardLong * 0.92)],
      [ox - nx * (shardShort * 0.92), oy - ny * (shardShort * 0.92)],
      [ox - ux * (shardLong * 0.92), oy - uy * (shardLong * 0.92)],
      [ox + nx * (shardShort * 0.92), oy + ny * (shardShort * 0.92)],
    ]);
  }

  skinFrontShape
    .fill(255, 224, 32, clampAlpha(248))
    .stroke({ width: sw(2.0), color: [255, 252, 220, clampAlpha(255)] });

  skinFrontGlowShape
    .fill(255, 38, 98, clampAlpha(236))
    .stroke({ width: sw(1.35), color: [255, 190, 212, clampAlpha(232)] });
}

/**
 * Draws the Resonance Form polygon or additive form-colored aura + sacred combo halo
 * behind the crewmate Lottie (used as fallback when Crewmate Lottie is unavailable).
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
