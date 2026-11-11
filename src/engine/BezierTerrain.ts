import { LEAD_IN_SEGMENTS, REFERENCE_HEIGHT, SEGMENT_WIDTH } from '../audio/TrackAnalyzer';
import type {
  BeatTrap,
  BezierSegment,
  DashRing,
  DivingNode,
  FrequencyBands,
  HoldRail,
  JumpPad,
  ResonanceFormType,
  ResonanceOrb,
  SectionIntensity,
  SkyPlatform,
  TrackBlueprint,
} from '../types/game';
import { evaluateBezierFloor } from './bezierMath';

const FORMS_ORDER: ResonanceFormType[] = ['bass', 'synth', 'treble'];

export type RuntimeTrap = BeatTrap & { screenFloorY?: number; baseDroneY?: number };

type RuntimeOrb = ResonanceOrb & { baseY: number; baseX: number };
type RuntimePortal = DivingNode & { baseY: number };
type RuntimeSkyPlatform = SkyPlatform & { baseY: number };
type RuntimeJumpPad = JumpPad & { baseY: number };
type RuntimeDashRing = DashRing & { baseY: number };
type RuntimeHoldRail = HoldRail & { baseY: number };

/**
 * Binary search lower-bound on sorted point entities (`item.worldX >= minX`).
 * Achieves O(log N) lookup before O(K) visible range scan.
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

/**
 * Binary search lower-bound on sorted span entities (`item.x0 >= minStartX`).
 * Passing `minStartX = minX - maxSpan` guarantees every overlapping span (`x1 >= minX`) is visited in O(log N + K).
 */
function lowerBoundSpanX0<T extends { x0: number }>(
  items: readonly T[],
  minStartX: number
): number {
  let lo = 0;
  let hi = items.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (items[mid]!.x0 < minStartX) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}

/**
 * Spatial Sliding-Window Streamer for Hybrid Rhythm-Runner terrain:
 * - Pre-sorts all course entities by X coordinate once on `loadBlueprint`
 * - Inline-caches reference `baseY` on runtime entities (eliminating per-frame Map lookups)
 * - Uses O(log N + K) binary-search range culling + zero-allocation reusable view buffers
 */
export class BezierTerrain {
  private allSegments: BezierSegment[] = [];
  private baseSegments: BezierSegment[] = [];
  private readonly visibleSegments: BezierSegment[] = [];

  private allOrbs: RuntimeOrb[] = [];
  private readonly visibleOrbs: ResonanceOrb[] = [];

  private allTraps: RuntimeTrap[] = [];
  private readonly visibleTraps: RuntimeTrap[] = [];

  private allDivingNodes: RuntimePortal[] = [];
  private readonly visibleDivingNodes: DivingNode[] = [];

  private allSkyPlatforms: RuntimeSkyPlatform[] = [];
  private maxSkySpan: number = 0;
  private readonly visibleSkyPlatforms: SkyPlatform[] = [];

  private allJumpPads: RuntimeJumpPad[] = [];
  private readonly visibleJumpPads: JumpPad[] = [];

  private allDashRings: RuntimeDashRing[] = [];
  private readonly visibleDashRings: DashRing[] = [];

  private allHoldRails: RuntimeHoldRail[] = [];
  private maxRailSpan: number = 0;
  private readonly visibleHoldRails: HoldRail[] = [];

  private viewportHeight: number = REFERENCE_HEIGHT;
  private refHeight: number = REFERENCE_HEIGHT;
  private segWidth: number = SEGMENT_WIDTH;
  private leadInSegments: number = LEAD_IN_SEGMENTS;
  private hasBlueprint: boolean = false;

  public loadBlueprint(
    blueprint: TrackBlueprint,
    viewportWidth: number,
    viewportHeight: number
  ): void {
    this.viewportHeight = viewportHeight;
    this.refHeight = blueprint.referenceHeight || REFERENCE_HEIGHT;
    this.segWidth = blueprint.segmentWidth || SEGMENT_WIDTH;
    this.leadInSegments = blueprint.leadInSegments ?? LEAD_IN_SEGMENTS;
    this.hasBlueprint = true;

    const scaleY = viewportHeight / this.refHeight;

    this.baseSegments = blueprint.segments.map((s) => ({ ...s }));
    this.allSegments = blueprint.segments.map((s) => ({
      ...s,
      y0: s.y0 * scaleY,
      cy1: s.cy1 * scaleY,
      cy2: s.cy2 * scaleY,
      y1: s.y1 * scaleY,
    }));

    this.allOrbs = blueprint.orbs
      .map((o) => ({
        ...o,
        baseX: o.worldX,
        baseY: o.worldY,
        collected: false,
        screenY: o.worldY * scaleY,
      }))
      .sort((a, b) => a.worldX - b.worldX);

    this.allTraps = blueprint.traps
      .map((t) => ({
        ...t,
        baseDroneY: t.droneWorldY,
        destroyed: false,
        passed: false,
        screenFloorY:
          t.isAerialDrone && t.droneWorldY !== undefined
            ? t.droneWorldY * scaleY
            : ((t as RuntimeTrap).screenFloorY ?? this.refHeight * 0.7) * scaleY,
      }))
      .sort((a, b) => a.worldX - b.worldX);

    this.allDivingNodes = blueprint.divingNodes
      .map((n) => ({
        ...n,
        baseY: n.worldY,
        worldY: n.worldY * scaleY,
        activated: false,
      }))
      .sort((a, b) => a.worldX - b.worldX);

    this.maxSkySpan = 0;
    this.allSkyPlatforms = (blueprint.skyPlatforms ?? [])
      .map((p) => {
        const span = Math.max(0, p.x1 - p.x0);
        if (span > this.maxSkySpan) this.maxSkySpan = span;
        return {
          ...p,
          baseY: p.worldY,
          screenY: p.worldY * scaleY,
        };
      })
      .sort((a, b) => a.x0 - b.x0);

    this.allJumpPads = (blueprint.jumpPads ?? [])
      .map((jp) => ({
        ...jp,
        baseY: jp.worldY,
        triggered: false,
        screenY: jp.worldY * scaleY,
      }))
      .sort((a, b) => a.worldX - b.worldX);

    this.allDashRings = (blueprint.dashRings ?? [])
      .map((dr) => ({
        ...dr,
        baseY: dr.worldY,
        triggered: false,
        screenY: dr.worldY * scaleY,
      }))
      .sort((a, b) => a.worldX - b.worldX);

    this.maxRailSpan = 0;
    this.allHoldRails = (blueprint.holdRails ?? [])
      .map((hr) => {
        const span = Math.max(0, hr.x1 - hr.x0);
        if (span > this.maxRailSpan) this.maxRailSpan = span;
        return {
          ...hr,
          baseY: hr.worldY,
          active: false,
          completed: false,
          screenY: hr.worldY * scaleY,
        };
      })
      .sort((a, b) => a.x0 - b.x0);

    this.update(-viewportWidth * 0.24, viewportWidth, viewportHeight, 0, {
      low: 0.2,
      mid: 0.2,
      high: 0.2,
      overall: 0.2,
      isBeat: false,
    });
  }

  public reset(viewportWidth: number, viewportHeight: number): void {
    this.viewportHeight = viewportHeight;
    if (this.hasBlueprint && this.baseSegments.length > 0) {
      const scaleY = viewportHeight / this.refHeight;
      for (let i = 0; i < this.allSegments.length; i++) {
        const base = this.baseSegments[i]!;
        const seg = this.allSegments[i]!;
        seg.y0 = base.y0 * scaleY;
        seg.cy1 = base.cy1 * scaleY;
        seg.cy2 = base.cy2 * scaleY;
        seg.y1 = base.y1 * scaleY;
      }
      for (let i = 0; i < this.allOrbs.length; i++) {
        const orb = this.allOrbs[i]!;
        orb.collected = false;
        orb.worldX = orb.baseX;
        orb.screenY = orb.baseY * scaleY;
      }
      for (let i = 0; i < this.allTraps.length; i++) {
        const trap = this.allTraps[i]!;
        trap.destroyed = false;
        trap.passed = false;
        if (trap.isAerialDrone && trap.baseDroneY !== undefined) {
          trap.screenFloorY = trap.baseDroneY * scaleY;
        }
      }
      for (let i = 0; i < this.allDivingNodes.length; i++) {
        const node = this.allDivingNodes[i]!;
        node.activated = false;
        node.worldY = node.baseY * scaleY;
      }
      for (let i = 0; i < this.allSkyPlatforms.length; i++) {
        const plat = this.allSkyPlatforms[i]!;
        plat.screenY = plat.baseY * scaleY;
      }
      for (let i = 0; i < this.allJumpPads.length; i++) {
        const pad = this.allJumpPads[i]!;
        pad.triggered = false;
        pad.screenY = pad.baseY * scaleY;
      }
      for (let i = 0; i < this.allDashRings.length; i++) {
        const ring = this.allDashRings[i]!;
        ring.triggered = false;
        ring.screenY = ring.baseY * scaleY;
      }
      for (let i = 0; i < this.allHoldRails.length; i++) {
        const rail = this.allHoldRails[i]!;
        rail.active = false;
        rail.completed = false;
        rail.screenY = rail.baseY * scaleY;
      }
      this.update(-viewportWidth * 0.24, viewportWidth, viewportHeight, 0, {
        low: 0.2,
        mid: 0.2,
        high: 0.2,
        overall: 0.2,
        isBeat: false,
      });
      return;
    }

    // Minimal flat sprint fallback
    this.baseSegments = [];
    this.allSegments = [];
    this.leadInSegments = 4;
    const baseFloor = viewportHeight * 0.7;
    for (let i = -this.leadInSegments; i < 40; i++) {
      const x0 = i * this.segWidth;
      const x1 = (i + 1) * this.segWidth;
      const seg: BezierSegment = {
        x0,
        y0: baseFloor,
        cx1: x0 + this.segWidth * 0.35,
        cy1: baseFloor,
        cx2: x0 + this.segWidth * 0.65,
        cy2: baseFloor,
        x1,
        y1: baseFloor,
        energyBand: FORMS_ORDER[Math.abs(i) % FORMS_ORDER.length]!,
        isGap: false,
      };
      this.baseSegments.push({ ...seg });
      this.allSegments.push(seg);
    }

    this.visibleSegments.length = 0;
    const initialCount = Math.min(18, this.allSegments.length);
    for (let i = 0; i < initialCount; i++) {
      this.visibleSegments.push(this.allSegments[i]!);
    }
  }

  public update(
    cameraX: number,
    viewportWidth: number,
    viewportHeight: number,
    timeSec: number,
    freq: FrequencyBands
  ): void {
    this.viewportHeight = viewportHeight;
    const scaleY = viewportHeight / this.refHeight;
    const minX = cameraX - this.segWidth * 2;
    const maxX = cameraX + viewportWidth + this.segWidth * 4;

    // 1. Direct index-calculated visible segments (O(K), zero array allocation)
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
        ? (isDrop ? 9.5 : 3.0) * scaleY
        : isDrop
          ? freq.low * 5.0 * scaleY
          : 0;

      seg.y0 = base.y0 * scaleY;
      seg.y1 = base.y1 * scaleY;
      seg.cy1 = base.cy1 * scaleY - segPulse;
      seg.cy2 = base.cy2 * scaleY - segPulse;
      this.visibleSegments.push(seg);
    }

    const fallbackY = viewportHeight * 0.7;

    // 2. Visible Rhythm Beat Notes — O(log N + K) on immutable sorted `baseX` (safe under magnetic `worldX` pull!)
    this.visibleOrbs.length = 0;
    let loOrb = 0;
    let hiOrb = this.allOrbs.length;
    const orbMinBaseX = minX - 220;
    const orbMaxBaseX = maxX + 220;
    while (loOrb < hiOrb) {
      const mid = (loOrb + hiOrb) >>> 1;
      if (this.allOrbs[mid]!.baseX < orbMinBaseX) {
        loOrb = mid + 1;
      } else {
        hiOrb = mid;
      }
    }
    for (let i = loOrb; i < this.allOrbs.length; i++) {
      const orb = this.allOrbs[i]!;
      if (orb.baseX > orbMaxBaseX) break;
      if (orb.collected) continue;
      // Preserve magnetic vertical pull if already pulled away from default bobbing lane
      const naturalY = orb.baseY * scaleY + Math.sin(timeSec * 6 + orb.id * 0.5) * 2.5;
      if (orb.worldX === orb.baseX) {
        orb.screenY = naturalY;
      }
      this.visibleOrbs.push(orb);
    }

    // 3. Visible Beat Traps (Ground Spikes) & Aerial BeatDrones — O(log N + K)
    this.visibleTraps.length = 0;
    for (let i = lowerBoundWorldX(this.allTraps, minX); i < this.allTraps.length; i++) {
      const trap = this.allTraps[i]!;
      if (trap.worldX > maxX) break;
      if (trap.destroyed) continue;
      if (trap.isAerialDrone && trap.baseDroneY !== undefined) {
        trap.screenFloorY = trap.baseDroneY * scaleY + Math.sin(timeSec * 5.2 + trap.id) * 5.5;
      } else {
        const { floorY } = evaluateBezierFloor(this.visibleSegments, trap.worldX, fallbackY);
        trap.screenFloorY = floorY;
      }
      this.visibleTraps.push(trap);
    }

    // 4. Visible Frequency Diving Portals — O(log N + K)
    this.visibleDivingNodes.length = 0;
    for (
      let i = lowerBoundWorldX(this.allDivingNodes, minX);
      i < this.allDivingNodes.length;
      i++
    ) {
      const node = this.allDivingNodes[i]!;
      if (node.worldX > maxX) break;
      if (node.activated) continue;
      node.worldY = node.baseY * scaleY;
      this.visibleDivingNodes.push(node);
    }

    // 5. Visible 2F Sky Platforms — O(log N + K)
    this.visibleSkyPlatforms.length = 0;
    for (
      let i = lowerBoundSpanX0(this.allSkyPlatforms, minX - this.maxSkySpan);
      i < this.allSkyPlatforms.length;
      i++
    ) {
      const plat = this.allSkyPlatforms[i]!;
      if (plat.x0 > maxX) break;
      if (plat.x1 < minX) continue;
      plat.screenY = plat.baseY * scaleY;
      this.visibleSkyPlatforms.push(plat);
    }

    // 6. Visible Beat Jump Pads — O(log N + K)
    this.visibleJumpPads.length = 0;
    for (let i = lowerBoundWorldX(this.allJumpPads, minX); i < this.allJumpPads.length; i++) {
      const pad = this.allJumpPads[i]!;
      if (pad.worldX > maxX) break;
      pad.screenY = pad.baseY * scaleY;
      this.visibleJumpPads.push(pad);
    }

    // 7. Visible Airborne Dash Rings — O(log N + K)
    this.visibleDashRings.length = 0;
    for (let i = lowerBoundWorldX(this.allDashRings, minX); i < this.allDashRings.length; i++) {
      const ring = this.allDashRings[i]!;
      if (ring.worldX > maxX) break;
      if (ring.triggered) continue;
      ring.screenY = ring.baseY * scaleY;
      this.visibleDashRings.push(ring);
    }

    // 8. Visible Hold Note Rails — O(log N + K)
    this.visibleHoldRails.length = 0;
    for (
      let i = lowerBoundSpanX0(this.allHoldRails, minX - this.maxRailSpan);
      i < this.allHoldRails.length;
      i++
    ) {
      const rail = this.allHoldRails[i]!;
      if (rail.x0 > maxX) break;
      if (rail.x1 < minX) continue;
      rail.screenY = rail.baseY * scaleY;
      this.visibleHoldRails.push(rail);
    }
  }

  public sampleFloor(worldX: number): {
    floorY: number;
    slope: number;
    angleRad: number;
    isGap: boolean;
    segment?: BezierSegment;
  } {
    const fallbackY = this.viewportHeight * 0.7;
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
      isGap: Boolean(matchedSeg?.isGap),
      segment: matchedSeg,
    };
  }

  /**
   * One-way 2F Sky Platform collision: lands when crossing downward onto the platform surface
   * unless holding Fast-Drop (`dropThrough`).
   */
  public sampleSkyPlatform(
    worldX: number,
    prevBottomY: number,
    nextBottomY: number,
    dropThrough: boolean
  ): SkyPlatform | null {
    if (dropThrough) return null;
    for (let i = 0; i < this.visibleSkyPlatforms.length; i++) {
      const plat = this.visibleSkyPlatforms[i]!;
      if (worldX < plat.x0 - 10 || worldX > plat.x1 + 10) continue;
      const py = plat.screenY ?? plat.worldY;
      if (prevBottomY <= py + 16 && nextBottomY >= py - 2) {
        return plat;
      }
    }
    return null;
  }

  public getSectionIntensityAt(worldX: number): SectionIntensity {
    const { segment } = this.sampleFloor(worldX);
    return segment?.intensity ?? 'groove';
  }

  public getSegments(): BezierSegment[] {
    return this.visibleSegments;
  }

  public getOrbs(): ResonanceOrb[] {
    return this.visibleOrbs;
  }

  public getTotalOrbCount(): number {
    return this.allOrbs.length;
  }

  public getTotalStarCount(): number {
    let count = 0;
    for (let i = 0; i < this.allOrbs.length; i++) {
      if (this.allOrbs[i]!.isPrismStar) count++;
    }
    return count;
  }

  public getTraps(): RuntimeTrap[] {
    return this.visibleTraps;
  }

  public getDivingNodes(): DivingNode[] {
    return this.visibleDivingNodes;
  }

  public getSkyPlatforms(): SkyPlatform[] {
    return this.visibleSkyPlatforms;
  }

  public getJumpPads(): JumpPad[] {
    return this.visibleJumpPads;
  }

  public getDashRings(): DashRing[] {
    return this.visibleDashRings;
  }

  public getHoldRails(): HoldRail[] {
    return this.visibleHoldRails;
  }
}
