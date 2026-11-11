import type { ResonanceFormType } from '../types/game';

export interface GameInputCommands {
  isGameActive: () => boolean;
  isRunFinished: () => boolean;
  onPrimaryPress: () => void;
  onPrimaryRelease: () => void;
  onDiveHoldChange: (held: boolean) => void;
  onSecondaryPress: () => void;
  onSwapForm: (targetForm?: ResonanceFormType) => void;
  onActivateOverdrive?: () => void;
  onCycleSfxMode?: () => void;
  onPauseOrExit: () => void;
}

/**
 * Command Pattern Input Controller:
 * Decouples raw DOM keyboard/pointer events, repeat filtering, button click guards,
 * and window blur safety releases from React UI components and physics simulation.
 */
export class InputController {
  private readonly commands: GameInputCommands;

  constructor(commands: GameInputCommands) {
    this.commands = commands;
  }

  public attach(containerEl: HTMLElement | null): () => void {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!this.commands.isGameActive()) return;

      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
        e.preventDefault();
        if (e.repeat) return;
        this.commands.onPrimaryPress();
      } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
        e.preventDefault();
        this.commands.onDiveHoldChange(true);
      } else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        e.preventDefault();
        if (e.repeat) return;
        this.commands.onSecondaryPress();
      } else if (e.code === 'Digit1') {
        if (!e.repeat) this.commands.onSwapForm('bass');
      } else if (e.code === 'Digit2') {
        if (!e.repeat) this.commands.onSwapForm('synth');
      } else if (e.code === 'Digit3') {
        if (!e.repeat) this.commands.onSwapForm('treble');
      } else if (e.code === 'KeyQ') {
        if (!e.repeat) this.commands.onSwapForm();
      } else if (e.code === 'KeyE' || e.code === 'Enter') {
        if (!e.repeat) {
          e.preventDefault();
          this.commands.onActivateOverdrive?.();
        }
      } else if (e.code === 'KeyM') {
        if (!e.repeat) this.commands.onCycleSfxMode?.();
      } else if (e.code === 'Escape') {
        this.commands.onPauseOrExit();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
        this.commands.onPrimaryRelease();
      } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
        this.commands.onDiveHoldChange(false);
      }
    };

    const onBlur = () => {
      this.commands.onPrimaryRelease();
      this.commands.onDiveHoldChange(false);
    };

    const onMouseDown = (e: MouseEvent) => {
      if (!this.commands.isGameActive() || this.commands.isRunFinished()) return;
      if ((e.target as HTMLElement | null)?.closest('button')) return;
      if (e.button === 0) {
        this.commands.onPrimaryPress();
      } else if (e.button === 2) {
        this.commands.onSecondaryPress();
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) {
        this.commands.onPrimaryRelease();
      }
    };

    const onContextMenu = (e: MouseEvent) => {
      if (this.commands.isGameActive()) {
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    containerEl?.addEventListener('mousedown', onMouseDown);
    containerEl?.addEventListener('mouseup', onMouseUp);
    containerEl?.addEventListener('contextmenu', onContextMenu);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      containerEl?.removeEventListener('mousedown', onMouseDown);
      containerEl?.removeEventListener('mouseup', onMouseUp);
      containerEl?.removeEventListener('contextmenu', onContextMenu);
    };
  }
}
