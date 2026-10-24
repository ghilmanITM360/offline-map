import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Text';

/** The host's design system: a direction-aware chevron, the busy icon and colour tokens. */
export interface StartOptionCardTheme {
  /** Already chosen for the reading direction: points to the end edge. */
  ForwardIcon: React.ComponentType<{ size?: number; color?: string }>;
  /** Replaces the option icon while `loading`. */
  LoadingIcon: React.ComponentType<{ size?: number; color?: string }>;
  colors: {
    optionFill: string;
    optionBorder: string;
    optionSelectedFill: string;
    optionSelectedBorder: string;
    pressedFill: string;
    iconDisc: string;
    iconDiscSolid: string;
    headingText: string;
    secondaryText: string;
    brand: string;
    brandText: string;
  };
}

export interface StartOptionCardProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  /** Mirrors the real start source, never a guess. */
  active?: boolean;
  disabled?: boolean;
  loading?: boolean;
  onPress: () => void;
  theme: StartOptionCardTheme;
}

// Presentation only: the host decides which start options exist, their copy, and what choosing one does.
export function StartOptionCard({ icon, title, subtitle, active, disabled, loading, onPress, theme }: StartOptionCardProps) {
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { ForwardIcon, LoadingIcon, colors } = theme;
  return (
    <Pressable
      style={({ pressed }) => [
        styles.option,
        active && styles.optionActive,
        disabled && styles.optionDisabled,
        pressed && !disabled && styles.optionPressed,
      ]}
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}`}
      accessibilityState={{ selected: !!active, disabled: !!disabled, busy: !!loading }}
    >
      <View style={[styles.optionDisc, active && styles.optionDiscActive]}>
        {loading ? <LoadingIcon size={22} color={active ? colors.brandText : colors.brand} /> : icon}
      </View>
      <View style={styles.flex}>
        <Text style={styles.optionTitle}>{title}</Text>
        <Text style={styles.optionSubtitle}>{subtitle}</Text>
      </View>
      <ForwardIcon size={20} color={colors.secondaryText} />
    </Pressable>
  );
}

const makeStyles = ({ colors }: StartOptionCardTheme) => StyleSheet.create({
  flex: { flex: 1 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 72,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.optionBorder,
    backgroundColor: colors.optionFill,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  optionActive: { backgroundColor: colors.optionSelectedFill, borderColor: colors.optionSelectedBorder },
  optionDisabled: { opacity: 0.6 },
  optionPressed: { backgroundColor: colors.pressedFill },
  optionDisc: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.iconDisc,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionDiscActive: { backgroundColor: colors.iconDiscSolid },
  optionTitle: { fontSize: 18, fontWeight: '800', color: colors.headingText },
  optionSubtitle: { fontSize: 14, lineHeight: 20, color: colors.secondaryText },
});
