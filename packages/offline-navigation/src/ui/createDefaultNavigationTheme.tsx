/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import type { NavigationButtonProps, NavigationIcon, NavigationScreenTheme } from './NavigationScreenTypes';
import { Text } from './Text';

type Colors = NavigationScreenTheme['colors'];

// Contrast-checked pairs (see SdkDefaultNavigationTheme.test.ts): body text, secondary text, brand text, on-brand text
// and the warning/info banners all clear WCAG AA (4.5:1) on the fills they are drawn on.
const LIGHT: Colors = {
  screen: '#F6F7F4', surface: '#FFFFFF', surfaceMuted: '#EEF1EC', border: '#C9D0C6',
  text: '#14201A', textSecondary: '#44524A', brand: '#0B6B4D', onBrand: '#FFFFFF', brandTint: '#DDF0E7', pressed: '#E6ECE6',
  warningFill: '#FFE8B3', warningText: '#4A3000', infoFill: '#E3EEF9', infoBorder: '#9DBBD8', infoText: '#10324F',
  scrim: 'rgba(0,0,0,0.5)',
};
const DARK: Colors = {
  screen: '#101512', surface: '#1B231E', surfaceMuted: '#232D27', border: '#3A4840',
  text: '#F1F5F2', textSecondary: '#B8C4BC', brand: '#5FD3A5', onBrand: '#06231A', brandTint: '#24463A', pressed: '#2A352F',
  warningFill: '#5A4300', warningText: '#FFE9A8', infoFill: '#16324A', infoBorder: '#3B6A92', infoText: '#D6E9F9',
  scrim: 'rgba(0,0,0,0.7)',
};

const box = (size = 24) => ({ width: size, height: size, alignItems: 'center' as const, justifyContent: 'center' as const });
const hidden = { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const };

// Icons are drawn from Views, so the default theme needs no icon font and renders the same on every platform.
// Drawn from a rotated corner, not a text glyph: U+2039/U+203A are bidi-mirrored, so a glyph already chosen for the reading
// direction was mirrored AGAIN by Android's text engine inside an RTL layout. Transforms are never mirrored.
const makeChevron = (points: 'left' | 'right'): NavigationIcon => function Chevron({ size = 24, color }) {
  const side = size * 0.4;
  const edge = Math.max(2, size / 10);
  return (
    // direction ltr: Android also flips a transform's rotation inside an RTL layout, which turned the drawn chevron sideways.
    <View {...hidden} style={[box(size), { direction: 'ltr' }]}>
      <View style={{
        width: side, height: side, borderTopWidth: edge, borderRightWidth: edge, borderColor: color,
        transform: [{ translateX: (points === 'right' ? -1 : 1) * side * 0.2 }, { rotate: points === 'right' ? '45deg' : '-135deg' }],
      }} />
    </View>
  );
};
const Dot: NavigationIcon = ({ size = 24, color }) => (
  <View {...hidden} style={box(size)}><View style={{ width: size * 0.4, height: size * 0.4, borderRadius: size, backgroundColor: color }} /></View>
);
const Ring: NavigationIcon = ({ size = 24, color }) => (
  <View {...hidden} style={[box(size), { borderWidth: Math.max(2, size / 10), borderRadius: size, borderColor: color }]}>
    <View style={{ width: size * 0.25, height: size * 0.25, borderRadius: size, backgroundColor: color }} />
  </View>
);
const Disc: NavigationIcon = ({ size = 24, color }) => (
  <View {...hidden} style={[box(size), { borderRadius: size, backgroundColor: color, opacity: 0.9 }]}>
    <View style={{ width: size * 0.3, height: size * 0.3, borderRadius: size, borderWidth: 2, borderColor: '#FFFFFF' }} />
  </View>
);
const Bars: NavigationIcon = ({ size = 24, color }) => (
  <View {...hidden} style={[box(size), { gap: size * 0.14 }]}>
    {[0, 1, 2].map((i) => <View key={i} style={{ width: size * 0.7, height: Math.max(2, size * 0.1), borderRadius: 2, backgroundColor: color }} />)}
  </View>
);
const Spinner: NavigationIcon = ({ size = 24, color }) => <ActivityIndicator size={size > 24 ? 'large' : 'small'} color={color} />;

const CHEVRON_BACK_LTR = makeChevron('left');
const CHEVRON_FORWARD_LTR = makeChevron('right');

const makeButton = (colors: Colors, radius: number): React.FunctionComponent<NavigationButtonProps> => {
  const fills = { brand: colors.brand, brandTint: colors.brandTint, outline: 'transparent' } as const;
  const inks = { brand: colors.onBrand, brandTint: colors.brand, outline: colors.brand } as const;
  return function Button({ label, variant = 'brand', fullWidth = true, style, accessibilityLabel, icon, trailingIcon, disabled, selected, onPress }: NavigationButtonProps) {
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityState={selected === undefined ? { disabled: !!disabled } : { disabled: !!disabled, selected }}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: fills[variant], borderRadius: radius, borderColor: variant === 'outline' ? colors.border : fills[variant] },
          fullWidth && styles.fullWidth,
          disabled && styles.disabled,
          pressed && !disabled && { opacity: 0.85 },
          style,
        ]}
      >
        {icon}
        {label ? <Text style={[styles.label, { color: inks[variant] }]}>{label}</Text> : null}
        {trailingIcon}
      </Pressable>
    );
  };
};
const styles = StyleSheet.create({
  button: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1 },
  fullWidth: { alignSelf: 'stretch' },
  disabled: { opacity: 0.5 },
  label: { fontSize: 16, fontWeight: '700', textAlign: 'center', flexShrink: 1 },
});

export interface DefaultNavigationThemeOptions {
  /** Chooses the chevron directions. Pass the same value as the screen's `isRTL`. */
  isRTL: boolean;
  /** Default 'light'. */
  colorScheme?: 'light' | 'dark';
  /** Overrides individual colour tokens. */
  colors?: Partial<Colors>;
  /** Corner radius for cards and buttons. Default 14. */
  radius?: number;
}

const cache = new Map<string, NavigationScreenTheme>();

/**
 * A ready theme so a new app renders without a design system: View-drawn icons, one Button, light and dark palettes.
 * The result is cached per (direction, scheme) so it is stable across renders; when you pass `colors` or `radius`,
 * memoize the call (useMemo) so the Button keeps its identity.
 */
export function createDefaultNavigationTheme({ isRTL, colorScheme = 'light', colors, radius = 14 }: DefaultNavigationThemeOptions): NavigationScreenTheme {
  const key = `${isRTL}|${colorScheme}`;
  const plain = colors === undefined && radius === 14;
  const cached = plain ? cache.get(key) : undefined;
  if (cached) return cached;
  const palette: Colors = { ...(colorScheme === 'dark' ? DARK : LIGHT), ...colors };
  const theme: NavigationScreenTheme = {
    colorScheme,
    colors: palette,
    radius,
    hitSlop: { top: 8, bottom: 8, left: 8, right: 8 },
    icons: {
      Back: isRTL ? CHEVRON_FORWARD_LTR : CHEVRON_BACK_LTR,
      Forward: isRTL ? CHEVRON_BACK_LTR : CHEVRON_FORWARD_LTR,
      Loading: Spinner,
      Pin: Disc,
      Recenter: Ring,
      Place: Dot,
      Guide: Bars,
      Location: Ring,
    },
    Button: makeButton(palette, radius),
  };
  if (plain) cache.set(key, theme);
  return theme;
}
