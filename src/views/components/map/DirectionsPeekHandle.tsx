/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronDown, ChevronUp } from 'lucide-react-native';

import { directionsSheetColors } from '../../../theme';
import { useI18n } from '../../../i18n';

/**
 * The Directions sheet's handle (#307). Folded to its lowest detent only the handle remains, which gave no hint the
 * journey was still there. So the handle is the drag pill plus one line that says where the journey stands
 * ("Directions · Block 9 → Block 2", "2 min · 121 m", "Next: Turn right · 40 m") and a chevron, all one >= 48 dp
 * button that expands (collapsed) or folds (expanded) the sheet. It is the handle at every detent and never swapped:
 * replacing the handle component mid-gesture desynchronised the sheet's index. LocationSheet publishes the line;
 * HomeScreen mounts this as the Directions handle. Same publish pattern as DirectionsSheetFooter.
 */
export interface DirectionsPeek {
  text: string;
  /** True at the lowest detent: the chevron points up and a tap expands; otherwise it points down and a tap folds. */
  collapsed: boolean;
  onToggle?: () => void;
}

let peek: DirectionsPeek | null = null;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export function publishDirectionsPeek(next: DirectionsPeek | null) {
  if (next === peek || (next && peek && next.text === peek.text && next.collapsed === peek.collapsed && next.onToggle === peek.onToggle)) return;
  peek = next;
  listeners.forEach((listener) => listener());
}

export function DirectionsPeekHandle() {
  const { t } = useI18n();
  const current = useSyncExternalStore(subscribe, () => peek, () => null);
  return (
    <View style={styles.wrap}>
      <View style={styles.pill} />
      {current ? (
        <Pressable
          style={styles.row}
          onPress={current.onToggle}
          accessibilityRole="button"
          accessibilityLabel={t(current.collapsed ? 'directions.peekShow' : 'directions.peekHide', { text: current.text })}
        >
          <Text style={styles.text} numberOfLines={1} ellipsizeMode="tail">{current.text}</Text>
          {current.collapsed ? (
            <ChevronUp size={22} color={directionsSheetColors.brand} />
          ) : (
            <ChevronDown size={22} color={directionsSheetColors.brand} />
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'stretch', paddingTop: 8 },
  pill: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: directionsSheetColors.cardBorder,
  },
  row: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 20,
  },
  text: { flex: 1, fontSize: 16, fontWeight: '800', color: directionsSheetColors.headingText },
});
