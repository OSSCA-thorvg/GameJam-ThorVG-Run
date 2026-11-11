/**
 * Runtime unclipping & viewport-fit preparation for `powred.by.thorvg.1.json`
 * without modifying the raw asset file on disk (`src/logo/**` stays untouched).
 *
 * Root cause of clipping in the original 1920x1080 Lottie:
 * - Root layer `ind: 1` (`Rectangle 1`) is a 1920x1080 Alpha Track Matte.
 * - Root layer `ind: 2` (`ThorVG logo (NEW)`) is a 1920x1080 precomp whose internal
 *   `Intro Bolt` (scale 127%, top y ≈ -138), `Intro Ring 1` (scale 620%), and
 *   `Layer 17/ThorVG logo Outlines` protrude past [0..1920, 0..1080] and get chopped
 *   horizontally along y = 0 and y = 1080.
 *
 * Expanding the root composition, track matte, black backdrop, and precomp bounds by
 * (PAD_X = 640, PAD_Y = 720) -> (3200 x 2520) while shifting unparented precomp layers
 * via a Null parent (`ind: 9999`) preserves the exact centered animation while removing
 * all horizontal top/bottom clipping when rendered at 60% (`0.60`) of the viewport.
 */

export interface PreparedSplashLottie {
  json: string;
  width: number;
  height: number;
  coreWidth: number;
  coreHeight: number;
}

const CORE_W = 1920;
const CORE_H = 1080;
const PAD_X = 640;
const PAD_Y = 720;
const EXT_W = CORE_W + PAD_X * 2; // 3200
const EXT_H = CORE_H + PAD_Y * 2; // 2520
const OFFSET_NULL_IND = 9999;

interface LottieShapeItem {
  ty?: string;
  s?: { a?: number; k?: number[] };
  it?: LottieShapeItem[];
}

interface LottieLayer {
  ind?: number;
  nm?: string;
  ty?: number;
  parent?: number;
  w?: number;
  h?: number;
  ks?: {
    a?: { a?: number; k?: number[] };
    p?: { a?: number; k?: number[] };
  };
  shapes?: LottieShapeItem[];
}

interface LottieAsset {
  id?: string;
  w?: number;
  h?: number;
  layers?: LottieLayer[];
}

interface LottieRoot {
  w?: number;
  h?: number;
  op?: number;
  layers?: LottieLayer[];
  assets?: LottieAsset[];
}

export function prepareSplashLottie(rawJson: string): PreparedSplashLottie {
  try {
    const doc = JSON.parse(rawJson) as LottieRoot;
    const origW = typeof doc.w === 'number' && doc.w > 0 ? doc.w : CORE_W;
    const origH = typeof doc.h === 'number' && doc.h > 0 ? doc.h : CORE_H;
    const cx = origW * 0.5 + PAD_X;
    const cy = origH * 0.5 + PAD_Y;

    doc.w = EXT_W;
    doc.h = EXT_H;

    if (Array.isArray(doc.layers)) {
      for (const layer of doc.layers) {
        if (layer.ind === 1 && layer.ty === 4) {
          // Root Alpha Track Matte (`Rectangle 1`)
          if (layer.ks?.p && layer.ks.p.a === 0) {
            layer.ks.p.k = [cx, cy];
          }
          if (Array.isArray(layer.shapes)) {
            for (const sh of layer.shapes) {
              if (sh.ty === 'rc' && sh.s && sh.s.a === 0) {
                sh.s.k = [EXT_W, EXT_H];
              }
            }
          }
        } else if (layer.ind === 2 && layer.ty === 0) {
          // Precomp reference (`ThorVG logo (NEW)`)
          layer.w = EXT_W;
          layer.h = EXT_H;
          if (layer.ks?.a && layer.ks.a.a === 0) {
            layer.ks.a.k = [cx, cy];
          }
          if (layer.ks?.p && layer.ks.p.a === 0) {
            layer.ks.p.k = [cx, cy];
          }
        } else if (layer.ind === 3 && layer.ty === 4) {
          // Root solid black background (`Shape Layer 1`)
          if (layer.ks?.p && layer.ks.p.a === 0) {
            layer.ks.p.k = [cx, cy];
          }
          if (Array.isArray(layer.shapes)) {
            for (const grp of layer.shapes) {
              if (Array.isArray(grp.it)) {
                for (const item of grp.it) {
                  if (item.ty === 'rc' && item.s && item.s.a === 0) {
                    item.s.k = [EXT_W + 60, EXT_H + 60];
                  }
                }
              }
            }
          }
        }
      }
    }

    if (Array.isArray(doc.assets)) {
      for (const asset of doc.assets) {
        if (!Array.isArray(asset.layers) || asset.layers.length === 0) continue;
        for (const subLayer of asset.layers) {
          if (subLayer.parent === undefined) {
            subLayer.parent = OFFSET_NULL_IND;
          }
        }
        asset.layers.push({
          ty: 3,
          nm: 'UnclipOffset',
          ind: OFFSET_NULL_IND,
          // Cover full composition timeline
          ...({
            ip: 0,
            op: Math.max(300, (doc.op ?? 210) + 30),
            st: 0,
            sr: 1,
            ao: 0,
            ks: {
              a: { a: 0, k: [0, 0, 0] },
              p: { a: 0, k: [PAD_X, PAD_Y, 0] },
              s: { a: 0, k: [100, 100, 100] },
              r: { a: 0, k: 0 },
              o: { a: 0, k: 100 },
            },
          } as Record<string, unknown>),
        });
      }
    }

    return {
      json: JSON.stringify(doc),
      width: EXT_W,
      height: EXT_H,
      coreWidth: origW,
      coreHeight: origH,
    };
  } catch (err) {
    console.warn('prepareSplashLottie fallback to raw JSON:', err);
    return {
      json: rawJson,
      width: CORE_W,
      height: CORE_H,
      coreWidth: CORE_W,
      coreHeight: CORE_H,
    };
  }
}
