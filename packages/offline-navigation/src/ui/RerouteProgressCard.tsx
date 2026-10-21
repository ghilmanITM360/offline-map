/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

/** The host's colour tokens for the in-progress reroute card. */
export interface RerouteProgressCardTheme {
  colors: { fill: string; text: string };
}

export interface RerouteProgressCardProps {
  /** Already-localized "finding a new way" copy. */
  label: string;
  /** Host-drawn progress icon. */
  icon: React.ReactNode;
  /** The host's shared turn-card base style; the card only overrides fill, alignment and gap. */
  cardStyle: StyleProp<ViewStyle>;
  theme: RerouteProgressCardTheme;
}

// Presentation only: the host owns the copy, the icon, the turn-card base style and when the card shows.
export function RerouteProgressCard({ label, icon, cardStyle, theme }: RerouteProgressCardProps) {
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={[cardStyle, styles.card]}>
      {icon}
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const makeStyles = ({ colors }: RerouteProgressCardTheme) => StyleSheet.create({
  card: { backgroundColor: colors.fill, justifyContent: 'center', gap: 12 },
  // Already 18px (above the 15-17px safety-text floor). The host picks fill/text colours that clear WCAG AA.
  text: { fontSize: 18, fontWeight: 'bold', color: colors.text },
});
