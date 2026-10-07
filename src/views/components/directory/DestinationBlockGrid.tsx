/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { V2Place } from '../../../models/types';
import { useI18n } from '../../../i18n';
import { localizeVenueName } from '../../../i18n/venueNames';
import { usePressScale } from '../../../viewmodels/usePressScale';
import { radii, spacing, staticColors } from '../../../theme';

function BlockTile({ place, onPress, onDetails }: { place: V2Place; onPress: (place: V2Place) => void; onDetails?: (place: V2Place) => void }) {
  const { scale, onPressIn, onPressOut } = usePressScale(0.94);
  const { t, locale } = useI18n();
  const name = localizeVenueName(place.name, locale);
  const blockWord = t('directory.categoryBlock');
  return (
    <Animated.View style={[styles.tileWrap, { transform: [{ scale }] }]}>
      <Pressable
        style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
        onPress={() => onPress(place)}
        // A tap means "take me here" (#307). Tiles are too small for a second target, so details is a long press and a
        // named TalkBack action.
        onLongPress={onDetails ? () => onDetails(place) : undefined}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        accessibilityRole="button"
        accessibilityLabel={t('directory.rowLabel', { name, category: blockWord })}
        accessibilityHint={onDetails ? t('directory.takesYouToBlock') : undefined}
        accessibilityActions={onDetails ? [{ name: 'details', label: t('directory.detailsFor', { name }) }] : undefined}
        onAccessibilityAction={onDetails ? (event) => { if (event.nativeEvent.actionName === 'details') onDetails(place); } : undefined}
      >
        <Text style={styles.number} numberOfLines={1} adjustsFontSizeToFit>
          {place.name.replace(/^Block\s*/i, '')}
        </Text>
        <Text style={styles.label}>{blockWord}</Text>
      </Pressable>
    </Animated.View>
  );
}

/** Compact numbered tile grid for Blocks — the venue's own numbering system as the
 * screen's signature element, instead of 40+ full-width decorative cards. */
export function DestinationBlockGrid({ places, onPress, onDetails }: { places: V2Place[]; onPress: (place: V2Place) => void; onDetails?: (place: V2Place) => void }) {
  return (
    <View style={styles.grid}>
      {places.map((place) => (
        <BlockTile key={place.id} place={place} onPress={onPress} onDetails={onDetails} />
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
  tileWrap: {
    width: '30%',
  },
  tile: {
    minHeight: TILE_MIN_HEIGHT,
    borderRadius: radii.lg,
    // Blocks' own accent (green) — matches the Blocks category chip so color consistently
    // maps to category everywhere (green=Blocks, red=Gates, blue=Rastas/Shahr-e-Pindal),
    // instead of blue standing in for both "info chrome" and the Blocks tile.
    backgroundColor: `${staticColors.normalBlock}1A`,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
  tilePressed: {
    backgroundColor: `${staticColors.normalBlock}33`,
  },
  number: {
    fontSize: 20,
    fontWeight: '800',
    color: staticColors.normalBlock,
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
    color: staticColors.iconMuted,
    marginTop: 2,
  },
});
