import type {
  AfterimageTrail,
  ResonanceFormType,
  ShockwaveEffect,
  SlashEffect,
  SlashEffectKind,
  SlicedEnemyHalf,
  VectorParticle,
} from '../../types/game';

const PARTICLE_POOL_CAPACITY = 256;
const AFTERIMAGE_POOL_CAPACITY = 48;
const SHOCKWAVE_POOL_CAPACITY = 16;
const SLASH_POOL_CAPACITY = 24;
const SLICED_HALF_POOL_CAPACITY = 48;

/**
 * Object Pool + In-Place Compaction Subsystem for Vector VFX (`rhythm-slasher-v6`):
 * - Pre-allocates particle, afterimage, shockwave, blade-slash, and `SlicedEnemyHalf` structs once
 * - Eliminates per-frame `.filter()` array allocations and per-burst heap allocations (`0` GC)
 * - Unifies `SlicedEnemyHalf` in unzoomed screen coordinates (`[Fix 4]`) so `[Esc]` `20.0x` zoom
 *   inspects razor-sharp cut seams with `0.0px` transform drift
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

  private readonly freeSlicedHalves: SlicedEnemyHalf[] = [];
  private readonly activeSlicedHalves: SlicedEnemyHalf[] = [];

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

    for (let i = 0; i < SLICED_HALF_POOL_CAPACITY; i++) {
      this.freeSlicedHalves.push({
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        radius: 22,
        cutAngle: 0,
        spin: 0,
        side: 1,
        color: [255, 255, 255],
        life: 0,
        maxLife: 0.58,
        isPrismStar: false,
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
    while (this.activeSlicedHalves.length > 0) {
      this.freeSlicedHalves.push(this.activeSlicedHalves.pop()!);
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
      const speed = 95 + Math.random() * 265;
      this.spawnParticle(
        x,
        y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        3.5 + Math.random() * 4.5,
        color,
        1.0,
        0.36 + Math.random() * 0.24
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

  /**
   * Spawns a bisected pair of vector polygon halves (`side = -1` and `side = +1`)
   * separating orthogonally to `cutAngle` in unzoomed screen space (`[Fix 4]`).
   */
  public spawnSlicedEnemy(
    x: number,
    y: number,
    radius: number,
    cutAngle: number,
    color: readonly [number, number, number],
    isPrismStar: boolean = false,
    maxLife: number = 0.58
  ): void {
    const nx = -Math.sin(cutAngle);
    const ny = Math.cos(cutAngle);
    const tx = Math.cos(cutAngle);
    const ty = Math.sin(cutAngle);

    const sides: readonly [-1, 1] = [-1, 1];
    for (let i = 0; i < sides.length; i++) {
      const side = sides[i]!;
      const half =
        this.freeSlicedHalves.pop() ??
        (this.activeSlicedHalves.length > 0 ? this.activeSlicedHalves.shift()! : null);
      if (!half) continue;

      const sepSpeed = 132 + Math.random() * 54;
      half.x = x + nx * side * 3.6;
      half.y = y + ny * side * 3.6;
      half.vx = nx * side * sepSpeed + tx * side * 38 - 32;
      half.vy = ny * side * sepSpeed + ty * side * 18 - 96;
      half.radius = radius;
      half.cutAngle = cutAngle;
      half.spin = side * (5.4 + Math.random() * 2.4);
      half.side = side;
      half.color[0] = color[0];
      half.color[1] = color[1];
      half.color[2] = color[2];
      half.life = 0;
      half.maxLife = maxLife;
      half.isPrismStar = isPrismStar;
      this.activeSlicedHalves.push(half);
    }
  }

  public update(dt: number, stepX: number, freezeHalves: boolean = false): void {
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
      ai.alpha -= dt * 3.6;
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
      sl.x -= stepX * 0.25;
      sl.life += dt;
      if (sl.life < sl.maxLife) {
        this.activeSlashes[slWrite++] = sl;
      } else {
        this.freeSlashes.push(sl);
      }
    }
    this.activeSlashes.length = slWrite;

    // [Fix 2 & Fix 4] During brief hitstop (`freezeHalves === true`), sliced polygon halves
    // hold their bisected Katana ZERO pose in mid-air while world `cameraX` never freezes!
    if (!freezeHalves) {
      let shWrite = 0;
      for (let i = 0; i < this.activeSlicedHalves.length; i++) {
        const h = this.activeSlicedHalves[i]!;
        h.x += h.vx * dt - stepX * 0.55;
        h.y += h.vy * dt;
        h.vy += 460 * dt;
        h.cutAngle += h.spin * dt;
        h.life += dt;
        if (h.life < h.maxLife) {
          this.activeSlicedHalves[shWrite++] = h;
        } else {
          this.freeSlicedHalves.push(h);
        }
      }
      this.activeSlicedHalves.length = shWrite;
    }
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

  public getSlicedHalves(): SlicedEnemyHalf[] {
    return this.activeSlicedHalves;
  }
}
