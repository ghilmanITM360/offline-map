/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { PULSE_DURATION_MS, type PulsePhase } from '../views/components/mapgl/mapDesign';

/** The ring sits still and visible while the camera eases to the destination, then ripples out once. */
export const PULSE_START_HOLD_MS = 400;

/**
 * Phase of the destination ring for the chosen destination `key` (any stable string, e.g. its coordinates).
 * One cycle per destination — start, out, idle — never repeating; re-rendering with the same key does not
 * restart it, a different key does. Reduced motion: a static ring for as long as a destination is chosen.
 */
export function useDestinationPulse(key: string | null, reducedMotion: boolean): PulsePhase {
  const [played, setPlayed] = useState<{ key: string; done: boolean } | null>(null);

  useEffect(() => {
    if (key === null) {
      setPlayed(null);
      return;
    }
    if (reducedMotion) return;
    const out = setTimeout(() => setPlayed({ key, done: false }), PULSE_START_HOLD_MS);
    const done = setTimeout(() => setPlayed({ key, done: true }), PULSE_START_HOLD_MS + PULSE_DURATION_MS + 60);
    return () => {
      clearTimeout(out);
      clearTimeout(done);
    };
  }, [key, reducedMotion]);

  if (key === null) return 'idle';
  if (reducedMotion) return 'static';
  if (played?.key === key) return played.done ? 'idle' : 'out';
  return 'start';
}
