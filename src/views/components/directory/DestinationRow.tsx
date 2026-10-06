/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Info, Milestone, Route, Signpost } from 'lucide-react-native';

import { V2Place } from '../../../models/types';
import { usePressScale } from '../../../viewmodels/usePressScale';
import { placeCategoryLabel } from '../../../utils/placeCategoryLabel';
import { radii, spacing, staticColors } from '../../../theme';
import { forwardChevron } from '../common/directionalIcons';

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

/** Full-width destination row — used for Gates, Rastas, Shahr-e-Pindal, and flat search results.
 * `showCategory` hides the redundant "Gate"/"Rasta" subtitle when the row already sits under a
 * section header naming that same category (browse view) — search results and Recent still mix
 * categories, so they keep it. */
export function DestinationRow({
  place,
  onPress,
  onDetails,
  showCategory = true,
}: {
  place: V2Place;
  onPress: (place: V2Place) => void;
  /** A tap on the row means "take me here" (#307); this separate, named control opens the place's details. */
  onDetails?: (place: V2Place) => void;
  showCategory?: boolean;
}) {
  const Icon = CATEGORY_ICON[place.category] ?? Signpost;
  const ForwardIcon = forwardChevron();
  const accent = CATEGORY_ACCENT[place.category] ?? staticColors.normalBlock;
  const categoryLabel = placeCategoryLabel(place.category);
  // #96: unavailable rows stay tappable-to-view (map/sheet navigation is correct
  // today) — only the routing dead-end needs to be signaled earlier, so this never
  // touches onPress or blocks the Pressable. The unavailability is carried by the
  // accessibilityLabel, NOT accessibilityState.disabled: TalkBack reads "disabled" as
  // "double-tap does nothing", which would be false for a row that still opens.
  const isUnavailable = place.isRoutable === false;
  const { scale, onPressIn, onPressOut } = usePressScale(0.98);

  return (
    <Animated.View style={[styles.row, { transform: [{ scale }] }]}>
      <Pressable
        style={({ pressed }) => [styles.rowMain, pressed && styles.rowPressed]}
        onPress={() => onPress(place)}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        accessibilityRole="button"
        accessibilityHint={onDetails && !isUnavailable ? 'Takes you to this place' : undefined}
        accessibilityLabel={
          isUnavailable ? `${place.name}, ${categoryLabel}, navigation unavailable` : `${place.name}, ${categoryLabel}`
        }
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
          {showCategory ? (
            <Text style={styles.subtitle} numberOfLines={1} ellipsizeMode="tail">
              {categoryLabel}
              {place.unavailableReason ? ' · Not yet available for routing' : ''}
            </Text>
          ) : isUnavailable ? (
            <View style={styles.unavailableBadge}>
              <Text style={styles.unavailableBadgeText}>Not available yet</Text>
            </View>
          ) : null}
        </View>
        {onDetails ? null : <ForwardIcon size={18} color={staticColors.iconMuted} />}
      </Pressable>
      {onDetails ? (
        <Pressable
          style={({ pressed }) => [styles.detailsButton, pressed && styles.rowPressed]}
          onPress={() => onDetails(place)}
          accessibilityRole="button"
          accessibilityLabel={`Details for ${place.name}`}
        >
          <Info size={20} color={staticColors.iconMuted} />
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

const ROW_MIN_HEIGHT = 76;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: ROW_MIN_HEIGHT,
    backgroundColor: staticColors.white,
    borderBottomWidth: 1,
    borderBottomColor: staticColors.borderLight,
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  detailsButton: {
    width: 56,
    alignSelf: 'stretch',
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
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
    // Darker than subtitle (below) — clear two-step bilingual hierarchy: English name
    // strongest, Urdu name next, category/status label lightest.
    fontSize: 15,
    color: staticColors.textSecondaryStrong,
    marginTop: 1,
  },
  subtitle: {
    fontSize: 13,
    color: staticColors.textMuted,
    marginTop: 2,
  },
  unavailableBadge: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radii.sm,
    backgroundColor: `${staticColors.textMuted}1A`,
  },
  unavailableBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: staticColors.textSecondaryStrong,
  },
});
