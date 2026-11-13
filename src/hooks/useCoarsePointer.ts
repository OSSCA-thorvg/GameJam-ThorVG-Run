import { useEffect, useState } from 'react';

const COARSE_POINTER_QUERY = '(pointer: coarse)';

function readCoarsePointer(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia(COARSE_POINTER_QUERY).matches;
}

/**
 * Reactively detects whether the primary input pointer is coarse (touch screen on phones/tablets).
 * Returns `false` on desktop mouse/trackpad environments so desktop labels stay 100% unchanged.
 */
export function useCoarsePointer(): boolean {
  const [isCoarse, setIsCoarse] = useState<boolean>(readCoarsePointer);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mql = window.matchMedia(COARSE_POINTER_QUERY);
    setIsCoarse(mql.matches);

    const handleChange = (event: MediaQueryListEvent) => {
      setIsCoarse(event.matches);
    };

    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', handleChange);
      return () => mql.removeEventListener('change', handleChange);
    }
    mql.addListener(handleChange);
    return () => mql.removeListener(handleChange);
  }, []);

  return isCoarse;
}
