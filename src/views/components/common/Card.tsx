/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { StyleProp, StyleSheet, View, ViewProps, ViewStyle } from 'react-native';

import { AppTheme } from '../../../services/ThemeService';
import { radii, staticColors } from '../../../theme';

/**
 * Shared card chrome (Phase 8A.5 task 4) — LocationSheet's `card` and `statusCard`
 * style pairs duplicated the same radius/padding/borderWidth geometry with only the
 * background/border color varying by status. Values here are copied verbatim from
 * those two style objects so adopting this is pixel-identical.
 */
export type CardVariant = 'neutral' | 'warning' | 'info' | 'error' | 'success';

const CARD_RADIUS = radii.xxl;
const CARD_PADDING = 18;
const CARD_GAP = 10;

// neutral/success use the app's surface tokens (theme.card/theme.border) so the card
// isn't a hardcoded white rectangle in dark mode. warning/info/error keep their fixed
// pastel status colors — those are semantic accents, not the "light-only surface" bug.
function variantStyle(variant: CardVariant, theme: AppTheme): ViewStyle {
  switch (variant) {
    case 'warning':
      return { backgroundColor: staticColors.warningBackground, borderColor: staticColors.warning };
    case 'info':
      return { backgroundColor: staticColors.infoBackground, borderColor: staticColors.infoBorder };
    case 'error':
      return { backgroundColor: staticColors.dangerBackground, borderColor: staticColors.dangerBorder };
    case 'success':
      return { backgroundColor: theme.card, borderColor: staticColors.infoBorder };
    case 'neutral':
    default:
      return { backgroundColor: theme.card, borderColor: theme.border };
  }
}

interface CardProps extends ViewProps {
  theme: AppTheme;
  variant?: CardVariant;
  gap?: number;
  style?: StyleProp<ViewStyle>;
}

export function Card({ theme, variant = 'neutral', gap = CARD_GAP, style, children, ...props }: CardProps) {
  return (
    <View style={[styles.base, variantStyle(variant, theme), { gap }, style]} {...props}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: CARD_RADIUS,
    padding: CARD_PADDING,
    borderWidth: 1,
  },
});
