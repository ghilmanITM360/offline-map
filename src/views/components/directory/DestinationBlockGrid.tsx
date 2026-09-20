/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { V2Place } from '../../../models/types';
import { radii, spacing, staticColors } from '../../../theme';

/** Compact numbered tile grid for Blocks — the venue's own numbering system as the
 * screen's signature element, instead of 40+ full-width decorative cards. */
export function DestinationBlockGrid({ places, onPress }: { places: V2Place[]; onPress: (place: V2Place) => void }) {
  return (
    <View style={styles.grid}>
      {places.map((place) => (
        <Pressable
          key={place.id}
          style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
          onPress={() => onPress(place)}
          accessibilityRole="button"
          accessibilityLabel={`${place.name}, Block`}
        >
          <Text style={styles.number} numberOfLines={1} adjustsFontSizeToFit>
            {place.name.replace(/^Block\s*/i, '')}
          </Text>
          <Text style={styles.label}>Block</Text>
        </Pressable>
      ))}
    </View>
  );
}

const TILE_MIN_HEIGHT = 64;

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  tile: {
    width: '30%',
    minHeight: TILE_MIN_HEIGHT,
    borderRadius: radii.lg,
    backgroundColor: staticColors.infoBackground,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
  tilePressed: {
    backgroundColor: staticColors.infoBorder,
  },
  number: {
    fontSize: 20,
    fontWeight: '800',
    color: staticColors.infoStrong,
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
    color: staticColors.iconMuted,
    marginTop: 2,
  },
});
