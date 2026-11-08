import { FORM_CONFIG, type ResonanceFormType } from '../types/game';

export interface FormPhysicsProfile {
  form: ResonanceFormType;
  gravity: number;
  jumpVelocity: number;
  secondJumpVelocity: number;
  maxJumps: number;
  dashDurationSec: number;
  dashCooldownSec: number;
  dashSpeedMultiplier: number;
  shockwaveRangePx: number;
  slopeGrindMultiplier: number;
  piercesTrapsDuringDash: boolean;
}

export const FORM_PROFILES: Record<ResonanceFormType, FormPhysicsProfile> = {
  bass: {
    form: 'bass',
    gravity: 2150,
    jumpVelocity: -700,
    secondJumpVelocity: -600,
    maxJumps: 1,
    dashDurationSec: 0.2,
    dashCooldownSec: 0.48,
    dashSpeedMultiplier: 1.55,
    shockwaveRangePx: 390,
    slopeGrindMultiplier: 1.0,
    piercesTrapsDuringDash: false,
  },
  synth: {
    form: 'synth',
    gravity: 1850,
    jumpVelocity: -710,
    secondJumpVelocity: -650,
    maxJumps: 2,
    dashDurationSec: 0.24,
    dashCooldownSec: 0.55,
    dashSpeedMultiplier: 1.8,
    shockwaveRangePx: 0,
    slopeGrindMultiplier: 1.42,
    piercesTrapsDuringDash: false,
  },
  treble: {
    form: 'treble',
    gravity: 1920,
    jumpVelocity: -720,
    secondJumpVelocity: -640,
    maxJumps: 1,
    dashDurationSec: 0.3,
    dashCooldownSec: 0.5,
    dashSpeedMultiplier: 2.55,
    shockwaveRangePx: 0,
    slopeGrindMultiplier: 1.1,
    piercesTrapsDuringDash: true,
  },
};

/**
 * Manages Skul-style Resonance Form Swap state, physics profiles, and form-specific skills:
 * - Bass Form (20~250Hz, Neon Red): Hexagonal Armor + Landing/Ground Shockwave destroying traps
 * - Synth Form (250Hz~4kHz, Cyan Blue): Streamlined Diamond + Double Jump & Bezier Slope Grind
 * - Treble Form (4kHz~20kHz, Electric Yellow): Sharp Arrowhead + Zero-G Invulnerable Blink Dash
 */
export class PlayerController {
  private currentForm: ResonanceFormType = 'synth';

  public get form(): ResonanceFormType {
    return this.currentForm;
  }

  public get profile(): FormPhysicsProfile {
    return FORM_PROFILES[this.currentForm];
  }

  public get config() {
    return FORM_CONFIG[this.currentForm];
  }

  public reset(initialForm: ResonanceFormType = 'synth'): void {
    this.currentForm = initialForm;
  }

  public swapForm(nextForm: ResonanceFormType): FormPhysicsProfile {
    this.currentForm = nextForm;
    return this.profile;
  }

  public cycleForm(): ResonanceFormType {
    const order: ResonanceFormType[] = ['bass', 'synth', 'treble'];
    const idx = order.indexOf(this.currentForm);
    this.currentForm = order[(idx + 1) % order.length]!;
    return this.currentForm;
  }
}

