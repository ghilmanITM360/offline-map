import React, { useEffect, useImperativeHandle, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { NavigationMapProps } from '@muslim-ummah/offline-navigation/ui';

// A stand-in for the host's real basemap (MapLibre, Mapbox, ...): it draws the route and the walker as dots and answers
// recenter(). It shows the contract: the map renders what it is given and decides nothing.
export function SketchMap({ route, position, onAvailabilityChange, ref }: NavigationMapProps) {
  const [recenters, setRecenters] = useState(0);
  useImperativeHandle(ref, () => ({ recenter: () => setRecenters((n) => n + 1) }), []);
  useEffect(() => onAvailabilityChange(true), [onAvailabilityChange]);

  const line = route?.line?.points ?? [];
  const all = position ? [...line, position] : line;
  const lats = all.map((p) => p.lat);
  const lngs = all.map((p) => p.lng);
  const [south, north, west, east] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  const x = (lng: number) => `${8 + 84 * ((lng - west) / (east - west || 1))}%` as const;
  const y = (lat: number) => `${8 + 84 * (1 - (lat - south) / (north - south || 1))}%` as const;
  // A dot every tenth of each leg, so the route reads as a line.
  const dots = line.flatMap((from, i) => (i === line.length - 1 ? [from] : Array.from({ length: 10 }, (_, k) => ({
    lat: from.lat + ((line[i + 1].lat - from.lat) * k) / 10, lng: from.lng + ((line[i + 1].lng - from.lng) * k) / 10,
  }))));
  return (
    <View
      testID="sketch-map"
      style={styles.map}
      accessibilityValue={{ text: `recentered ${recenters} time${recenters === 1 ? '' : 's'}` }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {dots.map((p, i) => <View key={i} style={[styles.dot, { left: x(p.lng), top: y(p.lat) }]} />)}
      {position ? <View style={[styles.walker, { left: x(position.lng), top: y(position.lat) }]} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  map: { ...StyleSheet.absoluteFillObject, backgroundColor: '#DCE8E0' },
  dot: { position: 'absolute', width: 6, height: 6, marginLeft: -3, marginTop: -3, borderRadius: 3, backgroundColor: '#0B6B4D' },
  walker: { position: 'absolute', width: 18, height: 18, marginLeft: -9, marginTop: -9, borderRadius: 9, backgroundColor: '#1D6FE0', borderWidth: 3, borderColor: '#FFFFFF' },
});
