/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

/** The host's colour tokens for the weak/lost GPS warning banner. */
export interface GpsSignalBannerTheme {
  colors: { fill: string; text: string };
}

export interface GpsSignalBannerProps {
  /** `lost` interrupts screen readers (assertive); `weak` waits its turn (polite). */
  status: 'weak' | 'lost';
  /** Already-localized warning copy for that status. */
  message: string;
  theme: GpsSignalBannerTheme;
}

// Presentation only: the host owns GPS status detection, the copy and which status slot outranks it.
export function GpsSignalBanner({ status, message, theme }: GpsSignalBannerProps) {
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.banner} accessibilityLiveRegion={status === 'lost' ? 'assertive' : 'polite'}>
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const makeStyles = ({ colors }: GpsSignalBannerTheme) => StyleSheet.create({
  // No fixed height, so the banner grows with the text instead of clipping it.
  banner: {
    marginHorizontal: 12, marginTop: 8, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: colors.fill,
  },
  // Safety-relevant: 16/700, above the 15-17px safety-text floor. The host picks fill/text colours that clear WCAG AA.
  text: { color: colors.text, fontSize: 16, fontWeight: '700', textAlign: 'center' },
});
