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

export type RuntimeTrap = BeatTrap & { screenFloorY?: number };

/**
 * Streams pre-computed Hybrid Rhythm-Runner terrain:
 * - Multi-elevation Ground Sprint Decks + Abyss Chasm Gaps (`isGap`)
 * - One-way 2nd-Floor Sky Platforms (`SkyPlatform`)
 * - Shrinking-ring Rhythm Beat Notes, Beat Jump Pads, Airborne Dash Rings, Hold Note Rails & Beat Traps
 */
export class BezierTerrain {
  private allSegments: BezierSegment[] = [];
  private baseSegments: BezierSegment[] = [];
  private visibleSegments: BezierSegment[] = [];

  private allOrbs: ResonanceOrb[] = [];
  private baseOrbY: Map<number, number> = new Map();
  private visibleOrbs: ResonanceOrb[] = [];

  private allTraps: RuntimeTrap[] = [];
  private visibleTraps: RuntimeTrap[] = [];

  private allDivingNodes: DivingNode[] = [];
  private basePortalY: Map<number, number> = new Map();
  private visibleDivingNodes: DivingNode[] = [];

  private allSkyPlatforms: SkyPlatform[] = [];
  private baseSkyY: Map<number, number> = new Map();
  private visibleSkyPlatforms: SkyPlatform[] = [];

  private allJumpPads: JumpPad[] = [];
  private basePadY: Map<number, number> = new Map();
  private visibleJumpPads: JumpPad[] = [];

  private allDashRings: DashRing[] = [];
  private baseRingY: Map<number, number> = new Map();
  private visibleDashRings: DashRing[] = [];

  private allHoldRails: HoldRail[] = [];
  private baseRailY: Map<number, number> = new Map();
  private visibleHoldRails: HoldRail[] = [];

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

    this.baseOrbY.clear();
    this.allOrbs = blueprint.orbs.map((o) => {
      this.baseOrbY.set(o.id, o.worldY);
      return {
        ...o,
        collected: false,
        screenY: o.worldY * scaleY,
      };
    });

    this.allTraps = blueprint.traps.map((t) => ({
      ...t,
      destroyed: false,
      passed: false,
      screenFloorY: ((t as RuntimeTrap).screenFloorY ?? this.refHeight * 0.7) * scaleY,
    }));

    this.basePortalY.clear();
    this.allDivingNodes = blueprint.divingNodes.map((n) => {
      this.basePortalY.set(n.id, n.worldY);
      return {
        ...n,
        worldY: n.worldY * scaleY,
        activated: false,
      };
    });

    this.baseSkyY.clear();
    this.allSkyPlatforms = (blueprint.skyPlatforms ?? []).map((p) => {
      this.baseSkyY.set(p.id, p.worldY);
      return {
        ...p,
        screenY: p.worldY * scaleY,
      };
    });

    this.basePadY.clear();
    this.allJumpPads = (blueprint.jumpPads ?? []).map((jp) => {
      this.basePadY.set(jp.id, jp.worldY);
      return {
        ...jp,
        triggered: false,
        screenY: jp.worldY * scaleY,
      };
    });

    this.baseRingY.clear();
    this.allDashRings = (blueprint.dashRings ?? []).map((dr) => {
      this.baseRingY.set(dr.id, dr.worldY);
      return {
        ...dr,
        triggered: false,
        screenY: dr.worldY * scaleY,
      };
    });

    this.baseRailY.clear();
    this.allHoldRails = (blueprint.holdRails ?? []).map((hr) => {
      this.baseRailY.set(hr.id, hr.worldY);
      return {
        ...hr,
        active: false,
        completed: false,
        screenY: hr.worldY * scaleY,
      };
    });

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
      for (const orb of this.allOrbs) {
        orb.collected = false;
        orb.screenY = (this.baseOrbY.get(orb.id) ?? orb.worldY) * scaleY;
      }
      for (const trap of this.allTraps) {
        trap.destroyed = false;
        trap.passed = false;
      }
      for (const node of this.allDivingNodes) {
        node.activated = false;
        node.worldY = (this.basePortalY.get(node.id) ?? node.worldY) * scaleY;
      }
      for (const plat of this.allSkyPlatforms) {
        plat.screenY = (this.baseSkyY.get(plat.id) ?? plat.worldY) * scaleY;
      }
      for (const pad of this.allJumpPads) {
        pad.triggered = false;
        pad.screenY = (this.basePadY.get(pad.id) ?? pad.worldY) * scaleY;
      }
      for (const ring of this.allDashRings) {
        ring.triggered = false;
        ring.screenY = (this.baseRingY.get(ring.id) ?? ring.worldY) * scaleY;
      }
      for (const rail of this.allHoldRails) {
        rail.active = false;
        rail.completed = false;
        rail.screenY = (this.baseRailY.get(rail.id) ?? rail.worldY) * scaleY;
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
    this.visibleSegments = this.allSegments.slice(0, 18);
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

    // 1. Slice visible segments using lead-in-aware index offset (supports negative worldX!)
    const startIdx = Math.max(0, Math.floor(minX / this.segWidth) + this.leadInSegments - 1);
    const endIdx = Math.min(
      this.allSegments.length - 1,
      Math.ceil(maxX / this.segWidth) + this.leadInSegments + 2
    );

    this.visibleSegments = [];
    for (let i = startIdx; i <= endIdx; i++) {
      const seg = this.allSegments[i];
      const base = this.baseSegments[i];
      if (!seg || !base) continue;

      // Keep running decks crisp and solid (only micro-pulse control handles slightly on strong bass)
      const pulse = freq.isBeat ? 2.5 * scaleY : 0;
      seg.y0 = base.y0 * scaleY;
      seg.y1 = base.y1 * scaleY;
      seg.cy1 = base.cy1 * scaleY - pulse;
      seg.cy2 = base.cy2 * scaleY - pulse;
      this.visibleSegments.push(seg);
    }

    const fallbackY = viewportHeight * 0.7;

    // 2. Visible Rhythm Beat Notes
    this.visibleOrbs = [];
    for (let i = 0; i < this.allOrbs.length; i++) {
      const orb = this.allOrbs[i]!;
      if (orb.collected || orb.worldX < minX || orb.worldX > maxX) continue;
      const baseY = this.baseOrbY.get(orb.id) ?? orb.worldY;
      orb.screenY = baseY * scaleY + Math.sin(timeSec * 6 + orb.id * 0.5) * 2.5;
      this.visibleOrbs.push(orb);
    }

    // 3. Visible Beat Traps anchored to ground road
    this.visibleTraps = [];
    for (let i = 0; i < this.allTraps.length; i++) {
      const trap = this.allTraps[i]!;
      if (trap.destroyed || trap.worldX < minX || trap.worldX > maxX) continue;
      const { floorY } = evaluateBezierFloor(this.visibleSegments, trap.worldX, fallbackY);
      trap.screenFloorY = floorY;
      this.visibleTraps.push(trap);
    }

    // 4. Visible Frequency Diving Portals
    this.visibleDivingNodes = [];
    for (let i = 0; i < this.allDivingNodes.length; i++) {
      const node = this.allDivingNodes[i]!;
      if (node.activated || node.worldX < minX || node.worldX > maxX) continue;
      const baseY = this.basePortalY.get(node.id) ?? node.worldY;
      node.worldY = baseY * scaleY;
      this.visibleDivingNodes.push(node);
    }

    // 5. Visible 2F Sky Platforms
    this.visibleSkyPlatforms = [];
    for (let i = 0; i < this.allSkyPlatforms.length; i++) {
      const plat = this.allSkyPlatforms[i]!;
      if (plat.x1 < minX || plat.x0 > maxX) continue;
      const baseY = this.baseSkyY.get(plat.id) ?? plat.worldY;
      plat.screenY = baseY * scaleY;
      this.visibleSkyPlatforms.push(plat);
    }

    // 6. Visible Beat Jump Pads
    this.visibleJumpPads = [];
    for (let i = 0; i < this.allJumpPads.length; i++) {
      const pad = this.allJumpPads[i]!;
      if (pad.worldX < minX || pad.worldX > maxX) continue;
      const baseY = this.basePadY.get(pad.id) ?? pad.worldY;
      pad.screenY = baseY * scaleY;
      this.visibleJumpPads.push(pad);
    }

    // 7. Visible Airborne Dash Rings
    this.visibleDashRings = [];
    for (let i = 0; i < this.allDashRings.length; i++) {
      const ring = this.allDashRings[i]!;
      if (ring.triggered || ring.worldX < minX || ring.worldX > maxX) continue;
      const baseY = this.baseRingY.get(ring.id) ?? ring.worldY;
      ring.screenY = baseY * scaleY;
      this.visibleDashRings.push(ring);
    }

    // 8. Visible Hold Note Rails
    this.visibleHoldRails = [];
    for (let i = 0; i < this.allHoldRails.length; i++) {
      const rail = this.allHoldRails[i]!;
      if (rail.x1 < minX || rail.x0 > maxX) continue;
      const baseY = this.baseRailY.get(rail.id) ?? rail.worldY;
      rail.screenY = baseY * scaleY;
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
