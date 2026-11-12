import type { SlashLane } from '../types/game';

export interface GameInputCommands {
  isGameActive: () => boolean;
  isPaused: () => boolean;
  isRunFinished: () => boolean;
  onSlashHigh: (eventTimeStampMs: number) => void;
  onSlashLow: (eventTimeStampMs: number) => void;
  onSlashChord: (eventTimeStampMs: number) => void;
  onLaneHoldChange: (lane: SlashLane | 'chord', held: boolean) => void;
  onActivateOverdrive: () => void;
  onCycleSfxMode: () => void;
  onToggleCinematicCamera: () => void;
  onTogglePause: () => void;
  onExitToMenu: () => void;
  onReplayRun: () => void;
  onWheelZoom: (factor: number, canvasX: number, canvasY: number) => void;
  onStepZoom: (factor: number) => void;
  onResetZoom: () => void;
  onPanDelta: (dx: number, dy: number) => void;
}

const HIGH_KEY_CODES = new Set(['KeyF', 'KeyD', 'KeyW', 'ArrowUp']);
const LOW_KEY_CODES = new Set(['KeyJ', 'KeyK', 'KeyS', 'ArrowDown']);

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
      'button, input, label, a, [data-ui-panel], [data-testid="hud-lane-keys"], .hud-lane-keys, .pause-panel, .pause-collapsed-pill, .hud-top-left, .hud-top-right, .hud-bottom-center'
    ) !== null
  );
}

/**
 * Command Pattern Input Controller (`rhythm-slasher-v6`):
 * Decouples 2-Lane keyboard/mouse/touch events, sub-frame `e.timeStamp` forwarding,
 * multi-key hold ref-counting, right-click context menu suppression, and paused vector inspection.
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

    const highSources = new Set<string>();
    const lowSources = new Set<string>();
    const chordSources = new Set<string>();
    const activeTouches = new Map<number, SlashLane | 'chord'>();

    const addHoldSource = (lane: SlashLane | 'chord', sourceId: string): void => {
      const set =
        lane === 'high' ? highSources : lane === 'low' ? lowSources : chordSources;
      const wasEmpty = set.size === 0;
      set.add(sourceId);
      if (wasEmpty) {
        this.commands.onLaneHoldChange(lane, true);
      }
    };

    const removeHoldSource = (lane: SlashLane | 'chord', sourceId: string): void => {
      const set =
        lane === 'high' ? highSources : lane === 'low' ? lowSources : chordSources;
      if (set.delete(sourceId) && set.size === 0) {
        this.commands.onLaneHoldChange(lane, false);
      }
    };

    const releaseAllHolds = (): void => {
      if (highSources.size > 0) {
        highSources.clear();
        this.commands.onLaneHoldChange('high', false);
      }
      if (lowSources.size > 0) {
        lowSources.clear();
        this.commands.onLaneHoldChange('low', false);
      }
      if (chordSources.size > 0) {
        chordSources.clear();
        this.commands.onLaneHoldChange('chord', false);
      }
      activeTouches.clear();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (!this.commands.isGameActive()) return;
      const noMod = !e.ctrlKey && !e.metaKey && !e.altKey;

      if (e.code === 'Escape') {
        if (e.repeat) return;
        e.preventDefault();
        releaseAllHolds();
        if (this.commands.isRunFinished()) {
          this.commands.onExitToMenu();
        } else {
          this.commands.onTogglePause();
        }
        return;
      }

      if (e.code === 'KeyP' && noMod && !this.commands.isRunFinished()) {
        if (e.repeat) return;
        e.preventDefault();
        releaseAllHolds();
        this.commands.onTogglePause();
        return;
      }

      if (this.commands.isRunFinished()) {
        if (
          (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyR') &&
          !e.repeat &&
          noMod
        ) {
          if (!(document.activeElement instanceof HTMLButtonElement)) {
            e.preventDefault();
            this.commands.onReplayRun();
          }
        }
        return;
      }

      if (noMod) {
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
        if (!e.repeat && noMod) {
          if (e.code === 'KeyQ') {
            e.preventDefault();
            this.commands.onExitToMenu();
          } else if (e.code === 'KeyM') {
            this.commands.onCycleSfxMode();
          } else if (e.code === 'KeyC') {
            e.preventDefault();
            this.commands.onToggleCinematicCamera();
          }
        }
        return;
      }

      if (!noMod) return;

      if (e.code === 'KeyC') {
        if (!e.repeat) {
          e.preventDefault();
          this.commands.onToggleCinematicCamera();
        }
        return;
      }

      if (e.code === 'KeyM') {
        if (!e.repeat) {
          this.commands.onCycleSfxMode();
        }
        return;
      }

      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyE') {
        e.preventDefault();
        if (!e.repeat) {
          this.commands.onActivateOverdrive();
        }
        return;
      }

      if (HIGH_KEY_CODES.has(e.code)) {
        e.preventDefault();
        if (e.repeat) return;
        addHoldSource('high', e.code);
        this.commands.onSlashHigh(e.timeStamp);
        return;
      }

      if (LOW_KEY_CODES.has(e.code)) {
        e.preventDefault();
        if (e.repeat) return;
        addHoldSource('low', e.code);
        this.commands.onSlashLow(e.timeStamp);
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        if (e.repeat) return;
        addHoldSource('chord', e.code);
        this.commands.onSlashChord(e.timeStamp);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (HIGH_KEY_CODES.has(e.code)) {
        removeHoldSource('high', e.code);
      } else if (LOW_KEY_CODES.has(e.code)) {
        removeHoldSource('low', e.code);
      } else if (e.code === 'Space') {
        removeHoldSource('chord', e.code);
      }
    };

    const onBlur = () => {
      isDraggingPan = false;
      releaseAllHolds();
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
        e.preventDefault();
        addHoldSource('high', 'mouse:0');
        this.commands.onSlashHigh(e.timeStamp);
      } else if (e.button === 2) {
        e.preventDefault();
        addHoldSource('low', 'mouse:2');
        this.commands.onSlashLow(e.timeStamp);
      } else if (e.button === 1) {
        e.preventDefault();
        addHoldSource('chord', 'mouse:1');
        this.commands.onSlashChord(e.timeStamp);
      }
    };

    const onWindowMouseUp = (e: MouseEvent) => {
      isDraggingPan = false;
      if (e.button === 0) {
        removeHoldSource('high', 'mouse:0');
      } else if (e.button === 2) {
        removeHoldSource('low', 'mouse:2');
      } else if (e.button === 1) {
        removeHoldSource('chord', 'mouse:1');
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

    const onTouchStart = (e: TouchEvent) => {
      if (
        !containerEl ||
        !this.commands.isGameActive() ||
        this.commands.isPaused() ||
        this.commands.isRunFinished()
      ) {
        return;
      }
      if (isUiTarget(e.target)) return;

      e.preventDefault();
      const rect = containerEl.getBoundingClientRect();
      const midY = rect.top + rect.height * 0.5;

      let addedHigh = false;
      let addedLow = false;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i]!;
        const lane: SlashLane = touch.clientY < midY ? 'high' : 'low';
        activeTouches.set(touch.identifier, lane);
        addHoldSource(lane, `touch:${touch.identifier}`);
        if (lane === 'high') addedHigh = true;
        else addedLow = true;
      }

      if (addedHigh && addedLow) {
        this.commands.onSlashChord(e.timeStamp);
      } else if (addedHigh) {
        this.commands.onSlashHigh(e.timeStamp);
      } else if (addedLow) {
        this.commands.onSlashLow(e.timeStamp);
      }
    };

    const onTouchEndOrCancel = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i]!;
        const lane = activeTouches.get(touch.identifier);
        if (lane) {
          activeTouches.delete(touch.identifier);
          removeHoldSource(lane, `touch:${touch.identifier}`);
        }
      }
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
      if (this.commands.isGameActive() && !this.commands.isRunFinished()) {
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    window.addEventListener('mousemove', onWindowMouseMove);
    window.addEventListener('mouseup', onWindowMouseUp);
    window.addEventListener('contextmenu', onContextMenu);
    containerEl?.addEventListener('mousedown', onMouseDown);
    containerEl?.addEventListener('touchstart', onTouchStart, { passive: false });
    containerEl?.addEventListener('touchend', onTouchEndOrCancel);
    containerEl?.addEventListener('touchcancel', onTouchEndOrCancel);
    containerEl?.addEventListener('contextmenu', onContextMenu);
    containerEl?.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('mousemove', onWindowMouseMove);
      window.removeEventListener('mouseup', onWindowMouseUp);
      window.removeEventListener('contextmenu', onContextMenu);
      containerEl?.removeEventListener('mousedown', onMouseDown);
      containerEl?.removeEventListener('touchstart', onTouchStart);
      containerEl?.removeEventListener('touchend', onTouchEndOrCancel);
      containerEl?.removeEventListener('touchcancel', onTouchEndOrCancel);
      containerEl?.removeEventListener('contextmenu', onContextMenu);
      containerEl?.removeEventListener('wheel', onWheel);
    };
  }
}
