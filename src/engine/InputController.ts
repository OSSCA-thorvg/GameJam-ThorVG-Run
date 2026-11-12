export interface GameInputCommands {
  isGameActive: () => boolean;
  isPaused: () => boolean;
  isRunFinished: () => boolean;
  onPrimaryPress: () => void;
  onPrimaryRelease: () => void;
  onDiveHoldChange: (held: boolean) => void;
  onSecondaryPress: () => void;
  onActivateOverdrive?: () => void;
  onCycleSfxMode?: () => void;
  onToggleCinematicCamera?: () => void;
  onTogglePause: () => void;
  onExitToMenu: () => void;
  onReplayRun?: () => void;
  onWheelZoom: (factor: number, canvasX: number, canvasY: number) => void;
  onStepZoom: (factor: number) => void;
  onResetZoom: () => void;
  onPanDelta: (dxScreenPx: number, dyScreenPx: number) => void;
}

function resolveElement(target: EventTarget | null): Element | null {
  if (target instanceof Element) return target;
  if (target && typeof (target as Node).parentElement === 'object') {
    return (target as Node).parentElement;
  }
  return null;
}

function isUiTarget(target: EventTarget | null): boolean {
  const el = resolveElement(target);
  if (!el) return false;
  return (
    el.closest(
      'button, input, label, a, [data-ui-panel], .pause-panel, .pause-collapsed-pill, .hud-top-left, .hud-top-right, .hud-bottom-center'
    ) !== null
  );
}

/**
 * Command Pattern Input Controller:
 * Decouples raw DOM keyboard/pointer/wheel events, repeat filtering, UI panel guards,
 * paused drag-panning, and window blur safety releases from React UI components and physics simulation.
 */
export class InputController {
  private readonly commands: GameInputCommands;

  constructor(commands: GameInputCommands) {
    this.commands = commands;
  }

  public attach(containerEl: HTMLElement | null): () => void {
    let isDraggingPan = false;
    let lastPanX = 0;
    let lastPanY = 0;

    const onKeyDown = (e: KeyboardEvent) => {
      if (!this.commands.isGameActive()) return;

      if (e.code === 'Escape') {
        if (e.repeat) return;
        e.preventDefault();
        if (this.commands.isRunFinished()) {
          this.commands.onExitToMenu();
        } else {
          this.commands.onTogglePause();
        }
        return;
      }

      if (this.commands.isRunFinished()) {
        if (
          (e.code === 'Space' || e.code === 'Enter') &&
          !e.repeat &&
          !e.ctrlKey &&
          !e.metaKey &&
          !e.altKey
        ) {
          if (!(document.activeElement instanceof HTMLButtonElement)) {
            e.preventDefault();
            this.commands.onReplayRun?.();
          }
        }
        return;
      }

      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.code === 'Equal' || e.code === 'NumpadAdd') {
          e.preventDefault();
          this.commands.onStepZoom(1.2);
          return;
        }
        if (e.code === 'Minus' || e.code === 'NumpadSubtract') {
          e.preventDefault();
          this.commands.onStepZoom(1 / 1.2);
          return;
        }
        if (e.code === 'Digit0' || e.code === 'Numpad0') {
          if (!e.repeat) {
            e.preventDefault();
            this.commands.onResetZoom();
          }
          return;
        }
      }

      if (this.commands.isPaused()) {
        if (e.code === 'KeyM' && !e.repeat) {
          this.commands.onCycleSfxMode?.();
        }
        return;
      }

      if (e.code === 'KeyC' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        this.commands.onToggleCinematicCamera?.();
        return;
      }

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
      } else if (e.code === 'KeyE' || e.code === 'Enter') {
        if (!e.repeat) {
          e.preventDefault();
          this.commands.onActivateOverdrive?.();
        }
      } else if (e.code === 'KeyM') {
        if (!e.repeat) this.commands.onCycleSfxMode?.();
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
      isDraggingPan = false;
      this.commands.onPrimaryRelease();
      this.commands.onDiveHoldChange(false);
    };

    const onMouseDown = (e: MouseEvent) => {
      if (!this.commands.isGameActive() || this.commands.isRunFinished()) return;
      if (isUiTarget(e.target)) return;

      if (this.commands.isPaused()) {
        if (e.button === 0 || e.button === 1) {
          isDraggingPan = true;
          lastPanX = e.clientX;
          lastPanY = e.clientY;
          e.preventDefault();
        }
        return;
      }

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

    const onWindowMouseMove = (e: MouseEvent) => {
      if (!isDraggingPan) return;
      if (
        !this.commands.isPaused() ||
        !this.commands.isGameActive() ||
        this.commands.isRunFinished()
      ) {
        isDraggingPan = false;
        return;
      }
      const dx = e.clientX - lastPanX;
      const dy = e.clientY - lastPanY;
      lastPanX = e.clientX;
      lastPanY = e.clientY;
      if (dx !== 0 || dy !== 0) {
        this.commands.onPanDelta(dx, dy);
      }
    };

    const onWindowMouseUp = () => {
      isDraggingPan = false;
    };

    const onWheel = (e: WheelEvent) => {
      if (!containerEl || !this.commands.isGameActive() || this.commands.isRunFinished()) return;
      const targetEl = resolveElement(e.target);
      if (targetEl?.closest('input, .track-list')) return;

      e.preventDefault();
      const normalizedDelta =
        e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 100 : e.deltaY;
      const clampedDelta = Math.max(-120, Math.min(120, normalizedDelta));
      if (clampedDelta === 0) return;

      const factor = Math.exp(-clampedDelta * 0.0022);
      const rect = containerEl.getBoundingClientRect();
      const canvasX = e.clientX - rect.left;
      const canvasY = e.clientY - rect.top;
      this.commands.onWheelZoom(factor, canvasX, canvasY);
    };

    const onContextMenu = (e: MouseEvent) => {
      if (this.commands.isGameActive()) {
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    window.addEventListener('mousemove', onWindowMouseMove);
    window.addEventListener('mouseup', onWindowMouseUp);
    containerEl?.addEventListener('mousedown', onMouseDown);
    containerEl?.addEventListener('mouseup', onMouseUp);
    containerEl?.addEventListener('contextmenu', onContextMenu);
    containerEl?.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('mousemove', onWindowMouseMove);
      window.removeEventListener('mouseup', onWindowMouseUp);
      containerEl?.removeEventListener('mousedown', onMouseDown);
      containerEl?.removeEventListener('mouseup', onMouseUp);
      containerEl?.removeEventListener('contextmenu', onContextMenu);
      containerEl?.removeEventListener('wheel', onWheel);
    };
  }
}
