import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

/** The host's design system: a direction-aware chevron and colour tokens. */
export interface RouteEndpointRowsTheme {
  /** Already chosen for the reading direction: points to the end edge. */
  ForwardIcon: React.ComponentType<{ size?: number; color?: string }>;
  colors: {
    cardBorder: string;
    cardFill: string;
    iconDisc: string;
    headingText: string;
    secondaryText: string;
    pressedFill: string;
  };
}

export type EndpointRow = {
  label: string;
  name: string;
  detail?: string;
  icon: React.ReactNode;
  /** Full spoken name of the row, including its action ("From Block 27. Change start."). */
  actionAccessibilityLabel: string;
  onAction: () => void;
};

export interface RouteEndpointRowsProps {
  from: EndpointRow;
  to: EndpointRow;
  /** Drawn inside the card, below both rows (e.g. a destination warning). */
  children?: React.ReactNode;
  theme: RouteEndpointRowsTheme;
}

/** Minimum touch target (dp). */
const TARGET = 48;

// Presentation only: the host owns the copy, the icons and what changing either end does.
export function RouteEndpointRows({ from, to, children, theme }: RouteEndpointRowsProps) {
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.card}>
      <EndpointRowView row={from} styles={styles} theme={theme} />
      <View style={styles.rowDivider} />
      <EndpointRowView row={to} styles={styles} theme={theme} />
      {children}
    </View>
  );
}

/** The whole row is the "change" control: one tap target, one TalkBack stop, a chevron as the affordance. */
function EndpointRowView({ row, styles, theme }: { row: EndpointRow; styles: ReturnType<typeof makeStyles>; theme: RouteEndpointRowsTheme }) {
  const { ForwardIcon } = theme;
  return (
    <Pressable
      style={({ pressed }) => [styles.endpointRow, pressed && styles.actionPressed]}
      onPress={row.onAction}
      accessibilityRole="button"
      accessibilityLabel={row.actionAccessibilityLabel}
    >
      <View style={styles.innerDisc}>{row.icon}</View>
      <View style={styles.flex}>
        <Text style={styles.endpointLabel}>{row.label}</Text>
        <Text style={styles.innerName}>{row.name}</Text>
        {row.detail ? <Text style={styles.innerDetail}>{row.detail}</Text> : null}
      </View>
      <ForwardIcon size={20} color={theme.colors.secondaryText} />
    </Pressable>
  );
}

const makeStyles = ({ colors }: RouteEndpointRowsTheme) => StyleSheet.create({
  flex: { flex: 1 },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.cardFill,
    padding: 11,
    gap: 10,
  },
  innerDisc: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.iconDisc,
    alignItems: 'center',
    justifyContent: 'center',
  },
  innerName: { fontSize: 18, fontWeight: '800', color: colors.headingText },
  innerDetail: { fontSize: 14, lineHeight: 20, color: colors.secondaryText },
  actionPressed: { backgroundColor: colors.pressedFill },
  endpointRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: TARGET + 8 },
  endpointLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', color: colors.secondaryText },
  rowDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.cardBorder },
});
