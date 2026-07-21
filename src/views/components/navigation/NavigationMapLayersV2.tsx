/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { Animated, Text, View } from 'react-native';
import { Marker, Polyline } from 'react-native-maps';
import { Navigation, MapPin } from 'lucide-react-native';

import { V2MapRenderingService } from '../../../services/V2MapRenderingService';
import { NavigationOverlayV2 } from '../../../viewmodels/useNavigationOverlayV2';
import { RastaLayer } from '../map/RastaLayer';
import { SpecialRouteLayer } from '../map/SpecialRouteLayer';
import { BlockLayer } from '../map/BlockLayer';
import { navOverlayStyles as styles } from './navOverlayStyles';

/** Renders as children of the shared MapView while a v2 route is being navigated. */
export function NavigationMapLayersV2({ overlay }: { overlay: NavigationOverlayV2 }) {
  const { route, snappedLocation, reroutePending, mapLayers, userPulseAnim, currentLocationSource } = overlay;
  // useMemo must run unconditionally on every render (Rules of Hooks) — this
  // sits above the `!route` early return below, matching HomeScreen's
  // equivalent preview-path memo (activePreviewRoute?.coordinates ?? []).
  const { outside: outsideLegCoordinates, inside: insideLegCoordinates } = useMemo(
    () => V2MapRenderingService.splitOutsideInsideCoordinates(route?.coordinates ?? [], route?.outsideLegCoordinateCount),
    [route?.coordinates, route?.outsideLegCoordinateCount],
  );
  if (!route) return null;

  const startCoordinate = route.origin.coordinate;
  const destinationCoordinate = route.destination.coordinate;

  return (
    <>
      <RastaLayer rastas={mapLayers.rastas} variant="nav" keyPrefix="hnav_v2_rasta" />
      <SpecialRouteLayer routes={mapLayers.specialRoutes} variant="nav" keyPrefix="hnav_v2_special" />
      <BlockLayer blocks={mapLayers.blocks} variant="nav" keyPrefix="hnav_v2_block" />
      {/* Nav-mode gate labels render via HomeScreen's shared MapLabelOverlay (see
          mapLabelItems), built from `overlay.mapLayers.gates` — not rendered here. */}

      {outsideLegCoordinates.length > 1 && (
        <>
          <Polyline coordinates={outsideLegCoordinates} strokeColor="rgba(230,124,0,0.55)" strokeWidth={9} zIndex={18} />
          <Polyline
            coordinates={outsideLegCoordinates}
            strokeColor="#E67C00"
            strokeWidth={5}
            lineDashPattern={[8, 6]}
            zIndex={19}
          />
        </>
      )}
      <Polyline
        coordinates={insideLegCoordinates}
        strokeColor="rgba(13,71,161,0.72)"
        strokeWidth={11}
        lineDashPattern={reroutePending ? [10, 5] : undefined}
        zIndex={20}
      />
      <Polyline
        coordinates={insideLegCoordinates}
        strokeColor="#1A73E8"
        strokeWidth={7}
        lineDashPattern={reroutePending ? [10, 5] : undefined}
        zIndex={21}
      />

      <Marker coordinate={startCoordinate} title={route.origin.label} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
        <View style={styles.startMarkerWrap}>
          <View style={styles.startMarkerDot} />
          <View style={styles.startMarkerLabel}>
            <Text style={styles.startMarkerLabelText}>START</Text>
          </View>
        </View>
      </Marker>

      <Marker coordinate={destinationCoordinate} title={route.destination.label} anchor={{ x: 0.5, y: 1 }} tracksViewChanges={false}>
        <View style={styles.destinationMarker}>
          <MapPin size={34} color="#EA4335" fill="#EA4335" />
        </View>
      </Marker>

      {snappedLocation && (
        // tracksViewChanges={false} matches HomeScreen's identical browse-mode pulse marker
        // (the Animated.View pulse still renders correctly with it off; leaving it default/true
        // here would make this marker re-snapshot continuously during every nav session).
        <Marker coordinate={snappedLocation} flat anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
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
        </Marker>
      )}
    </>
  );
}
