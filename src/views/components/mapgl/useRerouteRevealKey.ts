/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useRef } from 'react';

/**
 * Reveal key for the active navigation route: undefined for the route a trip starts with (it simply continues the
 * preview), a new key each time it is REPLACED (an accepted reroute), undefined again once navigation ends.
 * `routeKey` is the route's geometry identity, or null when there is no active route.
 */
export function useRerouteRevealKey(routeKey: string | null): string | undefined {
  const state = useRef<{ last: string | null; generation: number }>({ last: null, generation: 0 });
  // Idempotent per render (same input, same state), so writing the ref here is safe.
  if (routeKey === null) state.current = { last: null, generation: 0 };
  else if (state.current.last === null) state.current = { last: routeKey, generation: 0 };
  else if (state.current.last !== routeKey) state.current = { last: routeKey, generation: state.current.generation + 1 };
  return state.current.generation > 0 && routeKey !== null ? `${routeKey}#${state.current.generation}` : undefined;
}
