/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

/** The host's colour tokens for the entry-gate origin banner. */
export interface EntryGateOriginBannerTheme {
  colors: { fill: string; border: string; text: string };
}

export interface EntryGateOriginBannerProps {
  /** Already-localized "route starts from {origin}" copy, with the origin name filled in. */
  message: string;
  theme: EntryGateOriginBannerTheme;
}

// Presentation only: the host owns gate/origin selection, the copy and when the banner shows.
export function EntryGateOriginBanner({ message, theme }: EntryGateOriginBannerProps) {
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.banner}>
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const makeStyles = ({ colors }: EntryGateOriginBannerTheme) => StyleSheet.create({
  banner: {
    marginHorizontal: 12, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
    backgroundColor: colors.fill, borderWidth: 1, borderColor: colors.border,
  },
  text: { color: colors.text, fontSize: 12, fontWeight: '700', textAlign: 'center' },
});
