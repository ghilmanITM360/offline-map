/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  PressableProps,
  StyleProp,
  StyleSheet,
  TextStyle,
  ViewStyle,
} from 'react-native';
import { Text } from '@muslim-ummah/offline-navigation/ui';

import { directionsSheetColors, staticColors, radii, spacing, typography } from '../../../theme';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger' | 'icon' | 'brand' | 'brandTint';

interface ButtonProps extends Omit<PressableProps, 'style'> {
  label?: string;
  variant?: ButtonVariant;
  icon?: React.ReactNode;
  /** Rendered after the label (e.g. a chevron); mirror it yourself under RTL. */
  trailingIcon?: React.ReactNode;
  loading?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
}

const HEIGHT = 52;

/**
 * Single shared CTA component (Phase 8A task 5) — replaces the three divergent
 * inline button styles that used to live in LocationSheet.tsx (`primaryButton`,
 * `retryButton`, `takeMeButton`: different radius/height/shadow each). Every variant
 * shares height/radius/typography/padding/pressed-state; only fill color changes.
 * Height/radius intentionally large (52dp, 16dp) — Google Maps-style big clear
 * targets, matches the app's elderly-user-friendly requirement.
 */
export function Button({
  label,
  variant = 'primary',
  icon,
  trailingIcon,
  loading = false,
  fullWidth = true,
  disabled,
  style,
  ...pressableProps
}: ButtonProps) {
  const v = VARIANTS[variant];
  const isDisabled = disabled || loading;

  return (
    <Pressable
      disabled={isDisabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.base,
        v.container,
        fullWidth && variant !== 'icon' && styles.fullWidth,
        variant === 'icon' && styles.iconOnly,
        pressed && !isDisabled && v.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
      {...pressableProps}
    >
      {loading ? (
        <ActivityIndicator color={v.label.color as string} />
      ) : (
        <>
          {icon}
          {label ? <Text style={[styles.label, v.label]}>{label}</Text> : null}
          {trailingIcon}
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: HEIGHT,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  iconOnly: {
    width: HEIGHT,
    height: HEIGHT,
    paddingHorizontal: 0,
    borderRadius: HEIGHT / 2,
  },
  label: {
    ...typography.sheet.button,
    flexShrink: 1,
    textAlign: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
});

const VARIANTS: Record<ButtonVariant, { container: ViewStyle; pressed: ViewStyle; label: TextStyle }> = {
  primary: {
    container: { backgroundColor: staticColors.success },
    pressed: { backgroundColor: staticColors.focusedBlock },
    label: { color: staticColors.white },
  },
  secondary: {
    container: { backgroundColor: staticColors.infoBackground },
    pressed: { backgroundColor: staticColors.infoBorder },
    label: { color: staticColors.infoStrong },
  },
  outline: {
    container: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: staticColors.border },
    pressed: { backgroundColor: staticColors.infoBackground },
    label: { color: staticColors.iconMuted },
  },
  danger: {
    container: { backgroundColor: staticColors.danger },
    pressed: { backgroundColor: staticColors.dangerText },
    label: { color: staticColors.white },
  },
  // Get Directions sheet (#177): green brand CTA + tinted action, scoped tokens only.
  brand: {
    container: { backgroundColor: directionsSheetColors.brand },
    pressed: { backgroundColor: directionsSheetColors.brandPressed },
    label: { color: directionsSheetColors.brandText, fontSize: 18 },
  },
  brandTint: {
    container: { backgroundColor: directionsSheetColors.actionFill },
    pressed: { backgroundColor: directionsSheetColors.actionPressedFill },
    label: { color: directionsSheetColors.brand },
  },
  icon: {
    container: { backgroundColor: staticColors.white },
    pressed: { backgroundColor: staticColors.infoBackground },
    label: { color: staticColors.iconMuted },
  },
};
