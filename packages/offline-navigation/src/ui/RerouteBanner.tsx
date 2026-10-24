/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from './Text';

/** The host's colour tokens for the settled-reroute status banner. */
export interface RerouteBannerTheme {
  colors: { fill: string; border: string; text: string };
}

export interface RerouteBannerProps {
  /** Already-localized status copy (route kept, route updated, …). */
  message: string;
  theme: RerouteBannerTheme;
}

// Presentation only: the host owns the status copy, when it shows and which status slot outranks it.
export function RerouteBanner({ message, theme }: RerouteBannerProps) {
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.banner} accessibilityLiveRegion="polite">
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const makeStyles = ({ colors }: RerouteBannerTheme) => StyleSheet.create({
  banner: {
    marginHorizontal: 12, marginTop: 4, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: colors.fill, borderWidth: 1, borderColor: colors.border,
  },
  // Safety-relevant: same 16/700 as the weak-GPS banner it can replace in the status slot.
  text: { color: colors.text, fontSize: 16, fontWeight: '700', textAlign: 'center' },
});
