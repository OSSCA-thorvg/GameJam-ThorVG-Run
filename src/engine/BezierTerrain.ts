import { REFERENCE_HEIGHT, SEGMENT_WIDTH } from '../audio/TrackAnalyzer';
import type {
  BeatTrap,
  BezierSegment,
  DivingNode,
  FrequencyBands,
  ResonanceFormType,
  ResonanceOrb,
  SectionIntensity,
  TrackBlueprint,
} from '../types/game';
import { evaluateBezierFloor } from './bezierMath';

const FORMS_ORDER: ResonanceFormType[] = ['bass', 'synth', 'treble'];

export type RuntimeTrap = BeatTrap & { screenFloorY?: number };

/**
 * Streams pre-computed 2D Cubic Bezier waveform terrain, Rhythm Resonance Orbs,
 * Beat Traps, and Frequency Diving Nodes from a TrackBlueprint, with resolution
 * scaling and subtle live harmonic breathing.
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

  private viewportHeight: number = REFERENCE_HEIGHT;
  private refHeight: number = REFERENCE_HEIGHT;
  private segWidth: number = SEGMENT_WIDTH;
  private hasBlueprint: boolean = false;

  /**
   * Loads a pre-computed TrackBlueprint before the run starts.
   * Clones mutable gameplay entities so replays start fresh without re-analyzing PCM.
   */
  public loadBlueprint(
    blueprint: TrackBlueprint,
    viewportWidth: number,
    viewportHeight: number
  ): void {
    this.viewportHeight = viewportHeight;
    this.refHeight = blueprint.referenceHeight || REFERENCE_HEIGHT;
    this.segWidth = blueprint.segmentWidth || SEGMENT_WIDTH;
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
      screenFloorY: ((t as RuntimeTrap).screenFloorY ?? this.refHeight * 0.64) * scaleY,
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

    this.update(0, viewportWidth, viewportHeight, 0, {
      low: 0.2,
      mid: 0.2,
      high: 0.2,
      overall: 0.2,
      isBeat: false,
    });
  }

  /**
   * Fallback reset when no blueprint is loaded yet.
   */
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
      this.update(0, viewportWidth, viewportHeight, 0, {
        low: 0.2,
        mid: 0.2,
        high: 0.2,
        overall: 0.2,
        isBeat: false,
      });
      return;
    }

    // Minimal procedural fallback if started without blueprint
    this.baseSegments = [];
    this.allSegments = [];
    const baseFloor = viewportHeight * 0.64;
    for (let i = -1; i < 40; i++) {
      const x0 = i * this.segWidth;
      const x1 = (i + 1) * this.segWidth;
      const y0 = baseFloor + Math.sin(i * 0.8) * 50;
      const y1 = baseFloor + Math.sin((i + 1) * 0.8) * 50;
      const seg: BezierSegment = {
        x0,
        y0,
        cx1: x0 + this.segWidth * 0.35,
        cy1: y0,
        cx2: x0 + this.segWidth * 0.65,
        cy2: y1,
        x1,
        y1,
        energyBand: FORMS_ORDER[Math.abs(i) % FORMS_ORDER.length]!,
      };
      this.baseSegments.push({ ...seg });
      this.allSegments.push(seg);
    }
    this.visibleSegments = this.allSegments.slice(0, 16);
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

    // 1. Slice visible Bezier segments using direct index calculation (O(1) window)
    const startIdx = Math.max(0, Math.floor(minX / this.segWidth));
    const endIdx = Math.min(
      this.allSegments.length - 1,
      Math.ceil(maxX / this.segWidth) + 2
    );

    this.visibleSegments = [];
    for (let i = startIdx; i <= endIdx; i++) {
      const seg = this.allSegments[i];
      const base = this.baseSegments[i];
      if (!seg || !base) continue;

      const bandEnergy =
        seg.energyBand === 'bass'
          ? freq.low
          : seg.energyBand === 'synth'
          ? freq.mid
          : freq.high;

      // Preserve the pre-computed musical mountain/valley anchor points (y0, y1)
      // while adding subtle live harmonic breathing to the control handles (cy1, cy2)
      const harmonicBreath = (6 + bandEnergy * 18) * scaleY;
      const mod1 = Math.sin(timeSec * 6.5 + i * 0.9) * harmonicBreath;
      const mod2 = Math.cos(timeSec * 5.8 + i * 1.1) * harmonicBreath;

      seg.y0 = base.y0 * scaleY;
      seg.y1 = base.y1 * scaleY;
      seg.cy1 = base.cy1 * scaleY + mod1;
      seg.cy2 = base.cy2 * scaleY + mod2;

      this.visibleSegments.push(seg);
    }

    const fallbackY = viewportHeight * 0.64;

    // 2. Filter visible Rhythm Resonance Orbs & keep contour orbs locked to live curve
    this.visibleOrbs = [];
    for (let i = 0; i < this.allOrbs.length; i++) {
      const orb = this.allOrbs[i]!;
      if (orb.collected || orb.worldX < minX || orb.worldX > maxX) continue;
      if (orb.isArcOrb) {
        const baseY = this.baseOrbY.get(orb.id) ?? orb.worldY;
        orb.screenY = baseY * scaleY + Math.sin(timeSec * 5 + orb.id) * 4;
      } else {
        const { floorY } = evaluateBezierFloor(this.visibleSegments, orb.worldX, fallbackY);
        orb.screenY = floorY - 26 * scaleY;
      }
      this.visibleOrbs.push(orb);
    }

    // 3. Filter visible Beat Traps & anchor to floor
    this.visibleTraps = [];
    for (let i = 0; i < this.allTraps.length; i++) {
      const trap = this.allTraps[i]!;
      if (trap.destroyed || trap.worldX < minX || trap.worldX > maxX) continue;
      const { floorY } = evaluateBezierFloor(this.visibleSegments, trap.worldX, fallbackY);
      trap.screenFloorY = floorY;
      this.visibleTraps.push(trap);
    }

    // 4. Filter visible Frequency Diving Nodes
    this.visibleDivingNodes = [];
    for (let i = 0; i < this.allDivingNodes.length; i++) {
      const node = this.allDivingNodes[i]!;
      if (node.activated || node.worldX < minX || node.worldX > maxX) continue;
      const baseY = this.basePortalY.get(node.id) ?? node.worldY;
      node.worldY = baseY * scaleY;
      this.visibleDivingNodes.push(node);
    }
  }

  public sampleFloor(worldX: number): {
    floorY: number;
    slope: number;
    angleRad: number;
    segment?: BezierSegment;
  } {
    const fallbackY = this.viewportHeight * 0.64;
    const res = evaluateBezierFloor(this.visibleSegments, worldX, fallbackY);
    let matchedSeg: BezierSegment | undefined;
    for (let i = 0; i < this.visibleSegments.length; i++) {
      const seg = this.visibleSegments[i]!;
      if (worldX >= seg.x0 && worldX <= seg.x1) {
        matchedSeg = seg;
        break;
      }
    }
    return { ...res, segment: matchedSeg };
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
}
