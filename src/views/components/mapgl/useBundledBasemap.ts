/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { getBundledBasemap } from '../../../services/BundledBasemap';

export type BasemapState = { status: 'loading' | 'failed'; uri: null } | { status: 'ready'; uri: string };

/** Installs (first launch) or reuses the bundled basemap. Purely local; `failed` renders a plain canvas. */
export function useBundledBasemap(): BasemapState {
  const [state, setState] = useState<BasemapState>({ status: 'loading', uri: null });
  useEffect(() => {
    let cancelled = false;
    getBundledBasemap().then(
      ({ uri }) => !cancelled && setState({ status: 'ready', uri }),
      () => !cancelled && setState({ status: 'failed', uri: null }),
    );
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}
