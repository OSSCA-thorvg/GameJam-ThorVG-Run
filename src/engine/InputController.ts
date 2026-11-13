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
  getTouchSplitYRatio?: () => number;
}

const HIGH_KEY_CODES = new Set(['KeyF', 'KeyD', 'KeyW', 'ArrowUp']);
const LOW_KEY_CODES = new Set(['KeyJ', 'KeyK', 'KeyS', 'ArrowDown']);
const TOUCH_CHORD_SYNC_MS = 50;

function resolveElement(target: EventTarget | null): Element | null {
  if (target instanceof Element) return target;
  if (target && typeof (target as Node).parentElement === 'object') {
    return (target as Node).parentElement;
  }
  return null;
}

function getSlashLaneFromTarget(target: EventTarget | null): SlashLane | 'chord' | null {
  const el = resolveElement(target);
  if (!el) return null;
  const laneEl = el.closest('[data-slash-lane]');
  if (!laneEl) return null;
  const attr = laneEl.getAttribute('data-slash-lane');
  if (attr === 'high' || attr === 'low' || attr === 'chord') {
    return attr;
  }
  return null;
}

function isUiTarget(target: EventTarget | null): boolean {
  if (getSlashLaneFromTarget(target) !== null) return false;
  const el = resolveElement(target);
  if (!el) return false;
  return (
    el.closest(
      'button, input, label, a, [data-ui-panel], .pause-panel, .pause-collapsed-pill, .hud-top-left, .hud-top-right, .hud-bottom-center'
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
    let lastKnownPaused = this.commands.isPaused();

    const highSources = new Set<string>();
    const lowSources = new Set<string>();
    const chordSources = new Set<string>();
    const activeMouseButtons = new Map<number, SlashLane | 'chord'>();
    const activeTouches = new Map<
      number,
      { lane: SlashLane | 'chord'; startTimeMs: number }
    >();
    const pausedTouches = new Map<number, { x: number; y: number }>();

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
      activeMouseButtons.clear();
      activeTouches.clear();
    };

    const clearAllPointerState = (): void => {
      isDraggingPan = false;
      pausedTouches.clear();
      releaseAllHolds();
    };

    const syncPauseState = (): boolean => {
      const nowPaused = this.commands.isPaused();
      if (nowPaused !== lastKnownPaused) {
        lastKnownPaused = nowPaused;
        clearAllPointerState();
      }
      return nowPaused;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (!this.commands.isGameActive()) return;
      syncPauseState();
      const noMod = !e.ctrlKey && !e.metaKey && !e.altKey;

      if (e.code === 'Escape') {
        if (e.repeat) return;
        e.preventDefault();
        clearAllPointerState();
        if (this.commands.isRunFinished()) {
          this.commands.onExitToMenu();
        } else {
          this.commands.onTogglePause();
          lastKnownPaused = this.commands.isPaused();
        }
        return;
      }

      if (e.code === 'KeyP' && noMod && !this.commands.isRunFinished()) {
        if (e.repeat) return;
        e.preventDefault();
        clearAllPointerState();
        this.commands.onTogglePause();
        lastKnownPaused = this.commands.isPaused();
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
      clearAllPointerState();
    };

    const onMouseDown = (e: MouseEvent) => {
      if (!this.commands.isGameActive() || this.commands.isRunFinished()) return;
      const isPaused = syncPauseState();
      if (isUiTarget(e.target)) return;

      if (isPaused) {
        if (e.button === 0 || e.button === 1) {
          isDraggingPan = true;
          lastPanX = e.clientX;
          lastPanY = e.clientY;
          e.preventDefault();
        }
        return;
      }

      const targetLane = getSlashLaneFromTarget(e.target);
      let lane: SlashLane | 'chord' | null = null;
      if (targetLane !== null) {
        if (e.button === 0 || e.button === 1 || e.button === 2) {
          lane = targetLane;
        }
      } else if (e.button === 0) {
        lane = 'high';
      } else if (e.button === 2) {
        lane = 'low';
      } else if (e.button === 1) {
        lane = 'chord';
      }

      if (!lane) return;

      e.preventDefault();
      const sourceId = `mouse:${e.button}`;
      const prevLane = activeMouseButtons.get(e.button);
      if (prevLane && prevLane !== lane) {
        removeHoldSource(prevLane, sourceId);
      }
      activeMouseButtons.set(e.button, lane);
      addHoldSource(lane, sourceId);

      if (lane === 'high') {
        this.commands.onSlashHigh(e.timeStamp);
      } else if (lane === 'low') {
        this.commands.onSlashLow(e.timeStamp);
      } else {
        this.commands.onSlashChord(e.timeStamp);
      }
    };

    const onWindowMouseUp = (e: MouseEvent) => {
      isDraggingPan = false;
      const sourceId = `mouse:${e.button}`;
      const recordedLane = activeMouseButtons.get(e.button);
      if (recordedLane) {
        activeMouseButtons.delete(e.button);
        removeHoldSource(recordedLane, sourceId);
      }
    };

    const onWindowMouseMove = (e: MouseEvent) => {
      if (!isDraggingPan) return;
      if (
        !syncPauseState() ||
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
      if (!containerEl || !this.commands.isGameActive() || this.commands.isRunFinished()) {
        return;
      }
      const isPaused = syncPauseState();

      if (isPaused) {
        for (let i = 0; i < e.touches.length; i++) {
          const existing = e.touches[i]!;
          if (pausedTouches.has(existing.identifier)) {
            pausedTouches.set(existing.identifier, {
              x: existing.clientX,
              y: existing.clientY,
            });
          }
        }

        let handledPaused = false;
        for (let i = 0; i < e.changedTouches.length; i++) {
          const touch = e.changedTouches[i]!;
          const touchTarget = touch.target ?? e.target;
          if (isUiTarget(touchTarget)) continue;
          pausedTouches.set(touch.identifier, { x: touch.clientX, y: touch.clientY });
          handledPaused = true;
        }
        if (handledPaused) {
          e.preventDefault();
        }
        return;
      }

      const nowMs =
        Number.isFinite(e.timeStamp) && e.timeStamp > 0 ? e.timeStamp : performance.now();
      const rect = containerEl.getBoundingClientRect();
      const splitRatio = this.commands.getTouchSplitYRatio?.() ?? 0.6;
      const midY = rect.top + rect.height * splitRatio;

      let recentOppositeHigh = false;
      let recentOppositeLow = false;
      for (const prev of activeTouches.values()) {
        if (nowMs - prev.startTimeMs <= TOUCH_CHORD_SYNC_MS) {
          if (prev.lane === 'high') recentOppositeHigh = true;
          else if (prev.lane === 'low') recentOppositeLow = true;
        }
      }

      let handledLive = false;
      let addedHigh = false;
      let addedLow = false;
      let addedChord = false;

      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i]!;
        const touchTarget = touch.target ?? e.target;
        const slashLane = getSlashLaneFromTarget(touchTarget);
        let lane: SlashLane | 'chord';
        if (slashLane !== null) {
          lane = slashLane;
        } else if (isUiTarget(touchTarget)) {
          continue;
        } else {
          lane = touch.clientY < midY ? 'high' : 'low';
        }

        handledLive = true;
        const sourceId = `touch:${touch.identifier}`;
        const prevEntry = activeTouches.get(touch.identifier);
        if (prevEntry && prevEntry.lane !== lane) {
          removeHoldSource(prevEntry.lane, sourceId);
        }
        activeTouches.set(touch.identifier, { lane, startTimeMs: nowMs });
        addHoldSource(lane, sourceId);

        if (lane === 'chord') addedChord = true;
        else if (lane === 'high') addedHigh = true;
        else addedLow = true;
      }

      if (!handledLive) return;
      e.preventDefault();

      const shouldFireChord =
        addedChord ||
        (addedHigh && addedLow) ||
        (addedHigh && recentOppositeLow) ||
        (addedLow && recentOppositeHigh);

      if (shouldFireChord) {
        this.commands.onSlashChord(e.timeStamp);
      } else if (addedHigh) {
        this.commands.onSlashHigh(e.timeStamp);
      } else if (addedLow) {
        this.commands.onSlashLow(e.timeStamp);
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!containerEl) return;
      const isPaused = syncPauseState();
      if (!this.commands.isGameActive() || this.commands.isRunFinished()) {
        pausedTouches.clear();
        return;
      }

      if (!isPaused) {
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (activeTouches.has(e.changedTouches[i]!.identifier)) {
            e.preventDefault();
            break;
          }
        }
        return;
      }

      if (pausedTouches.size === 0) return;

      let matchedTracked = false;
      const nextPositions = new Map<number, { x: number; y: number }>();
      for (const [id, pos] of pausedTouches.entries()) {
        nextPositions.set(id, { x: pos.x, y: pos.y });
      }
      for (let i = 0; i < e.touches.length; i++) {
        const t = e.touches[i]!;
        if (nextPositions.has(t.identifier)) {
          nextPositions.set(t.identifier, { x: t.clientX, y: t.clientY });
          matchedTracked = true;
        }
      }
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i]!;
        if (nextPositions.has(t.identifier)) {
          nextPositions.set(t.identifier, { x: t.clientX, y: t.clientY });
          matchedTracked = true;
        }
      }

      if (!matchedTracked) return;
      e.preventDefault();

      if (pausedTouches.size === 1) {
        const [[id0, prev0]] = pausedTouches.entries();
        const next0 = nextPositions.get(id0)!;
        const dx = next0.x - prev0.x;
        const dy = next0.y - prev0.y;
        pausedTouches.set(id0, next0);
        if (dx !== 0 || dy !== 0) {
          this.commands.onPanDelta(dx, dy);
        }
        return;
      }

      const iter = pausedTouches.entries();
      const [id0, prev0] = iter.next().value as [number, { x: number; y: number }];
      const [id1, prev1] = iter.next().value as [number, { x: number; y: number }];
      const next0 = nextPositions.get(id0)!;
      const next1 = nextPositions.get(id1)!;

      const prevMidX = (prev0.x + prev1.x) * 0.5;
      const prevMidY = (prev0.y + prev1.y) * 0.5;
      const nextMidX = (next0.x + next1.x) * 0.5;
      const nextMidY = (next0.y + next1.y) * 0.5;

      const prevDist = Math.hypot(prev1.x - prev0.x, prev1.y - prev0.y);
      const nextDist = Math.hypot(next1.x - next0.x, next1.y - next0.y);

      for (const [id, pos] of nextPositions.entries()) {
        pausedTouches.set(id, pos);
      }

      if (prevDist >= 8 && nextDist >= 8 && Math.abs(nextDist - prevDist) > 1e-4) {
        const factor = nextDist / prevDist;
        if (Number.isFinite(factor) && factor > 0) {
          const rect = containerEl.getBoundingClientRect();
          this.commands.onWheelZoom(factor, nextMidX - rect.left, nextMidY - rect.top);
        }
      }

      const dMidX = nextMidX - prevMidX;
      const dMidY = nextMidY - prevMidY;
      if (dMidX !== 0 || dMidY !== 0) {
        this.commands.onPanDelta(dMidX, dMidY);
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      syncPauseState();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i]!;
        const entry = activeTouches.get(touch.identifier);
        if (entry) {
          activeTouches.delete(touch.identifier);
          removeHoldSource(entry.lane, `touch:${touch.identifier}`);
        }
        pausedTouches.delete(touch.identifier);
      }

      // Refresh remaining fingers' baseline on 2->1 finger transition to prevent pan jumps
      for (let i = 0; i < e.touches.length; i++) {
        const remaining = e.touches[i]!;
        if (pausedTouches.has(remaining.identifier)) {
          pausedTouches.set(remaining.identifier, {
            x: remaining.clientX,
            y: remaining.clientY,
          });
        }
      }
    };

    const onTouchCancel = () => {
      clearAllPointerState();
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
    containerEl?.addEventListener('touchmove', onTouchMove, { passive: false });
    containerEl?.addEventListener('touchend', onTouchEnd);
    containerEl?.addEventListener('touchcancel', onTouchCancel);
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
      containerEl?.removeEventListener('touchmove', onTouchMove);
      containerEl?.removeEventListener('touchend', onTouchEnd);
      containerEl?.removeEventListener('touchcancel', onTouchCancel);
      containerEl?.removeEventListener('contextmenu', onContextMenu);
      containerEl?.removeEventListener('wheel', onWheel);
    };
  }
}
