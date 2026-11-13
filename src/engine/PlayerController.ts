import { FORM_CONFIG, type ResonanceFormType } from '../types/game';

export interface SignatureKatanaProfile {
  readonly highHangDurationSec: number;
  readonly grooveDamageScale: number;
  readonly gaugeChargeMult: number;
  readonly chordHoldScoreMult: number;
  readonly criticalScoreMult: number;
  readonly highComboScoreMult: number;
  readonly slashWidthScale: number;
  readonly shockwaveScale: number;
}

export const SIGNATURE_KATANA_PROFILE: SignatureKatanaProfile = {
  highHangDurationSec: 0.48,
  grooveDamageScale: 1.0,
  gaugeChargeMult: 1.15,
  chordHoldScoreMult: 1.1,
  criticalScoreMult: 1.2,
  highComboScoreMult: 1.1,
  slashWidthScale: 1.12,
  shockwaveScale: 1.12,
};

/**
 * Manages the Crewmate's unified Signature Katana profile and live music band resonance:
 * - `bass` (Crimson): 1F low-band resonance wave
 * - `synth` (Cyan): 2F mid-band resonance wave
 * - `treble` (Gold): Climax / chord / critical / overdrive resonance wave
 */
export class PlayerController {
  private currentForm: ResonanceFormType = 'synth';

  public get form(): ResonanceFormType {
    return this.currentForm;
  }

  public get profile(): SignatureKatanaProfile {
    return SIGNATURE_KATANA_PROFILE;
  }

  public get config() {
    return FORM_CONFIG[this.currentForm];
  }

  public setResonance(form: ResonanceFormType): boolean {
    if (this.currentForm === form) return false;
    this.currentForm = form;
    return true;
  }

  public reset(): void {
    this.currentForm = 'synth';
  }
}
