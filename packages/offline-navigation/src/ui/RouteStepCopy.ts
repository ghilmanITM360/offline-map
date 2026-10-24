/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { RouteStep } from '../domain/navigation';
import type { RouteGuideCardStep } from './RouteGuideCard';

/** Resolved wording for one language; the host owns language. English ships separately (EnglishNavigationCopy), so other languages are host-supplied. */
export interface RouteStepCopy {
  depart: string;
  turnLeft: string;
  turnRight: string;
  arrive: (destinationLabel: string) => string;
  meters: (metres: number) => string;
  /** Receives a one-decimal string such as "1.5". */
  kilometers: (kilometres: string) => string;
}

/** Whole metres below a kilometre, one-decimal kilometres from there; null when it is not a distance (shown as nothing, never as a guess). */
export function formatDistance(metres: number, copy: RouteStepCopy): string | null {
  if (!Number.isFinite(metres) || metres < 0) return null;
  const rounded = Math.round(metres);
  return rounded >= 1000 ? copy.kilometers((metres / 1000).toFixed(1)) : copy.meters(rounded);
}

/** Maps a controller step onto the props the RouteGuideCard already takes. */
export function describeRouteStep(step: RouteStep, copy: RouteStepCopy, destinationLabel: string): RouteGuideCardStep {
  switch (step.kind) {
    case 'arrive':
      return { instruction: copy.arrive(destinationLabel), distance: null };
    case 'turn_left':
      return { instruction: copy.turnLeft, distance: formatDistance(step.distanceM, copy) };
    case 'turn_right':
      return { instruction: copy.turnRight, distance: formatDistance(step.distanceM, copy) };
    case 'depart':
      return { instruction: copy.depart, distance: formatDistance(step.distanceM, copy) };
  }
}
