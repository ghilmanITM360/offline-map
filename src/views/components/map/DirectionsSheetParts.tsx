/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { I18nManager, Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react-native';

import { directionsSheetColors as c } from '../../../theme';

/**
 * Presentational pieces of the Get Directions sheet (#177). They hold no route, GPS or
 * selection logic — LocationSheet owns every handler and all copy, these only draw it.
 * Horizontal spacing uses start/end props and chevrons mirror under RTL.
 */

/** Minimum touch target for every control here (dp). */
const TARGET = 48;

export function DirectionsHeader({
  title,
  subtitle,
  onBack,
}: {
  title: string;
  subtitle: string;
  onBack: () => void;
}) {
  const BackIcon = I18nManager.isRTL ? ChevronRight : ChevronLeft;
  return (
    <View style={styles.header}>
      <Pressable
        onPress={onBack}
        style={styles.backHit}
        accessibilityRole="button"
        accessibilityLabel="Back"
      >
        <View style={styles.backCircle}>
          <BackIcon size={24} color={c.headingText} />
        </View>
      </Pressable>
      <View style={styles.headerText}>
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
    </View>
  );
}

/**
 * Route-ready summary: both ends of the walk as two short rows (FROM / TO) so neither needs
 * recalling or scrolling to. Same actions and accessibility names as RouteEndpointCard.
 */
export function RouteEndpointRows({
  from,
  to,
  children,
}: {
  from: EndpointRow;
  to: EndpointRow;
  children?: React.ReactNode;
}) {
  return (
    <View style={styles.card}>
      <EndpointRowView row={from} />
      <View style={styles.rowDivider} />
      <EndpointRowView row={to} />
      {children}
    </View>
  );
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

/** The whole row is the "change" control: one tap target, one TalkBack stop, a chevron as the affordance. */
function EndpointRowView({ row }: { row: EndpointRow }) {
  const ForwardIcon = I18nManager.isRTL ? ChevronLeft : ChevronRight;
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
      <ForwardIcon size={20} color={c.secondaryText} />
    </Pressable>
  );
}

/** One starting-location choice. `active` mirrors the real start source, never a guess. */
export function StartOptionCard({
  icon,
  title,
  subtitle,
  active,
  disabled,
  loading,
  onPress,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  active?: boolean;
  disabled?: boolean;
  loading?: boolean;
  onPress: () => void;
}) {
  const Chevron = I18nManager.isRTL ? ChevronLeft : ChevronRight;
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
        {loading ? <RefreshCw size={22} color={active ? c.brandText : c.brand} /> : icon}
      </View>
      <View style={styles.flex}>
        <Text style={styles.optionTitle}>{title}</Text>
        <Text style={styles.optionSubtitle}>{subtitle}</Text>
      </View>
      <Chevron size={20} color={c.secondaryText} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
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
    backgroundColor: c.backButtonFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1, gap: 2 },
  title: { fontSize: 28, fontWeight: '800', color: c.headingText },
  subtitle: { fontSize: 14, lineHeight: 20, color: c.secondaryText },

  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: c.cardBorder,
    backgroundColor: c.background,
    padding: 11,
    gap: 10,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerDisc: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: c.iconDisc,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardLabel: { fontSize: 16, fontWeight: '800', color: c.headingText },
  cardHelper: { fontSize: 13, lineHeight: 18, color: c.secondaryText },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 64,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.innerCardBorder,
    backgroundColor: c.innerCardFill,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  innerDisc: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: c.iconDisc,
    alignItems: 'center',
    justifyContent: 'center',
  },
  innerName: { fontSize: 18, fontWeight: '800', color: c.headingText },
  innerDetail: { fontSize: 14, lineHeight: 20, color: c.secondaryText },
  action: {
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: c.actionFill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  actionPressed: { backgroundColor: c.actionPressedFill },
  endpointRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: TARGET + 8 },
  endpointLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', color: c.secondaryText },
  endpointAction: {
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: c.actionFill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  rowDivider: { height: StyleSheet.hairlineWidth, backgroundColor: c.cardBorder },
  actionText: { fontSize: 15, fontWeight: '800', color: c.brand, flexShrink: 1 },

  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 72,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: c.optionBorder,
    backgroundColor: c.optionFill,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  optionActive: { backgroundColor: c.optionSelectedFill, borderColor: c.optionSelectedBorder },
  optionDisabled: { opacity: 0.6 },
  optionPressed: { backgroundColor: c.actionPressedFill },
  optionDisc: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: c.iconDisc,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionDiscActive: { backgroundColor: c.iconDiscSolid },
  optionTitle: { fontSize: 18, fontWeight: '800', color: c.headingText },
  optionSubtitle: { fontSize: 14, lineHeight: 20, color: c.secondaryText },

});
