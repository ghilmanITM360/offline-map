/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Circle, Marker } from 'react-native-maps';
import { Navigation } from 'lucide-react-native';

import { Coordinate } from '../../../models/types';
import { markerColors, markerSizes, staticColors } from '../../../theme';

export interface UserLocationMarkerProps {
  coordinate: Coordinate;
  accuracy?: number;
  /** Degrees clockwise from true north, or undefined/null when the device has no
   * reliable heading (stationary, GPS-only fix, etc). Only >=0 finite values are
   * treated as valid — anything else falls back to a plain, non-rotated dot. */
  heading?: number;
  /** True while CameraManager is in FOLLOWING_USER mode — draws a brighter ring so
   * the marker itself communicates "you're being followed", matching the recenter
   * button's own active-state treatment. */
  isFollowing?: boolean;
  /** Drives the existing pulse loop (owned by the caller so one Animated.Value can
   * keep running regardless of marker remounts). */
  pulseAnim: Animated.Value;
  /** True when currentLocationSource === 'remembered' — shows the "last known" tag. */
  isRemembered?: boolean;
}

function hasValidHeading(heading?: number): heading is number {
  return typeof heading === 'number' && Number.isFinite(heading) && heading >= 0;
}

/** Custom user-location marker (Google Maps "blue dot" equivalent): accuracy circle +
 * pulsing dot + optional heading cone. Deliberately NOT native showsUserLocation — see
 * HomeScreen's MapView props — so heading/follow-state styling stays under our control. */
export function UserLocationMarker({ coordinate, accuracy, heading, isFollowing = false, pulseAnim, isRemembered = false }: UserLocationMarkerProps) {
  const validHeading = hasValidHeading(heading);

  return (
    <>
      {typeof accuracy === 'number' && accuracy > 0 && (
        <Circle
          testID="browse-user-accuracy-circle"
          center={coordinate}
          radius={Math.min(accuracy, 150)}
          strokeColor={staticColors.userAccuracyStroke}
          fillColor={staticColors.userAccuracyFill}
          strokeWidth={1}
          zIndex={9}
        />
      )}

      <Marker
        testID="browse-user-location-marker"
        coordinate={coordinate}
        anchor={{ x: 0.5, y: 0.5 }}
        tracksViewChanges={false}
        flat={validHeading}
        rotation={validHeading ? heading : 0}
      >
        <View style={styles.wrap}>
          <Animated.View
            style={[
              styles.pulse,
              {
                opacity: pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.38, 0] }),
                transform: [{ scale: pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 2.3] }) }],
              },
            ]}
          />
          <View style={styles.core}>
            {validHeading && <View style={styles.cone} />}
            <View style={[styles.dot, isFollowing && styles.dotFollowing]}>
              <Navigation size={12} color={staticColors.white} />
            </View>
          </View>
          {isRemembered && (
            <View style={styles.rememberedLabel}>
              <Text style={styles.rememberedLabelText}>last known</Text>
            </View>
          )}
        </View>
      </Marker>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: 76,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulse: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: markerColors.route,
  },
  core: {
    alignItems: 'center',
  },
  cone: {
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderBottomWidth: 13,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: 'rgba(26,115,232,0.85)',
    marginBottom: -4,
  },
  dot: {
    width: markerSizes.userLocation,
    height: markerSizes.userLocation,
    borderRadius: markerSizes.userLocation / 2,
    backgroundColor: markerColors.route,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: staticColors.white,
  },
  dotFollowing: {
    borderColor: staticColors.info,
    borderWidth: 3,
  },
  rememberedLabel: {
    marginTop: 2,
    backgroundColor: 'rgba(26,115,232,0.92)',
    borderRadius: 7,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  rememberedLabelText: { color: '#FFFFFF', fontSize: 9, fontWeight: '700' },
});
