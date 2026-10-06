/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronUp } from 'lucide-react-native';

import { directionsSheetColors } from '../../../theme';

/**
 * The collapsed Directions sheet's peek (#307). When the sheet is folded to its lowest detent only the handle
 * remains, which gave no hint the journey was still there. This is the handle then: the drag pill plus one line that
 * says where the journey stands ("Directions · Block 9 → Block 2", "2 min · 121 m", "Next: Turn right · 40 m") and an
 * up chevron, all one >= 48 dp button that expands the sheet. LocationSheet publishes the line; HomeScreen mounts
 * this as the sheet's handle only while collapsed. Same publish pattern as DirectionsSheetFooter.
 */
export interface DirectionsPeek {
  text: string;
  onExpand?: () => void;
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
  if (next === peek || (next && peek && next.text === peek.text && next.onExpand === peek.onExpand)) return;
  peek = next;
  listeners.forEach((listener) => listener());
}

export function DirectionsPeekHandle() {
  const current = useSyncExternalStore(subscribe, () => peek, () => null);
  return (
    <View style={styles.wrap}>
      <View style={styles.pill} />
      {current ? (
        <Pressable
          style={styles.row}
          onPress={current.onExpand}
          accessibilityRole="button"
          accessibilityLabel={`${current.text}. Show route details`}
        >
          <Text style={styles.text} numberOfLines={1} ellipsizeMode="tail">{current.text}</Text>
          <ChevronUp size={22} color={directionsSheetColors.brand} />
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
