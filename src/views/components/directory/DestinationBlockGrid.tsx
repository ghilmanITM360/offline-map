/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';

import { V2Place } from '../../../models/types';
import { premium, radii, shadows, spacing } from '../../../theme';

const BADGE_SIZE = 44;

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
          <ChevronRight size={14} color={premium.textMuted} style={styles.chevron} />
          <View style={styles.badge}>
            <Text style={styles.number} numberOfLines={1} adjustsFontSizeToFit>
              {place.name.replace(/^Block\s*/i, '')}
            </Text>
          </View>
          <Text style={styles.label}>Block</Text>
        </Pressable>
      ))}
    </View>
  );
}

const TILE_MIN_HEIGHT = 96;

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
    backgroundColor: premium.card,
    borderWidth: 1,
    borderColor: premium.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    ...shadows.low,
  },
  tilePressed: {
    backgroundColor: premium.canvasAlt,
  },
  chevron: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
  },
  badge: {
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: BADGE_SIZE / 2,
    backgroundColor: premium.mint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  number: {
    fontSize: 18,
    fontWeight: '800',
    color: premium.primary,
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
    color: premium.textMuted,
    marginTop: spacing.xs,
  },
});
