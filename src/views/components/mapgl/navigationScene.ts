/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { V2MapRenderingService } from '../../../services/V2MapRenderingService';
import type { NavigationOverlayV2 } from '../../../viewmodels/useNavigationOverlayV2';
import { resolveMapMarkerOwnership } from '../map/MapMarkerOwnership';
import { IJTEMA_DATA } from '../../../constants/data';
import { RoutePointService } from '../../../services/RoutePointService';
import type { NavigationOverlayV1 } from '../../../viewmodels/useNavigationOverlayV1';
import type { PulsePhase } from './mapDesign';
import { buildMarkerOverlay, buildNavigationVenueOverlay, buildRouteOverlay, buildVenueBoundaryOverlay, type OverlaySpec } from './overlaySpec';

type NavSceneInput = Pick<NavigationOverlayV2, 'route' | 'snappedLocation' | 'arrived' | 'reroutePending' | 'mapLayers' | 'currentLocationSource'> & {
  /** Set only when the route was REPLACED (accepted reroute): the new route reveals and the old one fades. */
  revealKey?: string;
  /** Destination ring phase; arrival plays it once per journey. */
  pulse?: PulsePhase;
};

/**
 * Everything the map shows during NAVIGATION / ARRIVAL, bottom → top: quiet venue context, the route
 * (outside leg, walked portion muted, remaining emphasised), then pins and the user dot. Progress comes
 * straight from the snapped location — nothing here animates or invents movement.
 */
export function buildNavigationScene(overlay: NavSceneInput): OverlaySpec[] {
  const { route, snappedLocation, arrived, reroutePending, mapLayers, currentLocationSource, revealKey, pulse } = overlay;
  if (!route) return [];

  const { outside, inside } = V2MapRenderingService.splitOutsideInsideCoordinates(route.coordinates ?? [], route.outsideLegCoordinateCount);
  const { walked, remaining } = V2MapRenderingService.splitByProgress(inside, snappedLocation);
  const ownership = resolveMapMarkerOwnership(arrived ? 'ARRIVAL' : 'NAVIGATION', !!snappedLocation);

  return [
    ...buildNavigationVenueOverlay({ blocks: mapLayers.blocks, rastas: mapLayers.rastas, specialRoutes: mapLayers.specialRoutes }),
    ...buildRouteOverlay({ outside, roadFollowing: route.outsideRoute?.roadFollowing ?? false, inside, walked, remaining, reroutePending, revealKey }),
    ...buildMarkerOverlay({
      destination: ownership.showNavigationDestination ? route.destination.coordinate : null,
      pulse,
      start: ownership.showNavigationStart ? route.origin.coordinate : null,
      user: ownership.showNavigationUser && snappedLocation ? { coordinate: snappedLocation, remembered: currentLocationSource === 'remembered' } : null,
    }),
  ];
}

type NavSceneInputV1 = Pick<NavigationOverlayV1, 'route' | 'destination' | 'snappedLocation' | 'arrived' | 'reroutePending' | 'mapLayers' | 'currentLocationSource'> & {
  revealKey?: string;
  pulse?: PulsePhase;
};

/**
 * The legacy (v1) navigation scene — still used for facility destinations, whose routes come from the v1
 * graph. Same layering as the v2 scene: venue outline, quiet graph context, the route, then pins/user dot.
 */
export function buildNavigationSceneV1(overlay: NavSceneInputV1): OverlaySpec[] {
  const { route, destination, snappedLocation, arrived, reroutePending, mapLayers, currentLocationSource, revealKey, pulse } = overlay;
  if (!route) return [];

  const ownership = resolveMapMarkerOwnership(arrived ? 'ARRIVAL' : 'NAVIGATION', !!snappedLocation);
  const destinationCoordinate = destination ? RoutePointService.getDestinationCoordinate(destination) : null;
  const edges = mapLayers.edges.flatMap((edge) => {
    const from = IJTEMA_DATA.nodes[edge.from];
    const to = IJTEMA_DATA.nodes[edge.to];
    return from && to
      ? [{ id: `${edge.from}_${edge.to}`, polyline: [{ latitude: from.lat, longitude: from.lng }, { latitude: to.lat, longitude: to.lng }], isSelected: false }]
      : [];
  });
  const blocks = mapLayers.blocks.flatMap((block) => {
    const polygon = block.corners ?? [];
    return polygon.length > 2 ? [{ id: block.id, polygon, isSelected: block.id === destination?.id }] : [];
  });

  return [
    buildVenueBoundaryOverlay(mapLayers.venueBoundary),
    ...buildNavigationVenueOverlay({ blocks: blocks as never, rastas: edges as never, specialRoutes: [] }),
    ...buildRouteOverlay({ outside: [], roadFollowing: false, inside: route.coordinates, reroutePending, revealKey }),
    ...buildMarkerOverlay({
      destination: ownership.showNavigationDestination ? destinationCoordinate : null,
      pulse,
      start: ownership.showNavigationStart ? route.coordinates[0] ?? null : null,
      user: ownership.showNavigationUser && snappedLocation ? { coordinate: snappedLocation, remembered: currentLocationSource === 'remembered' } : null,
    }),
  ];
}
