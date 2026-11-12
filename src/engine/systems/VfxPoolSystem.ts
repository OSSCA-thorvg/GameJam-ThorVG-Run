import type {
  AfterimageTrail,
  ResonanceFormType,
  ShockwaveEffect,
  SlashEffect,
  SlashEffectKind,
  VectorParticle,
} from '../../types/game';

const PARTICLE_POOL_CAPACITY = 256;
const AFTERIMAGE_POOL_CAPACITY = 48;
const SHOCKWAVE_POOL_CAPACITY = 16;
const SLASH_POOL_CAPACITY = 20;

/**
 * Object Pool + In-Place Compaction Subsystem for Vector VFX:
 * - Pre-allocates all particle, afterimage, shockwave, and blade-slash structs once at startup
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

  private readonly freeSlashes: SlashEffect[] = [];
  private readonly activeSlashes: SlashEffect[] = [];

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

    for (let i = 0; i < SLASH_POOL_CAPACITY; i++) {
      this.freeSlashes.push({
        x: 0,
        y: 0,
        angle: 0,
        length: 100,
        width: 12,
        color: [255, 255, 255],
        life: 0,
        maxLife: 0.17,
        kind: 'cross',
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
    while (this.activeSlashes.length > 0) {
      this.freeSlashes.push(this.activeSlashes.pop()!);
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

  public spawnSlash(
    x: number,
    y: number,
    angle: number,
    length: number,
    width: number,
    color: readonly [number, number, number],
    kind: SlashEffectKind = 'cross',
    maxLife: number = 0.17
  ): void {
    const sl =
      this.freeSlashes.pop() ??
      (this.activeSlashes.length > 0 ? this.activeSlashes.shift()! : null);
    if (!sl) return;

    sl.x = x;
    sl.y = y;
    sl.angle = angle;
    sl.length = length;
    sl.width = width;
    sl.color[0] = color[0];
    sl.color[1] = color[1];
    sl.color[2] = color[2];
    sl.life = 0;
    sl.maxLife = maxLife;
    sl.kind = kind;
    this.activeSlashes.push(sl);
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

    let slWrite = 0;
    for (let i = 0; i < this.activeSlashes.length; i++) {
      const sl = this.activeSlashes[i]!;
      sl.x -= stepX * 0.85;
      sl.life += dt;
      if (sl.life < sl.maxLife) {
        this.activeSlashes[slWrite++] = sl;
      } else {
        this.freeSlashes.push(sl);
      }
    }
    this.activeSlashes.length = slWrite;
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

  public getSlashes(): SlashEffect[] {
    return this.activeSlashes;
  }
}
