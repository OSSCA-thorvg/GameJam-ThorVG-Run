import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export const MENU_TOOLTIP_DOM_ID = 'menu-hover-tooltip';
const VIEWPORT_MARGIN_PX = 8;
const ANCHOR_GAP_PX = 10;
const DEFAULT_ACCENT_HEX = '#05D5FF';

export interface MenuTooltipData {
  id: string;
  title: string;
  body: string;
  meta?: string;
  accentHex?: string;
}

export interface ActiveMenuTooltip extends MenuTooltipData {
  anchorEl: HTMLElement;
}

export interface UseMenuTooltipResult {
  activeTip: ActiveMenuTooltip | null;
  activeTipId: (id: string) => string | undefined;
  showTip: (anchorEl: HTMLElement, tip: MenuTooltipData) => void;
  toggleTouchTip: (
    e: React.MouseEvent<HTMLElement>,
    tip: MenuTooltipData,
    anchorOverride?: HTMLElement | null
  ) => void;
  hideTip: () => void;
}

export function useMenuTooltip(): UseMenuTooltipResult {
  const [activeTip, setActiveTip] = useState<ActiveMenuTooltip | null>(null);
  const activeTipRef = useRef<ActiveMenuTooltip | null>(null);
  const triggerSourceRef = useRef<'hover' | 'toggle' | null>(null);

  const hideTip = useCallback(() => {
    triggerSourceRef.current = null;
    activeTipRef.current = null;
    setActiveTip(null);
  }, []);

  const showTip = useCallback((anchorEl: HTMLElement, tip: MenuTooltipData) => {
    triggerSourceRef.current = 'hover';
    const next: ActiveMenuTooltip = { ...tip, anchorEl };
    activeTipRef.current = next;
    setActiveTip(next);
  }, []);

  const toggleTouchTip = useCallback(
    (
      e: React.MouseEvent<HTMLElement>,
      tip: MenuTooltipData,
      anchorOverride?: HTMLElement | null
    ) => {
      const anchorEl = anchorOverride ?? e.currentTarget;
      const current = activeTipRef.current;

      if (current && current.id === tip.id) {
        // 마우스 호버로 열린 상태에서의 첫 클릭은 토글 고정으로 유지하고, 터치 탭이나 재클릭 시 닫는다.
        if (triggerSourceRef.current === 'hover' && e.detail >= 1) {
          triggerSourceRef.current = 'toggle';
          const next: ActiveMenuTooltip = { ...tip, anchorEl };
          activeTipRef.current = next;
          setActiveTip(next);
          return;
        }
        hideTip();
        return;
      }

      triggerSourceRef.current = 'toggle';
      const next: ActiveMenuTooltip = { ...tip, anchorEl };
      activeTipRef.current = next;
      setActiveTip(next);
    },
    [hideTip]
  );

  const activeTipId = useCallback(
    (id: string): string | undefined => (activeTip?.id === id ? MENU_TOOLTIP_DOM_ID : undefined),
    [activeTip]
  );

  useEffect(() => {
    if (!activeTip) return;

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target;
      // 열려 있는 앵커(ⓘ 배지·잠긴 스킨 등)를 다시 탭해 닫을 때 pointerdown→click 재오픈 경쟁을 방지한다.
      if (target instanceof Node && activeTip.anchorEl.contains(target)) {
        return;
      }
      hideTip();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        hideTip();
      }
    };

    const handleResize = () => {
      hideTip();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleResize);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleResize);
    };
  }, [activeTip, hideTip]);

  return {
    activeTip,
    activeTipId,
    showTip,
    toggleTouchTip,
    hideTip,
  };
}

interface MenuTooltipPortalProps {
  activeTip: ActiveMenuTooltip | null;
  hideTip: () => void;
}

interface TooltipLayout {
  tip: ActiveMenuTooltip;
  left: number;
  top: number;
  placement: 'top' | 'bottom';
}

export const MenuTooltipPortal: React.FC<MenuTooltipPortalProps> = ({ activeTip, hideTip }) => {
  const tipRef = useRef<HTMLDivElement | null>(null);
  const [layout, setLayout] = useState<TooltipLayout | null>(null);

  useLayoutEffect(() => {
    const el = tipRef.current;
    if (!el || !activeTip) {
      setLayout(null);
      return;
    }

    if (!activeTip.anchorEl.isConnected) {
      setLayout(null);
      hideTip();
      return;
    }

    // 실측 직전 좌표를 (0, 0)으로 리셋해 우측 가장자리 shrink-to-fit 줄바꿈 왜곡을 차단한다.
    el.style.left = '0px';
    el.style.top = '0px';

    const anchorRect = activeTip.anchorEl.getBoundingClientRect();
    const tipRect = el.getBoundingClientRect();

    const preferredTop = anchorRect.top - tipRect.height - ANCHOR_GAP_PX;
    const placement: 'top' | 'bottom' = preferredTop >= VIEWPORT_MARGIN_PX ? 'top' : 'bottom';
    const top =
      placement === 'top'
        ? preferredTop
        : Math.max(
            VIEWPORT_MARGIN_PX,
            Math.min(
              window.innerHeight - tipRect.height - VIEWPORT_MARGIN_PX,
              anchorRect.bottom + ANCHOR_GAP_PX
            )
          );
    const left = Math.max(
      VIEWPORT_MARGIN_PX,
      Math.min(
        window.innerWidth - tipRect.width - VIEWPORT_MARGIN_PX,
        anchorRect.left + anchorRect.width / 2 - tipRect.width / 2
      )
    );

    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    setLayout({ tip: activeTip, left, top, placement });
  }, [activeTip, hideTip]);

  if (!activeTip || typeof document === 'undefined') {
    return null;
  }

  const isPositioned = layout !== null && layout.tip === activeTip;
  const accent = activeTip.accentHex ?? DEFAULT_ACCENT_HEX;
  const borderColor = /^#[0-9a-fA-F]{6}$/.test(accent) ? `${accent}99` : accent;

  return createPortal(
    <div
      ref={tipRef}
      id={MENU_TOOLTIP_DOM_ID}
      data-testid="menu-hover-tooltip"
      data-placement={isPositioned ? layout.placement : 'top'}
      role="tooltip"
      className="menu-hover-tooltip"
      style={{
        left: isPositioned ? `${layout.left}px` : '0px',
        top: isPositioned ? `${layout.top}px` : '0px',
        visibility: isPositioned ? 'visible' : 'hidden',
        borderColor,
      }}
    >
      <strong className="menu-hover-tooltip-title" style={{ color: accent }}>
        {activeTip.title}
      </strong>
      <p className="menu-hover-tooltip-body">{activeTip.body}</p>
      {activeTip.meta && <small className="menu-hover-tooltip-meta">{activeTip.meta}</small>}
    </div>,
    document.body
  );
};
