/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { useReducedMotion } from '../../../viewmodels/useReducedMotion';
import { ROUTE_REVEAL_MS } from './mapDesign';

const FRAME_MS = 33; // ~30 fps: plenty for a ~0.75 s line growth, half the native updates of 60 fps

/**
 * Overall reveal progress (0..1) for the route identified by `key`: 0 when a new key appears, 1 after
 * ROUTE_REVEAL_MS. Presentation only — callers draw the route's data from this, nothing waits on it. No key, or OS
 * reduce-motion, means the whole route immediately. The same key never restarts.
 */
export function useRouteReveal(key: string | undefined): number {
  const reducedMotion = useReducedMotion();
  const [state, setState] = useState<{ key: string | undefined; progress: number }>({ key, progress: key === undefined ? 1 : 0 });

  useEffect(() => {
    if (key === undefined || reducedMotion) return;
    const start = Date.now();
    setState({ key, progress: 0 });
    const timer = setInterval(() => {
      const progress = Math.min(1, (Date.now() - start) / ROUTE_REVEAL_MS);
      setState({ key, progress });
      if (progress >= 1) clearInterval(timer);
    }, FRAME_MS);
    return () => clearInterval(timer);
  }, [key, reducedMotion]);

  if (key === undefined || reducedMotion) return 1;
  // A new key renders as 0 immediately (before its effect has run), never as the previous route's 1.
  return state.key === key ? state.progress : 0;
}
