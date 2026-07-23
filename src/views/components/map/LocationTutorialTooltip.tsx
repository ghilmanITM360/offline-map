/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';

import { staticColors } from '../../../theme';

const AUTO_DISMISS_MS = 3200;
const FADE_MS = 220;

interface LocationTutorialTooltipProps {
  onDismiss: () => void;
  /** Distance from the bottom of the screen — caller positions this above its own
   * floating control stack so it never overlaps the recenter/zoom/compass buttons. */
  bottomOffset: number;
}

/** One-time "you are here" teaching moment (Google Maps style) shown after the first
 * successful location follow. Non-blocking (pointerEvents="none"), auto-dismisses, and
 * is gated by the persisted hasSeenLocationTutorial flag so it never appears again. */
export function LocationTutorialTooltip({ onDismiss, bottomOffset }: LocationTutorialTooltipProps) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const show = Animated.timing(opacity, { toValue: 1, duration: FADE_MS, useNativeDriver: true });
    show.start();

    const dismissTimer = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: FADE_MS, useNativeDriver: true }).start(() => onDismiss());
    }, AUTO_DISMISS_MS);

    return () => clearTimeout(dismissTimer);
  }, []);

  return (
    <Animated.View pointerEvents="none" style={[styles.wrap, { bottom: bottomOffset, opacity }]}>
      <Text style={styles.title}>You're here</Text>
      <Text style={styles.body}>Your location is shown on the map</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: 'rgba(32,33,36,0.92)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  title: { color: staticColors.white, fontSize: 13, fontWeight: '700' },
  body: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 2 },
});
