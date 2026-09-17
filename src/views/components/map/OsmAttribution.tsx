/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Linking, Pressable, StyleSheet, Text } from 'react-native';

const OSM_COPYRIGHT_URL = 'https://www.openstreetmap.org/copyright';

export function OsmAttribution({ visible, top }: { visible: boolean; top: number }) {
  if (!visible) return null;
  return (
    <Pressable
      testID="osm-attribution"
      accessibilityRole="link"
      accessibilityLabel="OpenStreetMap contributors and ODbL licence information"
      onPress={() => { void Linking.openURL(OSM_COPYRIGHT_URL); }}
      style={[styles.container, { top }]}
    >
      <Text style={styles.text}>© OpenStreetMap contributors · ODbL</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 8,
    zIndex: 25,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  text: {
    color: '#3C4043',
    fontSize: 10,
    fontWeight: '600',
  },
});
