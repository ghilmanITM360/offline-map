import { useI18n } from '../../../i18n/useI18n';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, Text } from 'react-native';

import { staticColors } from '../../../theme';
import { useReducedMotion } from '../../../viewmodels/useReducedMotion';

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
  const { t, isRTL } = useI18n();
  const opacity = useRef(new Animated.Value(0)).current;
  const reducedMotion = useReducedMotion();

  // Same one-shot pattern as NavigationChromeV2's arrival announcement (#64): the tooltip
  // is pointerEvents="none" plain text with no focus/live-region wiring, so without this
  // TalkBack users get no signal it ever appeared.
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(t('journeyControls.hereAnnouncement'));
  }, []);

  useEffect(() => {
    if (reducedMotion) {
      opacity.setValue(1);
    } else {
      Animated.timing(opacity, { toValue: 1, duration: FADE_MS, useNativeDriver: true }).start();
    }

    const dismissTimer = setTimeout(() => {
      if (reducedMotion) {
        onDismiss();
      } else {
        Animated.timing(opacity, { toValue: 0, duration: FADE_MS, useNativeDriver: true }).start(() => onDismiss());
      }
    }, AUTO_DISMISS_MS);

    return () => clearTimeout(dismissTimer);
  }, [reducedMotion]);

  return (
    <Animated.View pointerEvents="none" style={[styles.wrap, { bottom: bottomOffset, opacity }]}>
      <Text style={[styles.title, { textAlign: isRTL ? 'right' : 'left' }]}>{t('journeyControls.here')}</Text>
      <Text style={[styles.body, { textAlign: isRTL ? 'right' : 'left' }]}>{t('journeyControls.hereBody')}</Text>
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
