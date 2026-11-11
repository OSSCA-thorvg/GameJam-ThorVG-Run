import {
  DIFFICULTY_CONFIG,
  type DifficultyMode,
  type JudgmentCounts,
  type JudgmentFeedback,
  type JudgmentGrade,
  type ResultRank,
} from '../../types/game';

/**
 * Domain Subsystem for Score, Combo, Rhythm Timing Judgments & Rank Calculation:
 * - Evaluates ms timing deltas against difficulty windows (`PERFECT / GREAT / GOOD / MISS`)
 * - Tracks discrete HUD dirty flags so UI overlays flush immediately on judgments/combos
 */
export class ScoreJudgeSystem {
  public score: number = 0;
  public combo: number = 1;
  public maxCombo: number = 1;
  public orbsCollected: number = 0;
  public trapsDestroyed: number = 0;
  public divesCompleted: number = 0;
  public gimmicksTriggered: number = 0;
  public activeJudgment: JudgmentFeedback | null = null;

  private judgmentCounts: JudgmentCounts = { perfect: 0, great: 0, good: 0, miss: 0 };
  private judgmentTimer: number = 0;
  private nextJudgmentId: number = 1;
  private dirty: boolean = true;

  public reset(): void {
    this.score = 0;
    this.combo = 1;
    this.maxCombo = 1;
    this.orbsCollected = 0;
    this.trapsDestroyed = 0;
    this.divesCompleted = 0;
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

  public addRawScore(points: number): void {
    this.score += points;
  }

  public addHoldRailTick(): void {
    this.combo = Math.min(99, this.combo + 1);
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.score += 85 * this.combo;
    this.dirty = true;
  }

  public recordOrbCollected(): void {
    this.orbsCollected++;
    this.dirty = true;
  }

  public recordTrapDestroyed(count: number = 1): void {
    this.trapsDestroyed += count;
    this.dirty = true;
  }

  public recordDiveCompleted(): void {
    this.divesCompleted++;
    this.dirty = true;
  }

  public recordGimmickTriggered(): void {
    this.gimmicksTriggered++;
    this.dirty = true;
  }

  public recordJudgment(
    grade: JudgmentGrade,
    deltaMs?: number,
    basePoints: number = 220
  ): number {
    let bonusPoints = 0;

    if (grade === 'PERFECT') {
      this.judgmentCounts.perfect++;
      this.combo = Math.min(99, this.combo + 2);
      bonusPoints = Math.round(basePoints * 1.5 * Math.max(1, this.combo * 0.25));
      this.score += bonusPoints;
      this.activeJudgment = {
        id: this.nextJudgmentId++,
        grade,
        deltaMs,
        bonusScore: bonusPoints,
      };
      this.judgmentTimer = 0.72;
    } else if (grade === 'GREAT') {
      this.judgmentCounts.great++;
      this.combo = Math.min(99, this.combo + 1);
      bonusPoints = Math.round(basePoints * 1.15 * Math.max(1, this.combo * 0.22));
      this.score += bonusPoints;
      this.activeJudgment = {
        id: this.nextJudgmentId++,
        grade,
        deltaMs,
        bonusScore: bonusPoints,
      };
      this.judgmentTimer = 0.65;
    } else if (grade === 'GOOD') {
      this.judgmentCounts.good++;
      this.combo = Math.min(99, this.combo + 1);
      bonusPoints = Math.round(basePoints * 0.8 * Math.max(1, this.combo * 0.18));
      this.score += bonusPoints;
      this.activeJudgment = {
        id: this.nextJudgmentId++,
        grade,
        deltaMs,
        bonusScore: bonusPoints,
      };
      this.judgmentTimer = 0.55;
    } else {
      this.judgmentCounts.miss++;
      this.combo = 1;
      this.activeJudgment = {
        id: this.nextJudgmentId++,
        grade: 'MISS',
        bonusScore: 0,
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
