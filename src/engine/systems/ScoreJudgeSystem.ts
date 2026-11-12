import {
  DIFFICULTY_CONFIG,
  type DifficultyMode,
  type JudgmentCounts,
  type JudgmentFeedback,
  type JudgmentGrade,
  type ResultRank,
  type SlashLane,
} from '../../types/game';

/**
 * Domain Subsystem for Score, Combo, Rhythm Timing Judgments & Rank Calculation (`rhythm-slasher-v6`):
 * - Evaluates sub-frame ms timing deltas against difficulty windows (`PERFECT / GREAT / GOOD / MISS`)
 * - Flags Critical `PERFECT`s (`<= 45%` of `perfectMs`) and active slash `lane` (`'high' | 'low' | 'chord'`)
 * - Tracks discrete HUD dirty flags so UI overlays flush immediately on judgments/combos
 */
export class ScoreJudgeSystem {
  public score: number = 0;
  public combo: number = 0;
  public maxCombo: number = 0;
  public orbsCollected: number = 0;
  public starsCollected: number = 0;
  public trapsDestroyed: number = 0;
  public gimmicksTriggered: number = 0;
  public activeJudgment: JudgmentFeedback | null = null;

  private judgmentCounts: JudgmentCounts = { perfect: 0, great: 0, good: 0, miss: 0 };
  private judgmentTimer: number = 0;
  private nextJudgmentId: number = 1;
  private dirty: boolean = true;

  public reset(): void {
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.orbsCollected = 0;
    this.starsCollected = 0;
    this.trapsDestroyed = 0;
    this.gimmicksTriggered = 0;
    this.judgmentCounts = { perfect: 0, great: 0, good: 0, miss: 0 };
    this.activeJudgment = null;
    this.judgmentTimer = 0;
    this.dirty = true;
  }

  public tick(dt: number): void {
    if (this.judgmentTimer > 0) {
      this.judgmentTimer = Math.max(0, this.judgmentTimer - dt);
      if (this.judgmentTimer === 0 && this.activeJudgment !== null) {
        this.activeJudgment = null;
        this.dirty = true;
      }
    }
  }

  public consumeDirty(): boolean {
    const wasDirty = this.dirty;
    this.dirty = false;
    return wasDirty;
  }

  public classifyDeltaMs(deltaMs: number, difficulty: DifficultyMode): JudgmentGrade {
    const cfg = DIFFICULTY_CONFIG[difficulty];
    if (deltaMs <= cfg.perfectMs) return 'PERFECT';
    if (deltaMs <= cfg.greatMs) return 'GREAT';
    return 'GOOD';
  }

  public isCriticalDeltaMs(deltaMs: number, difficulty: DifficultyMode): boolean {
    return deltaMs <= DIFFICULTY_CONFIG[difficulty].perfectMs * 0.45;
  }

  public addRawScore(points: number): void {
    if (points <= 0) return;
    this.score += points;
    this.dirty = true;
  }

  public addHoldRailTick(scoreMultiplier: number = 1): void {
    this.combo += 1;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    const effectiveCombo = Math.min(250, Math.max(1, this.combo));
    this.score += Math.round(75 * (1 + effectiveCombo * 0.04) * scoreMultiplier);
    this.dirty = true;
  }

  public addRushMashTick(scoreMultiplier: number = 1): number {
    this.combo += 1;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    const pts = Math.round(95 * scoreMultiplier);
    this.score += pts;
    this.dirty = true;
    return pts;
  }

  public recordOrbCollected(): void {
    this.orbsCollected++;
    this.dirty = true;
  }

  public recordStarCollected(): void {
    this.starsCollected++;
    this.dirty = true;
  }

  public recordTrapDestroyed(count: number = 1): void {
    this.trapsDestroyed += count;
    this.dirty = true;
  }

  public recordGimmickTriggered(): void {
    this.gimmicksTriggered++;
    this.dirty = true;
  }

  public recordJudgment(
    grade: JudgmentGrade,
    deltaMs?: number,
    basePoints: number = 300,
    scoreMultiplier: number = 1,
    signedDeltaMs?: number,
    options?: {
      isCritical?: boolean;
      lane?: SlashLane | 'chord';
    }
  ): number {
    let bonusPoints = 0;
    const isCritical = Boolean(options?.isCritical && grade === 'PERFECT');
    const lane = options?.lane;

    if (grade === 'PERFECT') {
      this.judgmentCounts.perfect++;
      this.combo += 1;
      const effectiveCombo = Math.min(300, Math.max(1, this.combo));
      const critMult = isCritical ? 1.15 : 1.0;
      bonusPoints = Math.round(
        basePoints * 1.5 * critMult * Math.max(1, 1 + effectiveCombo * 0.03) * scoreMultiplier
      );
      this.score += bonusPoints;
      this.activeJudgment = {
        id: this.nextJudgmentId++,
        grade,
        deltaMs,
        signedDeltaMs,
        bonusScore: bonusPoints,
        isCritical,
        lane,
      };
      this.judgmentTimer = 0.72;
    } else if (grade === 'GREAT') {
      this.judgmentCounts.great++;
      this.combo += 1;
      const effectiveCombo = Math.min(300, Math.max(1, this.combo));
      bonusPoints = Math.round(
        basePoints * 1.15 * Math.max(1, 1 + effectiveCombo * 0.025) * scoreMultiplier
      );
      this.score += bonusPoints;
      this.activeJudgment = {
        id: this.nextJudgmentId++,
        grade,
        deltaMs,
        signedDeltaMs,
        bonusScore: bonusPoints,
        isCritical: false,
        lane,
      };
      this.judgmentTimer = 0.65;
    } else if (grade === 'GOOD') {
      this.judgmentCounts.good++;
      this.combo += 1;
      const effectiveCombo = Math.min(300, Math.max(1, this.combo));
      bonusPoints = Math.round(
        basePoints * 0.78 * Math.max(1, 1 + effectiveCombo * 0.02) * scoreMultiplier
      );
      this.score += bonusPoints;
      this.activeJudgment = {
        id: this.nextJudgmentId++,
        grade,
        deltaMs,
        signedDeltaMs,
        bonusScore: bonusPoints,
        isCritical: false,
        lane,
      };
      this.judgmentTimer = 0.55;
    } else {
      this.judgmentCounts.miss++;
      this.combo = 0;
      this.activeJudgment = {
        id: this.nextJudgmentId++,
        grade: 'MISS',
        bonusScore: 0,
        isCritical: false,
        lane,
      };
      this.judgmentTimer = 0.85;
    }

    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.dirty = true;
    return bonusPoints;
  }

  public computeAccuracyAndRank(): { accuracy: number; rank: ResultRank } {
    const { perfect, great, good, miss } = this.judgmentCounts;
    const total = perfect + great + good + miss;
    if (total === 0) {
      return { accuracy: 100, rank: 'S' };
    }
    const weighted = perfect * 1.0 + great * 0.78 + good * 0.45;
    const accuracy = Number(Math.min(100, (weighted / total) * 100).toFixed(1));
    const rank: ResultRank =
      accuracy >= 92 ? 'S' : accuracy >= 82 ? 'A' : accuracy >= 70 ? 'B' : 'C';
    return { accuracy, rank };
  }

  public snapshotCounts(): JudgmentCounts {
    return { ...this.judgmentCounts };
  }
}
