/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getDistance } from 'geolib';
import { Coordinate } from '../models/types';

export type TapCandidateKind = 'gate' | 'block' | 'rasta' | 'route' | 'facility';

export interface TapCandidate<T = unknown> {
  id: string;
  kind: TapCandidateKind;
  /** Native press-event coordinate, when the platform/shape type reports one.
   * Marker onPress always reports one (its own anchor coordinate); Polygon/Polyline
   * onPress only reports one on Android. Undefined on iOS for line/polygon hits. */
  coordinate?: Coordinate;
  payload: T;
}

/**
 * Resolves which map object should win when a single tap fires native onPress on
 * more than one overlapping shape (e.g. a rasta hit-corridor overlapping a gate's
 * widened touch target). react-native-maps' hit-testing is a black box — JS only
 * ever learns which shapes DID fire onPress, never "nearest shape to a miss" — so
 * this only disambiguates among candidates that actually fired, it cannot invent a
 * winner when nothing fired.
 *
 * Priority: (1) the currently-selected object wins outright if it's among the
 * candidates, (2) a single candidate is trivially the winner, (3) otherwise the
 * candidate closest to the centroid of all reported coordinates wins — since every
 * candidate fired only because the tap genuinely hit its geometry, all reported
 * points already cluster near the real tap, so nearest-to-centroid is a good proxy
 * for "what the user meant" without needing a raw tap point (which iOS doesn't
 * provide for Polygon/Polyline hits).
 */
export function resolveTapCandidate<T>(
  candidates: TapCandidate<T>[],
  selectedId: string | null | undefined,
): TapCandidate<T> | null {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  if (selectedId) {
    const selected = candidates.find((c) => c.id === selectedId);
    if (selected) return selected;
  }

  const withCoordinate = candidates.filter((c): c is TapCandidate<T> & { coordinate: Coordinate } => !!c.coordinate);
  if (withCoordinate.length === 0) return candidates[0];
  if (withCoordinate.length === 1) return withCoordinate[0];

  const centroid: Coordinate = {
    latitude: withCoordinate.reduce((sum, c) => sum + c.coordinate.latitude, 0) / withCoordinate.length,
    longitude: withCoordinate.reduce((sum, c) => sum + c.coordinate.longitude, 0) / withCoordinate.length,
  };

  return withCoordinate.reduce((nearest, c) =>
    getDistance(c.coordinate, centroid) < getDistance(nearest.coordinate, centroid) ? c : nearest,
  );
}
