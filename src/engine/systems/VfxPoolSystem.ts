import type {
  AfterimageTrail,
  ResonanceFormType,
  ShockwaveEffect,
  VectorParticle,
} from '../../types/game';

const PARTICLE_POOL_CAPACITY = 256;
const AFTERIMAGE_POOL_CAPACITY = 48;
const SHOCKWAVE_POOL_CAPACITY = 16;

/**
 * Object Pool + In-Place Compaction Subsystem for Vector VFX:
 * - Pre-allocates all particle, afterimage, and shockwave structs once at startup
 * - Eliminates per-frame `.filter()` array allocations and per-burst heap allocations
 * - Preserves chronological painter's-algorithm draw order while recycling expired slots in O(N)
 */
export class VfxPoolSystem {
  private readonly freeParticles: VectorParticle[] = [];
  private readonly activeParticles: VectorParticle[] = [];

  private readonly freeAfterimages: AfterimageTrail[] = [];
  private readonly activeAfterimages: AfterimageTrail[] = [];

  private readonly freeShockwaves: ShockwaveEffect[] = [];
  private readonly activeShockwaves: ShockwaveEffect[] = [];

  constructor() {
    for (let i = 0; i < PARTICLE_POOL_CAPACITY; i++) {
      this.freeParticles.push({
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        radius: 1,
        color: [255, 255, 255],
        alpha: 0,
        life: 0,
        maxLife: 1,
      });
    }

    for (let i = 0; i < AFTERIMAGE_POOL_CAPACITY; i++) {
      this.freeAfterimages.push({
        x: 0,
        y: 0,
        rotation: 0,
        form: 'synth',
        alpha: 0,
      });
    }

    for (let i = 0; i < SHOCKWAVE_POOL_CAPACITY; i++) {
      this.freeShockwaves.push({
        x: 0,
        y: 0,
        radius: 0,
        maxRadius: 1,
        color: [255, 255, 255],
        alpha: 0,
      });
    }
  }

  public reset(): void {
    while (this.activeParticles.length > 0) {
      this.freeParticles.push(this.activeParticles.pop()!);
    }
    while (this.activeAfterimages.length > 0) {
      this.freeAfterimages.push(this.activeAfterimages.pop()!);
    }
    while (this.activeShockwaves.length > 0) {
      this.freeShockwaves.push(this.activeShockwaves.pop()!);
    }
  }

  public spawnParticle(
    x: number,
    y: number,
    vx: number,
    vy: number,
    radius: number,
    color: readonly [number, number, number],
    alpha: number,
    maxLife: number
  ): void {
    const pt =
      this.freeParticles.pop() ??
      (this.activeParticles.length > 0 ? this.activeParticles.shift()! : null);
    if (!pt) return;

    pt.x = x;
    pt.y = y;
    pt.vx = vx;
    pt.vy = vy;
    pt.radius = radius;
    pt.color[0] = color[0];
    pt.color[1] = color[1];
    pt.color[2] = color[2];
    pt.alpha = alpha;
    pt.life = 0;
    pt.maxLife = maxLife;
    this.activeParticles.push(pt);
  }

  public spawnBurst(
    x: number,
    y: number,
    color: readonly [number, number, number],
    count: number
  ): void {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.35;
      const speed = 90 + Math.random() * 260;
      this.spawnParticle(
        x,
        y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        3.5 + Math.random() * 4.5,
        color,
        1.0,
        0.38 + Math.random() * 0.25
      );
    }
  }

  public spawnAfterimage(
    x: number,
    y: number,
    rotation: number,
    form: ResonanceFormType,
    alpha: number
  ): void {
    const ai =
      this.freeAfterimages.pop() ??
      (this.activeAfterimages.length > 0 ? this.activeAfterimages.shift()! : null);
    if (!ai) return;

    ai.x = x;
    ai.y = y;
    ai.rotation = rotation;
    ai.form = form;
    ai.alpha = alpha;
    this.activeAfterimages.push(ai);
  }

  public spawnShockwave(
    x: number,
    y: number,
    radius: number,
    maxRadius: number,
    color: readonly [number, number, number],
    alpha: number
  ): void {
    const sw =
      this.freeShockwaves.pop() ??
      (this.activeShockwaves.length > 0 ? this.activeShockwaves.shift()! : null);
    if (!sw) return;

    sw.x = x;
    sw.y = y;
    sw.radius = radius;
    sw.maxRadius = maxRadius;
    sw.color[0] = color[0];
    sw.color[1] = color[1];
    sw.color[2] = color[2];
    sw.alpha = alpha;
    this.activeShockwaves.push(sw);
  }

  public update(dt: number, stepX: number): void {
    let swWrite = 0;
    for (let i = 0; i < this.activeShockwaves.length; i++) {
      const sw = this.activeShockwaves[i]!;
      sw.radius += dt * 780;
      sw.alpha = Math.max(0, 1 - sw.radius / sw.maxRadius);
      if (sw.radius < sw.maxRadius) {
        this.activeShockwaves[swWrite++] = sw;
      } else {
        this.freeShockwaves.push(sw);
      }
    }
    this.activeShockwaves.length = swWrite;

    let aiWrite = 0;
    for (let i = 0; i < this.activeAfterimages.length; i++) {
      const ai = this.activeAfterimages[i]!;
      ai.x -= stepX * 0.65;
      ai.alpha -= dt * 3.2;
      if (ai.alpha > 0.05) {
        this.activeAfterimages[aiWrite++] = ai;
      } else {
        this.freeAfterimages.push(ai);
      }
    }
    this.activeAfterimages.length = aiWrite;

    let ptWrite = 0;
    for (let i = 0; i < this.activeParticles.length; i++) {
      const pt = this.activeParticles[i]!;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.life += dt;
      pt.radius = Math.max(0.5, pt.radius * (1 - dt * 1.8));
      if (pt.life < pt.maxLife) {
        this.activeParticles[ptWrite++] = pt;
      } else {
        this.freeParticles.push(pt);
      }
    }
    this.activeParticles.length = ptWrite;
  }

  public getParticles(): VectorParticle[] {
    return this.activeParticles;
  }

  public getAfterimages(): AfterimageTrail[] {
    return this.activeAfterimages;
  }

  public getShockwaves(): ShockwaveEffect[] {
    return this.activeShockwaves;
  }
}
