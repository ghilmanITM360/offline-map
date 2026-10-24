import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { useAccessibilityFocus } from './useAccessibilityFocus';

/** The host's design system: a direction-aware back chevron and colour tokens. */
export interface DirectionsHeaderTheme {
  /** Already chosen for the reading direction: points to the start edge. */
  BackIcon: React.ComponentType<{ size?: number; color?: string }>;
  colors: { headingText: string; secondaryText: string; backButtonFill: string };
}

export interface DirectionsHeaderProps {
  title: string;
  subtitle: string;
  onBack: () => void;
  /** Accessibility focus moves to the title whenever this key changes; null leaves focus alone. */
  focusKey?: string | null;
  /** Spoken after the title ("Block 28. Choose a start."). */
  accessibilityContext?: string;
  /** Resolved name of the back control; the host owns language and wording. */
  backLabel: string;
  isRTL: boolean;
  theme: DirectionsHeaderTheme;
}

/** Minimum touch target (dp). */
const TARGET = 48;

// Presentation only: the host owns the copy, what Back does and when focus should move.
export function DirectionsHeader({ title, subtitle, onBack, focusKey = null, accessibilityContext, backLabel, isRTL, theme }: DirectionsHeaderProps) {
  const { ref } = useAccessibilityFocus(focusKey);
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { BackIcon } = theme;
  return (
    <View testID="directions-header" style={[styles.header, { direction: isRTL ? 'rtl' : 'ltr' }]}>
      <Pressable onPress={onBack} style={styles.backHit} accessibilityRole="button" accessibilityLabel={backLabel}>
        <View style={styles.backCircle}>
          <BackIcon size={24} color={theme.colors.headingText} />
        </View>
      </Pressable>
      <View style={styles.headerText}>
        <Text ref={ref} accessibilityRole="header" accessibilityLabel={accessibilityContext ? `${title}. ${accessibilityContext}` : undefined} style={styles.title}>
          {title}
        </Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
    </View>
  );
}

const makeStyles = ({ colors }: DirectionsHeaderTheme) => StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 12,
    gap: 4,
  },
  backHit: {
    width: TARGET,
    height: TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backCircle: {
    width: 41,
    height: 41,
    borderRadius: 21,
    backgroundColor: colors.backButtonFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1, gap: 2 },
  title: { fontSize: 28, fontWeight: '800', color: colors.headingText },
  subtitle: { fontSize: 14, lineHeight: 20, color: colors.secondaryText },
});
