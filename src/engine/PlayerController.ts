import { FORM_CONFIG, type ResonanceFormType } from '../types/game';

export interface KatanaStyleProfile {
  form: ResonanceFormType;
  /** Airborne hang duration (s) after a HIGH slash before returning to 1F LOW deck (`0.48s`). */
  highHangDurationSec: number;
  /** Multiplier applied to Groove HP miss drain & hazard damage (`bass` = `0.80` for `-20%` mitigation). */
  grooveDamageScale: number;
  /** Multiplier on Resonance/Overdrive gauge charge (`synth` = `1.30` for `+30%`). */
  gaugeChargeMult: number;
  /** Multiplier on `CHORD` & `HOLD` ribbon score (`synth` = `1.20` for `+20%`). */
  chordHoldScoreMult: number;
  /** Multiplier on Critical `PERFECT` (`<= 45%` of `perfectMs`) hits (`treble` = `1.25` for `+25%`). */
  criticalScoreMult: number;
  /** Multiplier on slash score when `combo >= 20` (`treble` = `1.15`). */
  highComboScoreMult: number;
  /** Visual width/radius scale for Bezier katana slashes & shockwaves (`bass` = `1.28`). */
  slashWidthScale: number;
  shockwaveScale: number;
}

export const FORM_PROFILES: Record<ResonanceFormType, KatanaStyleProfile> = {
  bass: {
    form: 'bass',
    highHangDurationSec: 0.48,
    grooveDamageScale: 0.8,
    gaugeChargeMult: 1.0,
    chordHoldScoreMult: 1.0,
    criticalScoreMult: 1.0,
    highComboScoreMult: 1.0,
    slashWidthScale: 1.28,
    shockwaveScale: 1.28,
  },
  synth: {
    form: 'synth',
    highHangDurationSec: 0.48,
    grooveDamageScale: 1.0,
    gaugeChargeMult: 1.3,
    chordHoldScoreMult: 1.2,
    criticalScoreMult: 1.0,
    highComboScoreMult: 1.0,
    slashWidthScale: 1.08,
    shockwaveScale: 1.08,
  },
  treble: {
    form: 'treble',
    highHangDurationSec: 0.48,
    grooveDamageScale: 1.0,
    gaugeChargeMult: 1.05,
    chordHoldScoreMult: 1.0,
    criticalScoreMult: 1.25,
    highComboScoreMult: 1.15,
    slashWidthScale: 1.0,
    shockwaveScale: 1.0,
  },
};

/**
 * Manages Crewmate 2-Lane Katana Slasher Playstyles (`rhythm-slasher-v6`):
 * - `bass` (`BASS CRUSHER`, Crimson): `-20%` Groove HP drain/damage + wider heavy slash shockwaves
 * - `synth` (`SYNTH KATANA`, Cyan): `+30%` Overdrive gauge charge + `+20%` `CHORD`/`HOLD` bonus score
 * - `treble` (`TREBLE IAI`, Gold): `+25%` Critical `PERFECT` (`<= 45%` of `perfectMs`) + high-combo bonus
 */
export class PlayerController {
  private currentForm: ResonanceFormType = 'synth';

  public get form(): ResonanceFormType {
    return this.currentForm;
  }

  public get profile(): KatanaStyleProfile {
    return FORM_PROFILES[this.currentForm];
  }

  public get config() {
    return FORM_CONFIG[this.currentForm];
  }

  public reset(initialForm: ResonanceFormType = 'synth'): void {
    this.currentForm = initialForm;
  }
}
