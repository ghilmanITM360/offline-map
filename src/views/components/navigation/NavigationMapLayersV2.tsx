/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { Animated, Text, View } from 'react-native';
import { Marker, Polyline } from 'react-native-maps';
import { NoInfoWindow } from '../map/NoInfoWindow';
import { Navigation, MapPin } from 'lucide-react-native';

import { V2MapRenderingService } from '../../../services/V2MapRenderingService';
import { NavigationOverlayV2 } from '../../../viewmodels/useNavigationOverlayV2';
import { RastaLayer } from '../map/RastaLayer';
import { SpecialRouteLayer } from '../map/SpecialRouteLayer';
import { BlockLayer } from '../map/BlockLayer';
import { navOverlayStyles as styles } from './navOverlayStyles';
import { markerSizes, staticColors } from '../../../theme';
import { OutsideRoutePolyline } from './OutsideRoutePolyline';
import { resolveMapMarkerOwnership } from '../map/MapMarkerOwnership';

/** Renders as children of the shared MapView while a v2 route is being navigated. */
export function NavigationMapLayersV2({ overlay }: { overlay: NavigationOverlayV2 }) {
  const { route, snappedLocation, arrived, reroutePending, mapLayers, userPulseAnim, currentLocationSource } = overlay;
  // useMemo must run unconditionally on every render (Rules of Hooks) — this
  // sits above the `!route` early return below, matching HomeScreen's
  // equivalent preview-path memo (activePreviewRoute?.coordinates ?? []).
  const { outside: outsideLegCoordinates, inside: insideLegCoordinates } = useMemo(
    () => V2MapRenderingService.splitOutsideInsideCoordinates(route?.coordinates ?? [], route?.outsideLegCoordinateCount),
    [route?.coordinates, route?.outsideLegCoordinateCount],
  );
  // AUD-10: this used to gate on `outsideLegCoordinates.length > 0` — whether the ROUTE ever
  // had an outside leg at all, a static property that stays true for the entire lifetime of a
  // hybrid route. That froze walked/remaining progress at "none" forever, even long after the
  // user passed the gate and walked deep into the venue. splitByProgress already finds the
  // nearest INSIDE-leg vertex to snappedLocation on its own: while genuinely still outside, the
  // shared gate coordinate (index 0 of insideLegCoordinates) is the nearest inside vertex to any
  // point on the outside leg, so it naturally reports no walked progress without needing this
  // route-level flag — and once truly on the inside leg, it correctly reflects real progress.
  const { walked: walkedInsideCoordinates, remaining: remainingInsideCoordinates } = useMemo(
    () => V2MapRenderingService.splitByProgress(insideLegCoordinates, snappedLocation),
    [insideLegCoordinates, snappedLocation],
  );
  if (!route) return null;

  const startCoordinate = route.origin.coordinate;
  const destinationCoordinate = route.destination.coordinate;
  const markerOwnership = resolveMapMarkerOwnership(arrived ? 'ARRIVAL' : 'NAVIGATION', !!snappedLocation);

  return (
    <>
      <RastaLayer rastas={mapLayers.rastas} variant="nav" keyPrefix="hnav_v2_rasta" />
      <SpecialRouteLayer routes={mapLayers.specialRoutes} variant="nav" keyPrefix="hnav_v2_special" />
      <BlockLayer blocks={mapLayers.blocks} variant="nav" keyPrefix="hnav_v2_block" />
      {/* Nav-mode gate labels render via HomeScreen's shared MapLabelOverlay (see
          mapLabelItems), built from `overlay.mapLayers.gates` — not rendered here. */}

      {outsideLegCoordinates.length > 1 && (
        <OutsideRoutePolyline
          coordinates={outsideLegCoordinates}
          roadFollowing={route.outsideRoute?.roadFollowing ?? false}
          zIndex={18}
        />
      )}
      <Polyline
        coordinates={insideLegCoordinates}
        strokeColor={staticColors.routeCasing}
        strokeWidth={11}
        lineDashPattern={reroutePending ? [10, 5] : undefined}
        zIndex={20}
      />
      {reroutePending ? (
        <Polyline coordinates={insideLegCoordinates} strokeColor={staticColors.routeInside} strokeWidth={7} lineDashPattern={[10, 5]} zIndex={21} />
      ) : (
        <>
          {walkedInsideCoordinates.length > 1 && (
            <Polyline testID="navigation-walked-polyline" coordinates={walkedInsideCoordinates} strokeColor={staticColors.routeWalked} strokeWidth={7} zIndex={21} />
          )}
          <Polyline testID="navigation-remaining-polyline" coordinates={remainingInsideCoordinates} strokeColor={staticColors.routeInside} strokeWidth={7} zIndex={22} />
        </>
      )}

      {markerOwnership.showNavigationStart && <Marker testID="navigation-start-marker" coordinate={startCoordinate} title={route.origin.label} accessibilityLabel={route.origin.label} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
        <View style={styles.startMarkerWrap}>
          <View style={styles.startMarkerDot} />
          <View style={styles.startMarkerLabel}>
            <Text style={styles.startMarkerLabelText}>START</Text>
          </View>
        </View>
        <NoInfoWindow />
      </Marker>}

      {markerOwnership.showNavigationDestination && <Marker testID="navigation-destination-marker" coordinate={destinationCoordinate} title={route.destination.label} accessibilityLabel={route.destination.label} anchor={{ x: 0.5, y: 1 }} tracksViewChanges={false}>
        <View style={styles.destinationMarker}>
          <MapPin size={markerSizes.destination} color={staticColors.gateAccent} fill={staticColors.gateAccent} />
        </View>
        <NoInfoWindow />
      </Marker>}

      {markerOwnership.showNavigationUser && snappedLocation && (
        // tracksViewChanges={false} matches HomeScreen's identical browse-mode pulse marker
        // (the Animated.View pulse still renders correctly with it off; leaving it default/true
        // here would make this marker re-snapshot continuously during every nav session).
        <Marker
          testID="navigation-user-location-marker"
          coordinate={snappedLocation}
          flat
          anchor={{ x: 0.5, y: 0.5 }}
          tracksViewChanges={false}
          accessibilityLabel={currentLocationSource === 'remembered' ? 'Your last known location' : 'Your location'}
          // Android's Google Maps SDK names a marker for TalkBack from its title and ignores accessibilityLabel
          // (react-native-maps#3500); an empty tooltip callout stops the title popping a default info window.
          title={currentLocationSource === 'remembered' ? 'Your last known location' : 'Your location'}
        >
          <View style={styles.userMarkerWrap}>
            <Animated.View
              style={[
                styles.userMarkerPulse,
                {
                  opacity: userPulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.38, 0] }),
                  transform: [{ scale: userPulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 2.4] }) }],
                },
              ]}
            />
            <View style={styles.userMarker}>
              <Navigation size={12} color="#FFFFFF" />
            </View>
            {currentLocationSource === 'remembered' && (
              <View style={styles.rememberedLabel}>
                <Text style={styles.rememberedLabelText}>last known</Text>
              </View>
            )}
          </View>
          <NoInfoWindow />
        </Marker>
      )}
    </>
  );
}
