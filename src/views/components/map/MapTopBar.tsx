import { useI18n } from '../../../i18n/useI18n';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@muslim-ummah/offline-navigation/ui';
import { MoreVertical } from 'lucide-react-native';
import { useTheme } from '../../../services/useTheme';
import { backChevron } from '../common/directionalIcons';
import { shadows } from '../../../theme';

/**
 * The Map's lightweight contextual top bar (#307): a way back to the Directory (the one place chooser), what the
 * map is showing right now, and the menu. It is not a toolbar and not search: no place search or browsing lives
 * here, and the menu stays for Settings, Help and About rather than being the only door to the Directory.
 */
export function MapTopBar({
  title,
  onPlaces,
  onMore,
}: {
  title: string | null;
  onPlaces: () => void;
  onMore: () => void;
}) {
  const { t, isRTL } = useI18n();
  const theme = useTheme();
  const BackIcon = backChevron();
  return (
    <View style={[styles.row, { flexDirection: isRTL ? 'row-reverse' : 'row' }]} pointerEvents="box-none">
      <Pressable
        onPress={onPlaces}
        style={[styles.pill, { backgroundColor: theme.searchBar }]}
        accessibilityRole="button"
        accessibilityLabel={t('journeyControls.places')}
        accessibilityHint={t('journeyControls.backPlaces')}
      >
        <BackIcon size={22} color={theme.subtext} />
        <Text style={[styles.pillText, { color: theme.text }]}>{t('journeyControls.places')}</Text>
      </Pressable>
      {title ? (
        // Orientation for sighted users only: the sheet below already names the place or the route, so a screen
        // reader would hear it twice.
        <View
          style={[styles.titleChip, { backgroundColor: theme.searchBar }]}
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Text style={[styles.titleText, { color: theme.text }]} numberOfLines={1}>
            {title}
          </Text>
        </View>
      ) : (
        <View style={styles.spacer} pointerEvents="none" />
      )}
      <Pressable
        onPress={onMore}
        style={[styles.menu, { backgroundColor: theme.searchBar }]}
        accessibilityRole="button"
        accessibilityLabel={t('journeyControls.menu')}
      >
        <MoreVertical size={24} color={theme.subtext} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 12,
    marginTop: 8,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    minWidth: 48,
    paddingLeft: 10,
    paddingRight: 16,
    borderRadius: 26,
    gap: 2,
    ...shadows.medium,
  },
  pillText: { fontSize: 16, fontWeight: '700' },
  titleChip: {
    flex: 1,
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 20,
    ...shadows.medium,
  },
  titleText: { fontSize: 16, fontWeight: '700', textAlign: 'center' },
  spacer: { flex: 1 },
  menu: {
    minHeight: 48,
    minWidth: 48,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.medium,
  },
});
