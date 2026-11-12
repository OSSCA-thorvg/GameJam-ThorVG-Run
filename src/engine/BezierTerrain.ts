import {
  FLOOR_Y,
  LANE_HIGH_Y,
  LANE_LOW_Y,
  LEAD_IN_SEGMENTS,
  REFERENCE_HEIGHT,
  SEGMENT_WIDTH,
} from '../audio/TrackAnalyzer';
import type {
  BeatTarget,
  BezierSegment,
  FrequencyBands,
  ResonanceFormType,
  SectionIntensity,
  TrackBlueprint,
} from '../types/game';
import { evaluateBezierFloor } from './bezierMath';

const FORMS_ORDER: readonly ResonanceFormType[] = ['bass', 'synth', 'treble'];

type RuntimeTarget = BeatTarget & { baseY: number };

/**
 * Binary search lower-bound on sorted `BeatTarget`s (`item.worldX >= minX`).
 */
function lowerBoundWorldX<T extends { worldX: number }>(
  items: readonly T[],
  minX: number
): number {
  let lo = 0;
  let hi = items.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (items[mid]!.worldX < minX) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}

function isSlashKind(kind: BeatTarget['kind']): boolean {
  return (
    kind === 'high' ||
    kind === 'low' ||
    kind === 'chord' ||
    kind === 'hold' ||
    kind === 'rush'
  );
}

/**
 * Spatial Sliding-Window Streamer for the 2-Lane Rhythm Slasher Stage (`rhythm-slasher-v6`):
 * - Pre-sorts all `BeatTarget`s by `worldX` once on `loadBlueprint`
 * - Tracks `maxTargetSpan` so long `'hold'` ribbons & `'rush'` boss cores are never culled early
 * - Uses O(log N + K) binary-search range culling + zero-allocation reusable view buffers
 */
export class BezierTerrain {
  private allSegments: BezierSegment[] = [];
  private baseSegments: BezierSegment[] = [];
  private readonly visibleSegments: BezierSegment[] = [];

  private allTargets: RuntimeTarget[] = [];
  private maxTargetSpan: number = 0;
  private readonly visibleTargets: BeatTarget[] = [];

  private viewportHeight: number = REFERENCE_HEIGHT;
  private refHeight: number = REFERENCE_HEIGHT;
  private refLaneHighY: number = LANE_HIGH_Y;
  private refLaneLowY: number = LANE_LOW_Y;
  private refFloorY: number = FLOOR_Y;
  private segWidth: number = SEGMENT_WIDTH;
  private leadInSegments: number = LEAD_IN_SEGMENTS;
  private totalSlashTargets: number = 0;
  private totalStars: number = 0;
  private hasBlueprint: boolean = false;

  public loadBlueprint(
    blueprint: TrackBlueprint,
    viewportWidth: number,
    viewportHeight: number
  ): void {
    this.viewportHeight = viewportHeight;
    this.refHeight = blueprint.referenceHeight || REFERENCE_HEIGHT;
    this.refLaneHighY = blueprint.laneHighY || LANE_HIGH_Y;
    this.refLaneLowY = blueprint.laneLowY || LANE_LOW_Y;
    this.refFloorY = blueprint.floorY || FLOOR_Y;
    this.segWidth = blueprint.segmentWidth || SEGMENT_WIDTH;
    this.leadInSegments = blueprint.leadInSegments ?? LEAD_IN_SEGMENTS;
    this.hasBlueprint = true;

    const scaleY = viewportHeight / this.refHeight;

    this.baseSegments = blueprint.segments.map((s) => ({ ...s }));
    this.allSegments = blueprint.segments.map((s) => ({
      ...s,
      y0: s.y0 * scaleY,
      cx1: s.cx1 * scaleY,
      cy1: s.cy1 * scaleY,
      cx2: s.cx2 * scaleY,
      cy2: s.cy2 * scaleY,
      y1: s.y1 * scaleY,
    }));

    this.maxTargetSpan = 0;
    let slashCount = 0;
    let starCount = 0;

    this.allTargets = blueprint.targets
      .map((t) => {
        const span = Math.max(0, (t.endWorldX ?? t.worldX) - t.worldX);
        if (span > this.maxTargetSpan) this.maxTargetSpan = span;
        if (isSlashKind(t.kind)) slashCount++;
        if (t.isPrismStar) starCount++;
        return {
          ...t,
          baseY: t.worldY,
          screenY: t.worldY * scaleY,
          resolved: false,
          hitGrade: undefined,
          holdActive: false,
          holdNextTickSec: undefined,
          holdReleaseGraceSec: undefined,
          chordPartialLane: undefined,
          chordPartialSec: undefined,
          chordPartialSignedMs: undefined,
          rushHits: t.kind === 'rush' ? 0 : undefined,
        };
      })
      .sort((a, b) => a.worldX - b.worldX);

    this.totalSlashTargets = blueprint.totalSlashTargets || slashCount;
    this.totalStars = blueprint.totalStars || starCount;

    this.update(-viewportWidth * 0.25, viewportWidth, viewportHeight, 0, {
      low: 0.2,
      mid: 0.2,
      high: 0.2,
      overall: 0.2,
      isBeat: false,
    });
  }

  public reset(viewportWidth: number, viewportHeight: number): void {
    this.viewportHeight = viewportHeight;
    const scaleY = viewportHeight / this.refHeight;

    if (this.hasBlueprint && this.baseSegments.length > 0) {
      for (let i = 0; i < this.allSegments.length; i++) {
        const base = this.baseSegments[i]!;
        const seg = this.allSegments[i]!;
        seg.y0 = base.y0 * scaleY;
        seg.cy1 = base.cy1 * scaleY;
        seg.cy2 = base.cy2 * scaleY;
        seg.y1 = base.y1 * scaleY;
      }

      for (let i = 0; i < this.allTargets.length; i++) {
        const t = this.allTargets[i]!;
        t.screenY = t.baseY * scaleY;
        t.resolved = false;
        t.hitGrade = undefined;
        t.holdActive = false;
        t.holdNextTickSec = undefined;
        t.holdReleaseGraceSec = undefined;
        t.chordPartialLane = undefined;
        t.chordPartialSec = undefined;
        t.chordPartialSignedMs = undefined;
        t.rushHits = t.kind === 'rush' ? 0 : undefined;
      }

      this.update(-viewportWidth * 0.25, viewportWidth, viewportHeight, 0, {
        low: 0.2,
        mid: 0.2,
        high: 0.2,
        overall: 0.2,
        isBeat: false,
      });
      return;
    }

    // Minimal fallback stage if `reset()` is invoked before any blueprint is loaded
    this.baseSegments = [];
    this.allSegments = [];
    this.allTargets = [];
    this.leadInSegments = 4;
    const baseFloor = this.refFloorY * scaleY;

    for (let i = -this.leadInSegments; i < 40; i++) {
      const x0 = i * this.segWidth;
      const x1 = (i + 1) * this.segWidth;
      const baseSeg: BezierSegment = {
        x0,
        y0: this.refFloorY,
        cx1: x0 + this.segWidth * 0.35,
        cy1: this.refFloorY,
        cx2: x0 + this.segWidth * 0.65,
        cy2: this.refFloorY,
        x1,
        y1: this.refFloorY,
        energyBand: FORMS_ORDER[Math.abs(i) % FORMS_ORDER.length]!,
      };
      this.baseSegments.push(baseSeg);
      this.allSegments.push({
        ...baseSeg,
        y0: baseFloor,
        cy1: baseFloor,
        cy2: baseFloor,
        y1: baseFloor,
      });
    }

    this.totalSlashTargets = 0;
    this.totalStars = 0;
    this.visibleSegments.length = 0;
    this.visibleTargets.length = 0;
    const initialCount = Math.min(18, this.allSegments.length);
    for (let i = 0; i < initialCount; i++) {
      this.visibleSegments.push(this.allSegments[i]!);
    }
  }

  public update(
    cameraX: number,
    viewportWidth: number,
    viewportHeight: number,
    _timeSec: number,
    freq: FrequencyBands,
    viewWorldBounds?: { minX: number; maxX: number }
  ): void {
    this.viewportHeight = viewportHeight;
    const scaleY = viewportHeight / this.refHeight;
    const physMinX = cameraX - this.segWidth * 2;
    const physMaxX = cameraX + viewportWidth + this.segWidth * 4;
    const minX = viewWorldBounds ? viewWorldBounds.minX : physMinX;
    const maxX = viewWorldBounds ? viewWorldBounds.maxX : physMaxX;

    // 1. Direct index-calculated visible 1F neon deck segments (O(K), zero allocation)
    const startIdx = Math.max(0, Math.floor(minX / this.segWidth) + this.leadInSegments - 1);
    const endIdx = Math.min(
      this.allSegments.length - 1,
      Math.ceil(maxX / this.segWidth) + this.leadInSegments + 2
    );

    this.visibleSegments.length = 0;
    for (let i = startIdx; i <= endIdx; i++) {
      const seg = this.allSegments[i];
      const base = this.baseSegments[i];
      if (!seg || !base) continue;

      const isDrop = base.intensity === 'drop';
      const segPulse = freq.isBeat
        ? (isDrop ? 7.5 : 2.8) * scaleY
        : isDrop
          ? freq.low * 4.2 * scaleY
          : 0;

      seg.y0 = base.y0 * scaleY;
      seg.y1 = base.y1 * scaleY;
      seg.cy1 = base.cy1 * scaleY - segPulse;
      seg.cy2 = base.cy2 * scaleY - segPulse;
      this.visibleSegments.push(seg);
    }

    // 2. Visible unresolved BeatTargets — O(log N + K) accounting for `maxTargetSpan`
    this.visibleTargets.length = 0;
    const searchMinX = minX - this.maxTargetSpan - 180;
    const searchMaxX = maxX + 180;
    const firstIdx = lowerBoundWorldX(this.allTargets, searchMinX);

    for (let i = firstIdx; i < this.allTargets.length; i++) {
      const target = this.allTargets[i]!;
      if (target.worldX > searchMaxX) break;
      if (target.resolved) continue;
      const targetEndX = target.endWorldX ?? target.worldX;
      if (targetEndX < minX - 180) continue;

      target.screenY = target.baseY * scaleY;
      this.visibleTargets.push(target);
    }
  }

  public getLaneHighScreenY(): number {
    return this.refLaneHighY * (this.viewportHeight / this.refHeight);
  }

  public getLaneLowScreenY(): number {
    return this.refLaneLowY * (this.viewportHeight / this.refHeight);
  }

  public getFloorScreenY(): number {
    return this.refFloorY * (this.viewportHeight / this.refHeight);
  }

  public sampleFloor(worldX: number): {
    floorY: number;
    slope: number;
    angleRad: number;
    segment?: BezierSegment;
  } {
    const fallbackY = this.getFloorScreenY();
    const res = evaluateBezierFloor(this.visibleSegments, worldX, fallbackY);
    let matchedSeg: BezierSegment | undefined;
    for (let i = 0; i < this.visibleSegments.length; i++) {
      const seg = this.visibleSegments[i]!;
      if (worldX >= seg.x0 && worldX <= seg.x1) {
        matchedSeg = seg;
        break;
      }
    }
    return {
      ...res,
      segment: matchedSeg,
    };
  }

  public getSectionIntensityAt(worldX: number): SectionIntensity {
    const idx = Math.max(
      0,
      Math.min(
        this.allSegments.length - 1,
        Math.floor(worldX / this.segWidth) + this.leadInSegments
      )
    );
    return this.allSegments[idx]?.intensity ?? 'groove';
  }

  public getSegments(): BezierSegment[] {
    return this.visibleSegments;
  }

  public getTargets(): BeatTarget[] {
    return this.visibleTargets;
  }

  public getAllTargets(): BeatTarget[] {
    return this.allTargets;
  }

  public getTotalSlashTargetCount(): number {
    return this.totalSlashTargets;
  }

  public getTotalStarCount(): number {
    return this.totalStars;
  }

  public getMaxWorldX(): number {
    return this.allSegments.length > 0
      ? this.allSegments[this.allSegments.length - 1]!.x1
      : 0;
  }
}
