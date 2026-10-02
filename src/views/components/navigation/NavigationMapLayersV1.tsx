/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Animated, Text, View } from 'react-native';
import { Marker, Polygon, Polyline } from 'react-native-maps';
import { NoInfoWindow } from '../map/NoInfoWindow';
import { Navigation, MapPin } from 'lucide-react-native';

import { IJTEMA_DATA } from '../../../constants/data';
import { RoutePointService } from '../../../services/RoutePointService';
import { NavigationOverlayV1 } from '../../../viewmodels/useNavigationOverlayV1';
import { navOverlayStyles as styles } from './navOverlayStyles';
import { markerSizes, staticColors } from '../../../theme';
import { resolveMapMarkerOwnership } from '../map/MapMarkerOwnership';

/** Renders as children of the shared MapView while a legacy (v1) route is being
 * navigated — moved verbatim out of the old standalone NavigationScreen. */
export function NavigationMapLayersV1({ overlay }: { overlay: NavigationOverlayV1 }) {
  const { route, destination, snappedLocation, arrived, reroutePending, mapLayers, userPulseAnim, currentLocationSource } = overlay;
  if (!route) return null;

  const startCoordinate = route.coordinates[0] ?? null;
  const destinationCoordinate = destination ? RoutePointService.getDestinationCoordinate(destination) : null;
  const markerOwnership = resolveMapMarkerOwnership(arrived ? 'ARRIVAL' : 'NAVIGATION', !!snappedLocation);

  return (
    <>
      <Polygon
        coordinates={mapLayers.venueBoundary}
        fillColor="rgba(232,245,233,0.06)"
        strokeColor="rgba(46,125,50,0.48)"
        strokeWidth={2}
        zIndex={0}
      />

      {mapLayers.blocks.map((block) => (
        <Polygon
          key={`nav_v1_block_${block.id}`}
          coordinates={block.corners ?? block.polygon}
          fillColor={block.id === destination?.id ? 'rgba(46,125,50,0.2)' : 'rgba(46,125,50,0.08)'}
          strokeColor={block.id === destination?.id ? staticColors.normalBlock : 'rgba(95,99,104,0.45)'}
          strokeWidth={block.id === destination?.id ? 2 : 1}
          zIndex={0}
        />
      ))}

      {mapLayers.edges.map((edge, idx) => {
        const from = IJTEMA_DATA.nodes[edge.from];
        const to = IJTEMA_DATA.nodes[edge.to];
        if (!from || !to) return null;
        const coordinates = [
          { latitude: from.lat, longitude: from.lng },
          { latitude: to.lat, longitude: to.lng },
        ];
        return (
          <React.Fragment key={`nav_v1_edge_${edge.from}_${edge.to}_${idx}`}>
            <Polyline coordinates={coordinates} strokeColor="rgba(60,64,67,0.38)" strokeWidth={7} zIndex={1} />
            <Polyline coordinates={coordinates} strokeColor="rgba(255,255,255,0.86)" strokeWidth={4} zIndex={2} />
          </React.Fragment>
        );
      })}

      <Polyline
        coordinates={route.coordinates}
        strokeColor={staticColors.routeCasing}
        strokeWidth={11}
        lineDashPattern={reroutePending ? [10, 5] : undefined}
        zIndex={20}
      />
      <Polyline
        coordinates={route.coordinates}
        strokeColor={staticColors.routeInside}
        strokeWidth={7}
        lineDashPattern={reroutePending ? [10, 5] : undefined}
        zIndex={21}
      />

      {markerOwnership.showNavigationStart && startCoordinate && (
        <Marker testID="navigation-start-marker" coordinate={startCoordinate} title="Start" accessibilityLabel="Start" anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
          <View style={styles.startMarkerWrap}>
            <View style={styles.startMarkerDot} />
            <View style={styles.startMarkerLabel}>
              <Text style={styles.startMarkerLabelText}>START</Text>
            </View>
          </View>
          <NoInfoWindow />
        </Marker>
      )}

      {markerOwnership.showNavigationDestination && destination && destinationCoordinate && (
        <Marker testID="navigation-destination-marker" coordinate={destinationCoordinate} title={destination.name} accessibilityLabel={destination.name} anchor={{ x: 0.5, y: 1 }} tracksViewChanges={false}>
          <View style={styles.destinationMarker}>
            <MapPin size={markerSizes.destination} color={staticColors.gateAccent} fill={staticColors.gateAccent} />
          </View>
          <NoInfoWindow />
        </Marker>
      )}

      {markerOwnership.showNavigationUser && snappedLocation && (
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
