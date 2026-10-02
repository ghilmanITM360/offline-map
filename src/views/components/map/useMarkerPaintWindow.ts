/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';

/**
 * Android's Google Maps SDK snapshots a marker's children into a bitmap. With `tracksViewChanges={false}`
 * from the first frame that snapshot is taken before an SVG child (lucide icon) has painted, and the marker
 * never shows (facility markers, #128 C, reproduced on an API 36 emulator). Pass the result as
 * `tracksViewChanges`: it is true on mount and whenever `key` changes (so a restyled child is captured too),
 * then false once the window has passed, so the bitmap is frozen instead of redrawn every frame.
 */
export const MARKER_PAINT_MS = 1500;

export function useMarkerPaintWindow(key: unknown): boolean {
  const [state, setState] = useState({ key, tracking: true });
  // Adjusting state while rendering makes the commit that restyles the child already track.
  if (state.key !== key) setState({ key, tracking: true });

  useEffect(() => {
    const timer = setTimeout(
      () => setState((current) => (current.key === key ? { key, tracking: false } : current)),
      MARKER_PAINT_MS,
    );
    return () => clearTimeout(timer);
  }, [key]);

  return state.key !== key ? true : state.tracking;
}
