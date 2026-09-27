/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRight, Milestone, Route, Signpost } from 'lucide-react-native';

import { V2Place } from '../../../models/types';
import { usePressScale } from '../../../viewmodels/usePressScale';
import { radii, spacing, staticColors } from '../../../theme';

const CATEGORY_LABEL: Record<V2Place['category'], string> = {
  Block: 'Block',
  Gate: 'Gate',
  Rasta: 'Rasta',
  SpecialRoute: 'Shahr-e-Pindal',
} as Record<V2Place['category'], string>;

const CATEGORY_ICON: Partial<Record<V2Place['category'], typeof Signpost>> = {
  Gate: Signpost,
  Rasta: Route,
  SpecialRoute: Milestone,
};

const CATEGORY_ACCENT: Partial<Record<V2Place['category'], string>> = {
  Gate: staticColors.gateAccent,
  Rasta: staticColors.info,
  SpecialRoute: staticColors.info,
};

/** Full-width destination row — used for Gates, Rastas, Shahr-e-Pindal, and flat search results. */
export function DestinationRow({ place, onPress }: { place: V2Place; onPress: (place: V2Place) => void }) {
  const Icon = CATEGORY_ICON[place.category] ?? Signpost;
  const accent = CATEGORY_ACCENT[place.category] ?? staticColors.normalBlock;
  const categoryLabel = CATEGORY_LABEL[place.category] ?? place.category;
  // #96: unavailable rows stay tappable-to-view (map/sheet navigation is correct
  // today) — only the routing dead-end needs to be signaled earlier, so this never
  // touches onPress or blocks the Pressable.
  const isUnavailable = place.isRoutable === false;
  const { scale, onPressIn, onPressOut } = usePressScale(0.98);

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        onPress={() => onPress(place)}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        accessibilityRole="button"
        accessibilityLabel={
          isUnavailable ? `${place.name}, ${categoryLabel}, navigation unavailable` : `${place.name}, ${categoryLabel}`
        }
        accessibilityState={{ disabled: isUnavailable }}
      >
        <View style={[styles.iconWrap, { backgroundColor: isUnavailable ? staticColors.neutralSurface : `${accent}1A` }]}>
          <Icon size={20} color={isUnavailable ? staticColors.iconMuted : accent} />
        </View>
        <View style={styles.body}>
          <Text style={[styles.name, isUnavailable && styles.nameMuted]} numberOfLines={1} ellipsizeMode="tail">
            {place.name}
          </Text>
          {/* Own line, not squeezed onto the name's baseline — a long English name was
              truncating the Urdu name first, and Urdu script reads better at its own
              size than a cramped secondary-label size. */}
          {place.urduName ? (
            <Text style={styles.nameSecondary} numberOfLines={1} ellipsizeMode="tail">
              {place.urduName}
            </Text>
          ) : null}
          <Text style={styles.subtitle} numberOfLines={1} ellipsizeMode="tail">
            {categoryLabel}
            {place.unavailableReason ? ' · Not yet available for routing' : ''}
          </Text>
        </View>
        <ChevronRight size={18} color={staticColors.iconFaint} />
      </Pressable>
    </Animated.View>
  );
}

const ROW_MIN_HEIGHT = 60;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: ROW_MIN_HEIGHT,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    backgroundColor: staticColors.white,
    borderBottomWidth: 1,
    borderBottomColor: staticColors.borderLight,
  },
  rowPressed: {
    backgroundColor: staticColors.neutralSurface,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: staticColors.textPrimary,
  },
  nameMuted: {
    color: staticColors.textSecondaryStrong,
  },
  nameSecondary: {
    fontSize: 15,
    color: staticColors.iconMuted,
    marginTop: 1,
  },
  subtitle: {
    fontSize: 13,
    color: staticColors.textMuted,
    marginTop: 2,
  },
});
