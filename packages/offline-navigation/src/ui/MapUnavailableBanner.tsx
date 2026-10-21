/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

/** The host's colour tokens for the basemap-unavailable banner. */
export interface MapUnavailableBannerTheme {
  colors: { fill: string; border: string; text: string };
}

export interface MapUnavailableBannerProps {
  /** Already-localized "map can't be shown, directions still work" copy. */
  message: string;
  theme: MapUnavailableBannerTheme;
}

// Presentation only: the host owns basemap loading, availability detection, the copy and which status slot outranks it.
export function MapUnavailableBanner({ message, theme }: MapUnavailableBannerProps) {
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.banner} accessibilityLiveRegion="polite">
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const makeStyles = ({ colors }: MapUnavailableBannerTheme) => StyleSheet.create({
  banner: {
    marginHorizontal: 12, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10,
    backgroundColor: colors.fill, borderWidth: 1, borderColor: colors.border,
  },
  text: { color: colors.text, fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
