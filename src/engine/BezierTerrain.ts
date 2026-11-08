import type {
  BeatTrap,
  BezierSegment,
  DivingNode,
  FrequencyBands,
  ResonanceFormType,
} from '../types/game';
import { evaluateBezierFloor } from './bezierMath';

const SEGMENT_WIDTH = 220;
const FORMS_ORDER: ResonanceFormType[] = ['bass', 'synth', 'treble'];

export type RuntimeTrap = BeatTrap & { screenFloorY?: number };

/**
 * Generates and streams 2D Cubic Bezier waveform terrain, Beat Traps, and Frequency Diving Nodes
 * driven by real-time Web Audio API FFT energy.
 */
export class BezierTerrain {
  private segments: BezierSegment[] = [];
  private baseHeights: Map<number, { y0: number; cy1: number; cy2: number; y1: number }> = new Map();
  private traps: Array<BeatTrap & { screenFloorY?: number }> = [];
  private divingNodes: DivingNode[] = [];

  private nextSegmentX: number = -200;
  private segmentIndex: number = 0;
  private lastAnchorY: number = 480;
  private lastSlopeY: number = 0;
  private nextId: number = 1;
  private viewportHeight: number = 720;

  public reset(viewportWidth: number, viewportHeight: number): void {
    this.viewportHeight = viewportHeight;
    this.segments = [];
    this.baseHeights.clear();
    this.traps = [];
    this.divingNodes = [];
    this.nextSegmentX = -SEGMENT_WIDTH;
    this.segmentIndex = 0;
    this.lastAnchorY = viewportHeight * 0.68;
    this.lastSlopeY = 0;
    this.nextId = 1;

    this.ensureSegments(0, viewportWidth, {
      low: 0.2,
      mid: 0.2,
      high: 0.2,
      overall: 0.2,
      isBeat: false,
    });
  }

  public update(
    cameraX: number,
    viewportWidth: number,
    viewportHeight: number,
    timeSec: number,
    freq: FrequencyBands
  ): void {
    this.viewportHeight = viewportHeight;
    this.ensureSegments(cameraX, viewportWidth, freq);

    // Prune off-screen segments, traps, and diving nodes behind camera
    const pruneX = cameraX - SEGMENT_WIDTH * 2;
    while (this.segments.length > 0 && this.segments[0]!.x1 < pruneX) {
      const removed = this.segments.shift()!;
      this.baseHeights.delete(removed.x0);
    }
    this.traps = this.traps.filter((t) => t.worldX > pruneX);
    this.divingNodes = this.divingNodes.filter((n) => n.worldX > pruneX);

    // Live audio-reactive modulation of visible Bezier control points
    for (let i = 0; i < this.segments.length; i++) {
      const seg = this.segments[i]!;
      const base = this.baseHeights.get(seg.x0);
      if (!base) continue;

      const bandEnergy =
        seg.energyBand === 'bass'
          ? freq.low
          : seg.energyBand === 'synth'
          ? freq.mid
          : freq.high;

      const waveMod1 = Math.sin(timeSec * 5.2 + i * 0.9) * (14 + bandEnergy * 46);
      const waveMod2 = Math.cos(timeSec * 4.6 + i * 1.1) * (14 + bandEnergy * 46);

      seg.cy1 = base.cy1 + waveMod1;
      seg.cy2 = base.cy2 + waveMod2;
    }

    // Keep Beat Traps anchored to the live Bezier floor height
    const fallbackY = viewportHeight * 0.68;
    for (const trap of this.traps) {
      const { floorY } = evaluateBezierFloor(this.segments, trap.worldX, fallbackY);
      trap.screenFloorY = floorY;
    }
  }

  private ensureSegments(
    cameraX: number,
    viewportWidth: number,
    freq: FrequencyBands
  ): void {
    const horizonX = cameraX + viewportWidth + SEGMENT_WIDTH * 3;
    const baseFloor = this.viewportHeight * 0.68;

    while (this.nextSegmentX < horizonX) {
      const x0 = this.nextSegmentX;
      const x1 = x0 + SEGMENT_WIDTH;
      const y0 = this.lastAnchorY;

      const energyBand = FORMS_ORDER[this.segmentIndex % FORMS_ORDER.length]!;
      const energyAmt =
        energyBand === 'bass'
          ? freq.low
          : energyBand === 'synth'
          ? freq.mid
          : freq.high;

      // Smooth undulating target height within playable vertical bounds
      const rawDelta =
        Math.sin(this.segmentIndex * 0.85) * (42 + energyAmt * 68) +
        Math.cos(this.segmentIndex * 0.45) * 28;
      const y1 = Math.max(
        this.viewportHeight * 0.42,
        Math.min(this.viewportHeight * 0.78, baseFloor + rawDelta)
      );

      // C1 continuous control points
      const cx1 = x0 + SEGMENT_WIDTH * 0.35;
      const cy1 = y0 + this.lastSlopeY * 0.45;
      const nextSlope = (y1 - y0) * 0.55;
      const cx2 = x0 + SEGMENT_WIDTH * 0.65;
      const cy2 = y1 - nextSlope * 0.45;

      const seg: BezierSegment = {
        x0,
        y0,
        cx1,
        cy1,
        cx2,
        cy2,
        x1,
        y1,
        energyBand,
      };

      this.segments.push(seg);
      this.baseHeights.set(x0, { y0, cy1, cy2, y1 });

      // Spawn Beat Traps or Frequency Diving Nodes after initial safe runway
      if (this.segmentIndex >= 4) {
        if (this.segmentIndex % 9 === 0) {
          // Spawn a Frequency Diving Node (Low / Mid / High Portal) at build-up intervals
          const targetForm =
            FORMS_ORDER[Math.floor(this.segmentIndex / 9) % FORMS_ORDER.length]!;
          const midX = (x0 + x1) * 0.5;
          const { floorY } = evaluateBezierFloor([seg], midX, baseFloor);
          this.divingNodes.push({
            id: this.nextId++,
            worldX: midX,
            worldY: floorY - 72,
            radius: 30,
            targetForm,
            activated: false,
          });
        } else if (this.segmentIndex % 2 === 1) {
          // Spawn a Beat Trap spike on the waveform
          const trapX = x0 + SEGMENT_WIDTH * 0.52;
          const { floorY } = evaluateBezierFloor([seg], trapX, baseFloor);
          this.traps.push({
            id: this.nextId++,
            worldX: trapX,
            width: 34,
            height: 40 + Math.floor(energyAmt * 18),
            destroyed: false,
            passed: false,
            screenFloorY: floorY,
          });
        }
      }

      this.lastAnchorY = y1;
      this.lastSlopeY = nextSlope;
      this.nextSegmentX = x1;
      this.segmentIndex++;
    }
  }

  public sampleFloor(worldX: number): { floorY: number; slope: number; angleRad: number } {
    return evaluateBezierFloor(this.segments, worldX, this.viewportHeight * 0.68);
  }

  public getSegments(): BezierSegment[] {
    return this.segments;
  }

  public getTraps(): Array<BeatTrap & { screenFloorY?: number }> {
    return this.traps;
  }

  public getDivingNodes(): DivingNode[] {
    return this.divingNodes;
  }
}
