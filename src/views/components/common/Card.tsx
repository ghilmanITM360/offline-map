/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { StyleProp, StyleSheet, View, ViewProps, ViewStyle } from 'react-native';

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

const VARIANTS: Record<CardVariant, ViewStyle> = {
  neutral: { backgroundColor: staticColors.white, borderColor: staticColors.borderLight },
  warning: { backgroundColor: staticColors.warningBackground, borderColor: staticColors.warning },
  info: { backgroundColor: staticColors.infoBackground, borderColor: staticColors.infoBorder },
  error: { backgroundColor: staticColors.dangerBackground, borderColor: staticColors.dangerBorder },
  success: { backgroundColor: staticColors.white, borderColor: staticColors.infoBorder },
};

interface CardProps extends ViewProps {
  variant?: CardVariant;
  gap?: number;
  style?: StyleProp<ViewStyle>;
}

export function Card({ variant = 'neutral', gap = CARD_GAP, style, children, ...props }: CardProps) {
  return (
    <View style={[styles.base, VARIANTS[variant], { gap }, style]} {...props}>
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
