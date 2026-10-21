/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react-native';

import { directionsSheetColors as c } from '../../../theme';
import { isRtl, useI18n } from '../../../i18n';
import {
  DirectionsHeader as SdkDirectionsHeader,
  type DirectionsHeaderTheme,
} from '../../../../packages/offline-navigation/src/ui/DirectionsHeader';
import {
  StartOptionCard as SdkStartOptionCard,
  type StartOptionCardTheme,
} from '../../../../packages/offline-navigation/src/ui/StartOptionCard';

/**
 * Presentational pieces of the Get Directions sheet (#177). They hold no route, GPS or
 * selection logic — LocationSheet owns every handler and all copy, these only draw it.
 * Horizontal spacing uses start/end props and chevrons mirror under RTL.
 */

/** Minimum touch target for every control here (dp). */
const TARGET = 48;

const headerColors = { headingText: c.headingText, secondaryText: c.secondaryText, backButtonFill: c.backButtonFill };

/** Ijtema binding for the SDK header: supplies the back label, direction and app colours; same props as before B4b-3. */
export function DirectionsHeader(props: {
  title: string;
  subtitle: string;
  onBack: () => void;
  focusKey?: string | null;
  accessibilityContext?: string;
}) {
  const { t, isRTL } = useI18n();
  const theme = useMemo<DirectionsHeaderTheme>(() => ({ BackIcon: isRTL ? ChevronRight : ChevronLeft, colors: headerColors }), [isRTL]);
  return <SdkDirectionsHeader {...props} backLabel={t('directions.back')} isRTL={isRTL} theme={theme} />;
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
  const ForwardIcon = isRtl() ? ChevronLeft : ChevronRight;
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

const startOptionColors = {
  optionFill: c.optionFill,
  optionBorder: c.optionBorder,
  optionSelectedFill: c.optionSelectedFill,
  optionSelectedBorder: c.optionSelectedBorder,
  pressedFill: c.actionPressedFill,
  iconDisc: c.iconDisc,
  iconDiscSolid: c.iconDiscSolid,
  headingText: c.headingText,
  secondaryText: c.secondaryText,
  brand: c.brand,
  brandText: c.brandText,
};

/** Ijtema binding for the SDK start option: supplies direction, icons and app colours; same props as before B4b-4. */
export function StartOptionCard(props: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  active?: boolean;
  disabled?: boolean;
  loading?: boolean;
  onPress: () => void;
}) {
  const { isRTL } = useI18n();
  const theme = useMemo<StartOptionCardTheme>(
    () => ({ ForwardIcon: isRTL ? ChevronLeft : ChevronRight, LoadingIcon: RefreshCw, colors: startOptionColors }),
    [isRTL],
  );
  return <SdkStartOptionCard {...props} theme={theme} />;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },

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
});
